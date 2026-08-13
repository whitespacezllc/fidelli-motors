-- El sitemap necesita la lista de lubricentros activos, y `anon` no tiene
-- permiso sobre ninguna tabla — esa es la regla de la casa: el público
-- entra solo por funciones. Esta es la puerta MÍNIMA para ese caso: slug y
-- fecha de alta, solo de los activos, nada más. Los dos datos ya son
-- públicos de todos modos: el slug es la URL de la vidriera.
create or replace function public.slugs_publicos()
returns table (slug text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.slug, l.created_at
  from public.lubricentros l
  where l.activo
$$;

comment on function public.slugs_publicos() is
  'Slugs de lubricentros activos, para el sitemap. Expone solo slug y created_at: los dos ya son públicos en /[slug].';

revoke all on function public.slugs_publicos() from public;
grant execute on function public.slugs_publicos() to anon, authenticated;
