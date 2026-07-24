-- ============================================================
-- Fidelli Motors · Vista del listado de clientes
--
-- El listado del panel necesita, por cliente: cuántos vehículos tiene y
-- cuándo fue el último service de cualquiera de ellos ("hace rato que no
-- viene"). Eso son agregados sobre dos tablas.
--
-- PostgREST tiene los agregados deshabilitados (PGRST123), así que sin
-- esta vista la pantalla tendría que traerse TODOS los services del
-- lubricentro para calcular un max() por cliente en memoria. Con 8.000
-- services eso es descargar 8.000 fechas para mostrar 800 renglones.
-- Acá el agregado lo hace Postgres y viaja una fila por cliente.
--
-- Mismo patrón que vista_proximos_service: un read model por pantalla.
-- ============================================================

create or replace view vista_clientes as
select
  c.id,
  c.lubricentro_id,
  c.nombre,
  c.telefono,
  c.email,
  c.created_at,

  -- Columnas de búsqueda: el buscador del panel es uno solo y pega contra
  -- los tres campos. El nombre va sin tildes ni mayúsculas (mismo criterio
  -- que el índice clientes_nombre_busqueda_idx) y las patentes ya vienen
  -- normalizadas de la tabla, concatenadas para un like directo.
  lower(fm_unaccent(c.nombre)) as nombre_busqueda,
  coalesce(string_agg(distinct v.patente_normalizada, ' '), '') as patentes,

  count(distinct v.id)::integer as cantidad_vehiculos,
  -- Los anulados no cuentan como visita.
  max(s.fecha) filter (where not s.anulado) as ultimo_service_fecha

from clientes c
left join vehiculos v on v.cliente_id = c.id
left join services  s on s.vehiculo_id = v.id
group by c.id;

-- Sin esto la vista correría con los permisos de su dueño (postgres) y
-- saltearía las policies de clientes, vehiculos y services: un owner
-- vería los clientes de todos los lubricentros.
alter view vista_clientes set (security_invoker = on);

grant select on vista_clientes to authenticated;

comment on view vista_clientes is
  'Listado de clientes con cantidad de vehículos y fecha del último service. security_invoker: respeta el RLS de quien consulta.';
