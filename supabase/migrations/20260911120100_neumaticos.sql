-- ============================================================
-- Fidelli Motors · Módulo Gomería (bloque 1): el trabajo de neumáticos
--
-- El par de 20260911120000, que agregó 'neumaticos' al enum tipo_trabajo.
-- ESTA migración es la que cierra la puerta que aquella abre, y por eso
-- las dos salen juntas y se aplican en orden.
--
-- ────────────────────────────────────────────────────────────
-- LO PRIMERO: LA TRAMPA DEL TERCER VALOR DE ENUM
--
-- Los CHECK y las policies de services están escritos en la forma
-- `tipo <> 'x' or (...)`. Es la forma correcta —condicionar por tipo en
-- vez de aflojar la obligatoriedad— y tiene un modo de falla que NO da
-- error: para un tipo que no se nombra, la premisa es verdadera y la
-- implicación se cumple sin evaluar nada.
--
-- Con 'neumaticos' en el enum y sin esta migración:
--   · service_completo y mecanica_coherente dejan pasar una fila de
--     neumáticos con viscosidad de aceite Y descripción de mecánica;
--   · services_insercion y services_edicion dejan pasar la fila SIN
--     mirar el plan — el módulo pago queda abierto y gratis para los
--     trece tenants, también por la API directa.
--
-- Por eso acá van, en la misma transacción: el CHECK del tercer tipo y
-- las DOS policies corregidas. Sus gemelas de R2/R3 están en
-- verificaciones.sql (R15) y corren en cada `supabase db reset`.
--
-- ────────────────────────────────────────────────────────────
-- EL MODELO: TABLA SATÉLITE, UNA FILA POR RUEDA
--
-- Se respeta la decisión escrita en 20260822210000:18 — el historial del
-- vehículo sale de UNA fuente. El tipo nuevo entra en `services`, así que
-- la línea de tiempo del cliente sigue siendo una sola consulta, la regla
-- de 24 horas sigue aplicando sobre la misma fila y el RLS por tenant de
-- la cabecera ya cubre el trabajo. Lo que necesita tabla propia es el
-- detalle por rueda: cinco campos con reglas propias (posición cerrada,
-- DOT con formato, profundidad con rango) que un jsonb no puede
-- garantizar, más `producto_id` para enganchar el catálogo y el stock.
-- No se toca `service_items` ni el enum `item_tipo`: los 11 renglones son
-- del cartón de aceite y meterles valores nuevos contamina el papel, la
-- exportación y get_carton.
--
-- LAS ACCIONES SON BOOLEANOS Y NO UN ENUM, a propósito: se combinan. El
-- caso más común del rubro es vender cuatro cubiertas, colocarlas y
-- balancearlas en el mismo trabajo — cada rueda es colocada Y balanceada
-- a la vez. Una rotación siempre viene con balanceo. Un enum único no
-- puede expresar eso.
--
-- LA ALINEACIÓN ES DEL VEHÍCULO, NO DE UNA RUEDA: va en la cabecera
-- (services.alineacion) y no en la tabla por rueda.
--
-- ────────────────────────────────────────────────────────────
-- EL MÓDULO ES PAGO Y NO VIENE CON NINGÚN PLAN
--
-- 'neumaticos' entra al catálogo de features, pero NO se agrega al jsonb
-- `features` de ningún plan: ni en true ni en false. Ver la nota larga
-- del bloque 4. Se prende por tenant con el override, desde /fidelli.
--
-- Y se apaga la ESCRITURA, nunca la lectura (la regla de oro de
-- 20260822150000:18): el gating va en WITH CHECK y en ningún USING. Un
-- taller que deja de pagar pierde la solapa de carga; todo lo que ya
-- cargó lo siguen viendo él y su cliente final.
-- ============================================================


-- ---------- 1 · La posición de la rueda ----------
create type posicion_rueda as enum (
  'delantera_izquierda', 'delantera_derecha',
  'trasera_izquierda', 'trasera_derecha', 'auxilio'
);

comment on type posicion_rueda is
  'Las cuatro posiciones del auto más el auxilio. Cerrado a propósito: el esquema del cartón del cliente dibuja estas cinco y nada más.';

comment on type tipo_trabajo is
  'service = cambio de aceite (el cartón de 11 renglones). mecanica = trabajo de taller con descripción libre. neumaticos = gomería (módulo pago): una fila por rueda en service_ruedas y la alineación en la cabecera.';


-- ---------- 2 · La alineación, en la cabecera ----------
alter table services add column alineacion boolean;

comment on column services.alineacion is
  'Si se alineó el vehículo en este trabajo. Es del AUTO, no de una rueda: por eso vive acá y no en service_ruedas. NOT NULL en neumaticos (true o false, pero contestada), null en los otros dos tipos.';


-- ---------- 3 · El CHECK del tercer tipo ----------
-- Sin esto, una fila de neumáticos entra con viscosidad de aceite y
-- descripción de mecánica al mismo tiempo y la base no dice nada.
--
-- Kilómetros SÍ obligatorios: el bloque 2 calcula la rotación cada
-- 8.000–10.000 km contra este número, y un trabajo sin odómetro no
-- dispara ningún retorno. Próximo service NO: el próximo service es del
-- cambio de aceite, y escribirlo acá sacaría al auto de la retención.
alter table services add constraint neumaticos_coherente check (
  tipo <> 'neumaticos' or (
    kilometros is not null
    and aceite_tipo is null and aceite_producto_id is null
    and aceite_nombre is null and aceite_litros is null
    and prox_service_km is null
    and trabajo_descripcion is null
    and alineacion is not null
  )
);

-- El espejo, como CHECK propio y no sumado a los dos existentes: tocar
-- service_completo y mecanica_coherente obliga a soltarlos y rehacerlos,
-- y son las dos reglas más calientes de la tabla. Una línea aparte
-- ensucia menos y dice exactamente lo que quiere decir.
alter table services add constraint alineacion_solo_neumaticos check (
  alineacion is null or tipo = 'neumaticos'
);

comment on constraint neumaticos_coherente on services is
  'El tercer tipo, explícito. Los CHECK escritos como (tipo <> ''x'' or ...) NO se pronuncian sobre un tipo que no nombran: sin esta fila, neumáticos entraba sin ninguna restricción.';


-- ---------- 4 · La tabla por rueda ----------
create table service_ruedas (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references services(id) on delete cascade,
  lubricentro_id    uuid not null references lubricentros(id) on delete restrict,
  posicion          posicion_rueda not null,
  posicion_anterior posicion_rueda,
  colocada          boolean not null default false,
  rotada            boolean not null default false,
  balanceada        boolean not null default false,
  reparada          boolean not null default false,
  producto_id       uuid references productos(id) on delete set null,
  marca             text,
  medida            text,
  indice_carga_vel  text,
  dot               text,
  profundidad_mm    numeric(3,1),
  presion_psi       integer,
  created_at        timestamptz not null default now(),

  -- Una fila de rueda existe porque se le HIZO algo o porque se la MIDIÓ.
  -- El segundo caso no es un borde: un taller que alinea y de paso anota
  -- la medida y el DOT de las cubiertas que el auto ya traía está
  -- cargando justo los datos que en el bloque 2 disparan el aviso de
  -- recambio por antigüedad. Una rueda sin ninguna acción marcada y con
  -- la profundidad cargada es una fila válida y deseable.
  constraint rueda_con_sustancia check (
    colocada or rotada or balanceada or reparada
    or profundidad_mm is not null
  ),

  -- De dónde venía, solo si rotó, y nunca de su propia posición.
  constraint rotacion_con_origen check (
    case when rotada
      then posicion_anterior is not null and posicion_anterior <> posicion
      else posicion_anterior is null
    end
  ),

  -- 205/55 R16 · 225/45 ZR17 · 31.10 R15 (camioneta).
  constraint medida_formato check (
    medida is null
    or medida ~ '^([0-9]{3}/[0-9]{2} Z?R[0-9]{2}|[0-9]{2}\.[0-9]{2} R[0-9]{2})$'
  ),

  -- Cuatro dígitos del costado: semana (01–53) y año. 2325 = semana 23
  -- de 2025. Es el dato del que sale el recambio por antigüedad.
  constraint dot_formato check (
    dot is null
    or (dot ~ '^[0-9]{4}$' and left(dot, 2)::integer between 1 and 53)
  ),

  constraint profundidad_rango check (
    profundidad_mm is null or profundidad_mm between 0 and 25
  ),

  constraint presion_rango check (
    presion_psi is null or presion_psi between 10 and 120
  )
);

create unique index service_ruedas_unica on service_ruedas(service_id, posicion);
create index service_ruedas_service on service_ruedas(service_id);
create index service_ruedas_lubri on service_ruedas(lubricentro_id);

comment on table service_ruedas is
  'Una fila por rueda de un trabajo de neumáticos. Las acciones son booleanos porque se COMBINAN: colocada + balanceada es el caso más común del rubro, y una rotación siempre viene con balanceo.';
comment on column service_ruedas.posicion_anterior is
  'De qué posición venía la cubierta. Solo con rotada = true, y distinta de posicion.';
comment on column service_ruedas.producto_id is
  'La cubierta del catálogo, cuando se colocó una vendida por el taller. Marca y medida se copian como SNAPSHOT (igual que aceite_nombre): el papel del cliente tiene que seguir diciendo qué le pusieron aunque después borren el producto.';
comment on column service_ruedas.marca is
  'Snapshot de la marca. Se permite CON o SIN colocada: medir sin vender es un caso de uso de primera clase.';
comment on column service_ruedas.dot is
  'Semana y año de fabricación, del costado de la cubierta. 2325 = semana 23 de 2025.';
comment on column service_ruedas.profundidad_mm is
  'Profundidad de dibujo. Es un DATO, no un diagnóstico: el cartón del cliente lo muestra sin semáforo ni alarma.';

-- El tenant se hereda de la cabecera, igual que en service_items: la
-- función de guardado no lo escribe y no hay forma de que quede en otro.
create function service_ruedas_heredar_tenant()
returns trigger
language plpgsql
as $$
begin
  select lubricentro_id into new.lubricentro_id
  from services where id = new.service_id;
  return new;
end;
$$;

create trigger service_ruedas_tenant
  before insert on service_ruedas
  for each row execute function service_ruedas_heredar_tenant();


-- ---------- 5 · RLS de service_ruedas ----------
-- El molde de service_items y presupuesto_items:
--   · lectura por tenant — SIN condición de plan. Es la regla de oro: un
--     taller que deja de pagar el módulo sigue viendo lo que cargó, y su
--     cliente final también.
--   · escritura por tenant Y con el módulo — el gating va en WITH CHECK,
--     jamás en USING.
--   · la ventana de 24 horas se hereda de la cabecera, con el mismo
--     EXISTS sobre services que usa items_escritura.
--   · superadmin pasa.
alter table service_ruedas enable row level security;

create policy ruedas_lectura on service_ruedas
  for select
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy ruedas_escritura on service_ruedas
  for all
  using (
    (lubricentro_id = mi_lubricentro_id()
      and exists (
        select 1 from services s
        where s.id = service_ruedas.service_id
          and (now() - s.created_at < interval '24 hours'
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  )
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('neumaticos'))
    or soy_superadmin()
  );

grant select, insert, update, delete on service_ruedas to authenticated;


-- ---------- 6 · Las DOS policies de services, corregidas ----------
-- Sin esta condición, 'neumaticos' entra sin mirar el plan: la premisa
-- (tipo <> 'mecanica') es verdadera y el and se cumple solo.
alter policy services_insercion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica'   or plan_permite('mecanica'))
      and (tipo <> 'neumaticos' or plan_permite('neumaticos')))
    or soy_superadmin()
  );

-- La edición también: sin esto un tenant sin el módulo convertiría un
-- service en neumáticos por UPDATE, o seguiría editando los que cargó
-- cuando lo tenía.
alter policy services_edicion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica'   or plan_permite('mecanica'))
      and (tipo <> 'neumaticos' or plan_permite('neumaticos')))
    or soy_superadmin()
  );


-- ---------- 7 · La feature del módulo ----------
-- ⚠ 'neumaticos' NO SE AGREGA AL JSON `features` DE NINGÚN PLAN. Ni en
-- true ni en false, y esto no es un olvido:
--
--   feature_de_tenant() resuelve en tres escalones — override del tenant,
--   plan de la suscripción vigente, y cerrado. La clave AUSENTE cae al
--   escalón 3 y devuelve false, que es exactamente lo que queremos: un
--   add-on no viene con ningún plan. Se prende por tenant, a mano, desde
--   /fidelli, y queda registrado en cambios_override_plan con su motivo.
--
--   Ponerla en false en los planes daría el mismo resultado HOY y sería
--   una trampa mañana: el día que alguien "complete" el JSON de Ultra
--   poniéndola en true, el módulo pago pasa a estar incluido en el plan y
--   nadie se entera hasta que falte la plata.
--
-- Si alguien viene a "arreglar" esto: no está roto. Está así a propósito.
create or replace function catalogo_features_plan()
returns text[] language sql immutable as $$
  select array[
    'mecanica', 'pendientes', 'premios',
    'presupuestos', 'personalizacion_pagina', 'pagina_premium',
    -- Módulo pago aparte del plan. No va en el features de ningún plan.
    'neumaticos'
  ];
$$;

comment on function catalogo_features_plan is
  'El catálogo canónico de features. Su espejo tipado está en lib/planes.ts. ''neumaticos'' es un MÓDULO PAGO: está acá para que plan_permite() lo resuelva, pero no figura en el features de ningún plan — se habilita por tenant con el override.';


-- ---------- 8 · guardar_service, con las ruedas ----------
-- La firma cambia (dos parámetros nuevos), así que hay que soltarla: un
-- create or replace con parámetros de más crea una SOBRECARGA y deja dos
-- funciones ambiguas.
--
-- Cuerpo idéntico al de 20260902120000 más la rama de neumáticos. El
-- descuento de stock sigue pasando SOLO acá (editar no lo re-toca), y
-- para una rueda sólo cuando hay producto del catálogo Y colocada = true:
-- una rueda MEDIDA que referencia un producto no descuenta nada.
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric
);

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
  p_alineacion           boolean default null
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
  v_detalle     text;
  v_pend        jsonb;
  v_desc        text;
  v_cantidad    numeric;
  v_producto    uuid;
  v_rueda       jsonb;
  v_ruedas      jsonb;
  v_colocada    boolean;
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
       or char_length(trim(p_trabajo_descripcion)) < 5 then
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

  return v_service;
end;
$$;

comment on function guardar_service is
  'Guarda el trabajo completo + renglones (con cantidad) o ruedas + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. El aceite baja según su unidad; una cubierta baja UNA unidad por rueda colocada, y una rueda solo medida no mueve nada. Security invoker.';

revoke all on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean
) to authenticated;


-- ---------- 8b · guardar_ruedas: el insert por rueda, con sus validaciones ----------
-- Separada porque la usan las dos funciones (alta y edición) y porque los
-- CHECK de la tabla, que son la garantía real, dan un mensaje de sistema.
-- Acá se levantan errores NOMBRADOS, que la acción traduce a castellano —
-- el mismo idioma que descripcion_requerida o pendiente_invalido.
create function guardar_ruedas(p_service_id uuid, p_ruedas jsonb)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_rueda  jsonb;
  v_medida text;
  v_dot    text;
  v_prof   numeric;
  v_psi    integer;
begin
  for v_rueda in select * from jsonb_array_elements(coalesce(p_ruedas, '[]'::jsonb))
  loop
    if nullif(v_rueda->>'posicion', '') is null then
      raise exception 'rueda_sin_posicion';
    end if;

    -- La medida se guarda NORMALIZADA en mayúsculas: el CHECK valida la
    -- forma canónica y el mecánico puede escribir "205/55 r16".
    v_medida := upper(nullif(trim(coalesce(v_rueda->>'medida', '')), ''));
    if v_medida is not null
       and v_medida !~ '^([0-9]{3}/[0-9]{2} Z?R[0-9]{2}|[0-9]{2}\.[0-9]{2} R[0-9]{2})$' then
      raise exception 'medida_invalida';
    end if;

    v_dot := nullif(trim(coalesce(v_rueda->>'dot', '')), '');
    if v_dot is not null
       and (v_dot !~ '^[0-9]{4}$' or left(v_dot, 2)::integer not between 1 and 53) then
      raise exception 'dot_invalido';
    end if;

    v_prof := nullif(v_rueda->>'profundidad_mm', '')::numeric;
    if v_prof is not null and (v_prof < 0 or v_prof > 25) then
      raise exception 'profundidad_invalida';
    end if;

    v_psi := nullif(v_rueda->>'presion_psi', '')::integer;
    if v_psi is not null and (v_psi < 10 or v_psi > 120) then
      raise exception 'presion_invalida';
    end if;

    insert into service_ruedas (
      service_id, posicion, posicion_anterior,
      colocada, rotada, balanceada, reparada,
      producto_id, marca, medida, indice_carga_vel, dot,
      profundidad_mm, presion_psi
    ) values (
      p_service_id,
      (v_rueda->>'posicion')::posicion_rueda,
      case when coalesce((v_rueda->>'rotada')::boolean, false)
        then nullif(v_rueda->>'posicion_anterior', '')::posicion_rueda
      end,
      coalesce((v_rueda->>'colocada')::boolean, false),
      coalesce((v_rueda->>'rotada')::boolean, false),
      coalesce((v_rueda->>'balanceada')::boolean, false),
      coalesce((v_rueda->>'reparada')::boolean, false),
      nullif(v_rueda->>'producto_id', '')::uuid,
      nullif(trim(coalesce(v_rueda->>'marca', '')), ''),
      v_medida,
      nullif(trim(coalesce(v_rueda->>'indice_carga_vel', '')), ''),
      v_dot,
      v_prof,
      v_psi
    );
  end loop;
end;
$$;

comment on function guardar_ruedas is
  'Inserta las filas de service_ruedas de un trabajo, con las validaciones nombradas (medida_invalida, dot_invalido…) que la acción traduce. Los CHECK de la tabla siguen siendo la garantía: esto es el mensaje, no el candado. Security invoker.';

revoke all on function guardar_ruedas(uuid, jsonb) from public, anon;
grant execute on function guardar_ruedas(uuid, jsonb) to authenticated;


-- ---------- 9 · actualizar_service, con las ruedas ----------
-- Al editar, las ruedas se REEMPLAZAN ENTERAS: borrar e insertar, no
-- diferencial. Una rueda no tiene identidad propia para el mecánico —
-- lo que edita es "cómo quedó el auto", no la fila 3.
--
-- Y NO se re-toca stock, igual que hoy: el descuento pasa una sola vez,
-- al crear. El aviso de la pantalla de edición ya lo dice.
drop function if exists actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric
);

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
  p_alineacion          boolean default null
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

comment on function actualizar_service is
  'Edita un trabajo dentro de la ventana de 24 hs. En neumáticos las ruedas se reemplazan enteras (borrar e insertar). NO re-toca stock: el ajuste es editar el número en el catálogo. Security invoker.';

revoke all on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric, jsonb, boolean
) from public, anon;
grant execute on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text, numeric, jsonb, boolean
) to authenticated;


-- ---------- 10 · get_carton: las ruedas del trabajo ----------
-- La versión vigente de 20260823210000 más dos claves por trabajo:
-- `alineacion` y el array `ruedas`. Todo lo demás se conserva textual
-- (tema, logo_tamano, mensaje del taller, whatsapp_taller, cantidades,
-- alcance del premio, notas y pendientes visibles).
--
-- La MARCA de la cubierta respeta campos_visibles.mostrar_productos,
-- igual que aceite_nombre y que el detalle de cada renglón: un taller que
-- no quiere mostrar qué marca le puso, no la muestra. La MEDIDA sí se
-- emite siempre — es la especificación del auto, no el producto que se
-- vendió, y el dueño la necesita para saber qué comprar.
--
-- SECURITY DEFINER y search_path se repiten en el create or replace: sin
-- definer, `anon` no puede leer nada (no tiene permiso sobre ninguna
-- tabla) y la superficie del cliente se apaga entera.
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
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- Sin filtro por activo, a propósito (2B): la página del cliente
  -- sobrevive a la suspensión. Ver el comentario en 20260822210000.
  select * into v_lubricentro from lubricentros where slug = p_slug;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

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
       and v_lubricentro.activo
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
      'anio', v_vehiculo.anio
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
      when v_lubricentro.activo
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
          -- La alineación es del vehículo entero, no de una rueda: viaja
          -- en la cabecera del trabajo.
          'alineacion', s.alineacion,
          'sucursal', case
            when coalesce((v_config.campos_visibles->>'mostrar_sucursal')::boolean, true)
            then suc.nombre else null end,
          'observaciones', case
            when coalesce((v_config.campos_visibles->>'mostrar_observaciones')::boolean, false)
            then s.observaciones else null end,
          'fijado', (now() - s.created_at >= interval '24 hours'),
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

comment on function get_carton is
  'Única puerta pública con patente. Línea de tiempo con los TRES tipos, notas y pendientes visibles, cantidades por renglón, ruedas y alineación del trabajo de gomería, alcance del premio, tema y tamaño de logo del tenant, y con pagina_premium el mensaje del taller (vigencia viva, tenant activo) y el WhatsApp de la sucursal del último trabajo. Sirve suspendido (premio y mensaje no). Registra la búsqueda.';

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;


-- ---------- 11 · /fidelli: el módulo en el listado ----------
-- Una columna más, para que el módulo activo se vea en el repaso de
-- cobranzas sin entrar tenant por tenant. Es la versión de 20260909180000
-- con `modulo_neumaticos` al final; la firma cambia, así que hay que
-- soltarla antes (returns table no se puede alterar). Security invoker,
-- como siempre: el RLS decide qué tenants se ven.
drop function if exists listado_lubricentros();

create or replace function listado_lubricentros()
returns table (
  id                uuid,
  nombre            text,
  slug              text,
  activo            boolean,
  calcos_entregadas integer,
  creado            date,
  suscripcion_id    uuid,
  sub_estado        estado_suscripcion,
  sub_periodo       periodo_suscripcion,
  sub_descuento_pct numeric,
  sub_vencimiento   date,
  plan_id           uuid,
  plan_nombre       text,
  plan_precio       numeric,
  plan_desc_sem     numeric,
  plan_desc_anual   numeric,
  services_mes      integer,
  ultimo_service    date,
  owner_estado      text,
  owner_nombre      text,
  atencion          text,
  atencion_orden    integer,
  contactado        boolean,
  telefono          text,
  onboarding_paso   integer,
  onboarding_pasos  integer,
  onboarding_avance timestamptz,
  -- El módulo pago de gomería, resuelto EN LÍNEA con los tres escalones
  -- de feature_de_tenant (override → plan → cerrado) y no llamándola.
  --
  -- No se la llama a propósito: feature_de_tenant es SECURITY DEFINER sin
  -- guarda de llamador —acepta cualquier lubricentro_id— y por eso NO
  -- está grantada a authenticated; la puerta pública es plan_permite(),
  -- que se ata a mi_lubricentro_id(). Como esta función es security
  -- INVOKER, llamarla desde acá la hace fallar con "permission denied" y
  -- el listado de /fidelli se vacía SIN ERROR VISIBLE: la pantalla dice
  -- "Todavía no hay ningún lubricentro". Pasó al escribir este bloque.
  -- Grantarla habría sido peor: cualquier owner podría leer las features
  -- de cualquier tenant.
  --
  -- Acá los datos ya están a mano (plan_overrides del tenant y features
  -- del plan vigente, los dos en el CTE base) y el RLS de lubricentros ya
  -- decide qué filas se ven, así que la resolución sale igual sin abrir
  -- ninguna puerta. Lo vigila R15i.
  modulo_neumaticos boolean
)
language sql
stable
set search_path = public
as $$
  with
  vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      count(*) filter (
        where sv.fecha >= date_trunc('month', current_date))::integer as del_mes,
      max(sv.fecha) as ultimo
    from services sv
    where not sv.anulado
    group by sv.lubricentro_id
  ),
  owners as (
    select * from estados_owner()
  ),
  base as (
    select
      l.*,
      v.id as v_id, v.estado as v_estado, v.periodo as v_periodo,
      v.descuento_pct as v_desc, v.vencimiento as v_venc, v.plan_id as v_plan,
      p.nombre as p_nombre, p.precio_mensual as p_precio,
      p.descuento_semestral_pct as p_sem, p.descuento_anual_pct as p_anual,
      p.features as p_features,
      coalesce(a.del_mes, 0) as del_mes,
      a.ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,
      (select u.nombre from usuarios u
        where u.lubricentro_id = l.id and u.rol = 'owner' limit 1) as o_nombre,
      estado_atencion(v.estado, v.vencimiento) as atencion
    from lubricentros l
    left join vigente   v on v.lubricentro_id = l.id
    left join planes    p on p.id = v.plan_id
    left join actividad a on a.lubricentro_id = l.id
    left join owners    o on o.lubricentro_id = l.id
  )
  select
    b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.created_at::date,
    b.v_id, b.v_estado, b.v_periodo, b.v_desc, b.v_venc,
    b.v_plan, b.p_nombre, b.p_precio, b.p_sem, b.p_anual,
    b.del_mes, b.ultimo,
    b.o_estado, b.o_nombre,
    b.atencion,
    orden_atencion(b.atencion),
    contactado_fidelli(b.id),
    telefono_de_contacto(b.id),
    (ob.estado->>'paso_actual')::integer,
    (ob.estado->>'pasos')::integer,
    (ob.estado->>'avance_at')::timestamptz,
    -- Los tres escalones, en el mismo orden que feature_de_tenant.
    coalesce(
      (b.plan_overrides ->> 'neumaticos')::boolean,
      (b.p_features     ->> 'neumaticos')::boolean,
      false
    )
  from base b
  cross join lateral onboarding_estado(b.id) as ob(estado)
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
$$;

comment on function listado_lubricentros is
  'La tabla de /fidelli en una consulta, con la atención, el check, el onboarding y el módulo de gomería ya resueltos. Security invoker: el RLS decide qué tenants se ven.';

revoke execute on function listado_lubricentros() from public;
grant execute on function listado_lubricentros() to authenticated;
