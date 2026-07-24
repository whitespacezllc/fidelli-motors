-- ============================================================
-- Fidelli Motors · Tablas de plataforma
-- lubricentros, planes, suscripciones, usuarios, sucursales
-- ============================================================

-- ---------- Planes comerciales (globales, solo Fidelli los administra) ----------
create table planes (
  id                       uuid primary key default gen_random_uuid(),
  nombre                   text not null,
  precio_mensual           numeric(12,2) not null check (precio_mensual >= 0),
  descuento_semestral_pct  numeric(5,2) not null default 10 check (descuento_semestral_pct between 0 and 100),
  descuento_anual_pct      numeric(5,2) not null default 15 check (descuento_anual_pct between 0 and 100),
  activo                   boolean not null default true,
  created_at               timestamptz not null default now()
);

comment on table planes is 'Catálogo comercial de Fidelli Motors. El ajuste trimestral se ejecuta cambiando precio_mensual.';

-- ---------- Lubricentros: el tenant ----------
create table lubricentros (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  slug               text not null unique,
  activo             boolean not null default true,
  calcos_entregadas  integer not null default 0 check (calcos_entregadas >= 0),
  created_at         timestamptz not null default now(),

  -- El slug vive en la URL pública y en los QR impresos:
  -- minúsculas, números y guiones. Nada más.
  constraint slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint slug_largo check (char_length(slug) between 3 and 60),
  -- Reservados: chocarían con rutas del producto
  constraint slug_no_reservado check (
    slug not in ('admin','api','auth','login','app','www','dashboard','panel','fidelli')
  )
);

comment on column lubricentros.slug is 'fidellimotors.app/[slug] — INMUTABLE una vez impresas las calcos.';

-- ---------- Sucursales ----------
create table sucursales (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  nombre          text not null,
  direccion       text,
  telefono        text,
  activa          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index sucursales_lubricentro_idx on sucursales(lubricentro_id);

-- ---------- Usuarios: extiende auth.users de Supabase ----------
create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  lubricentro_id  uuid references lubricentros(id) on delete restrict,
  rol             rol_usuario not null,
  nombre          text not null,
  email           text not null,
  created_at      timestamptz not null default now(),

  -- Un owner pertenece a un lubricentro; un superadmin (Fidelli) no.
  constraint rol_coherente check (
    (rol = 'owner' and lubricentro_id is not null) or
    (rol = 'superadmin' and lubricentro_id is null)
  )
);

create index usuarios_lubricentro_idx on usuarios(lubricentro_id);

comment on table usuarios is 'Espejo de auth.users con rol y tenant. El id ES el de Supabase Auth.';

-- ---------- Suscripciones ----------
create table suscripciones (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  plan_id         uuid not null references planes(id) on delete restrict,
  estado          estado_suscripcion not null default 'trial',
  periodo         periodo_suscripcion not null default 'mensual',
  descuento_pct   numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  inicio          date not null default current_date,
  vencimiento     date not null,
  created_at      timestamptz not null default now(),

  constraint vencimiento_posterior check (vencimiento >= inicio)
);

create index suscripciones_lubricentro_idx on suscripciones(lubricentro_id);
create index suscripciones_vencimiento_idx on suscripciones(vencimiento) where estado in ('trial','activa');

comment on column suscripciones.descuento_pct is 'Founding = 50. Porcentual sobre la lista vigente, nunca monto congelado.';

-- ---------- Pagos ----------
create table pagos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  suscripcion_id  uuid not null references suscripciones(id) on delete restrict,
  registrado_por  uuid not null references usuarios(id) on delete restrict,
  periodo_desde   date not null,
  periodo_hasta   date not null,
  monto           numeric(12,2) not null check (monto >= 0),
  fecha_pago      date not null,
  created_at      timestamptz not null default now(),

  constraint periodo_valido check (periodo_hasta >= periodo_desde)
);

create index pagos_lubricentro_idx on pagos(lubricentro_id, periodo_hasta desc);

comment on table pagos is 'Transferencias registradas desde /fidelli. registrado_por es la firma de auditoría.';