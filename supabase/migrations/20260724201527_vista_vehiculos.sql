-- ============================================================
-- Fidelli Motors · Vista de vehículos
--
-- La sección de vehículos de la ficha del cliente muestra, por auto,
-- cuántos services tiene y cuándo fue el último. Mismos agregados que
-- vista_clientes y el mismo motivo para resolverlos en Postgres: los
-- agregados de PostgREST están deshabilitados (PGRST123), así que sin la
-- vista habría que traerse todos los services de cada vehículo para
-- contarlos en memoria — un N+1 disfrazado de una sola consulta.
--
-- security_invoker desde el arranque: sin eso la vista correría con los
-- permisos de su dueño y saltearía las policies de vehiculos y services.
-- ============================================================

create or replace view vista_vehiculos as
select
  v.id,
  v.lubricentro_id,
  v.cliente_id,
  v.patente,
  v.patente_normalizada,
  v.marca,
  v.modelo,
  v.anio,
  v.created_at,
  -- Los anulados no cuentan como visita, igual que en vista_clientes.
  count(s.id) filter (where not s.anulado)::integer as cantidad_services,
  max(s.fecha) filter (where not s.anulado) as ultimo_service_fecha
from vehiculos v
left join services s on s.vehiculo_id = v.id
group by v.id;

alter view vista_vehiculos set (security_invoker = on);

grant select on vista_vehiculos to authenticated;

comment on view vista_vehiculos is
  'Vehículos con cantidad de services y fecha del último. security_invoker: respeta el RLS de quien consulta.';

-- ============================================================
-- patente_normalizada: default para que el tipo generado sea honesto
--
-- La columna es NOT NULL y la llena el trigger vehiculos_normalizar_patente,
-- pero el schema no expresa eso: "supabase gen types" la marca obligatoria
-- en el INSERT y obliga al front a mandarla, que es justo lo que no debe
-- hacer — la normalización vive en la base, no en React.
--
-- Con un default la columna pasa a ser opcional en el tipo y el trigger
-- sigue siendo la única autoridad. El '' no puede quedar guardado nunca:
-- el CHECK patente_formato solo acepta ABC123 o AB123CD, así que si el
-- trigger no corriera, la fila se rechazaría en vez de guardarse vacía.
-- ============================================================

alter table vehiculos alter column patente_normalizada set default '';
