-- ============================================================
-- Fidelli Motors · Productos: precio, stock y categorías — Bloque 5
--
-- Precio de venta para encontrar rápido lo que se está por usar, y stock
-- OPCIONAL que avisa en vez de solo registrar.
--
-- LA FRONTERA, grabada: SIN COSTO, en ninguna forma. Sin movimientos,
-- sin recepciones, sin auditoría de inventario. El ajuste es editar el
-- número. En el momento en que entra el costo entra el IVA, y detrás
-- viene facturar — que es otro producto.
--
-- STOCK NULO = "no llevo stock": el que no lo usa no ve el campo y el
-- guardado de trabajos ni lo mira. El descuento pasa SOLO al CREAR un
-- trabajo; editar o anular no lo re-toca — con "el ajuste es editar el
-- número" como regla, una contabilidad de reversas sería exactamente el
-- sistema de movimientos que este bloque prohíbe. Puede quedar negativo
-- a propósito: un stock negativo grita "ajustame" en el aviso, mientras
-- que uno recortado a cero esconde el consumo real.
--
-- CATEGORÍAS: de enum a TABLA GLOBAL administrada por Fidelli. Se hace
-- HOY, con dos tenants y volumen mínimo — a cien tenants esta migración
-- es una conversación completamente distinta. Un catálogo global evita
-- que cada tenant invente su taxonomía y que nada se pueda comparar.
-- ============================================================


-- ---------- 1 · Categorías: la tabla global ----------
create table categorias_producto (
  clave      text primary key,
  nombre     text not null,
  plural     text not null,
  orden      integer not null,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),

  constraint clave_formato check (clave ~ '^[a-z_]+$')
);

comment on table categorias_producto is
  'Catálogo GLOBAL de categorías, administrado por Fidelli — no por el tenant. Una categoría nueva es un INSERT, no una migración.';

insert into categorias_producto (clave, nombre, plural, orden) values
  ('aceite',    'Aceite',    'Aceites',    1),
  ('filtro',    'Filtro',    'Filtros',    2),
  ('liquido',   'Líquido',   'Líquidos',   3),
  ('aditivo',   'Aditivo',   'Aditivos',   4),
  ('repuesto',  'Repuesto',  'Repuestos',  5),
  ('neumatico', 'Neumático', 'Neumáticos', 6),
  ('bateria',   'Batería',   'Baterías',   7),
  ('accesorio', 'Accesorio', 'Accesorios', 8),
  ('otro',      'Otro',      'Otros',      9);

alter table categorias_producto enable row level security;

-- Todos los autenticados la leen; solo Fidelli la escribe.
create policy categorias_lectura on categorias_producto for select to authenticated
  using (true);
create policy categorias_admin on categorias_producto for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- ---------- 2 · productos.categoria: enum → texto con FK ----------
-- Sin perder una fila: se copia el valor del enum como texto (las claves
-- del catálogo son idénticas a los valores del enum), se cambia el tipo
-- de la columna y recién entonces muere el enum.
alter table productos
  alter column categoria type text using categoria::text;

alter table productos
  add constraint categoria_existe
    foreign key (categoria) references categorias_producto(clave);

drop type categoria_producto;

-- ---------- 3 · Las columnas nuevas — TODO nulable, TODO opcional ----------
alter table productos
  add column precio_venta     numeric(12,2) check (precio_venta >= 0),
  add column stock            numeric(10,2),
  add column stock_minimo     numeric(10,2) check (stock_minimo >= 0),
  add column unidad           text not null default 'unidad'
    constraint unidad_valida check (unidad in ('unidad', 'litro')),
  -- Los litros que un service típico consume de ESTE producto. Es lo que
  -- hace que el stock de aceite no le cueste ni un segundo al mecánico:
  -- el cartón lo precarga y en el caso normal no se toca nada.
  add column litros_sugeridos numeric(6,2) check (litros_sugeridos > 0);

-- Los aceites existentes se miden en litros; el resto queda en unidades.
update productos set unidad = 'litro' where categoria = 'aceite';

comment on column productos.stock is
  'NULL = no llevo stock de esto: el campo no molesta y el guardado ni lo mira. Puede quedar negativo: es la señal de "ajustame". Sin costo, sin movimientos — el ajuste es editar el número.';
comment on column productos.litros_sugeridos is
  'Solo tiene sentido en unidad=litro: precarga los litros del service en el cartón. Sin esto, el stock del aceite no se mueve.';

-- ---------- 4 · La cantidad del renglón ----------
-- "Un renglón es la existencia de la fila" sigue siendo cierto: el
-- default 1 hace que el caso normal no pida ni un toque más, y "dos
-- filtros" sea posible cuando pasa.
alter table service_items
  add column cantidad numeric(10,2) not null default 1
    constraint cantidad_positiva check (cantidad > 0);

-- ---------- 5 · Los litros del service ----------
alter table services
  add column aceite_litros numeric(6,2) check (aceite_litros > 0);

comment on column services.aceite_litros is
  'Litros de aceite usados en ESTE service. NULL = no se registró y el stock no se mueve. Lo precarga litros_sugeridos del producto.';

-- ---------- 6 · guardar_service descuenta stock, en la misma transacción ----------
-- SOLO para productos que llevan stock (stock is not null); para el
-- resto, ni una lectura de más. El aceite descuenta por p_aceite_litros;
-- los renglones (y los repuestos de mecánica) por su cantidad.
-- Misma firma + dos parámetros con default al final: el front desplegado
-- no la ve. Los pendientes y el canje quedan idénticos.
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[]
);

create function guardar_service(
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

    -- EL ACEITE: baja por litros, solo si el producto lleva stock Y los
    -- litros vinieron (precargados por litros_sugeridos o tipeados). Sin
    -- dato, el stock no se mueve — el stock es opcional; la velocidad no.
    if p_aceite_producto_id is not null and p_aceite_litros is not null then
      update productos set stock = stock - p_aceite_litros
      where id = p_aceite_producto_id
        and lubricentro_id = v_lubricentro
        and stock is not null;
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
  'Guarda el trabajo completo + renglones (con cantidad) + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. El descuento pasa SOLO acá: editar/anular no lo re-toca. Security invoker.';

revoke all on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric
) to authenticated;


-- ---------- 7 · actualizar_service conserva la cantidad ----------
-- La edición NO re-toca stock (ver arriba): solo escribe la cantidad del
-- renglón como dato. Cuerpo idéntico al del bloque 2A + cantidad.
drop function if exists actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text
);

create function actualizar_service(
  p_service_id          uuid,
  p_sucursal_id         uuid,
  p_fecha               date,
  p_kilometros          integer,
  p_aceite_tipo         text,
  p_prox_service_km     integer,
  p_items               jsonb default '[]'::jsonb,
  p_aceite_producto_id  uuid default null,
  p_aceite_nombre       text default null,
  p_observaciones       text default null,
  p_trabajo_descripcion text default null,
  p_aceite_litros       numeric default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item    jsonb;
  v_tipo    tipo_trabajo;
  v_detalle text;
begin
  select tipo into v_tipo from services where id = p_service_id and not anulado;
  if v_tipo is null then
    raise exception 'service_no_editable';
  end if;

  if v_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then
      raise exception 'descripcion_requerida';
    end if;

    update services set
      sucursal_id         = p_sucursal_id,
      fecha               = p_fecha,
      kilometros          = p_kilometros,
      trabajo_descripcion = trim(p_trabajo_descripcion),
      observaciones       = nullif(trim(p_observaciones), '')
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_items where service_id = p_service_id;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        null,
        nullif(v_item->>'producto_id', '')::uuid,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end loop;

    return;
  end if;

  update services set
    sucursal_id        = p_sucursal_id,
    fecha              = p_fecha,
    kilometros         = p_kilometros,
    aceite_tipo        = trim(p_aceite_tipo),
    prox_service_km    = p_prox_service_km,
    aceite_producto_id = p_aceite_producto_id,
    aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
    observaciones      = nullif(trim(p_observaciones), ''),
    aceite_litros      = p_aceite_litros
  where id = p_service_id
    and not anulado;

  if not found then
    raise exception 'service_no_editable';
  end if;

  delete from service_items si
  where si.service_id = p_service_id
    and si.item_tipo is not null
    and si.item_tipo not in (
      select (i->>'tipo')::item_tipo
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
      where i->>'tipo' is not null
    );

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    update service_items set
      producto_id = nullif(v_item->>'producto_id', '')::uuid,
      detalle     = nullif(trim(v_item->>'detalle'), ''),
      cambiado    = coalesce((v_item->>'cambiado')::boolean, true),
      cantidad    = coalesce((v_item->>'cantidad')::numeric, 1)
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), ''),
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end if;
  end loop;
end;
$$;

comment on function actualizar_service is
  'Edita un trabajo dentro de la ventana de 24 hs. NO re-toca stock: el ajuste es editar el número en el catálogo. Security invoker.';

revoke all on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric
) from public, anon;
grant execute on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric
) to authenticated;


-- ---------- 8 · El aviso en Inicio: lo que hace que el stock sirva ----------
-- Sin la alerta, el stock es tipeo muerto. Clave ADITIVA en el resumen:
-- el front viejo la ignora. Silencioso cuando no hay nada bajo el mínimo.
create or replace function stock_bajo(p_limite integer default 8)
returns table (
  producto_id  uuid,
  nombre       text,
  marca        text,
  stock        numeric,
  stock_minimo numeric,
  unidad       text
)
language sql
stable
set search_path = public
as $$
  select p.id, p.nombre, p.marca, p.stock, p.stock_minimo, p.unidad
  from productos p
  where p.activo
    and p.stock is not null
    and p.stock_minimo is not null
    and p.stock <= p.stock_minimo
  order by (p.stock - p.stock_minimo) asc, p.nombre
  limit p_limite;
$$;

comment on function stock_bajo is
  'Los productos activos en o por debajo de su mínimo, los más críticos primero. Security invoker: el RLS de productos recorta al tenant.';

revoke all on function stock_bajo(integer) from public, anon;
grant execute on function stock_bajo(integer) to authenticated;
