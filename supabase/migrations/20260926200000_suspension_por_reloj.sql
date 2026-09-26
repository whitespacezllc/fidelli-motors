-- ════════════════════════════════════════════════════════════════════
-- LA SUSPENSIÓN POR RELOJ, DE VERDAD · bloque 1 del sprint de cobranza
-- (docs/verificacion-cobranza-2026-09.md § 7, hallazgos 2 y 5)
--
-- El reloj ya corre en producción y `suspension_automatica` se prende en
-- cuanto este bloque esté en producción y haya entrado un pago real por
-- Cresium. Antes de que el primer tenant se suspenda solo, dos cosas de la
-- base tienen que ser ciertas:
--
--   1 · LA VIDRIERA DEL SUSPENDIDO POR RELOJ NO OFRECE EL PREMIO.
--       `get_landing` y `get_carton` escondían el premio y el mensaje al
--       escanear SOLO con `activo = false` (el interruptor manual). La
--       suspensión por reloj es DERIVADA —nunca escribe `activo`—, así que
--       un tenant a 20 días de vencido, con el panel en solo lectura,
--       seguía prometiendo «cada 5 services, un cambio de aceite gratis»
--       en su página. Los Términos vigentes dicen textual: «Tu página
--       pública sigue respondiendo, sin el programa de fidelización».
--       Desde acá las dos puertas preguntan `es_activo(l)` —`activo` Y el
--       reloj fuera de `suspendido`—, que es LA definición (docs/METRICAS.md
--       § 1), la misma que usa la foto diaria.
--
--       ⚠ LA PÁGINA SIGUE RESPONDIENDO, COMO SIEMPRE. No vuelve ningún
--       `and l.activo` al where (regla 8 de CLAUDE.md, R4). Lo único que
--       cambia es la condición del premio y la del mensaje.
--
--       ⚠ Y EN GRACIA EL PREMIO SIGUE. Los Términos prometen siete días
--       «con el servicio funcionando completo»; `es_activo()` es true en
--       gracia y esconder el premio ahí sería pasarse de rosca. R36b tiene
--       el contracaso.
--
--       ⚠ LA MINA DOCUMENTADA: las dos funciones son SECURITY DEFINER y las
--       llama `anon` desde la página pública. Nada de lo que se agrega
--       depende de la sesión —ni `mi_lubricentro_id()` ni `auth.uid()`—:
--       `es_activo()` recibe la fila entera y `reloj_cobranza()` lee
--       `suscripciones` y `pagos` con los permisos del dueño de la definer
--       (postgres), exactamente como ya lo hace `foto_tenant_del_dia()`.
--       R36a lo prueba con `set local role anon`, que es quien llama en la
--       realidad.
--
--   2 · EL SUSPENDIDO A MANO NO TIENE ÓRDENES ABIERTAS. Pagar no levanta
--       una suspensión manual: la levanta Fidelli. Una orden viva (NOT_PAID
--       o PARTIAL) de un tenant que Fidelli apagó a mano es una cuenta a la
--       que alguien puede transferir para nada. Al pasar `activo` a false
--       se cierran (estado `CERRADA`). Es un trigger sobre `lubricentros` y
--       no una línea más en `cambiar_estado_lubricentro()` porque la
--       invariante es del DATO, no del camino: rige también si alguien
--       apaga el tenant por SQL.
--
--       `CERRADA` es la palabra NUESTRA; las otras cuatro (NOT_PAID,
--       PARTIAL, PAID, EXPIRED) son de Cresium. Si un depósito llega igual
--       a esa cuenta —el CVU sigue vivo en Cresium hasta sus siete días—,
--       `cresium_actualizar_orden()` vuelve a escribir lo que Cresium diga
--       y el pago se acredita: la palabra de Cresium gana, como siempre. El
--       front no la reusa (`crearOrden` solo reusa NOT_PAID/PARTIAL) ni la
--       pinta (`armarPagoDelTenant` la trata como cerrada).
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @premio_reloj`, `-- @mensaje_reloj`,
-- `-- @fidelizacion_reloj` y `-- @ordenes_abiertas` NO SE REFORMATEAN
-- NUNCA, ni los marcadores `-- >>> nombre` / `-- <<< nombre`: los muerde el
-- `sed` de `scripts/regresion-cobranza-suspension.sh`. Y `get_carton` SE
-- REDEFINE ACÁ: los `M_CARTON` de regresion-neumaticos.sh,
-- regresion-pesado.sh y regresion-edicion.sh apuntan a este archivo (es la
-- trampa de las sobrecargas de CLAUDE.md, aunque acá la firma no cambia).
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · get_landing: el premio se apaga con el estado DERIVADO
-- ════════════════════════════════════════════════════════════════════
--
-- Es la versión de 20260823210000 con UNA condición cambiada: el premio se
-- ofrece con `es_activo(l)` en vez de `l.activo`. El where no se toca.

-- >>> get_landing
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
    -- El premio: solo si el tenant está activo Y el reloj no lo suspendió.
    -- No se promete un beneficio que el local no puede entregar (regla 8),
    -- y un suspendido por reloj no puede cargar el service que lo cumple.
    'premio', case when es_activo(l) then (                              -- @premio_reloj
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
-- <<< get_landing

comment on function get_landing is
  'Shell público de la landing: marca, colores, tema, tamaño de logo, contacto, sucursales y el premio vigente con su alcance. Sirve aunque el tenant esté suspendido —a mano o por reloj—: la página responde, el premio no se ofrece (es_activo). No escribe.';

revoke all on function get_landing(text) from public;
grant execute on function get_landing(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · get_carton: el mensaje al escanear y el progreso del premio, ídem
-- ════════════════════════════════════════════════════════════════════
--
-- Es la versión de 20260925110000 con DOS condiciones cambiadas
-- (`@mensaje_reloj` y `@fidelizacion_reloj`): `es_activo(v_lubricentro)`
-- donde decía `v_lubricentro.activo`. Todo lo demás —la clase, el plazo de
-- edición, las ruedas, el registro de la búsqueda— es idéntico.

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
  'Única puerta pública con patente. Línea de tiempo con los dos tipos, notas y pendientes visibles, cantidades por renglón, alcance del premio, tema y tamaño de logo del tenant, y con pagina_premium el mensaje del taller (vigencia viva, tenant activo) y el WhatsApp de la sucursal del último trabajo. Sirve suspendido —a mano o por reloj— con el premio y el mensaje apagados (es_activo). Registra la búsqueda.';

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 3 · El suspendido a mano no tiene órdenes abiertas
-- ════════════════════════════════════════════════════════════════════

-- >>> cerrar_ordenes_al_suspender
create or replace function cerrar_ordenes_al_suspender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo las VIVAS. Una PAID es historia contable y no se toca; una
  -- EXPIRED ya está muerta. Definer porque nadie escribe cresium_ordenes
  -- por PostgREST y el RLS no tiene policy de escritura: sin esto, un
  -- superadmin que apaga el tenant desde su sesión dejaría el UPDATE en
  -- cero filas y sin error.
  update cresium_ordenes
     set estado         = 'CERRADA',
         actualizado_at = now()
   where lubricentro_id = new.id
     and estado in ('NOT_PAID', 'PARTIAL');                                -- @ordenes_abiertas
  return null;
end;
$$;
-- <<< cerrar_ordenes_al_suspender

revoke all on function cerrar_ordenes_al_suspender() from public, anon, authenticated;

drop trigger if exists cerrar_ordenes_al_suspender on lubricentros;
create trigger cerrar_ordenes_al_suspender
  after update of activo on lubricentros
  for each row
  when (old.activo and not new.activo)
  execute function cerrar_ordenes_al_suspender();

comment on function cerrar_ordenes_al_suspender is
  'Al apagar un tenant a mano (activo → false), sus órdenes de pago vivas (NOT_PAID, PARTIAL) pasan a CERRADA: pagar no levanta una suspensión manual y una cuenta abierta invita a transferir para nada. Si Cresium igual manda el depósito, su palabra gana y el pago se acredita.';

comment on column cresium_ordenes.estado is
  'El último estado conocido. NOT_PAID · PARTIAL · PAID · EXPIRED son de Cresium (los escribe el webhook). CERRADA es nuestra: la orden viva de un tenant suspendido a mano (20260926200000); el front no la reusa ni la pinta, y un depósito posterior la pisa con lo que Cresium diga.';
