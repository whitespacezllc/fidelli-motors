-- ============================================================
-- Fidelli Motors · Notas por vehículo
--
-- El mecánico ve las cubiertas delanteras para cambio, pero eso no es
-- parte del service que el cliente vino a hacer. Lo deja asentado acá:
-- una recomendación sobre EL AUTO que sobrevive al service puntual y
-- que el cliente ve en su cartón, con la fecha en que se observó.
--
-- NO reemplaza services.observaciones: aquello es sobre UNA visita
-- ("vino con el motor caliente"); esto es sobre el vehículo,
-- persistente ("cubiertas delanteras para cambio").
--
-- LAS DOS REGLAS DE LA FEATURE:
--   · Visibilidad explícita POR NOTA (visible_cliente). Default true —
--     el caso de Bruno — pero existe porque tarde o temprano alguien
--     escribe algo interno ("este cliente regatea") y sin la marca se
--     filtraría a la landing.
--   · La fecha que ve el cliente es SIEMPRE created_at. Corregir un
--     typo tres meses después no convierte la nota en "de hoy": la
--     fecha mentiría sobre cuándo se vio la cubierta. updated_at queda
--     para el "editada el…" del panel.
--
-- A diferencia de los services, las notas SÍ se eliminan con DELETE:
-- son recomendaciones, no registro histórico de algo que pasó.
--
-- on delete RESTRICT en las tres FKs, como todo lo demás. Se evaluó
-- cascade para vehiculo_id (una nota sin vehículo no significa nada),
-- pero los vehículos no tienen borrado en el producto — el restrict no
-- agrega fricción real y mantiene la convención de la casa.
-- ============================================================

create table notas_vehiculo (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  vehiculo_id     uuid not null references vehiculos(id) on delete restrict,
  -- Quién la escribió: se muestra en el panel ("por Martín").
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  contenido       text not null,
  visible_cliente boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint contenido_no_vacio check (char_length(trim(contenido)) >= 2)
);

create index notas_vehiculo_vehiculo_idx on notas_vehiculo(vehiculo_id);
create index notas_vehiculo_lubricentro_idx on notas_vehiculo(lubricentro_id);

comment on table notas_vehiculo is
  'Recomendaciones del mecánico sobre el vehículo (no sobre una visita). visible_cliente decide si sale por get_carton; la fecha pública es siempre created_at.';

-- El tenant de la nota se DERIVA del vehículo, no se cree lo que manda el
-- cliente — mismo patrón que service_items_heredar_tenant.
--
-- Es la garantía de aislamiento, no una comodidad. Sin esto, la policy de
-- abajo solo compara el lubricentro_id que vino en el insert contra el de
-- la sesión: un tenant podía mandar SU lubricentro_id con el vehiculo_id
-- de OTRO y colar una nota en el cartón público ajeno (get_carton une por
-- vehiculo_id). Derivando el tenant del vehículo, el with check pasa a
-- comparar contra el dueño REAL del auto y rechaza. Va también en UPDATE:
-- si no, se movería una nota propia a un vehículo ajeno con el mismo
-- efecto.
create or replace function notas_vehiculo_heredar_tenant()
returns trigger
language plpgsql
as $$
begin
  select lubricentro_id into new.lubricentro_id
  from vehiculos where id = new.vehiculo_id;
  return new;
end;
$$;

create trigger notas_vehiculo_tenant
  before insert or update on notas_vehiculo
  for each row
  execute function notas_vehiculo_heredar_tenant();

-- updated_at automático, con el trigger de la casa. Corre después del de
-- tenant (orden alfabético de nombres: _tenant < _updated_at).
create trigger notas_vehiculo_updated_at
  before update on notas_vehiculo
  for each row
  execute function tocar_updated_at();

-- RLS, patrón tenant de siempre: el lubricentro ve y escribe LO SUYO.
-- anon no tiene grant sobre la tabla — el cliente final las recibe solo
-- por get_carton, que filtra visible_cliente.
alter table notas_vehiculo enable row level security;

create policy notas_tenant on notas_vehiculo for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());
