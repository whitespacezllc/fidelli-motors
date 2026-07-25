-- ============================================================
-- get_landing(slug) — el shell de la landing, sin patente
--
-- POR QUÉ EXISTE
-- get_carton() es la única puerta pública, pero pide una patente y, por
-- diseño, registra cada llamada en landing_busquedas. Para pintar la
-- landing ANTES de que el cliente busque nada haría falta llamarla con
-- patente vacía: cada visita dejaría una fila con patente '' y
-- encontrada = false. Esa tabla es la captura de leads del lubricentro
-- ("el vacío convertido en lead"): ensuciarla con una fila por page view
-- la vuelve inservible. Verificado en local: get_carton('demo','')
-- devuelve el branding y escribe la fila basura.
--
-- POSTURA DE SEGURIDAD — es una función DEFINER, hay que poder defenderla
--   · DEFINER porque anon no tiene privilegios sobre ninguna tabla del
--     schema, y así debe seguir. Es el mismo motivo que get_carton.
--   · STABLE, no volatile: no escribe. No hay forma de usarla para
--     inflar landing_busquedas ni ninguna otra tabla.
--   · Recibe solo el slug, que ya es público: está impreso en la calco
--     del parasol y en la URL. No amplía lo que un desconocido puede
--     enumerar más allá de visitar la página.
--   · Devuelve exactamente lo que la landing muestra a cualquiera que
--     escanee el QR: nombre, logo, color, datos de contacto y el premio
--     vigente. Ni vehículos, ni clientes, ni services, ni datos del
--     titular. Cero PII.
--   · Filtra por l.activo: un lubricentro dado de baja es indistinguible
--     de uno que no existe.
--   · search_path fijo en public, como el resto de las DEFINER.
--   · El execute a PUBLIC ya no se hereda (migración
--     20260724221336_revocar_execute_de_public), así que el grant a anon
--     es la única puerta y queda explícito.
-- ============================================================

create or replace function get_landing(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nombre', l.nombre,
    'logo_url', c.logo_url,
    'color_primario', coalesce(c.color_primario, '#0A0A0A'),
    'datos_contacto', coalesce(c.datos_contacto, '{}'::jsonb),
    -- Un solo premio activo por lubricentro en el MVP, pero se ordena
    -- igual para que la elección sea determinista si alguna vez hay dos.
    'premio', (
      select jsonb_build_object(
        'meta_services', p.meta_services,
        'descripcion', p.descripcion
      )
      from premios p
      where p.lubricentro_id = l.id and p.activo
      order by p.created_at desc
      limit 1
    )
  )
  from lubricentros l
  left join config_experiencia c on c.lubricentro_id = l.id
  where l.slug = p_slug and l.activo;
$$;

comment on function get_landing is
  'Shell público de la landing: marca y contacto del lubri, sin patente y sin escribir. Complementa get_carton, que sí registra la búsqueda.';

-- La segunda —y última— puerta del anónimo.
grant execute on function get_landing(text) to anon;
