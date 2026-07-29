-- ============================================================
-- Fidelli Motors · Cada renglón distingue "revisado, OK" de "cambiado"
--
-- Pedido de Brothers Oil: en el taller no todo lo que se toca se
-- cambia. El mecánico revisa el filtro de aire y está bien — eso también
-- es información para el cliente, y hoy no había forma de anotarlo sin
-- mentir (marcarlo se leía como cambio).
--
-- EL MODELO: la fila de service_items sigue siendo "el renglón se
-- atendió" (SI = existe, como siempre). Lo nuevo es UN booleano:
--
--   cambiado = false  →  se revisó y estaba bien ("OK")
--   cambiado = true   →  se cambió / se hizo
--
-- DEFAULT TRUE, y no false, a propósito dos veces:
--   · Backfill: todo renglón cargado hasta hoy se marcó porque se HIZO
--     el cambio (así se leía el cartón y así lo dice el copy de
--     "Marcas de productos": "ven que se hizo el cambio"). true es el
--     único backfill honesto.
--   · Código desplegado: un panel viejo que inserte sin la columna
--     (deploy a mitad de camino) produce exactamente lo que producía
--     ayer. Cero ventana de datos raros.
-- ============================================================

alter table service_items add column cambiado boolean not null default true;

comment on column service_items.cambiado is
  'true = se cambió (el sentido histórico del tilde). false = se revisó y estaba bien ("OK").';


-- ---------- guardar_service: el alta escribe el estado ----------
-- Misma firma y mismo cuerpo que 20260725190000; solo cambia el insert
-- de renglones. coalesce(true): un item sin la clave conserva el
-- sentido viejo. Postura intacta: security invoker, RLS decide.
create or replace function guardar_service(
  p_vehiculo_id        uuid,
  p_sucursal_id        uuid,
  p_fecha              date,
  p_kilometros         integer,
  p_aceite_tipo        text,
  p_prox_service_km    integer,
  p_items              jsonb default '[]'::jsonb,
  p_aceite_producto_id uuid default null,
  p_aceite_nombre      text default null,
  p_observaciones      text default null,
  p_canjear_premio     boolean default false
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_service     uuid;
  v_item        jsonb;
  v_premio      record;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  -- El premio se evalúa ANTES de insertar el service: lo que habilita el
  -- canje son los services anteriores, no el que se está cargando.
  if p_canjear_premio then
    select * into v_premio from premio_disponible(p_vehiculo_id);
    if not coalesce(v_premio.disponible, false) then
      raise exception 'premio_no_disponible';
    end if;
  end if;

  insert into services (
    lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
    fecha, kilometros, aceite_tipo, prox_service_km,
    aceite_producto_id, aceite_nombre, observaciones
  ) values (
    v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
    p_fecha, p_kilometros, trim(p_aceite_tipo), p_prox_service_km,
    p_aceite_producto_id,
    nullif(trim(p_aceite_nombre), ''),
    nullif(trim(p_observaciones), '')
  )
  returning id into v_service;

  -- Un renglón marcado ES la existencia de la fila; `cambiado` dice si
  -- fue cambio o revisión OK. lubricentro_id lo pone el trigger.
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
    values (
      v_service,
      (v_item->>'tipo')::item_tipo,
      nullif(v_item->>'producto_id', '')::uuid,
      nullif(trim(v_item->>'detalle'), ''),
      coalesce((v_item->>'cambiado')::boolean, true)
    );
  end loop;

  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  return v_service;
end;
$$;


-- ---------- actualizar_service: la edición también ----------
-- Misma firma y postura que 20260725120000 (invoker: la ventana de 24 hs
-- la sigue imponiendo RLS, el found convierte el rechazo en error).
create or replace function actualizar_service(
  p_service_id         uuid,
  p_sucursal_id        uuid,
  p_fecha              date,
  p_kilometros         integer,
  p_aceite_tipo        text,
  p_prox_service_km    integer,
  p_items              jsonb default '[]'::jsonb,
  p_aceite_producto_id uuid default null,
  p_aceite_nombre      text default null,
  p_observaciones      text default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item jsonb;
begin
  update services set
    sucursal_id        = p_sucursal_id,
    fecha              = p_fecha,
    kilometros         = p_kilometros,
    aceite_tipo        = trim(p_aceite_tipo),
    prox_service_km    = p_prox_service_km,
    aceite_producto_id = p_aceite_producto_id,
    aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
    observaciones      = nullif(trim(p_observaciones), '')
  where id = p_service_id
    and not anulado;

  if not found then
    raise exception 'service_no_editable';
  end if;

  delete from service_items si
  where si.service_id = p_service_id
    and si.item_tipo not in (
      select (i->>'tipo')::item_tipo
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    );

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    update service_items set
      producto_id = nullif(v_item->>'producto_id', '')::uuid,
      detalle     = nullif(trim(v_item->>'detalle'), ''),
      cambiado    = coalesce((v_item->>'cambiado')::boolean, true)
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), ''),
        coalesce((v_item->>'cambiado')::boolean, true)
      );
    end if;
  end loop;
end;
$$;


-- ---------- get_carton: el cliente ve la diferencia ----------
-- Misma función de 20260725230500; el bloque de items agrega 'cambiado'.
-- El estado viaja SIEMPRE (no depende de mostrar_productos: es qué se
-- hizo, no qué marca se usó). Misma postura: definer + search_path fijo,
-- porque anon no toca tablas.
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
  v_resultado     jsonb;
begin
  v_patente_norm := normalizar_patente(p_patente);

  select * into v_lubricentro from lubricentros where slug = p_slug and activo;
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

  -- Guardamos el resultado ANTES del insert: found se reescribe con cada sentencia
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
        'datos_contacto', v_config.datos_contacto,
        'sucursales', v_sucursales
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'datos_contacto', v_config.datos_contacto,
      'sucursales', v_sucursales,
      'campos_visibles', v_config.campos_visibles
    ),
    'vehiculo', jsonb_build_object(
      'patente', v_vehiculo.patente,
      'marca', v_vehiculo.marca,
      'modelo', v_vehiculo.modelo,
      'anio', v_vehiculo.anio
    ),
    'fidelizacion', case
      when coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
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
              ) order by si.item_tipo
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
  'Única puerta pública con patente. Respeta campos_visibles, devuelve sucursales activas y el estado cambiado/OK de cada renglón, y registra la búsqueda.';
