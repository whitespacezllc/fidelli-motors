-- ════════════════════════════════════════════════════════════════════
-- SUPERFICIE DEL CLIENTE (Bloque 7)
--
-- 1 · config_experiencia crece: tema (claro|oscuro), logo_tamano
--     (normal|grande|xl), mensaje_escaneo + mensaje_vigencia.
--     LOS DEFAULTS SON EL COMPORTAMIENTO DE HOY: claro, normal, sin
--     mensaje. Ningún tenant existente cambia nada — esa es la condición
--     de entrada del bloque, no un detalle.
--
-- 2 · El mensaje al escanear es LA feature pagina_premium (Ultra). Dos
--     capas, como siempre:
--       · escribir: trigger BEFORE UPDATE que solo bloquea CAMBIARLO a un
--         valor no nulo sin la feature. Borrarlo se puede siempre, y el
--         resto de la config se sigue editando aunque quede un mensaje
--         viejo de un plan anterior (la lección de C2: una policy de fila
--         entera bloquearía TODA la pantalla después de un downgrade).
--       · mostrar: get_carton lo emite solo con la feature activa, la
--         vigencia viva y el tenant activo — mismo criterio que el
--         premio: no se promociona lo que el local no puede entregar.
--
-- 3 · get_carton emite whatsapp_taller: el teléfono de la sucursal del
--     último trabajo del auto (si está activa y tiene teléfono), con
--     caída a la primera sucursal activa con teléfono y por último al
--     WhatsApp de marca. Solo con pagina_premium. SIN condición de
--     activo a propósito: es un canal de contacto, no una promoción —
--     la página de un suspendido responde y su WhatsApp también.
--
-- 4 · get_landing emite tema y logo_tamano. El mensaje no: vive en la
--     pantalla del vehículo, no en la vidriera.
-- ════════════════════════════════════════════════════════════════════


-- ---------- 1 · Las columnas ----------

alter table config_experiencia
  add column tema text not null default 'claro'
    constraint tema_valido check (tema in ('claro', 'oscuro')),
  add column logo_tamano text not null default 'normal'
    constraint logo_tamano_valido check (logo_tamano in ('normal', 'grande', 'xl')),
  add column mensaje_escaneo text
    constraint mensaje_escaneo_largo check (char_length(mensaje_escaneo) <= 280),
  add column mensaje_vigencia date;

comment on column config_experiencia.tema is
  'Elección del LUBRICENTRO para su página pública. No es prefers-color-scheme: se aplica a todos los que escanean.';
comment on column config_experiencia.mensaje_escaneo is
  'El mensaje del taller al escanear (pagina_premium). Con mensaje_vigencia vencida se apaga solo.';


-- ---------- 2 · El candado del mensaje (escribir) ----------
-- Solo la TRANSICIÓN a un valor nuevo no nulo exige la feature: así un
-- tenant que baja de plan puede seguir editando colores y logo aunque el
-- mensaje viejo siga guardado, y puede borrarlo cuando quiera.

-- SECURITY DEFINER por una razón puntual: feature_de_tenant es privada
-- (revocada de authenticated — el wrapper público es plan_permite, que
-- resuelve por SESIÓN). El trigger tiene que resolver por la FILA
-- (new.lubricentro_id): un superadmin editando la config de un tenant
-- debe evaluar el plan DEL TENANT, no el suyo. El definer le presta el
-- permiso sin abrir la función interna a todo el mundo.
create or replace function tope_mensaje_escaneo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mensaje_escaneo is distinct from old.mensaje_escaneo
     and new.mensaje_escaneo is not null
     and not feature_de_tenant(new.lubricentro_id, 'pagina_premium') then
    raise exception 'El mensaje al escanear es parte del plan Ultra.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger config_experiencia_tope_mensaje
  before update on config_experiencia
  for each row execute function tope_mensaje_escaneo();


-- ---------- 3 · get_landing: tema y tamaño viajan con el shell ----------
-- Se conserva TODO lo anterior; ver 20260822210000 por qué no filtra por
-- activo (la vidriera sobrevive a la suspensión; el premio no se ofrece).

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
    'color_fondo', c.color_fondo,
    'color_carton', c.color_carton,
    'tema', coalesce(c.tema, 'claro'),
    'logo_tamano', coalesce(c.logo_tamano, 'normal'),
    'datos_contacto', coalesce(c.datos_contacto, '{}'::jsonb),
    'sucursales', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', su.nombre,
        'direccion', su.direccion,
        'telefono', su.telefono,
        'horarios', su.horarios
      ) order by su.created_at), '[]'::jsonb)
      from sucursales su
      where su.lubricentro_id = l.id and su.activa
    ),
    'premio', case when l.activo then (
      select jsonb_build_object(
        'meta_services', p.meta_services,
        'descripcion', p.descripcion
      )
      from premios p
      where p.lubricentro_id = l.id and p.activo
      order by p.created_at desc
      limit 1
    ) else null end
  )
  from lubricentros l
  left join config_experiencia c on c.lubricentro_id = l.id
  where l.slug = p_slug;
$$;

comment on function get_landing is
  'Shell público de la landing: marca, colores, tema, tamaño de logo, contacto y sucursales. Sirve aunque el tenant esté suspendido (el premio no se ofrece). No escribe.';


-- ---------- 4 · get_carton: mensaje del taller y WhatsApp premium ----------

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
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- Sin filtro por activo, a propósito (2B): la página del cliente
  -- sobrevive a la suspensión. Ver el comentario en 20260822210000.
  select * into v_lubricentro from lubricentros where slug = p_slug;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

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
       and v_lubricentro.activo
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
      'anio', v_vehiculo.anio
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
      when v_lubricentro.activo
       and coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
      then jsonb_build_object(
        'disponible', v_premio.disponible,
        'services_ciclo', v_premio.services_ciclo,
        'meta_services', v_premio.meta_services,
        'descripcion', v_premio.descripcion
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
          'sucursal', case
            when coalesce((v_config.campos_visibles->>'mostrar_sucursal')::boolean, true)
            then suc.nombre else null end,
          'observaciones', case
            when coalesce((v_config.campos_visibles->>'mostrar_observaciones')::boolean, false)
            then s.observaciones else null end,
          'fijado', (now() - s.created_at >= interval '24 hours'),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'tipo', si.item_tipo,
                'cambiado', si.cambiado,
                'detalle', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(si.detalle, p.nombre) else null end
              ) order by si.item_tipo, si.created_at
            )
            from service_items si
            left join productos p on p.id = si.producto_id
            where si.service_id = s.id
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

comment on function get_carton is
  'Única puerta pública con patente. Línea de tiempo con los dos tipos, notas y pendientes visibles, tema y tamaño de logo del tenant, y con pagina_premium el mensaje del taller (vigencia viva, tenant activo) y el WhatsApp de la sucursal del último trabajo. Sirve suspendido (premio y mensaje no). Registra la búsqueda.';
