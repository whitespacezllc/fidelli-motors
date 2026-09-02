-- ============================================================
-- Fidelli Motors · El descuento de aceite respeta la unidad del producto
--
-- guardar_service restaba p_aceite_litros al stock del aceite sin mirar
-- productos.unidad. Con un aceite ENVASADO —unidad = 'unidad', el stock
-- cuenta bidones: "EDGE 5W30 X4L", 16 en el estante— un service de 4
-- litros bajaba 4 BIDONES en vez de 1. Fassetta entra con ~44 aceites
-- envasados y 11 a granel: el caso es la norma, no el borde.
--
-- LA REGLA, que vive acá y el formulario solo refleja:
--   · a granel (unidad = 'litro'): baja los litros del service, y solo si
--     vinieron (precargados por litros_sugeridos o tipeados). Sin dato el
--     stock no se mueve — idéntico a hoy.
--   · envasado (unidad = 'unidad'): baja UNA unidad por service. Un cambio
--     de aceite abre un bidón. Los litros, si un front viejo los manda,
--     quedan como dato del service y NO tocan el stock.
--
-- Sin costo, sin movimientos, "el ajuste es editar el número": el bidón
-- de 1 L que se usa de a cuatro se corrige en el catálogo, no con una
-- contabilidad de fracciones que este modelo prohíbe.
--
-- Misma firma: create or replace, sin drop. Los grants se conservan y el
-- front desplegado no nota nada. actualizar_service no cambia: la edición
-- nunca tocó stock y sigue sin tocarlo.
-- ============================================================

create or replace function guardar_service(
  p_vehiculo_id          uuid,
  p_sucursal_id          uuid,
  p_fecha                date,
  p_kilometros           integer,
  p_aceite_tipo          text,
  p_prox_service_km      integer,
  p_items                jsonb default '[]'::jsonb,
  p_aceite_producto_id   uuid default null,
  p_aceite_nombre        text default null,
  p_observaciones        text default null,
  p_canjear_premio       boolean default false,
  p_tipo                 tipo_trabajo default 'service',
  p_trabajo_descripcion  text default null,
  p_pendientes           jsonb default '[]'::jsonb,
  p_resolver_pendientes  uuid[] default '{}'::uuid[],
  p_aceite_litros        numeric default null
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
  v_detalle     text;
  v_pend        jsonb;
  v_desc        text;
  v_cantidad    numeric;
  v_producto    uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  if p_canjear_premio then
    select * into v_premio from premio_disponible(p_vehiculo_id);
    if not coalesce(v_premio.disponible, false) then
      raise exception 'premio_no_disponible';
    end if;
    if p_tipo = 'mecanica' and v_premio.alcance is distinct from 'todos' then
      raise exception 'canje_solo_en_service';
    end if;
  end if;

  if p_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then
      raise exception 'descripcion_requerida';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, trabajo_descripcion, fecha, kilometros, observaciones
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'mecanica', trim(p_trabajo_descripcion), p_fecha, p_kilometros,
      nullif(trim(p_observaciones), '')
    )
    returning id into v_service;
  else
    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      fecha, kilometros, aceite_tipo, prox_service_km,
      aceite_producto_id, aceite_nombre, observaciones, aceite_litros
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      p_fecha, p_kilometros, trim(p_aceite_tipo), p_prox_service_km,
      p_aceite_producto_id,
      nullif(trim(p_aceite_nombre), ''),
      nullif(trim(p_observaciones), ''),
      p_aceite_litros
    )
    returning id into v_service;

    -- EL ACEITE baja según la UNIDAD del producto, no según lo que tipeó
    -- el mecánico. Solo si el producto lleva stock:
    --   · 'litro'  → los litros del service, y solo si vinieron. Sin dato,
    --                el stock no se mueve — el stock es opcional; la
    --                velocidad no.
    --   · 'unidad' → UNA unidad por service, con o sin litros. El stock
    --                cuenta bidones y un cambio de aceite abre uno; restar
    --                litros acá era vaciar cuatro bidones por service.
    if p_aceite_producto_id is not null then
      update productos p
      set stock = p.stock - case p.unidad
                              when 'litro' then p_aceite_litros
                              else 1
                            end
      where p.id = p_aceite_producto_id
        and p.lubricentro_id = v_lubricentro
        and p.stock is not null
        and (p.unidad <> 'litro' or p_aceite_litros is not null);
    end if;
  end if;

  -- Los renglones, con su cantidad (default 1: el caso normal no pide
  -- ni un toque más). El descuento va adentro del mismo loop.
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if p_tipo = 'mecanica' then
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
    else
      v_detalle := nullif(trim(v_item->>'detalle'), '');
    end if;

    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 1);
    v_producto := nullif(v_item->>'producto_id', '')::uuid;

    insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
    values (
      v_service,
      case when p_tipo = 'mecanica' then null else (v_item->>'tipo')::item_tipo end,
      v_producto,
      v_detalle,
      coalesce((v_item->>'cambiado')::boolean, true),
      v_cantidad
    );

    if v_producto is not null then
      update productos set stock = stock - v_cantidad
      where id = v_producto
        and lubricentro_id = v_lubricentro
        and stock is not null;
    end if;
  end loop;

  -- Pendientes nuevos y tildados: idéntico al bloque 3.
  for v_pend in select * from jsonb_array_elements(coalesce(p_pendientes, '[]'::jsonb))
  loop
    v_desc := nullif(trim(coalesce(v_pend->>'descripcion', '')), '');
    if v_desc is null then
      continue;
    end if;
    if char_length(v_desc) < 5 then
      raise exception 'pendiente_invalido';
    end if;
    if nullif(v_pend->>'objetivo_fecha', '') is null
       and nullif(v_pend->>'objetivo_km', '') is null then
      raise exception 'pendiente_sin_objetivo';
    end if;

    insert into trabajos_pendientes (
      lubricentro_id, vehiculo_id, origen_service_id, usuario_id,
      descripcion, objetivo_fecha, objetivo_km, visible_cliente
    ) values (
      v_lubricentro, p_vehiculo_id, v_service, auth.uid(),
      v_desc,
      nullif(v_pend->>'objetivo_fecha', '')::date,
      nullif(v_pend->>'objetivo_km', '')::integer,
      coalesce((v_pend->>'visible_cliente')::boolean, false)
    );
  end loop;

  if array_length(p_resolver_pendientes, 1) > 0 then
    update trabajos_pendientes set
      estado = 'resuelto',
      resuelto_en = now(),
      resuelto_service_id = v_service
    where id = any(p_resolver_pendientes)
      and vehiculo_id = p_vehiculo_id
      and estado = 'pendiente';
  end if;

  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  return v_service;
end;
$$;

comment on function guardar_service is
  'Guarda el trabajo completo + renglones (con cantidad) + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. El aceite baja según su unidad: a granel por los litros del service, envasado UNA unidad por service. El descuento pasa SOLO acá: editar/anular no lo re-toca. Security invoker.';

comment on column services.aceite_litros is
  'Litros de aceite usados en ESTE service. Mueven el stock solo si el producto se mide en litros (unidad = litro); NULL = no se registró y ese stock no se mueve. Un aceite envasado baja una unidad por service, con o sin litros. Lo precarga litros_sugeridos del producto.';

-- create or replace conserva los grants; se repiten para que la postura
-- quede escrita en la misma migración que la función.
revoke all on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric
) to authenticated;
