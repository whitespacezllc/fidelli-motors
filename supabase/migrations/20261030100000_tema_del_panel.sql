-- ============================================================
-- Fidelli Motors · El modo oscuro del panel: una preferencia del USUARIO
--
-- Lo pidió un tenant: «estaría buenísimo que la plataforma tenga modo
-- oscuro». El modo por defecto sigue siendo el claro; cada usuario lo
-- cambia con un interruptor y la elección lo sigue a cualquier dispositivo
-- donde entre, porque vive en SU fila de `usuarios` y viaja con la sesión
-- (una columna más en el mismo select de `obtenerSesion()`: cero consultas
-- nuevas por request).
--
-- No es `prefers-color-scheme` a propósito, por la misma razón que el tema
-- de la superficie del cliente (regla 7): una preferencia del sistema del
-- celular no es una decisión de la persona, y el mecánico que apagó el
-- modo oscuro del teléfono para leer mejor al sol no quiere que el panel
-- se ponga negro solo a las siete de la tarde.
--
-- Se escribe por una función DEFINER con guarda, calcada de
-- `actualizar_mi_nombre` (20260728051000): `usuarios` no tiene policy de
-- UPDATE para el owner y una policy no puede restringir columnas. La fila
-- sale de auth.uid(): no hay forma de cambiarle el tema a otro. Lo vigila
-- R50; scripts/regresion-tema.sh lo rompe a mano.
-- ============================================================

alter table usuarios
  add column tema text not null default 'claro'
  constraint usuarios_tema_valido check (tema in ('claro', 'oscuro'));

comment on column usuarios.tema is
  'El tema del panel de ESTE usuario: claro (default) u oscuro. Preferencia personal, no del tenant; viaja con la sesión y se escribe solo por fijar_mi_tema().';

-- >>> fijar_mi_tema
create or replace function fijar_mi_tema(p_tema text)
returns void
language plpgsql
volatile
security definer -- @tema-definer
set search_path = public
as $$
begin
  if p_tema is null or p_tema not in ('claro', 'oscuro') then -- @tema-valido
    raise exception 'tema_invalido';
  end if;

  -- La fila sale de auth.uid(): no hay forma de editar a otro usuario.
  update usuarios
  set tema = p_tema
  where id = auth.uid(); -- @tema-propio

  if not found then
    raise exception 'sin_sesion';
  end if;
end;
$$;
-- <<< fijar_mi_tema

comment on function fijar_mi_tema(text) is
  'El usuario elige el tema de SU panel (claro u oscuro), y nada más. Definer porque usuarios no tiene policy de update para el owner; la fila es la de auth.uid().';

revoke execute on function fijar_mi_tema(text) from public, anon;
grant execute on function fijar_mi_tema(text) to authenticated; -- @tema-grant
