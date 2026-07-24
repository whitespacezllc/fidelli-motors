-- ============================================================
-- Fix: división por cero en vista_proximos_service
-- Un ritmo medido por debajo de 1 km/día es implausible (tipeo de
-- kilometraje o auto guardado) y al redondear a 2 decimales puede dar
-- 0.00, rompiendo la división siguiente y con ella TODA la vista.
-- Se trata como ritmo no medible: default 40 km/día, marcado como
-- estimación inicial — mismo criterio que un vehículo con un solo service.
-- ============================================================

create or replace view vista_proximos_service as
with ultimo as (
  select distinct on (s.vehiculo_id)
    s.vehiculo_id, s.id as service_id, s.fecha, s.kilometros,
    s.prox_service_km, s.sucursal_id, s.lubricentro_id
  from services s
  where not s.anulado
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
  group by s.vehiculo_id
),
calculo as (
  select
    u.lubricentro_id, u.vehiculo_id,
    u.service_id as ultimo_service_id,
    u.fecha      as ultimo_service_fecha,
    u.kilometros as ultimo_service_km,
    u.prox_service_km, u.sucursal_id,
    r.cantidad_services,
    -- Ritmo medible = 2+ services y al menos 1 km/día
    case
      when r.cantidad_services >= 2
       and r.km_recorridos > 0
       and (r.km_recorridos::numeric / r.dias_transcurridos) >= 1
      then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad_services < 2
     or r.km_recorridos = 0
     or (r.km_recorridos::numeric / r.dias_transcurridos) < 1) as estimacion_inicial
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
  c.lubricentro_id, c.vehiculo_id,
  v.patente, v.patente_normalizada, v.marca, v.modelo,
  cl.id as cliente_id, cl.nombre as cliente_nombre, cl.telefono as cliente_telefono,
  c.ultimo_service_id, c.ultimo_service_fecha, c.ultimo_service_km,
  c.prox_service_km, c.km_faltantes,
  c.sucursal_id, suc.nombre as sucursal_nombre,
  c.cantidad_services, c.km_por_dia, c.estimacion_inicial,
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

comment on view vista_proximos_service is
  'Estado por km/día real. Ritmo < 1 km/día se considera no medible → default 40. Umbrales 7/30/15.';