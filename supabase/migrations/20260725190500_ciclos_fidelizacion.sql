-- ============================================================
-- Fidelli Motors · El ciclo de cada vehículo, para la configuración
--
-- La pantalla de fidelización necesita mostrar el impacto de cambiar la
-- meta ANTES de guardarla: "hoy 12 en progreso · 3 con premio; con la
-- meta en 5, 1 con premio". Eso es contar, por vehículo, cuántos services
-- lleva en el ciclo actual — la misma cuenta que hace
-- premio_disponible(), pero para todos los vehículos de una vez en lugar
-- de una llamada por auto.
--
-- La regla no se reimplementa en el front: sale de acá. El front solo
-- compara cada ciclo contra un umbral, que es aritmética, no negocio.
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER (el default). Lee vehiculos, services y canjes con
--     los permisos de quien llama, así que las policies de tenant filtran
--     solo. No recibe lubricentro_id: no hay parámetro que falsear.
--   · STABLE, no escribe.
--   · search_path fijo.
--   · Se revoca de PUBLIC y se concede solo a authenticated: anon no
--     tiene nada que hacer acá.
-- ============================================================

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
    count(s.id) filter (
      -- Mismo criterio que premio_disponible: desde el último canje,
      -- sin contar los anulados.
      where not s.anulado
        and (uc.fecha is null or s.created_at > uc.fecha)
    )::integer
  from vehiculos v
  left join lateral (
    select max(c.created_at) as fecha
    from canjes c
    where c.vehiculo_id = v.id
  ) uc on true
  left join services s on s.vehiculo_id = v.id
  group by v.id;
$$;

comment on function ciclos_fidelizacion is
  'Services del ciclo actual por vehículo del tenant. Misma cuenta que premio_disponible, para toda la flota.';

revoke execute on function ciclos_fidelizacion() from public;
grant execute on function ciclos_fidelizacion() to authenticated;
