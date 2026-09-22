-- ============================================================
-- Fidelli Motors · Slugs reservados: las páginas legales
--
-- El sprint de políticas (22/09/2026) crea /terminos y /privacidad, las dos
-- páginas legales de la superficie comercial. `terminos` y `privacidad` YA
-- estaban reservados desde 20260812100000 —se reservaron de más, antes de
-- que existieran, que es exactamente la regla—; lo que faltaba son las dos
-- variantes con las que alguien las buscaría o las que un lubricentro
-- podría tomar creyendo que están libres: `legal` y `condiciones`.
--
-- Mismo patrón que 20260812100000 y 20260907120000: se reemplaza la
-- función entera con la lista completa, y el bloque de verificación de
-- abajo corta la migración si algún slug existente cae en la lista nueva
-- (`create or replace function` no re-valida el CHECK sobre las filas que
-- ya están). Antes de aplicar en producción:
--   select slug from lubricentros where slug_reservado(slug);
-- tiene que dar vacío.
--
-- Regla de proceso (CLAUDE-landing.md): toda ruta nueva de nivel superior
-- se reserva en el mismo PR que la crea. Lo vigila R27a.
-- ============================================================

create or replace function slug_reservado(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  -- Chocarían con rutas del producto: fidellimotors.app/[slug]
  select lower(coalesce(p_slug, '')) = any (array[
    -- Superficies y rutas que ya existen
    'admin', 'api', 'auth', 'login', 'app', 'www', 'dashboard',
    'panel', 'fidelli', 'recuperar',
    -- Carpetas de public/: se sirven desde la raíz y compiten con /[slug]
    'assets', 'descargas',
    -- Accesos alternativos al login
    'ingresar',
    -- Rutas de la landing comercial, actuales y previsibles
    'precio', 'precios', 'preguntas', 'terminos', 'privacidad',
    'contacto', 'blog', 'docs', 'soporte', 'ayuda',
    -- Las páginas legales (22/09/2026) y sus variantes
    'legal', 'condiciones'
  ]);
$$;

comment on function slug_reservado is
  'Rutas del producto que ningún lubricentro puede quedarse. Fuente única: la usan la constraint de lubricentros y slug_estado(). Toda ruta nueva de nivel superior se agrega acá en el mismo PR que la crea.';

-- La red de seguridad: si la lista nueva dejara alguna fila fuera de la
-- constraint, esto corta la migración antes de que quede inconsistente.
do $$
declare
  v_colisiones text;
begin
  select string_agg(slug, ', ' order by slug) into v_colisiones
  from lubricentros
  where slug_reservado(slug);

  if v_colisiones is not null then
    raise exception
      'Hay lubricentros con un slug que la lista nueva reserva: %. '
      'Renombralos antes de aplicar esta migración — si no, la constraint '
      'queda inconsistente y explota en su próximo UPDATE.', v_colisiones;
  end if;
end $$;
