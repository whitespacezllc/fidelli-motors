-- ════════════════════════════════════════════════════════════════════
-- LAS ÓRDENES DE PAGO ABIERTAS
--
-- El CVU y el alias que Cresium devuelve al crear una orden hay que
-- guardarlos: son lo que el dueño copia en su home banking, y la pantalla
-- tiene que poder mostrarlos sin volver a preguntarle a Cresium en cada
-- carga. Una pantalla de pago que depende de una API externa para
-- renderizarse es una pantalla que se cae cuando esa API se cae, justo en
-- el momento en que alguien nos está por dar plata.
--
-- El ESTADO de la orden no vive acá como fuente de verdad: vive en
-- `pagos` (lo acredita el webhook) y en Cresium. Esta tabla guarda lo que
-- Cresium nos dijo la última vez, que alcanza para pintar la pantalla.
-- ════════════════════════════════════════════════════════════════════

create table cresium_ordenes (
  id             uuid primary key default gen_random_uuid(),
  lubricentro_id uuid not null references lubricentros(id) on delete restrict,
  suscripcion_id uuid not null references suscripciones(id) on delete restrict,
  -- La referencia que viaja a Cresium: suscripción + período.
  -- Unique porque una renovación tiene UNA orden: si el dueño vuelve a la
  -- pantalla, se le muestra la que ya existe en vez de emitir otro CVU.
  external_id    text not null unique,
  periodo        periodo_suscripcion not null,
  periodo_hasta  date not null,
  monto          numeric(12,2) not null check (monto > 0),
  -- Lo que devuelve Cresium y el dueño copia.
  alias          text not null,
  cvu            text,
  orden_id       bigint,
  -- El último estado conocido. NOT_PAID · PARTIAL · PAID · EXPIRED.
  estado         text not null default 'NOT_PAID',
  monto_pagado   numeric(12,2) not null default 0,
  created_at     timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table cresium_ordenes is
  'La orden de pago abierta de cada renovación, con el CVU y el alias que el dueño copia. El estado real lo manda el webhook; acá se guarda lo último que Cresium dijo, para poder pintar la pantalla sin depender de su API.';

comment on column cresium_ordenes.external_id is
  'cresium_external_id(suscripcion, periodo_hasta). UNIQUE: una renovación, una orden. Volver a la pantalla no emite un CVU nuevo.';

create index cresium_ordenes_lubricentro_idx
  on cresium_ordenes(lubricentro_id, created_at desc);

alter table cresium_ordenes enable row level security;

-- El owner ve LA SUYA. Es lo que la pantalla de pago necesita, y nada más:
-- el CVU de otro tenant no le sirve para nada bueno.
create policy cresium_ordenes_propia on cresium_ordenes
  for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Nadie escribe por PostgREST: las escribe el servidor (la acción que crea
-- la orden y el webhook), con la clave de servicio.


-- ---------- El webhook también actualiza la orden ----------
-- Se redefine `acreditar_deposito_cresium` para que, además de acreditar,
-- deje la orden con el estado y el monto que informó Cresium. Es lo que
-- hace que la pantalla del dueño cambie sola: el `PARTIAL` que dice
-- cuánto falta sale de acá.
--
-- ⚠ El UPDATE va SIEMPRE, incluso cuando no se acredita: un PARTIAL no
-- mueve el vencimiento pero SÍ tiene que mover lo que el dueño ve, o la
-- pantalla le sigue diciendo "esperando tu transferencia" después de que
-- transfirió.

create or replace function cresium_actualizar_orden(p_external text, p_orden jsonb)
returns void
language sql
volatile
set search_path = public
as $$
  update cresium_ordenes
  set estado         = coalesce(p_orden ->> 'status', estado),
      monto_pagado   = coalesce((p_orden ->> 'amountPaid')::numeric, monto_pagado),
      orden_id       = coalesce((p_orden ->> 'id')::bigint, orden_id),
      actualizado_at = now()
  where external_id = p_external;
$$;

comment on function cresium_actualizar_orden is
  'Deja la orden con lo último que informó Cresium. Se llama SIEMPRE que llega un webhook de esa orden, acredite o no: un PARTIAL no mueve el vencimiento pero sí lo que el dueño ve en pantalla.';


-- Y el enganche: acreditar_deposito_cresium() llama a la función de arriba
-- en los DOS caminos —acredite o no—, justo después de guardar la
-- evidencia. Se redefine entera porque una función no se parchea por
-- partes; lo único que cambia respecto de 20260916180000 son las tres
-- llamadas a cresium_actualizar_orden().

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

  insert into cresium_eventos (tipo, transaccion_id, external_id, intento, payload)
  values (coalesce(p_payload ->> 'type', 'DESCONOCIDO'), v_tx, v_external,
          least(greatest(v_intento, 1), 5), p_payload)
  returning id into v_evento;

  -- La pantalla del dueño se actualiza SIEMPRE, acredite o no. Un PARTIAL
  -- no mueve el vencimiento, pero tiene que dejar de decir "esperando tu
  -- transferencia" apenas la transferencia entró.
  if v_external is not null and v_orden is not null then
    perform cresium_actualizar_orden(v_external, v_orden);
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

    select s.lubricentro_id, s.vencimiento into v_lub, v_venc
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

  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    v_lub, v_suscripcion, null, 'cresium', v_tx,
    greatest(v_venc, current_date), v_hasta, v_pagado, current_date
  )
  returning id into v_pago;

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

revoke all on function acreditar_deposito_cresium(jsonb) from public, anon, authenticated;
revoke all on function cresium_actualizar_orden(text, jsonb) from public, anon, authenticated;


-- ---------- El monto para UN período cualquiera ----------
-- La pantalla de pago muestra anual y mensual a la vez: el dueño compara
-- los dos en el mismo instante en que lo está decidiendo, sin que tocar el
-- selector dispare una consulta. Por eso hace falta poder preguntar el
-- monto de un período que NO es el que tiene contratado.
--
-- Esta es la función de verdad; `monto_de_renovacion()` pasa a ser el caso
-- particular "con el período que ya tiene". Una sola cuenta, dos puertas:
-- si fueran dos cuentas, el número del selector y el que se cobra
-- terminarían dando distinto, y eso se descubre cobrando mal.

create or replace function monto_de_renovacion_en(
  p_lubricentro uuid,
  p_periodo     periodo_suscripcion
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with sub as (
    select s.descuento_pct, s.plan_id
    from suscripciones s
    where s.lubricentro_id = p_lubricentro
    order by s.inicio desc, s.created_at desc
    limit 1
  ),
  base as (
    select
      p_periodo                        as periodo,
      sub.descuento_pct,
      meses_del_periodo(p_periodo)     as meses,
      p.precio_mensual,
      case p_periodo
        when 'semestral' then p.descuento_semestral_pct
        when 'anual'     then p.descuento_anual_pct
        else                  0
      end as off_periodo,
      (select m.precio_mensual from modulos m
        where m.codigo = 'neumaticos' and m.activo
          and modulo_es_pago(p_lubricentro, 'neumaticos')) as modulo_mensual
    from sub join planes p on p.id = sub.plan_id
  )
  select jsonb_build_object(
    'periodo',        periodo,
    'meses',          meses,
    'precio_mensual', precio_mensual,
    'off_periodo',    off_periodo,
    'descuento_pct',  descuento_pct,
    'plan',           round(precio_mensual * meses * (1 - off_periodo / 100.0)
                                                   * (1 - descuento_pct / 100.0), 2),
    'modulo',         round(coalesce(modulo_mensual, 0) * meses * (1 - off_periodo / 100.0), 2),
    'total',          round(precio_mensual * meses * (1 - off_periodo / 100.0)
                                                   * (1 - descuento_pct / 100.0)
                            + coalesce(modulo_mensual, 0) * meses * (1 - off_periodo / 100.0), 2)
  )
  from base;
$$;

comment on function monto_de_renovacion_en is
  'El monto de una renovación para un período CUALQUIERA, desglosado. La pantalla de pago la usa para mostrar anual y mensual a la vez. monto_de_renovacion() es el caso particular con el período contratado.';

-- Y `monto_de_renovacion()` pasa a delegar, para que la cuenta viva en un
-- solo lugar.
create or replace function monto_de_renovacion(p_lubricentro uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select monto_de_renovacion_en(
    p_lubricentro,
    (select s.periodo from suscripciones s
      where s.lubricentro_id = p_lubricentro
      order by s.inicio desc, s.created_at desc limit 1));
$$;

revoke all on function monto_de_renovacion_en(uuid, periodo_suscripcion) from public, anon;
grant execute on function monto_de_renovacion_en(uuid, periodo_suscripcion) to authenticated;


-- ---------- Arreglo del candado del demo (20260916140000) ----------
-- El candado miraba `new.cobranza_desde is not null`, así que una vez que
-- la fila del demo tenía fecha, CUALQUIER update sobre ella fallaba:
-- cambiarle el nombre, prenderle un módulo, tocarle el onboarding. El
-- tenant quedaba congelado.
--
-- Lo que hay que impedir es METERLO al reloj, no editarlo. Con
-- `is distinct from old` el candado dispara solo cuando el valor CAMBIA a
-- una fecha, que es exactamente el `where` olvidado del UPDATE de
-- encendido. Se descubrió probando la pantalla de pago: el override de
-- gomería sobre el demo reventó con `demo_fuera_del_reloj`.

create or replace function bloquear_demo_en_el_reloj()
returns trigger
language plpgsql
as $$
begin
  if new.cobranza_desde is not null
     and new.slug = 'demo'
     -- En INSERT no hay `old`: la comparación con null da true y el
     -- candado rige igual.
     and new.cobranza_desde is distinct from (case when tg_op = 'UPDATE' then old.cobranza_desde end)
     and coalesce(current_setting('fidelli.reloj_demo', true), '') <> 'si'
  then
    raise exception 'demo_fuera_del_reloj'
      using hint = 'El tenant demo no entra al reloj de cobranza: verlo suspendido en medio de una demo comercial es el peor bug de este sprint. Si estás escribiendo una verificación, corré primero: select set_config(''fidelli.reloj_demo'', ''si'', true);';
  end if;
  return new;
end;
$$;


-- ---------- `modulo_es_pago` tiene que poder contestarle al DUEÑO ----------
--
-- Nació como `security invoker`, y con eso el owner nunca veía su propio
-- módulo: la función lee `cambios_override_plan`, cuya policy es
-- `soy_superadmin()`, así que para él la subconsulta devolvía CERO FILAS
-- y el módulo salía como "no pago". El resultado era una pantalla de pago
-- que le cobraba $25.000 de menos, sin un solo error a la vista.
--
-- Es exactamente la regla 12 de CLAUDE.md al revés: allá el problema era
-- llamar una definer sin guarda; acá es que una invoker lee una tabla que
-- el llamador no puede ver. Los dos fallan igual de callados.
--
-- Se pasa a `security definer` CON LA GUARDA EXPLÍCITA, que es lo que
-- separa esto de abrir un agujero: la función contesta sobre el tenant
-- propio, o para un superadmin, o para la clave de servicio (que ya ve
-- todo por definición y es la que usa la acción que crea la orden). Para
-- cualquier otro combo devuelve false, que además es la dirección segura:
-- ante la duda, no cobrar.
--
-- Se descubrió abriendo /panel/suscripcion con la sesión del owner del
-- demo: la base decía 645.750 y la pantalla 420.750.

create or replace function modulo_es_pago(p_lubricentro uuid, p_codigo text)
returns boolean
language sql
stable
security definer                                                  -- @modo
set search_path = public
as $$
  select case
    -- LA GUARDA. `auth.uid() is null` cubre a la clave de servicio, que
    -- es quien crea la orden de pago del lado del servidor; `anon` no
    -- llega acá porque no tiene execute sobre esta función.
    when not (p_lubricentro = mi_lubricentro_id()
              or soy_superadmin()
              or auth.uid() is null)                              -- @guarda
      then false
    else
      coalesce(
        (select c.motivo ~ ('^Módulo ' || '[^·]+ · pago · ')
         from cambios_override_plan c
         where c.lubricentro_id = p_lubricentro
           and c.motivo ~ ('^Módulo ' || '[^·]+ · (pago|bonificado) · ')
         order by c.created_at desc
         limit 1),
        false)
      and coalesce((select (plan_overrides #>> ('{' || p_codigo || '}')::text[])::boolean
                    from lubricentros where id = p_lubricentro), false)
  end;
$$;

comment on function modulo_es_pago is
  'true solo si el tenant TIENE el módulo y su motivo más reciente dice `pago`. SECURITY DEFINER con guarda: lee cambios_override_plan, que el owner no puede ver, para contestarle una pregunta que SÍ le corresponde (cuánto paga). Fuera de su propio tenant devuelve false.';

revoke all on function modulo_es_pago(uuid, text) from public, anon;
grant execute on function modulo_es_pago(uuid, text) to authenticated;
