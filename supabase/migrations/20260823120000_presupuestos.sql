-- ============================================================
-- Fidelli Motors · Presupuestos — Bloque 4
--
-- Un GENERADOR DE DOCUMENTOS: renglones a mano con un importe cada uno,
-- y sale un papel con la marca del lubricentro para WhatsApp o mostrador.
--
-- LO QUE NO ES, grabado acá para que nadie lo "complete" después:
--   · NO es facturación. Sin IVA, sin listas de precios, sin numeración
--     fiscal, sin estados de aprobación. Se genera y queda guardado.
--   · Los importes viven EN el presupuesto y en NINGÚN OTRO LADO. El
--     modelo operativo (services, items, productos) sigue sin un solo
--     numérico de plata — esa frontera no se cruza. El día que un
--     importe quiera salir del catálogo, se discute en un bloque nuevo.
--   · Cliente y vehículo son OPCIONALES: un presupuesto es para un
--     potencial cliente parado en el mostrador. El destino va en texto
--     libre, con enlace a las fichas reales solo si ya existen.
--
-- LA NUMERACIÓN: correlativa POR LUBRICENTRO, calculada dentro de la
-- transacción con un advisory lock por tenant — dos altas simultáneas
-- del mismo lubricentro se serializan y salen 47 y 48, nunca 47 y 47.
-- "Presupuesto N° 47" es lo que hace que el papel se vea serio.
-- ============================================================


-- ---------- 1 · Las dos tablas ----------
create table presupuestos (
  id                    uuid primary key default gen_random_uuid(),
  lubricentro_id        uuid not null references lubricentros(id) on delete restrict,
  sucursal_id           uuid not null references sucursales(id) on delete restrict,
  usuario_id            uuid not null references usuarios(id) on delete restrict,
  numero                integer not null,
  fecha                 date not null default current_date,
  -- Validez OPCIONAL: null = el papel no promete plazo.
  validez_dias          integer check (validez_dias > 0 and validez_dias <= 365),
  observaciones         text,
  -- El destino, en texto libre. Un potencial cliente no tiene ficha y
  -- no se lo obliga a tenerla para darle un número.
  destinatario_nombre   text,
  destinatario_telefono text,
  destinatario_vehiculo text,
  -- Enlaces opcionales a las fichas reales. set null: el papel sobrevive
  -- a cualquier cosa que le pase a la ficha.
  cliente_id            uuid references clientes(id) on delete set null,
  vehiculo_id           uuid references vehiculos(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint numero_positivo check (numero > 0),
  constraint numero_unico_por_tenant unique (lubricentro_id, numero)
);

create index presupuestos_lubricentro_idx
  on presupuestos (lubricentro_id, numero desc);

create table presupuesto_items (
  id              uuid primary key default gen_random_uuid(),
  presupuesto_id  uuid not null references presupuestos(id) on delete cascade,
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  orden           integer not null,
  descripcion     text not null,
  -- numeric a propósito: "2.5 horas de mano de obra" es un renglón real.
  cantidad        numeric(10,2) not null default 1,
  precio_unitario numeric(12,2) not null,

  constraint descripcion_no_vacia check (char_length(trim(descripcion)) >= 2),
  constraint cantidad_positiva check (cantidad > 0),
  constraint precio_no_negativo check (precio_unitario >= 0)
);

create index presupuesto_items_presupuesto_idx
  on presupuesto_items (presupuesto_id, orden);

comment on table presupuestos is
  'Documentos de cotización con la marca del lubricentro. NO es facturación: sin IVA, sin estados, sin numeración fiscal. Los importes viven acá y en ningún otro lado del modelo.';
comment on table presupuesto_items is
  'Renglones en texto libre con importe. El total no se guarda: se calcula — un total guardado y unos renglones editables terminan contradiciéndose.';


-- ---------- 2 · RLS: patrón de tenant + gating por plan ----------
alter table presupuestos enable row level security;
alter table presupuesto_items enable row level security;

create policy presupuestos_lectura on presupuestos for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy presupuestos_alta on presupuestos for insert to authenticated
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('presupuestos'))
    or soy_superadmin()
  );

create policy presupuestos_edicion on presupuestos for update to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('presupuestos'))
    or soy_superadmin()
  );

-- Sin delete para el owner: la casa no borra. Un presupuesto errado se
-- edita — es herramienta de trabajo, no documento legal.
create policy presupuestos_borrado on presupuestos for delete to authenticated
  using (soy_superadmin());

create policy presupuesto_items_lectura on presupuesto_items for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy presupuesto_items_escritura on presupuesto_items for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('presupuestos'))
    or soy_superadmin()
  );


-- ---------- 3 · Guardar: numeración correlativa a prueba de carrera ----------
create or replace function guardar_presupuesto(
  p_sucursal_id           uuid,
  p_items                 jsonb,
  p_fecha                 date default current_date,
  p_validez_dias          integer default null,
  p_observaciones         text default null,
  p_destinatario_nombre   text default null,
  p_destinatario_telefono text default null,
  p_destinatario_vehiculo text default null,
  p_cliente_id            uuid default null,
  p_vehiculo_id           uuid default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_id          uuid;
  v_numero      integer;
  v_item        jsonb;
  v_orden       integer := 0;
  v_desc        text;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'presupuesto_sin_renglones';
  end if;

  -- EL LOCK DE LA NUMERACIÓN: serializa las altas DEL MISMO TENANT dentro
  -- de la transacción (xact: se suelta solo al commit/rollback). Dos
  -- mostradores cotizando a la vez salen 47 y 48. El unique de la tabla
  -- queda como cinturón por si alguien inserta por afuera de la función.
  perform pg_advisory_xact_lock(hashtext('presupuesto:' || v_lubricentro::text));

  select coalesce(max(numero), 0) + 1 into v_numero
  from presupuestos where lubricentro_id = v_lubricentro;

  insert into presupuestos (
    lubricentro_id, sucursal_id, usuario_id, numero, fecha, validez_dias,
    observaciones, destinatario_nombre, destinatario_telefono,
    destinatario_vehiculo, cliente_id, vehiculo_id
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), v_numero, p_fecha, p_validez_dias,
    nullif(trim(coalesce(p_observaciones, '')), ''),
    nullif(trim(coalesce(p_destinatario_nombre, '')), ''),
    nullif(trim(coalesce(p_destinatario_telefono, '')), ''),
    nullif(trim(coalesce(p_destinatario_vehiculo, '')), ''),
    p_cliente_id, p_vehiculo_id
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_desc := nullif(trim(coalesce(v_item->>'descripcion', '')), '');
    if v_desc is null then
      continue;
    end if;
    v_orden := v_orden + 1;
    insert into presupuesto_items (
      presupuesto_id, lubricentro_id, orden, descripcion, cantidad, precio_unitario
    ) values (
      v_id, v_lubricentro, v_orden, v_desc,
      coalesce((v_item->>'cantidad')::numeric, 1),
      coalesce((v_item->>'precio_unitario')::numeric, 0)
    );
  end loop;

  if v_orden = 0 then
    raise exception 'presupuesto_sin_renglones';
  end if;

  return v_id;
end;
$$;

comment on function guardar_presupuesto is
  'Cabecera + renglones en una transacción, con numeración correlativa por tenant bajo advisory lock. Security invoker: la policy (tenant + plan_permite) decide.';

-- ---------- 4 · Editar: herramienta de trabajo, no documento legal ----------
-- El número NO cambia. Los renglones se reemplazan enteros: texto libre
-- sin clave estable, igual que los de una mecánica.
create or replace function actualizar_presupuesto(
  p_id                    uuid,
  p_sucursal_id           uuid,
  p_items                 jsonb,
  p_fecha                 date,
  p_validez_dias          integer default null,
  p_observaciones         text default null,
  p_destinatario_nombre   text default null,
  p_destinatario_telefono text default null,
  p_destinatario_vehiculo text default null,
  p_cliente_id            uuid default null,
  p_vehiculo_id           uuid default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item  jsonb;
  v_orden integer := 0;
  v_desc  text;
  v_lub   uuid;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'presupuesto_sin_renglones';
  end if;

  update presupuestos set
    sucursal_id           = p_sucursal_id,
    fecha                 = p_fecha,
    validez_dias          = p_validez_dias,
    observaciones         = nullif(trim(coalesce(p_observaciones, '')), ''),
    destinatario_nombre   = nullif(trim(coalesce(p_destinatario_nombre, '')), ''),
    destinatario_telefono = nullif(trim(coalesce(p_destinatario_telefono, '')), ''),
    destinatario_vehiculo = nullif(trim(coalesce(p_destinatario_vehiculo, '')), ''),
    cliente_id            = p_cliente_id,
    vehiculo_id           = p_vehiculo_id,
    updated_at            = now()
  where id = p_id
  returning lubricentro_id into v_lub;

  if not found then
    -- RLS rechaza en silencio: sin esto, un rechazo parecería un guardado.
    raise exception 'presupuesto_no_editable';
  end if;

  delete from presupuesto_items where presupuesto_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_desc := nullif(trim(coalesce(v_item->>'descripcion', '')), '');
    if v_desc is null then
      continue;
    end if;
    v_orden := v_orden + 1;
    insert into presupuesto_items (
      presupuesto_id, lubricentro_id, orden, descripcion, cantidad, precio_unitario
    ) values (
      p_id, v_lub, v_orden, v_desc,
      coalesce((v_item->>'cantidad')::numeric, 1),
      coalesce((v_item->>'precio_unitario')::numeric, 0)
    );
  end loop;

  if v_orden = 0 then
    raise exception 'presupuesto_sin_renglones';
  end if;
end;
$$;

comment on function actualizar_presupuesto is
  'Edita cabecera y reemplaza renglones en una transacción. El número no cambia nunca. Security invoker.';

revoke all on function guardar_presupuesto(uuid, jsonb, date, integer, text, text, text, text, uuid, uuid) from public, anon;
revoke all on function actualizar_presupuesto(uuid, uuid, jsonb, date, integer, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function guardar_presupuesto(uuid, jsonb, date, integer, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function actualizar_presupuesto(uuid, uuid, jsonb, date, integer, text, text, text, text, uuid, uuid) to authenticated;
