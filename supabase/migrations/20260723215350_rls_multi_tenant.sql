-- ============================================================
-- Fidelli Motors · Row Level Security
-- Aislamiento total por lubricentro
-- ============================================================

-- ---------- 1. GRANTs: la capa de permisos base ----------
-- Postgres tiene DOS capas independientes:
--   GRANT = "¿este rol puede tocar esta tabla?"
--   RLS   = "de las filas que puede tocar, ¿cuáles ve?"
-- Sin GRANT, RLS ni se evalúa.

-- Limpieza de privilegios heredados que no queremos
-- (anon venía con TRUNCATE: RLS no protege contra eso)
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- service_role: el código del servidor con la clave secreta.
-- Saltea RLS por diseño (tiene BYPASSRLS) — se usa para operaciones
-- transaccionales del backend, como el alta de un tenant.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- anon NO toca ninguna tabla. Su única puerta es get_carton(),
-- con su grant explícito al final de esta migración.

-- Las tablas y funciones futuras heredan lo mismo
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- ---------- 2. Helpers: quién soy y a qué tenant pertenezco ----------
-- security definer para leer usuarios sin caer en recursión de políticas
create or replace function mi_lubricentro_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lubricentro_id from usuarios where id = auth.uid()
$$;

create or replace function soy_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol = 'superadmin' from usuarios where id = auth.uid()), false)
$$;

comment on function mi_lubricentro_id is 'El tenant del usuario logueado. Null para superadmin.';

-- ---------- 3. Activar RLS en todas las tablas ----------
alter table lubricentros       enable row level security;
alter table planes             enable row level security;
alter table sucursales         enable row level security;
alter table usuarios           enable row level security;
alter table suscripciones      enable row level security;
alter table pagos              enable row level security;
alter table config_experiencia enable row level security;
alter table mensaje_templates  enable row level security;
alter table productos          enable row level security;
alter table premios            enable row level security;
alter table clientes           enable row level security;
alter table vehiculos          enable row level security;
alter table services           enable row level security;
alter table service_items      enable row level security;
alter table canjes             enable row level security;
alter table contactos          enable row level security;
alter table landing_busquedas  enable row level security;

-- ============================================================
-- PLATAFORMA
-- ============================================================

create policy lubricentros_lectura on lubricentros for select to authenticated
  using (id = mi_lubricentro_id() or soy_superadmin());

create policy lubricentros_admin on lubricentros for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

create policy planes_lectura on planes for select to authenticated using (true);

create policy planes_admin on planes for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

create policy sucursales_tenant on sucursales for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy usuarios_propio on usuarios for select to authenticated
  using (id = auth.uid() or soy_superadmin());

create policy usuarios_admin on usuarios for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- El owner LEE su suscripción y sus pagos; solo Fidelli escribe
create policy suscripciones_lectura on suscripciones for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy suscripciones_admin on suscripciones for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

create policy pagos_lectura on pagos for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy pagos_admin on pagos for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- ============================================================
-- CONFIGURACIÓN Y OPERACIÓN — el patrón del tenant
-- ============================================================

create policy config_tenant on config_experiencia for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy templates_tenant on mensaje_templates for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy productos_tenant on productos for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy premios_tenant on premios for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy clientes_tenant on clientes for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy vehiculos_tenant on vehiculos for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy canjes_tenant on canjes for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy contactos_tenant on contactos for all to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Las búsquedas las escribe get_carton (security definer); el lubri solo lee
create policy busquedas_lectura on landing_busquedas for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- ============================================================
-- SERVICES — la regla de las 24 horas vive acá
-- ============================================================

create policy services_lectura on services for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy services_insercion on services for insert to authenticated
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Editable dentro de 24 hs, o con ventana de desbloqueo abierta.
-- No es una regla de UI que se pueda saltear: la dice la base.
create policy services_edicion on services for update to authenticated
  using (
    (lubricentro_id = mi_lubricentro_id()
      and (now() - created_at < interval '24 hours'
           or (desbloqueado_hasta is not null and now() < desbloqueado_hasta)))
    or soy_superadmin()
  )
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Los services no se borran: se anulan
create policy services_borrado on services for delete to authenticated
  using (soy_superadmin());

create policy items_lectura on service_items for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy items_escritura on service_items for all to authenticated
  using (
    (lubricentro_id = mi_lubricentro_id()
      and exists (
        select 1 from services s
        where s.id = service_id
          and (now() - s.created_at < interval '24 hours'
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  )
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- ============================================================
-- LA LANDING PÚBLICA — el único acceso sin sesión
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
          'aceite_tipo', s.aceite_tipo,
          'aceite_nombre', s.aceite_nombre,
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
  'Única puerta pública. Respeta campos_visibles del tenant y registra la búsqueda.';

-- El anónimo solo puede ejecutar esta función. Nada más.
grant execute on function get_carton(text, text) to anon;