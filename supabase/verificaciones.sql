-- ============================================================
-- Fidelli Motors · Verificaciones que corren en cada db reset
--
-- Este archivo NO carga datos: es la red de seguridad del schema.
-- config.toml lo declara como segundo seed (db.seed.sql_paths), así que
-- se ejecuta DESPUÉS de todas las migraciones y del seed de demo — la
-- única posición desde la que se ve el estado FINAL del schema.
--
-- Por qué acá y no en una migración: una migración de verificación solo
-- ve lo que se aplicó ANTES de ella. Cualquier migración posterior que
-- rompa algo pasa sin que nadie se entere, y esa es exactamente la
-- migración que todavía no existe — la que va a abrir el próximo
-- agujero. Desde acá se ve todo, siempre.
--
-- Si algo falla, `supabase db reset` termina con exit code 1 y el
-- mensaje sale en la consola. No se pushea con el reset en rojo.
-- ============================================================

do $$
declare
  v_fallas text;
  v_cuantas integer;
begin
  select
    count(*),
    string_agg(format('  · %s — %s%s    arreglo: %s', vista, motivo, chr(10), arreglo), chr(10))
  into v_cuantas, v_fallas
  from verificar_seguridad_vistas();

  if v_cuantas > 0 then
    raise exception
      E'AISLAMIENTO MULTI-TENANT ROTO: % vista(s) de public saltean el RLS.\n%',
      v_cuantas, v_fallas
      using hint =
        'Casi siempre es un create or replace view que reseteó las reloptions: '
        'agregá el alter view ... set (security_invoker = on) al final de esa misma migración.';
  end if;
end $$;

-- ============================================================
-- Planes con control real (Bloque 1A)
--
-- Tres invariantes que, rotos, fallan hacia el lado caro:
--   1. Las funciones de resolución tienen que existir y ser SECURITY
--      DEFINER — sin definer, evaluarlas dentro de una policy recursa o
--      lee con el RLS del que llama y el gating queda a merced de lo que
--      ese rol pueda ver.
--   2. Ningún plan vigente puede tener features vacías: con la resolución
--      fail-closed, un vigente sin claves es un plan que no habilita NADA
--      y se le vendería a un cliente.
--   3. (Las vistas con security_invoker ya las vigila el bloque de arriba
--      para TODAS las vistas, incluidas las que toque 1B.)
-- ============================================================

do $$
declare
  v_nombre  text;
  v_definer boolean;
  v_hay     integer;
  v_fallas  text := '';
  v_planes  text;
begin
  -- 1 · resolución presente y security definer
  foreach v_nombre in array array[
    'plan_permite', 'plan_limite', 'feature_de_tenant', 'limite_de_tenant',
    'limite_del_plan', 'sucursales_dentro_del_limite', 'plan_capacidades'
  ] loop
    select count(*), bool_and(p.prosecdef)
      into v_hay, v_definer
      from pg_proc p
     where p.proname = v_nombre
       and p.pronamespace = 'public'::regnamespace;

    if coalesce(v_hay, 0) = 0 then
      v_fallas := v_fallas || format(E'  · falta la función %s()\n', v_nombre);
    elsif not v_definer then
      v_fallas := v_fallas || format(
        E'  · %s() no es SECURITY DEFINER — dentro de una policy recursa o lee con el RLS del que llama\n',
        v_nombre);
    end if;
  end loop;

  -- 2 · ningún plan vigente con features vacías
  select string_agg(nombre, ', ')
    into v_planes
    from planes
   where not heredado
     and (features is null or features = '{}'::jsonb);

  if v_planes is not null then
    v_fallas := v_fallas || format(
      E'  · plan(es) vigente(s) sin features: %s — con resolución fail-closed no habilitan nada\n',
      v_planes);
  end if;

  -- 3 · los dos candados existen: el del override y el del tope de
  --     reactivación de sucursales. Sin trigger, la regla es decorativa.
  foreach v_nombre in array array['candado_override_plan', 'tope_sucursales'] loop
    if not exists (select 1 from pg_trigger where tgname = v_nombre and not tgisinternal) then
      v_fallas := v_fallas || format(E'  · falta el trigger %s\n', v_nombre);
    end if;
  end loop;

  if v_fallas <> '' then
    raise exception E'CONTROL POR PLAN ROTO:\n%', v_fallas
      using hint =
        'La resolución vive en 20260822150000_planes_con_control.sql; '
        'el catálogo en feature_plan_valida() y su espejo en lib/planes.ts.';
  end if;
end $$;

-- ============================================================
-- Trabajos mecánicos (Bloque 2A) — la red contra el fallo silencioso
--
-- La lista de "a quién llamar" es lo que renueva la suscripción, y su
-- modo de falla es mudo: una mecánica que se cuele en el distinct on de
-- vista_proximos_service saca al auto de la lista sin error ni log.
-- Estos chequeos hacen fallar el RESET, que es el único lugar donde un
-- fallo mudo se vuelve ruidoso.
-- ============================================================

-- ---------- El filtro y el security_invoker de la vista: LOS DOS ----------
do $$
declare
  v_def    text;
  v_veces  integer;
  v_opts   text;
begin
  v_def := pg_get_viewdef('vista_proximos_service'::regclass);

  -- El filtro tiene que estar en los DOS CTEs que leen services:
  -- `ultimo` (que la mecánica no desplace al último service) y `ritmo`
  -- (que el km/día se mida entre cambios de aceite).
  v_veces := (length(v_def) - length(replace(v_def, '''service''::tipo_trabajo', '')))
             / length('''service''::tipo_trabajo');
  if v_veces < 2 then
    raise exception
      E'RETENCIÓN ROTA: vista_proximos_service tiene % filtro(s) de tipo y necesita 2 (ultimo y ritmo).\nUna mecánica posterior al último service SACA al auto de la lista de a quién llamar, sin error.',
      v_veces
      using hint = 'Reponé "and s.tipo = ''service''" en los dos CTEs de la vista (migración 20260822210000).';
  end if;

  select array_to_string(reloptions, ',') into v_opts
  from pg_class where relname = 'vista_proximos_service';

  if v_opts is null
     or (v_opts not like '%security_invoker=on%' and v_opts not like '%security_invoker=true%') then
    raise exception
      'AISLAMIENTO ROTO: vista_proximos_service perdió el security_invoker — un owner vería la retención de TODOS los lubricentros.'
      using hint = 'alter view vista_proximos_service set (security_invoker = on);';
  end if;
end $$;

-- ---------- R1 + R3 · Las dos capas del gating, del lado de la base ----------
-- R1: la capa RLS de 1B sola — un Basic no escribe premios ni llamando
--     directo (la capa de aplicación acá NO EXISTE: esto es SQL puro).
-- R3: el gating de services es CONDICIONAL AL TIPO — un Basic carga un
--     service común (si esto falla, se rompió la carga para todos los
--     planes chicos: el peor bug posible) y no carga una mecánica.
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_veh    uuid;
  v_suc    uuid;
  v_plan   uuid;
  v_basic  uuid;
  v_id     uuid;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub
    order by s.inicio desc, s.created_at desc limit 1;
  select p.id into v_basic from planes p where p.nombre = 'Basic';
  select v.id into v_veh from vehiculos v where v.lubricentro_id = v_lub limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;

  if v_owner is null or v_basic is null or v_veh is null then
    raise exception 'REGRESIÓN SIN PISO: falta demo/Basic/vehículo en el seed.';
  end if;

  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- R1 · premios: RLS sola tiene que rechazar
  begin
    insert into premios (lubricentro_id, meta_services, descripcion, activo)
    values (v_lub, 9, 'no debería entrar', false);
    raise exception 'REGRESIÓN 1B: un Basic escribió en premios — la capa RLS no sostiene sola.';
  exception
    when insufficient_privilege then null; -- exactamente lo esperado
  end;

  -- R3a · un service COMÚN tiene que pasar
  begin
    v_id := guardar_service(
      p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
      p_kilometros => 999000, p_aceite_tipo => '10W40', p_prox_service_km => 999500);
  exception when others then
    raise exception
      E'EL PEOR BUG DEL SPRINT: un tenant Basic no puede cargar un service común (%).\nEl gating de services dejó de ser condicional al tipo.', sqlerrm;
  end;

  -- R3b · una mecánica NO
  begin
    perform guardar_service(
      p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
      p_kilometros => null, p_aceite_tipo => null, p_prox_service_km => null,
      p_tipo => 'mecanica', p_trabajo_descripcion => 'no debería entrar en Basic');
    raise exception 'REGRESIÓN 2A: un Basic cargó una mecánica — el gating por tipo no rige.';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- limpieza: el service de la prueba R3a y el plan original
  delete from service_items where service_id = v_id;
  delete from services where id = v_id;
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;
end $$;

-- ---------- R2 · Una mecánica posterior NO altera la retención ----------
-- La prueba 1 del bloque, corriendo en CADA reset: se toma un auto que
-- está en la lista, se le carga una mecánica de HOY (posterior a su
-- último service), y la fila de la vista tiene que quedar IDÉNTICA.
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_veh    uuid;
  v_suc    uuid;
  v_antes  text;
  v_despues text;
  v_mec    uuid;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;

  select vp.vehiculo_id, vp.sucursal_id into v_veh, v_suc
  from vista_proximos_service vp where vp.lubricentro_id = v_lub limit 1;

  if v_veh is null then
    raise exception 'REGRESIÓN SIN PISO: el seed no deja ningún auto en la lista de a quién llamar.';
  end if;

  select concat_ws('|', ultimo_service_fecha, ultimo_service_km, prox_service_km,
                   km_faltantes, km_por_dia, fecha_estimada, estado)
    into v_antes
  from vista_proximos_service where vehiculo_id = v_veh;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_mec := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => null, p_aceite_tipo => null, p_prox_service_km => null,
    p_observaciones => 'regresión 2A',
    p_tipo => 'mecanica', p_trabajo_descripcion => 'Prueba de regresión: cambio de correa');

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  select concat_ws('|', ultimo_service_fecha, ultimo_service_km, prox_service_km,
                   km_faltantes, km_por_dia, fecha_estimada, estado)
    into v_despues
  from vista_proximos_service where vehiculo_id = v_veh;

  if v_despues is distinct from v_antes then
    raise exception
      E'RETENCIÓN ROTA: una mecánica posterior alteró la fila de la vista.\n  antes:   %\n  después: %',
      v_antes, v_despues
      using hint = 'El distinct on de vista_proximos_service está tomando la mecánica como último service.';
  end if;

  delete from service_items where service_id = v_mec;
  delete from services where id = v_mec;
end $$;
