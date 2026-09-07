-- ============================================================
-- Fidelli Motors · Slug reservado: `descargas`
--
-- El blog (feat/public-blog) crea public/descargas/, la carpeta de los
-- archivos que se bajan desde los artículos (hoy, la planilla de control
-- de services). Toda carpeta de primer nivel en public/ se sirve desde la
-- raíz y compite con /[slug]: un lubricentro con slug `descargas` tendría
-- su vidriera en /descargas mientras /descargas/planilla-....xlsx sigue
-- sirviendo el archivo. Mismo caso que `assets`, mismo remedio.
--
-- `blog` ya estaba reservado desde 20260812100000 (rutas previsibles de
-- la landing). /blog/feed.xml y /llms-full.txt no necesitan reserva: el
-- slug no admite puntos ni barras.
--
-- Regla de proceso (CLAUDE-landing.md): toda ruta nueva de nivel superior
-- se reserva en el mismo PR que la crea. Y antes de aplicar en producción:
--   select slug from lubricentros where slug_reservado(slug);
-- tiene que dar vacío — `create or replace function` no re-valida el CHECK
-- sobre las filas existentes, por eso el bloque de verificación de abajo.
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
    'contacto', 'blog', 'docs', 'soporte', 'ayuda'
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
