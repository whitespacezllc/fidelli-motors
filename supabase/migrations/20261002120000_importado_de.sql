-- ============================================================
-- Lo importado se distingue para siempre: `importado_de`
--
-- Falco (Alta Gracia) llevaba desde 2023 una planilla con una fila por
-- visita. El día que empieza a cargar en Fidelli su panel ya tiene la
-- historia: 5.348 trabajos de 3.282 autos, que entran por
-- scripts/importar-planilla.mjs (un SQL generado; este archivo es solo la
-- puerta). Para que esa historia no ensucie nada, cada fila importada
-- lleva de dónde vino.
--
-- LAS TRES REGLAS, y dónde vive cada una:
--
--   1 · El premio NO cuenta lo importado. `premio_disponible` y
--       `ciclos_fidelizacion` (que tienen que decir lo mismo, regla 22)
--       suman solo `importado_de is null`: el ciclo arranca con Fidelli.
--
--   2 · Lo que mide a la PLATAFORMA no lo cuenta; lo que el tenant ve de
--       sí mismo, sí. La regla, función por función:
--
--       EXCLUYEN lo importado (miden a Fidelli, se leen desde /fidelli o
--       las escribe el cierre diario):
--         metricas_plataforma()             el Pulso: acumulado, mes y series
--         resumen_admin()                   trabajos del mes y «sin trabajos»
--         trabajos_semanales()              el sparkline del listado
--         indicadores_tenants()             trabajos en 30 días, último, activado
--         salud_tenants()                   al día / actividad baja / sin actividad
--         listado_lubricentros()            services del mes y último service
--         activacion_tenant()               los 20 trabajos en 7 días
--         activacion_por_mes()              ídem, por cohorte
--         uso_tenant()                      uso por tipo de la ficha
--         autos_que_volvieron()             y autos_que_volvieron_plataforma()
--         metricas_tenant()                 la pestaña Resumen de la ficha:
--                                           services del mes, flota del año
--                                           (el universo del % de escaneo) y
--                                           último service
--         foto_tenant_del_dia()             snapshots_tenant_diarios.trabajos_dia
--         foto_plataforma_del_dia()         snapshots_diarios.trabajos_*
--
--       NO SE TOCAN (el tenant mirando su propia historia, o la operación):
--         resumen_inicio(), recuperados_del_mes(), get_carton(),
--         get_landing(), vista_clientes, vista_vehiculos, vista_pendientes,
--         vista_proximos_neumaticos, buscar_vehiculo_por_patente(),
--         guardar_service(), actualizar_service(), service_editable(),
--         desbloquear_service(), calcular_beneficio_neumaticos(),
--         bloquear_cambio_de_patente(), purgar_tenants_vencidos(),
--         seed_demo() y los triggers de coherencia.
--
--       Tampoco se tocan, y es a propósito, los conteos de `clientes` y
--       `vehiculos` de metricas_tenant() ni el paso 1 del onboarding
--       (`productos`): dicen cuánto tiene cargado el taller, no cuánto usó
--       Fidelli, y lo importado está cargado.
--
--   3 · «A quién llamar» tiene horizonte: 18 meses. Un auto cuyo último
--       service fue hace más de 18 meses no está vencido, está perdido, y
--       no entra en vista_proximos_service. Es global, para todos los
--       tenants. resumen_inicio().retencion lo hereda (cuenta la vista).
--
-- get_carton NO cambia: el cliente ve todo su historial, importado o no.
-- El sello `fijado` sale solo, porque la importación escribe created_at a
-- las 12:00 de la fecha de la planilla.
--
-- Cada función va copiada textual del archivo que la define hoy
-- (20260929100000, 20260925101000, 20260924102000, 20260923100000,
-- 20260922204000, 20260726210000) con UNA condición más por lectura de
-- `services`. Misma firma, mismo retorno: create or replace conserva los
-- grants. Los marcadores `-- >>>` y `-- @` se conservan porque los muerden
-- scripts/regresion-visita.sh, regresion-metricas.sh y
-- regresion-cobranza-deudas.sh, que desde ahora apuntan a este archivo.
-- ============================================================


-- ---------- 1 · La columna ----------
alter table services  add column importado_de text;
alter table clientes  add column importado_de text;
alter table vehiculos add column importado_de text;
alter table productos add column importado_de text;

comment on column services.importado_de is
  'De qué importación vino este trabajo (p. ej. falco-planilla-2026-10). Null = cargado en el panel. Lo importado no cuenta para el premio ni para las métricas de la plataforma; el tenant sí lo ve en su panel y el cliente en su cartón.';
comment on column clientes.importado_de is
  'De qué importación vino este cliente. Null = cargado en el panel. Sirve para deshacer la importación entera.';
comment on column vehiculos.importado_de is
  'De qué importación vino este vehículo. Null = cargado en el panel. Sirve para deshacer la importación entera.';
comment on column productos.importado_de is
  'De qué importación vino este producto. Null = cargado en el panel. Sirve para deshacer la importación entera.';

-- El «¿ya se importó?» de la puerta de entrada y el deshacer. Parcial: en
-- un tenant sin importaciones no pesa nada.
create index services_importado_idx
  on services (lubricentro_id, importado_de)
  where importado_de is not null;


-- ---------- 2 · El premio: solo lo cargado en el panel ----------
-- Las dos funciones tienen que decir lo mismo (regla 22; R38 las compara).
-- >>> premio_disponible
create or replace function premio_disponible(p_vehiculo_id uuid)
returns table (
  disponible        boolean,
  services_ciclo    integer,
  meta_services     integer,
  premio_id         uuid,
  descripcion       text,
  alcance           alcance_premio
)
language sql
stable
as $$
  with vehiculo as (
    select v.id, v.lubricentro_id
    from vehiculos v
    where v.id = p_vehiculo_id
  ),
  premio_vigente as (
    select p.id, p.meta_services, p.descripcion, p.alcance
    from premios p
    join vehiculo ve on ve.lubricentro_id = p.lubricentro_id
    where p.activo
    limit 1
  ),
  ultimo_canje as (
    select max(c.created_at) as fecha
    from canjes c
    where c.vehiculo_id = p_vehiculo_id
  ),
  conteo as (
    -- VISITAS, no filas (20260929100000): los trabajos de una misma
    -- fecha valen 1. Ver el encabezado de esa migración.
    select count(distinct s.fecha)::integer as n -- @visitas
    from services s
    cross join ultimo_canje uc
    left join premio_vigente pv on true
    where s.vehiculo_id = p_vehiculo_id
      and not s.anulado
      -- sin premio (pv null) o con alcance 'services': solo cambios de
      -- aceite, el comportamiento de siempre.
      and (pv.alcance = 'todos' or s.tipo = 'service')
      and (uc.fecha is null or s.created_at > uc.fecha) -- @corte-ciclo
      -- El historial importado no cuenta: el ciclo arranca con Fidelli.
      and s.importado_de is null -- @sin-importado
  )
  select
    coalesce(c.n >= pv.meta_services, false) as disponible,
    c.n                                       as services_ciclo,
    pv.meta_services,
    pv.id                                     as premio_id,
    pv.descripcion,
    pv.alcance
  from conteo c
  left join premio_vigente pv on true;
$$;
-- <<< premio_disponible

comment on function premio_disponible(uuid) is
  'El ciclo del premio de un vehículo: cuenta las FECHAS DISTINTAS con trabajo no anulado y NO IMPORTADO desde el último canje (created_at > canje, estricto), contra la meta vigente. Qué tipos cuentan lo dice premios.alcance (services = solo cambios de aceite; todos = cualquier trabajo). Dos trabajos del mismo día valen 1. Sin contadores guardados.';

-- >>> ciclos_fidelizacion
create or replace function ciclos_fidelizacion()
returns table (
  vehiculo_id     uuid,
  services_ciclo  integer
)
language sql
stable
set search_path = public
as $$
  select
    v.id,
    count(distinct s.fecha) filter ( -- @visitas-flota
      -- mismo criterio que premio_disponible: el alcance del premio
      -- vigente decide si la mecánica suma (null o 'services' → no).
      where not s.anulado
        and (pa.alcance = 'todos' or s.tipo = 'service')
        and (uc.fecha is null or s.created_at > uc.fecha)
        and s.importado_de is null -- @sin-importado-flota
    )::integer
  from vehiculos v
  left join lateral (
    select p.alcance
    from premios p
    where p.lubricentro_id = v.lubricentro_id and p.activo
    order by p.created_at desc
    limit 1
  ) pa on true
  left join lateral (
    select max(c.created_at) as fecha
    from canjes c
    where c.vehiculo_id = v.id
  ) uc on true
  left join services s on s.vehiculo_id = v.id
  group by v.id;
$$;
-- <<< ciclos_fidelizacion

comment on function ciclos_fidelizacion() is
  'El mismo ciclo que premio_disponible, para toda la flota del tenant: fechas distintas con trabajo no importado desde el último canje, según el alcance del premio activo. Las dos funciones tienen que decir lo mismo; R38 las compara.';


-- ---------- 3 · Lo que mide a la plataforma ----------
-- >>> metricas_plataforma
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_json jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función filtra por tipo:
  -- el desglose es además del total, no en vez.
  with
  -- LA pasada por services: una fila por fecha con el total y los tipos.
  por_dia as (
    select
      s.fecha,
      count(*)::integer                                       as total,
      count(*) filter (where s.tipo = 'service')::integer     as svc,
      count(*) filter (where s.tipo = 'mecanica')::integer    as mec,
      count(*) filter (where s.tipo = 'neumaticos')::integer  as neu
    from services s
    where not s.anulado                                        -- @serie_todos
      and s.importado_de is null                               -- @serie_sin_importado
    group by s.fecha
  ),
  resumen as (
    select min(d.fecha) as primero, coalesce(sum(d.total), 0)::bigint as acumulado
    from por_dia d
  ),
  grupos as (
    select * from (values
      ('dia',    'day',   interval '1 day',   30),
      ('semana', 'week',  interval '1 week',  12),
      ('mes',    'month', interval '1 month', 12)
    ) as g(clave, unidad, paso, pasos)
  ),
  -- Cada fecha, sumada en su día, su semana y su mes. Son pocas filas (una
  -- por fecha con trabajos), no la tabla.
  por_bucket as (
    select
      g.clave,
      date_trunc(g.unidad, d.fecha)::date as inicio,
      sum(d.total)::integer as total,
      sum(d.svc)::integer   as svc,
      sum(d.mec)::integer   as mec,
      sum(d.neu)::integer   as neu
    from grupos g
    cross join por_dia d
    group by g.clave, date_trunc(g.unidad, d.fecha)::date
  ),
  -- Los puntos de cada serie: desde el más viejo de la ventana (o el primer
  -- trabajo, si es posterior) hasta el período actual. Sin primer trabajo
  -- no hay puntos: greatest() ignora el null, por eso el where.
  puntos as (
    select g.clave, p.inicio::date as inicio
    from grupos g
    cross join resumen r
    cross join lateral generate_series(
      greatest(
        (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
        date_trunc(g.unidad, r.primero)::date
      ),
      date_trunc(g.unidad, current_date)::date,
      g.paso) as p(inicio)
    where r.primero is not null                                         -- @sin_trabajos
  )
  -- El `::date` de trabajos_mes es el mismo caso que en el listado: sin
  -- él, `date >= timestamptz` no es leakproof, el índice no se usa y la
  -- policy se evalúa en toda la tabla.
  select jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and importado_de is null                        -- @trabajos_mes_sin_importado
                       and fecha >= date_trunc('month', current_date)::date),
    'acumulado', r.acumulado,
    'primer_trabajo', r.primero,
    'series', (
      select jsonb_object_agg(g.clave, coalesce(serie.datos, '[]'::jsonb))
      from grupos g
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'inicio',     p.inicio,
            'cantidad',   coalesce(b.total, 0),
            'service',    coalesce(b.svc, 0),
            'mecanica',   coalesce(b.mec, 0),
            'neumaticos', coalesce(b.neu, 0))
          order by p.inicio) as datos
        from puntos p
        left join por_bucket b on b.clave = p.clave and b.inicio = p.inicio
        where p.clave = g.clave
      ) serie on true
    )
  )
  into v_json
  from resumen r;

  return v_json;
end;
$$;
-- <<< metricas_plataforma

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
                          order by o.lubricentro_id, o.created_at desc
                        ) u where u.estado in ('EXPIRED', 'PARTIAL')),
    'atencion',        v_atencion,
    'sin_origen',      (select count(*) from lubricentros where origen is null),
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

-- >>> trabajos_semanales
create or replace function trabajos_semanales(
  p_lubricentro_id uuid    default null,
  p_semanas        integer default 12
)
returns table (
  lubricentro_id uuid,
  semana         date,
  cantidad       integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver los trabajos por semana'
      using errcode = '42501';
  end if;
  if p_semanas < 1 or p_semanas > 104 then
    raise exception 'semanas_fuera_de_rango'
      using hint = 'Entre 1 y 104 semanas.';
  end if;

  v_desde := (date_trunc('week', current_date) - (p_semanas - 1) * interval '1 week')::date;

  return query
  with semanas as (
    select generate_series(v_desde, date_trunc('week', current_date)::date, interval '1 week')::date as inicio
  ),
  tenants as (
    select l.id from lubricentros l
    where p_lubricentro_id is null or l.id = p_lubricentro_id
  ),
  conteo as (
    select
      sv.lubricentro_id,
      date_trunc('week', sv.fecha)::date as inicio,
      count(*)::integer as n
    from services sv
    where not sv.anulado                                                -- @semana_todos
      and sv.importado_de is null                                       -- @semana_sin_importado
      and sv.fecha >= v_desde
      and (p_lubricentro_id is null or sv.lubricentro_id = p_lubricentro_id)
    group by sv.lubricentro_id, date_trunc('week', sv.fecha)::date
  )
  select t.id, s.inicio, coalesce(c.n, 0)
  from tenants t
  cross join semanas s
  left join conteo c on c.lubricentro_id = t.id and c.inicio = s.inicio
  order by t.id, s.inicio;
end;
$$;
-- <<< trabajos_semanales

-- >>> salud_tenants
create or replace function salud_tenants()
returns table (
  lubricentro_id uuid,
  -- 'cobro_vencido' · 'al_dia' · 'actividad_baja' · 'sin_actividad' · null
  salud          text,
  -- La oración que acompaña al chip: «venció hace 4 días», «3 trabajos en
  -- 7 días», «sin trabajos hace 9 días», «nunca cargó un trabajo».
  motivo         text,
  ultimo_trabajo date
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then                                          -- @guarda_salud
    raise exception 'Solo el equipo Fidelli puede ver la salud de los tenants'
      using errcode = '42501';
  end if;

  return query
  with vigente as (
    -- La suscripción vigente, con el criterio de todo el repo.
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      max(sv.fecha) as ultimo,
      count(*) filter (where sv.fecha >= current_date - 6)::integer as en_7_dias
    from services sv
    where not sv.anulado
      and sv.importado_de is null                                       -- @salud_sin_importado
    group by sv.lubricentro_id
  ),
  base as (
    select
      l.id,
      l.activo,
      v.estado,
      v.vencimiento,
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion,
      a.ultimo,
      coalesce(a.en_7_dias, 0) as en_7_dias,
      (current_date - a.ultimo) as dias
    from lubricentros l
    left join vigente   v on v.lubricentro_id = l.id
    left join actividad a on a.lubricentro_id = l.id
  )
  select
    b.id,
    case
      when not b.activo or b.estado = 'cancelada' then null
      when b.atencion in ('trial_vencido', 'cobranza_vencida') then 'cobro_vencido'   -- @cobro_por_atencion
      when b.ultimo is null then 'sin_actividad'
      when b.dias <= 3 then 'al_dia'                                    -- @corte_al_dia
      when b.dias <= 7 then 'actividad_baja'                            -- @corte_baja
      else 'sin_actividad'
    end,
    case
      when not b.activo or b.estado = 'cancelada' then null
      when b.atencion = 'trial_vencido' then
        'trial terminado ' || case when current_date - b.vencimiento = 1 then 'ayer'
                                   else 'hace ' || (current_date - b.vencimiento) || ' días' end
      when b.atencion = 'cobranza_vencida' then
        'venció ' || case when current_date - b.vencimiento = 1 then 'ayer'
                          else 'hace ' || (current_date - b.vencimiento) || ' días' end
      when b.ultimo is null then 'nunca cargó un trabajo'
      when b.dias <= 3 then
        b.en_7_dias || case when b.en_7_dias = 1 then ' trabajo en 7 días' else ' trabajos en 7 días' end
      when b.dias <= 7 then
        'último trabajo ' || case when b.dias = 1 then 'ayer' else 'hace ' || b.dias || ' días' end
      else 'sin trabajos hace ' || b.dias || ' días'
    end,
    b.ultimo
  from base b;
end;
$$;
-- <<< salud_tenants

-- >>> indicadores_tenants
create or replace function indicadores_tenants()
returns table (
  lubricentro_id uuid,
  es_activo      boolean,
  exento         boolean,
  estado_reloj   text,
  mrr_ars        numeric,
  modulo_pago    boolean,
  trabajos_30    integer,
  ultimo_trabajo date,
  -- La activación (docs/METRICAS.md § 1): 20 o más trabajos en la primera
  -- semana. El chip «No activado» del listado la muestra solo con más de
  -- 7 días de alta.
  activado       boolean,
  dias_alta      integer
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver los indicadores de los tenants'
      using errcode = '42501';
  end if;

  return query
  with vigente as (
    select distinct on (s.lubricentro_id) s.lubricentro_id, s.descuento_pct
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      count(*) filter (where sv.fecha >= current_date - 29)::integer as en_30, -- @trabajos_30
      max(sv.fecha) as ultimo
    from services sv
    where not sv.anulado
      and sv.importado_de is null                                        -- @actividad_sin_importado
    group by sv.lubricentro_id
  ),
  primera_semana as (
    select sv.lubricentro_id, count(*)::integer as n
    from services sv
    join lubricentros l on l.id = sv.lubricentro_id
    where not sv.anulado
      and sv.importado_de is null                                        -- @semana_uno_sin_importado
      and sv.created_at >= l.created_at
      and sv.created_at < l.created_at + interval '7 days'
    group by sv.lubricentro_id
  )
  select
    l.id,
    public.es_activo(l),
    coalesce(v.descuento_pct, 0) >= 100,
    reloj_cobranza(l) ->> 'estado',
    mrr_de_tenant(l.id),                                                 -- @mrr_indicador
    -- El único módulo pago del catálogo; lib/planes.ts (MODULOS_PAGOS) lo
    -- espeja. Un módulo nuevo entra acá y allá a la vez.
    modulo_es_pago(l.id, 'neumaticos'),
    coalesce(a.en_30, 0),
    a.ultimo,
    coalesce(ps.n, 0) >= 20,
    (current_date - l.created_at::date)::integer
  from lubricentros l
  left join vigente        v  on v.lubricentro_id  = l.id
  left join actividad      a  on a.lubricentro_id  = l.id
  left join primera_semana ps on ps.lubricentro_id = l.id;
end;
$$;
-- <<< indicadores_tenants

-- >>> listado_lubricentros
create or replace function listado_lubricentros()
returns table (
  id                uuid,
  nombre            text,
  slug              text,
  activo            boolean,
  calcos_entregadas integer,
  creado            date,
  suscripcion_id    uuid,
  sub_estado        estado_suscripcion,
  sub_periodo       periodo_suscripcion,
  sub_descuento_pct numeric,
  sub_vencimiento   date,
  plan_id           uuid,
  plan_nombre       text,
  plan_precio       numeric,
  plan_desc_sem     numeric,
  plan_desc_anual   numeric,
  services_mes      integer,
  ultimo_service    date,
  owner_estado      text,
  owner_nombre      text,
  atencion          text,
  atencion_orden    integer,
  contactado        boolean,
  telefono          text,
  onboarding_paso   integer,
  onboarding_pasos  integer,
  onboarding_avance timestamptz,
  modulo_neumaticos boolean
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver el listado de lubricentros'
      using errcode = '42501';
  end if;

  -- Todo lo que sigue va calificado (l., v., b.…) a propósito: en plpgsql
  -- los nombres de las columnas de salida son variables, y una referencia
  -- suelta a `id` o `telefono` sería ambigua.
  return query
  with
  -- Un lubricentro acumula suscripciones (el histórico no se borra). La
  -- vigente es la última que arrancó; es el mismo criterio de la ficha,
  -- de feature_de_tenant() y de suscriptos_por_plan().
  vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  -- Solo las filas del mes, por el índice parcial por fecha. El `::date`
  -- no es cosmético: `date_trunc()` devuelve timestamptz y el operador
  -- `date >= timestamptz` NO es leakproof, así que con RLS el planificador
  -- no puede usarlo como condición de índice y evalúa la policy en TODAS
  -- las filas (medido: 2.000 buffers contra 152). `date >= date` sí lo es.
  del_mes as (
    select sv.lubricentro_id, count(*)::integer as n
    from services sv
    where not sv.anulado
      and sv.importado_de is null                                        -- @mes_sin_importado
      and sv.fecha >= date_trunc('month', current_date)::date
    group by sv.lubricentro_id
  ),
  -- Una sola llamada para todos los tenants: es definer con guarda y la
  -- única que puede mirar auth.users. Devuelve UNA FILA POR USUARIO owner,
  -- así que un tenant con dos owners (una reinvitación con otro mail) sale
  -- DOS veces en el listado, una por estado. La versión anterior hacía
  -- exactamente lo mismo y se conserva a propósito: este archivo cambia
  -- cómo se lee, no qué se devuelve (R34g lo compara fila por fila, con un
  -- tenant de dos owners entre los fixtures). En producción cada tenant
  -- tiene un owner.
  owners as (
    select eo.lubricentro_id, eo.estado from estados_owner() eo
  ),
  -- El nombre del owner: con dos, el más antiguo (created_at, id), siempre
  -- el mismo. El subselect viejo era `limit 1` sin order by y elegía
  -- cualquiera; es la única salida que puede diferir de la versión
  -- anterior, y solo con dos owners. Con el MISMO created_at (dos
  -- invitaciones en la misma transacción) decide el id: un uuid al azar,
  -- o sea un desempate tan arbitrario como el heap, pero fijo y el mismo
  -- que usa estado_owner(), para que la ficha y el listado hablen del
  -- mismo owner también en el empate (R34g lo prueba con un tenant así).
  duenos as (
    select distinct on (u.lubricentro_id) u.lubricentro_id, u.nombre
    from usuarios u
    where u.rol = 'owner'
    order by u.lubricentro_id, u.created_at, u.id                           -- @owner_mas_viejo
  ),
  ultimo_pago as (
    select pg.lubricentro_id, max(pg.created_at) as at
    from pagos pg
    group by pg.lubricentro_id
  ),
  ultimo_contacto as (
    select cf.lubricentro_id, max(cf.created_at) as at
    from contactos_fidelli cf
    group by cf.lubricentro_id
  ),
  tel_sucursal as (
    select distinct on (su.lubricentro_id)
      su.lubricentro_id, nullif(trim(su.telefono), '') as tel
    from sucursales su
    where su.activa
      and nullif(trim(su.telefono), '') is not null
    order by su.lubricentro_id, su.created_at
  ),
  -- Paso 1 del onboarding: cualquier producto cuenta, activo o no.
  catalogo as (
    select pr.lubricentro_id, count(*)::integer as n, max(pr.created_at) as ultimo
    from productos pr
    group by pr.lubricentro_id
  ),
  -- Paso 3: "definido" es que exista la fila del programa, activo o no.
  programa as (
    select pm.lubricentro_id, max(pm.created_at) as ultimo
    from premios pm
    group by pm.lubricentro_id
  ),
  base as (
    select
      l.id, l.nombre, l.slug, l.activo, l.calcos_entregadas, l.created_at,
      l.plan_overrides, l.diseno_confirmado_at, l.premio_omitido_at,
      l.onboarding_completado_at,
      v.id as v_id, v.estado as v_estado, v.periodo as v_periodo,
      v.descuento_pct as v_desc, v.vencimiento as v_venc, v.plan_id as v_plan,
      p.nombre as p_nombre, p.precio_mensual as p_precio,
      p.descuento_semestral_pct as p_sem, p.descuento_anual_pct as p_anual,
      p.features as p_features,
      coalesce(dm.n, 0) as del_mes,
      ult.fecha as ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,                       -- @owner_estado_listado
      d.nombre as o_nombre,
      -- La regla única de la atención, con el descuento puesto (R24).
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion,
      -- Sin contactos el max() es null, y null > x es null: por eso el
      -- coalesce a false, que es lo que devolvía el exists.
      coalesce(uc.at > coalesce(up.at, l.created_at), false) as contactado,
      coalesce(nullif(trim(ce.datos_contacto ->> 'whatsapp'), ''), ts.tel) as telefono,
      coalesce(c.n, 0) as productos,
      c.ultimo as ultimo_producto,
      (pg.lubricentro_id is not null) as premio_definido,
      pg.ultimo as premio_at,
      -- Los tres escalones de feature_de_tenant(), en línea.
      case
        when jsonb_typeof(l.plan_overrides -> 'premios') = 'boolean'
          then (l.plan_overrides ->> 'premios')::boolean
        when jsonb_typeof(p.features -> 'premios') = 'boolean'
          then (p.features ->> 'premios')::boolean
        else false
      end as aplica_premio,
      case
        when jsonb_typeof(l.plan_overrides -> 'neumaticos') = 'boolean'
          then (l.plan_overrides ->> 'neumaticos')::boolean
        when jsonb_typeof(p.features -> 'neumaticos') = 'boolean'          -- @modulo_plan
          then (p.features ->> 'neumaticos')::boolean
        else false
      end as modulo
    from lubricentros l
    left join vigente            v  on v.lubricentro_id  = l.id
    left join planes             p  on p.id              = v.plan_id
    left join del_mes            dm on dm.lubricentro_id = l.id
    -- El último trabajo: un sondeo por tenant que el planificador resuelve
    -- como «primera fila del índice» (services_lubricentro_fecha_idx bajo
    -- carga; el parcial por fecha con pocas filas) y no como una pasada.
    left join lateral (
      select max(sv.fecha) as fecha
      from services sv
      where sv.lubricentro_id = l.id
        and not sv.anulado
        and sv.importado_de is null                                      -- @ultimo_sin_importado
    ) ult on true
    left join owners             o  on o.lubricentro_id  = l.id
    left join duenos             d  on d.lubricentro_id  = l.id
    left join ultimo_pago        up on up.lubricentro_id = l.id
    left join ultimo_contacto    uc on uc.lubricentro_id = l.id
    left join config_experiencia ce on ce.lubricentro_id = l.id
    left join tel_sucursal       ts on ts.lubricentro_id = l.id
    left join catalogo           c  on c.lubricentro_id  = l.id
    left join programa           pg on pg.lubricentro_id = l.id
  )
  select
    b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.created_at::date,
    b.v_id, b.v_estado, b.v_periodo, b.v_desc, b.v_venc,
    b.v_plan, b.p_nombre, b.p_precio, b.p_sem, b.p_anual,
    b.del_mes, b.ultimo,
    b.o_estado, b.o_nombre,
    b.atencion,
    orden_atencion(b.atencion),
    b.contactado,
    b.telefono,
    -- El paso actual es el primero que falta, en orden. Null = todos
    -- hechos, o el onboarding completado por decreto (las cuentas
    -- anteriores a 20260909180000).
    case
      when b.onboarding_completado_at is not null then null
      when b.productos = 0 then 1
      when b.diseno_confirmado_at is null then 2
      when b.aplica_premio and not b.premio_definido and b.premio_omitido_at is null then 3
      else null
    end,
    case when b.aplica_premio then 3 else 2 end,
    -- El último avance: lo más reciente de todo lo que cuenta como paso.
    greatest(b.ultimo_producto, b.diseno_confirmado_at, b.premio_at, b.premio_omitido_at),
    b.modulo
  from base b
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
end;
$$;
-- <<< listado_lubricentros

-- >>> activacion_tenant
create or replace function activacion_tenant(p_lubricentro_id uuid)
returns table (
  trabajos_7d integer,
  activado    boolean,
  fecha_alta  timestamptz,
  -- El día de la primera semana que está corriendo (1 a 7). Con la semana
  -- terminada, 7.
  dia         integer,
  en_curso    boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_alta timestamptz;
  v_n    integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve la activación' using errcode = '42501';
  end if;

  select l.created_at into v_alta from lubricentros l where l.id = p_lubricentro_id;
  if v_alta is null then
    return;
  end if;

  select count(*)::integer into v_n
  from services s
  where s.lubricentro_id = p_lubricentro_id
    and not s.anulado
    and s.importado_de is null                                         -- @activacion_sin_importado
    and s.created_at >= v_alta
    and s.created_at < v_alta + interval '7 days';                    -- @ventana_activacion

  return query select
    v_n,
    v_n >= 20,                                                          -- @umbral_activacion
    v_alta,
    least(7, floor(extract(epoch from (now() - v_alta)) / 86400)::integer + 1),
    now() < v_alta + interval '7 days';
end;
$$;
-- <<< activacion_tenant

-- >>> activacion_por_mes
create or replace function activacion_por_mes(p_desde date, p_hasta date)
returns table (
  mes       date,
  altas     integer,
  activados integer,
  en_curso  integer,
  tasa      numeric
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve la activación' using errcode = '42501';
  end if;

  return query
  with alta as (
    select l.id, date_trunc('month', l.created_at)::date as m, l.created_at
    from lubricentros l
    where l.created_at >= p_desde and l.created_at < p_hasta + 1
  ),
  conteo as (
    select a.m, a.created_at,
      (select count(*) from services s
        where s.lubricentro_id = a.id and not s.anulado
          and s.importado_de is null
          and s.created_at >= a.created_at
          and s.created_at < a.created_at + interval '7 days') as n
    from alta a
  )
  select
    c.m,
    count(*)::integer,
    count(*) filter (where c.n >= 20)::integer,
    count(*) filter (where c.n < 20 and now() < c.created_at + interval '7 days')::integer,
    round(count(*) filter (where c.n >= 20)::numeric / count(*), 4)
  from conteo c
  group by c.m
  order by c.m;
end;
$$;
-- <<< activacion_por_mes

-- >>> autos_que_volvieron
create or replace function autos_que_volvieron(p_lubricentro_id uuid, p_desde date, p_hasta date)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_n integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve los autos que volvieron' using errcode = '42501';
  end if;

  select count(distinct s.vehiculo_id)::integer into v_n
  from services s
  where s.lubricentro_id = p_lubricentro_id
    and not s.anulado
    and s.importado_de is null
    and s.fecha between p_desde and p_hasta
    and exists (
      select 1 from contactos c
      where c.vehiculo_id = s.vehiculo_id
        and c.created_at::date between s.fecha - 60 and s.fecha           -- @ventana_60
        and c.created_at < s.created_at
    );
  return v_n;
end;
$$;
-- <<< autos_que_volvieron

-- >>> autos_que_volvieron_plataforma
create or replace function autos_que_volvieron_plataforma(p_desde date, p_hasta date)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_n integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve los autos que volvieron' using errcode = '42501';
  end if;

  select count(distinct s.vehiculo_id)::integer into v_n
  from services s
  where not s.anulado
    and s.importado_de is null
    and s.fecha between p_desde and p_hasta
    and exists (
      select 1 from contactos c
      where c.vehiculo_id = s.vehiculo_id
        and c.created_at::date between s.fecha - 60 and s.fecha
        and c.created_at < s.created_at
    );
  return v_n;
end;
$$;
-- <<< autos_que_volvieron_plataforma

-- >>> uso_tenant
create or replace function uso_tenant(p_lubricentro_id uuid, p_dias integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := current_date - (greatest(p_dias, 1) - 1);
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve el uso de un tenant' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'dias',       greatest(p_dias, 1),
    'desde',      v_desde,
    'trabajos',   (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.importado_de is null and s.fecha >= v_desde),
    'service',    (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.importado_de is null and s.fecha >= v_desde and s.tipo = 'service'),
    'mecanica',   (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.importado_de is null and s.fecha >= v_desde and s.tipo = 'mecanica'),
    'neumaticos', (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.importado_de is null and s.fecha >= v_desde and s.tipo = 'neumaticos'),
    -- «Disparados»: la fila de contactos registra el clic en WhatsApp.
    'recordatorios', (select count(*) from contactos c
                       where c.lubricentro_id = p_lubricentro_id and c.created_at >= v_desde),
    'escaneos',   (select count(*) from landing_busquedas lb
                    where lb.lubricentro_id = p_lubricentro_id and lb.created_at >= v_desde),
    'autos_volvieron', autos_que_volvieron(p_lubricentro_id, v_desde, current_date)
  );
end;
$$;
-- <<< uso_tenant

-- La pestaña Resumen de la ficha de /fidelli. Los conteos de clientes y
-- vehículos quedan como estaban (ver el encabezado).
-- >>> metricas_tenant
create or replace function metricas_tenant(p_lubricentro_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de un tenant'
      using errcode = '42501';
  end if;

  with flota_anual as (
    -- La flota que pasó por el taller en el último año: el universo del
    -- % de escaneo. Son los autos que tienen la calco en el parasol.
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.importado_de is null
      and s.lubricentro_id = p_lubricentro_id
      and s.fecha >= current_date - interval '12 months'
  )
  select jsonb_build_object(

    'services_mes', (
      select count(*) from services
      where lubricentro_id = p_lubricentro_id
        and not anulado
        and importado_de is null
        and fecha >= date_trunc('month', current_date)),

    'clientes', (
      select count(*) from clientes where lubricentro_id = p_lubricentro_id),

    'vehiculos', (
      select count(*) from vehiculos where lubricentro_id = p_lubricentro_id),

    -- Penetración, no volumen: de los autos que pasaron, cuántos fueron
    -- buscados alguna vez. Mismo criterio que el dashboard del lubri.
    'flota', (select count(*) from flota_anual),
    'escaneados', (
      select count(*) from flota_anual f
      where exists (
        select 1 from landing_busquedas lb
        -- El filtro por tenant acá no es redundante: la patente sola
        -- puede coincidir con la de otro lubricentro.
        where lb.lubricentro_id = p_lubricentro_id
          and lb.patente = f.patente_normalizada
          and lb.created_at >= now() - interval '12 months')),

    'recuperados', coalesce(recuperados_del_mes(p_lubricentro_id), 0),

    'ultimo_service', (
      select jsonb_build_object(
        'creado', s.created_at,
        'fecha', s.fecha,
        'sucursal', suc.nombre)
      from services s
      join sucursales suc on suc.id = s.sucursal_id
      where s.lubricentro_id = p_lubricentro_id
        and not s.anulado
        and s.importado_de is null
      order by s.fecha desc, s.created_at desc
      limit 1)
  )
  into v_resultado;

  return v_resultado;
end;
$$;
-- <<< metricas_tenant

-- Lo que alimenta los snapshots: cerrar_dia() y reconstruir_snapshots()
-- llaman a estas dos, así que no hace falta tocarlas.
-- >>> foto_tenant_del_dia
create or replace function foto_tenant_del_dia(p_fecha date, p_lub lubricentros)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sub  record;
  v_trab integer;
  v_n    integer;
begin
  select s.plan_id, s.periodo, s.descuento_pct
    into v_sub
    from suscripciones s
   where s.lubricentro_id = p_lub.id
   order by s.inicio desc, s.created_at desc
   limit 1;

  select count(*)::integer into v_trab
    from services sv
   where sv.lubricentro_id = p_lub.id
     and not sv.anulado
     and sv.importado_de is null -- @foto_tenant_sin_importado
     and sv.fecha = p_fecha;

  insert into snapshots_tenant_diarios
    (fecha, lubricentro_id, activo, exento, mrr_ars, plan_id, periodo, modulo_pago, trabajos_dia)
  values (
    p_fecha, p_lub.id,
    coalesce(es_activo(p_lub), false),
    coalesce(v_sub.descuento_pct, 0) >= 100,
    coalesce(mrr_de_tenant(p_lub.id), 0),
    v_sub.plan_id, v_sub.periodo,
    coalesce(modulo_es_pago(p_lub.id, 'neumaticos'), false),
    v_trab)
  on conflict (fecha, lubricentro_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
-- <<< foto_tenant_del_dia

-- >>> foto_plataforma_del_dia
create or replace function foto_plataforma_del_dia(p_fecha date, p_tc_venta numeric, p_fuente text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := (p_fecha::timestamp       at time zone 'America/Argentina/Buenos_Aires');
  v_hasta timestamptz := ((p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  insert into snapshots_diarios (
    fecha, tenants_activos, tenants_suspendidos, tenants_exentos, mrr_ars, tc_venta, mrr_usd,
    altas_dia, bajas_dia, trabajos_dia, trabajos_service, trabajos_mecanica, trabajos_neumaticos,
    recordatorios_dia, escaneos_dia, fuente)
  select
    p_fecha,
    count(*) filter (where st.activo)::integer,
    count(*) filter (where not st.activo)::integer,
    count(*) filter (where st.exento)::integer,
    coalesce(sum(st.mrr_ars), 0),
    p_tc_venta,
    case when p_tc_venta > 0 then round(coalesce(sum(st.mrr_ars), 0) / p_tc_venta, 2) end,
    (select count(*) from tenant_eventos e
      where e.tipo = 'alta' and e.ocurrido_at >= v_desde and e.ocurrido_at < v_hasta)::integer,
    (select count(*) from tenant_eventos e
      where e.tipo in ('suspension', 'suspension_reloj')
        and e.ocurrido_at >= v_desde and e.ocurrido_at < v_hasta)::integer,
    (select count(*) from services sv where not sv.anulado and sv.importado_de is null and sv.fecha = p_fecha)::integer,
    (select count(*) from services sv where not sv.anulado and sv.importado_de is null and sv.fecha = p_fecha and sv.tipo = 'service')::integer,
    (select count(*) from services sv where not sv.anulado and sv.importado_de is null and sv.fecha = p_fecha and sv.tipo = 'mecanica')::integer,
    (select count(*) from services sv where not sv.anulado and sv.importado_de is null and sv.fecha = p_fecha and sv.tipo = 'neumaticos')::integer,
    (select count(*) from contactos c where c.created_at >= v_desde and c.created_at < v_hasta)::integer,
    (select count(*) from landing_busquedas b where b.created_at >= v_desde and b.created_at < v_hasta)::integer,
    p_fuente
  from snapshots_tenant_diarios st
  where st.fecha = p_fecha;
end;
$$;
-- <<< foto_plataforma_del_dia


-- ---------- 4 · «A quién llamar»: horizonte de 18 meses ----------
-- La vista entera de 20260822210000, con una condición más en `ultimo`.
create or replace view vista_proximos_service as
with ultimo as (
  select distinct on (s.vehiculo_id)
    s.vehiculo_id,
    s.id            as service_id,
    s.fecha,
    s.kilometros,
    s.prox_service_km,
    s.sucursal_id,
    s.lubricentro_id
  from services s
  where not s.anulado
    and s.tipo = 'service'
    -- El horizonte: un auto cuyo último service fue hace más de 18
    -- meses no está vencido, está perdido. El filtro va acá y NO en
    -- `ritmo`: el último de los services recientes es el último de
    -- todos, y el ritmo se sigue midiendo con la historia entera.
    and s.fecha >= current_date - interval '18 months'
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
ritmo as (
  select
    s.vehiculo_id,
    count(*)                                    as cantidad_services,
    max(s.kilometros) - min(s.kilometros)       as km_recorridos,
    greatest(max(s.fecha) - min(s.fecha), 1)    as dias_transcurridos
  from services s
  where not s.anulado
    and s.tipo = 'service'
  group by s.vehiculo_id
),
calculo as (
  select
    u.lubricentro_id,
    u.vehiculo_id,
    u.service_id           as ultimo_service_id,
    u.fecha                as ultimo_service_fecha,
    u.kilometros           as ultimo_service_km,
    u.prox_service_km,
    u.sucursal_id,
    r.cantidad_services,
    case
      when r.cantidad_services >= 2 and r.km_recorridos > 0
        then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad_services < 2 or r.km_recorridos = 0) as estimacion_inicial
  from ultimo u
  join ritmo r on r.vehiculo_id = u.vehiculo_id
),
proyeccion as (
  select
    c.*,
    greatest(c.prox_service_km - c.ultimo_service_km, 0) as km_faltantes,
    (c.ultimo_service_fecha
      + (greatest(c.prox_service_km - c.ultimo_service_km, 0) / c.km_por_dia)::integer
    )::date as fecha_estimada
  from calculo c
),
clasificado as (
  select
    p.*,
    case
      when p.fecha_estimada < current_date - 15 then 'vencido'::estado_contacto
      when p.fecha_estimada <= current_date + 7 then 'urgente'::estado_contacto
      else 'proximo'::estado_contacto
    end as estado
  from proyeccion p
)
select
  c.lubricentro_id,
  c.vehiculo_id,
  v.patente,
  v.patente_normalizada,
  v.marca,
  v.modelo,
  cl.id            as cliente_id,
  cl.nombre        as cliente_nombre,
  cl.telefono      as cliente_telefono,
  c.ultimo_service_id,
  c.ultimo_service_fecha,
  c.ultimo_service_km,
  c.prox_service_km,
  c.km_faltantes,
  c.sucursal_id,
  suc.nombre       as sucursal_nombre,
  c.cantidad_services,
  c.km_por_dia,
  c.estimacion_inicial,
  c.fecha_estimada,
  (c.fecha_estimada - current_date) as dias_hasta,
  c.estado,
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = c.estado
      and co.created_at > c.ultimo_service_fecha
  ) as contactado
from clasificado c
join vehiculos v on v.id = c.vehiculo_id
join clientes cl on cl.id = v.cliente_id
join sucursales suc on suc.id = c.sucursal_id
where c.fecha_estimada <= current_date + 30;

-- El replace de arriba borró esta opción. Sin ella, un owner ve los
-- datos de todos los lubricentros. Se repone SIEMPRE (regla 4).
alter view vista_proximos_service set (security_invoker = on);

comment on view vista_proximos_service is
  'Estado por km/día real del vehículo, SOLO sobre tipo service: una mecánica posterior no desplaza al último service ni altera el ritmo. Default 40 km/día con un solo service. Umbrales 7/30/15. Horizonte de 18 meses: un auto cuyo último service es más viejo no entra.';
