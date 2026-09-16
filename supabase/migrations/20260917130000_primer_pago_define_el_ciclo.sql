-- ════════════════════════════════════════════════════════════════════
-- EL PRIMER PAGO DEFINE EL CICLO
--
-- Un tenant que tarda cinco días en terminar el onboarding no puede perder
-- cinco días de su primer mes. Hoy los pierde: las dos puertas del cobro
-- extienden desde el VENCIMIENTO VIGENTE —`greatest(v_vencimiento,
-- hasta)`— y ese vencimiento, para un tenant recién dado de alta, es el día
-- siguiente al alta. Transferir el día 6 no mueve nada hacia adelante.
--
-- Desde acá: **el primer pago acreditado corre la ventana entera a la fecha
-- del pago**, conservando su largo. Las renovaciones siguientes siguen
-- extendiendo desde el vencimiento vigente, exactamente como hasta hoy.
--
--
-- ⚠ SOLO CUANDO EL PAGO LLEGA TARDE, Y ESO ACOTA LA REGLA A SU CASO
--
-- La condición NO es "es el primer pago" a secas: es "es el primero Y llegó
-- DESPUÉS del vencimiento". Si el dueño transfiere dentro del plazo no
-- pierde nada y el comportamiento de siempre ya es el correcto.
--
-- La diferencia importa, y se vio en rojo: sin esa segunda mitad, un tenant
-- que ya es cliente pero del que nunca registramos un pago —porque su
-- historial es anterior a la tabla— vería su ciclo RECORTADO en su próxima
-- renovación. R22b lo atrapó en el primer reset.
--
-- ⚠ Y EL LARGO LO PONE CADA PUERTA, porque no significan lo mismo. En el
-- webhook es el PERÍODO contratado (`meses_del_periodo`), que es lo que el
-- dueño eligió y vio cotizado. En el cobro manual es la ventana que la
-- persona tipeó. Calcularlo acá adentro obligaría a inventar uno de los dos.
--
--
-- ⚠ SON DOS PUERTAS Y LAS DOS CAMBIAN
--
-- `acreditar_deposito_cresium()` (el webhook) y `registrar_pago()` (el
-- cobro que tipea una persona en /fidelli). Escribirlo solo en el webhook
-- dejaría el ciclo corrido justo en el caso que más va a pasar durante las
-- primeras altas: el bloque D1b dice que Santiago cobra a mano hasta que se
-- verifique el monto contra un pago real.
--
--
-- ⚠ Y SE ESCRIBE `inicio`, QUE HOY NO LO ESCRIBE NADIE
--
-- Verificado: ninguno de los seis `update suscripciones` del repo toca esa
-- columna. Y `inicio` es por lo que TODO el repo ordena para saber cuál es
-- la suscripción vigente (`order by inicio desc, created_at desc`, en cinco
-- lugares). Moverlo hacia adelante es seguro porque solo se mueve en el
-- PRIMER pago, cuando el tenant tiene una sola suscripción: moverlo con dos
-- filas cambiaría cuál gana, y eso no puede pasar acá.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @primer_pago` NO SE REFORMATEAN NUNCA.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La regla, en un solo lugar
-- ════════════════════════════════════════════════════════════════════
--
-- Pura: entran cuatro valores, salen dos fechas. No lee ninguna tabla, así
-- que las verificaciones la prueban con literales y las dos puertas no
-- pueden implementar criterios distintos.

-- >>> ciclo_tras_el_pago
create or replace function ciclo_tras_el_pago(
  p_es_el_primero  boolean,
  p_inicio_actual  date,
  p_venc_actual    date,
  p_fecha_pago     date,
  p_periodo_hasta  date,
  p_largo          interval
)
returns table (inicio date, vencimiento date)
language sql
immutable
parallel safe
as $$
  -- El primero Y tarde: las dos condiciones. Dentro del plazo no se pierde
  -- nada, y ahí el comportamiento de siempre ya es el correcto.
  select
    case when p_es_el_primero and p_fecha_pago > p_venc_actual               -- @primer_pago
      then p_fecha_pago else p_inicio_actual end,
    case
      -- EL PRIMERO Y TARDE: el ciclo entero arranca el día que entró la
      -- plata, con el largo que se contrató. El tenant no pierde los días
      -- que tardó en decidirse.
      when p_es_el_primero and p_fecha_pago > p_venc_actual
        then (p_fecha_pago + p_largo)::date
      -- Y todo lo demás como siempre: se extiende desde el vencimiento
      -- vigente, así que pagar tres días antes no regala tres días menos.
      else greatest(p_venc_actual, p_periodo_hasta)
    end;
$$;
-- <<< ciclo_tras_el_pago

comment on function ciclo_tras_el_pago is
  'Las dos fechas de la suscripción después de acreditar un pago. El PRIMERO QUE LLEGA TARDE arranca el ciclo el día del pago con el largo contratado; todo lo demás extiende desde el vencimiento vigente. Pura: la usan las dos puertas del cobro y no pueden diferir.';

revoke all on function ciclo_tras_el_pago(boolean, date, date, date, date, interval) from public, anon;
grant execute on function ciclo_tras_el_pago(boolean, date, date, date, date, interval) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · La puerta manual
-- ════════════════════════════════════════════════════════════════════
--
-- Es la versión de 20260726210000 con el cálculo del vencimiento delegado
-- a la función de arriba y con `inicio` escrito cuando corresponde.
--
-- ⚠ EL CONTEO VA ANTES DEL INSERT. Preguntar "¿es el primero?" después de
-- insertar la fila da siempre `false`, y el bug sería invisible: el ciclo
-- simplemente no se correría nunca y nadie vería un error.

create or replace function registrar_pago(
  p_lubricentro_id uuid,
  p_periodo_desde  date,
  p_periodo_hasta  date,
  p_monto          numeric,
  p_fecha_pago     date
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_suscripcion uuid;
  v_vencimiento date;
  v_inicio      date;
  v_primero     boolean;
  v_corre       boolean;
  v_nuevo       date;
  v_nuevo_ini   date;
  v_pago        uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede registrar un pago'
      using errcode = '42501';
  end if;

  if p_periodo_desde is null or p_periodo_hasta is null then
    raise exception 'periodo_incompleto';
  end if;

  if p_periodo_hasta < p_periodo_desde then
    raise exception 'periodo_invertido';
  end if;

  if p_monto is null or p_monto < 0 then
    raise exception 'monto_invalido';
  end if;

  if p_fecha_pago is null then
    raise exception 'fecha_pago_vacia';
  end if;

  -- La suscripción vigente es la última que arrancó, igual que en el listado.
  select id, vencimiento, inicio into v_suscripcion, v_vencimiento, v_inicio
  from suscripciones
  where lubricentro_id = p_lubricentro_id
  order by inicio desc, created_at desc
  limit 1;

  if v_suscripcion is null then
    raise exception 'sin_suscripcion';
  end if;

  -- ANTES del insert, o siempre da false.
  v_primero := not exists (
    select 1 from pagos p where p.lubricentro_id = p_lubricentro_id);       -- @primer_pago

  -- El ciclo se calcula ANTES de escribir el pago, porque el pago tiene que
  -- registrar el período que de verdad cubre. El largo, del lado manual,
  -- es la ventana que la persona tipeó.
  select c.inicio, c.vencimiento into v_nuevo_ini, v_nuevo
  from ciclo_tras_el_pago(v_primero, v_inicio, v_vencimiento, p_fecha_pago,
                          p_periodo_hasta,
                          (p_periodo_hasta - p_periodo_desde) * interval '1 day') c;

  -- ¿Se corrió el ciclo? Se lee del RESULTADO, no repitiendo la condición:
  -- la regla vive en ciclo_tras_el_pago() y acá solo se mira si movió
  -- `inicio`. Y solo lo mueve el primer pago tardío, que es siempre
  -- posterior al inicio vigente (fecha_pago > vencimiento >= inicio): no
  -- hay empate posible.
  v_corre := v_nuevo_ini is distinct from v_inicio;

  -- ⚠ EL PAGO REGISTRA EL PERÍODO QUE CUBRE DE VERDAD. Si el ciclo se corrió
  -- a la fecha del pago, la ventana del pago es esa y no la que se tipeó.
  -- De lo contrario `vencimiento` deja de coincidir con
  -- `max(pagos.periodo_hasta)`, que es exactamente el invariante que la
  -- auditoría de producción del 15/09 encontró intacto en las 15 filas con
  -- pagos — y que la próxima auditoría volvería a mirar.
  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    p_lubricentro_id, v_suscripcion, auth.uid(),
    case when v_corre then v_nuevo_ini else p_periodo_desde end,
    case when v_corre then v_nuevo     else p_periodo_hasta end,
    p_monto, p_fecha_pago
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

  -- RLS rechaza los UPDATE en silencio: cero filas y ningún error. Sin
  -- esto, un rechazo se vería en pantalla como un cobro registrado.
  if not found then
    raise exception 'sin_permiso_suscripcion';
  end if;

  return v_pago;
end;
$$;

comment on function registrar_pago is
  'Registra la transferencia y mueve el ciclo en una transacción. El PRIMER pago corre inicio y vencimiento a la fecha del pago (ciclo_tras_el_pago); los siguientes extienden desde el vencimiento. La firma sale de auth.uid(), nunca de un parámetro.';

revoke execute on function registrar_pago(uuid, date, date, numeric, date) from public, anon;
grant execute on function registrar_pago(uuid, date, date, numeric, date) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3 · La puerta del webhook
-- ════════════════════════════════════════════════════════════════════
--
-- Es la versión de 20260917000000 con las mismas dos líneas de cambio que
-- la manual: el conteo antes del insert y el cálculo delegado a
-- `ciclo_tras_el_pago()`. Todo lo demás —las tres formas del payload, la
-- evidencia antes de cualquier decisión, la idempotencia por
-- `cresium_transaccion_id`, el PARTIAL que no mueve nada— queda igual.
--
-- ⚠ EL LARGO SALE DEL PAGO, NO DEL `externalId`. `v_hasta` viene congelado
-- adentro de la referencia, que se escribió cuando se creó la orden y que
-- en Cresium es inmutable para siempre (regla 20). La ventana que se
-- conserva es la que quedó escrita en `pagos`: `greatest(v_venc,
-- current_date)` → `v_hasta`, que son exactamente los días que el dueño vio
-- cotizados en la pantalla cuando decidió transferir.

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

revoke all on function acreditar_deposito_cresium(jsonb) from public, anon, authenticated;
