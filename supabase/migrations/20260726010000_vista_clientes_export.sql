-- ============================================================
-- Fidelli Motors · vista_clientes crece para la exportación
--
-- El export a Excel necesita, por cliente, tres datos que la vista no
-- tenía: las patentes COMO SE LEEN (la columna `patentes` existente es
-- de búsqueda: normalizada y separada por espacios), y el kilometraje y
-- próximo service del último service del cliente — el del service más
-- reciente entre todos sus vehículos, no un max() suelto por columna
-- que podría mezclar dos services distintos.
--
-- Se resuelve acá y no en el front por la misma razón de siempre: con
-- 3.000 clientes, calcularlo afuera es traerse todos los services del
-- tenant para tirar casi todos. El lateral trae UNA fila por cliente.
--
-- OJO, VERIFICADO: create or replace view RESETEA las opciones de la
-- vista — el security_invoker que la migración original había activado
-- desaparece con el replace, y la vista vuelve a correr con los
-- permisos de postgres, saltando el RLS de tenant. Es exactamente el
-- leak que arregló 20260724190142. Por eso el alter view se repite acá
-- abajo: toda migración que reemplace una vista tiene que reponerlo.
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
  max(s.fecha) filter (where not s.anulado) as ultimo_service_fecha,

  -- ---------- Para el export ----------
  -- Las patentes como las lee una persona, separadas por coma.
  coalesce(string_agg(distinct upper(v.patente), ', '), '') as patentes_lista,
  -- El km y el próximo service del MISMO service: el último del cliente.
  ult.kilometros      as ultimo_service_km,
  ult.prox_service_km as ultimo_prox_service_km

from clientes c
left join vehiculos v on v.cliente_id = c.id
left join services  s on s.vehiculo_id = v.id
left join lateral (
  select s2.kilometros, s2.prox_service_km
  from services s2
  join vehiculos v2 on v2.id = s2.vehiculo_id
  where v2.cliente_id = c.id and not s2.anulado
  order by s2.fecha desc, s2.created_at desc
  limit 1
) ult on true
group by c.id, ult.kilometros, ult.prox_service_km;

-- El replace de arriba borró esta opción: sin ella la vista corre con
-- los permisos de su dueño y un owner vería los clientes de todos los
-- lubricentros. Se repone SIEMPRE que se reemplaza la vista.
alter view vista_clientes set (security_invoker = on);

comment on view vista_clientes is
  'Listado de clientes con agregados de vehículos y último service, más las columnas del export. security_invoker: respeta el RLS de quien consulta.';
