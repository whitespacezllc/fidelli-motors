-- ============================================================
-- Fidelli Motors · Adjuntos en cualquier trabajo, y el tope del slug
--
-- Un taller de cajas pidió poder adjuntarle a un trabajo el PDF del
-- escaneo del vehículo. Sirve para cualquier taller y para cualquier tipo
-- de trabajo: un PDF o una foto del diagnóstico, colgados del trabajo,
-- que el taller decide —archivo por archivo— si le muestra al cliente.
--
-- ────────────────────────────────────────────────────────────
-- ADJUNTAR NO ES EDITAR EL CARTÓN
--
-- El cartón se fija al vencer su plazo de edición y nadie lo toca: es lo
-- que lo hace confiable. Un adjunto no es parte del cartón —no está en el
-- papel, no cambia lo que dice que se hizo—, así que ninguna policy de
-- esta tabla mira `plazo_edicion()`: se adjunta, se prende, se apaga y se
-- quita en cualquier momento, también en un trabajo fijado hace un año.
-- Por lo mismo, QUITAR un adjunto es la excepción escrita a «acá no se
-- borra nada»: lo que se borra es un archivo, no el registro del trabajo.
--
-- ────────────────────────────────────────────────────────────
-- POSTURA DE SEGURIDAD, explícita
--
--   QUIÉN LEE: el owner, los adjuntos y los archivos de SU tenant; el
--   superadmin, todo. `anon` NO LEE NADA: ni la tabla (sin grants) ni el
--   bucket (sin policy).
--
--   CÓMO LLEGA EL CLIENTE: por una sola puerta. get_carton() le lista, de
--   cada trabajo, los adjuntos marcados «Mostrar al cliente» —el id, el
--   nombre, el formato y la fecha; NUNCA la ruta del archivo—, y el
--   enlace es la ruta GET /[slug]/[patente]/adjunto/[id], que le pregunta
--   a adjunto_publico() si ese adjunto existe, está visible, su trabajo no
--   está anulado y es de ESE vehículo de ESE tenant. Recién entonces firma
--   una URL de 60 segundos y redirige. Sin esa verificación, 404. En el
--   HTML no hay nunca una URL firmada.
--
--   «MOSTRAR AL CLIENTE» ESTÁ APAGADO POR DEFECTO, y lo garantiza la base:
--   la columna no se puede mandar en el alta (el grant de INSERT no la
--   incluye). Un adjunto nace oculto y alguien lo prende.
--
--   LO ÚNICO QUE SE EDITA es esa columna (el grant de UPDATE es de una).
--
--   EL TOPE, 3 por trabajo, es un trigger: un CHECK no cuenta filas.
--   2 MB por archivo, PDF / JPEG / PNG: en el bucket y en la tabla.
--
-- ────────────────────────────────────────────────────────────
-- LO QUE SE REDEFINE, Y DE DÓNDE SE PARTE
--
-- get_carton va COPIADA TEXTUAL de su última definición vigente, que es
-- la del service de caja (20261004120100) —no la de 20260926200000—, con
-- la clave `adjuntos` AGREGADA en cada entrada y ninguna línea quitada ni
-- cambiada: `prox_caja_km` sigue ahí (R43f lo comprueba). Los marcadores
-- `-- >>>` y `-- @` se conservan; los scripts que la muerden apuntan desde
-- ahora a este archivo. slug_estado() va copiada de 20260726120000 con un
-- número cambiado.
--
-- ────────────────────────────────────────────────────────────
-- Y UNA COSA MÁS, CHICA: EL SLUG ENTRA EN EL QR
--
-- La dirección que va impresa en el QR del calco es
-- fidellimotors.app/<slug>. Un tenant entró con un slug de 34 caracteres
-- y el QR no se pudo hacer. El tope pasa a 32 (CHECK slug_largo_qr, y
-- slug_estado() lo dice antes de escribir); el alta y Editar de /fidelli
-- avisan desde los 18, que es donde el QR empieza a perder resistencia.
-- ============================================================


-- ---------- 1 · La tabla ----------
create table adjuntos_trabajo (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references services(id) on delete cascade,
  -- Lo completa el trigger desde la cabecera, como en service_items y
  -- service_ruedas: no hay forma de que quede en otro tenant.
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- El nombre del archivo como lo eligió quien lo subió, ya limpio: es lo
  -- que se lee en el panel y lo que ve el cliente.
  nombre          text not null,
  -- El objeto en el bucket: <lubricentro_id>/<service_id>/<uuid>.<ext>.
  -- La elige el servidor; el navegador no decide ni la carpeta ni el nombre.
  ruta            text not null,
  mime            text not null,
  bytes           integer not null,
  visible_cliente boolean not null default false,
  subido_por      uuid references usuarios(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint adjunto_ruta_unica unique (ruta),
  constraint adjunto_nombre_valido check (
    char_length(btrim(nombre)) between 1 and 120
    and nombre !~ '[[:cntrl:]]'
  ),
  constraint adjunto_mime_valido check (
    mime in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint adjunto_bytes_validos check (bytes between 1 and 2097152), -- 2 MB
  -- El archivo vive en la carpeta de SU trabajo, que vive en la de SU
  -- tenant, y su extensión es la de su formato. Con esto una fila no puede
  -- apuntar al archivo de otro trabajo ni al de otro lubricentro: es lo
  -- que hace segura a adjunto_publico(), que entrega la ruta que diga la
  -- fila.
  constraint adjunto_ruta_valida check (
    ruta = lubricentro_id::text || '/' || service_id::text || '/' || split_part(ruta, '/', 3)
    and split_part(ruta, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    and right(ruta, 3) = case mime
      when 'application/pdf' then 'pdf'
      when 'image/jpeg'      then 'jpg'
      when 'image/png'       then 'png'
    end
  )
);

create index adjuntos_trabajo_service on adjuntos_trabajo(service_id);
create index adjuntos_trabajo_lubri on adjuntos_trabajo(lubricentro_id);

comment on table adjuntos_trabajo is
  'Los archivos adjuntos a un trabajo (PDF o foto del diagnóstico): hasta 3 por trabajo, 2 MB cada uno, ocultos para el cliente salvo que el taller prenda visible_cliente. EXCEPCIÓN ESCRITA a «acá no se borra nada»: un adjunto se QUITA (delete), porque es un archivo y no el cartón; el trabajo y su papel no cambian. Adjuntar, prender, apagar y quitar funcionan fuera del plazo de edición. El archivo vive en el bucket privado `adjuntos`; al cliente se lo entrega solo la ruta /[slug]/[patente]/adjunto/[id], vía adjunto_publico().';
comment on column adjuntos_trabajo.ruta is
  'El objeto en el bucket `adjuntos`: <lubricentro_id>/<service_id>/<uuid>.<ext>. No viaja nunca al cliente.';
comment on column adjuntos_trabajo.visible_cliente is
  '«Mostrar al cliente». Apagado por defecto y no se puede mandar en el alta: lo prende el taller, archivo por archivo. Misma regla que visible_cliente de pendientes y notas.';


-- ---------- 2 · Los dos triggers ----------
-- El tenant se hereda de la cabecera, igual que en service_items y
-- service_ruedas: venga lo que venga en el insert, queda el del trabajo. Y
-- quién lo subió lo dice la sesión, no el navegador.
-- >>> adjuntos_trabajo_heredar_tenant
create function adjuntos_trabajo_heredar_tenant()
returns trigger
language plpgsql
as $$
begin
  select lubricentro_id into new.lubricentro_id
  from services where id = new.service_id;
  -- Sin sesión (un script con la clave de servicio) queda lo que venga.
  if auth.uid() is not null then
    new.subido_por := auth.uid(); -- @subido-por
  end if;
  return new;
end;
$$;
-- <<< adjuntos_trabajo_heredar_tenant

create trigger adjuntos_trabajo_tenant
  before insert on adjuntos_trabajo
  for each row execute function adjuntos_trabajo_heredar_tenant();

-- El tope: tres por trabajo. SECURITY DEFINER para contar TODAS las filas
-- del trabajo, las vea o no quien inserta: un tope que cuenta con RLS es
-- un tope que se puede esquivar.
-- >>> adjuntos_trabajo_tope
create function adjuntos_trabajo_tope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuantos integer;
begin
  -- Dos subidas a la vez al mismo trabajo no pueden contar las dos «2»: el
  -- candado es por trabajo y dura la transacción.
  perform pg_advisory_xact_lock(hashtextextended('adjuntos_trabajo:' || new.service_id::text, 0));

  select count(*) into v_cuantos
  from adjuntos_trabajo where service_id = new.service_id;

  if v_cuantos >= 3 then -- @tope
    raise exception 'tope_adjuntos'
      using hint = 'Un trabajo lleva hasta 3 adjuntos. Quitá uno para sumar otro.';
  end if;
  return new;
end;
$$;
-- <<< adjuntos_trabajo_tope

create trigger adjuntos_trabajo_tope
  before insert on adjuntos_trabajo
  for each row execute function adjuntos_trabajo_tope();


-- ---------- 3 · RLS y privilegios ----------
-- Por tenant, y SIN condición de plan (todos los planes) ni de plazo de
-- edición (adjuntar no edita el cartón). Superadmin pasa.
alter table adjuntos_trabajo enable row level security;

create policy adjuntos_lectura on adjuntos_trabajo
  for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy adjuntos_alta on adjuntos_trabajo
  for insert to authenticated
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy adjuntos_visibilidad on adjuntos_trabajo
  for update to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy adjuntos_borrado on adjuntos_trabajo
  for delete to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Los privilegios hacen la mitad del trabajo, y son la mitad que no se
-- puede esquivar con una policy mal escrita:
--   · anon, nada.
--   · el alta, seis columnas: ni visible_cliente (nace oculto), ni
--     subido_por, ni created_at, ni id. El tenant se puede mandar —es la
--     costumbre de los insert del panel— pero no decide nada: lo pisa el
--     trigger con el de la cabecera.
--   · la edición, una: visible_cliente.
revoke all on adjuntos_trabajo from public, anon, authenticated;
grant select, delete on adjuntos_trabajo to authenticated;
grant insert (service_id, lubricentro_id, nombre, ruta, mime, bytes) on adjuntos_trabajo to authenticated; -- @alta-columnas
grant update (visible_cliente) on adjuntos_trabajo to authenticated; -- @edicion-columnas
grant all on adjuntos_trabajo to service_role;


-- ---------- 4 · El bucket ----------
-- PRIVADO. 2 MB, PDF / JPEG / PNG, en el servidor de Storage.
--
--   QUIÉN LEE: el superadmin todo, y cada owner SU carpeta (para firmar
--   la URL con la que el panel abre el archivo hay que poder leerlo).
--   `anon` no tiene policy: no lee nada.
--
--   QUIÉN SUBE: cada owner, a SU carpeta. El archivo va directo del
--   navegador al bucket con una URL firmada de subida que pide el
--   servidor con la sesión del owner (como el diseño del calco), y para
--   firmarla hay que poder insertar.
--
--   QUIÉN BORRA: cada owner, de SU carpeta, y solo un archivo que NO
--   tiene fila: el que no pasó la validación, o el de un adjunto que ya
--   se quitó. Un archivo registrado no se borra por afuera —dejaría un
--   «Ver» roto—: se quita el adjunto, y recién entonces el archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adjuntos',
  'adjuntos',
  false,
  2097152, -- 2 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "adjuntos lectura"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'adjuntos'
    and (
      public.soy_superadmin()
      or (storage.foldername(name))[1] = public.mi_lubricentro_id()::text -- @bucket-lectura
    )
  );

create policy "adjuntos subida propia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text -- @bucket-subida
  );

create policy "adjuntos borrado propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = public.mi_lubricentro_id()::text -- @bucket-borrado
    and not exists (select 1 from public.adjuntos_trabajo a where a.ruta = objects.name) -- @bucket-borrado-registrado
  );


-- ---------- 5 · La puerta del cliente ----------
-- Devuelve la ruta del archivo en el bucket, o null. La llama la ruta
-- GET /[slug]/[patente]/adjunto/[id] con la clave de servicio —la misma
-- con la que después firma la URL, porque anon no puede leer el bucket—,
-- y por eso NO se le da a anon ni a authenticated: la ruta de un archivo
-- no tiene por qué salir del servidor.
--
-- Las cuatro condiciones, todas: el adjunto existe y está visible, su
-- trabajo no está anulado (un trabajo anulado no está en el historial del
-- cliente), el trabajo es de un vehículo con ESA patente, y el vehículo
-- es de un tenant con ESE slug. Dos tenants pueden tener la misma
-- patente: el slug decide.
-- >>> adjunto_publico
create function adjunto_publico(p_id uuid, p_slug text, p_patente text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.ruta
  from adjuntos_trabajo a
  join services s     on s.id = a.service_id
  join vehiculos v    on v.id = s.vehiculo_id
  join lubricentros l on l.id = v.lubricentro_id
  where a.id = p_id
    and a.visible_cliente                                    -- @publico-visible
    and not s.anulado                                        -- @publico-anulado
    and v.patente_normalizada = normalizar_patente(p_patente) -- @publico-patente
    and l.slug = p_slug                                      -- @publico-slug
    and l.id = a.lubricentro_id;
$$;
-- <<< adjunto_publico

comment on function adjunto_publico is
  'La ruta en el bucket de un adjunto VISIBLE, de un trabajo no anulado, de ese vehículo de ese tenant; null en cualquier otro caso. Solo service_role: la llama la ruta pública del adjunto, que después firma una URL de 60 segundos.';

revoke all on function adjunto_publico(uuid, text, text) from public, anon, authenticated;
grant execute on function adjunto_publico(uuid, text, text) to service_role; -- @publico-solo-servicio


-- ---------- 6 · get_carton: los adjuntos visibles de cada trabajo ----------
-- Copiada textual de 20261004120100 (la última definición vigente) con la
-- clave `adjuntos` agregada en cada entrada, después de `fijado`.

-- >>> get_carton
create or replace function get_carton(p_slug text, p_patente text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lubricentro   lubricentros%rowtype;
  v_config        config_experiencia%rowtype;
  v_vehiculo      vehiculos%rowtype;
  v_patente_norm  text;
  v_encontrada    boolean;
  v_premio        record;
  v_sucursales    jsonb;
  v_premium       boolean;
  v_wa_taller     text;
  v_resultado     jsonb;
  v_beneficio_km  integer;
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- Sin filtro por activo, a propósito (2B): la página del cliente
  -- sobrevive a la suspensión. Ver el comentario en 20260822210000.
  select * into v_lubricentro from lubricentros where slug = p_slug;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

  -- El interruptor del beneficio de la compra: con beneficio_km = 0 el
  -- taller lo apagó y la línea desaparece del papel, también en los
  -- trabajos que ya lo tenían guardado. Es una promesa que el taller
  -- decide sostener o no; el papel dice lo que el taller sostiene hoy.
  select coalesce(beneficio_km, 0) into v_beneficio_km
  from config_neumaticos where lubricentro_id = v_lubricentro.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', su.nombre,
    'direccion', su.direccion,
    'telefono', su.telefono,
    'horarios', su.horarios
  ) order by su.created_at), '[]'::jsonb)
  into v_sucursales
  from sucursales su
  where su.lubricentro_id = v_lubricentro.id and su.activa;

  select * into v_vehiculo from vehiculos
  where lubricentro_id = v_lubricentro.id and patente_normalizada = v_patente_norm;

  v_encontrada := found;

  insert into landing_busquedas (lubricentro_id, patente, encontrada)
  values (v_lubricentro.id, v_patente_norm, v_encontrada);

  if not v_encontrada then
    return jsonb_build_object(
      'error', 'patente_no_encontrada',
      'lubricentro', jsonb_build_object(
        'nombre', v_lubricentro.nombre,
        'logo_url', v_config.logo_url,
        'color_primario', v_config.color_primario,
        'color_fondo', v_config.color_fondo,
        'color_carton', v_config.color_carton,
        'tema', coalesce(v_config.tema, 'claro'),
        'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
        'datos_contacto', v_config.datos_contacto,
        'sucursales', v_sucursales
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  v_premium := feature_de_tenant(v_lubricentro.id, 'pagina_premium');

  -- El WhatsApp del taller, solo premium. La sucursal del ÚLTIMO trabajo
  -- del auto —el local que tiene su historial— si sigue activa y tiene
  -- teléfono; si no, la primera activa con teléfono; si no, el WhatsApp
  -- de marca de datos_contacto. La caída es por dato faltante, nunca por
  -- adivinar: el orden lo fija el bloque.
  if v_premium then
    select su.telefono into v_wa_taller
    from services s
    join sucursales su on su.id = s.sucursal_id
    where s.vehiculo_id = v_vehiculo.id
      and not s.anulado
      and su.activa
      and su.telefono is not null
    order by s.fecha desc, s.created_at desc
    limit 1;

    if v_wa_taller is null then
      select su.telefono into v_wa_taller
      from sucursales su
      where su.lubricentro_id = v_lubricentro.id
        and su.activa
        and su.telefono is not null
      order by su.created_at
      limit 1;
    end if;

    if v_wa_taller is null then
      v_wa_taller := v_config.datos_contacto->>'whatsapp';
    end if;
  end if;

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'color_fondo', v_config.color_fondo,
      'color_carton', v_config.color_carton,
      'tema', coalesce(v_config.tema, 'claro'),
      'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
      'datos_contacto', v_config.datos_contacto,
      'sucursales', v_sucursales,
      'campos_visibles', v_config.campos_visibles
    ),
    -- El mensaje del taller: el momento de mayor intención del mes. Solo
    -- premium, solo con la vigencia viva (un "traé el auto en septiembre"
    -- puesto en marzo es una vergüenza — con fecha se apaga solo), y solo
    -- con el tenant activo: mismo criterio que el premio.
    'mensaje_taller', case
      when v_premium
       and es_activo(v_lubricentro)                                 -- @mensaje_reloj
       and v_config.mensaje_escaneo is not null
       and (v_config.mensaje_vigencia is null or v_config.mensaje_vigencia >= current_date)
      then v_config.mensaje_escaneo
      else null
    end,
    'whatsapp_taller', v_wa_taller,
    'vehiculo', jsonb_build_object(
      'patente', v_vehiculo.patente,
      'marca', v_vehiculo.marca,
      'modelo', v_vehiculo.modelo,
      'anio', v_vehiculo.anio,
      -- La clase viaja tal cual está guardada: null si nadie la declaró.
      -- Leerla como liviano es del front (normalizarClase), no de acá:
      -- el papel del cliente imprime el cartón de referencia de la clase
      -- —los 20 de un camión— igual que el detalle del panel.
      'clase', v_vehiculo.clase -- @clase
    ),
    'notas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fecha', n.created_at,
          'contenido', n.contenido
        ) order by n.created_at desc
      )
      from notas_vehiculo n
      where n.vehiculo_id = v_vehiculo.id and n.visible_cliente
    ), '[]'::jsonb),
    -- "Recomendado por el taller": SOLO los abiertos marcados visibles.
    'pendientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'descripcion', tp.descripcion,
          'objetivo_fecha', tp.objetivo_fecha,
          'objetivo_km', tp.objetivo_km,
          'creado', tp.created_at
        ) order by tp.created_at desc
      )
      from trabajos_pendientes tp
      where tp.vehiculo_id = v_vehiculo.id
        and tp.estado = 'pendiente'
        and tp.visible_cliente
    ), '[]'::jsonb),
    'fidelizacion', case
      when es_activo(v_lubricentro)                                  -- @fidelizacion_reloj
       and coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
      then jsonb_build_object(
        'disponible', v_premio.disponible,
        'services_ciclo', v_premio.services_ciclo,
        'meta_services', v_premio.meta_services,
        'descripcion', v_premio.descripcion,
        -- Qué avanza el ciclo: 'services' (default) o 'todos'. El cartel
        -- del cliente nombra lo que de verdad suma.
        'alcance', coalesce(v_premio.alcance, 'services')
      )
      else null
    end,
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tipo', s.tipo,
          'trabajo_descripcion', s.trabajo_descripcion,
          'fecha', s.fecha,
          'kilometros', s.kilometros,
          'aceite_tipo', s.aceite_tipo,
          'aceite_nombre', case
            when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
            then s.aceite_nombre else null end,
          'prox_service_km', s.prox_service_km,
          -- El próximo service de CAJA (20261004120100): columna propia,
          -- null en todo lo que no es una caja. Viaja en CADA entrada y
          -- el front decide qué tarjeta dibuja.
          'prox_caja_km', s.prox_caja_km, -- @prox-caja
          -- La alineación es del vehículo entero, no de una rueda: viaja
          -- en la cabecera del trabajo.
          'alineacion', s.alineacion,
          -- El beneficio de la compra (bloque 2): rotación y balanceo sin
          -- cargo hasta X km o hasta tal fecha. Solo si el taller lo tiene
          -- prendido; con beneficio_km = 0 viaja null y no se dibuja.
          'beneficio_hasta_km', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_km end,
          'beneficio_hasta_fecha', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_fecha end,
          'sucursal', case
            when coalesce((v_config.campos_visibles->>'mostrar_sucursal')::boolean, true)
            then suc.nombre else null end,
          'observaciones', case
            when coalesce((v_config.campos_visibles->>'mostrar_observaciones')::boolean, false)
            then s.observaciones else null end,
          'fijado', (now() - s.created_at >= plazo_edicion(s.tipo)), -- @fijado
          -- Los adjuntos del trabajo que el taller decidió mostrar
          -- (20261004200000). SOLO los visibles, y de cada uno lo justo
          -- para escribir la línea y armar el enlace: el id, el nombre, el
          -- formato y cuándo se subió. La ruta del archivo no viaja nunca:
          -- la firma /[slug]/[patente]/adjunto/[id], por 60 segundos.
          'adjuntos', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', aj.id,
                'nombre', aj.nombre,
                'mime', aj.mime,
                'creado', aj.created_at
              ) order by aj.created_at, aj.id
            )
            from adjuntos_trabajo aj
            where aj.service_id = s.id
              and aj.visible_cliente -- @adjuntos-visibles
          ), '[]'::jsonb),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'tipo', si.item_tipo,
                'cambiado', si.cambiado,
                -- La cantidad viaja desde el bloque 5. Si el auto llevó dos
                -- filtros, el papel del cliente tiene que decirlo.
                'cantidad', si.cantidad,
                'detalle', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(si.detalle, p.nombre) else null end
              ) order by si.item_tipo, si.created_at
            )
            from service_items si
            left join productos p on p.id = si.producto_id
            where si.service_id = s.id
          ), '[]'::jsonb),
          -- Las ruedas del trabajo de gomería. La MARCA respeta
          -- mostrar_productos, igual que aceite_nombre y que el detalle
          -- de cada renglón: es el producto que se vendió. La MEDIDA no
          -- se apaga — es la especificación del auto, y el dueño la
          -- necesita para saber qué comprar. La profundidad va cruda: es
          -- un dato, no un diagnóstico, y el cartón la muestra sin
          -- semáforo.
          'ruedas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'posicion', sr.posicion,
                'posicion_anterior', sr.posicion_anterior,
                'colocada', sr.colocada,
                'rotada', sr.rotada,
                'balanceada', sr.balanceada,
                'reparada', sr.reparada,
                'marca', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(sr.marca, pr.nombre) else null end,
                'medida', sr.medida,
                'indice_carga_vel', sr.indice_carga_vel,
                'dot', sr.dot,
                'profundidad_mm', sr.profundidad_mm,
                'presion_psi', sr.presion_psi
              ) order by sr.posicion
            )
            from service_ruedas sr
            left join productos pr on pr.id = sr.producto_id
            where sr.service_id = s.id
          ), '[]'::jsonb)
        ) order by s.fecha desc, s.created_at desc
      )
      from services s
      join sucursales suc on suc.id = s.sucursal_id
      where s.vehiculo_id = v_vehiculo.id and not s.anulado
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;
-- <<< get_carton

comment on function get_carton is
  'Única puerta pública con patente. Línea de tiempo con los cuatro tipos (cada entrada con su prox_service_km, su prox_caja_km y sus adjuntos visibles: id, nombre, mime y fecha, nunca la ruta), notas y pendientes visibles, premium gateado. Sobrevive a la suspensión. Registra la búsqueda.';


-- ---------- 7 · Los archivos sin fila ----------
-- Un archivo queda sin fila cuando se sube y no pasa la validación (y el
-- borrado inmediato falla), cuando se quita un adjunto y el borrado del
-- archivo falla, o cuando su trabajo se va (la purga de un tenant). Desde
-- SQL no se pueden borrar —storage.objects lo rechaza—: el cierre diario
-- pide esta lista con la clave de servicio y los borra por la API.
--
-- NO lista lo subido en el último día: entre la subida y el registro
-- pasan unos segundos, y barrer ahí le borraría el archivo a quien está
-- adjuntando.
-- >>> adjuntos_huerfanos
create function adjuntos_huerfanos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'adjuntos'                              -- @huerfanos-bucket
    and o.created_at < now() - interval '1 day'               -- @huerfanos-en-vuelo
    and not exists (select 1 from adjuntos_trabajo a where a.ruta = o.name) -- @huerfanos-sin-fila
  order by o.created_at
  limit 500;
$$;
-- <<< adjuntos_huerfanos

comment on function adjuntos_huerfanos is
  'Los archivos del bucket `adjuntos` que no tienen fila en adjuntos_trabajo y se subieron hace más de un día (hasta 500 por corrida). Solo service_role: la usa el cierre diario para borrarlos por la API de Storage.';

revoke all on function adjuntos_huerfanos() from public, anon, authenticated;
grant execute on function adjuntos_huerfanos() to service_role;


-- ---------- 8 · El slug entra en el QR ----------
-- Antes del CHECK, la pregunta en voz alta: si algún tenant tiene hoy un
-- slug de más de 32 caracteres, esta migración NO sigue, y dice cuál. Se
-- lo acorta primero desde /fidelli → Editar (se puede: sin calcos
-- entregadas el slug no está impreso en ningún lado) y se vuelve a
-- aplicar. La alternativa —un CHECK `not valid`— es peor: no valida las
-- filas viejas, pero frena CUALQUIER update sobre ese tenant hasta que
-- alguien le cambie el slug, y eso incluye el cierre diario.
do $$
declare
  v_largos text;
begin
  select string_agg(slug || ' (' || char_length(slug) || ')', ', ' order by slug)
    into v_largos
  from lubricentros where char_length(slug) > 32;
  if v_largos is not null then
    raise exception 'Hay lubricentros con un slug de más de 32 caracteres: %', v_largos
      using hint = 'Acortalos desde /fidelli → Editar (o con un update) y volvé a aplicar la migración.';
  end if;
end $$;

alter table lubricentros
  add constraint slug_largo_qr check (char_length(slug) <= 32);

comment on constraint slug_largo_qr on lubricentros is
  'La dirección impresa en el QR del calco es el dominio más el slug: con más de 32 caracteres el QR no se puede hacer (y desde 18 pierde resistencia, que es lo que avisan el alta y Editar). El tope viejo de 60 (slug_largo) queda, y este es el que manda.';

-- slug_estado(): lo mismo que dicen las constraints, antes de escribir.
-- Copiada de 20260726120000 con el tope en 32.

-- >>> slug_estado
create or replace function slug_estado(p_slug text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede validar slugs'
      using errcode = '42501';
  end if;

  -- Las mismas dos constraints de formato de la tabla
  if char_length(v_slug) < 3 or char_length(v_slug) > 32 -- @slug-tope
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return 'invalido';
  end if;

  if slug_reservado(v_slug) then
    return 'reservado';
  end if;

  if exists (select 1 from lubricentros where slug = v_slug) then
    return 'ocupado';
  end if;

  return 'disponible';
end;
$$;
-- <<< slug_estado

comment on function slug_estado is
  'disponible | ocupado | reservado | invalido. Lo mismo que dirían las constraints (formato, de 3 a 32 caracteres), pero antes de escribir.';
