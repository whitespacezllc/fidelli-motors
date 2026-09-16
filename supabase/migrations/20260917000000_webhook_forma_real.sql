-- ════════════════════════════════════════════════════════════════════
-- EL WEBHOOK DE CRESIUM TIENE UN NIVEL MÁS DE LO QUE DICE SU DOCUMENTACIÓN
--
-- La doc: «En el campo `data` se envía un objeto transaction». Leído como
-- "data ES la transacción", que es lo que hacía la función:
--
--     p_payload -> 'data' ->> 'id'
--
-- La realidad, medida con el DEPOSIT real de $390 del 16/09/2026 a la
-- 01:30, guardado como evidencia:
--
--     { "type": "DEPOSIT", "data": { "transaction": { "id": 1022482, ... } } }
--
-- O sea "data CONTIENE una clave transaction". Con la lectura vieja,
-- `data.id` daba null, la función contestaba `sin_transaccion`, la ruta
-- devolvía 200 —correcto para un ping sin id, catastrófico para un cobro
-- de verdad— y la pantalla se quedaba en "esperando tu transferencia" con
-- la plata ya acreditada en Cresium. Es la cuarta vez en un día que la
-- documentación de Cresium describe una forma y su API manda otra.
--
-- La función lee ahora la transacción de las TRES formas que existen,
-- en este orden:
--
--   1. data.transaction.*   — lo que manda un DEPOSIT real
--   2. data.*               — la forma documentada (y la del doble local)
--   3. *                    — la transacción pelada, que es lo que manda
--                             el botón "probar" del panel
--
-- Ninguna se descarta: el día que Cresium alinee la API con la doc, o el
-- panel con la API, el webhook tiene que seguir entrando.
-- ════════════════════════════════════════════════════════════════════

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
  v_nuevo       date;
  v_pago        uuid;
  v_evento      uuid;
  v_motivo      text;
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


-- ---------- Reprocesar un evento que quedó sin acreditar ----------
-- Para el DEPOSIT real que llegó con la función vieja y quedó guardado como
-- `sin_transaccion`: se lo vuelve a pasar por la función corregida. La
-- idempotencia por id de transacción hace que repetirlo sea inofensivo.
-- El evento original queda, con el motivo actualizado para que se sepa
-- que se reprocesó; el reproceso deja su propia fila de evidencia.

create or replace function cresium_reprocesar_evento(p_evento uuid)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_payload jsonb;
  v_r       jsonb;
begin
  select payload into v_payload from cresium_eventos where id = p_evento;
  if v_payload is null then
    raise exception 'evento_no_existe';
  end if;

  v_r := acreditar_deposito_cresium(v_payload);

  update cresium_eventos
  set motivo = coalesce(motivo, '') || ' · reprocesado el ' || to_char(now(), 'DD/MM HH24:MI')
               || ' → ' || (v_r ->> 'resultado')
  where id = p_evento;

  return v_r;
end;
$$;

comment on function cresium_reprocesar_evento is
  'Vuelve a pasar un evento guardado por acreditar_deposito_cresium(). Idempotente por id de transacción. Para los que quedaron sin acreditar por un bug nuestro, no de Cresium.';

revoke all on function cresium_reprocesar_evento(uuid) from public, anon, authenticated;
