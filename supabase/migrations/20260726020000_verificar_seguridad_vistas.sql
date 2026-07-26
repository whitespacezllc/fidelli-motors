-- ============================================================
-- Fidelli Motors · Chequeo ejecutable del aislamiento por vistas
--
-- POR QUÉ EXISTE
-- Una vista sin `security_invoker` corre con los permisos de su dueño
-- (postgres) y NO evalúa las policies de las tablas que consulta: un
-- owner ve los datos de todos los lubricentros. Ya pasó dos veces:
--   · 20260724190142 — vista_proximos_service nació sin la opción.
--   · 20260726010000 — vista_clientes la PERDIÓ, porque
--     `create or replace view` resetea las reloptions de la vista.
--
-- El segundo caso es el peligroso: el diff se ve inofensivo —agrega dos
-- columnas— y el agujero se abre solo. Documentarlo no alcanza; hace
-- falta que algo falle.
--
-- CÓMO SE USA
--   select * from verificar_seguridad_vistas();
-- Sin filas = está bien. Con filas = hay un agujero, y cada fila trae el
-- SQL exacto para taparlo.
--
-- El chequeo corre solo en cada `supabase db reset`, desde
-- supabase/verificaciones.sql (ver config.toml → db.seed.sql_paths).
-- Ese archivo se ejecuta DESPUÉS de todas las migraciones, que es la
-- única posición desde la que se puede ver el estado final del schema.
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER (el default) y STABLE: solo lee catálogos.
--   · No recibe parámetros.
--   · search_path fijo.
--   · Se revoca de PUBLIC, de anon y de authenticated. Los dos últimos
--     hacen falta explícitamente: Supabase concede execute a esos roles
--     por default privileges, así que sin esto la función quedaría
--     expuesta como RPC de la API. No oculta nada —los catálogos de
--     Postgres los lee cualquiera igual— pero es una herramienta de
--     desarrollo y no tiene por qué estar en la superficie pública.
-- ============================================================

create or replace function verificar_seguridad_vistas()
returns table (
  vista   text,
  motivo  text,
  arreglo text
)
language sql
stable
set search_path = public
as $$
  select
    c.relname::text,
    case c.relkind
      when 'm' then
        'vista materializada: no soporta security_invoker y no evalúa RLS'
      else
        'sin security_invoker: corre con los permisos del dueño y saltea las policies'
    end,
    case c.relkind
      when 'm' then
        'revisar si debe existir; una matview de public expone datos de todos los tenants'
      else
        format('alter view %I set (security_invoker = on);', c.relname)
    end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('v', 'm')
    -- Las vistas que trae una extensión no son nuestras y no se tocan.
    and not exists (
      select 1 from pg_depend d
      where d.objid = c.oid and d.deptype = 'e'
    )
    and (
      c.relkind = 'm'
      -- La opción se guarda como `on` o como `true` según cómo se haya
      -- escrito el alter: las dos valen, y el chequeo acepta las dos.
      or coalesce(c.reloptions, '{}') operator(pg_catalog.&&)
         array['security_invoker=on', 'security_invoker=true'] = false
    )
  order by c.relname;
$$;

comment on function verificar_seguridad_vistas is
  'Devuelve las vistas de public que saltean RLS. Sin filas = está bien. Se corre en cada db reset desde supabase/verificaciones.sql.';

revoke execute on function verificar_seguridad_vistas() from public;
revoke execute on function verificar_seguridad_vistas() from anon;
revoke execute on function verificar_seguridad_vistas() from authenticated;
