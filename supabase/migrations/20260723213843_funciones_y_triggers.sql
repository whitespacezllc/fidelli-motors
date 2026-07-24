-- ============================================================
-- Fidelli Motors · Funciones y triggers
-- Normalización de patentes, updated_at, premio_disponible
-- ============================================================

-- ---------- 1. Normalización de patentes ----------
-- "ab 123 cd" · "AB-123-CD" · "ab123cd" → "AB123CD"
create or replace function normalizar_patente(entrada text)
returns text
language sql
immutable
strict
as $$
  select upper(regexp_replace(entrada, '[^a-zA-Z0-9]', '', 'g'))
$$;

comment on function normalizar_patente is 'Quita todo lo que no sea letra o número y pasa a mayúsculas.';

-- Trigger: el front manda la patente como la escribió el mecánico,
-- la base calcula la normalizada. Nunca se escribe a mano.
create or replace function vehiculos_normalizar()
returns trigger
language plpgsql
as $$
begin
  new.patente_normalizada := normalizar_patente(new.patente);
  return new;
end;
$$;

create trigger vehiculos_normalizar_patente
  before insert or update of patente on vehiculos
  for each row
  execute function vehiculos_normalizar();

-- ---------- 2. updated_at automático ----------
create or replace function tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger services_updated_at
  before update on services
  for each row
  execute function tocar_updated_at();

create trigger config_experiencia_updated_at
  before update on config_experiencia
  for each row
  execute function tocar_updated_at();

-- ---------- 3. Coherencia de tenant ----------
-- Un service no puede apuntar a una sucursal de OTRO lubricentro.
-- La FK sola no lo impide; este trigger sí.
create or replace function services_validar_tenant()
returns trigger
language plpgsql
as $$
declare
  suc_lub uuid;
  veh_lub uuid;
begin
  select lubricentro_id into suc_lub from sucursales where id = new.sucursal_id;
  select lubricentro_id into veh_lub from vehiculos where id = new.vehiculo_id;

  if suc_lub is distinct from new.lubricentro_id then
    raise exception 'La sucursal no pertenece a este lubricentro';
  end if;

  if veh_lub is distinct from new.lubricentro_id then
    raise exception 'El vehículo no pertenece a este lubricentro';
  end if;

  return new;
end;
$$;

create trigger services_tenant_coherente
  before insert or update on services
  for each row
  execute function services_validar_tenant();

-- El renglón hereda el tenant de su service: se completa solo
create or replace function service_items_heredar_tenant()
returns trigger
language plpgsql
as $$
begin
  select lubricentro_id into new.lubricentro_id
  from services where id = new.service_id;
  return new;
end;
$$;

create trigger service_items_tenant
  before insert on service_items
  for each row
  execute function service_items_heredar_tenant();

-- ---------- 4. Fidelización: el ciclo con reset ----------
-- Cuenta los services desde el último canje contra la meta VIGENTE.
-- Sin contadores guardados: se calcula en vivo, siempre.
create or replace function premio_disponible(p_vehiculo_id uuid)
returns table (
  disponible        boolean,
  services_ciclo    integer,
  meta_services     integer,
  premio_id         uuid,
  descripcion       text
)
language sql
stable
as $$
  with vehiculo as (
    select v.id, v.lubricentro_id
    from vehiculos v
    where v.id = p_vehiculo_id
  ),
  premio_vigente as (
    select p.id, p.meta_services, p.descripcion
    from premios p
    join vehiculo ve on ve.lubricentro_id = p.lubricentro_id
    where p.activo
    limit 1
  ),
  ultimo_canje as (
    select max(c.created_at) as fecha
    from canjes c
    where c.vehiculo_id = p_vehiculo_id
  ),
  conteo as (
    select count(*)::integer as n
    from services s, ultimo_canje uc
    where s.vehiculo_id = p_vehiculo_id
      and not s.anulado
      and (uc.fecha is null or s.created_at > uc.fecha)
  )
  select
    coalesce(c.n >= pv.meta_services, false) as disponible,
    c.n                                       as services_ciclo,
    pv.meta_services,
    pv.id                                     as premio_id,
    pv.descripcion
  from conteo c
  left join premio_vigente pv on true;
$$;

comment on function premio_disponible is 'Ciclo con reset: cuenta desde el último canje contra la meta vigente. Sin snapshots.';

-- ---------- 5. La regla de las 24 horas ----------
create or replace function service_editable(p_service_id uuid)
returns boolean
language sql
stable
as $$
  select
    now() - s.created_at < interval '24 hours'
    or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta)
  from services s
  where s.id = p_service_id;
$$;

comment on function service_editable is 'Editable si tiene menos de 24 hs o si un superadmin abrió ventana de desbloqueo.';