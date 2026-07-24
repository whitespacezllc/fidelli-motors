-- ============================================================
-- Fidelli Motors · Vista de próximos services
-- El corazón del panel de retención
-- Estados: vencido (+15 días) · urgente (≤7) · proximo (≤30)
-- ============================================================

create or replace view vista_proximos_service as
with ultimo as (
  -- El service más reciente de cada vehículo
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
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
ritmo as (
  -- Km por día calculado sobre el historial completo del vehículo
  select
    s.vehiculo_id,
    count(*)                                    as cantidad_services,
    max(s.kilometros) - min(s.kilometros)       as km_recorridos,
    greatest(max(s.fecha) - min(s.fecha), 1)    as dias_transcurridos
  from services s
  where not s.anulado
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
    -- Con un solo service no hay ritmo medible: default 40 km/día (~15.000 km/año)
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

  -- La regla de un contacto por estado: ¿ya se contactó EN ESTE estado,
  -- después del último service? Si cambia de estado, se habilita uno nuevo.
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
-- Solo lo accionable: lo que llega dentro de 30 días o ya venció
where c.fecha_estimada <= current_date + 30;

comment on view vista_proximos_service is
  'Estado por km/día real del vehículo. Default 40 km/día con un solo service. Umbrales 7/30/15.';

-- ---------- Recuperados: la métrica que renueva la suscripción ----------
create or replace function recuperados_del_mes(p_lubricentro_id uuid, p_desde date default null)
returns integer
language sql
stable
as $$
  select count(distinct co.vehiculo_id)::integer
  from contactos co
  where co.lubricentro_id = p_lubricentro_id
    and co.created_at >= coalesce(p_desde, date_trunc('month', current_date))
    and exists (
      select 1 from services s
      where s.vehiculo_id = co.vehiculo_id
        and not s.anulado
        and s.created_at > co.created_at
        and s.created_at <= co.created_at + interval '30 days'
    );
$$;

comment on function recuperados_del_mes is
  'Contactados que registraron un service dentro de los 30 días posteriores.';