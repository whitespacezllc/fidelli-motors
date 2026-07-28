-- ============================================================
-- Fidelli Motors · Lo que el owner puede editar de su cuenta
--
-- Dos escrituras nuevas para /panel/cuenta, y las dos con el mismo
-- problema de fondo: las policies de hoy no se las permiten, y abrirlas
-- por policy abriría de más.
--
--   · usuarios: la única policy del owner es de SELECT sobre su fila.
--   · lubricentros: sólo el superadmin puede escribir (lubricentros_admin).
--
-- POR QUÉ FUNCIONES DEFINER Y NO POLICIES — la decisión que había que
-- contar:
--
-- Una policy de UPDATE es de FILA, no de columna: si le doy al owner
-- update sobre su lubricentro, puede cambiar el slug (rompe los QR
-- impresos), `activo` (se reactiva solo si lo suspendimos) y
-- calcos_entregadas. Lo que hay que restringir es la COLUMNA.
--
-- La otra vía serían privilegios por columna (revoke update + grant
-- update(nombre)), pero acá chocan con la arquitectura: el superadmin usa
-- el MISMO rol de Postgres que el owner (authenticated), así que
-- restringir columnas para uno se las restringe al otro — y
-- actualizar_lubricentro(), que es security invoker, dejaría de poder
-- tocar slug y calcos desde el panel de administración.
--
-- La función security definer angosta no tiene ninguno de los dos
-- problemas: toca UNA columna, de UNA fila que sale de auth.uid() /
-- mi_lubricentro_id() — no de un parámetro—, y no deja superficie para
-- nada más. El slug, `activo` y las calcos quedan tan inalcanzables como
-- hoy: la prueba es que un PATCH directo a la tabla sigue rechazado.
-- ============================================================


-- ---------- 1. El nombre del usuario ----------
create or replace function actualizar_mi_nombre(p_nombre text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'nombre_corto';
  end if;

  -- La fila sale de auth.uid(): no hay forma de editar a otro usuario.
  update usuarios
  set nombre = trim(p_nombre)
  where id = auth.uid();

  if not found then
    raise exception 'sin_sesion';
  end if;
end;
$$;

comment on function actualizar_mi_nombre is
  'El usuario edita SU nombre, y nada más. Definer porque usuarios no tiene policy de update para el owner, y una policy no puede restringir columnas.';

revoke execute on function actualizar_mi_nombre(text) from public;
revoke execute on function actualizar_mi_nombre(text) from anon;
grant execute on function actualizar_mi_nombre(text) to authenticated;


-- ---------- 2. El nombre del lubricentro (la marca) ----------
create or replace function actualizar_nombre_lubricentro(p_nombre text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lubricentro uuid := mi_lubricentro_id();
begin
  -- Un superadmin no tiene tenant: para editar un lubricentro ajeno está
  -- actualizar_lubricentro(), con su propio guard.
  if v_lubricentro is null then
    raise exception 'sin_lubricentro';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'nombre_corto';
  end if;

  update lubricentros
  set nombre = trim(p_nombre)
  where id = v_lubricentro;

  if not found then
    raise exception 'sin_permiso_lubricentro';
  end if;
end;
$$;

comment on function actualizar_nombre_lubricentro is
  'El owner edita el NOMBRE de su lubricentro — su marca en la landing. Ni el slug, ni activo, ni las calcos: la función solo toca esa columna y la fila sale de mi_lubricentro_id().';

revoke execute on function actualizar_nombre_lubricentro(text) from public;
revoke execute on function actualizar_nombre_lubricentro(text) from anon;
grant execute on function actualizar_nombre_lubricentro(text) to authenticated;
