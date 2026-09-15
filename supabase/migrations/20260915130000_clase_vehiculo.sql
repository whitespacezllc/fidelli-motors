-- ============================================================
-- Fidelli Motors · La clase del vehículo (fase 2 del sprint de pesado)
--
-- Los diez renglones de camión ya existen desde 20260915120000 y viven
-- detrás del "+" del cartón. Lo que falta es que un camión los tenga
-- DESPLEGADOS sin abrir nada: eso lo decide la clase del vehículo, que se
-- contesta UNA vez, en el alta, al lado de marca / modelo / año. Nunca en
-- la carga del service: un camión es camión para siempre, y preguntarlo
-- en cada carga son 600 respuestas por año a una pregunta que no cambia
-- (SA atiende ~50 camiones por mes).
--
-- ANULABLE Y SIN DEFAULT, a propósito. Marcar los ~1.800 vehículos
-- existentes como "liviano" sería afirmar algo que no sabemos: SA ya
-- tiene camiones cargados. null distingue "nunca se preguntó" de "se
-- contestó liviano", y permite después salir a buscar los vehículos sin
-- clasificar. El front lee `clase ?? "liviano"` (normalizarClase), y un
-- tercer valor que aparezca algún día cae en el set liviano, nunca en
-- ninguno.
--
-- La clase solo decide QUÉ VIENE DESPLEGADO. Nunca qué existe: es un
-- default, no una puerta, y ningún renglón queda inalcanzable. Por eso no
-- hay CHECK, ni policy, ni feature de plan: los renglones nuevos los tiene
-- todo el mundo desde Basic.
--
-- La MOTO no vive acá: se deriva de la chapa (patente_formato_valido),
-- como se decidió en 20260904120000. Un Scania lleva la misma chapa que
-- un Corsa, y por eso este caso sí necesita el dato guardado.
--
-- La pre-selección por marca (Scania, DAF, MAN…) es una ayuda de UI y
-- vive en el front (lib/clase-vehiculo.ts), no en la base ni en
-- marcas_vehiculo: no es una regla de negocio.
--
-- Cuatro cosas, en este orden: el enum y la columna; vista_vehiculos la
-- expone (con su security_invoker, regla 4); crear_cliente_con_vehiculo
-- la recibe (la firma vieja se dropea, como en 20260728120000); y
-- get_carton la emite para que el papel del cliente sea el mismo que ve
-- el mecánico. Crear el tipo y usarlo en la misma transacción es legal:
-- la regla de "valor nuevo de enum" es para ADD VALUE, no para CREATE
-- TYPE.
-- ============================================================


-- ---------- 1 · El enum y la columna ----------
create type clase_vehiculo as enum ('liviano', 'pesado');

alter table vehiculos add column clase clase_vehiculo;

comment on column vehiculos.clase is
  'null = nadie la declaró todavía; el front lo lee como liviano. Se guarda solo cuando alguien la contesta en el alta. La MOTO no vive acá: se deriva de la chapa (patente_formato_valido), como se decidió en 20260904120000.';


-- ---------- 2 · vista_vehiculos la expone ----------
-- Textual de 20260822210000 más la columna al final (create or replace
-- view solo admite agregar al final). La ficha del cliente lee los autos
-- de acá, y el dialog de edición necesita la clase guardada.
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
  count(s.id) filter (where not s.anulado)::integer as cantidad_trabajos,
  v.clase
from vehiculos v
left join services s on s.vehiculo_id = v.id
group by v.id;

-- Regla 4: create or replace view resetea las reloptions.
alter view vista_vehiculos set (security_invoker = on);


-- ---------- 3 · El alta del Momento 0 la recibe ----------
-- Misma función de 20260728120000 con p_clase al final, con default.
--
-- La firma vieja se DROPEA, por la misma razón de aquella vez: si quedara,
-- habría dos sobrecargas y una llamada sin p_clase matchearía las dos —
-- PostgREST responde 300 (ambiguo) y el alta se rompe para todos. Con una
-- sola función, el código desplegado que llama sin p_clase sigue andando:
-- el default null hace exactamente lo que hacía la firma vieja.
drop function if exists crear_cliente_con_vehiculo(text, text, text, text, text, text, integer, text);

-- >>> crear_cliente_con_vehiculo
create function crear_cliente_con_vehiculo(
  p_nombre   text,
  p_telefono text,
  p_email    text,
  p_patente  text,
  p_marca    text default null,
  p_modelo   text default null,
  p_anio     integer default null,
  p_cuit     text default null,
  p_clase    clase_vehiculo default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_cliente     uuid;
  v_vehiculo    uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  insert into clientes (lubricentro_id, nombre, telefono, email, cuit)
  values (v_lubricentro, p_nombre, p_telefono, nullif(trim(p_email), ''),
          nullif(trim(p_cuit), ''))
  returning id into v_cliente;

  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio, clase)
  values (v_lubricentro, v_cliente, p_patente,
          nullif(trim(p_marca), ''), nullif(trim(p_modelo), ''), p_anio,
          p_clase) -- @clase
  returning id into v_vehiculo;

  return v_vehiculo;
end;
$$;
-- <<< crear_cliente_con_vehiculo

comment on function crear_cliente_con_vehiculo is
  'Caso C del Momento 0: crea cliente y vehículo en una sola transacción. El tenant sale de la sesión. p_cuit opcional, normalizado por el front. p_clase opcional: null = nunca se preguntó.';

grant execute on function crear_cliente_con_vehiculo(text, text, text, text, text, text, integer, text, clase_vehiculo)
  to authenticated;


-- ---------- 4 · get_carton la emite ----------
-- Textual de la versión vigente (20260912100100) más la clave `clase` en
-- el bloque `vehiculo`. v_vehiculo es vehiculos%rowtype, así que la
-- columna nueva ya viaja en la variable; solo falta emitirla.
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
-- <<< get_carton

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;
