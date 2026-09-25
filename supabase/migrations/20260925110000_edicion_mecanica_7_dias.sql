-- ============================================================
-- Fidelli Motors · El plazo de edición por tipo: 7 días para la mecánica
--
-- Hasta acá la regla era una sola: 24 horas desde created_at para
-- cualquier trabajo, y después la fila queda fijada. Para un cambio de
-- aceite alcanza: se hace en una hora y se anota en el momento. Un
-- trabajo mecánico no: un arreglo de motor o de tren delantero se
-- termina de cerrar en días —el repuesto que faltaba llega el jueves,
-- la prueba en ruta es el viernes— y el mecánico completa lo que hizo a
-- medida que lo hace. Con 24 horas, la ficha quedaba fijada con la
-- descripción a medias y la única salida era pedirle a Fidelli que la
-- desbloqueara. Desde acá, la mecánica se fija a los 7 días.
--
-- LA DECISIÓN DE MODELO: el plazo es UNA función, plazo_edicion(tipo), y
-- todo lo que mide la ventana la llama — las tres policies (services,
-- renglones, ruedas), service_editable() y el sello 'fijado' que
-- get_carton le muestra al dueño del auto. Antes el `interval '24
-- hours'` estaba escrito seis veces; un cambio de plazo eran seis
-- ediciones y la posibilidad de que el panel dijera "editable" y la
-- base dijera que no. El front lo repite en lib/servicios.ts
-- (PLAZO_EDICION_HORAS) SOLO para pintar el badge y decidir qué botones
-- ofrecer: la regla la hace cumplir la base, como siempre.
--
-- El case es EXPLÍCITO por tipo y SIN else, a propósito: un cuarto tipo
-- de trabajo que nadie contemple devuelve null, `now() - created_at <
-- null` es null, y la fila queda NO editable — falla cerrado. R35 lo
-- hace visible: recorre el enum entero y exige un plazo para cada valor.
--
-- LO QUE NO CAMBIA:
--   · created_at sigue siendo el ancla. La fecha del trabajo, que el
--     mecánico puede retro-fechar, no participa.
--   · La ventana de desbloqueo de /fidelli sigue siendo de 24 horas
--     fijas, para cualquier tipo: es la salida extraordinaria, no el
--     plazo. R35e lo vigila.
--   · Neumáticos se fija a las 24 horas, como el service.
--   · Se bloquea la fila entera, no campos sueltos.
--
-- get_carton va textual de la versión vigente (20260915130000) con la
-- línea de 'fijado' cambiada y nada más. Conserva el marcador `-- @clase`
-- y el bloque `>>> get_carton` que muerden regresion-pesado.sh y
-- regresion-neumaticos.sh — los dos apuntan ahora a este archivo.
-- ============================================================


-- ---------- 1 · plazo_edicion(tipo): la fuente única ----------
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
  end;
$$;
-- <<< plazo_edicion

comment on function plazo_edicion(tipo_trabajo) is
  'Cuánto dura la ventana de edición de un trabajo desde created_at: 24 horas para service y neumáticos, 7 días para mecánica. La única fuente — la llaman las tres policies, service_editable() y get_carton; lib/servicios.ts la repite solo para pintar. Sin else a propósito: un tipo nuevo sin plazo queda no editable y R35 lo acusa.';

grant execute on function plazo_edicion(tipo_trabajo) to anon, authenticated;

comment on column services.created_at is
  'Ancla del plazo de edición: editable mientras now() - created_at < plazo_edicion(tipo) — 24 hs, o 7 días en una mecánica.';


-- ---------- 2 · Las tres policies, midiendo con plazo_edicion(tipo) ----------
-- ALTER POLICY ... USING solo: el WITH CHECK (tenant + gating por plan,
-- de 20260822210000 y 20260911120100) queda como está. No hay CREATE OR
-- REPLACE POLICY, y un DROP + CREATE dejaría la tabla sin policy de
-- UPDATE por un instante; alcanza con cambiar la condición.
-- >>> services_edicion
alter policy services_edicion on services
  using (
    (lubricentro_id = mi_lubricentro_id()
      and (now() - created_at < plazo_edicion(tipo) -- @policy-services
           or (desbloqueado_hasta is not null and now() < desbloqueado_hasta)))
    or soy_superadmin()
  );
-- <<< services_edicion

-- Los renglones heredan el plazo de su cabecera, como siempre lo hicieron
-- con las 24 horas.
-- >>> items_escritura
alter policy items_escritura on service_items
  using (
    (lubricentro_id = mi_lubricentro_id()
      and exists (
        select 1 from services s
        where s.id = service_items.service_id
          and (now() - s.created_at < plazo_edicion(s.tipo) -- @policy-items
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  );
-- <<< items_escritura

-- Las ruedas también. Hoy da lo mismo —solo existen en neumáticos, que
-- sigue en 24 horas— pero la ventana tiene que salir de UN lugar: el día
-- que el plazo de la gomería cambie, no puede quedar una policy midiendo
-- con el literal viejo.
-- >>> ruedas_escritura
alter policy ruedas_escritura on service_ruedas
  using (
    (lubricentro_id = mi_lubricentro_id()
      and exists (
        select 1 from services s
        where s.id = service_ruedas.service_id
          and (now() - s.created_at < plazo_edicion(s.tipo) -- @policy-ruedas
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  );
-- <<< ruedas_escritura


-- ---------- 3 · service_editable(): la misma respuesta que la policy ----------
-- Misma firma y postura que 20260723213843. Nadie la llama desde el
-- front hoy, pero es la función que dice "editable" por SQL y no puede
-- contestar distinto que la policy.
create or replace function service_editable(p_service_id uuid)
returns boolean
language sql
stable
as $$
  select
    now() - s.created_at < plazo_edicion(s.tipo)
    or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta)
  from services s
  where s.id = p_service_id;
$$;

comment on function service_editable is
  'Editable si está dentro de plazo_edicion(tipo) —24 hs; 7 días en mecánica— o si un superadmin abrió ventana de desbloqueo.';


-- ---------- 4 · get_carton: el sello 'fijado' con el plazo del tipo ----------
-- Textual de 20260915130000. La página del cliente es la otra mitad de
-- la regla: si el panel dice "editable 6 días" y el papel del dueño del
-- auto ya muestra el candado, uno de los dos miente. Solo cambia la
-- línea marcada @fijado.
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

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;
