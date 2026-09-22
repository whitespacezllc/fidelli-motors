-- ════════════════════════════════════════════════════════════════════
-- BACKFILL DE tenant_eventos · lo que ya pasó, escrito una vez
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 5)
--
-- Los triggers de 20260922201000 registran lo que pase de acá en adelante.
-- Esto registra lo que ya pasó, con lo único que la base recuerda:
--
--   · un `alta` por tenant, en lubricentros.created_at, con el plan y el
--     período de su PRIMERA suscripción;
--   · un `pago` por cada fila de pagos, en pagos.created_at;
--   · un `modulo_activado` / `modulo_desactivado` por cada fila de
--     cambios_override_plan que movió un módulo, con su motivo.
--
-- Todo con origen_evento = 'backfill' y actor null; quién registró el pago
-- o el cambio queda dentro de `despues` (registrado_por, cambiado_por).
--
-- IDEMPOTENTE: cada insert salta lo que ya existe (el alta por tenant, el
-- pago por despues.pago_id, el módulo por despues.cambio_id + modulo). En
-- el `db reset` local corre antes del seed y no encuentra nada: los
-- eventos del demo los escriben los triggers. En producción encuentra los
-- 17 tenants, sus pagos y sus overrides.
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  v_altas integer;
  v_pagos integer;
  v_mods  integer;
begin
  -- ---------- altas ----------
  insert into tenant_eventos (lubricentro_id, tipo, ocurrido_at, antes, despues, motivo, actor, origen_evento)
  select l.id, 'alta', l.created_at, null,
         jsonb_build_object(
           'nombre', l.nombre, 'slug', l.slug, 'cobranza_desde', l.cobranza_desde,
           'plan_id', s.plan_id, 'plan', p.nombre, 'periodo', s.periodo, 'descuento_pct', s.descuento_pct,
           'backfill', true),
         null, null, 'backfill'
    from lubricentros l
    left join lateral (
      select s.plan_id, s.periodo, s.descuento_pct
        from suscripciones s
       where s.lubricentro_id = l.id
       order by s.inicio asc, s.created_at asc
       limit 1
    ) s on true
    left join planes p on p.id = s.plan_id
   where not exists (
     select 1 from tenant_eventos e where e.lubricentro_id = l.id and e.tipo = 'alta');
  get diagnostics v_altas = row_count;

  -- ---------- pagos ----------
  insert into tenant_eventos (lubricentro_id, tipo, ocurrido_at, antes, despues, motivo, actor, origen_evento)
  select pg.lubricentro_id, 'pago', pg.created_at, null,
         jsonb_build_object(
           'pago_id', pg.id, 'monto', pg.monto,
           'periodo_desde', pg.periodo_desde, 'periodo_hasta', pg.periodo_hasta,
           'fecha_pago', pg.fecha_pago, 'origen', pg.origen,
           'cresium_transaccion_id', pg.cresium_transaccion_id,
           'suscripcion_id', pg.suscripcion_id, 'registrado_por', pg.registrado_por,
           'backfill', true),
         null, null, 'backfill'
    from pagos pg
   where not exists (
     select 1 from tenant_eventos e
      where e.tipo = 'pago' and e.despues ->> 'pago_id' = pg.id::text);
  get diagnostics v_pagos = row_count;

  -- ---------- módulos ----------
  insert into tenant_eventos (lubricentro_id, tipo, ocurrido_at, antes, despues, motivo, actor, origen_evento)
  select c.lubricentro_id,
         case when d.despues then 'modulo_activado' else 'modulo_desactivado' end::tipo_evento_tenant,
         c.created_at,
         jsonb_build_object('modulo', m.codigo, 'activo', d.antes,   'overrides', c.overrides_antes),
         jsonb_build_object('modulo', m.codigo, 'activo', d.despues, 'overrides', c.overrides_despues,
                            'cambio_id', c.id, 'cambiado_por', c.cambiado_por, 'backfill', true),
         c.motivo, null, 'backfill'
    from cambios_override_plan c
    cross join modulos m
    cross join lateral (
      select coalesce((c.overrides_antes   ->> m.codigo)::boolean, false) as antes,
             coalesce((c.overrides_despues ->> m.codigo)::boolean, false) as despues
    ) d
   where d.antes <> d.despues
     and not exists (
       select 1 from tenant_eventos e
        where e.tipo in ('modulo_activado', 'modulo_desactivado')
          and e.despues ->> 'cambio_id' = c.id::text
          and e.despues ->> 'modulo' = m.codigo);
  get diagnostics v_mods = row_count;

  raise notice 'backfill tenant_eventos · altas: % · pagos: % · módulos: %', v_altas, v_pagos, v_mods;
end $$;
