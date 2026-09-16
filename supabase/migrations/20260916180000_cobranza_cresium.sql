-- ════════════════════════════════════════════════════════════════════
-- COBRANZA POR CRESIUM · la evidencia, la idempotencia y el cobro sin dueño
--
-- Cresium NO es un procesador de suscripciones: es un banco con API. No
-- hay recurrencia, ni tarjeta, ni débito automático, ni checkout hosteado.
-- Lo que hay es una ORDEN DE PAGO ÚNICO con un CVU dedicado, y UN solo
-- evento de webhook: `DEPOSIT`.
--
-- Esta migración trae tres cosas, y ninguna llama a Cresium:
--
--   1. `cresium_eventos` — el payload CRUDO de cada entrega, inmutable.
--      Es la evidencia. El día que un cliente diga "yo transferí", el
--      evento crudo es la respuesta. `pagos` se DERIVA de acá.
--
--   2. La idempotencia. Cresium reintenta hasta CINCO veces si no
--      respondemos 2xx. Sin un unique sobre el id de transacción, un
--      reintento le regala doce meses a alguien.
--
--   3. El cobro sin dueño. `pagos.registrado_por` es `not null references
--      usuarios(id)` y un cobro por webhook NO TIENE USUARIO. Se resuelve
--      haciéndolo anulable con un CHECK que ata el null a un origen
--      automático — nunca tapándolo con un usuario falso, que convierte
--      la auditoría en una mentira prolija.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · `cresium_eventos` — la evidencia, append-only
-- ════════════════════════════════════════════════════════════════════
--
-- UNA FILA POR ENTREGA, no por evento. Los cinco reintentos de Cresium
-- dejan cinco filas, y eso es deliberado: la pregunta que esta tabla
-- contesta no es solo "¿cuánto pagó?" sino "¿qué nos mandaron y cuándo?".
-- Si guardáramos una sola fila por transacción no sabríamos si el cobro
-- entró al primer intento o al quinto, que es justo lo que se mira cuando
-- algo salió mal.
--
-- La idempotencia NO vive acá: vive en el unique de `pagos`. Son dos
-- preguntas distintas y meterlas en la misma tabla obliga a mutar la
-- evidencia, que es exactamente lo que no puede pasar.
--
-- SOLO SE GUARDAN LOS EVENTOS CON FIRMA VÁLIDA. Un payload sin firmar es
-- un string que cualquiera puede mandar: la ruta responde 401 y no toca
-- la base. Los rechazos quedan en el log de la aplicación, no acá — si no,
-- cualquiera puede llenarnos una tabla con un `curl`.

create table cresium_eventos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null,
  -- El id de la transacción de Cresium. Es la llave de la idempotencia y
  -- viene en `data.id` del payload.
  transaccion_id  bigint not null,
  -- Nuestro `externalId`, tal como volvió. Puede ser null: un depósito a
  -- un CVU que no es de una orden nuestra no lo trae.
  external_id     text,
  intento         integer not null default 1 check (intento between 1 and 5),
  payload         jsonb not null,
  recibido_at     timestamptz not null default now(),
  -- Cuándo se derivó el pago de este evento. Null = llegó pero no acreditó
  -- (PARTIAL, una orden que no reconocimos, o un reintento de algo ya
  -- acreditado). Que sea nullable es lo que hace visible el caso raro.
  procesado_at    timestamptz,
  -- Por qué no se acreditó, cuando no se acreditó. Texto libre a
  -- propósito: es para que un humano lea, no para ramificar código.
  motivo          text
);

comment on table cresium_eventos is
  'El payload CRUDO de cada entrega de webhook de Cresium, inmutable y append-only. Es la evidencia: el día que un cliente diga "yo transferí", esto es la respuesta. `pagos` se deriva de acá. Una fila por ENTREGA — los cinco reintentos dejan cinco filas.';

comment on column cresium_eventos.transaccion_id is
  'El id de la transacción de Cresium (data.id). La misma transacción llega hasta 5 veces; la idempotencia la resuelve el unique de pagos.cresium_transaccion_id, no esta tabla.';

create index cresium_eventos_transaccion_idx on cresium_eventos(transaccion_id, recibido_at desc);
create index cresium_eventos_external_idx    on cresium_eventos(external_id) where external_id is not null;

alter table cresium_eventos enable row level security;

-- Solo Fidelli lo lee. El owner de un lubricentro no tiene nada que hacer
-- acá: su pago lo ve en `pagos`, que es lo que le corresponde.
create policy cresium_eventos_admin on cresium_eventos
  for select to authenticated using (soy_superadmin());

-- Nadie escribe por PostgREST: lo escribe la ruta del webhook con la clave
-- de servicio, que es el único lugar del request path donde esa clave se
-- usa. Sin policy de insert, un `authenticated` no puede meter una fila
-- aunque se sepa la forma.


-- ════════════════════════════════════════════════════════════════════
-- 2 · `pagos` — el cobro que no tiene usuario
-- ════════════════════════════════════════════════════════════════════
--
-- Hasta hoy todo pago lo tipeaba un humano en /fidelli, así que
-- `registrado_por` era `not null` y estaba bien. Un cobro que entra por
-- webhook no tiene usuario, y las tres salidas posibles son muy distintas:
--
--   · Un usuario "sistema" falso → la auditoría pasa a mentir con todas
--     las letras, y en seis meses nadie distingue un cobro automático de
--     uno que cargó Santiago. Descartada.
--   · Dejarlo not null y no registrar el pago → perdemos la plata cobrada.
--     Descartada.
--   · ANULABLE, con un CHECK que ata el null a un origen automático.
--     Es esta. El null no es un agujero: es imposible que aparezca en un
--     pago manual, y la base lo hace cumplir.

alter table pagos
  alter column registrado_por drop not null,
  add column origen text not null default 'manual'
    check (origen in ('manual', 'cresium')),
  -- La llave de la idempotencia. Unique: el segundo reintento del mismo
  -- depósito choca acá y no acredita dos veces.
  add column cresium_transaccion_id bigint unique;

-- El CHECK que hace que el null no sea un agujero.
alter table pagos
  add constraint pago_con_autor_o_maquina check (
    (origen = 'manual'  and registrado_por is not null and cresium_transaccion_id is null)
    or
    (origen = 'cresium' and cresium_transaccion_id is not null)
  );

comment on column pagos.registrado_por is
  'Quién lo cargó. NULL solo cuando origen = ''cresium'': un cobro que entra por webhook no tiene usuario, y taparlo con un usuario "sistema" haría que la auditoría mienta. Lo garantiza el CHECK pago_con_autor_o_maquina.';

comment on column pagos.origen is
  '''manual'' = lo tipeó alguien en /fidelli. ''cresium'' = entró por el webhook de un depósito.';

comment on column pagos.cresium_transaccion_id is
  'El id de transacción de Cresium. UNIQUE, y esa es toda la idempotencia: Cresium reintenta hasta 5 veces y el segundo intento choca acá en vez de regalar otro período.';


-- ════════════════════════════════════════════════════════════════════
-- 3 · El `externalId` — único y reconstruible
-- ════════════════════════════════════════════════════════════════════
--
-- Una orden por renovación. La referencia tiene que poder reconstruirse
-- desde nuestros datos sin guardar un mapeo aparte, y ser única por
-- company (lo exige Cresium).
--
--   {suscripcion_id}:{periodo_hasta}
--
-- El período va en la clave y no solo la suscripción: si fuera solo el
-- uuid, la renovación del mes siguiente chocaría con el `externalId` ya
-- usado y Cresium la rechazaría. Con el período, cada renovación es su
-- propia orden y el histórico queda legible a simple vista.

create or replace function cresium_external_id(p_suscripcion uuid, p_hasta date)
returns text
language sql
immutable
parallel safe
as $$ select p_suscripcion::text || ':' || to_char(p_hasta, 'YYYY-MM-DD'); $$;   -- @externalid

comment on function cresium_external_id is
  'La referencia de una orden de pago: suscripción + período. Única por company y reconstruible desde los datos, sin tabla de mapeo.';


-- ════════════════════════════════════════════════════════════════════
-- 4 · Acreditar un depósito — la única puerta del webhook
-- ════════════════════════════════════════════════════════════════════
--
-- La llama la ruta del webhook con la clave de servicio. Hace TODO en una
-- transacción: guarda la evidencia, decide si acredita y mueve el
-- vencimiento. Que sean tres pasos y una sola transacción es lo que evita
-- el estado imposible de "cobré pero no lo registré".
--
-- ⚠ LAS TRES REGLAS QUE NO SE NEGOCIAN
--
--   1 · La firma se verifica ANTES, en la ruta. Acá ya llega verificado:
--       esta función no tiene forma de saberlo y no debe inventarla.
--   2 · IDEMPOTENTE. El unique de `cresium_transaccion_id` corta el
--       segundo intento, y la función devuelve `ya_acreditado` en vez de
--       explotar — la ruta tiene que poder responder 200 o Cresium sigue
--       reintentando.
--   3 · `PARTIAL` NO ACTIVA NADA. Si `amountPaid < amount`, se guarda la
--       evidencia y se informa cuánto falta, pero el vencimiento no se
--       mueve ni un día. Solo `PAID` extiende.
--
-- `security definer` porque la llama la clave de servicio sobre tablas con
-- RLS, y su único llamador es la ruta del webhook. No se grantea a
-- `authenticated`: un owner no tiene por qué poder acreditarse un pago.

create or replace function acreditar_deposito_cresium(p_payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_tx          bigint;
  v_external    text;
  v_estado      text;
  v_pagado      numeric;
  v_esperado    numeric;
  v_intento     integer;
  v_orden       jsonb;
  v_suscripcion uuid;
  v_hasta       date;
  v_lub         uuid;
  v_venc        date;
  v_nuevo       date;
  v_pago        uuid;
  v_evento      uuid;
  v_motivo      text;
begin
  v_orden    := p_payload -> 'data' -> 'paymentOrder';
  v_tx       := (p_payload -> 'data' ->> 'id')::bigint;
  v_intento  := coalesce((p_payload ->> 'retry')::integer, 1);
  v_external := v_orden ->> 'externalId';
  v_estado   := v_orden ->> 'status';
  v_pagado   := (v_orden ->> 'amountPaid')::numeric;
  v_esperado := (v_orden ->> 'amount')::numeric;

  if v_tx is null then
    raise exception 'payload_sin_transaccion'
      using hint = 'El webhook tiene que traer data.id. Sin eso no hay idempotencia posible.';
  end if;

  -- ---------- 1 · La evidencia, SIEMPRE y primero ----------
  -- Se guarda pase lo que pase después: incluso un evento que no vamos a
  -- acreditar es la prueba de que Cresium nos avisó.
  insert into cresium_eventos (tipo, transaccion_id, external_id, intento, payload)
  values (coalesce(p_payload ->> 'type', 'DESCONOCIDO'), v_tx, v_external,
          least(greatest(v_intento, 1), 5), p_payload)
  returning id into v_evento;

  -- ---------- 2 · ¿Ya lo acreditamos? ----------
  -- El reintento número dos llega acá y se va con un 200.
  if exists (select 1 from pagos where cresium_transaccion_id = v_tx) then
    update cresium_eventos set procesado_at = now(), motivo = 'ya acreditado (reintento)'
    where id = v_evento;
    return jsonb_build_object('resultado', 'ya_acreditado', 'transaccion', v_tx);
  end if;

  -- ---------- 3 · ¿Es una orden nuestra? ----------
  if v_external is null then
    v_motivo := 'depósito sin paymentOrder: no corresponde a una renovación';
  else
    v_suscripcion := nullif(split_part(v_external, ':', 1), '')::uuid;
    v_hasta       := nullif(split_part(v_external, ':', 2), '')::date;

    select s.lubricentro_id, s.vencimiento into v_lub, v_venc
    from suscripciones s where s.id = v_suscripcion;

    if v_lub is null then
      v_motivo := 'externalId no corresponde a ninguna suscripción: ' || v_external;
    end if;
  end if;

  -- ---------- 4 · PARTIAL no activa nada ----------
  -- El CVU sigue vivo para completar. La pantalla dice cuánto falta; acá
  -- no se mueve un solo día de vencimiento.
  if v_motivo is null and v_estado is distinct from 'PAID' then
    v_motivo := format('orden en %s: pagó %s de %s — no se extiende el vencimiento',
                       coalesce(v_estado, 'SIN ESTADO'), coalesce(v_pagado, 0), coalesce(v_esperado, 0));
  end if;

  if v_motivo is not null then
    update cresium_eventos set procesado_at = now(), motivo = v_motivo where id = v_evento;
    return jsonb_build_object(
      'resultado', 'sin_acreditar', 'motivo', v_motivo, 'transaccion', v_tx,
      'falta', case when v_esperado is not null and v_pagado is not null
                    then v_esperado - v_pagado else null end);
  end if;

  -- ---------- 5 · Acreditar ----------
  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    v_lub, v_suscripcion, null, 'cresium', v_tx,
    greatest(v_venc, current_date), v_hasta, v_pagado, current_date
  )
  returning id into v_pago;

  -- `greatest` y no asignación directa: si por lo que sea llega un evento
  -- viejo, no se le ACORTA el vencimiento a nadie. Mismo criterio que
  -- registrar_pago().
  v_nuevo := greatest(v_venc, v_hasta);

  update suscripciones
  set vencimiento = v_nuevo,
      estado = case
                 when estado in ('trial', 'vencida') and v_nuevo >= current_date
                   then 'activa'::estado_suscripcion
                 else estado
               end
  where id = v_suscripcion;

  update cresium_eventos set procesado_at = now(), motivo = 'acreditado' where id = v_evento;

  return jsonb_build_object(
    'resultado', 'acreditado', 'pago', v_pago, 'transaccion', v_tx,
    'lubricentro', v_lub, 'vencimiento', v_nuevo);
end;
$$;

comment on function acreditar_deposito_cresium is
  'La única puerta del webhook. Guarda la evidencia cruda, decide si acredita y mueve el vencimiento, todo en una transacción. Idempotente por el unique de pagos.cresium_transaccion_id. PARTIAL no extiende nada.';

-- Nadie más que la clave de servicio. Un owner no se acredita un pago.
revoke all on function acreditar_deposito_cresium(jsonb) from public, anon, authenticated;
revoke all on function cresium_external_id(uuid, date)   from public, anon;
grant execute on function cresium_external_id(uuid, date) to authenticated;
