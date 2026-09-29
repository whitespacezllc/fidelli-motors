-- ============================================================
-- Fidelli Motors · Service + mecánica en UNA carga, y el premio cuenta VISITAS
--
-- Lo que pedían los talleres (Pro y Ultra: los que tienen la feature
-- 'mecanica'): al cambiar el aceite muchas veces hacen algo de mecánica
-- en la misma visita, y cargarlo eran dos trabajos completos, dos
-- pantallas y dos veces el mismo auto. Desde acá, al final del cartón de
-- un service el mecánico tilda «¿Se le hizo algo de mecánica?», describe
-- el trabajo y confirma UNA vez: nacen las dos filas, con la misma fecha,
-- los mismos kilómetros y la misma sucursal.
--
-- DOS DECISIONES DE MODELO, y por qué:
--
-- 1 · Son dos filas, y nacen en la MISMA transacción. Los CHECK por tipo
--     (service_completo / mecanica_coherente, de 20260822210000) hacen
--     imposible una fila "combinada", y eso está bien: la retención sigue
--     leyendo solo `tipo = 'service'` (regla 5), las métricas siguen
--     contando trabajos (docs/METRICAS.md) y el papel del cliente muestra
--     dos cartones. Lo nuevo es que guardar_service recibe la mecánica en
--     un jsonb (`p_mecanica`) y se llama a sí misma para la segunda fila,
--     así que la visita se guarda entera o no se guarda; y las dos filas
--     comparten `now()` con el canje, que es lo que mantiene coherente el
--     corte del ciclo del premio. La mecánica queda ATADA al service por
--     `cargado_con_id`: la pantalla de guardado y el detalle muestran la
--     pareja, y anular una avisa de la otra. Después de guardadas son dos
--     trabajos con sus plazos de edición de siempre (24 horas el service, 7
--     días la mecánica: plazo_edicion no se toca) y se anulan por separado;
--     pero la fecha, los kilómetros y la sucursal son datos de LA VISITA:
--     corregirlos en el service los copia a la mecánica adjunta
--     (actualizar_service, sección 4). Si no, un typo corregido dentro de
--     las 24 horas partía la visita en dos fechas —y con alcance 'todos', en
--     dos puntos—.
--
-- 2 · El premio cuenta FECHAS DISTINTAS con trabajo, no filas. La regla del
--     producto pasa a ser «una visita es un punto»: service + mecánica el
--     29/09 valen 1, y dos services cargados el mismo día también. Es
--     `count(distinct s.fecha)` en las DOS funciones que calculan el ciclo
--     —premio_disponible y ciclos_fidelizacion son dos copias del mismo
--     criterio y tienen que decir lo mismo (R38 lo compara)—. Todo lo que
--     muestra el contador (get_carton, la ficha, la carga, el guardado, la
--     pantalla Fidelización, el onboarding) lo hereda sin tocar código.
--     La regla es global y retroactiva, a propósito (Flow de Fidelización,
--     regla 4: «los cambios de reglas aplican a todos, al instante, sin
--     snapshots»): un auto con dos services el mismo día baja un punto.
--
-- LO QUE NO CAMBIA:
--   · `premios.alcance` sigue decidiendo QUÉ tipos cuentan: con 'services'
--     una mecánica sola no suma (nunca sumó); con 'todos' cualquier
--     trabajo abre una visita. La mecánica adjunta no necesita excepción:
--     el service de ese día ya vale el punto.
--   · El corte del ciclo sigue siendo `created_at > último canje`, sobre
--     el instante y no sobre la fecha del trabajo (que se puede
--     retro-fechar). Un trabajo cargado después del canje cuenta aunque
--     su fecha sea anterior. R38f lo fija.
--   · guardar_service sigue siendo security invoker: la policy
--     services_insercion gatea la segunda fila con plan_permite('mecanica')
--     igual que a cualquier mecánica. Un Basic no la cuela ni por /rpc/.
--   · `plazo_edicion`, `vista_proximos_service`, `get_carton` y las
--     métricas no se tocan. Los scripts que muerden get_carton siguen
--     apuntando a 20260926200000. `actualizar_service` se re-emite textual
--     con UNA cosa más (la propagación a la adjunta); su firma no cambia.
--
-- La firma de guardar_service cambia (un parámetro más al final, con
-- default): DROP de la de 18 tipos + CREATE, como siempre —un create or
-- replace con parámetros de más deja dos sobrecargas y PostgREST contesta
-- ambiguo para TODAS las cargas del panel—. Los llamadores nombran los
-- argumentos, así que el parámetro nuevo es aditivo.
-- ============================================================


-- ---------- 1 · El vínculo: services.cargado_con_id ----------
-- La mecánica adjunta apunta al service con el que nació. Solo una
-- mecánica puede llevarlo (CHECK en positivo: un tipo nuevo del enum no
-- lo hereda en silencio, regla 11), y solo hacia un service del MISMO
-- vehículo y tenant (trigger, como services_validar_tenant). Es un dato
-- informativo, no un candado: cada fila conserva su ventana de edición.
alter table services
  add column cargado_con_id uuid references services(id) on delete set null;

alter table services
  add constraint cargado_con_solo_mecanica
  check (cargado_con_id is null or tipo = 'mecanica'); -- @check-vinculo

create index services_cargado_con_idx
  on services (cargado_con_id)
  where cargado_con_id is not null;

comment on column services.cargado_con_id is
  'La mecánica adjunta apunta al service con el que se cargó (misma visita, misma transacción). Solo en tipo mecánica; hacia un service del mismo vehículo. Informativo: no ata la edición ni la anulación.';

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
      and s.tipo = 'service' -- @vinculo-tipo
  ) then
    raise exception 'vinculo_invalido';
  end if;
  return new;
end;
$$;
-- <<< services_validar_vinculo

create trigger services_vinculo_coherente
  before insert or update of cargado_con_id on services
  for each row
  execute function services_validar_vinculo();


-- ---------- 2 · guardar_service, con la mecánica adjunta ----------
-- Cuerpo textual de 20260912100100 más: el parámetro p_mecanica, dos
-- variables y el bloque final. Ni una línea de las ramas existentes
-- cambia. Los marcadores `-- @` los muerde scripts/regresion-visita.sh.
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean
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
  p_mecanica             jsonb default null
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
  'Guarda el trabajo completo + renglones (con cantidad) o ruedas + canje + pendientes + descuento de stock (solo productos que lo llevan), en UNA transacción. Con p_mecanica (solo en un service) guarda además la mecánica adjunta: segunda fila, misma fecha/km/sucursal, vinculada por cargado_con_id, mismo now(). Devuelve el id del service. Security invoker.';

revoke all on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean, jsonb
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[], numeric, jsonb, boolean, jsonb
) to authenticated;


-- ---------- 3 · El premio cuenta visitas: count(distinct fecha) ----------
-- Misma firma, mismo retorno, mismos grants (create or replace los
-- conserva; se repiten igual por si alguien lee esta migración sola).
-- Cambia UNA expresión en cada función, marcada.
-- >>> premio_disponible
create or replace function premio_disponible(p_vehiculo_id uuid)
returns table (
  disponible        boolean,
  services_ciclo    integer,
  meta_services     integer,
  premio_id         uuid,
  descripcion       text,
  alcance           alcance_premio
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
    select p.id, p.meta_services, p.descripcion, p.alcance
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
    -- VISITAS, no filas (20260929100000): los trabajos de una misma
    -- fecha valen 1. Ver el encabezado de esa migración.
    select count(distinct s.fecha)::integer as n -- @visitas
    from services s
    cross join ultimo_canje uc
    left join premio_vigente pv on true
    where s.vehiculo_id = p_vehiculo_id
      and not s.anulado
      -- sin premio (pv null) o con alcance 'services': solo cambios de
      -- aceite, el comportamiento de siempre.
      and (pv.alcance = 'todos' or s.tipo = 'service')
      and (uc.fecha is null or s.created_at > uc.fecha) -- @corte-ciclo
  )
  select
    coalesce(c.n >= pv.meta_services, false) as disponible,
    c.n                                       as services_ciclo,
    pv.meta_services,
    pv.id                                     as premio_id,
    pv.descripcion,
    pv.alcance
  from conteo c
  left join premio_vigente pv on true;
$$;
-- <<< premio_disponible

revoke all on function premio_disponible(uuid) from public, anon;
grant execute on function premio_disponible(uuid) to authenticated, service_role;

comment on function premio_disponible(uuid) is
  'El ciclo del premio de un vehículo: cuenta las FECHAS DISTINTAS con trabajo no anulado desde el último canje (created_at > canje, estricto), contra la meta vigente. Qué tipos cuentan lo dice premios.alcance (services = solo cambios de aceite; todos = cualquier trabajo). Dos trabajos del mismo día valen 1. Sin contadores guardados.';

-- >>> ciclos_fidelizacion
create or replace function ciclos_fidelizacion()
returns table (
  vehiculo_id     uuid,
  services_ciclo  integer
)
language sql
stable
set search_path = public
as $$
  select
    v.id,
    count(distinct s.fecha) filter ( -- @visitas-flota
      -- mismo criterio que premio_disponible: el alcance del premio
      -- vigente decide si la mecánica suma (null o 'services' → no).
      where not s.anulado
        and (pa.alcance = 'todos' or s.tipo = 'service')
        and (uc.fecha is null or s.created_at > uc.fecha)
    )::integer
  from vehiculos v
  left join lateral (
    select p.alcance
    from premios p
    where p.lubricentro_id = v.lubricentro_id and p.activo
    order by p.created_at desc
    limit 1
  ) pa on true
  left join lateral (
    select max(c.created_at) as fecha
    from canjes c
    where c.vehiculo_id = v.id
  ) uc on true
  left join services s on s.vehiculo_id = v.id
  group by v.id;
$$;
-- <<< ciclos_fidelizacion

comment on function ciclos_fidelizacion() is
  'El mismo ciclo que premio_disponible, para toda la flota del tenant: fechas distintas con trabajo desde el último canje, según el alcance del premio activo. Las dos funciones tienen que decir lo mismo; R38 las compara.';

comment on column services.fecha is
  'La fecha del trabajo (date; el front manda el día del negocio y el mecánico puede retro-fecharla). Es la unidad del premio: los trabajos de una misma fecha valen UNA visita. En una carga doble, corregirla en el service la copia a la mecánica adjunta.';


-- ---------- 4 · actualizar_service: la visita viaja junta ----------
-- Cuerpo textual de 20260912100100 más el bloque marcado @propaga-visita
-- en la rama del service. Misma firma: create or replace conserva los
-- grants (20260911120100:821-824).
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
  'Edita un trabajo dentro de su plazo (la policy decide): cabecera y renglones o ruedas. Al editar un SERVICE, la fecha, los kilómetros y la sucursal se copian a la mecánica adjunta (cargado_con_id) si sigue en su ventana; un plan sin la feature no bloquea la edición del service. No toca stock, pendientes ni canjes.';
