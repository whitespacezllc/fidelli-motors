-- ════════════════════════════════════════════════════════════════════
-- UN EVENTO QUE NO PODEMOS PROCESAR TAMBIÉN ES EVIDENCIA
--
-- El ping de prueba de Cresium llega SIN `data.id`. La función lo
-- rechazaba con `payload_sin_transaccion` ANTES de guardar nada, la ruta
-- devolvía 500 y Cresium reintentaba cinco veces — un evento que nunca va
-- a tener id no mejora por reintentarlo.
--
-- Dos correcciones, y la primera importa más que la segunda:
--
--   1. LA EVIDENCIA SE GUARDA PRIMERO, SIEMPRE. El payload que NO podemos
--      procesar es justo cuando la evidencia hace falta: es el que alguien
--      va a tener que mirar a mano. Guardarlo después de decidir si se
--      puede procesar es tener la prueba solo de los casos fáciles.
--
--   2. Sin `data.id` no hay idempotencia posible, así que no se acredita.
--      Pero se responde 2xx: reintentar no va a hacer aparecer un id, y
--      cinco reintentos por cada ping de prueba es ruido que tapa los
--      problemas de verdad.
-- ════════════════════════════════════════════════════════════════════

-- El id de transacción pasa a ser anulable: es la condición para poder
-- guardar la evidencia de un payload que no lo trae.
alter table cresium_eventos alter column transaccion_id drop not null;

comment on column cresium_eventos.transaccion_id is
  'El id de transacción de Cresium (data.id). NULL cuando el payload no lo trae —un ping de prueba, por ejemplo—: esos eventos se guardan igual como evidencia pero no acreditan, porque sin id no hay idempotencia posible.';

-- El índice parcial deja de tener sentido sobre nulls.
drop index if exists cresium_eventos_transaccion_idx;
create index cresium_eventos_transaccion_idx
  on cresium_eventos(transaccion_id, recibido_at desc)
  where transaccion_id is not null;

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

  -- ---------- 1 · LA EVIDENCIA, ANTES QUE CUALQUIER DECISIÓN ----------
  -- Va primero incluso sin id de transacción. El payload que no se puede
  -- procesar es el que más falta hace tener guardado.
  insert into cresium_eventos (tipo, transaccion_id, external_id, intento, payload)
  values (coalesce(p_payload ->> 'type', 'DESCONOCIDO'), v_tx, v_external,
          least(greatest(v_intento, 1), 5), p_payload)
  returning id into v_evento;

  if v_external is not null and v_orden is not null then
    perform cresium_actualizar_orden(v_external, v_orden);
  end if;

  -- ---------- 2 · Sin id no hay idempotencia, así que no se acredita ----------
  -- Y se contesta 2xx igual: un evento sin `data.id` no va a tener id en el
  -- reintento número dos.
  if v_tx is null then
    update cresium_eventos
    set procesado_at = now(),
        motivo = 'el payload no trae data.id: sin id no hay idempotencia, así que no se acredita. Guardado como evidencia.'
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
