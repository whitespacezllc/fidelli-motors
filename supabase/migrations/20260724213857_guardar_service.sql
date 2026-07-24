-- ============================================================
-- Fidelli Motors · Guardado del cartón, en una transacción
--
-- Un service sin sus renglones es un cartón mentiroso: dice que se hizo
-- el service pero no qué se tocó. Los dos inserts tienen que ser
-- atómicos, y desde el front serían dos viajes sueltos — si el segundo
-- falla queda un service vacío que ya no se puede completar (a las 24 hs
-- se fija). Una función de plpgsql corre dentro de una sola transacción.
--
-- POSTURA DE SEGURIDAD, explícita:
--   · NO es security definer. Corre con los permisos de quien llama, así
--     que las policies de services y service_items se evalúan igual que
--     si el insert viniera del front. No saltea RLS: no hay nada acá que
--     justifique una puerta.
--   · search_path fijo.
--   · No recibe lubricentro_id: sale de la sesión con mi_lubricentro_id().
--     No hay parámetro que falsear para escribir en otro tenant.
--   · El usuario que firma el service es auth.uid(), no un parámetro.
--   · Se revoca de PUBLIC (Postgres se lo otorga solo a toda función
--     nueva) y se concede únicamente a authenticated.
-- ============================================================

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
  p_observaciones      text default null
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
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
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

  return v_service;
end;
$$;

comment on function guardar_service is
  'Guarda el cartón completo (service + renglones) en una transacción. Security invoker: respeta el RLS de quien llama.';

revoke execute on function guardar_service(uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text) from public;
grant execute on function guardar_service(uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text) to authenticated;
