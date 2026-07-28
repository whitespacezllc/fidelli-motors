-- ============================================================
-- Fix: mostrar_productos no cubría aceite_nombre
--
-- get_carton aplica campos_visibles->>'mostrar_productos' al detalle de
-- cada renglón del cartón, pero devolvía aceite_nombre sin condición.
-- Con el flag apagado, el renglón venía en null y el aceite seguía
-- saliendo con nombre y marca ("Castrol Magnatec 5W30"). Son el mismo
-- tipo de dato —el nombre comercial del producto usado— y el lubri que
-- apaga la opción espera que no se muestre ninguno. Verificado en local
-- antes del fix.
--
-- MATIZ IMPORTANTE: aceite_tipo (la viscosidad, "15W40") se muestra
-- SIEMPRE, con el flag encendido o apagado. No es un dato comercial:
-- es la especificación técnica que el cliente necesita conocer de su
-- auto, y en el cartón físico está impresa como campo propio.
--
-- La pantalla del cliente consume lo que llega sin reimplementar la
-- regla, que es la postura correcta: la privacidad es configuración de
-- la base, no lógica del front. Por eso el fix va acá y no en React.
--
-- La función es la misma de 20260723215350_rls_multi_tenant.sql (ya
-- mergeada — no se edita), redefinida entera con ese único cambio.
-- Misma postura de seguridad: DEFINER, search_path fijo, y el grant a
-- anon ya existe sobre esta firma, así que el replace lo conserva.
-- ============================================================

-- volatile porque inserta en landing_busquedas.
-- security definer porque el cliente no tiene sesión ni permisos.
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
  v_resultado     jsonb;
begin
  v_patente_norm := normalizar_patente(p_patente);

  select * into v_lubricentro from lubricentros where slug = p_slug and activo;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

  select * into v_vehiculo from vehiculos
  where lubricentro_id = v_lubricentro.id and patente_normalizada = v_patente_norm;

  -- Guardamos el resultado ANTES del insert: found se reescribe con cada sentencia
  v_encontrada := found;

  -- Toda búsqueda queda registrada: métrica de escaneo y captura de leads
  insert into landing_busquedas (lubricentro_id, patente, encontrada)
  values (v_lubricentro.id, v_patente_norm, v_encontrada);

  if not v_encontrada then
    return jsonb_build_object(
      'error', 'patente_no_encontrada',
      'lubricentro', jsonb_build_object(
        'nombre', v_lubricentro.nombre,
        'logo_url', v_config.logo_url,
        'color_primario', v_config.color_primario,
        'datos_contacto', v_config.datos_contacto
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'datos_contacto', v_config.datos_contacto,
      'campos_visibles', v_config.campos_visibles
    ),
    'vehiculo', jsonb_build_object(
      'patente', v_vehiculo.patente,
      'marca', v_vehiculo.marca,
      'modelo', v_vehiculo.modelo,
      'anio', v_vehiculo.anio
    ),
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
          -- La viscosidad se muestra siempre: es especificación técnica,
          -- no producto. Solo el nombre comercial respeta el flag.
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
  'Única puerta pública. Respeta campos_visibles del tenant (incluido aceite_nombre desde este fix) y registra la búsqueda.';
