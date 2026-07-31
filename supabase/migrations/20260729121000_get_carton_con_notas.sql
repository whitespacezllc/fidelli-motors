-- ============================================================
-- Fidelli Motors · get_carton devuelve las notas del vehículo
--
-- Misma función de 20260728140000 (cambiado en items + colores de
-- experiencia); se agrega el bloque 'notas': SOLO las visible_cliente,
-- de la más nueva a la más vieja, con la fecha de CREACIÓN — la fecha
-- pública nunca es la de edición (mentiría sobre cuándo se observó).
--
-- SIN flag nuevo en campos_visibles, a propósito: la visibilidad ya es
-- por nota, que es más granular y más claro. Un interruptor global
-- encima crearía la doble puerta confusa — una nota marcada "la ve tu
-- cliente" que igual no se ve. Si un lubri no quiere mostrar nada,
-- marca sus notas como internas y listo.
--
-- Postura intacta: SECURITY DEFINER + search_path fijo (anon no toca
-- tablas; esta función es su única puerta y decide qué sale).
-- ============================================================

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

  select * into v_lubricentro from lubricentros where slug = p_slug and activo;
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

  -- Guardamos el resultado ANTES del insert: found se reescribe con cada sentencia
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
    -- Las recomendaciones del mecánico sobre el auto. Solo las marcadas
    -- visibles, la más nueva primero. La fecha es created_at, SIEMPRE.
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
    'fidelizacion', case
      when coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
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
              ) order by si.item_tipo
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
  'Única puerta pública con patente. Respeta campos_visibles, devuelve el estado de cada renglón, los colores del tenant y las notas del vehículo marcadas visibles. Registra la búsqueda.';
