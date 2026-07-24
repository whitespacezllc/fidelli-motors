-- ============================================================
-- Fidelli Motors · Registro
-- canjes, contactos, landing_busquedas
-- ============================================================

-- ---------- Canjes de premios ----------
create table canjes (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  vehiculo_id     uuid not null references vehiculos(id) on delete restrict,
  premio_id       uuid not null references premios(id) on delete restrict,
  -- El service donde se aplicó. Opcional porque el premio podría
  -- canjearse fuera de un service, aunque el MVP siempre lo asocia.
  service_id      uuid references services(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- El ciclo con reset lee el último canje del vehículo: este índice lo resuelve
create index canjes_vehiculo_idx on canjes(vehiculo_id, created_at desc);
create index canjes_lubricentro_idx on canjes(lubricentro_id, created_at desc);

-- Un canje por service: evita el doble registro por doble toque
create unique index canjes_un_service
  on canjes(service_id)
  where service_id is not null;

comment on table canjes is 'La plataforma registra el canje; el descuento lo aplica el lubri en su caja.';

-- ---------- Contactos de retención ----------
create table contactos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  vehiculo_id     uuid not null references vehiculos(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  estado          estado_contacto not null,
  canal           canal_contacto not null default 'whatsapp',
  created_at      timestamptz not null default now()
);

-- La regla de un contacto por estado se resuelve con este índice
create index contactos_vehiculo_estado_idx
  on contactos(vehiculo_id, estado, created_at desc);

create index contactos_lubricentro_idx on contactos(lubricentro_id, created_at desc);

comment on table contactos is 'Un contacto por estado: si el vehículo cambia de estado, se habilita uno nuevo.';

-- ---------- Búsquedas en la landing pública ----------
create table landing_busquedas (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  patente         text not null,
  encontrada      boolean not null,
  created_at      timestamptz not null default now()
);

create index landing_busquedas_lubricentro_idx
  on landing_busquedas(lubricentro_id, created_at desc);

-- Los leads: patentes buscadas que no existen en este lubricentro
create index landing_busquedas_leads_idx
  on landing_busquedas(lubricentro_id, patente, created_at desc)
  where not encontrada;

comment on table landing_busquedas is 'Métrica de escaneo del case study + captura de leads (encontrada = false).';