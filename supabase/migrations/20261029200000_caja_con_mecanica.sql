-- ============================================================
-- Fidelli Motors · Service de caja + mecánica en UNA carga
--
-- Lo pidió un taller que tiene el service de caja automática prendido:
-- al final del cartón de una caja quiere la misma pregunta que tiene el
-- cartón de aceite —«¿Se le hizo algo de mecánica?»— y cargar los dos
-- trabajos de la visita de una vez. Son dos trabajos y dos tarjetas, como
-- en el service: la caja y SU mecánica adjunta, nacidas juntas.
--
-- Lo que cambia, y es poco a propósito:
--   · services_validar_vinculo: el destino de cargado_con_id puede ser un
--     service O una caja (`@vinculo-tipo`). Una mecánica o un trabajo de
--     gomería siguen sin poder ser anfitriones.
--   · guardar_service: la puerta de p_mecanica acepta p_tipo = 'caja'
--     (`@adjunta-solo-service`). La rama es la misma: llamada recursiva
--     con p_tipo => 'mecanica', misma fecha/km/sucursal, mismo now(), el
--     vínculo con un UPDATE. El error conserva su nombre
--     (mecanica_adjunta_solo_en_service: el front lo traduce por ese
--     nombre) y ahora significa «solo en un service o en una caja».
--   · actualizar_service: la rama de la caja termina en su propio
--     `return`, así que la propagación de fecha/km/sucursal a la mecánica
--     adjunta (`@propaga-visita`, en la rama del service) no la alcanzaba.
--     Se copia en la rama de la caja (`@propaga-visita-caja`), con el
--     mismo manejo del 42501.
--
-- Lo que NO cambia, y por qué:
--   · cargado_con_solo_mecanica (el CHECK en positivo): una caja sigue sin
--     ser adjunta de nadie. R42b lo prueba.
--   · prox_caja_solo_caja y caja_coherente: la mecánica adjunta nace por la
--     llamada recursiva con prox_caja_km en null, como siempre.
--   · premio_disponible / ciclos_fidelizacion: cuentan fechas distintas;
--     caja + mecánica del mismo día ya valían 1 con alcance 'todos' y 0
--     con 'services' (la caja no es un service). Nada que tocar. R49d lo
--     mide igual.
--   · vista_proximos_caja: el ritmo y el odómetro salen de TODOS los
--     trabajos con kilómetros, y la mecánica adjunta repite el punto de la
--     caja (misma fecha, mismos km): la proyección no se mueve. R49h.
--   · las policies: la llamada recursiva pasa por services_insercion con
--     plan_permite('mecanica'), y un tenant con caja pero sin mecánica
--     recibe 42501 y la transacción entera vuelve: ni la caja queda. R49b.
--
-- CÓMO ESTÁ ESCRITO: las dos funciones van COPIADAS TEXTUALES de
-- 20261004120100 y el trigger de 20260929100000, con las líneas de arriba
-- cambiadas o agregadas (generado con un script que exige que cada
-- reemplazo matchee una sola vez, y diffeado). Las firmas no cambian:
-- `create or replace` sobre las mismas, sin DROP; los grants se conservan.
-- Los marcadores `-- @` viajan intactos: desde ahora
-- scripts/regresion-visita.sh y scripts/regresion-caja.sh muerden
-- guardar_service y actualizar_service DE ESTE ARCHIVO (y el trigger
-- también), y scripts/regresion-caja-mecanica.sh rompe lo nuevo (R49).
-- ============================================================


-- ---------- 1 · El vínculo: un service o una caja como anfitrión ----------
-- Textual de 20260929100000, con el `in` en `@vinculo-tipo`. Sigue
-- exigiendo mismo vehículo y mismo tenant.
-- >>> services_validar_vinculo
create or replace function services_validar_vinculo()
returns trigger
language plpgsql
as $$
begin
  if new.cargado_con_id is null then
    return new;
  end if;
  if new.cargado_con_id = new.id then
    raise exception 'vinculo_invalido';
  end if;
  if not exists (
    select 1 from services s
    where s.id = new.cargado_con_id
      and s.vehiculo_id = new.vehiculo_id -- @vinculo-vehiculo
      and s.lubricentro_id = new.lubricentro_id
      and s.tipo in ('service', 'caja') -- @vinculo-tipo
  ) then
    raise exception 'vinculo_invalido';
  end if;
  return new;
end;
$$;
-- <<< services_validar_vinculo

comment on function services_validar_vinculo is
  'Trigger de cargado_con_id: el vínculo de una mecánica adjunta apunta a un service o a un service de caja del MISMO vehículo y tenant (desde 20261029200000; antes, solo a un service). Nunca a sí misma, a una mecánica ni a un trabajo de gomería.';


-- ---------- 2 · guardar_service: la pareja también nace de una caja ----------
-- Textual de 20261004120100 más: la puerta `p_tipo not in ('service',
-- 'caja')` en `@adjunta-solo-service` y dos comentarios. Ni una línea de
-- las ramas cambia; la firma tampoco.
-- >>> guardar_service
create or replace function guardar_service(
  p_vehiculo_id          uuid,
  p_sucursal_id          uuid,
  p_fecha                date,
  p_kilometros           integer,
  p_aceite_tipo          text,
  p_prox_service_km      integer,
  p_items                jsonb default '[]'::jsonb,
  p_aceite_producto_id   uuid default null,
  p_aceite_nombre        text default null,
  p_observaciones        text default null,
  p_canjear_premio       boolean default false,
  p_tipo                 tipo_trabajo default 'service',
  p_trabajo_descripcion  text default null,
  p_pendientes           jsonb default '[]'::jsonb,
  p_resolver_pendientes  uuid[] default '{}'::uuid[],
  p_aceite_litros        numeric default null,
  p_ruedas               jsonb default '[]'::jsonb,
  p_alineacion           boolean default null,
  -- La mecánica adjunta (20260929100000): {descripcion, items:[{detalle,
  -- producto_id, cantidad}]} o null. Solo con p_tipo = 'service' y, desde
  -- 20261029200000, también con p_tipo = 'caja'.
  p_mecanica             jsonb default null,
  -- El próximo service de CAJA (20261004120100), en kilómetros. Obligatorio
  -- con p_tipo = 'caja'; null en los otros tres tipos.
  p_prox_caja_km         integer default null
)
returns uuid
language plpgsql
volatile
set search_path = public -- @invoker
as $$
declare
  v_lubricentro uuid;
  v_service     uuid;
  v_item        jsonb;
  v_premio      record;
  v_detalle     text;
  v_pend        jsonb;
  v_desc        text;
  v_cantidad    numeric;
  v_producto    uuid;
  v_rueda       jsonb;
  v_ruedas      jsonb;
  v_colocada    boolean;
  v_mecanica    uuid;
  v_items_mec   jsonb;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  if p_canjear_premio then
    select * into v_premio from premio_disponible(p_vehiculo_id);
    if not coalesce(v_premio.disponible, false) then
      raise exception 'premio_no_disponible';
    end if;
    -- El premio con alcance 'services' cuenta cambios de aceite y nada
    -- más: ni mecánica ni neumáticos avanzan el ciclo. Es la misma regla
    -- de 20260822210000, ahora nombrando a los dos tipos que no son
    -- service en vez de solo a la mecánica.
    if p_tipo <> 'service' and v_premio.alcance is distinct from 'todos' then
      raise exception 'canje_solo_en_service';
    end if;
  end if;

  if p_tipo = 'neumaticos' then
    -- Las ruedas con sustancia, ya filtradas: una fila vale si se le hizo
    -- algo o si se la midió (el mismo criterio del CHECK).
    v_ruedas := coalesce((
      select jsonb_agg(r)
      from jsonb_array_elements(coalesce(p_ruedas, '[]'::jsonb)) r
      where coalesce((r->>'colocada')::boolean, false)
         or coalesce((r->>'rotada')::boolean, false)
         or coalesce((r->>'balanceada')::boolean, false)
         or coalesce((r->>'reparada')::boolean, false)
         or nullif(r->>'profundidad_mm', '') is not null
    ), '[]'::jsonb);

    -- Un trabajo vacío no se guarda: o hay alguna rueda, o se alineó.
    if jsonb_array_length(v_ruedas) = 0 and not coalesce(p_alineacion, false) then
      raise exception 'neumaticos_sin_trabajo';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, fecha, kilometros, observaciones, alineacion
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'neumaticos', p_fecha, p_kilometros,
      nullif(trim(p_observaciones), ''),
      coalesce(p_alineacion, false)
    )
    returning id into v_service;

    perform guardar_ruedas(v_service, v_ruedas);
    -- El beneficio de la compra: con dos o más cubiertas colocadas, y solo
    -- si el taller lo tiene prendido (beneficio_km > 0). Lo calcula la
    -- base desde config_neumaticos; el front nunca lo inventa.
    perform calcular_beneficio_neumaticos(v_service);

    -- EL STOCK de las cubiertas: una por rueda COLOCADA con producto del
    -- catálogo. Mismo patrón que el renglón de 20260902120000:154 y misma
    -- condición de siempre —solo los productos que llevan stock—. Una
    -- rueda MEDIDA que referencia un producto no descuenta: no salió nada
    -- del estante.
    for v_rueda in select * from jsonb_array_elements(v_ruedas)
    loop
      v_producto := nullif(v_rueda->>'producto_id', '')::uuid;
      v_colocada := coalesce((v_rueda->>'colocada')::boolean, false);
      if v_producto is not null and v_colocada then
        update productos set stock = stock - 1
        where id = v_producto
          and lubricentro_id = v_lubricentro
          and stock is not null;
      end if;
    end loop;

  elsif p_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then -- @descripcion-minima
      raise exception 'descripcion_requerida';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, trabajo_descripcion, fecha, kilometros, observaciones
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'mecanica', trim(p_trabajo_descripcion), p_fecha, p_kilometros,
      nullif(trim(p_observaciones), '')
    )
    returning id into v_service;
  elsif p_tipo = 'caja' then
    -- EL SERVICE DE CAJA AUTOMÁTICA (20261004120100), el cuarto tipo. Se
    -- parece a un service en la forma —fecha, km, un aceite, renglones, un
    -- próximo— y es OTRO trabajo: su aceite es un ATF, sus renglones son
    -- los cuatro de la caja y su próximo vive en `prox_caja_km`.
    -- `prox_service_km` queda en null: el cambio de aceite de motor no se
    -- entera, y vista_proximos_service ni la mira (filtra tipo = 'service').
    --
    -- Los tres errores van NOMBRADOS para que la acción los traduzca. El
    -- CHECK caja_coherente es la garantía; esto es el mensaje.
    if p_kilometros is null or p_kilometros < 0 then -- @caja-km
      raise exception 'caja_sin_kilometros';
    end if;
    if p_aceite_tipo is null or char_length(trim(p_aceite_tipo)) < 2 then -- @caja-aceite
      raise exception 'aceite_caja_requerido';
    end if;
    -- El salto del próximo, acotado del lado de la base: de 20.000 a
    -- 200.000 km sobre los kilómetros de hoy (esSaltoCajaValido, en
    -- lib/renglones.ts, es el espejo que pinta el aviso). Un cero de más
    -- en un 80.000 dejaría al auto fuera de «A quién llamar» por décadas.
    if p_prox_caja_km is null
       or p_prox_caja_km - p_kilometros not between 20000 and 200000 then -- @caja-salto
      raise exception 'salto_caja_invalido';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, fecha, kilometros, aceite_tipo, prox_caja_km,
      aceite_producto_id, aceite_nombre, observaciones, aceite_litros
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'caja', p_fecha, p_kilometros, trim(p_aceite_tipo), p_prox_caja_km,
      p_aceite_producto_id,
      nullif(trim(p_aceite_nombre), ''),
      nullif(trim(p_observaciones), ''),
      p_aceite_litros
    )
    returning id into v_service;

    -- EL ACEITE DE CAJA baja con la misma lógica que el de motor (la rama
    -- del service, acá abajo, explica el porqué): a granel, los litros
    -- anotados y solo si vinieron; envasado, un bidón por trabajo. Sin
    -- litros sugeridos: el front nunca los precarga en una caja.
    if p_aceite_producto_id is not null then
      update productos p
      set stock = p.stock - case p.unidad
                              when 'litro' then p_aceite_litros
                              else 1
                            end
      where p.id = p_aceite_producto_id -- @caja-stock-aceite
        and p.lubricentro_id = v_lubricentro
        and p.stock is not null
        and (p.unidad <> 'litro' or p_aceite_litros is not null);
    end if;

    -- LOS RENGLONES: prendido = hecho. En un service de caja no existe el
    -- «revisado y OK» del cartón de aceite, así que `cambiado` se guarda
    -- true SIEMPRE, venga lo que venga en el jsonb. Se pisa la clave acá y
    -- los renglones se insertan en el loop común de más abajo, con el
    -- mismo casteo genérico (regla 14: ninguna función enumera valores de
    -- item_tipo) y el mismo descuento de stock por cantidad que los de un
    -- service. Ni una línea de ese loop sabe de cajas.
    p_items := coalesce((
      select jsonb_agg(r.item || jsonb_build_object('cambiado', true) order by r.n) -- @caja-hecho
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as r(item, n)
    ), '[]'::jsonb);
  else
    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      fecha, kilometros, aceite_tipo, prox_service_km,
      aceite_producto_id, aceite_nombre, observaciones, aceite_litros
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      p_fecha, p_kilometros, trim(p_aceite_tipo), p_prox_service_km,
      p_aceite_producto_id,
      nullif(trim(p_aceite_nombre), ''),
      nullif(trim(p_observaciones), ''),
      p_aceite_litros
    )
    returning id into v_service;

    -- EL ACEITE baja según la UNIDAD del producto, no según lo que tipeó
    -- el mecánico. Solo si el producto lleva stock:
    --   · 'litro'  → los litros del service, y solo si vinieron. Sin dato,
    --                el stock no se mueve — el stock es opcional; la
    --                velocidad no.
    --   · 'unidad' → UNA unidad por service, con o sin litros. El stock
    --                cuenta bidones y un cambio de aceite abre uno; restar
    --                litros acá era vaciar cuatro bidones por service.
    if p_aceite_producto_id is not null then
      update productos p
      set stock = p.stock - case p.unidad
                              when 'litro' then p_aceite_litros
                              else 1
                            end
      where p.id = p_aceite_producto_id
        and p.lubricentro_id = v_lubricentro
        and p.stock is not null
        and (p.unidad <> 'litro' or p_aceite_litros is not null);
    end if;
  end if;

  -- Los renglones, con su cantidad (default 1: el caso normal no pide
  -- ni un toque más). El descuento va adentro del mismo loop.
  -- Neumáticos no tiene renglones: su detalle son las ruedas.
  if p_tipo <> 'neumaticos' then
    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      if p_tipo = 'mecanica' then
        v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
        if v_detalle is null then
          continue;
        end if;
      else
        v_detalle := nullif(trim(v_item->>'detalle'), '');
      end if;

      v_cantidad := coalesce((v_item->>'cantidad')::numeric, 1);
      v_producto := nullif(v_item->>'producto_id', '')::uuid;

      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        v_service,
        case when p_tipo = 'mecanica' then null else (v_item->>'tipo')::item_tipo end,
        v_producto,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true),
        v_cantidad
      );

      if v_producto is not null then
        update productos set stock = stock - v_cantidad
        where id = v_producto
          and lubricentro_id = v_lubricentro
          and stock is not null;
      end if;
    end loop;
  end if;

  -- Pendientes nuevos y tildados: idéntico al bloque 3.
  for v_pend in select * from jsonb_array_elements(coalesce(p_pendientes, '[]'::jsonb))
  loop
    v_desc := nullif(trim(coalesce(v_pend->>'descripcion', '')), '');
    if v_desc is null then
      continue;
    end if;
    if char_length(v_desc) < 5 then
      raise exception 'pendiente_invalido';
    end if;
    if nullif(v_pend->>'objetivo_fecha', '') is null
       and nullif(v_pend->>'objetivo_km', '') is null then
      raise exception 'pendiente_sin_objetivo';
    end if;

    insert into trabajos_pendientes (
      lubricentro_id, vehiculo_id, origen_service_id, usuario_id,
      descripcion, objetivo_fecha, objetivo_km, visible_cliente
    ) values (
      v_lubricentro, p_vehiculo_id, v_service, auth.uid(),
      v_desc,
      nullif(v_pend->>'objetivo_fecha', '')::date,
      nullif(v_pend->>'objetivo_km', '')::integer,
      coalesce((v_pend->>'visible_cliente')::boolean, false)
    );
  end loop;

  if array_length(p_resolver_pendientes, 1) > 0 then
    update trabajos_pendientes set
      estado = 'resuelto',
      resuelto_en = now(),
      resuelto_service_id = v_service
    where id = any(p_resolver_pendientes)
      and vehiculo_id = p_vehiculo_id
      and estado = 'pendiente';
  end if;

  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  -- LA MECÁNICA ADJUNTA (20260929100000): el «¿Se le hizo algo de
  -- mecánica?» del final del cartón. Es una SEGUNDA fila de services, tipo
  -- mecánica, con la fecha, los kilómetros y la sucursal del service —los
  -- CHECK por tipo obligan a dos filas, no existe una "combinada"—,
  -- guardada por esta misma función, en esta misma transacción:
  --   · si la mecánica no pasa (descripción corta, plan sin la feature), el
  --     service tampoco queda: la visita se guarda entera o no se guarda;
  --   · las dos filas nacen con el MISMO now(), y el canje también. Por
  --     eso la mecánica de la visita del canje no cuenta para el ciclo
  --     siguiente: premio_disponible corta con `created_at > canje`,
  --     estricto. Guardarla en una segunda llamada desde la acción le daría
  --     un created_at posterior y, con alcance 'todos', arrancaría el ciclo
  --     nuevo en 1 el mismo día del canje;
  --   · la llamada recursiva pasa por la MISMA policy services_insercion
  --     —esta función es security invoker—: un plan sin 'mecanica' recibe
  --     42501 y la transacción entera vuelve. R38d lo vigila.
  -- El canje, los pendientes y las observaciones quedan en el service; la
  -- mecánica lleva su descripción y sus renglones libres. El vínculo va en
  -- cargado_con_id, escrito con un UPDATE sobre la fila recién creada
  -- (dentro de su ventana, por la misma policy de edición).
  -- Desde 20261029200000 la pareja también nace de un service de CAJA: la
  -- misma rama, la misma llamada recursiva y el mismo vínculo. Lo que
  -- cambia es solo la puerta: dos anfitriones en vez de uno. Una mecánica
  -- o un trabajo de gomería siguen sin llevar adjunta. R49 lo vigila.
  if p_mecanica is not null then
    if p_tipo not in ('service', 'caja') then -- @adjunta-solo-service
      raise exception 'mecanica_adjunta_solo_en_service';
    end if;
    if jsonb_typeof(p_mecanica) <> 'object' then
      raise exception 'mecanica_adjunta_invalida';
    end if;
    v_items_mec := case
      when jsonb_typeof(p_mecanica->'items') = 'array' then p_mecanica->'items' -- @adjunta-items
      else '[]'::jsonb
    end;

    v_mecanica := guardar_service(
      p_vehiculo_id         => p_vehiculo_id,
      p_sucursal_id         => p_sucursal_id,
      p_fecha               => p_fecha, -- @adjunta-fecha
      p_kilometros          => p_kilometros,
      p_aceite_tipo         => null,
      p_prox_service_km     => null,
      p_items               => v_items_mec,
      p_tipo                => 'mecanica',
      p_trabajo_descripcion => p_mecanica->>'descripcion' -- @adjunta-llamada
    );

    update services set cargado_con_id = v_service where id = v_mecanica; -- @adjunta-vinculo
    if not found then
      raise exception 'vinculo_no_escrito';
    end if;
  end if;

  return v_service;
end;
$$;
-- <<< guardar_service

comment on function guardar_service is
  'Guarda el trabajo completo + renglones (con cantidad) o ruedas + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. Cuatro tipos: service, mecánica, neumáticos y caja (aceite de caja, sus renglones siempre como hechos y su próximo en prox_caja_km, validado entre 20.000 y 200.000 km). Con p_mecanica (en un service o en una caja, desde 20261029200000) guarda además la mecánica adjunta: segunda fila, misma fecha/km/sucursal, vinculada por cargado_con_id, mismo now(). Devuelve el id del trabajo anfitrión. Security invoker.';


-- ---------- 3 · actualizar_service: la caja también propaga ----------
-- Textual de 20261004120100 más el bloque `@propaga-visita-caja` en la
-- rama de la caja, copia del `@propaga-visita` de la rama del service.
-- >>> actualizar_service
create or replace function actualizar_service(
  p_service_id          uuid,
  p_sucursal_id         uuid,
  p_fecha               date,
  p_kilometros          integer,
  p_aceite_tipo         text,
  p_prox_service_km     integer,
  p_items               jsonb default '[]'::jsonb,
  p_aceite_producto_id  uuid default null,
  p_aceite_nombre       text default null,
  p_observaciones       text default null,
  p_trabajo_descripcion text default null,
  p_aceite_litros       numeric default null,
  p_ruedas              jsonb default '[]'::jsonb,
  p_alineacion          boolean default null,
  -- El próximo service de CAJA (20261004120100). Solo se lee al editar
  -- una caja.
  p_prox_caja_km        integer default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item    jsonb;
  v_tipo    tipo_trabajo;
  v_detalle text;
  v_ruedas  jsonb;
begin
  select tipo into v_tipo from services where id = p_service_id and not anulado;
  if v_tipo is null then
    raise exception 'service_no_editable';
  end if;

  if v_tipo = 'neumaticos' then
    v_ruedas := coalesce((
      select jsonb_agg(r)
      from jsonb_array_elements(coalesce(p_ruedas, '[]'::jsonb)) r
      where coalesce((r->>'colocada')::boolean, false)
         or coalesce((r->>'rotada')::boolean, false)
         or coalesce((r->>'balanceada')::boolean, false)
         or coalesce((r->>'reparada')::boolean, false)
         or nullif(r->>'profundidad_mm', '') is not null
    ), '[]'::jsonb);

    if jsonb_array_length(v_ruedas) = 0 and not coalesce(p_alineacion, false) then
      raise exception 'neumaticos_sin_trabajo';
    end if;

    update services set
      sucursal_id   = p_sucursal_id,
      fecha         = p_fecha,
      kilometros    = p_kilometros,
      alineacion    = coalesce(p_alineacion, false),
      observaciones = nullif(trim(p_observaciones), '')
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_ruedas where service_id = p_service_id;
    perform guardar_ruedas(p_service_id, v_ruedas);
    -- Las ruedas cambiaron: el beneficio se recalcula con las nuevas y con
    -- la configuración de HOY. Nunca se congela un beneficio que ya no
    -- corresponde ni se pierde uno que ahora sí.
    perform calcular_beneficio_neumaticos(p_service_id);

    return;
  end if;

  if v_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then
      raise exception 'descripcion_requerida';
    end if;

    update services set
      sucursal_id         = p_sucursal_id,
      fecha               = p_fecha,
      kilometros          = p_kilometros,
      trabajo_descripcion = trim(p_trabajo_descripcion),
      observaciones       = nullif(trim(p_observaciones), '')
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_items where service_id = p_service_id;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        null,
        nullif(v_item->>'producto_id', '')::uuid,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end loop;

    return;
  end if;

  if v_tipo = 'caja' then
    -- EL SERVICE DE CAJA (20261004120100): se editan el aceite, los
    -- litros, el producto, el próximo de caja y las observaciones, y los
    -- renglones se sincronizan por tipo, como los de un service. Las
    -- mismas tres validaciones que en el alta, con los mismos nombres. El
    -- tipo no se edita y el stock no se re-toca (la regla de siempre).
    if p_kilometros is null or p_kilometros < 0 then
      raise exception 'caja_sin_kilometros';
    end if;
    if p_aceite_tipo is null or char_length(trim(p_aceite_tipo)) < 2 then -- @caja-edita-aceite
      raise exception 'aceite_caja_requerido';
    end if;
    if p_prox_caja_km is null
       or p_prox_caja_km - p_kilometros not between 20000 and 200000 then -- @caja-edita-salto
      raise exception 'salto_caja_invalido';
    end if;

    update services set
      sucursal_id        = p_sucursal_id,
      fecha              = p_fecha,
      kilometros         = p_kilometros,
      aceite_tipo        = trim(p_aceite_tipo),
      prox_caja_km       = p_prox_caja_km, -- @caja-edita-proximo
      aceite_producto_id = p_aceite_producto_id,
      aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
      observaciones      = nullif(trim(p_observaciones), ''),
      aceite_litros      = p_aceite_litros
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_items si
    where si.service_id = p_service_id
      and si.item_tipo is not null
      and si.item_tipo not in ( -- @caja-edita-sincroniza
        select (i->>'tipo')::item_tipo
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
        where i->>'tipo' is not null
      );

    -- Prendido = hecho, también al editar: `cambiado` no se lee del jsonb.
    for v_item in
      select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      update service_items set
        producto_id = nullif(v_item->>'producto_id', '')::uuid,
        detalle     = nullif(trim(v_item->>'detalle'), ''),
        cambiado    = true, -- @caja-edita-hecho
        cantidad    = coalesce((v_item->>'cantidad')::numeric, 1)
      where service_id = p_service_id
        and item_tipo = (v_item->>'tipo')::item_tipo;

      if not found then
        insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
        values (
          p_service_id,
          (v_item->>'tipo')::item_tipo,
          nullif(v_item->>'producto_id', '')::uuid,
          nullif(trim(v_item->>'detalle'), ''),
          true, -- @caja-edita-hecho-nuevo
          coalesce((v_item->>'cantidad')::numeric, 1)
        );
      end if;
    end loop;

    -- LA VISITA VIAJA JUNTA, también desde una caja (20261029200000): la
    -- misma propagación que la del service, más abajo, copiada acá porque
    -- esta rama termina en su propio `return`. Fecha, kilómetros y
    -- sucursal son de la visita; la mecánica adjunta a la caja los sigue
    -- si está en su ventana, y un plan que perdió 'mecanica' no bloquea
    -- la edición de la caja (se atrapa el 42501). R49e lo vigila.
    begin
      update services set
        sucursal_id = p_sucursal_id,
        fecha       = p_fecha,
        kilometros  = p_kilometros
      where cargado_con_id = p_service_id -- @propaga-visita-caja
        and not anulado;
    exception when insufficient_privilege then
      null;
    end;

    return;
  end if;

  update services set
    sucursal_id        = p_sucursal_id,
    fecha              = p_fecha,
    kilometros         = p_kilometros,
    aceite_tipo        = trim(p_aceite_tipo),
    prox_service_km    = p_prox_service_km,
    aceite_producto_id = p_aceite_producto_id,
    aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
    observaciones      = nullif(trim(p_observaciones), ''),
    aceite_litros      = p_aceite_litros
  where id = p_service_id
    and not anulado;

  if not found then
    raise exception 'service_no_editable';
  end if;

  -- LA VISITA VIAJA JUNTA (20260929100000): fecha, kilómetros y sucursal
  -- son datos de la visita, no de cada mitad. Corregirlos en el service los
  -- copia a la mecánica adjunta —la ventana de la mecánica (7 días)
  -- contiene la del service (24 horas), así que dentro del plazo normal la
  -- policy la deja pasar—. Si el tenant perdió la feature 'mecanica'
  -- después de la carga, el WITH CHECK de services_edicion rechaza esa fila
  -- con 42501: se atrapa y la edición del service sigue (regla 2: un
  -- downgrade nunca bloquea lo que ya se tenía). Si la mecánica ya se fijó
  -- (service editado por desbloqueo, pasada la semana), toca 0 filas y no
  -- pasa nada: el vínculo es informativo, no un candado. Al revés no se
  -- propaga: editar la mecánica es editar la mecánica, y la pantalla avisa.
  begin
    update services set
      sucursal_id = p_sucursal_id,
      fecha       = p_fecha,
      kilometros  = p_kilometros
    where cargado_con_id = p_service_id -- @propaga-visita
      and not anulado;
  exception when insufficient_privilege then
    null;
  end;

  delete from service_items si
  where si.service_id = p_service_id
    and si.item_tipo is not null
    and si.item_tipo not in (
      select (i->>'tipo')::item_tipo
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
      where i->>'tipo' is not null
    );

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    update service_items set
      producto_id = nullif(v_item->>'producto_id', '')::uuid,
      detalle     = nullif(trim(v_item->>'detalle'), ''),
      cambiado    = coalesce((v_item->>'cambiado')::boolean, true),
      cantidad    = coalesce((v_item->>'cantidad')::numeric, 1)
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), ''),
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end if;
  end loop;
end;
$$;
-- <<< actualizar_service

comment on function actualizar_service is
  'Edita un trabajo dentro de su plazo (la policy decide): cabecera y renglones o ruedas. Al editar un SERVICE o una CAJA, la fecha, los kilómetros y la sucursal se copian a la mecánica adjunta (cargado_con_id) si sigue en su ventana; un plan sin la feature no bloquea la edición del anfitrión. Al editar una CAJA se cambian además el aceite, los litros, el producto, el próximo de caja y las observaciones, y los renglones se sincronizan por tipo, siempre como hechos. No toca stock, pendientes ni canjes.';
