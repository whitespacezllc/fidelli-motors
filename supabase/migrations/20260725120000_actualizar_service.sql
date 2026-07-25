-- ============================================================
-- Fidelli Motors · Edición del cartón, en una transacción
--
-- Editar un service son tres escrituras que tienen que ser atómicas: el
-- UPDATE de la cabecera y la reconciliación de los renglones (borrar los
-- desmarcados, crear los nuevos, actualizar los que cambiaron de
-- detalle). Desde el front serían viajes sueltos: si el segundo falla,
-- el cartón queda diciendo una cosa en la cabecera y otra en los
-- renglones. Una función de plpgsql corre en una sola transacción.
--
-- POSTURA DE SEGURIDAD, explícita — la misma de guardar_service:
--   · NO es security definer. Corre con los permisos de quien llama:
--     la policy services_edicion (ventana de 24 hs o desbloqueo) y la
--     policy items_escritura se evalúan igual que si los UPDATE
--     vinieran del front. La regla de las 24 horas la sigue imponiendo
--     RLS, no esta función.
--   · search_path fijo.
--   · No recibe lubricentro_id ni usuario: el tenant lo filtra RLS y
--     el autor original no se pisa (usuario_id no está en el SET).
--   · El vehículo NO es parámetro: un service no se reasigna a otro
--     auto. Si se cargó en el equivocado, la salida es anular y volver
--     a cargar — reasignar ensucia dos historiales.
--   · Se revoca de PUBLIC y se concede solo a authenticated. anon no
--     la puede ejecutar.
--
-- EL DETALLE QUE IMPORTA: cuando RLS rechaza un UPDATE no lanza error —
-- la fila queda fuera del USING y el UPDATE afecta 0 filas, en
-- silencio. Por eso el found se chequea a mano y se convierte en un
-- error con nombre ('service_no_editable'), que el front traduce a su
-- mensaje: "Este service se fijó mientras lo editabas." Sin este
-- chequeo, el mecánico que dejó la pantalla abierta 25 horas vería un
-- "guardado" que no guardó nada.
--
-- Como todas las policies comparan contra now() —que dentro de una
-- transacción es fijo—, si la cabecera pasó la ventana, los renglones
-- también pasan: no hay carrera entre el UPDATE y la reconciliación.
-- ============================================================

create or replace function actualizar_service(
  p_service_id         uuid,
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
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item jsonb;
begin
  -- La cabecera. El WHERE agrega not anulado: un service anulado no se
  -- edita — se recarga. RLS agrega tenant + ventana de 24 hs.
  update services set
    sucursal_id        = p_sucursal_id,
    fecha              = p_fecha,
    kilometros         = p_kilometros,
    aceite_tipo        = trim(p_aceite_tipo),
    prox_service_km    = p_prox_service_km,
    aceite_producto_id = p_aceite_producto_id,
    aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
    observaciones      = nullif(trim(p_observaciones), '')
  where id = p_service_id
    and not anulado;

  if not found then
    -- Fijado, anulado, o de otro tenant: para quien llama es lo mismo.
    raise exception 'service_no_editable';
  end if;

  -- Reconciliación de renglones.
  -- 1. Los desmarcados se borran. Con p_items vacío borra todos: un
  --    cartón puede quedar sin renglones marcados.
  delete from service_items si
  where si.service_id = p_service_id
    and si.item_tipo not in (
      select (i->>'tipo')::item_tipo
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    );

  -- 2. Los que siguen: si el renglón ya existe se actualiza su detalle,
  --    si no existe se crea. (service_id, item_tipo) es único, así que
  --    update-luego-insert no puede duplicar.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    update service_items set
      producto_id = nullif(v_item->>'producto_id', '')::uuid,
      detalle     = nullif(trim(v_item->>'detalle'), '')
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      -- lubricentro_id lo completa el trigger service_items_heredar_tenant.
      insert into service_items (service_id, item_tipo, producto_id, detalle)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), '')
      );
    end if;
  end loop;
end;
$$;

comment on function actualizar_service is
  'Edita el cartón completo (cabecera + reconciliación de renglones) en una transacción. Security invoker: la ventana de 24 hs la impone RLS, y el found convierte el rechazo silencioso en service_no_editable.';

revoke execute on function actualizar_service(uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text) from public;
grant execute on function actualizar_service(uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text) to authenticated;
