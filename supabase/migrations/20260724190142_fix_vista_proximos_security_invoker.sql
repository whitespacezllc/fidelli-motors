-- ============================================================
-- Fix: vista_proximos_service filtraba datos de otros lubricentros
--
-- Una vista de Postgres se ejecuta, por defecto, con los permisos de su
-- dueño (postgres), no con los de quien la consulta. Como postgres es
-- superusuario, las policies de RLS de services, vehiculos y clientes NO
-- se evaluaban al leer la vista: cualquier owner autenticado veía las
-- filas de TODOS los tenants, aunque consultando las tablas directamente
-- viera solo las suyas.
--
-- Reproducido en local: con dos lubricentros cargados, el owner del demo
-- veía 12 clientes en la tabla (correcto) pero 13 filas en la vista, una
-- de ellas de otro lubricentro.
--
-- security_invoker hace que la vista corra con los permisos de quien
-- consulta, con lo que las policies vuelven a aplicarse. Requiere PG 15+.
-- ============================================================

alter view vista_proximos_service set (security_invoker = on);

comment on view vista_proximos_service is
  'Estado por km/día real. Ritmo < 1 km/día se considera no medible → default 40. Umbrales 7/30/15. security_invoker: respeta el RLS de quien consulta.';
