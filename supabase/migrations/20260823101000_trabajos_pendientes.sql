-- ============================================================
-- Fidelli Motors · Trabajos pendientes — Bloque 3
--
-- Lo que el mecánico ve y avisa pero no hace hoy: "pastillas al 30%",
-- "la correa te queda para 15.000 km". Hoy se dice de palabra y no
-- vuelve nadie — es el cartón perdido con un ticket diez veces más
-- grande. Un pendiente es un COMPROMISO CON VENCIMIENTO que entra al
-- motor de retención; por eso es tabla propia y no una extensión de
-- notas_vehiculo (una nota es información, no vence ni se resuelve).
--
-- El caso más frecuente NO es la mecánica: es el lubricentro que ve algo
-- mientras cambia el aceite. Por eso guardar_service acepta pendientes
-- NUEVOS y pendientes A RESOLVER en los dos tipos de trabajo, y el alta
-- suelta va por la tabla directa desde la ficha.
--
-- EL OBJETIVO LO PONE EL MECÁNICO — no se predice. La estimación por
-- km/día es de los services y se queda ahí. El estado del pendiente
-- compara contra el calendario (objetivo_fecha vs hoy) o contra el
-- último odómetro CONOCIDO (objetivo_km vs el mayor kilometraje
-- registrado): medición, nunca proyección.
--
-- vista_proximos_service NO SE TOCA. La unión de las dos fuentes pasa
-- en la página, nunca en un union all adentro de la vista de retención.
-- ============================================================


-- ---------- 1 · La tabla ----------
create type estado_pendiente as enum ('pendiente', 'resuelto', 'descartado');

create table trabajos_pendientes (
  id                  uuid primary key default gen_random_uuid(),
  lubricentro_id      uuid not null references lubricentros(id) on delete restrict,
  vehiculo_id         uuid not null references vehiculos(id) on delete restrict,
  -- De dónde salió: el trabajo en el que el mecánico lo vio. Nulable para
  -- los cargados sueltos desde la ficha. set null y no restrict: si un
  -- superadmin borra ese service, el compromiso con el cliente sigue vivo.
  origen_service_id   uuid references services(id) on delete set null,
  usuario_id          uuid not null references usuarios(id) on delete restrict,
  descripcion         text not null,
  -- El objetivo, a mano: fecha, kilómetros, o los dos ("6 meses o
  -- 10.000 km, lo que llegue primero" es la convención del rubro).
  objetivo_fecha      date,
  objetivo_km         integer check (objetivo_km > 0 and objetivo_km <= 3000000),
  estado              estado_pendiente not null default 'pendiente',
  -- Visible en la página del cliente. DEFAULT OCULTO: mostrárselo al
  -- dueño del auto es decisión del lubricentro, no nuestra.
  visible_cliente     boolean not null default false,
  -- El cierre: cuándo se resolvió y en qué trabajo (si fue tildado al
  -- cargar uno). "Descartado no se borra": que no lo hizo es un dato.
  resuelto_en         timestamptz,
  resuelto_service_id uuid references services(id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint descripcion_con_sustancia check (char_length(trim(descripcion)) >= 5),
  constraint objetivo_presente check (objetivo_fecha is not null or objetivo_km is not null),
  constraint cierre_coherente check (
    (estado = 'pendiente' and resuelto_en is null)
    or (estado <> 'pendiente' and resuelto_en is not null)
  )
);

create index pendientes_lubricentro_idx on trabajos_pendientes (lubricentro_id);
create index pendientes_abiertos_idx on trabajos_pendientes (vehiculo_id)
  where estado = 'pendiente';

comment on table trabajos_pendientes is
  'Compromisos con vencimiento: lo que el mecánico vio y quedó por hacer. Entra al motor de retención vía vista_pendientes. El objetivo lo pone el mecánico — nunca se predice.';

-- ---------- 2 · RLS: patrón de tenant + gating por plan ----------
alter table trabajos_pendientes enable row level security;

create policy pendientes_lectura on trabajos_pendientes for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy pendientes_alta on trabajos_pendientes for insert to authenticated
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('pendientes'))
    or soy_superadmin()
  );

create policy pendientes_edicion on trabajos_pendientes for update to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('pendientes'))
    or soy_superadmin()
  );

-- No se borran: se resuelven o se descartan. Igual que services.
create policy pendientes_borrado on trabajos_pendientes for delete to authenticated
  using (soy_superadmin());


-- ---------- 3 · La vista — el MISMO contrato que vista_proximos_service ----------
-- Vista APARTE a propósito: la de retención no se toca. Comparte los
-- nombres de columnas para que la página una las dos fuentes sin casos
-- especiales. Los tres estados de siempre; sin gracia de 15 días en la
-- fecha (la gracia de los services existe porque su fecha es una
-- PREDICCIÓN — un objetivo puesto a mano vence cuando vence). El estado
-- por km compara contra el último odómetro conocido: vencido si ya lo
-- pasó, urgente a ≤500 km, próximo a ≤2.000 km (la escala de 7/30 días
-- traducida al ritmo típico de 40 km/día que ya usa la retención).
create view vista_pendientes as
with abiertos as (
  select tp.*, v.patente, v.patente_normalizada, v.marca, v.modelo, v.cliente_id
  from trabajos_pendientes tp
  join vehiculos v on v.id = tp.vehiculo_id
  where tp.estado = 'pendiente'
),
odometro as (
  -- El último kilometraje CONOCIDO, de cualquier tipo de trabajo: una
  -- mecánica con odómetro anotado también es una medición.
  select s.vehiculo_id, max(s.kilometros) as ultimo_km
  from services s
  where not s.anulado and s.kilometros is not null
  group by s.vehiculo_id
),
ultima_sucursal as (
  select distinct on (s.vehiculo_id) s.vehiculo_id, s.sucursal_id
  from services s
  where not s.anulado
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
calculo as (
  select
    a.*,
    o.ultimo_km,
    coalesce(so.sucursal_id, us.sucursal_id) as sucursal_id_efectiva,
    case
      when a.objetivo_km is not null and o.ultimo_km is not null
      then a.objetivo_km - o.ultimo_km
    end as km_faltantes,
    case
      when a.objetivo_fecha is null then null
      when a.objetivo_fecha < current_date then 'vencido'
      when a.objetivo_fecha <= current_date + 7 then 'urgente'
      when a.objetivo_fecha <= current_date + 30 then 'proximo'
    end as estado_fecha,
    case
      when a.objetivo_km is null or o.ultimo_km is null then null
      when o.ultimo_km >= a.objetivo_km then 'vencido'
      when a.objetivo_km - o.ultimo_km <= 500 then 'urgente'
      when a.objetivo_km - o.ultimo_km <= 2000 then 'proximo'
    end as estado_km
  from abiertos a
  left join odometro o on o.vehiculo_id = a.vehiculo_id
  left join services so on so.id = a.origen_service_id
  left join ultima_sucursal us on us.vehiculo_id = a.vehiculo_id
)
select
  c.lubricentro_id,
  c.vehiculo_id,
  c.patente,
  c.patente_normalizada,
  c.marca,
  c.modelo,
  c.cliente_id,
  cl.nombre            as cliente_nombre,
  cl.telefono          as cliente_telefono,
  c.sucursal_id_efectiva as sucursal_id,
  suc.nombre           as sucursal_nombre,
  c.id                 as pendiente_id,
  c.descripcion,
  c.objetivo_fecha,
  c.objetivo_km,
  c.ultimo_km,
  c.km_faltantes,
  c.visible_cliente,
  c.origen_service_id,
  c.created_at         as creado,
  c.objetivo_fecha     as fecha_estimada,
  case when c.objetivo_fecha is not null
       then c.objetivo_fecha - current_date end as dias_hasta,
  (case
    when 'vencido' in (c.estado_fecha, c.estado_km) then 'vencido'
    when 'urgente' in (c.estado_fecha, c.estado_km) then 'urgente'
    else 'proximo'
  end)::estado_contacto as estado,
  -- El anti-spam del pendiente: un contacto por motivo 'pendiente'
  -- POSTERIOR a que el pendiente se anotó. Por vehículo, a propósito:
  -- dos pendientes del mismo auto se avisan en el mismo WhatsApp.
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = 'pendiente'
      and co.created_at > c.created_at
  ) as contactado
from calculo c
join clientes cl on cl.id = c.cliente_id
left join sucursales suc on suc.id = c.sucursal_id_efectiva
-- Solo lo accionable: el que todavía no entró en ventana NO aparece —
-- un objetivo a tres meses no es trabajo de esta semana.
where c.estado_fecha is not null or c.estado_km is not null;

-- El replace borra esta opción; sin ella un owner ve los pendientes de
-- todos los lubricentros. Se repone SIEMPRE.
alter view vista_pendientes set (security_invoker = on);

comment on view vista_pendientes is
  'Los pendientes accionables, con el contrato de columnas de vista_proximos_service para unirse en la página. Estado por objetivo puesto a mano (fecha vs hoy · km vs último odómetro conocido): medición, nunca predicción.';


-- ---------- 4 · El mensaje del pendiente, en el sistema de tonos ----------
-- El template de retención habla de kilómetros de próximo service; para
-- un pendiente eso es mentira. Cada tono gana su segunda plantilla, con
-- {pendiente} = la descripción de lo que quedó por hacer.
alter table mensaje_templates add column contenido_pendiente text;

update mensaje_templates set contenido_pendiente = case tono
  when 'Cercano' then
    'Hola {nombre}! Te escribimos del taller. Cuando trajiste tu {vehiculo} ({patente}) quedó pendiente: {pendiente}. ¿Coordinamos un turno para resolverlo?'
  when 'Formal' then
    'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, tiene un trabajo pendiente: {pendiente}. Quedamos a disposición para agendar el turno.'
  when 'Directo' then
    '{nombre}, tu {vehiculo} tiene un trabajo pendiente: {pendiente}. Escribinos y te damos turno.'
  else
    'Hola {nombre}! Tu {vehiculo} ({patente}) tiene un trabajo pendiente: {pendiente}. ¿Coordinamos?'
end
where contenido_pendiente is null;

-- Y la siembra de tenants nuevos trae las dos plantillas por tono.
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

  insert into mensaje_templates (lubricentro_id, tono, contenido, contenido_pendiente, activo) values
    (p_lubricentro_id, 'Cercano',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un turno?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Cuando trajiste tu {vehiculo} ({patente}) quedó pendiente: {pendiente}. ¿Coordinamos un turno para resolverlo?',
     true),
    (p_lubricentro_id, 'Formal',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, tiene un trabajo pendiente: {pendiente}. Quedamos a disposición para agendar el turno.',
     false),
    (p_lubricentro_id, 'Directo',
     '{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y te damos turno.',
     '{nombre}, tu {vehiculo} tiene un trabajo pendiente: {pendiente}. Escribinos y te damos turno.',
     false);
end;
$$;

comment on function sembrar_templates is
  'Los tres tonos por defecto (Cercano activo), cada uno con su plantilla de service y de pendiente. Idempotente.';


-- ---------- 5 · guardar_service: pendientes en el MISMO flujo ----------
-- Los dos movimientos que hacen que la función viva en vez de morir en
-- una lista que nadie limpia:
--   · p_pendientes: lo que quedó por hacer, anotado al cargar el trabajo.
--   · p_resolver_pendientes: los abiertos que el mecánico tildó porque
--     los hizo EN este trabajo. Misma transacción: o queda todo, o nada.
-- Firma nueva con defaults al final: el front desplegado no la ve.
drop function if exists guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text
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
  p_resolver_pendientes  uuid[] default '{}'::uuid[]
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
    if p_tipo = 'mecanica' and v_premio.alcance is distinct from 'todos' then
      raise exception 'canje_solo_en_service';
    end if;
  end if;

  if p_tipo = 'mecanica' then
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
  else
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
  end if;

  -- ---------- Los pendientes NUEVOS: "¿quedó algo pendiente?" ----------
  -- La policy de INSERT (plan_permite('pendientes')) rige acá adentro:
  -- la función es security invoker a propósito.
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

  -- ---------- Los tildados: se hicieron EN este trabajo ----------
  -- Acotado al vehículo y a los abiertos: un id ajeno o ya cerrado se
  -- ignora en silencio — tildar dos veces no puede romper nada.
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
  'Guarda el trabajo completo (service o mecánica) + renglones + canje opcional + pendientes nuevos + pendientes resueltos, en UNA transacción. Security invoker: el RLS —gating por tipo y por feature— decide.';

revoke execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[]
) from public, anon;
grant execute on function guardar_service(
  uuid, uuid, date, integer, text, integer, jsonb, uuid, text, text, boolean, tipo_trabajo, text, jsonb, uuid[]
) to authenticated;


-- ---------- 6 · get_carton: el pendiente visible cierra el círculo ----------
-- Mismo patrón que las notas: visibilidad POR PENDIENTE, sin flag global.
-- Default oculto — mostrárselo al dueño del auto es decisión del
-- lubricentro. Se muestran solo los abiertos: un pendiente resuelto ya es
-- un renglón del historial, no una recomendación.
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
  'Única puerta pública con patente. Línea de tiempo con los dos tipos, notas visibles y pendientes abiertos marcados visibles (default oculto). Sirve suspendido (el premio no). Registra la búsqueda.';
