-- ============================================================
-- Fidelli Motors · El service de caja automática: el cuarto tipo de trabajo
--
-- El par de 20261004120000, que agregó 'caja' a tipo_trabajo, los cuatro
-- renglones de la caja a item_tipo y 'caja' a estado_contacto. ESTA
-- migración es la que cierra las puertas que aquella abre, y por eso las
-- dos salen juntas y se aplican en orden.
--
-- Lo pidieron dos talleres que se especializan en cajas automáticas. El
-- service de caja se hace cada 80.000 km y se parece a un service en la
-- forma —fecha, kilómetros, un aceite, renglones, un próximo—, pero ES
-- OTRO TRABAJO: otro aceite (un ATF), otros renglones, otro próximo y
-- otro papel.
--
-- ────────────────────────────────────────────────────────────
-- LO QUE NO SE TOCA, Y POR QUÉ ESTÁ ESCRITO ACÁ ARRIBA
--
-- vista_proximos_service es la pantalla que renueva las suscripciones y su
-- modo de falla es silencioso (regla 5). Esta migración NO la redefine,
-- NO la consulta distinto y NO le suma columnas. La caja queda afuera de
-- ella por tres lados a la vez:
--   · su próximo vive en una columna propia, `services.prox_caja_km`, y
--     `prox_service_km` queda en null (lo exige el CHECK);
--   · la vista filtra `tipo = 'service'` desde 20260822210000, en el
--     último service y en el ritmo;
--   · el aviso de una caja se registra en `contactos` con el motivo
--     'caja', que no es ninguno de los tres estados que esa vista compara.
-- R42f saca la foto de la vista entera antes y después de cargar cajas (y
-- de contactar por caja) en los mismos autos: tiene que ser idéntica,
-- campo por campo.
--
-- ────────────────────────────────────────────────────────────
-- LA TRAMPA DEL CUARTO VALOR DE ENUM (regla 11), RESUELTA DE ENTRADA
--
-- Los CHECK y las policies de `services` están escritos como
-- `tipo <> 'x' or (...)`: sobre un tipo que no nombran, no dicen nada. Con
-- 'caja' en el enum y sin este archivo entra una caja sin kilómetros, sin
-- aceite y con descripción de mecánica, para cualquier tenant y también
-- por la API directa (se probó: está en el PR). Acá van, en la misma
-- transacción: el CHECK del cuarto tipo, su espejo, las DOS policies y el
-- plazo de edición. Sus pruebas son R42a, R42b y R35a.
--
-- ────────────────────────────────────────────────────────────
-- LA FEATURE NO ES UN MÓDULO
--
-- 'caja' entra al catálogo de features y NO se agrega al `features` de
-- ningún plan, igual que 'neumaticos': la clave ausente cae al tercer
-- escalón de feature_de_tenant() y devuelve false. Se prende por tenant,
-- con el override de /fidelli. La diferencia con gomería es que NO tiene
-- precio: no hay fila en `modulos`, así que no entra en el monto de la
-- renovación, ni en el MRR, ni emite eventos de módulo
-- (tenant_evento_tras_override recorre la tabla `modulos`).
--
-- ────────────────────────────────────────────────────────────
-- CÓMO ESTÁ ESCRITO
--
-- guardar_service, actualizar_service, get_carton, plazo_edicion,
-- contactos_por_hacer, sembrar_templates, resumen_inicio y
-- metricas_plataforma van COPIADAS TEXTUALES del archivo que las define
-- hoy (20260929100000, 20260926200000, 20260925110000, 20260912100100 y
-- 20261002120000) con líneas AGREGADAS y ninguna quitada. Lo único que
-- cambia de lo que ya había es la coma de las dos firmas que ganan un
-- parámetro y la lista de columnas del insert de sembrar_templates. Los
-- marcadores `-- >>>` y `-- @` se conservan: los muerden
-- regresion-visita.sh, regresion-edicion.sh, regresion-pesado.sh,
-- regresion-neumaticos.sh, regresion-cobranza-suspension.sh y
-- regresion-metricas.sh, que desde ahora apuntan a este archivo para esas
-- funciones. Los marcadores nuevos (`@caja-…`) los muerde
-- scripts/regresion-caja.sh.
-- ============================================================


-- ---------- 1 · El próximo service de caja, en su columna ----------
alter table services add column prox_caja_km integer;

comment on column services.prox_caja_km is
  'A cuántos kilómetros le toca el próximo service de CAJA. Solo en tipo caja, donde es obligatorio y mayor que los kilómetros del trabajo; null en los otros tres tipos. Es distinto de prox_service_km (el próximo cambio de aceite de motor): una caja no lo escribe, y por eso vista_proximos_service no se entera. Lo lee vista_proximos_caja.';

comment on type tipo_trabajo is
  'service = cambio de aceite (el cartón de aceite). mecanica = trabajo de taller con descripción libre. neumaticos = gomería (módulo pago): una fila por rueda en service_ruedas y la alineación en la cabecera. caja = service de caja automática (feature por override, sin costo): aceite de caja, los cuatro renglones caja_* y su próximo en prox_caja_km.';


-- ---------- 2 · El CHECK del cuarto tipo, y su espejo ----------
-- Kilómetros, aceite de caja y próximo de caja, obligatorios; el próximo,
-- mayor que los kilómetros; y NADA del cambio de aceite de motor ni de la
-- mecánica: un próximo service de aceite en una caja la metería en la
-- retención equivocada.
alter table services add constraint caja_coherente check (
  tipo <> 'caja' or (
    kilometros is not null
    and aceite_tipo is not null
    and prox_caja_km is not null
    and prox_caja_km > kilometros
    and prox_service_km is null
    and trabajo_descripcion is null
  )
);

comment on constraint caja_coherente on services is
  'El cuarto tipo, explícito. Los CHECK escritos como (tipo <> ''x'' or ...) NO se pronuncian sobre un tipo que no nombran: sin esta fila, una caja entraba sin ninguna restricción.';

-- El espejo, como CHECK propio y EN POSITIVO, igual que
-- alineacion_solo_neumaticos y cargado_con_solo_mecanica: un service, una
-- mecánica o un trabajo de gomería con próximo de caja es un dato
-- mentiroso. Se prefiere a sumarles `prox_caja_km is null` a los tres
-- CHECK existentes por dos razones: tocar service_completo,
-- mecanica_coherente y neumaticos_coherente obliga a soltarlos y
-- rehacerlos, y son las reglas más calientes de la tabla; y escrito en
-- positivo, un QUINTO tipo no lo hereda en silencio (regla 11).
alter table services add constraint prox_caja_solo_caja check (
  prox_caja_km is null or tipo = 'caja'
);

comment on constraint prox_caja_solo_caja on services is
  'El próximo de caja es de la caja y de ningún otro tipo. En positivo: un tipo nuevo del enum no lo puede llevar sin que alguien lo decida.';

-- No hace falta más: `alineacion`, `cargado_con_id` y el beneficio de la
-- compra ya están atados a su tipo en positivo, así que una caja no puede
-- llevarlos; y `aceite_tipo_no_vacio` (2 letras) rige para cualquier tipo.


-- ---------- 3 · La categoría de producto de los ATF ----------
-- categoria_producto dejó de ser un enum en 20260823140000: es la tabla
-- global categorias_producto, y una categoría nueva es un INSERT. Va
-- pegada a los aceites —es lo primero que busca el que carga un ATF— y
-- corre un lugar a las que siguen. Con su propia categoría, los ATF no
-- aparecen entre los aceites de motor del cartón ni en sus chips de «más
-- usados» (los dos filtran `categoria = 'aceite'`).
do $$
declare
  v_orden integer;
begin
  if not exists (select 1 from categorias_producto where clave = 'transmision') then
    -- coalesce: `orden` es not null. Si la fila 'aceite' no estuviera (la
    -- tabla se administra desde /fidelli), la categoría nueva va primera
    -- en vez de tirar abajo la migración entera.
    select coalesce((select orden from categorias_producto where clave = 'aceite'), 0)
      into v_orden;
    update categorias_producto set orden = orden + 1 where orden > v_orden;
    insert into categorias_producto (clave, nombre, plural, orden)
    values ('transmision', 'Aceite de caja', 'Aceites de caja', v_orden + 1);
  end if;
end $$;


-- ---------- 4 · La feature ----------
-- ⚠ 'caja' NO SE AGREGA AL JSON `features` DE NINGÚN PLAN, ni en true ni
-- en false, por la misma razón que 'neumaticos' (20260911120100 § 7): la
-- clave ausente cae al tercer escalón de feature_de_tenant() y devuelve
-- false, que es lo que se quiere. Se prende por tenant, a mano, desde la
-- ficha de /fidelli, y queda en cambios_override_plan con su motivo. R42j
-- vigila que ningún plan la traiga.
-- >>> catalogo_features_plan
create or replace function catalogo_features_plan()
returns text[] language sql immutable as $$
  select array[
    'mecanica', 'pendientes', 'premios',
    'presupuestos', 'personalizacion_pagina', 'pagina_premium',
    -- Módulo pago aparte del plan. No va en el features de ningún plan.
    'neumaticos',
    -- El service de caja automática: por tenant, con el override, SIN
    -- costo (no es un módulo: no tiene fila en `modulos`). Tampoco va en
    -- el features de ningún plan.
    'caja' -- @feature-caja
  ];
$$;
-- <<< catalogo_features_plan

comment on function catalogo_features_plan is
  'El catálogo canónico de features. Su espejo tipado está en lib/planes.ts. ''neumaticos'' es un MÓDULO PAGO y ''caja'' una feature sin costo: las dos están acá para que plan_permite() las resuelva, pero no figuran en el features de ningún plan — se habilitan por tenant con el override.';


-- ---------- 5 · Las DOS policies de services ----------
-- Sin esta condición, 'caja' entra sin mirar la feature: las premisas
-- (tipo <> 'mecanica') y (tipo <> 'neumaticos') son verdaderas y el and se
-- cumple solo. El WITH CHECK de 20260911120100 más una línea; el USING de
-- la edición (la ventana, 20260925110000) no se toca. Regla 2: el gating
-- va en WITH CHECK y nunca en USING — apagar la feature apaga la
-- escritura, no la lectura.
alter policy services_insercion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica'   or plan_permite('mecanica'))
      and (tipo <> 'neumaticos' or plan_permite('neumaticos'))
      and (tipo <> 'caja'       or plan_permite('caja')))
    or soy_superadmin()
  );

-- La edición también: sin esto un tenant sin la feature convertiría un
-- service en caja por UPDATE, o seguiría editando las que cargó cuando la
-- tenía.
alter policy services_edicion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica'   or plan_permite('mecanica'))
      and (tipo <> 'neumaticos' or plan_permite('neumaticos'))
      and (tipo <> 'caja'       or plan_permite('caja')))
    or soy_superadmin()
  );


-- ---------- 6 · El plazo de edición: 24 horas ----------
-- Como el service y la gomería. El case no tiene else a propósito: sin
-- esta línea, plazo_edicion('caja') es null, la caja nace fijada y R35a
-- pone el reset en rojo. Textual de 20260925110000 más una línea.
-- >>> plazo_edicion
create or replace function plazo_edicion(p_tipo tipo_trabajo)
returns interval
language sql
immutable
parallel safe
as $$
  select case p_tipo
    when 'service'    then interval '24 hours'  -- @plazo-service
    when 'mecanica'   then interval '7 days'    -- @plazo-mecanica
    when 'neumaticos' then interval '24 hours'  -- @plazo-neumaticos
    when 'caja'       then interval '24 hours'  -- @plazo-caja
  end;
$$;
-- <<< plazo_edicion

comment on function plazo_edicion(tipo_trabajo) is
  'Cuánto dura la ventana de edición de un trabajo desde created_at: 24 horas para service, neumáticos y caja; 7 días para mecánica. La única fuente — la llaman las tres policies, service_editable() y get_carton; lib/servicios.ts la repite solo para pintar. Sin else a propósito: un tipo nuevo sin plazo queda no editable y R35 lo acusa.';

grant execute on function plazo_edicion(tipo_trabajo) to anon, authenticated;


-- ---------- 7 · guardar_service, con la rama de la caja ----------
-- Cuerpo textual de 20260929100000 más: el parámetro p_prox_caja_km al
-- final (con default: los llamadores nombran los argumentos, así que es
-- aditivo) y la rama `elsif p_tipo = 'caja'`. Ni una línea de las ramas
-- existentes cambia. La firma cambia, así que la de 19 tipos se suelta
-- antes: un create or replace con un parámetro de más deja dos sobrecargas
-- y PostgREST contesta «ambiguous» para TODAS las cargas del panel (R38j y
-- R42j cuentan que quede una sola).
--
-- Lo que la caja hereda sin que nadie lo escriba, porque ya estaba dicho
-- en general:
--   · el canje: `p_tipo <> 'service'` con alcance 'services' →
--     canje_solo_en_service. Con 'todos', la caja canjea y cuenta.
--   · la mecánica adjunta: `p_tipo <> 'service'` →
--     mecanica_adjunta_solo_en_service. Una caja no lleva adjunta.
--   · los pendientes nuevos y tildados, y las observaciones.
--   · security invoker: services_insercion rige adentro, y un tenant sin
--     la feature recibe 42501 también por /rpc/ (R42a).
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean, jsonb
);

-- >>> guardar_service
create function guardar_service(
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
  -- producto_id, cantidad}]} o null. Solo con p_tipo = 'service'.
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
  if p_mecanica is not null then
    if p_tipo <> 'service' then -- @adjunta-solo-service
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
  'Guarda el trabajo completo + renglones (con cantidad) o ruedas + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. Cuatro tipos: service, mecánica, neumáticos y caja (aceite de caja, sus renglones siempre como hechos y su próximo en prox_caja_km, validado entre 20.000 y 200.000 km). Con p_mecanica (solo en un service) guarda además la mecánica adjunta. Devuelve el id del trabajo. Security invoker.';

revoke all on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean, jsonb, integer
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean, jsonb, integer
) to authenticated;


-- ---------- 8 · actualizar_service, con la caja ----------
-- Cuerpo textual de 20260929100000 más: el parámetro p_prox_caja_km al
-- final y el bloque `if v_tipo = 'caja' … return; end if;`, entre el de la
-- mecánica y el del service. La firma cambia: se suelta la de 14 tipos.
drop function if exists actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric, jsonb, boolean
);

-- >>> actualizar_service
create function actualizar_service(
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
  'Edita un trabajo dentro de su plazo (la policy decide): cabecera y renglones o ruedas. Al editar un SERVICE, la fecha, los kilómetros y la sucursal se copian a la mecánica adjunta (cargado_con_id) si sigue en su ventana; un plan sin la feature no bloquea la edición del service. Al editar una CAJA se cambian el aceite, los litros, el producto, el próximo de caja y las observaciones, y los renglones se sincronizan por tipo, siempre como hechos. No toca stock, pendientes ni canjes.';

revoke all on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric, jsonb, boolean, integer
) from public, anon;
grant execute on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric, jsonb, boolean, integer
) to authenticated;


-- ---------- 9 · get_carton: el próximo de caja en cada entrada ----------
-- Textual de 20260926200000 más UNA clave por trabajo. Aditivo: el front
-- viejo no la lee y el nuevo decide con ella qué tarjetas dibuja. SECURITY
-- DEFINER y search_path se repiten en el create or replace: sin definer,
-- `anon` no puede leer nada y la superficie del cliente se apaga entera.
-- >>> get_carton
create or replace function get_carton(p_slug text, p_patente text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lubricentro   lubricentros%rowtype;
  v_config        config_experiencia%rowtype;
  v_vehiculo      vehiculos%rowtype;
  v_patente_norm  text;
  v_encontrada    boolean;
  v_premio        record;
  v_sucursales    jsonb;
  v_premium       boolean;
  v_wa_taller     text;
  v_resultado     jsonb;
  v_beneficio_km  integer;
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- Sin filtro por activo, a propósito (2B): la página del cliente
  -- sobrevive a la suspensión. Ver el comentario en 20260822210000.
  select * into v_lubricentro from lubricentros where slug = p_slug;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

  -- El interruptor del beneficio de la compra: con beneficio_km = 0 el
  -- taller lo apagó y la línea desaparece del papel, también en los
  -- trabajos que ya lo tenían guardado. Es una promesa que el taller
  -- decide sostener o no; el papel dice lo que el taller sostiene hoy.
  select coalesce(beneficio_km, 0) into v_beneficio_km
  from config_neumaticos where lubricentro_id = v_lubricentro.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', su.nombre,
    'direccion', su.direccion,
    'telefono', su.telefono,
    'horarios', su.horarios
  ) order by su.created_at), '[]'::jsonb)
  into v_sucursales
  from sucursales su
  where su.lubricentro_id = v_lubricentro.id and su.activa;

  select * into v_vehiculo from vehiculos
  where lubricentro_id = v_lubricentro.id and patente_normalizada = v_patente_norm;

  v_encontrada := found;

  insert into landing_busquedas (lubricentro_id, patente, encontrada)
  values (v_lubricentro.id, v_patente_norm, v_encontrada);

  if not v_encontrada then
    return jsonb_build_object(
      'error', 'patente_no_encontrada',
      'lubricentro', jsonb_build_object(
        'nombre', v_lubricentro.nombre,
        'logo_url', v_config.logo_url,
        'color_primario', v_config.color_primario,
        'color_fondo', v_config.color_fondo,
        'color_carton', v_config.color_carton,
        'tema', coalesce(v_config.tema, 'claro'),
        'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
        'datos_contacto', v_config.datos_contacto,
        'sucursales', v_sucursales
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  v_premium := feature_de_tenant(v_lubricentro.id, 'pagina_premium');

  -- El WhatsApp del taller, solo premium. La sucursal del ÚLTIMO trabajo
  -- del auto —el local que tiene su historial— si sigue activa y tiene
  -- teléfono; si no, la primera activa con teléfono; si no, el WhatsApp
  -- de marca de datos_contacto. La caída es por dato faltante, nunca por
  -- adivinar: el orden lo fija el bloque.
  if v_premium then
    select su.telefono into v_wa_taller
    from services s
    join sucursales su on su.id = s.sucursal_id
    where s.vehiculo_id = v_vehiculo.id
      and not s.anulado
      and su.activa
      and su.telefono is not null
    order by s.fecha desc, s.created_at desc
    limit 1;

    if v_wa_taller is null then
      select su.telefono into v_wa_taller
      from sucursales su
      where su.lubricentro_id = v_lubricentro.id
        and su.activa
        and su.telefono is not null
      order by su.created_at
      limit 1;
    end if;

    if v_wa_taller is null then
      v_wa_taller := v_config.datos_contacto->>'whatsapp';
    end if;
  end if;

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'color_fondo', v_config.color_fondo,
      'color_carton', v_config.color_carton,
      'tema', coalesce(v_config.tema, 'claro'),
      'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
      'datos_contacto', v_config.datos_contacto,
      'sucursales', v_sucursales,
      'campos_visibles', v_config.campos_visibles
    ),
    -- El mensaje del taller: el momento de mayor intención del mes. Solo
    -- premium, solo con la vigencia viva (un "traé el auto en septiembre"
    -- puesto en marzo es una vergüenza — con fecha se apaga solo), y solo
    -- con el tenant activo: mismo criterio que el premio.
    'mensaje_taller', case
      when v_premium
       and es_activo(v_lubricentro)                                 -- @mensaje_reloj
       and v_config.mensaje_escaneo is not null
       and (v_config.mensaje_vigencia is null or v_config.mensaje_vigencia >= current_date)
      then v_config.mensaje_escaneo
      else null
    end,
    'whatsapp_taller', v_wa_taller,
    'vehiculo', jsonb_build_object(
      'patente', v_vehiculo.patente,
      'marca', v_vehiculo.marca,
      'modelo', v_vehiculo.modelo,
      'anio', v_vehiculo.anio,
      -- La clase viaja tal cual está guardada: null si nadie la declaró.
      -- Leerla como liviano es del front (normalizarClase), no de acá:
      -- el papel del cliente imprime el cartón de referencia de la clase
      -- —los 20 de un camión— igual que el detalle del panel.
      'clase', v_vehiculo.clase -- @clase
    ),
    'notas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fecha', n.created_at,
          'contenido', n.contenido
        ) order by n.created_at desc
      )
      from notas_vehiculo n
      where n.vehiculo_id = v_vehiculo.id and n.visible_cliente
    ), '[]'::jsonb),
    -- "Recomendado por el taller": SOLO los abiertos marcados visibles.
    'pendientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'descripcion', tp.descripcion,
          'objetivo_fecha', tp.objetivo_fecha,
          'objetivo_km', tp.objetivo_km,
          'creado', tp.created_at
        ) order by tp.created_at desc
      )
      from trabajos_pendientes tp
      where tp.vehiculo_id = v_vehiculo.id
        and tp.estado = 'pendiente'
        and tp.visible_cliente
    ), '[]'::jsonb),
    'fidelizacion', case
      when es_activo(v_lubricentro)                                  -- @fidelizacion_reloj
       and coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
      then jsonb_build_object(
        'disponible', v_premio.disponible,
        'services_ciclo', v_premio.services_ciclo,
        'meta_services', v_premio.meta_services,
        'descripcion', v_premio.descripcion,
        -- Qué avanza el ciclo: 'services' (default) o 'todos'. El cartel
        -- del cliente nombra lo que de verdad suma.
        'alcance', coalesce(v_premio.alcance, 'services')
      )
      else null
    end,
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tipo', s.tipo,
          'trabajo_descripcion', s.trabajo_descripcion,
          'fecha', s.fecha,
          'kilometros', s.kilometros,
          'aceite_tipo', s.aceite_tipo,
          'aceite_nombre', case
            when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
            then s.aceite_nombre else null end,
          'prox_service_km', s.prox_service_km,
          -- El próximo service de CAJA (20261004120100): columna propia,
          -- null en todo lo que no es una caja. Viaja en CADA entrada y
          -- el front decide qué tarjeta dibuja.
          'prox_caja_km', s.prox_caja_km, -- @prox-caja
          -- La alineación es del vehículo entero, no de una rueda: viaja
          -- en la cabecera del trabajo.
          'alineacion', s.alineacion,
          -- El beneficio de la compra (bloque 2): rotación y balanceo sin
          -- cargo hasta X km o hasta tal fecha. Solo si el taller lo tiene
          -- prendido; con beneficio_km = 0 viaja null y no se dibuja.
          'beneficio_hasta_km', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_km end,
          'beneficio_hasta_fecha', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_fecha end,
          'sucursal', case
            when coalesce((v_config.campos_visibles->>'mostrar_sucursal')::boolean, true)
            then suc.nombre else null end,
          'observaciones', case
            when coalesce((v_config.campos_visibles->>'mostrar_observaciones')::boolean, false)
            then s.observaciones else null end,
          'fijado', (now() - s.created_at >= plazo_edicion(s.tipo)), -- @fijado
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'tipo', si.item_tipo,
                'cambiado', si.cambiado,
                -- La cantidad viaja desde el bloque 5. Si el auto llevó dos
                -- filtros, el papel del cliente tiene que decirlo.
                'cantidad', si.cantidad,
                'detalle', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(si.detalle, p.nombre) else null end
              ) order by si.item_tipo, si.created_at
            )
            from service_items si
            left join productos p on p.id = si.producto_id
            where si.service_id = s.id
          ), '[]'::jsonb),
          -- Las ruedas del trabajo de gomería. La MARCA respeta
          -- mostrar_productos, igual que aceite_nombre y que el detalle
          -- de cada renglón: es el producto que se vendió. La MEDIDA no
          -- se apaga — es la especificación del auto, y el dueño la
          -- necesita para saber qué comprar. La profundidad va cruda: es
          -- un dato, no un diagnóstico, y el cartón la muestra sin
          -- semáforo.
          'ruedas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'posicion', sr.posicion,
                'posicion_anterior', sr.posicion_anterior,
                'colocada', sr.colocada,
                'rotada', sr.rotada,
                'balanceada', sr.balanceada,
                'reparada', sr.reparada,
                'marca', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(sr.marca, pr.nombre) else null end,
                'medida', sr.medida,
                'indice_carga_vel', sr.indice_carga_vel,
                'dot', sr.dot,
                'profundidad_mm', sr.profundidad_mm,
                'presion_psi', sr.presion_psi
              ) order by sr.posicion
            )
            from service_ruedas sr
            left join productos pr on pr.id = sr.producto_id
            where sr.service_id = s.id
          ), '[]'::jsonb)
        ) order by s.fecha desc, s.created_at desc
      )
      from services s
      join sucursales suc on suc.id = s.sucursal_id
      where s.vehiculo_id = v_vehiculo.id and not s.anulado
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;
-- <<< get_carton

comment on function get_carton is
  'Única puerta pública con patente. Línea de tiempo con los cuatro tipos (cada entrada con su prox_service_km y su prox_caja_km), notas y pendientes visibles, cantidades por renglón, ruedas, alcance del premio, tema y tamaño de logo del tenant, y con pagina_premium el mensaje del taller (vigencia viva, tenant activo) y el WhatsApp de la sucursal del último trabajo. Sirve suspendido —a mano o por reloj— con el premio y el mensaje apagados (es_activo). Registra la búsqueda.';

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;


-- ---------- 10 · «A quién llamar»: la cuarta fuente ----------
-- vista_proximos_caja: el mismo contrato de columnas que
-- vista_proximos_service (las 23, en el mismo orden) y `prox_caja_km` al
-- final. La página une las fuentes en el servidor, como ya hace con
-- vista_pendientes y vista_proximos_neumaticos.
--
-- TRES COSAS EN LAS QUE NO ES UNA COPIA de la vista de services:
--
-- 1 · EL KM/DÍA SALE DE TODO EL ODÓMETRO DEL AUTO —cualquier trabajo no
--     anulado con kilómetros—, y la proyección arranca del ÚLTIMO odómetro
--     conocido, no de la caja. Un auto con una caja cada 80.000 km tiene
--     un solo punto: medir su ritmo solo con cajas es no medirlo. Si el
--     auto además hace sus services acá, cada uno acerca la estimación. Es
--     lo que ya hace vista_proximos_neumaticos. Con un solo punto en toda
--     la historia: 40 km/día, igual que siempre.
--
-- 2 · EL HORIZONTE VA SOBRE LA FECHA ESTIMADA, no sobre la fecha de la
--     última caja. La vista de services deja afuera al auto cuyo último
--     service tiene más de 18 meses («no está vencido, está perdido»), y
--     eso funciona porque un service se repite cada 10.000 km. Una caja se
--     repite cada 80.000: a 40 km/día son cinco años y medio. Con el corte
--     puesto sobre la fecha de la caja, el auto saldría de la lista años
--     ANTES de que le toque volver y esta vista estaría siempre vacía. El
--     mismo criterio, dicho para este ciclo: una caja que está VENCIDA
--     hace más de 18 meses ya no se llama.
--
-- 3 · EL ANTI-SPAM ES POR MOTIVO 'caja' Y POR CICLO, como en gomería: un
--     aviso por vehículo, posterior a su última caja. No se compara con el
--     estado: los tres estados son del contacto de un service, y usarlos
--     acá tildaría la fila del cambio de aceite del mismo auto.
--
-- La puerta es plan_permite('caja') y no feature_de_tenant() (regla 12).
-- Para un superadmin (sin tenant) da false y la vista queda vacía, que es
-- lo esperado: «A quién llamar» es del owner.
--
-- ⚠ Las líneas marcadas `-- @algo` las rompe scripts/regresion-caja.sh:
-- no se reformatean.
-- >>> vista_proximos_caja
create view vista_proximos_caja as
with
-- La última caja NO anulada de cada vehículo: de ahí sale el próximo.
ultimo as (
  select distinct on (s.vehiculo_id)
    s.vehiculo_id,
    s.id            as service_id,
    s.fecha,
    s.created_at,
    s.kilometros,
    s.prox_caja_km,
    s.sucursal_id,
    s.lubricentro_id
  from services s
  where s.tipo = 'caja' and not s.anulado -- @ultimo-caja
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
-- El ritmo, de TODOS los trabajos con kilómetros, de cualquier tipo.
ritmo as (
  select
    s.vehiculo_id,
    count(*)                                    as cantidad_services,
    max(s.kilometros) - min(s.kilometros)       as km_recorridos,
    greatest(max(s.fecha) - min(s.fecha), 1)    as dias_transcurridos
  from services s
  where not s.anulado and s.kilometros is not null -- @ritmo-todos
  group by s.vehiculo_id
),
-- El último odómetro conocido, de cualquier tipo de trabajo.
odometro as (
  select distinct on (s.vehiculo_id) s.vehiculo_id, s.fecha, s.kilometros
  from services s
  where not s.anulado and s.kilometros is not null -- @odometro-todos
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
calculo as (
  select
    u.lubricentro_id,
    u.vehiculo_id,
    u.service_id           as ultimo_service_id,
    u.fecha                as ultimo_service_fecha,
    u.kilometros           as ultimo_service_km,
    u.created_at           as ultimo_creado,
    u.prox_caja_km,
    u.sucursal_id,
    r.cantidad_services,
    case
      when r.cantidad_services >= 2 and r.km_recorridos > 0
        then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad_services < 2 or r.km_recorridos = 0) as estimacion_inicial,
    o.fecha                as odo_fecha,
    o.kilometros           as odo_km
  from ultimo u
  join ritmo r on r.vehiculo_id = u.vehiculo_id
  join odometro o on o.vehiculo_id = u.vehiculo_id
),
proyeccion as (
  select
    c.*,
    greatest(c.prox_caja_km - c.odo_km, 0) as km_faltantes,
    (c.odo_fecha
      + (greatest(c.prox_caja_km - c.odo_km, 0) / c.km_por_dia)::integer
    )::date as fecha_estimada
  from calculo c
),
clasificado as (
  select
    p.*,
    case
      when p.fecha_estimada < current_date - 15 then 'vencido'::estado_contacto -- @vencido
      when p.fecha_estimada <= current_date + 7 then 'urgente'::estado_contacto -- @urgente
      else 'proximo'::estado_contacto
    end as estado
  from proyeccion p
)
select
  c.lubricentro_id,
  c.vehiculo_id,
  v.patente,
  v.patente_normalizada,
  v.marca,
  v.modelo,
  cl.id            as cliente_id,
  cl.nombre        as cliente_nombre,
  cl.telefono      as cliente_telefono,
  c.ultimo_service_id,
  c.ultimo_service_fecha,
  c.ultimo_service_km,
  -- El contrato de la vista de services. Acá va null a propósito: una caja
  -- no tiene próximo de aceite. El suyo es prox_caja_km, al final.
  null::integer    as prox_service_km,
  c.km_faltantes,
  c.sucursal_id,
  suc.nombre       as sucursal_nombre,
  c.cantidad_services,
  c.km_por_dia,
  c.estimacion_inicial,
  c.fecha_estimada,
  (c.fecha_estimada - current_date) as dias_hasta,
  c.estado,
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = 'caja' -- @antispam-caja
      and co.created_at > c.ultimo_creado
  ) as contactado,
  c.prox_caja_km
from clasificado c
join vehiculos v on v.id = c.vehiculo_id
join clientes cl on cl.id = v.cliente_id
join sucursales suc on suc.id = c.sucursal_id
where c.fecha_estimada <= current_date + 30 -- @ventana
  and c.fecha_estimada >= (current_date - interval '18 months')::date -- @horizonte
  and plan_permite('caja'); -- @gate-caja

-- Regla 4: sin esta opción la vista corre con los permisos de su dueño y
-- un owner ve los próximos de caja de TODOS los lubricentros.
alter view vista_proximos_caja set (security_invoker = on); -- @invoker-caja

grant select on vista_proximos_caja to authenticated;
-- <<< vista_proximos_caja

comment on view vista_proximos_caja is
  'Los próximos services de CAJA accionables, una fila por vehículo, con el contrato de columnas de vista_proximos_service (y prox_caja_km al final) para unirse en la página. La última caja no anulada da el próximo; el km/día y el último odómetro salen de TODOS los trabajos del auto con kilómetros (40 km/día con un solo punto). Umbrales 7/30/15. Horizonte: una caja vencida hace más de 18 meses no entra. Contactado: un aviso con motivo caja posterior a la última caja. Solo tenants con la feature.';


-- El badge: la cuarta fuente. Misma forma que las otras dos condicionales:
-- solo si el tenant tiene la feature, para que el número del badge sea el
-- de las filas que la pantalla muestra. Textual de 20260912100100 más un
-- sumando.
-- >>> contactos_por_hacer
create or replace function contactos_por_hacer()
returns integer
language sql
stable
set search_path = public
as $$
  select (
    (select count(*) from vista_proximos_service where not contactado)
    +
    (case when plan_permite('pendientes')
      then (select count(*) from vista_pendientes where not contactado)
      else 0
    end)
    +
    (case when plan_permite('neumaticos') -- @badge
      then (select count(*) from vista_proximos_neumaticos where not contactado)
      else 0
    end)
    +
    (case when plan_permite('caja') -- @badge-caja
      then (select count(*) from vista_proximos_caja where not contactado)
      else 0
    end)
  )::integer
$$;
-- <<< contactos_por_hacer

comment on function contactos_por_hacer is
  'El número del badge de "A quién llamar": filas sin contactar en el estado actual, sobre las mismas vistas que la pantalla (services siempre; pendientes, neumáticos y caja solo si el tenant tiene la feature). Invoker: RLS recorta al tenant.';


-- ---------- 11 · El mensaje del próximo service de caja ----------
-- La cuarta plantilla de cada tono, igual que en su momento se sumaron la
-- del pendiente y la del retorno de gomería. No puede salir de la del
-- service: esa dice «del próximo service», y mandársela a alguien por su
-- caja es avisarle de un cambio de aceite que no le toca. Mismas cuatro
-- variables que la del service ({nombre}, {vehiculo}, {patente},
-- {proximo_km}); acá {proximo_km} es el próximo DE CAJA.
alter table mensaje_templates add column contenido_caja text;

comment on column mensaje_templates.contenido_caja is
  'El mensaje del próximo service de CAJA, por tono. Variables: {nombre}, {vehiculo}, {patente} y {proximo_km} (el próximo de caja). Lo usa la fuente Caja de «A quién llamar».';

-- El backfill, en una función para poder probarlo: los tenants que ya
-- existen reciben el contenido nuevo SIN que se les pise nada de lo que
-- personalizaron. Solo donde está en null, y solo esa columna.
-- >>> completar_templates_caja
create function completar_templates_caja()
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_n integer;
begin
  update mensaje_templates t
  set contenido_caja = case t.tono -- @completar-caja
    when 'Cercano' then
      'Hola {nombre}! Te escribimos de ' || l.nombre ||
      '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service de caja. ¿Coordinamos un turno?'
    when 'Formal' then
      'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service de caja programado en {proximo_km} km. Quedamos a disposición para agendar el turno.'
    when 'Directo' then
      '{nombre}, tu {vehiculo} necesita el service de caja en {proximo_km} km. Escribinos y te damos turno.'
    else
      'Hola {nombre}! Te escribimos de ' || l.nombre ||
      '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service de caja. ¿Coordinamos un turno?'
  end
  from lubricentros l
  where l.id = t.lubricentro_id
    and t.contenido_caja is null; -- @completar-solo-null
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
-- <<< completar_templates_caja

comment on function completar_templates_caja is
  'Carga contenido_caja en los templates que no lo tienen, sin tocar las otras tres plantillas. Idempotente. La corre la migración una vez y el seed otra (el demo nace después); R42i la vuelve a correr para probar que no pisa nada.';

revoke all on function completar_templates_caja() from public, anon, authenticated;

do $$ begin perform completar_templates_caja(); end $$;

-- Y la siembra de tenants nuevos trae las cuatro plantillas por tono.
-- Textual de 20260912100100 más la cuarta columna y su texto.
-- >>> sembrar_templates
create or replace function sembrar_templates(p_lubricentro_id uuid, p_nombre text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if exists (
    select 1 from mensaje_templates where lubricentro_id = p_lubricentro_id
  ) then
    return;
  end if;

  insert into mensaje_templates
    (lubricentro_id, tono, contenido, contenido_pendiente, contenido_neumaticos, contenido_caja, activo)
  values
    (p_lubricentro_id, 'Cercano',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un turno?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Cuando trajiste tu {vehiculo} ({patente}) quedó pendiente: {pendiente}. ¿Coordinamos un turno para resolverlo?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. A tu {vehiculo} ({patente}) le toca {motivo}. ¿Coordinamos un turno?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service de caja. ¿Coordinamos un turno?',
     true),
    (p_lubricentro_id, 'Formal',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, tiene un trabajo pendiente: {pendiente}. Quedamos a disposición para agendar el turno.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, requiere {motivo}. Quedamos a disposición para agendar.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service de caja programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     false),
    (p_lubricentro_id, 'Directo',
     '{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y te damos turno.',
     '{nombre}, tu {vehiculo} tiene un trabajo pendiente: {pendiente}. Escribinos y te damos turno.',
     '{nombre}, a tu {vehiculo} le toca {motivo}. Escribinos y te damos turno.',
     '{nombre}, tu {vehiculo} necesita el service de caja en {proximo_km} km. Escribinos y te damos turno.',
     false);
end;
$$;
-- <<< sembrar_templates

comment on function sembrar_templates is
  'Los tres tonos por defecto (Cercano activo) para un tenant sin templates, cada uno con sus cuatro plantillas: service, pendiente, retorno de gomería y service de caja. Idempotente.';


-- ---------- 12 · El Inicio: las cajas del mes ----------
-- Textual de 20260912100100 más UNA clave en `metricas`. `services_mes` y
-- las series NO cambian: cuentan trabajos de cualquier tipo (decisión de
-- 6ffb0f3, sostenida), así que una caja ya entra en ellas como entran una
-- mecánica o un trabajo de gomería.
-- >>> resumen_inicio
CREATE OR REPLACE FUNCTION public.resumen_inicio(p_sucursal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  -- El primer service de cada cliente: define "cliente nuevo" y de qué
  -- sucursal es. Se calcula una vez y se usa dos veces.
  primer_service as (
    select distinct on (v.cliente_id)
      v.cliente_id,
      s.fecha,
      s.sucursal_id
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
    order by v.cliente_id, s.fecha, s.created_at
  ),
  -- La flota que pasó por el taller en el último año. Es el universo del
  -- % de escaneo: son los autos que tienen calco en el parasol.
  flota_anual as (
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.fecha >= current_date - interval '12 months'
  ),
  -- El arranque de las series: el primer service bajo el filtro vigente.
  -- Con el filtro de sucursal puesto, cada sucursal arranca donde
  -- realmente arrancó — no donde arrancó el tenant.
  primer_de_serie as (
    select min(s.fecha) as fecha
    from services s
    where not s.anulado
      and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
  )
  select jsonb_build_object(

    -- El checklist no se filtra: es el estado de configuración del
    -- lubricentro entero.
    'checklist', jsonb_build_object(
      'sucursales', (select count(*) from sucursales where activa),
      'productos',  (select count(*) from productos where activo),
      'premio_meta',(select meta_services from premios where activo limit 1),
      'services',   (select count(*) from services where not anulado)
    ),

    'metricas', jsonb_build_object(
      'services_mes', (
        select count(*) from services
        where not anulado
          and fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      -- Los services de CAJA del mes (20261004120100), aparte: es la
      -- tarjeta del Inicio de un taller de cajas. `services_mes` los
      -- sigue contando, como a cualquier trabajo.
      'cajas_mes', (
        select count(*) from services
        where tipo = 'caja' and not anulado -- @cajas-mes
          and fecha >= date_trunc('month', current_date) -- @cajas-mes-corte
          and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'clientes_nuevos', (
        select count(*) from primer_service ps
        where ps.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or ps.sucursal_id = p_sucursal_id)),
      'recuperados', coalesce(
        recuperados_del_mes(mi_lubricentro_id(), null, p_sucursal_id), 0),
      'canjes_mes', (
        select count(*) from canjes c
        left join services s on s.id = c.service_id
        where c.created_at >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id))
    ),

    -- La landing es de la marca: estos dos NUNCA se filtran por sucursal.
    'landing', jsonb_build_object(
      'flota', (select count(*) from flota_anual),
      'escaneados', (
        select count(*) from flota_anual f
        where exists (
          select 1 from landing_busquedas lb
          where lb.patente = f.patente_normalizada
            and lb.created_at >= now() - interval '12 months')),
      'leads', (
        select count(*) from landing_busquedas
        where not encontrada
          and created_at >= now() - interval '12 months')
    ),

    'services_por_sucursal', coalesce((
      select jsonb_agg(
        jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
        order by x.cantidad desc)
      from (
        select suc.nombre, count(*)::integer as cantidad
        from services s
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and s.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        group by suc.nombre
      ) x
    ), '[]'::jsonb),

    -- Las cuatro series del gráfico nuevo. Ventanas: 12 semanas, 12
    -- meses, 8 trimestres (dos años de estacionalidad) y todos los años.
    -- El punto es {inicio: date, cantidad} — 'inicio' como fecha real y
    -- no 'YYYY-MM', para que las cuatro compartan el mismo formateador
    -- de etiquetas en el front.
    'series', (
      select jsonb_object_agg(g.clave, serie.datos)
      from (values
        ('semana',    'week',    interval '1 week',   12),
        ('mes',       'month',   interval '1 month',  12),
        ('trimestre', 'quarter', interval '3 months',  8),
        -- CINCO años, con tope duro. Antes eran 1000 pasos ("sin tope"),
        -- confiando en que el greatest() de abajo recortara al primer
        -- service. Recorta — pero recorta a lo que diga el dato, y basta
        -- UN service con el año mal tipeado (un 1031 en vez de un 2031)
        -- para que la ventana se abra a novecientos y pico de años de
        -- ceros. Con un tope fijo, un dato sucio deja de ser un problema
        -- de layout: la vista muestra los últimos 5 años y listo.
        ('anio',      'year',    interval '1 year',    5)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select case
          when (select fecha from primer_de_serie) is null then '[]'::jsonb
          else coalesce((
            select jsonb_agg(
              jsonb_build_object('inicio', p.inicio, 'cantidad', (
                select count(*)::integer from services s
                where not s.anulado
                  and s.fecha >= p.inicio
                  and s.fecha < (p.inicio + g.paso)::date
                  and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
              ))
              order by p.inicio)
            from (
              select generate_series(
                greatest(
                  (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                  date_trunc(g.unidad, (select fecha from primer_de_serie))::date
                ),
                date_trunc(g.unidad, current_date)::date,
                g.paso)::date as inicio
            ) p
          ), '[]'::jsonb)
        end as datos
      ) serie
    ),

    -- La vista ya trae el estado calculado por el ritmo real del vehículo.
    -- Se filtra por la sucursal del último service, que es la que la
    -- vista expone.
    'retencion', jsonb_build_object(
      'vencido', (select count(*) from vista_proximos_service
                  where estado = 'vencido'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'urgente', (select count(*) from vista_proximos_service
                  where estado = 'urgente'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'proximo', (select count(*) from vista_proximos_service
                  where estado = 'proximo'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id))
    ),

    'ultimos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'fecha', u.fecha,
          'creado', u.created_at,
          'patente', u.patente,
          'vehiculo', u.vehiculo,
          'sucursal', u.sucursal,
          'km', u.kilometros,
          -- El TIPO de cada trabajo (bloque 2 de gomería). Sin esto,
          -- "Últimos trabajos" mostraba kilómetros para los tres tipos:
          -- para una gomería, la primera pantalla del día listaba
          -- trabajos de cubiertas como si fueran services. Las ruedas
          -- viajan como booleanos y el front arma el resumen con la misma
          -- función que usa en todas las otras pantallas.
          'tipo', u.tipo,
          'descripcion', u.trabajo_descripcion,
          'alineacion', u.alineacion,
          'ruedas', u.ruedas)
        order by u.fecha desc, u.created_at desc)
      from (
        select s.id, s.fecha, s.created_at, s.kilometros,
               s.tipo, s.trabajo_descripcion, s.alineacion,
               (select coalesce(jsonb_agg(jsonb_build_object(
                  'colocada', r.colocada, 'rotada', r.rotada,
                  'balanceada', r.balanceada, 'reparada', r.reparada)), '[]'::jsonb)
                from service_ruedas r where r.service_id = s.id) as ruedas,
               v.patente,
               nullif(trim(concat_ws(' ', v.marca, v.modelo)), '') as vehiculo,
               suc.nombre as sucursal
        from services s
        join vehiculos v on v.id = s.vehiculo_id
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        order by s.fecha desc, s.created_at desc
        limit 5
      ) u
    ), '[]'::jsonb)
  );
$function$;
-- <<< resumen_inicio


-- ---------- 13 · La plataforma: las cajas, aparte ----------
-- Textual de 20261002120000 más: `cajas_mes` y `cajas_acumulado` arriba, y
-- `caja` en cada punto de las tres series. La caja es un TRABAJO de la
-- plataforma —ya contaba en `trabajos_mes`, en `acumulado` y en
-- `cantidad`, que no filtran por tipo— y no un «service»: sin su clave en
-- el punto, service + mecanica + neumaticos dejaba de sumar `cantidad` y
-- el Pulso apilado quedaba más bajo que su total (R33j). Las tres claves
-- son aditivas: R34h compara el resto contra la versión vieja.
-- >>> metricas_plataforma
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_json jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función filtra por tipo:
  -- el desglose es además del total, no en vez.
  with
  -- LA pasada por services: una fila por fecha con el total y los tipos.
  por_dia as (
    select
      s.fecha,
      count(*)::integer                                       as total,
      count(*) filter (where s.tipo = 'service')::integer     as svc,
      count(*) filter (where s.tipo = 'mecanica')::integer    as mec,
      count(*) filter (where s.tipo = 'caja')::integer        as caj, -- @serie_caja
      count(*) filter (where s.tipo = 'neumaticos')::integer  as neu
    from services s
    where not s.anulado                                        -- @serie_todos
      and s.importado_de is null                               -- @serie_sin_importado
    group by s.fecha
  ),
  resumen as (
    select min(d.fecha) as primero, coalesce(sum(d.total), 0)::bigint as acumulado
    from por_dia d
  ),
  grupos as (
    select * from (values
      ('dia',    'day',   interval '1 day',   30),
      ('semana', 'week',  interval '1 week',  12),
      ('mes',    'month', interval '1 month', 12)
    ) as g(clave, unidad, paso, pasos)
  ),
  -- Cada fecha, sumada en su día, su semana y su mes. Son pocas filas (una
  -- por fecha con trabajos), no la tabla.
  por_bucket as (
    select
      g.clave,
      date_trunc(g.unidad, d.fecha)::date as inicio,
      sum(d.total)::integer as total,
      sum(d.svc)::integer   as svc,
      sum(d.mec)::integer   as mec,
      sum(d.caj)::integer   as caj,
      sum(d.neu)::integer   as neu
    from grupos g
    cross join por_dia d
    group by g.clave, date_trunc(g.unidad, d.fecha)::date
  ),
  -- Los puntos de cada serie: desde el más viejo de la ventana (o el primer
  -- trabajo, si es posterior) hasta el período actual. Sin primer trabajo
  -- no hay puntos: greatest() ignora el null, por eso el where.
  puntos as (
    select g.clave, p.inicio::date as inicio
    from grupos g
    cross join resumen r
    cross join lateral generate_series(
      greatest(
        (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
        date_trunc(g.unidad, r.primero)::date
      ),
      date_trunc(g.unidad, current_date)::date,
      g.paso) as p(inicio)
    where r.primero is not null                                         -- @sin_trabajos
  )
  -- El `::date` de trabajos_mes es el mismo caso que en el listado: sin
  -- él, `date >= timestamptz` no es leakproof, el índice no se usa y la
  -- policy se evalúa en toda la tabla.
  select jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and importado_de is null                        -- @trabajos_mes_sin_importado
                       and fecha >= date_trunc('month', current_date)::date),
    'acumulado', r.acumulado,
    'primer_trabajo', r.primero,
    -- Los services de CAJA (20261004120100), aparte. La caja es un
    -- trabajo de la plataforma —cuenta en `trabajos_mes`, en `acumulado`
    -- y en `cantidad`— y no un «service»: tiene su clave en cada punto.
    'cajas_mes', (select coalesce(sum(d.caj), 0) from por_dia d
                  where d.fecha >= date_trunc('month', current_date)::date), -- @cajas_mes
    'cajas_acumulado', (select coalesce(sum(d.caj), 0) from por_dia d),
    'series', (
      select jsonb_object_agg(g.clave, coalesce(serie.datos, '[]'::jsonb))
      from grupos g
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'inicio',     p.inicio,
            'cantidad',   coalesce(b.total, 0),
            'service',    coalesce(b.svc, 0),
            'mecanica',   coalesce(b.mec, 0),
            'caja',       coalesce(b.caj, 0),
            'neumaticos', coalesce(b.neu, 0))
          order by p.inicio) as datos
        from puntos p
        left join por_bucket b on b.clave = p.clave and b.inicio = p.inicio
        where p.clave = g.clave
      ) serie on true
    )
  )
  into v_json
  from resumen r;

  return v_json;
end;
$$;
-- <<< metricas_plataforma
