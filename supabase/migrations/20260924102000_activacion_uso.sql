-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 3 · activación, autos que volvieron, uso de la ficha,
-- y las dos redefiniciones permitidas del bloque 2
--
--   · `activacion_tenant()` / `activacion_por_mes()` — docs/METRICAS.md § 1
--     «Activación»: 20 o más trabajos en los 7 días desde el alta, por
--     `services.created_at` contra `lubricentros.created_at`. El trabajo 20
--     del día 7 activa; el del día 8 no.
--   · `autos_que_volvieron()` / `autos_que_volvieron_plataforma()` — un
--     trabajo sobre un vehículo con un recordatorio (fila de `contactos`)
--     en los 60 días previos. Reemplaza en el ADMIN a recuperados_del_mes()
--     (30 días), que no se toca porque la usa el panel del tenant.
--   · `uso_tenant()` — el bloque «Uso · últimos 30 días» de la ficha.
--   · `indicadores_tenants()` suma `activado` y `dias_alta` (el chip «No
--     activado» del listado). Cambia el tipo de retorno: drop + create.
--   · `metricas_plataforma()` devuelve cada punto con los tres tipos además
--     del total (el Pulso apilado).
--
-- ⚠ scripts/regresion-metricas.sh muerde `indicadores_tenants` y
-- `metricas_plataforma` DE ESTE ARCHIVO desde el bloque 3 (antes, de
-- 20260923100000): las marcas `@trabajos_30`, `@mrr_indicador`,
-- `@trabajos_mes` y `@serie_todos` siguen acá con la misma forma.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Activación
-- ════════════════════════════════════════════════════════════════════

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

comment on function activacion_tenant is
  'La activación de un tenant (docs/METRICAS.md § 1): trabajos de cualquier tipo, no anulados, creados en los 7 días desde lubricentros.created_at; activado = 20 o más. `dia` y `en_curso` para decir «en curso, día 3 de 7». Solo superadmin.';

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


-- ════════════════════════════════════════════════════════════════════
-- 2 · Autos que volvieron
-- ════════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════════
-- 3 · El uso de un tenant, para la ficha
-- ════════════════════════════════════════════════════════════════════

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
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.fecha >= v_desde),
    'service',    (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.fecha >= v_desde and s.tipo = 'service'),
    'mecanica',   (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.fecha >= v_desde and s.tipo = 'mecanica'),
    'neumaticos', (select count(*) from services s
                    where s.lubricentro_id = p_lubricentro_id and not s.anulado and s.fecha >= v_desde and s.tipo = 'neumaticos'),
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


-- ════════════════════════════════════════════════════════════════════
-- 4 · indicadores_tenants(): + activado, dias_alta
-- ════════════════════════════════════════════════════════════════════
-- Cambia el tipo de retorno, así que no alcanza con `create or replace`.

drop function if exists indicadores_tenants();

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
    group by sv.lubricentro_id
  ),
  primera_semana as (
    select sv.lubricentro_id, count(*)::integer as n
    from services sv
    join lubricentros l on l.id = sv.lubricentro_id
    where not sv.anulado
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

comment on function indicadores_tenants is
  'Por tenant, lo que el listado de /fidelli muestra y listado_lubricentros() no trae: es_activo() (la definición única), exento, el estado del reloj, mrr_de_tenant() en ARS, si el módulo gomería se cobra (modulo_es_pago), trabajos de los últimos 30 días (cualquier tipo), último trabajo, y desde el bloque 3 la activación (20 trabajos en la primera semana) y los días de alta. Una llamada para todas las filas. Solo superadmin (42501 si no).';

revoke all on function indicadores_tenants() from public, anon;
grant execute on function indicadores_tenants() to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 5 · metricas_plataforma(): la serie por tipo
-- ════════════════════════════════════════════════════════════════════
-- Cada punto trae `cantidad` (el total, como siempre) y `service`,
-- `mecanica`, `neumaticos`. La suma de los tres es `cantidad` en cada
-- punto; el Pulso apilado los dibuja en ese orden.

-- >>> metricas_plataforma
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_primero date;
  v_series  jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función filtra por tipo:
  -- el desglose es además del total, no en vez.
  select min(fecha) into v_primero
  from services where not anulado;

  if v_primero is null then
    v_series := jsonb_build_object(
      'dia', '[]'::jsonb, 'semana', '[]'::jsonb, 'mes', '[]'::jsonb);
  else
    select jsonb_object_agg(g.clave, serie.datos)
      into v_series
      from (values
        ('dia',    'day',   interval '1 day',   30),
        ('semana', 'week',  interval '1 week',  12),
        ('mes',    'month', interval '1 month', 12)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'inicio',     p.inicio,
              'cantidad',   t.total,
              'service',    t.svc,
              'mecanica',   t.mec,
              'neumaticos', t.neu)
            order by p.inicio)
          from (
            select generate_series(
              greatest(
                (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                date_trunc(g.unidad, v_primero)::date
              ),
              date_trunc(g.unidad, current_date)::date,
              g.paso)::date as inicio
          ) p
          cross join lateral (
            select
              count(*)::integer                                       as total,
              count(*) filter (where s.tipo = 'service')::integer     as svc,
              count(*) filter (where s.tipo = 'mecanica')::integer    as mec,
              count(*) filter (where s.tipo = 'neumaticos')::integer  as neu
            from services s
            where not s.anulado                                        -- @serie_todos
              and s.fecha >= p.inicio
              and s.fecha < (p.inicio + g.paso)::date
          ) t
        ), '[]'::jsonb) as datos
      ) serie;
  end if;

  return jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and fecha >= date_trunc('month', current_date)),
    'acumulado', (select count(*) from services where not anulado),
    'primer_trabajo', v_primero,
    'series', v_series
  );
end;
$$;
-- <<< metricas_plataforma

comment on function metricas_plataforma is
  'El pulso de la plataforma para /fidelli: trabajos del mes, acumulado histórico y las tres series (día × 30, semana × 12, mes × 12), cada punto con el total (`cantidad`) y el desglose `service` / `mecanica` / `neumaticos` (bloque MÉTRICAS 3). Cuenta trabajos de cualquier tipo. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 6 · Permisos
-- ════════════════════════════════════════════════════════════════════

revoke all on function activacion_tenant(uuid) from public, anon;
revoke all on function activacion_por_mes(date, date) from public, anon;
revoke all on function autos_que_volvieron(uuid, date, date) from public, anon;
revoke all on function autos_que_volvieron_plataforma(date, date) from public, anon;
revoke all on function uso_tenant(uuid, integer) from public, anon;

grant execute on function activacion_tenant(uuid)                     to authenticated, service_role;
grant execute on function activacion_por_mes(date, date)              to authenticated, service_role;
grant execute on function autos_que_volvieron(uuid, date, date)       to authenticated, service_role;
grant execute on function autos_que_volvieron_plataforma(date, date)  to authenticated, service_role;
grant execute on function uso_tenant(uuid, integer)                   to authenticated, service_role;
