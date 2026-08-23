-- ============================================================
-- Fidelli Motors · Trabajos mecánicos — Bloque 2A (solo base)
--
-- `services` deja de asumir que todo es un cambio de aceite: aparece el
-- tipo de trabajo (service | mecanica). El trabajo mecánico es
-- descripción libre + repuestos como renglones de texto + observaciones.
--
-- LA RESTRICCIÓN QUE MANDA: vista_proximos_service hace
-- distinct on (vehiculo_id) order by fecha desc. Si una mecánica entrara
-- con la misma forma, pasaría a ser "el último service del auto" y el
-- auto DESAPARECERÍA de la lista de a quién llamar — sin error y sin
-- log, en la funcionalidad que renueva la suscripción. Por eso todo lo
-- que calcula retención, ritmo, premios o "services" filtra tipo =
-- 'service', y verificaciones.sql hace fallar el reset si la vista
-- pierde el filtro o el security_invoker.
--
-- LA DECISIÓN DE MODELO (renglones libres): se EXTIENDE service_items en
-- vez de crear una tabla propia. item_tipo pasa a nullable y la línea
-- libre usa `detalle`, que ya existía. El criterio fue uno solo: el
-- historial del vehículo tiene que salir de UNA fuente — la página del
-- cliente es el activo del producto y su línea de tiempo no puede
-- armarse uniendo dos consultas. Con esto, la línea de tiempo sigue
-- siendo `services` y los renglones siguen siendo `service_items`, para
-- los dos tipos; get_carton no suma ninguna fuente nueva, y la regla de
-- 24 horas y el RLS de items cubren la mecánica sin una policy más.
-- "Un renglón marcado es la existencia de la fila" sigue siendo cierto.
--
-- REGLA DURA cumplida: acá no entra NINGÚN importe. Ni precio, ni costo,
-- ni mano de obra valorizada. La plata vive en presupuestos (bloque 4).
--
-- SIN GATING INCONDICIONAL: el chequeo de plan sobre services es
-- CONDICIONAL AL TIPO — (tipo <> 'mecanica' or plan_permite('mecanica')).
-- Un plan_permite suelto acá dejaría a todo tenant Basic sin poder
-- cargar un service común: el peor bug posible, en la tabla más caliente.
-- ============================================================


-- ---------- 1 · El tipo de trabajo ----------
create type tipo_trabajo as enum ('service', 'mecanica');

comment on type tipo_trabajo is
  'service = cambio de aceite (el cartón de 11 renglones). mecanica = trabajo de taller con descripción libre.';

alter table services
  add column tipo tipo_trabajo not null default 'service',
  add column trabajo_descripcion text;

comment on column services.tipo is
  'Con default service: todo lo cargado hasta hoy quedó clasificado sin tocar una fila.';
comment on column services.trabajo_descripcion is
  'Qué se le hizo al auto, en mecánica. NULL en services: el cartón ya se describe solo.';

-- ---------- 2 · Los tres NOT NULL, condicionados ----------
-- Los CHECK viejos NO se aflojan: kilometros_check, aceite_tipo_no_vacio
-- y prox_mayor_actual siguen intactos (un CHECK sobre NULL pasa, así que
-- solo se pronuncian cuando el valor está). Lo que se condiciona es la
-- OBLIGATORIEDAD: para tipo service, los tres siguen siendo NOT NULL —
-- un service no puede degradarse por este cambio.
alter table services
  alter column kilometros drop not null,
  alter column aceite_tipo drop not null,
  alter column prox_service_km drop not null;

alter table services add constraint service_completo check (
  tipo <> 'service' or (
    kilometros is not null
    and aceite_tipo is not null
    and prox_service_km is not null
    and trabajo_descripcion is null
  )
);

-- La mecánica: descripción obligatoria con sustancia, kilómetros
-- OPCIONALES (se guardan si están), y nada de campos de aceite — un
-- trabajo de frenos con viscosidad cargada es un dato mentiroso.
alter table services add constraint mecanica_coherente check (
  tipo <> 'mecanica' or (
    trabajo_descripcion is not null
    and char_length(trim(trabajo_descripcion)) >= 5
    and aceite_tipo is null
    and prox_service_km is null
    and aceite_producto_id is null
    and aceite_nombre is null
  )
);

-- ---------- 3 · Los renglones libres ----------
-- El renglón mecánico es una fila de service_items SIN item_tipo y con
-- el texto en `detalle` (columna que ya existía). El índice único
-- (service_id, item_tipo) no molesta: los NULL no chocan entre sí.
alter table service_items alter column item_tipo drop not null;

alter table service_items add constraint renglon_o_texto check (
  item_tipo is not null
  or char_length(trim(coalesce(detalle, ''))) >= 2
);

comment on column service_items.item_tipo is
  'Uno de los 11 renglones del cartón, o NULL: renglón libre de un trabajo mecánico (el texto va en detalle).';


-- ---------- 3b · Qué cuenta para el premio ----------
-- Para un lubricentro, "cada 5 services" son cambios de aceite. Para un
-- taller, si la mecánica no avanza el ciclo, el programa no se dispara
-- nunca y parece roto. Se vuelve configurable POR PREMIO, con default
-- 'services': ningún tenant existente cambia de comportamiento.
create type alcance_premio as enum ('services', 'todos');

alter table premios
  add column alcance alcance_premio not null default 'services';

comment on column premios.alcance is
  'Qué trabajos avanzan el ciclo: services = solo cambios de aceite (default histórico) · todos = también mecánica.';


-- ---------- 4 · La policy: gating CONDICIONAL AL TIPO ----------
-- Nace acá, llamando a la misma plan_permite() de 1A. La condición
-- (tipo <> 'mecanica' or ...) es la diferencia entre gatear la mecánica
-- y romperle la carga de services a todos los planes Basic.
-- Solo WITH CHECK: la lectura de lo ya cargado no se toca nunca.
alter policy services_insercion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica' or plan_permite('mecanica')))
    or soy_superadmin()
  );

-- La edición también: sin esto, un Basic convertiría un service en
-- mecánica por UPDATE, o seguiría editando mecánicas tras bajar de plan.
alter policy services_edicion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica' or plan_permite('mecanica')))
    or soy_superadmin()
  );


-- ---------- 5 · vista_proximos_service: SOLO tipo service ----------
-- Misma vista de 20260723214743 con el filtro en los DOS CTEs que leen
-- services: `ultimo` (que la mecánica no desplace al último service) y
-- `ritmo` (que el km/día se siga midiendo entre cambios de aceite).
create or replace view vista_proximos_service as
with ultimo as (
  select distinct on (s.vehiculo_id)
    s.vehiculo_id,
    s.id            as service_id,
    s.fecha,
    s.kilometros,
    s.prox_service_km,
    s.sucursal_id,
    s.lubricentro_id
  from services s
  where not s.anulado
    and s.tipo = 'service'
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
ritmo as (
  select
    s.vehiculo_id,
    count(*)                                    as cantidad_services,
    max(s.kilometros) - min(s.kilometros)       as km_recorridos,
    greatest(max(s.fecha) - min(s.fecha), 1)    as dias_transcurridos
  from services s
  where not s.anulado
    and s.tipo = 'service'
  group by s.vehiculo_id
),
calculo as (
  select
    u.lubricentro_id,
    u.vehiculo_id,
    u.service_id           as ultimo_service_id,
    u.fecha                as ultimo_service_fecha,
    u.kilometros           as ultimo_service_km,
    u.prox_service_km,
    u.sucursal_id,
    r.cantidad_services,
    case
      when r.cantidad_services >= 2 and r.km_recorridos > 0
        then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad_services < 2 or r.km_recorridos = 0) as estimacion_inicial
  from ultimo u
  join ritmo r on r.vehiculo_id = u.vehiculo_id
),
proyeccion as (
  select
    c.*,
    greatest(c.prox_service_km - c.ultimo_service_km, 0) as km_faltantes,
    (c.ultimo_service_fecha
      + (greatest(c.prox_service_km - c.ultimo_service_km, 0) / c.km_por_dia)::integer
    )::date as fecha_estimada
  from calculo c
),
clasificado as (
  select
    p.*,
    case
      when p.fecha_estimada < current_date - 15 then 'vencido'::estado_contacto
      when p.fecha_estimada <= current_date + 7 then 'urgente'::estado_contacto
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
  c.prox_service_km,
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
      and co.estado = c.estado
      and co.created_at > c.ultimo_service_fecha
  ) as contactado
from clasificado c
join vehiculos v on v.id = c.vehiculo_id
join clientes cl on cl.id = v.cliente_id
join sucursales suc on suc.id = c.sucursal_id
where c.fecha_estimada <= current_date + 30;

-- El replace de arriba borró esta opción. Sin ella, un owner ve los
-- datos de todos los lubricentros. Se repone SIEMPRE.
alter view vista_proximos_service set (security_invoker = on);

comment on view vista_proximos_service is
  'Estado por km/día real del vehículo, SOLO sobre tipo service: una mecánica posterior no desplaza al último service ni altera el ritmo. Default 40 km/día con un solo service. Umbrales 7/30/15.';


-- ---------- 6 · Las otras dos vistas que agregan services ----------
-- No están en la lista del bloque, pero les cambiaba el significado en
-- silencio: "cantidad de services" y "último service" del listado de
-- clientes y vehículos pasaban a mezclar mecánica. Mismo filtro, misma
-- reposición del security_invoker.
create or replace view vista_vehiculos as
select
  v.id,
  v.lubricentro_id,
  v.cliente_id,
  v.patente,
  v.patente_normalizada,
  v.marca,
  v.modelo,
  v.anio,
  v.created_at,
  count(s.id) filter (where not s.anulado and s.tipo = 'service')::integer as cantidad_services,
  max(s.fecha) filter (where not s.anulado and s.tipo = 'service') as ultimo_service_fecha,
  -- Las DOS preguntas de la ficha: el último service gobierna el próximo
  -- cambio de aceite; la última visita es el último trabajo de cualquier
  -- tipo. Sin esto, un auto atendido ayer por frenos mostraría una fecha
  -- de hace meses y el sistema parecería roto.
  max(s.fecha) filter (where not s.anulado) as ultima_visita_fecha,
  count(s.id) filter (where not s.anulado)::integer as cantidad_trabajos
from vehiculos v
left join services s on s.vehiculo_id = v.id
group by v.id;

alter view vista_vehiculos set (security_invoker = on);

create or replace view vista_clientes as
select
  c.id,
  c.lubricentro_id,
  c.nombre,
  c.telefono,
  c.email,
  c.cuit,
  c.created_at,
  lower(fm_unaccent(c.nombre)) as nombre_busqueda,
  coalesce(string_agg(distinct v.patente_normalizada, ' '), '') as patentes,
  count(distinct v.id)::integer as cantidad_vehiculos,
  max(s.fecha) filter (where not s.anulado and s.tipo = 'service') as ultimo_service_fecha,
  coalesce(string_agg(distinct upper(v.patente), ', '), '') as patentes_lista,
  ult.kilometros      as ultimo_service_km,
  ult.prox_service_km as ultimo_prox_service_km,
  -- la última visita: cualquier tipo de trabajo (ver vista_vehiculos)
  max(s.fecha) filter (where not s.anulado) as ultima_visita_fecha
from clientes c
left join vehiculos v on v.cliente_id = c.id
left join services  s on s.vehiculo_id = v.id
left join lateral (
  select s2.kilometros, s2.prox_service_km
  from services s2
  join vehiculos v2 on v2.id = s2.vehiculo_id
  where v2.cliente_id = c.id
    and not s2.anulado
    and s2.tipo = 'service'
  order by s2.fecha desc, s2.created_at desc
  limit 1
) ult on true
group by c.id, ult.kilometros, ult.prox_service_km;

alter view vista_clientes set (security_invoker = on);


-- ---------- 7 · Fidelliza cuenta lo que el premio DIGA que cuenta ----------
-- Default histórico: solo cambios de aceite (una mecánica no avanza el
-- ciclo en silencio). Con alcance = 'todos' —el caso taller— cualquier
-- trabajo suma. La columna `alcance` viaja en el retorno para que el
-- cartón sepa si el canje corresponde en este tipo de trabajo.
-- DROP + CREATE porque cambia el tipo de retorno; los llamadores
-- seleccionan por nombre, así que la columna extra es aditiva.
drop function if exists premio_disponible(uuid);

create function premio_disponible(p_vehiculo_id uuid)
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
    select count(*)::integer as n
    from services s
    cross join ultimo_canje uc
    left join premio_vigente pv on true
    where s.vehiculo_id = p_vehiculo_id
      and not s.anulado
      -- sin premio (pv null) o con alcance 'services': solo cambios de
      -- aceite, el comportamiento de siempre.
      and (pv.alcance = 'todos' or s.tipo = 'service')
      and (uc.fecha is null or s.created_at > uc.fecha)
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

revoke all on function premio_disponible(uuid) from public, anon;
grant execute on function premio_disponible(uuid) to authenticated, service_role;

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
    count(s.id) filter (
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


-- ---------- 8 · guardar_service acepta el tipo ----------
-- Firma nueva (dos parámetros con default al final): el front desplegado
-- llama con argumentos nombrados y los defaults completan — cero ventana
-- de incompatibilidad entre push y deploy.
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean
);

create function guardar_service(
  p_vehiculo_id         uuid,
  p_sucursal_id         uuid,
  p_fecha               date,
  p_kilometros          integer,
  p_aceite_tipo         text,
  p_prox_service_km     integer,
  p_items               jsonb default '[]'::jsonb,
  p_aceite_producto_id  uuid default null,
  p_aceite_nombre       text default null,
  p_observaciones       text default null,
  p_canjear_premio      boolean default false,
  p_tipo                tipo_trabajo default 'service',
  p_trabajo_descripcion text default null
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
    -- El canje va en el tipo de trabajo que el premio cuenta: con alcance
    -- 'services' (el default histórico), canjear en una mecánica sería
    -- regalar contra un contador que este trabajo ni movió. Con 'todos'
    -- —el caso taller— el canje corresponde en cualquier trabajo.
    if p_tipo = 'mecanica' and v_premio.alcance is distinct from 'todos' then
      raise exception 'canje_solo_en_service';
    end if;
  end if;

  if p_tipo = 'mecanica' then
    -- La mecánica: descripción obligatoria, kilómetros opcionales, nada
    -- de aceite (el CHECK mecanica_coherente es el backstop de esto).
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

    -- Los repuestos: renglones libres. item_tipo NULL, el texto en
    -- detalle, producto del catálogo si se eligió. Sin texto no hay
    -- renglón — la fila sigue siendo la existencia del hecho.
    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
      values (
        v_service,
        null,
        nullif(v_item->>'producto_id', '')::uuid,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true)
      );
    end loop;

    return v_service;
  end if;

  -- El camino de siempre: el cartón.
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

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
    values (
      v_service,
      (v_item->>'tipo')::item_tipo,
      nullif(v_item->>'producto_id', '')::uuid,
      nullif(trim(v_item->>'detalle'), ''),
      coalesce((v_item->>'cambiado')::boolean, true)
    );
  end loop;

  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  return v_service;
end;
$$;

comment on function guardar_service is
  'Guarda el trabajo completo (service con cartón, o mecánica con descripción y renglones libres) en una transacción. Security invoker: el RLS —incluido el gating condicional al tipo— decide.';

revoke execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text
) to authenticated;


-- ---------- 9 · actualizar_service respeta el tipo de la fila ----------
-- El tipo NO se edita: un service no se convierte en mecánica ni al
-- revés — sería reescribir la historia del auto. La función lee el tipo
-- de la fila y valida según corresponda.
drop function if exists actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text
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
  p_trabajo_descripcion text default null
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
begin
  -- El RLS de lectura ya recorta al tenant; el de UPDATE impone las 24
  -- horas y el gating por tipo.
  select tipo into v_tipo from services where id = p_service_id and not anulado;
  if v_tipo is null then
    raise exception 'service_no_editable';
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

    -- Renglones libres: sin clave estable, se reemplazan enteros. Es la
    -- misma transacción; el cliente nunca ve el medio.
    delete from service_items where service_id = p_service_id;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
      values (
        p_service_id,
        null,
        nullif(v_item->>'producto_id', '')::uuid,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true)
      );
    end loop;

    return;
  end if;

  -- El camino de siempre, intacto.
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
    raise exception 'service_no_editable';
  end if;

  -- `item_tipo is not null`: los renglones del cartón se sincronizan por
  -- tipo; un NULL en un NOT IN haría que el delete no borrara nada.
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
      cambiado    = coalesce((v_item->>'cambiado')::boolean, true)
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), ''),
        coalesce((v_item->>'cambiado')::boolean, true)
      );
    end if;
  end loop;
end;
$$;

comment on function actualizar_service is
  'Edita un trabajo dentro de la ventana de 24 hs (la impone RLS). El tipo no se cambia: valida según el tipo de la fila. Security invoker.';

revoke execute on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text
) from public, anon;
grant execute on function actualizar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, text
) to authenticated;

-- ---------- 10 · get_carton: UNA línea de tiempo con los dos tipos ----------
-- El cliente que escanea ve TODO lo que le hicieron al auto, ordenado
-- por fecha: services y mecánica juntos. Cada entrada lleva 'tipo' y
-- 'trabajo_descripcion'; los campos de aceite van en null para la
-- mecánica y el front del cliente (2B) decide cómo pintar cada uno.
-- La descripción del trabajo viaja SIEMPRE (es qué se hizo, como la
-- existencia del renglón); el detalle de repuestos respeta
-- mostrar_productos, porque ahí sí viven marcas.
-- Misma postura: SECURITY DEFINER + search_path fijo.
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
  v_resultado     jsonb;
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- SIN filtro por activo, a propósito (2B). Apagar la página pública de
  -- un suspendido castiga al dueño del auto —que no debe nada— y apaga de
  -- golpe TODOS los calcos de ese lubricentro: el parque de QR es el
  -- activo más difícil de reconstruir que tiene el producto. Y la página
  -- caída lleva la marca del lubricentro, no la nuestra. La suspensión
  -- vive en el PANEL (no se carga ni edita nada); la lectura del cliente
  -- final no se corta. NO "arreglar" esto devolviéndole el filtro.
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
        'datos_contacto', v_config.datos_contacto,
        'sucursales', v_sucursales
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'color_fondo', v_config.color_fondo,
      'color_carton', v_config.color_carton,
      'datos_contacto', v_config.datos_contacto,
      'sucursales', v_sucursales,
      'campos_visibles', v_config.campos_visibles
    ),
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
    -- El premio NO se muestra con el lubricentro suspendido: el historial
    -- sí (es del dueño del auto), pero no le prometemos al cliente un
    -- beneficio que el local no puede entregar mientras esté bloqueado.
    'fidelizacion', case
      when v_lubricentro.activo
       and coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
      then jsonb_build_object(
        'disponible', v_premio.disponible,
        'services_ciclo', v_premio.services_ciclo,
        'meta_services', v_premio.meta_services,
        'descripcion', v_premio.descripcion
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
                'detalle', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(si.detalle, p.nombre) else null end
              ) order by si.item_tipo, si.created_at
            )
            from service_items si
            left join productos p on p.id = si.producto_id
            where si.service_id = s.id
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
  'Única puerta pública con patente. Una sola línea de tiempo con services y mecánica (cada entrada lleva tipo). Respeta campos_visibles, sirve aunque el tenant esté suspendido (el premio no), devuelve colores y notas visibles. Registra la búsqueda.';


-- ---------- 10b · get_landing sobrevive a la suspensión ----------
-- Misma decisión y misma razón que get_carton: la vidriera responde
-- siempre — es la marca del lubricentro ante SU cliente, y apagarla
-- mata todos los calcos de golpe. El premio no se ofrece suspendido:
-- no se promete un beneficio que el local no puede entregar.
-- NO "arreglar" esto devolviéndole el `and l.activo` al where.
create or replace function get_landing(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nombre', l.nombre,
    'logo_url', c.logo_url,
    'color_primario', coalesce(c.color_primario, '#0A0A0A'),
    'color_fondo', c.color_fondo,
    'color_carton', c.color_carton,
    'datos_contacto', coalesce(c.datos_contacto, '{}'::jsonb),
    'sucursales', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', su.nombre,
        'direccion', su.direccion,
        'telefono', su.telefono,
        'horarios', su.horarios
      ) order by su.created_at), '[]'::jsonb)
      from sucursales su
      where su.lubricentro_id = l.id and su.activa
    ),
    'premio', case when l.activo then (
      select jsonb_build_object(
        'meta_services', p.meta_services,
        'descripcion', p.descripcion
      )
      from premios p
      where p.lubricentro_id = l.id and p.activo
      order by p.created_at desc
      limit 1
    ) else null end
  )
  from lubricentros l
  left join config_experiencia c on c.lubricentro_id = l.id
  where l.slug = p_slug;
$$;

comment on function get_landing is
  'Shell público de la landing: marca, colores, contacto y sucursales. Sirve aunque el tenant esté suspendido (el premio no se ofrece). No escribe.';


-- ---------- 11 · resumen_inicio: los conteos separan tipos ----------
-- "Services del mes" siguió significando cambios de aceite; la mecánica
-- tiene su propio contador nuevo (mecanicas_mes — clave ADITIVA: el
-- front desplegado la ignora hasta 2B). El gráfico y sus series siguen
-- siendo de services. Lo que NO se filtró, a propósito:
--   · primer_service (clientes_nuevos): un cliente cuya primera visita
--     es una mecánica ES un cliente nuevo.
--   · flota_anual (% de escaneo): pasó por el taller, tiene calco.
create or replace function resumen_inicio(p_sucursal_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
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
  flota_anual as (
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.fecha >= current_date - interval '12 months'
  ),
  primer_de_serie as (
    select min(s.fecha) as fecha
    from services s
    where not s.anulado
      and s.tipo = 'service'
      and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
  )
  select jsonb_build_object(

    'checklist', jsonb_build_object(
      'sucursales', (select count(*) from sucursales where activa),
      'productos',  (select count(*) from productos where activo),
      'premio_meta',(select meta_services from premios where activo limit 1),
      'services',   (select count(*) from services where not anulado and tipo = 'service')
    ),

    'metricas', jsonb_build_object(
      'services_mes', (
        select count(*) from services
        where not anulado
          and tipo = 'service'
          and fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'mecanicas_mes', (
        select count(*) from services
        where not anulado
          and tipo = 'mecanica'
          and fecha >= date_trunc('month', current_date)
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
          and s.tipo = 'service'
          and s.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        group by suc.nombre
      ) x
    ), '[]'::jsonb),

    -- ⚠ TRANSICIÓN: la lee el front viejo. El nuevo usa 'series.mes'.
    'evolucion', coalesce((
      select jsonb_agg(
        jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'cantidad', (
          select count(*)::integer from services s
          where not s.anulado
            and s.tipo = 'service'
            and s.fecha >= m.mes
            and s.fecha < m.mes + interval '1 month'
            and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        ))
        order by m.mes)
      from generate_series(
        date_trunc('month', current_date) - interval '5 months',
        date_trunc('month', current_date),
        interval '1 month') m(mes)
    ), '[]'::jsonb),

    'series', (
      select jsonb_object_agg(g.clave, serie.datos)
      from (values
        ('semana',    'week',    interval '1 week',   12),
        ('mes',       'month',   interval '1 month',  12),
        ('trimestre', 'quarter', interval '3 months',  8),
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
                  and s.tipo = 'service'
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

    -- La actividad reciente COMPLETA: los dos tipos, con 'tipo' y
    -- 'descripcion' para que el front (2B) pinte cada uno como lo que es.
    'ultimos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'tipo', u.tipo,
          'descripcion', u.trabajo_descripcion,
          'fecha', u.fecha,
          'creado', u.created_at,
          'patente', u.patente,
          'vehiculo', u.vehiculo,
          'sucursal', u.sucursal,
          'km', u.kilometros)
        order by u.fecha desc, u.created_at desc)
      from (
        select s.id, s.tipo, s.trabajo_descripcion, s.fecha, s.created_at,
               s.kilometros,
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
$$;

comment on function resumen_inicio is
  'Todo lo que dibuja el Inicio, en una consulta. Los conteos de "services" son SOLO tipo service; mecanicas_mes es aditiva para 2B. Con p_sucursal_id filtra todo salvo landing. Security invoker.';


-- ---------- 12 · metricas_plataforma: ídem, a escala plataforma ----------
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_primero date;
  v_series jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  select min(fecha) into v_primero
  from services where not anulado and tipo = 'service';

  if v_primero is null then
    v_series := jsonb_build_object(
      'dia', '[]'::jsonb, 'semana', '[]'::jsonb, 'mes', '[]'::jsonb);
  else
    select jsonb_object_agg(g.clave, serie.datos)
      into v_series
      from (values
        ('dia',    'day',   interval '1 day',   30),
        ('semana', 'week',  interval '1 week',  12),
        ('mes',    'month', interval '1 month', 12)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select coalesce((
          select jsonb_agg(
            jsonb_build_object('inicio', p.inicio, 'cantidad', (
              select count(*)::integer from services s
              where not s.anulado
                and s.tipo = 'service'
                and s.fecha >= p.inicio
                and s.fecha < (p.inicio + g.paso)::date
            ))
            order by p.inicio)
          from (
            select generate_series(
              greatest(
                (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                date_trunc(g.unidad, v_primero)::date
              ),
              date_trunc(g.unidad, current_date)::date,
              g.paso)::date as inicio
          ) p
        ), '[]'::jsonb) as datos
      ) serie;
  end if;

  return jsonb_build_object(
    'services_mes', (select count(*) from services
                     where not anulado and tipo = 'service'
                       and fecha >= date_trunc('month', current_date)),
    'mecanicas_mes', (select count(*) from services
                      where not anulado and tipo = 'mecanica'
                        and fecha >= date_trunc('month', current_date)),
    'acumulado', (select count(*) from services
                  where not anulado and tipo = 'service'),
    'mecanicas_acumulado', (select count(*) from services
                            where not anulado and tipo = 'mecanica'),
    'primer_service', v_primero,
    'series', v_series
  );
end;
$$;

comment on function metricas_plataforma is
  'El Pulso de /fidelli. Series y acumulados SOLO de tipo service; mecanicas_* son claves aditivas para 2B. Exige superadmin con excepción ruidosa.';
