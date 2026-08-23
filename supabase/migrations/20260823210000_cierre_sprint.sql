-- ════════════════════════════════════════════════════════════════════
-- CIERRE DEL SPRINT · tres correcciones de base (Bloque final, parte B)
--
-- 1 · get_carton emite el ALCANCE del premio. Desde el bloque 2B el ciclo
--     puede contar todos los trabajos y no solo los services, pero el
--     cliente veía "3 de 5 services" igual: en un taller con esa
--     configuración, el cartel le habla de algo que no es lo que suma.
--     El copy tiene que seguir la configuración, y para eso el dato tiene
--     que llegar. Clave ADITIVA: el front viejo la ignora.
--
-- 2 · get_carton emite la CANTIDAD de cada renglón. Viaja desde el bloque
--     5 en service_items pero moría en la base: si un service llevó dos
--     filtros, el papel del cliente decía lo mismo que si llevó uno.
--
-- 3 · resumen_inicio deja de calcular 'evolucion'. La reemplazó
--     'series.mes' en el bloque de gráficos y se conservó a propósito
--     durante la transición; el front nuevo hace cinco meses que no la
--     lee (verificado: cero referencias en app/, components/ y lib/), y
--     se computaba en CADA carga del Inicio de CADA tenant.
-- ════════════════════════════════════════════════════════════════════


-- ---------- 1 y 2 · get_carton: alcance del premio y cantidades ----------
-- Se conserva TODO lo del bloque 7 (tema, logo_tamano, mensaje del taller
-- con sus tres llaves, whatsapp_taller y su caída). Lo único que cambia
-- son las dos claves nuevas.

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
  'Única puerta pública con patente. Línea de tiempo con los dos tipos, notas y pendientes visibles, cantidades por renglón, alcance del premio, tema y tamaño de logo del tenant, y con pagina_premium el mensaje del taller (vigencia viva, tenant activo) y el WhatsApp de la sucursal del último trabajo. Sirve suspendido (premio y mensaje no). Registra la búsqueda.';


-- ---------- 2b · get_landing: el alcance del premio ----------
-- La vidriera dice "cada N services, tu premio". Con alcance 'todos' eso
-- es falso, así que el dato también tiene que llegar acá. Se conserva
-- todo lo demás del bloque 7 (tema, logo_tamano) — solo se suma la clave.

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
    'tema', coalesce(c.tema, 'claro'),
    'logo_tamano', coalesce(c.logo_tamano, 'normal'),
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
        'descripcion', p.descripcion,
        'alcance', coalesce(p.alcance::text, 'services')
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
  'Shell público de la landing: marca, colores, tema, tamaño de logo, contacto, sucursales y el premio vigente con su alcance. Sirve aunque el tenant esté suspendido (el premio no se ofrece). No escribe.';


-- ---------- 3 · resumen_inicio sin 'evolucion' ----------
-- Misma firma, así que conserva sus grants.

create or replace function resumen_inicio(p_sucursal_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
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
          'km', u.kilometros)
        order by u.fecha desc, u.created_at desc)
      from (
        select s.id, s.fecha, s.created_at, s.kilometros,
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
