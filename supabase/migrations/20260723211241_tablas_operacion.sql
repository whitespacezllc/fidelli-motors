-- ============================================================
-- Fidelli Motors · Operación
-- clientes, vehiculos, services, service_items
-- El cartón físico de Brothers Oil, digitalizado 1:1
-- ============================================================

-- ---------- Clientes ----------
create table clientes (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  nombre          text not null,
  telefono        text not null,
  email           text,
  created_at      timestamptz not null default now(),

  constraint nombre_no_vacio check (char_length(trim(nombre)) >= 2)
);

create index clientes_lubricentro_idx on clientes(lubricentro_id);

-- unaccent() es STABLE, no IMMUTABLE: Postgres no la acepta en un índice.
-- Wrapper propio con la garantía explícita — patrón estándar para este caso.
create or replace function fm_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$ select public.unaccent('public.unaccent', $1) $$;

-- Búsqueda por nombre sin tildes ni mayúsculas: "gomez" encuentra "Gómez"
create index clientes_nombre_busqueda_idx
  on clientes(lubricentro_id, lower(fm_unaccent(nombre)));

create index clientes_telefono_idx on clientes(lubricentro_id, telefono);

comment on table clientes is 'Nombre y teléfono obligatorios; email nunca bloquea la carga.';

-- ---------- Vehículos ----------
create table vehiculos (
  id                 uuid primary key default gen_random_uuid(),
  lubricentro_id     uuid not null references lubricentros(id) on delete restrict,
  cliente_id         uuid not null references clientes(id) on delete restrict,
  patente            text not null,
  patente_normalizada text not null,
  marca              text,
  modelo             text,
  anio               integer check (anio between 1900 and 2100),
  created_at         timestamptz not null default now(),

  -- Formato viejo: ABC123 · Mercosur: AB123CD (ya normalizados, sin espacios)
  constraint patente_formato check (
    patente_normalizada ~ '^[A-Z]{3}[0-9]{3}$' or
    patente_normalizada ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$'
  )
);

-- La patente es única DENTRO de cada lubricentro, no globalmente:
-- el mismo auto puede ser cliente de dos lubricentros distintos.
create unique index vehiculos_patente_por_tenant
  on vehiculos(lubricentro_id, patente_normalizada);

create index vehiculos_cliente_idx on vehiculos(cliente_id);

comment on column vehiculos.patente_normalizada is 'Sin espacios ni guiones, mayúsculas. Se completa sola por trigger.';

-- ---------- Services: la cabecera del cartón ----------
create table services (
  id                  uuid primary key default gen_random_uuid(),
  lubricentro_id      uuid not null references lubricentros(id) on delete restrict,
  sucursal_id         uuid not null references sucursales(id) on delete restrict,
  vehiculo_id         uuid not null references vehiculos(id) on delete restrict,
  usuario_id          uuid not null references usuarios(id) on delete restrict,

  -- Los cuatro campos de la cabecera del papel
  fecha               date not null default current_date,
  kilometros          integer not null check (kilometros >= 0 and kilometros <= 3000000),
  aceite_tipo         text not null,
  prox_service_km     integer not null check (prox_service_km > 0),

  -- Snapshot del producto: si mañana borran el producto del catálogo,
  -- el cartón sigue diciendo qué aceite le pusieron a ese auto.
  aceite_producto_id  uuid references productos(id) on delete set null,
  aceite_nombre       text,

  observaciones       text,
  anulado             boolean not null default false,

  -- Desbloqueo extraordinario desde el panel Fidelli, con su auditoría
  desbloqueado_hasta  timestamptz,
  desbloqueado_por    uuid references usuarios(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint prox_mayor_actual check (prox_service_km > kilometros),
  constraint aceite_tipo_no_vacio check (char_length(trim(aceite_tipo)) >= 2)
);

create index services_vehiculo_idx on services(vehiculo_id, fecha desc) where not anulado;
create index services_lubricentro_fecha_idx on services(lubricentro_id, fecha desc);
create index services_sucursal_idx on services(sucursal_id, fecha desc);
create index services_created_idx on services(lubricentro_id, created_at desc);

comment on column services.created_at is 'Ancla de la regla de 24 hs: editable mientras now() - created_at < 24h.';
comment on column services.aceite_tipo is 'Viscosidad 100% manual (15W40). Dato crítico, nunca autocompletado.';

-- ---------- Service items: los 11 renglones ----------
create table service_items (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references services(id) on delete cascade,
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  item_tipo       item_tipo not null,
  producto_id     uuid references productos(id) on delete set null,
  detalle         text,
  created_at      timestamptz not null default now()
);

-- SI = la fila existe. NO = no existe. Sin booleanos.
create unique index service_items_unico
  on service_items(service_id, item_tipo);

create index service_items_service_idx on service_items(service_id);

comment on table service_items is 'La fila existe = el renglón está marcado. Los 11 tipos vienen del cartón físico.';