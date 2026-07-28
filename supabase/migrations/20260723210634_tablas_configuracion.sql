-- ============================================================
-- Fidelli Motors · Configuración por lubricentro
-- config_experiencia, mensaje_templates, productos, premios
-- ============================================================

-- ---------- Diseño de experiencia: cómo se ve la landing pública ----------
create table config_experiencia (
  lubricentro_id   uuid primary key references lubricentros(id) on delete restrict,
  logo_url         text,
  color_primario   text not null default '#0A0A0A',
  campos_visibles  jsonb not null default '{
    "mostrar_productos": true,
    "mostrar_observaciones": false,
    "mostrar_fidelizacion": true,
    "mostrar_sucursal": true
  }'::jsonb,
  datos_contacto   jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),

  -- El color pinta la landing del cliente: tiene que ser hex válido
  constraint color_hex check (color_primario ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table config_experiencia is 'Uno a uno con el tenant. La landing es un shell neutro que se pinta con esto.';
comment on column config_experiencia.datos_contacto is 'jsonb: {telefono, direccion, horarios, whatsapp, instagram}';

-- ---------- Templates de WhatsApp ----------
create table mensaje_templates (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  tono            text not null,
  contenido       text not null,
  activo          boolean not null default false,
  created_at      timestamptz not null default now()
);

create index mensaje_templates_lubricentro_idx on mensaje_templates(lubricentro_id);

-- Un solo template activo por lubricentro: el que usa el panel de contacto
create unique index mensaje_templates_uno_activo
  on mensaje_templates(lubricentro_id)
  where activo;

comment on column mensaje_templates.contenido is 'Variables: {nombre} {vehiculo} {patente} {proximo_km}';

-- ---------- Catálogo de productos ----------
create table productos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  categoria       categoria_producto not null,
  nombre          text not null,
  marca           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index productos_lubricentro_idx on productos(lubricentro_id, categoria) where activo;

-- Evita duplicados exactos en el catálogo del mismo lubricentro
create unique index productos_sin_duplicados
  on productos(lubricentro_id, categoria, lower(nombre), coalesce(lower(marca), ''));

-- ---------- Premios de fidelización ----------
create table premios (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  meta_services   integer not null check (meta_services between 2 and 50),
  descripcion     text not null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index premios_lubricentro_idx on premios(lubricentro_id) where activo;

-- Un solo premio activo por lubricentro en el MVP:
-- el ciclo con reset necesita una meta vigente inequívoca.
create unique index premios_uno_activo
  on premios(lubricentro_id)
  where activo;

comment on table premios is 'Ciclo con reset: se cuenta desde el último canje contra la meta vigente.';