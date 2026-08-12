-- ============================================================
-- Fidelli Motors · Slugs reservados — las rutas de la landing comercial
--
-- POR QUÉ AHORA, ANTES DE ESCRIBIR LA LANDING
-- El costo de reservar una palabra crece con la cantidad de tenants: hoy,
-- con dos, es gratis; con doscientos es una migración con víctimas — hay
-- que renombrar el slug de alguien que ya tiene calcos impresas con su QR.
-- Por eso se reserva de más ahora y no después.
--
-- QUÉ SE AGREGA
--   · Las rutas que va a crear la landing comercial: terminos, privacidad.
--   · Las que podría crear (precio/precios, preguntas, contacto, blog,
--     docs, soporte, ayuda) y las variantes obvias del acceso (ingresar).
--   · `recuperar`, que NO es de la landing: es una ruta que YA EXISTE en
--     producción (app/recuperar) y nunca se había reservado. Un lubricentro
--     con slug `recuperar` rompía su propia landing contra la pantalla de
--     recuperación de contraseña.
--   · `assets`, por el mismo motivo pero por otra puerta: TODA carpeta de
--     primer nivel en public/ crea una ruta que compite con /[slug]. Hoy
--     hay una sola, public/assets, y está en uso (el logo de la marca y la
--     foto del login). Un lubricentro con ese slug tendría su landing en
--     /assets mientras /assets/logos/... sigue sirviendo archivos
--     estáticos: el mismo directorio partido entre dos dueños.
--
-- LO QUE NO HACE FALTA RESERVAR, y por qué
-- El slug valida contra '^[a-z0-9]+(-[a-z0-9]+)*$', que no admite puntos.
-- Por eso ningún archivo con extensión puede colisionar: /favicon.ico,
-- /icon.png, /opengraph-image.png y un futuro /robots.txt o /sitemap.xml
-- están fuera del espacio de slugs por construcción. Tampoco /_next, que
-- empieza con guión bajo. No se reservan: ensuciarían la lista sin cerrar
-- ningún agujero.
--
-- LA REGLA QUE QUEDA PARA LA PRÓXIMA VEZ
-- Las rutas de nivel superior salen de TRES lugares, no de uno:
--   1. las carpetas de app/ (incluidas las que viven dentro de un route
--      group como app/(cliente)/, que no aparece en la URL),
--   2. las carpetas de primer nivel de public/,
--   3. los route handlers.
-- Mirar solo app/*/ deja afuera las otras dos. Así se había escapado
-- `assets`.
--
-- EL DETALLE QUE PUEDE MORDER
-- `create or replace function` NO re-valida el CHECK sobre las filas que ya
-- existen: Postgres no re-chequea una constraint cuando cambia la función
-- que usa. Una fila que viole la lista nueva quedaría inconsistente en
-- silencio y explotaría recién en su próximo UPDATE, meses después y lejos
-- de la causa.
--
-- Por eso el bloque de verificación de abajo: si algún slug cae en la lista
-- nueva, la migración FALLA acá, ruidosa y sin haber tocado nada. Se
-- verificó contra producción antes de escribir esto (slugs `brothers-oil` y
-- `demo`, ninguno colisiona), pero la comprobación va igual — el día que
-- esto corra en un entorno que no miramos, tiene que avisar.
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
    'assets',
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
