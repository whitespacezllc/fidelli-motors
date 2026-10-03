-- ════════════════════════════════════════════════════════════════════
-- PEDIDOS DE CALCOS · PR 2 — el pago (docs/PROMPT-calcos.md § 2 y § 4)
--
-- El PR 1 (20261003120000) dejó el pedido con su ciclo de vida y las
-- pantallas de /fidelli. Este archivo lo mete en la ruta del cobro: el
-- tenant pide desde Mi cuenta → Calcos, se le emite una orden de Cresium
-- con alias y CVU propios, y el depósito lo acredita la MISMA puerta que
-- las renovaciones.
--
--   · `cresium_ordenes` gana `encargo_calcos_id`: una orden es de una
--     renovación O de un pedido de calcos, nunca de las dos ni de ninguna.
--   · `acreditar_deposito_cresium()` gana la rama de calcos, ANTES del cast
--     a uuid de la suscripción.
--   · `vencer_encargos_calcos()`: el pedido sin pagar vence a los 7 días,
--     desde el cierre diario.
--   · `reclamar_mail_encargo_calcos()` / `soltar_…`: cada aviso por mail
--     sale una vez.
--   · `catalogo_calcos_admin()`: el catálogo CON el costo, para editarlo
--     desde «Plan y precios».
--
-- ⚠ LO QUE EL DOCUMENTO NO DECÍA, y es la mitad de este archivo: tres
-- lectores de `cresium_ordenes` miran «la última orden del tenant» dando
-- por hecho que toda orden es de una renovación. Con una orden de calcos en
-- la misma tabla, los tres se confunden sin un solo error:
--
--   · `cobranzas_pendientes()` diría que el tenant «ya generó la cuenta
--     para transferir» —o que transfirió una parte— mirando su pedido de
--     calcos;
--   · `resumen_admin().ordenes_cresium` contaría un pedido de calcos a
--     medio pagar como una deuda de suscripción, y un pedido más nuevo
--     TAPARÍA la renovación a medias que sí hay que mirar;
--   · la pantalla de pago de la suscripción (lib/suscripcion/datos-pago.ts)
--     le mostraría al dueño el alias de su pedido de calcos con el monto de
--     los calcos, bajo el título «Tu suscripción».
--
-- Los dos primeros se redefinen acá con el filtro; el tercero es
-- TypeScript y va en el mismo PR. Lo vigila R40j.
--
-- `cerrar_ordenes_al_suspender` (20260926200000) NO se toca, y sigue
-- cerrando TODAS las órdenes vivas del tenant que Fidelli apaga a mano,
-- también la de un pedido de calcos: el suspendido a mano no tiene cuentas
-- abiertas. Si igual transfiere, la palabra de Cresium gana y el pedido
-- queda pagado, como con la renovación.
--
-- ⚠ Las líneas marcadas `-- @algo` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-calcos.sh los muerde
-- con sed (regla 13). `acreditar_deposito_cresium()` y `resumen_admin()`
-- viven ahora ACÁ: scripts/regresion-cobranza-cresium.sh (R22e) y
-- scripts/regresion-metricas.sh (R32g) las muerden de este archivo.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · `cresium_ordenes` — la orden de una renovación O de un pedido
-- ════════════════════════════════════════════════════════════════════

alter table cresium_ordenes
  alter column suscripcion_id drop not null,
  alter column periodo        drop not null,
  alter column periodo_hasta  drop not null,
  add column encargo_calcos_id uuid references encargos_calcos(id) on delete restrict;

alter table cresium_ordenes
  -- Exactamente uno de los dos lados.
  add constraint orden_de_una_sola_cosa
    check ((suscripcion_id is not null) <> (encargo_calcos_id is not null)),
  -- Lo que antes garantizaba el NOT NULL, ahora solo para las renovaciones.
  add constraint renovacion_con_periodo
    check (suscripcion_id is null or (periodo is not null and periodo_hasta is not null)),
  -- Y un pedido de calcos no compra ningún período.
  add constraint calcos_sin_periodo
    check (encargo_calcos_id is null or (periodo is null and periodo_hasta is null));

create index cresium_ordenes_encargo_idx
  on cresium_ordenes (encargo_calcos_id, created_at desc)
  where encargo_calcos_id is not null;

comment on table cresium_ordenes is
  'La orden de pago abierta de una renovación (suscripcion_id) o de un pedido de calcos (encargo_calcos_id), con el CVU y el alias que el dueño copia. El estado real lo manda el webhook; acá se guarda lo último que Cresium dijo, para poder pintar la pantalla sin depender de su API. Quien lea «la última orden del tenant» tiene que decir de cuál de los dos lados.';

comment on column cresium_ordenes.encargo_calcos_id is
  'El pedido de calcos que paga esta orden (20261003200000). Su external_id es `calcos:<uuid del encargo>`, con `:2`, `:3`… en los reintentos. Null en las órdenes de renovación.';

comment on column cresium_ordenes.external_id is
  'La referencia que viaja a Cresium. Renovación: cresium_external_id(suscripcion, periodo_hasta). Pedido de calcos: `calcos:<uuid del encargo>`. UNIQUE acá y único en Cresium PARA SIEMPRE: por eso el sufijo del intento.';


-- ════════════════════════════════════════════════════════════════════
-- 2 · El webhook — la rama de calcos, antes del cast
-- ════════════════════════════════════════════════════════════════════
--
-- Cuerpo TEXTUAL de 20260917130000_primer_pago_define_el_ciclo.sql —la
-- versión vigente; el documento del sprint cita 20260917000000, que es la
-- anterior—, con sus marcadores. Lo único nuevo son las dos variables y el
-- bloque «3 · LOS PEDIDOS DE CALCOS», entre el chequeo del id de la
-- transacción y la idempotencia de `pagos`. Todo lo de la renovación queda
-- igual, línea por línea.

-- >>> acreditar_deposito_cresium
create or replace function acreditar_deposito_cresium(p_payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_t           jsonb;   -- la transacción, venga donde venga
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
  v_inicio      date;
  v_primero     boolean;
  v_corre       boolean;
  v_meses       integer;
  v_nuevo       date;
  v_nuevo_ini   date;
  v_pago        uuid;
  v_evento      uuid;
  v_motivo      text;
  v_ref         text;              -- la segunda parte de una referencia `calcos:…`
  v_enc         encargos_calcos%rowtype;
begin
  -- LA TRANSACCIÓN, de las tres formas. `coalesce` sobre jsonb devuelve el
  -- primer no-null: si `data.transaction` existe gana; si no, `data`; si
  -- tampoco, el payload entero es la transacción.
  v_t := coalesce(
    p_payload -> 'data' -> 'transaction',                              -- @forma
    p_payload -> 'data',
    p_payload
  );

  v_orden    := v_t -> 'paymentOrder';
  v_tx       := (v_t ->> 'id')::bigint;
  v_intento  := coalesce((p_payload ->> 'retry')::integer, 1);
  v_external := v_orden ->> 'externalId';
  v_estado   := v_orden ->> 'status';
  v_pagado   := (v_orden ->> 'amountPaid')::numeric;
  v_esperado := (v_orden ->> 'amount')::numeric;

  -- ---------- 1 · LA EVIDENCIA, ANTES QUE CUALQUIER DECISIÓN ----------
  insert into cresium_eventos (tipo, transaccion_id, external_id, intento, payload)
  values (coalesce(p_payload ->> 'type', v_t ->> 'type', 'DESCONOCIDO'), v_tx, v_external,
          least(greatest(v_intento, 1), 5), p_payload)
  returning id into v_evento;

  if v_external is not null and v_orden is not null then
    perform cresium_actualizar_orden(v_external, v_orden);
  end if;

  -- ---------- 2 · Sin id no hay idempotencia: no se acredita, pero 2xx ----------
  if v_tx is null then
    update cresium_eventos
    set procesado_at = now(),
        motivo = 'el payload no trae el id de la transacción en ninguna de las tres formas (data.transaction.id, data.id, id): sin id no hay idempotencia, así que no se acredita. Guardado como evidencia.'
    where id = v_evento;
    return jsonb_build_object('resultado', 'sin_transaccion', 'evento', v_evento);
  end if;

  -- ---------- 3 · LOS PEDIDOS DE CALCOS, ANTES DEL CAST (20261003200000) ----------
  -- La referencia de un pedido de calcos es `calcos:<uuid del encargo>` (y
  -- `calcos:<uuid>:2` en un reintento), no `<suscripción>:<fecha>`. Más
  -- abajo la función castea la PRIMERA parte de la referencia a uuid sin
  -- mirar: con «calcos» eso revienta, la ruta contesta 500 y Cresium
  -- reintenta cinco veces un depósito que ya entró. Por eso esta rama va
  -- ACÁ, antes del cast, y sale por su cuenta en todos sus caminos.
  --
  -- LA PLATA DE CALCOS NO ES MRR: esta rama no lee ni escribe `pagos` y no
  -- toca `suscripciones`. La idempotencia es por
  -- `encargos_calcos.cresium_transaccion_id`.
  if v_external like 'calcos:%' then                                       -- @rama_calcos
    v_ref := split_part(v_external, ':', 2);

    -- Lo que no tiene forma de uuid no se castea: sería la misma explosión
    -- con otro texto. El sufijo del intento (`:2`) queda en la tercera
    -- parte y no se lee, igual que en la renovación.
    if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then   -- @uuid_de_calcos
      select e.* into v_enc from encargos_calcos e where e.id = v_ref::uuid for update;
    end if;

    if v_enc.id is null then
      v_motivo := 'externalId de calcos no corresponde a ningún pedido: ' || v_external;
    elsif v_enc.cresium_transaccion_id = v_tx then                         -- @idempotencia_calcos
      update cresium_eventos set procesado_at = now(), motivo = 'ya acreditado (reintento)'
      where id = v_evento;
      return jsonb_build_object('resultado', 'ya_acreditado', 'concepto', 'calcos',
                                'encargo', v_enc.id, 'transaccion', v_tx);
    elsif v_estado is distinct from 'PAID' then                            -- @parcial_calcos
      v_motivo := format('orden de calcos en %s: pagó %s de %s — el pedido sigue sin pagar',
                         coalesce(v_estado, 'SIN ESTADO'), coalesce(v_pagado, 0), coalesce(v_esperado, 0));
    elsif v_enc.estado not in ('pendiente_pago', 'vencido') then           -- @estados_que_paga
      -- vencido → pagado existe SOLO acá: la cuenta de Cresium puede seguir
      -- viva cuando nuestro pedido ya venció, y si la plata entró, entró.
      -- Lo demás (cancelado, o ya pagado con otra transacción) no se
      -- revive: queda en la evidencia, con su motivo, para resolverlo a mano.
      v_motivo := format('el pedido de calcos #%s está %s: el depósito no le cambia el estado',
                         lpad(v_enc.numero::text, 4, '0'), v_enc.estado);
    end if;

    if v_motivo is not null then
      update cresium_eventos set procesado_at = now(), motivo = v_motivo where id = v_evento;
      return jsonb_build_object(
        'resultado', 'sin_acreditar', 'concepto', 'calcos', 'motivo', v_motivo, 'transaccion', v_tx,
        'falta', case when v_esperado is not null and v_pagado is not null
                      then v_esperado - v_pagado else null end);
    end if;

    update encargos_calcos
       set estado = 'pagado', pagado_at = now(), cresium_transaccion_id = v_tx   -- @paga_calcos
     where id = v_enc.id;

    update cresium_eventos set procesado_at = now(), motivo = 'acreditado (pedido de calcos)'
    where id = v_evento;

    return jsonb_build_object(
      'resultado', 'acreditado', 'concepto', 'calcos', 'encargo', v_enc.id,
      'transaccion', v_tx, 'lubricentro', v_enc.lubricentro_id);
  end if;

  if exists (select 1 from pagos where cresium_transaccion_id = v_tx) then
    update cresium_eventos set procesado_at = now(), motivo = 'ya acreditado (reintento)'
    where id = v_evento;
    return jsonb_build_object('resultado', 'ya_acreditado', 'transaccion', v_tx);
  end if;

  if v_external is null then
    v_motivo := 'depósito sin paymentOrder: no corresponde a una renovación';
  else
    v_suscripcion := nullif(split_part(v_external, ':', 1), '')::uuid;
    v_hasta       := nullif(split_part(v_external, ':', 2), '')::date;

    select s.lubricentro_id, s.vencimiento, s.inicio into v_lub, v_venc, v_inicio
    from suscripciones s where s.id = v_suscripcion;

    if v_lub is null then
      v_motivo := 'externalId no corresponde a ninguna suscripción: ' || v_external;
    end if;
  end if;

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

  -- ⚠ EL CONTEO VA ANTES DEL INSERT. Preguntado después siempre da false,
  -- el ciclo no se correría nunca y nadie vería un error.
  v_primero := not exists (select 1 from pagos p where p.lubricentro_id = v_lub);  -- @primer_pago

  -- EL PRIMER PAGO QUE LLEGA TARDE CORRE EL CICLO (20260917130000). Un
  -- tenant que tarda cinco días en terminar el onboarding no puede perder
  -- cinco días de su primer mes.
  --
  -- El largo es el PERÍODO CONTRATADO, que sale de la orden: es lo que el
  -- dueño eligió y vio cotizado. No se puede sacar de la ventana del pago,
  -- porque esa ventana ya arranca en la fecha del pago y daría de menos
  -- justo los días que hay que devolver. Si la orden no aparece —un
  -- depósito sin fila nuestra—, un mes, que es el período más corto: ante
  -- la duda, el plazo más chico.
  select coalesce(meses_del_periodo(o.periodo), 1) into v_meses
  from cresium_ordenes o where o.external_id = v_external;

  -- Y se calcula ANTES de escribir el pago, porque el pago tiene que
  -- registrar el período que de verdad cubre (ver la puerta manual).
  select c.inicio, c.vencimiento into v_nuevo_ini, v_nuevo
  from ciclo_tras_el_pago(v_primero, v_inicio, v_venc, current_date, v_hasta,
                          coalesce(v_meses, 1) * interval '1 month') c;

  v_corre := v_nuevo_ini is distinct from v_inicio;

  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    v_lub, v_suscripcion, null, 'cresium', v_tx,
    case when v_corre then v_nuevo_ini else greatest(v_venc, current_date) end,
    case when v_corre then v_nuevo     else v_hasta end,
    v_pagado, current_date
  )
  returning id into v_pago;

  update suscripciones
  set vencimiento = v_nuevo,
      inicio      = v_nuevo_ini,
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
-- <<< acreditar_deposito_cresium

comment on function acreditar_deposito_cresium is
  'La única puerta del webhook de Cresium. Guarda la evidencia antes de decidir nada, actualiza la orden, y acredita: una renovación (fila en pagos + vencimiento, idempotente por pagos.cresium_transaccion_id) o un pedido de calcos (referencia `calcos:<uuid>`: el encargo pasa a pagado desde pendiente_pago o vencido, idempotente por encargos_calcos.cresium_transaccion_id, sin tocar pagos). PARTIAL no acredita nada. La rama de calcos va ANTES del cast a uuid de la suscripción.';

revoke all on function acreditar_deposito_cresium(jsonb) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 3 · El vencimiento del pedido sin pagar
-- ════════════════════════════════════════════════════════════════════
--
-- Siete días, los mismos que vive la cuenta en Cresium
-- (DIAS_DE_VIDA_DE_LA_ORDEN en lib/cresium/orden.ts). Lo corre el cierre
-- diario con la clave de servicio, y la acción «Confirmar y pagar» para el
-- tenant que vuelve a pedir antes de que pase el cierre (con su id: no
-- vence nada ajeno). Es idempotente.
--
-- `vencido` libera el lugar del índice de «un pedido sin pagar por
-- tenant». Y no es un final: si la cuenta de Cresium sigue viva y el tenant
-- paga igual, el webhook lo devuelve a `pagado` (sección 2). Esa
-- transición existe SOLO ahí: avanzar_encargo_calcos() no la tiene.

-- >>> vencer_encargos_calcos
create or replace function vencer_encargos_calcos(p_lubricentro_id uuid default null)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_n integer;
begin
  update encargos_calcos
     set estado = 'vencido'
   where estado = 'pendiente_pago'                                         -- @vence_solo_sin_pagar
     and created_at < now() - interval '7 days'                            -- @vence_a_los_7
     and (p_lubricentro_id is null or lubricentro_id = p_lubricentro_id);  -- @vence_del_tenant
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
-- <<< vencer_encargos_calcos

comment on function vencer_encargos_calcos is
  'Pasa a vencido los pedidos de calcos sin pagar de más de 7 días (todos, o los de un tenant). Devuelve cuántos. Idempotente. Solo la clave de servicio: la corre el cierre diario.';


-- ════════════════════════════════════════════════════════════════════
-- 4 · Los avisos por mail: uno por pedido y por tipo
-- ════════════════════════════════════════════════════════════════════
--
-- Dos avisos: «recibimos tu pago» (lo manda la ruta del webhook, después
-- de contestar 200) y «salió tu pedido / está listo» (lo manda la acción
-- de /fidelli que lo marca). El que va a mandar RECLAMA primero: el update
-- con `is null` es atómico, así que de cinco reintentos de Cresium uno
-- solo se lleva el true y manda. Si el envío falla, lo SUELTA para que el
-- próximo intento pueda mandarlo.
--
-- Definer con guarda: las tablas no se escriben por API. Pasa el
-- superadmin (la acción de /fidelli) y la clave de servicio (el webhook,
-- sin usuario: auth.uid() es null). Un owner no.

-- >>> reclamar_mail_encargo_calcos
create or replace function reclamar_mail_encargo_calcos(p_id uuid, p_tipo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not (soy_superadmin() or auth.uid() is null) then                     -- @guarda_mail
    raise exception 'Solo Fidelli y el webhook avisan por mail de un pedido de calcos'
      using errcode = '42501';
  end if;

  if p_tipo = 'pago' then
    update encargos_calcos set mail_pago_at = now()
     where id = p_id and mail_pago_at is null;                             -- @reclamo_pago
  elsif p_tipo = 'envio' then
    update encargos_calcos set mail_envio_at = now()
     where id = p_id and mail_envio_at is null;                            -- @reclamo_envio
  else
    raise exception 'tipo_invalido' using hint = 'El aviso es pago o envio.';
  end if;

  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
-- <<< reclamar_mail_encargo_calcos

-- >>> soltar_mail_encargo_calcos
create or replace function soltar_mail_encargo_calcos(p_id uuid, p_tipo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not (soy_superadmin() or auth.uid() is null) then
    raise exception 'Solo Fidelli y el webhook avisan por mail de un pedido de calcos'
      using errcode = '42501';
  end if;

  if p_tipo = 'pago' then
    update encargos_calcos set mail_pago_at = null where id = p_id;        -- @suelta_pago
  elsif p_tipo = 'envio' then
    update encargos_calcos set mail_envio_at = null where id = p_id;
  else
    raise exception 'tipo_invalido' using hint = 'El aviso es pago o envio.';
  end if;
end;
$$;
-- <<< soltar_mail_encargo_calcos

comment on function reclamar_mail_encargo_calcos is
  'Reclama el aviso por mail (pago | envio) de un pedido de calcos: marca mail_pago_at / mail_envio_at y contesta true SOLO la primera vez. Quien recibe true manda el mail. Superadmin o clave de servicio.';
comment on function soltar_mail_encargo_calcos is
  'Devuelve el aviso por mail de un pedido de calcos cuando el envío falló, para que el próximo intento pueda mandarlo. Superadmin o clave de servicio.';


-- ════════════════════════════════════════════════════════════════════
-- 5 · El catálogo con su costo, para «Plan y precios»
-- ════════════════════════════════════════════════════════════════════
--
-- `authenticated` no tiene `costo_ars` en el GRANT de `catalogo_calcos`
-- (20261003120000): el superadmin lo lee por acá. Se edita por
-- fijar_precio_calcos(), que ya existe.

-- >>> catalogo_calcos_admin
create or replace function catalogo_calcos_admin()
returns table (
  codigo     text,
  tipo       text,
  cantidad   integer,
  precio_ars numeric,
  costo_ars  numeric,
  activo     boolean,
  orden      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not soy_superadmin() then                                             -- @guarda_catalogo
    raise exception 'Solo el equipo Fidelli ve el costo de los calcos'
      using errcode = '42501';
  end if;

  return query
  select c.codigo, c.tipo, c.cantidad, c.precio_ars, c.costo_ars, c.activo, c.orden
  from catalogo_calcos c
  order by c.orden;
end;
$$;
-- <<< catalogo_calcos_admin

comment on function catalogo_calcos_admin is
  'El catálogo de calcos con el costo interno, para la pantalla «Plan y precios» de /fidelli. Solo superadmin (42501 si no): el tenant lee el precio de la tabla, nunca el costo.';


-- ════════════════════════════════════════════════════════════════════
-- 6 · Los dos lectores de «la última orden del tenant»
-- ════════════════════════════════════════════════════════════════════
--
-- Cuerpos TEXTUALES de sus versiones vigentes (20260917140000 y
-- 20261003120000). Lo único nuevo en cada uno es la línea marcada: la
-- última orden que miran es la de la RENOVACIÓN.

-- >>> cobranzas_pendientes
create or replace function cobranzas_pendientes(p_dias integer default 15)
returns table (
  lubricentro_id   uuid,
  nombre           text,
  slug             text,
  activo           boolean,
  estado_cobranza  text,
  en_el_reloj      boolean,
  sub_estado       estado_suscripcion,
  periodo          periodo_suscripcion,
  descuento_pct    numeric,
  vencimiento      date,
  dias             integer,
  plan_nombre      text,
  monto            numeric,
  monto_modulo     numeric,
  telefono         text,
  owner_nombre     text,
  avisado_at       timestamptz,
  orden_estado     text,
  orden_pagado     numeric,
  cortaria         boolean,
  -- LA COLUMNA NUEVA: ¿este tenant no pagó NUNCA? Es lo que parte la
  -- pantalla en dos listas. No es lo mismo que "está vencido": el que nunca
  -- pagó puede estar todavía en plazo.
  nunca_pago       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  orden as (
    select distinct on (o.lubricentro_id)
      o.lubricentro_id, o.estado, o.monto_pagado
    from cresium_ordenes o
    -- La última orden DE LA RENOVACIÓN. Desde 20261003200000 la tabla
    -- guarda también las órdenes de los pedidos de calcos, y una de esas no
    -- dice nada sobre el abono.
    where o.suscripcion_id is not null                                     -- @orden_de_la_suscripcion
    order by o.lubricentro_id, o.created_at desc
  ),
  aviso as (
    select distinct on (c.lubricentro_id) c.lubricentro_id, c.created_at
    from contactos_fidelli c
    order by c.lubricentro_id, c.created_at desc
  )
  select
    l.id,
    l.nombre,
    l.slug,
    l.activo,
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    l.suspension_automatica, coalesce(v.descuento_pct, 0),
                    not exists (select 1 from pagos p where p.lubricentro_id = l.id)),
    l.cobranza_desde is not null,
    v.estado,
    v.periodo,
    v.descuento_pct,
    v.vencimiento,
    (v.vencimiento - current_date)::integer,
    p.nombre,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'total')::numeric,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'modulo')::numeric,
    telefono_de_contacto(l.id),
    (select u.nombre from usuarios u
      where u.lubricentro_id = l.id and u.rol = 'owner' limit 1),
    (select a.created_at from aviso a
      where a.lubricentro_id = l.id and a.created_at::date > v.vencimiento - p_dias),
    o.estado,
    o.monto_pagado,
    -- El mismo reloj, preguntándole qué haría con LOS DOS interruptores de
    -- bloqueo prendidos. Se calcula, no se adivina.
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    true, coalesce(v.descuento_pct, 0),
                    not exists (select 1 from pagos p where p.lubricentro_id = l.id)) = 'suspendido'
      and estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                          l.suspension_automatica, coalesce(v.descuento_pct, 0),
                          not exists (select 1 from pagos p where p.lubricentro_id = l.id)) <> 'suspendido',
    not exists (select 1 from pagos p where p.lubricentro_id = l.id)
  from lubricentros l
  join vigente v on v.lubricentro_id = l.id
  join planes p  on p.id = v.plan_id
  left join orden o on o.lubricentro_id = l.id
  where
    soy_superadmin()
    and coalesce(v.descuento_pct, 0) < 100
    and v.vencimiento <= current_date + p_dias
  order by v.vencimiento;
$$;
-- <<< cobranzas_pendientes

-- >>> resumen_admin
create or replace function resumen_admin()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_mes         date := date_trunc('month', current_date)::date;
  v_mes_ant     date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_fin_mes_ant date := date_trunc('month', current_date)::date - 1;
  v_mrr         numeric;
  v_tc          tipo_cambio;
  v_snap        snapshots_diarios;
  v_atencion    integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver el resumen'
      using errcode = '42501';
  end if;

  v_mrr := mrr_plataforma();
  v_tc  := tc_vigente(current_date);
  select * into v_snap from snapshots_diarios where fecha = v_fin_mes_ant;

  select count(*) into v_atencion
  from lubricentros l
  left join lateral (
    select s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    where s.lubricentro_id = l.id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v on true
  where estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) is not null;

  return jsonb_build_object(
    -- La plata
    'mrr_ars',                  v_mrr,
    'tc_venta',                 v_tc.venta,
    'tc_fecha',                 v_tc.fecha,
    'mrr_usd',                  case when v_tc.venta > 0 then round(v_mrr / v_tc.venta, 2) end,
    'fin_mes_anterior',         v_fin_mes_ant,
    'mrr_ars_fin_mes_anterior', v_snap.mrr_ars,
    'mrr_usd_fin_mes_anterior', v_snap.mrr_usd,

    -- Los tenants
    'activos',            (select count(*) from lubricentros l where es_activo(l)),
    'altas_mes',          (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes),
    'altas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),
    'bajas_mes',          (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj') and ocurrido_at >= v_mes),
    'bajas_involuntarias_mes',
                          (select count(*) from tenant_eventos
                           where ocurrido_at >= v_mes
                             and (tipo = 'suspension_reloj'
                                  or (tipo = 'suspension' and motivo like 'falta_de_pago%'))),
    'bajas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj')
                             and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),

    -- Los trabajos, de cualquier tipo y por tipo
    'trabajos_mes',          (select count(*) from services
                              where not anulado                          -- @resumen_trabajos
                                and importado_de is null                 -- @resumen_sin_importado
                                and fecha >= v_mes),
    'trabajos_service',      (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'service' and fecha >= v_mes),
    'trabajos_mecanica',     (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'mecanica' and fecha >= v_mes),
    'trabajos_neumaticos',   (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'neumaticos' and fecha >= v_mes),
    'trabajos_mes_anterior', (select count(*) from services
                              where not anulado and importado_de is null and fecha >= v_mes_ant and fecha < v_mes),

    -- Las alertas
    'cierre_ayer',     exists (select 1 from snapshots_diarios where fecha = current_date - 1),
    'ultimo_snapshot', (select max(fecha) from snapshots_diarios),
    'ordenes_cresium', (select count(*) from (
                          select distinct on (o.lubricentro_id) o.estado
                          from cresium_ordenes o
                          where o.suscripcion_id is not null              -- @ordenes_de_suscripcion
                          order by o.lubricentro_id, o.created_at desc
                        ) u where u.estado in ('EXPIRED', 'PARTIAL')),
    'atencion',        v_atencion,
    'sin_origen',      (select count(*) from lubricentros where origen is null),
    -- Los pedidos de calcos (20261003120000): lo que cuenta la alerta del
    -- hub. Trabajo que entró, trabajo que se atrasó y plata que se enfría.
    'calcos',          jsonb_build_object(
                         'esperando_produccion',
                           (select count(*) from encargos_calcos where estado = 'pagado'),   -- @calcos_esperando
                         'atrasados',
                           (select count(*) from encargos_calcos
                            where estado = 'en_produccion'
                              and dias_habiles_entre(produccion_at::date, current_date) > 5),   -- @calcos_atrasados
                         'por_vencer',
                           (select count(*) from encargos_calcos
                            where estado = 'pendiente_pago'
                              and created_at <= now() - interval '6 days')),   -- @calcos_por_vencer
    'sin_trabajos',    (select coalesce(jsonb_agg(
                          jsonb_build_object('id', x.id, 'nombre', x.nombre, 'dias', x.dias)
                          order by x.dias desc nulls first, x.nombre), '[]'::jsonb)
                        from (
                          select l.id, l.nombre, (current_date - a.ultimo) as dias
                          from lubricentros l
                          left join lateral (
                            select max(sv.fecha) as ultimo from services sv
                            where sv.lubricentro_id = l.id and not sv.anulado
                              and sv.importado_de is null
                          ) a on true
                          where es_activo(l)
                            and (a.ultimo is null or a.ultimo < current_date - 7)
                        ) x),
    'owner_pendiente', (select coalesce(jsonb_agg(
                          jsonb_build_object('id', l.id, 'nombre', l.nombre,
                                             'dias', current_date - l.created_at::date)
                          order by l.created_at), '[]'::jsonb)
                        from lubricentros l
                        join estados_owner() o on o.lubricentro_id = l.id
                        where o.estado = 'pendiente'
                          and l.created_at < now() - interval '7 days')
  );
end;
$$;
-- <<< resumen_admin

-- ════════════════════════════════════════════════════════════════════
-- 7 · Permisos
-- ════════════════════════════════════════════════════════════════════
-- `create or replace` conserva los de las tres redefinidas; se repiten
-- para que el archivo se lea solo.

revoke all on function vencer_encargos_calcos(uuid) from public, anon, authenticated;
revoke all on function reclamar_mail_encargo_calcos(uuid, text) from public, anon;
revoke all on function soltar_mail_encargo_calcos(uuid, text) from public, anon;
revoke all on function catalogo_calcos_admin() from public, anon;
revoke all on function cobranzas_pendientes(integer) from public, anon;
revoke all on function resumen_admin() from public, anon;

grant execute on function vencer_encargos_calcos(uuid) to service_role;
grant execute on function acreditar_deposito_cresium(jsonb) to service_role;
grant execute on function reclamar_mail_encargo_calcos(uuid, text) to authenticated, service_role;
grant execute on function soltar_mail_encargo_calcos(uuid, text) to authenticated, service_role;
grant execute on function catalogo_calcos_admin() to authenticated, service_role;
grant execute on function cobranzas_pendientes(integer) to authenticated;
grant execute on function resumen_admin() to authenticated, service_role;
