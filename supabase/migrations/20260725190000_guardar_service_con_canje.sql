-- ============================================================
-- Fidelli Motors · El canje entra en la transacción del service
--
-- POR QUÉ CAMBIA
-- El Sprint 1 dejó el canje como un botón en el post-guardado: se
-- confirmaba el service y después había que acordarse de marcar el
-- premio. Si el mecánico se distraía, el cliente se llevaba el descuento
-- y el canje no quedaba registrado: el contador no se reseteaba y en el
-- service siguiente le volvía a corresponder un premio. El Flow de
-- Fidelización lo pone donde va — "el canje se registra recién al
-- confirmar el service (Momento 2), atado al service_id. Si el service
-- no se confirma, no queda nada" — y para eso el canje tiene que viajar
-- en la misma transacción que el service.
--
-- POSTURA DE SEGURIDAD — sin cambios respecto de la versión anterior:
--   · Sigue siendo SECURITY INVOKER. Las policies de services,
--     service_items y canjes se evalúan con los permisos de quien llama.
--     El parámetro nuevo no abre ninguna puerta.
--   · search_path fijo.
--   · El tenant sigue saliendo de mi_lubricentro_id(), no de un
--     parámetro. El premio tampoco se recibe: se resuelve con
--     premio_disponible(vehiculo), que lee el premio activo del
--     lubricentro dueño de ESE vehículo. No hay premio_id que falsear
--     para canjear contra otro tenant.
--   · Se revoca de PUBLIC y se concede solo a authenticated.
--
-- SE HACE DROP Y NO SOLO REPLACE: agregar un parámetro —aunque tenga
-- default— crea otra firma, y un "create or replace" dejaría las dos
-- funciones conviviendo y las llamadas ambiguas.
--
-- EL DETALLE DEL CONTADOR: el canje se inserta después del service, y
-- los dos toman created_at = now(), que dentro de una transacción es el
-- mismo instante para ambos. premio_disponible cuenta los services con
-- created_at > (fecha del último canje), con > estricto, así que el
-- service donde se aplicó el premio NO cuenta para el ciclo siguiente:
-- el contador queda en cero, que es lo que pide el flow ("el contador
-- vuelve a cero" después del canje). No es una casualidad de reloj —
-- now() es fijo por transacción.
-- ============================================================

drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text
);

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
      -- Entre que se pintó el cartón y se confirmó pudo cambiar la meta
      -- (las reglas aplican a todos al instante) o entrar otro service.
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

  -- Un renglón marcado ES la existencia de la fila: no hay booleano.
  -- lubricentro_id lo completa el trigger service_items_heredar_tenant.
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into service_items (service_id, item_tipo, producto_id, detalle)
    values (
      v_service,
      (v_item->>'tipo')::item_tipo,
      nullif(v_item->>'producto_id', '')::uuid,
      nullif(trim(v_item->>'detalle'), '')
    );
  end loop;

  -- El canje, atado al service. El índice único canjes_un_service impide
  -- el doble registro por doble toque.
  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  return v_service;
end;
$$;

comment on function guardar_service is
  'Guarda el cartón completo (service + renglones + canje opcional) en una transacción. Security invoker: respeta el RLS de quien llama.';

revoke execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean
) from public;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean
) to authenticated;
