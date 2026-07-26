-- ============================================================
-- Fidelli Motors · Storage para los logos de los lubricentros
--
-- POSTURA DE SEGURIDAD, explícita:
--
--   QUIÉN LEE: cualquiera. El bucket es público para lectura porque el
--   logo se muestra en la landing sin sesión — es exactamente tan
--   público como el nombre del lubricentro que acompaña. Acá no vive
--   ningún dato sensible: solo logos.
--
--   QUIÉN ESCRIBE: solo authenticated, y solo en su propia carpeta.
--   El path es <lubricentro_id>/logo.<ext> y las tres policies de
--   escritura (insert, update, delete) exigen que la primera carpeta
--   del path coincida con mi_lubricentro_id() — el helper DEFINER de
--   RLS que resuelve el tenant desde la sesión, no desde un parámetro.
--   Un lubricentro no puede pisar ni borrar el logo de otro: la
--   carpeta ajena simplemente no matchea y storage devuelve 403.
--   anon no tiene ninguna policy de escritura: no puede subir nada.
--
--   LÍMITES DEL BUCKET, en el servidor y no solo en la UI:
--   · 2 MB de tamaño máximo — un logo más pesado arruina la landing
--     en el 4G del cliente.
--   · Solo image/png, image/jpeg y image/webp. SVG NO: un SVG puede
--     contener JavaScript, y no vale la pena el riesgo por un logo.
--     El content-type declarado lo valida el bucket; los bytes reales
--     (magic bytes) los valida el Server Action antes de subir — la
--     extensión no alcanza. Y si alguien igual disfrazara otra cosa de
--     PNG por la API, se sirve con content-type de imagen: el navegador
--     no lo ejecuta como documento.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública: la landing muestra el logo sin sesión.
create policy "logos lectura publica"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Escritura solo en la carpeta propia. La primera carpeta del path ES
-- el tenant, y la dice la sesión — no hay parámetro que falsear.
create policy "logos subida propia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text
  );

create policy "logos reemplazo propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text
  );

create policy "logos borrado propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text
  );
