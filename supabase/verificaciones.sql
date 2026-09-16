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

-- ---------- R4 · La página pública sobrevive a la suspensión (2B) ----------
-- DECISIÓN, no bug: apagar la vidriera de un suspendido castiga al dueño
-- del auto (que no debe nada) y mata de golpe todos sus calcos — el
-- parque de QR es el activo más difícil de reconstruir. El premio sí se
-- esconde: no se promete lo que el local no puede entregar. Este chequeo
-- existe porque es la clase de comportamiento que alguien "arregla" en
-- seis meses devolviéndole el filtro de activo a get_carton/get_landing.
do $$
declare
  v_lub     uuid;
  v_pat     text;
  v_marca   timestamptz;
  v_landing jsonb;
  v_carton  jsonb;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select v.patente_normalizada into v_pat
  from vehiculos v
  where v.lubricentro_id = v_lub
    and exists (select 1 from services s where s.vehiculo_id = v.id and not s.anulado)
  limit 1;

  update lubricentros set activo = false where id = v_lub;
  v_marca := clock_timestamp();

  v_landing := get_landing('demo');
  v_carton  := get_carton('demo', v_pat);

  -- restaurar ANTES de evaluar: si algo falla abajo, el raise aborta la
  -- transacción entera y el update de arriba se deshace igual.
  update lubricentros set activo = true where id = v_lub;
  delete from landing_busquedas
  where lubricentro_id = v_lub and patente = v_pat and created_at >= v_marca;

  if v_landing is null or v_landing->>'nombre' is null then
    raise exception 'REGRESIÓN 2B: get_landing dejó de responder con el tenant suspendido. Es una decisión, no un bug: ver el comentario de la migración 20260822210000.';
  end if;
  if v_landing->'premio' is not null and v_landing->'premio' <> 'null'::jsonb then
    raise exception 'REGRESIÓN 2B: get_landing ofrece el premio de un tenant suspendido.';
  end if;
  if v_carton ? 'error' then
    raise exception 'REGRESIÓN 2B: get_carton devolvió % con el tenant suspendido — el cliente final perdió su historial.', v_carton->>'error';
  end if;
  if jsonb_array_length(coalesce(v_carton->'services', '[]'::jsonb)) = 0 then
    raise exception 'REGRESIÓN 2B: get_carton no trae historial con el tenant suspendido.';
  end if;
  if v_carton->'fidelizacion' is not null and v_carton->'fidelizacion' <> 'null'::jsonb then
    raise exception 'REGRESIÓN 2B: get_carton muestra el progreso del premio de un tenant suspendido.';
  end if;
end $$;

-- ============================================================
-- Trabajos pendientes (Bloque 3) — la red del bloque
--
-- R5: la ventana — un pendiente a tres meses NO aparece; uno a diez días
--     aparece 'proximo'; uno por km contra el odómetro conocido aparece
--     'urgente'. Es la prueba 1 del bloque, en cada reset.
-- R6: el tildado — guardar_service resuelve pendientes EN la transacción
--     del trabajo (la prueba 3 del bloque).
-- R7: un Basic no escribe pendientes ni por SQL directo.
-- (R2 sigue vigilando que la retención no se altere: los pendientes van
-- en vista APARTE y esa es la garantía estructural.)
-- ============================================================
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_veh    uuid;
  v_suc    uuid;
  v_plan   uuid;
  v_basic  uuid;
  v_km     integer;
  v_p1     uuid;
  v_p2     uuid;
  v_p3     uuid;
  v_serv   uuid;
  v_estado text;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub
    order by s.inicio desc, s.created_at desc limit 1;
  select p.id into v_basic from planes p where p.nombre = 'Basic';

  -- un vehículo con odómetro conocido
  select s.vehiculo_id, max(s.kilometros) into v_veh, v_km
  from services s where s.lubricentro_id = v_lub and not s.anulado and s.kilometros is not null
  group by s.vehiculo_id order by max(s.kilometros) desc limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- R5a · a tres meses: NO aparece
  insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_fecha)
  values (v_lub, v_veh, v_owner, 'Regresión: correa a tres meses', current_date + 90)
  returning id into v_p1;
  if exists (select 1 from vista_pendientes where pendiente_id = v_p1) then
    raise exception 'REGRESIÓN 3: un pendiente a 90 días apareció en la lista — la ventana de 30 no rige.';
  end if;

  -- R5b · a diez días: aparece 'proximo'
  insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_fecha)
  values (v_lub, v_veh, v_owner, 'Regresión: pastillas a diez días', current_date + 10)
  returning id into v_p2;
  select estado::text into v_estado from vista_pendientes where pendiente_id = v_p2;
  if v_estado is distinct from 'proximo' then
    raise exception 'REGRESIÓN 3: pendiente a 10 días debería ser proximo y es %.', coalesce(v_estado, 'INVISIBLE');
  end if;

  -- R5c · por km, a 300 del odómetro conocido: 'urgente'
  insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_km)
  values (v_lub, v_veh, v_owner, 'Regresión: bujías por km', v_km + 300)
  returning id into v_p3;
  select estado::text into v_estado from vista_pendientes where pendiente_id = v_p3;
  if v_estado is distinct from 'urgente' then
    raise exception 'REGRESIÓN 3: pendiente a 300 km debería ser urgente y es %.', coalesce(v_estado, 'INVISIBLE');
  end if;

  -- R6 · el tildado en la MISMA transacción del trabajo
  v_serv := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => v_km + 10, p_aceite_tipo => '10W40', p_prox_service_km => v_km + 10010,
    p_resolver_pendientes => array[v_p2]);
  if not exists (
    select 1 from trabajos_pendientes
    where id = v_p2 and estado = 'resuelto' and resuelto_service_id = v_serv
  ) then
    raise exception 'REGRESIÓN 3: el tildado no resolvió el pendiente en la transacción del trabajo.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- R7 · Basic no escribe pendientes ni por SQL
  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_fecha)
    values (v_lub, v_veh, v_owner, 'no debería entrar en Basic', current_date + 5);
    raise exception 'REGRESIÓN 3: un Basic escribió un pendiente — el gating por plan no rige.';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;

  -- limpieza
  delete from service_items where service_id = v_serv;
  delete from services where id = v_serv;
  delete from trabajos_pendientes where id in (v_p1, v_p2, v_p3);
end $$;

-- ---------- R8 · Presupuestos: gating y numeración (Bloque 4) ----------
-- Un Basic no escribe presupuestos ni por SQL, y la numeración es
-- correlativa por tenant (el lock de concurrencia real se prueba con dos
-- sesiones en paralelo fuera del reset; acá se vigila la correlatividad).
do $$
declare
  v_lub   uuid;
  v_owner uuid;
  v_suc   uuid;
  v_plan  uuid;
  v_basic uuid;
  v_p1    uuid;
  v_p2    uuid;
  v_n1    integer;
  v_n2    integer;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub
    order by s.inicio desc, s.created_at desc limit 1;
  select p.id into v_basic from planes p where p.nombre = 'Basic';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- correlativa: dos altas seguidas salen N y N+1
  v_p1 := guardar_presupuesto(p_sucursal_id => v_suc,
    p_items => '[{"descripcion":"Regresión A","cantidad":1,"precio_unitario":1000}]'::jsonb);
  v_p2 := guardar_presupuesto(p_sucursal_id => v_suc,
    p_items => '[{"descripcion":"Regresión B","cantidad":1,"precio_unitario":2000}]'::jsonb);
  select numero into v_n1 from presupuestos where id = v_p1;
  select numero into v_n2 from presupuestos where id = v_p2;
  if v_n2 <> v_n1 + 1 then
    raise exception 'REGRESIÓN 4: la numeración no es correlativa (% y %).', v_n1, v_n2;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- Basic bloqueado por RLS
  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform guardar_presupuesto(p_sucursal_id => v_suc,
      p_items => '[{"descripcion":"no debería entrar","cantidad":1,"precio_unitario":1}]'::jsonb);
    raise exception 'REGRESIÓN 4: un Basic generó un presupuesto — el gating por plan no rige.';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;

  -- limpieza
  delete from presupuesto_items where presupuesto_id in (v_p1, v_p2);
  delete from presupuestos where id in (v_p1, v_p2);
end $$;

-- ---------- R9 · Precio y stock: opcionalidad y descuento (Bloque 5) ----------
-- Tres invariantes: un producto SIN nada funciona idéntico a siempre; el
-- descuento baja solo lo que lleva stock, y baja LO CORRECTO (renglón por
-- cantidad; aceite a granel por litros; aceite envasado UNA unidad por
-- service, sin mirar los litros — un bidón x4 no puede perder 4 bidones);
-- y el aviso aparece bajo el mínimo y calla sin nada abajo.
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_suc    uuid;
  v_veh    uuid;
  v_pelado uuid;
  v_conteo uuid;
  v_aceite uuid;
  v_bidon  uuid;
  v_serv   uuid;
  v_serv2  uuid;
  v_serv3  uuid;
  v_serv4  uuid;
  v_n      numeric;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select v.id into v_veh from vehiculos v where v.lubricentro_id = v_lub limit 1;

  if exists (select 1 from pg_type where typname = 'categoria_producto') then
    raise exception 'REGRESIÓN 5: el enum categoria_producto sigue vivo — la migración a tabla quedó a medias.';
  end if;
  if exists (select 1 from productos p where not exists (
    select 1 from categorias_producto c where c.clave = p.categoria)) then
    raise exception 'REGRESIÓN 5: hay productos con una categoría fuera del catálogo.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into productos (lubricentro_id, categoria, nombre)
  values (v_lub, 'repuesto', 'Regresión pelado') returning id into v_pelado;
  insert into productos (lubricentro_id, categoria, nombre, stock, stock_minimo)
  values (v_lub, 'filtro', 'Regresión con stock', 10, 2) returning id into v_conteo;
  insert into productos (lubricentro_id, categoria, nombre, unidad, stock, stock_minimo, litros_sugeridos)
  values (v_lub, 'aceite', 'Regresión aceite', 'litro', 20, 5, 4) returning id into v_aceite;
  -- Envasado: el stock cuenta bidones, no litros.
  insert into productos (lubricentro_id, categoria, nombre, unidad, stock, stock_minimo)
  values (v_lub, 'aceite', 'Regresión bidón x4', 'unidad', 16, 5) returning id into v_bidon;

  v_serv := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 999100, p_aceite_tipo => '10W40', p_prox_service_km => 999600,
    p_aceite_producto_id => v_aceite, p_aceite_litros => 4,
    p_items => jsonb_build_array(
      jsonb_build_object('tipo', 'filtro_aceite', 'producto_id', v_conteo, 'cantidad', 2),
      jsonb_build_object('tipo', 'filtro_aire',   'producto_id', v_pelado)
    ));

  select stock into v_n from productos where id = v_conteo;
  if v_n is distinct from 8 then
    raise exception 'REGRESIÓN 5: el renglón con cantidad 2 dejó el stock en % (esperaba 8).', v_n;
  end if;
  select stock into v_n from productos where id = v_aceite;
  if v_n is distinct from 16 then
    raise exception 'REGRESIÓN 5: el aceite con 4 litros dejó el stock en % (esperaba 16).', v_n;
  end if;
  select stock into v_n from productos where id = v_pelado;
  if v_n is not null then
    raise exception 'REGRESIÓN 5: un producto SIN stock terminó con stock % — dejó de ser opcional.', v_n;
  end if;

  -- El aceite ENVASADO baja UN bidón por service, diga lo que diga el
  -- campo de litros: con 4 litros anotados (lo que mandaba el front viejo)
  -- pierde 1, no 4...
  v_serv2 := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 999200, p_aceite_tipo => '5W30', p_prox_service_km => 999700,
    p_aceite_producto_id => v_bidon, p_aceite_litros => 4);
  select stock into v_n from productos where id = v_bidon;
  if v_n is distinct from 15 then
    raise exception 'REGRESIÓN 5: el aceite envasado con 4 litros anotados dejó el stock en % (esperaba 15: un bidón por service, no cuatro).', v_n;
  end if;
  -- ...y sin litros baja igual, porque el service abrió un bidón de todos modos.
  v_serv3 := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 999300, p_aceite_tipo => '5W30', p_prox_service_km => 999800,
    p_aceite_producto_id => v_bidon);
  select stock into v_n from productos where id = v_bidon;
  if v_n is distinct from 14 then
    raise exception 'REGRESIÓN 5: el aceite envasado sin litros dejó el stock en % (esperaba 14: el bidón se abrió igual).', v_n;
  end if;
  -- El granel SIN litros sigue quieto: sin dato, ese stock no se mueve.
  v_serv4 := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 999400, p_aceite_tipo => '10W40', p_prox_service_km => 999900,
    p_aceite_producto_id => v_aceite);
  select stock into v_n from productos where id = v_aceite;
  if v_n is distinct from 16 then
    raise exception 'REGRESIÓN 5: el aceite a granel SIN litros movió el stock a % (esperaba 16, quieto).', v_n;
  end if;

  -- el aviso: nada bajo el mínimo → silencio; bajo el mínimo → aparece
  if exists (select 1 from stock_bajo(8) sb where sb.producto_id in (v_conteo, v_aceite, v_bidon)) then
    raise exception 'REGRESIÓN 5: el aviso suena con stock por encima del mínimo.';
  end if;
  update productos set stock = 1 where id = v_conteo;
  if not exists (select 1 from stock_bajo(8) sb where sb.producto_id = v_conteo) then
    raise exception 'REGRESIÓN 5: un producto bajo el mínimo no aparece en el aviso.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  delete from service_items where service_id in (v_serv, v_serv2, v_serv3, v_serv4);
  delete from services where id in (v_serv, v_serv2, v_serv3, v_serv4);
  delete from productos where id in (v_pelado, v_conteo, v_aceite, v_bidon);
end $$;

-- ---------- R10 · El piso de anonimato de los modelos (Bloque 6) ----------
-- El nivel global de modelos_sugeridos cruza tenants: un string que
-- existe en un solo lubricentro puede ser el dato de un cliente de la
-- competencia. Este chequeo crea un tenant fantasma y verifica los dos
-- lados del piso: lo único NO se ve; lo compartido (>=3 vehículos en
-- >=2 lubricentros) sí.
do $$
declare
  v_lub      uuid;
  v_owner    uuid;
  v_fantasma uuid;
  v_cli_f    uuid;
  v_cli_d    uuid;
  v_veh_d    uuid;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;

  -- El tenant fantasma, con un modelo ÚNICO y uno compartible.
  insert into lubricentros (nombre, slug) values ('Fantasma R10', 'fantasma-r10')
  returning id into v_fantasma;
  insert into clientes (lubricentro_id, nombre, telefono)
  values (v_fantasma, 'Cliente Fantasma', '351555000') returning id into v_cli_f;
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo) values
    (v_fantasma, v_cli_f, 'ZZZ 901', 'ZZZ901', 'Fiat', 'ModeloSecretoR10'),
    (v_fantasma, v_cli_f, 'ZZZ 902', 'ZZZ902', 'Fiat', 'CompartidoR10'),
    (v_fantasma, v_cli_f, 'ZZZ 903', 'ZZZ903', 'Fiat', 'CompartidoR10');
  -- Y el demo aporta el tercer vehículo del compartido (2º lubricentro).
  select c.id into v_cli_d from clientes c where c.lubricentro_id = v_lub limit 1;
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  values (v_lub, v_cli_d, 'ZZZ 904', 'ZZZ904', 'Fiat', 'CompartidoR10')
  returning id into v_veh_d;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- El modelo único del fantasma NO puede aparecerle al demo.
  if exists (select 1 from modelos_sugeridos('Fiat') s where s.modelo = 'ModeloSecretoR10') then
    raise exception 'REGRESIÓN 6: el piso de anonimato se rompió — un modelo de UN solo tenant se filtró a otro.';
  end if;
  -- El compartido (3 vehículos, 2 lubricentros) SÍ, como global.
  if not exists (select 1 from modelos_sugeridos('Fiat') s where s.modelo = 'CompartidoR10') then
    raise exception 'REGRESIÓN 6: un modelo que cumple el piso (3 veh, 2 tenants) no se sugiere.';
  end if;
  -- Y jamás una fila con conteos: la función devuelve (modelo, propio) y
  -- nada más — lo garantiza el tipo de retorno, que este SELECT compila.
  perform s.modelo, s.propio from modelos_sugeridos('Fiat') s limit 1;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- limpieza total del fantasma
  delete from vehiculos where id = v_veh_d;
  delete from vehiculos where lubricentro_id = v_fantasma;
  delete from clientes where id = v_cli_f;
  delete from lubricentros where id = v_fantasma;
end $$;

-- ---------- R11 · La superficie del cliente no cambia sola (Bloque 7) ----------
-- El contrato del bloque: un tenant SIN configuración nueva rinde exacto
-- lo de siempre (tema claro, logo normal, sin mensaje), y el mensaje del
-- taller respeta las tres llaves — feature, vigencia y tenant activo — en
-- las DOS capas (mostrar en get_carton, escribir por trigger).
do $$
declare
  v_lub    uuid;
  v_plan   uuid;
  v_basic  uuid;
  v_json   jsonb;
  v_tel    text;
  v_bloqueado boolean;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub;
  select p.id into v_basic from planes p where p.nombre = 'Basic' and not p.heredado;

  -- Los defaults son el comportamiento de hoy.
  v_json := get_landing('demo');
  if v_json->>'tema' is distinct from 'claro'
     or v_json->>'logo_tamano' is distinct from 'normal' then
    raise exception 'REGRESIÓN 7: get_landing no arranca en claro/normal para un tenant sin configurar.';
  end if;

  v_json := get_carton('demo', 'ABC123');
  if v_json->'lubricentro'->>'tema' is distinct from 'claro'
     or v_json->'lubricentro'->>'logo_tamano' is distinct from 'normal' then
    raise exception 'REGRESIÓN 7: get_carton no arranca en claro/normal.';
  end if;
  if v_json->>'mensaje_taller' is not null then
    raise exception 'REGRESIÓN 7: hay mensaje del taller sin que nadie lo haya configurado.';
  end if;

  -- El WhatsApp premium apunta a la sucursal del ÚLTIMO trabajo del auto.
  select su.telefono into v_tel
  from services s join sucursales su on su.id = s.sucursal_id
  where s.vehiculo_id = (select v.id from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'ABC123')
    and not s.anulado and su.activa and su.telefono is not null
  order by s.fecha desc, s.created_at desc limit 1;
  if v_tel is not null and v_json->>'whatsapp_taller' is distinct from v_tel then
    raise exception 'REGRESIÓN 7: whatsapp_taller no es el teléfono de la sucursal del último trabajo (esperaba %, vino %).',
      v_tel, v_json->>'whatsapp_taller';
  end if;

  -- El mensaje con la vigencia viva se emite; vencida, se apaga solo.
  update config_experiencia set mensaje_escaneo = 'Septiembre: revisión de frenos sin cargo', mensaje_vigencia = null
  where lubricentro_id = v_lub;
  v_json := get_carton('demo', 'ABC123');
  if v_json->>'mensaje_taller' is distinct from 'Septiembre: revisión de frenos sin cargo' then
    raise exception 'REGRESIÓN 7: el mensaje premium con vigencia abierta no se emite.';
  end if;

  update config_experiencia set mensaje_vigencia = current_date where lubricentro_id = v_lub;
  if (get_carton('demo', 'ABC123'))->>'mensaje_taller' is null then
    raise exception 'REGRESIÓN 7: la vigencia que vence HOY todavía vale — >= current_date.';
  end if;

  update config_experiencia set mensaje_vigencia = current_date - 1 where lubricentro_id = v_lub;
  if (get_carton('demo', 'ABC123'))->>'mensaje_taller' is not null then
    raise exception 'REGRESIÓN 7: un mensaje con la vigencia pasada sigue puesto — la vergüenza de marzo.';
  end if;

  -- Sin la feature (Basic): el mensaje guardado NO se emite y el WhatsApp
  -- premium tampoco. La página del cliente, intacta.
  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;
  update config_experiencia set mensaje_vigencia = null where lubricentro_id = v_lub;
  v_json := get_carton('demo', 'ABC123');
  if v_json->>'mensaje_taller' is not null or v_json->>'whatsapp_taller' is not null then
    raise exception 'REGRESIÓN 7: lo premium se emite sin pagina_premium.';
  end if;

  -- Escribir: cambiar el mensaje sin la feature se bloquea por trigger…
  v_bloqueado := false;
  begin
    update config_experiencia set mensaje_escaneo = 'no debería poder' where lubricentro_id = v_lub;
  exception when raise_exception then
    v_bloqueado := true;
  end;
  if not v_bloqueado then
    raise exception 'REGRESIÓN 7: un plan sin pagina_premium pudo CAMBIAR el mensaje.';
  end if;

  -- …pero BORRARLO se puede siempre, y editar el resto de la config
  -- también (la lección de C2: el downgrade no puede trabar la pantalla).
  update config_experiencia set tema = 'oscuro' where lubricentro_id = v_lub;
  update config_experiencia set mensaje_escaneo = null, tema = 'claro' where lubricentro_id = v_lub;

  -- Y el tema elegido viaja al público sea cual sea el plan.
  update config_experiencia set tema = 'oscuro', logo_tamano = 'xl' where lubricentro_id = v_lub;
  v_json := get_carton('demo', 'ABC123');
  if v_json->'lubricentro'->>'tema' is distinct from 'oscuro'
     or v_json->'lubricentro'->>'logo_tamano' is distinct from 'xl' then
    raise exception 'REGRESIÓN 7: tema/tamaño configurados no llegan a get_carton.';
  end if;

  -- Restaurar todo.
  update config_experiencia set tema = 'claro', logo_tamano = 'normal', mensaje_vigencia = null
  where lubricentro_id = v_lub;
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;
  delete from landing_busquedas where lubricentro_id = v_lub and patente = 'ABC123';
end $$;

-- ---------- R12 · El badge de "A quién llamar" dice la verdad ----------
-- contactos_por_hacer() alimenta el círculo del sidebar y la barra
-- mobile. Su contrato: contar EXACTAMENTE las filas que la pantalla
-- muestra sin tildar — services siempre, pendientes solo con la feature —
-- y respetar la semántica por-estado del contacto (contactar en un
-- estado apaga esa fila; que el auto escale de estado la vuelve a
-- encender). Si esto se desalinea de las vistas, el badge marca 4 sobre
-- una lista de 2 y el dueño deja de creerle para siempre.
do $$
declare
  v_lub      uuid;
  v_owner    uuid;
  v_plan     uuid;
  v_basic    uuid;
  v_esp      integer;
  v_badge    integer;
  v_fila     record;
  v_contacto uuid;
  v_bloqueado boolean;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub;
  select p.id into v_basic from planes p where p.nombre = 'Basic' and not p.heredado;

  -- Como el owner del demo (invoker + RLS de verdad).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1 · Paridad exacta con las vistas que pintan la pantalla.
  select (select count(*) from vista_proximos_service where not contactado)
       + (select count(*) from vista_pendientes where not contactado)
    into v_esp;
  v_badge := contactos_por_hacer();
  if v_badge is distinct from v_esp then
    raise exception 'REGRESIÓN 8: el badge dice % y la pantalla muestra % filas sin contactar.', v_badge, v_esp;
  end if;

  -- 2 · Contactar UNA fila en su estado actual baja el badge en 1.
  select vehiculo_id, estado into v_fila
  from vista_proximos_service where not contactado limit 1;
  if v_fila.vehiculo_id is null then
    raise exception 'REGRESIÓN 8: el seed quedó sin filas por contactar y la prueba no prueba nada.';
  end if;
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado)
  values (v_lub, v_fila.vehiculo_id, v_owner, v_fila.estado) returning id into v_contacto;
  if contactos_por_hacer() is distinct from v_badge - 1 then
    raise exception 'REGRESIÓN 8: contactar una fila no bajó el badge en 1.';
  end if;

  -- 3 · La semántica POR ESTADO: borrar ese contacto y registrar uno con
  --     OTRO estado no apaga la fila — el contacto que el estado actual
  --     pide sigue debido.
  delete from contactos where id = v_contacto;
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado)
  values (v_lub, v_fila.vehiculo_id, v_owner,
          case when v_fila.estado = 'vencido' then 'proximo' else 'vencido' end::estado_contacto)
  returning id into v_contacto;
  if contactos_por_hacer() is distinct from v_badge then
    raise exception 'REGRESIÓN 8: un contacto de OTRO estado apagó la fila — se perdió la semántica por estado.';
  end if;
  delete from contactos where id = v_contacto;

  -- 4 · Sin la feature de pendientes, esa pata no cuenta (la pantalla
  --     se la oculta a Basic; el badge tiene que mirar lo mismo).
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from vista_proximos_service where not contactado) into v_esp;
  if contactos_por_hacer() is distinct from v_esp then
    raise exception 'REGRESIÓN 8: en Basic el badge cuenta pendientes que la pantalla no muestra.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;

  -- 5 · anon no puede ni ejecutarla: la única puerta pública es get_carton.
  v_bloqueado := false;
  begin
    execute 'set local role anon';
    perform contactos_por_hacer();
    execute 'reset role';
  exception when insufficient_privilege then
    v_bloqueado := true;
    execute 'reset role';
  end;
  if not v_bloqueado then
    raise exception 'REGRESIÓN 8: anon puede ejecutar contactos_por_hacer().';
  end if;
end $$;

-- ---------- R13 · Las patentes de moto entran; lo que no es patente, no ----------
-- Fidelli acepta cuatro formatos: auto ABC123 / AB123CD y moto 123ABC /
-- A123BCD. La fuente única es patente_formato_valido(), que usan el CHECK
-- de vehiculos y corregir_patente(). Este chequeo cubre las dos puertas de
-- escritura y la puerta pública de lectura, y verifica que lo inválido
-- siga rechazado: abrir el formato "a cualquier cosa" sería tan grave como
-- cerrarlo a autos.
do $$
declare
  v_lub     uuid;
  v_cli     uuid;
  v_super   uuid;
  v_moto_v  uuid;
  v_moto_m  uuid;
  v_json    jsonb;
  v_rechazo boolean;
  v_pat     text;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select c.id into v_cli from clientes c where c.lubricentro_id = v_lub order by c.created_at limit 1;
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  if v_super is null then
    raise exception 'REGRESIÓN 13: el seed local no dejó ningún superadmin (ver supabase/seed.sql).';
  end if;

  -- 1 · Las dos motos entran, y el trigger las normaliza como a los autos.
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (v_lub, v_cli, '789 rst', 'Honda', 'Wave R13') returning id into v_moto_v;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (v_lub, v_cli, 'b-456-xyz', 'Gilera', 'Smash R13') returning id into v_moto_m;

  if (select patente_normalizada from vehiculos where id = v_moto_v) <> '789RST'
     or (select patente_normalizada from vehiculos where id = v_moto_m) <> 'B456XYZ' then
    raise exception 'REGRESIÓN 13: una patente de moto no se normalizó como se esperaba.';
  end if;

  -- 2 · Lo que no es una patente sigue rechazado por el CHECK (23514).
  foreach v_pat in array array['AB12CD', '12ABC3', 'ABCD123', '1234ABC', 'ZZ1ZZ', 'A12BCD'] loop
    v_rechazo := false;
    begin
      insert into vehiculos (lubricentro_id, cliente_id, patente) values (v_lub, v_cli, v_pat);
    exception when check_violation then
      v_rechazo := true;
    end;
    if not v_rechazo then
      raise exception 'REGRESIÓN 13: la base aceptó la patente inválida %.', v_pat;
    end if;
  end loop;

  -- 3 · La puerta pública encuentra la moto (y registra la búsqueda, que se limpia).
  v_json := get_carton('demo', '789 rst');
  if v_json->>'error' is not null then
    raise exception 'REGRESIÓN 13: get_carton no encuentra una moto cargada (%).', v_json->>'error';
  end if;
  delete from landing_busquedas where lubricentro_id = v_lub and patente = '789RST';

  -- 4 · corregir_patente (superadmin) acepta una moto y sigue rechazando lo inválido.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform corregir_patente(v_moto_v, 'C 777 QQQ', 'Regresión 13: la chapa era Mercosur de moto');
  if (select patente_normalizada from vehiculos where id = v_moto_v) <> 'C777QQQ' then
    raise exception 'REGRESIÓN 13: corregir_patente no aceptó una patente de moto.';
  end if;

  v_rechazo := false;
  begin
    perform corregir_patente(v_moto_m, 'ZZ1ZZ', 'Regresión 13: un formato inválido tiene que rechazarse');
  exception when raise_exception then
    if sqlerrm <> 'patente_formato' then
      raise;
    end if;
    v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'REGRESIÓN 13: corregir_patente aceptó una patente inválida.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- limpieza total
  delete from correcciones_patente where vehiculo_id in (v_moto_v, v_moto_m);
  delete from vehiculos where id in (v_moto_v, v_moto_m);
end $$;

-- ============================================================
-- R14 · El onboarding de tres pasos (bloque de ayuda)
--
-- Cuatro invariantes que, rotos, bloquean a un cliente o le piden algo
-- que su plan no incluye:
--   1. Después del seed ninguna cuenta queda con onboarding_completado_at
--      null: el backfill de la migración cubre a las existentes y seed.sql
--      a las que nacen en el reset. Una cuenta vieja con null vería el
--      onboarding y el panel bloqueado.
--   2. Las funciones que escriben en lubricentros son SECURITY DEFINER:
--      el owner no tiene UPDATE por RLS, así que sin definer el paso 2 y el
--      3 fallan en silencio y el taller no sale nunca del onboarding.
--   3. Los pasos siguen al plan: un Basic tiene DOS pasos, nunca se le
--      pide el premio.
--   4. El estado de un tenant ajeno no se lee: el guard rechaza.
-- ============================================================
do $$
declare
  v_lub     uuid;
  v_owner   uuid;
  v_plan    uuid;
  v_basic   uuid;
  v_ajeno   uuid;
  v_nombre  text;
  v_definer boolean;
  v_sin     integer;
  v_estado  jsonb;
begin
  -- 1 · el demo del seed nace con el onboarding completo (lo marca seed.sql,
  --     porque nace después del backfill de la migración). Se mira el demo y
  --     no "todas las cuentas": en una base local puede haber tenants de
  --     prueba a mitad del onboarding, y eso es exactamente lo esperado.
  select count(*) into v_sin from lubricentros where slug = 'demo' and onboarding_completado_at is null;
  if v_sin > 0 then
    raise exception
      'R14: el demo del seed quedó sin onboarding_completado_at: vería el onboarding con el panel bloqueado.'
      using hint = 'seed.sql lo marca después de seed_demo(); el backfill de 20260909180000 cubre a las cuentas existentes.';
  end if;

  -- 2 · definer donde hace falta
  foreach v_nombre in array array[
    'onboarding_estado', 'onboarding_estado_de', 'onboarding_completar_de',
    'completar_onboarding', 'confirmar_diseno', 'omitir_premio',
    'marcar_bienvenida_vista', 'onboarding_tras_cambio'
  ] loop
    select bool_and(p.prosecdef) into v_definer
      from pg_proc p
     where p.proname = v_nombre and p.pronamespace = 'public'::regnamespace;
    if v_definer is distinct from true then
      raise exception 'R14: falta %() o no es SECURITY DEFINER: el owner no puede escribir lubricentros por RLS.', v_nombre;
    end if;
  end loop;

  -- 2b · los triggers que evalúan al escribir productos y premios
  foreach v_nombre in array array['onboarding_productos', 'onboarding_premios'] loop
    if not exists (select 1 from pg_trigger where tgname = v_nombre and not tgisinternal) then
      raise exception 'R14: falta el trigger %: guardar el premio ya no completa el onboarding y el taller queda bloqueado.', v_nombre;
    end if;
  end loop;

  -- 3 y 4 · como el owner del demo
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select s.plan_id into v_plan from suscripciones s where s.lubricentro_id = v_lub
    order by s.inicio desc, s.created_at desc limit 1;
  select p.id into v_basic from planes p where p.nombre = 'Basic';

  -- Un tenant ajeno, solo para el guard (sin config ni sucursales: se borra al final).
  insert into lubricentros (nombre, slug) values ('R14 ajeno', 'r14-ajeno') returning id into v_ajeno;

  update suscripciones set plan_id = v_basic where lubricentro_id = v_lub;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_estado := onboarding_estado(v_lub);
  if (v_estado->>'pasos')::integer <> 2 or (v_estado->>'aplica_premio')::boolean then
    raise exception 'R14: a un Basic se le piden % pasos (aplica_premio=%): el paso del premio no sigue al plan.',
      v_estado->>'pasos', v_estado->>'aplica_premio';
  end if;
  if v_estado->>'paso_actual' is not null then
    raise exception 'R14: una cuenta con el onboarding completo reporta paso actual %: /fidelli la mostraría a medias.',
      v_estado->>'paso_actual';
  end if;

  begin
    perform onboarding_estado(v_ajeno);
    raise exception 'R14: un owner leyó el onboarding de otro lubricentro.';
  exception
    when insufficient_privilege then null; -- exactamente lo esperado
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- limpieza
  update suscripciones set plan_id = v_plan where lubricentro_id = v_lub;
  delete from lubricentros where id = v_ajeno;
end $$;

-- ============================================================
-- R15 · El módulo de gomería (bloque 1 de neumáticos)
--
-- Las gemelas de R2 y R3 para el TERCER tipo de trabajo. Existen porque
-- el modo de falla de agregar un valor al enum NO DA ERROR: los CHECK y
-- las policies de services están escritos como `tipo <> 'x' or (...)`, y
-- sobre un tipo que no nombran la premisa es verdadera y no se evalúa
-- nada. Sin estas pruebas, el día que alguien agregue un cuarto tipo el
-- módulo PAGO queda abierto y gratis para todos los tenants — sin error,
-- sin log y sin que se caiga ningún build.
--
--   a · Sin el módulo no se carga un trabajo de neumáticos NI POR SQL
--       DIRECTO (la capa de aplicación acá no existe: esto es la policy
--       sola). Es la gemela de R3b, y va en DOS variantes: una alineación
--       sola —el único caso que aísla services_insercion— y un trabajo
--       con ruedas. Ver la nota larga en a1: con ruedas, la prueba pasa
--       aunque la policy de services esté rota.
--   b · Con el módulo prendido desde /fidelli, sí. Control positivo: sin
--       esto, "no se puede cargar nunca" pasaría la prueba a).
--   c · Un trabajo de neumáticos NO altera la fila de retención del
--       vehículo. Es la gemela de R2, y protege la misma pantalla: la que
--       trae la plata.
--   d · Los CHECK del tercer tipo: viscosidad de aceite, sin kilómetros y
--       sin alineación quedan afuera.
--   e · Los CHECK por rueda: medida, DOT, profundidad y rotación.
--   f · El stock: baja UNA unidad por rueda colocada con producto, y una
--       rueda solo MEDIDA no mueve nada.
--   g · El premio no lo avanza un trabajo de neumáticos salvo alcance
--       'todos' — premio_disponible ya lo resuelve sola y esto lo fija.
--   h · LA REGLA DE ORO: apagar el módulo apaga la ESCRITURA, nunca la
--       lectura. El trabajo cargado sigue visible para el taller y para
--       el cliente final.
-- ============================================================
do $$
declare
  v_lub     uuid;
  v_owner   uuid;
  v_super   uuid;
  v_veh     uuid;
  v_suc     uuid;
  v_prod    uuid;
  v_id      uuid;
  v_antes   text;
  v_despues text;
  v_stock   numeric;
  v_ciclo   integer;
  v_ciclo2  integer;
  v_premio  uuid;
  v_ruedas  jsonb;
  v_json    jsonb;
  v_pat     text;
  v_n       integer;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;

  if v_owner is null or v_super is null then
    raise exception 'R15 SIN PISO: falta el owner del demo o el superadmin del seed.';
  end if;

  -- El auto de la prueba sale de la lista de retención: así c) mide lo
  -- que de verdad importa — que el trabajo de gomería no lo desplace.
  select vp.vehiculo_id into v_veh
  from vista_proximos_service vp where vp.lubricentro_id = v_lub limit 1;

  if v_veh is null then
    raise exception 'R15 SIN PISO: el seed no deja ningún auto en la lista de a quién llamar.';
  end if;

  select concat_ws('|', ultimo_service_fecha, ultimo_service_km, prox_service_km,
                   km_faltantes, km_por_dia, fecha_estimada, estado)
    into v_antes
  from vista_proximos_service where vehiculo_id = v_veh;

  -- Una cubierta del catálogo, con stock, para la prueba f).
  insert into productos (lubricentro_id, categoria, nombre, marca, unidad, stock)
  values (v_lub, 'neumatico', 'R15 Cubierta de prueba', 'Fate', 'unidad', 10)
  returning id into v_prod;

  v_ruedas := jsonb_build_array(
    jsonb_build_object('posicion', 'delantera_izquierda', 'colocada', true, 'balanceada', true,
                       'producto_id', v_prod, 'marca', 'Fate', 'medida', '205/55 R16', 'dot', '2325'),
    jsonb_build_object('posicion', 'delantera_derecha', 'colocada', true, 'balanceada', true,
                       'producto_id', v_prod, 'marca', 'Fate', 'medida', '205/55 R16', 'dot', '2325'),
    jsonb_build_object('posicion', 'trasera_izquierda', 'colocada', true, 'balanceada', true,
                       'producto_id', v_prod, 'marca', 'Fate', 'medida', '205/55 R16', 'dot', '2325'),
    jsonb_build_object('posicion', 'trasera_derecha', 'colocada', true, 'balanceada', true,
                       'producto_id', v_prod, 'marca', 'Fate', 'medida', '205/55 R16', 'dot', '2325'),
    -- El auxilio, solo MEDIDO: sin ninguna casilla y con la profundidad
    -- cargada. Es una fila válida y NO descuenta stock.
    jsonb_build_object('posicion', 'auxilio', 'producto_id', v_prod,
                       'profundidad_mm', '4.5', 'medida', '205/55 R16')
  );

  -- ---------- a · SIN el módulo, la policy sola tiene que rechazar ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  if plan_permite('neumaticos') then
    raise exception 'R15 SIN PISO: el demo ya tiene el módulo de gomería — la prueba a) no probaría nada.';
  end if;

  -- a1 · SOLO ALINEACIÓN, y esto NO es un caso de borde de la prueba:
  --      es el único que aísla services_insercion. Un trabajo con ruedas
  --      lo rechaza también ruedas_escritura, así que con ruedas la
  --      prueba pasa aunque la policy de services esté rota — se probó
  --      rompiéndola a propósito y pasó igual. Un trabajo de gomería que
  --      es sólo una alineación no toca service_ruedas: acá no hay
  --      segunda red, y es exactamente el trabajo que entraba gratis.
  begin
    perform guardar_service(
      p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
      p_kilometros => 123456, p_aceite_tipo => null, p_prox_service_km => null,
      p_tipo => 'neumaticos', p_alineacion => true);
    raise exception 'R15a: un tenant SIN el módulo cargó una ALINEACIÓN. La condición (tipo <> ''neumaticos'' or plan_permite(''neumaticos'')) se cayó de services_insercion: el módulo pago está abierto y gratis, también por la API directa.';
  exception
    when insufficient_privilege then null; -- exactamente lo esperado
  end;

  -- a2 · y con ruedas, donde además tiene que pronunciarse la policy de
  --      service_ruedas.
  begin
    perform guardar_service(
      p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
      p_kilometros => 123456, p_aceite_tipo => null, p_prox_service_km => null,
      p_tipo => 'neumaticos', p_alineacion => true, p_ruedas => v_ruedas);
    raise exception 'R15a: un tenant SIN el módulo cargó un trabajo de neumáticos con ruedas. Cayeron services_insercion Y ruedas_escritura.';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- El interruptor, por la puerta real ----------
  -- fijar_override_plan() y no un UPDATE: exige superadmin, exige motivo
  -- y deja el registro. Es el mismo camino que /fidelli.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · bonificado · 2026-09-11 — prueba de regresión R15');

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- b · CON el módulo, el trabajo entra ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  if not plan_permite('neumaticos') then
    raise exception 'R15b: el override de /fidelli no habilita el módulo — plan_permite(''neumaticos'') sigue en false con la clave en true.';
  end if;

  begin
    v_id := guardar_service(
      p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
      p_kilometros => 123456, p_aceite_tipo => null, p_prox_service_km => null,
      p_observaciones => 'regresión R15',
      p_tipo => 'neumaticos', p_alineacion => true, p_ruedas => v_ruedas);
  exception when others then
    raise exception 'R15b: con el módulo prendido, un trabajo de neumáticos NO se pudo cargar (%). El gating quedó cerrado para todos.', sqlerrm;
  end;

  select count(*) into v_n from service_ruedas where service_id = v_id;
  if v_n <> 5 then
    raise exception 'R15b: se guardaron % ruedas y se mandaron 5 (cuatro colocadas y el auxilio medido).', v_n;
  end if;

  -- ---------- f · El stock: una unidad por rueda COLOCADA ----------
  select stock into v_stock from productos where id = v_prod;
  if v_stock <> 6 then
    raise exception 'R15f: el stock de la cubierta quedó en % y esperaba 6 (10 menos las CUATRO colocadas; el auxilio solo medido no descuenta).', v_stock;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- c · La retención no se mueve ----------
  select concat_ws('|', ultimo_service_fecha, ultimo_service_km, prox_service_km,
                   km_faltantes, km_por_dia, fecha_estimada, estado)
    into v_despues
  from vista_proximos_service where vehiculo_id = v_veh;

  if v_despues is distinct from v_antes then
    raise exception
      E'RETENCIÓN ROTA (R15c): un trabajo de NEUMÁTICOS alteró la fila de la vista.\n  antes:   %\n  después: %',
      v_antes, v_despues
      using hint = 'El distinct on de vista_proximos_service está tomando el trabajo de gomería como último service. Ver la regla 5 del CLAUDE.md.';
  end if;

  -- ---------- h · LA REGLA DE ORO: se apaga la escritura, no la lectura ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{}'::jsonb,
    'Módulo gomería · pago · 2026-09-11 — baja de prueba R15');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  if plan_permite('neumaticos') then
    raise exception 'R15h SIN PISO: borrar la clave del override no apagó el módulo.';
  end if;

  select count(*) into v_n from services where id = v_id;
  if v_n <> 1 then
    raise exception 'R15h: apagar el módulo le SACÓ al taller el trabajo que ya había cargado. Se apaga la escritura, nunca la lectura (20260822150000:18).';
  end if;

  select count(*) into v_n from service_ruedas where service_id = v_id;
  if v_n <> 5 then
    raise exception 'R15h: apagar el módulo le sacó al taller las ruedas del trabajo que ya había cargado (quedaron %). La lectura no se apaga nunca.', v_n;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- Y el cliente final lo sigue viendo en su cartón.
  select v.patente into v_pat from vehiculos v where v.id = v_veh;
  v_json := get_carton('demo', v_pat);
  if not exists (
    select 1 from jsonb_array_elements(v_json->'services') s
    where s->>'tipo' = 'neumaticos'
      and jsonb_array_length(coalesce(s->'ruedas', '[]'::jsonb)) = 5
  ) then
    raise exception 'R15h: el trabajo de neumáticos desapareció del cartón del cliente al apagar el módulo. El calco pegado en el parasol no se apaga porque el taller dejó de pagar un add-on.';
  end if;

  -- limpieza del trabajo y del producto de prueba
  delete from services where id = v_id;
  delete from productos where id = v_prod;
end $$;

-- ---------- R15d y R15e · Los CHECK, sin RLS de por medio ----------
-- Como postgres: RLS no aplica, los CHECK sí. Es exactamente lo que hay
-- que probar — que la forma de la fila la sostiene la TABLA y no la
-- función de guardado.
do $$
declare
  v_lub  uuid;
  v_veh  uuid;
  v_suc  uuid;
  v_usr  uuid;
  v_srv  uuid;
  v_caso text;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select v.id into v_veh from vehiculos v where v.lubricentro_id = v_lub limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select u.id into v_usr from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;

  -- d1 · con viscosidad de aceite cargada
  begin
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
                          tipo, fecha, kilometros, aceite_tipo, alineacion)
    values (v_lub, v_suc, v_veh, v_usr, 'neumaticos', current_date, 90000, '10W40', true);
    raise exception 'R15d: entró un trabajo de NEUMÁTICOS con viscosidad de aceite. El CHECK del tercer tipo no rige: los otros dos están escritos como (tipo <> ''x'' or ...) y sobre neumáticos no se pronuncian.';
  exception
    when check_violation then null; -- exactamente lo esperado
  end;

  -- d2 · sin kilómetros
  begin
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
                          tipo, fecha, alineacion)
    values (v_lub, v_suc, v_veh, v_usr, 'neumaticos', current_date, true);
    raise exception 'R15d: entró un trabajo de neumáticos SIN kilómetros. El bloque 2 calcula la rotación contra ese número.';
  exception
    when check_violation then null;
  end;

  -- d3 · sin alineación contestada
  begin
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
                          tipo, fecha, kilometros)
    values (v_lub, v_suc, v_veh, v_usr, 'neumaticos', current_date, 90000);
    raise exception 'R15d: entró un trabajo de neumáticos con la alineación sin contestar.';
  exception
    when check_violation then null;
  end;

  -- d4 · el espejo: alineación en un tipo que no es neumáticos
  begin
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
                          tipo, fecha, kilometros, aceite_tipo, prox_service_km, alineacion)
    values (v_lub, v_suc, v_veh, v_usr, 'service', current_date, 90000, '10W40', 100000, true);
    raise exception 'R15d: un SERVICE se guardó con alineación. La columna es del trabajo de gomería.';
  exception
    when check_violation then null;
  end;

  -- ---------- e · los CHECK por rueda ----------
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
                        tipo, fecha, kilometros, alineacion)
  values (v_lub, v_suc, v_veh, v_usr, 'neumaticos', current_date, 90000, true)
  returning id into v_srv;

  -- e1 · una rueda sin acción y sin medición no existe
  begin
    v_caso := 'una rueda sin ninguna acción y sin profundidad';
    insert into service_ruedas (service_id, posicion, marca)
    values (v_srv, 'delantera_izquierda', 'Fate');
    raise exception 'R15e: entró %. Una fila de rueda existe porque se le hizo algo o porque se la midió.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e2 · rotada sin decir de dónde venía
  begin
    v_caso := 'una rueda rotada sin posición anterior';
    insert into service_ruedas (service_id, posicion, rotada)
    values (v_srv, 'delantera_izquierda', true);
    raise exception 'R15e: entró %.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e3 · rotada desde su propia posición
  begin
    v_caso := 'una rueda rotada desde su propia posición';
    insert into service_ruedas (service_id, posicion, rotada, posicion_anterior)
    values (v_srv, 'delantera_izquierda', true, 'delantera_izquierda');
    raise exception 'R15e: entró %.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e4 · medida con formato inventado
  begin
    v_caso := 'una medida con formato inválido (205-55-16)';
    insert into service_ruedas (service_id, posicion, colocada, medida)
    values (v_srv, 'delantera_izquierda', true, '205-55-16');
    raise exception 'R15e: entró %.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e5 · DOT con semana imposible (semana 67)
  begin
    v_caso := 'un DOT con la semana 67';
    insert into service_ruedas (service_id, posicion, colocada, dot)
    values (v_srv, 'delantera_izquierda', true, '6725');
    raise exception 'R15e: entró %. Las dos primeras cifras son la semana: 01 a 53.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e6 · profundidad fuera de rango
  begin
    v_caso := 'una profundidad de 30 mm';
    insert into service_ruedas (service_id, posicion, profundidad_mm)
    values (v_srv, 'delantera_izquierda', 30);
    raise exception 'R15e: entró %.', v_caso;
  exception
    when check_violation then null;
  end;

  -- e7 · dos filas para la misma posición del mismo trabajo
  insert into service_ruedas (service_id, posicion, colocada) values (v_srv, 'delantera_izquierda', true);
  begin
    v_caso := 'dos ruedas en la misma posición del mismo trabajo';
    insert into service_ruedas (service_id, posicion, colocada) values (v_srv, 'delantera_izquierda', true);
    raise exception 'R15e: entró %.', v_caso;
  exception
    when unique_violation then null;
  end;

  -- e8 · lo VÁLIDO tiene que entrar: medir sin vender, y las tres formas
  --      de medida. Si esto falla, el CHECK quedó de más y el taller no
  --      puede cargar lo que sí corresponde.
  insert into service_ruedas (service_id, posicion, profundidad_mm, dot, medida)
  values (v_srv, 'trasera_izquierda', 4.5, '2325', '205/55 R16');
  insert into service_ruedas (service_id, posicion, colocada, medida)
  values (v_srv, 'trasera_derecha', true, '225/45 ZR17');
  insert into service_ruedas (service_id, posicion, colocada, medida)
  values (v_srv, 'auxilio', true, '31.10 R15');

  -- El tenant se hereda de la cabecera, sin que la función lo escriba.
  if exists (select 1 from service_ruedas where service_id = v_srv and lubricentro_id is distinct from v_lub) then
    raise exception 'R15e: una rueda quedó con el lubricentro equivocado — el trigger de herencia no corrió.';
  end if;

  delete from services where id = v_srv;
end $$;

-- ---------- R15g · El premio y el tercer tipo ----------
-- premio_disponible ya resuelve esto sola con `pv.alcance = 'todos' or
-- s.tipo = 'service'`: un trabajo de gomería avanza el ciclo SOLO si el
-- taller puso "todos". No hizo falta tocar nada; esto lo fija.
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_super  uuid;
  v_veh    uuid;
  v_suc    uuid;
  v_srv    uuid;
  v_antes  integer;
  v_solo   integer;
  v_todos  integer;
  v_premio uuid;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  select v.id into v_veh from vehiculos v where v.lubricentro_id = v_lub limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select p.id into v_premio from premios p where p.lubricentro_id = v_lub and p.activo limit 1;

  if v_premio is null then
    raise exception 'R15g SIN PISO: el seed no dejó ningún premio activo en el demo.';
  end if;

  update premios set alcance = 'services' where id = v_premio;
  select services_ciclo into v_antes from premio_disponible(v_veh);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · bonificado · 2026-09-11 — prueba de premios R15g');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_srv := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 777000, p_aceite_tipo => null, p_prox_service_km => null,
    p_tipo => 'neumaticos', p_alineacion => true,
    p_ruedas => jsonb_build_array(
      jsonb_build_object('posicion', 'delantera_izquierda', 'colocada', true)));
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  select services_ciclo into v_solo from premio_disponible(v_veh);
  if v_solo <> v_antes then
    raise exception 'R15g: con alcance ''services'' un trabajo de gomería avanzó el ciclo (% → %). El programa cuenta cambios de aceite.', v_antes, v_solo;
  end if;

  update premios set alcance = 'todos' where id = v_premio;
  select services_ciclo into v_todos from premio_disponible(v_veh);
  if v_todos <> v_antes + 1 then
    raise exception 'R15g: con alcance ''todos'' el trabajo de gomería NO avanzó el ciclo (% → %).', v_antes, v_todos;
  end if;

  -- limpieza: el premio como estaba y el trabajo de la prueba
  update premios set alcance = 'services' where id = v_premio;
  delete from services where id = v_srv;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{}'::jsonb,
    'Módulo gomería · pago · 2026-09-11 — cierre de la prueba R15g');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- ---------- R15i · El listado de /fidelli sigue respondiendo ----------
-- Esta prueba nace de un bug real de este mismo bloque: al sumarle la
-- columna del módulo, listado_lubricentros() pasó a llamar a
-- feature_de_tenant(), que es SECURITY DEFINER y NO está grantada a
-- authenticated (a propósito: acepta cualquier lubricentro_id). Como la
-- función del listado es security INVOKER, la llamada explotaba con
-- "permission denied"… y la pantalla de /fidelli mostraba "Todavía no hay
-- ningún lubricentro". Cero error a la vista, la superficie de
-- administración entera vacía.
--
-- El chequeo es tonto a propósito: como superadmin, el listado tiene que
-- devolver AL MENOS las filas que hay en la tabla. Cualquier permiso que
-- falte en cualquier función que el listado llame lo hace fallar acá y no
-- en producción.
do $$
declare
  v_super  uuid;
  v_tabla  integer;
  v_listado integer;
  v_modulo boolean;
  v_lub    uuid;
begin
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  if v_super is null then
    raise exception 'R15i SIN PISO: el seed local no dejó ningún superadmin.';
  end if;

  select count(*) into v_tabla from lubricentros;
  select l.id into v_lub from lubricentros l where l.slug = 'demo';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    select count(*) into v_listado from listado_lubricentros();
  exception when others then
    raise exception
      E'R15i: listado_lubricentros() falla para un superadmin (%).\n/fidelli queda vacío diciendo "Todavía no hay ningún lubricentro", sin ningún error a la vista.', sqlerrm
      using hint = 'Es security INVOKER: solo puede llamar funciones grantadas a authenticated. feature_de_tenant NO lo está.';
  end;

  if v_listado < v_tabla then
    raise exception 'R15i: el listado devuelve % filas y en la tabla hay %.', v_listado, v_tabla;
  end if;

  -- Y la columna del módulo dice la verdad: apagado ahora…
  select modulo_neumaticos into v_modulo from listado_lubricentros() where id = v_lub;
  if v_modulo then
    raise exception 'R15i: el listado marca el módulo de gomería como activo sin override.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- …y prendido cuando el override lo prende.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · pago · 2026-09-11 — prueba del listado R15i');
  select modulo_neumaticos into v_modulo from listado_lubricentros() where id = v_lub;
  if not v_modulo then
    raise exception 'R15i: el override prendió el módulo pero el listado de cobranzas no lo muestra.';
  end if;
  perform fijar_override_plan(v_lub, '{}'::jsonb,
    'Módulo gomería · pago · 2026-09-11 — cierre de la prueba R15i');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- ============================================================
-- R16 · Retornos de gomería (bloque 2 de neumáticos)
--
-- La pantalla que renueva las suscripciones es "A quién llamar", y su
-- modo de falla es silencioso. Este bloque le suma una TERCERA fuente
-- (vista_proximos_neumaticos) sin tocar la primera, y estas pruebas
-- sostienen las dos cosas: que la primera no se movió (R16a) y que la
-- tercera dice lo que promete.
--
-- Cada bloque lleva su código en el mensaje de la excepción y va entre
-- marcadores `-- >>> R16x` / `-- <<< R16x`: scripts/regresion-neumaticos.sh
-- los corre de a uno con una rotura a mano y espera verlos en ROJO. Una
-- prueba que nunca se vio fallar no cuenta.
--
--   a · vista_proximos_service devuelve EXACTAMENTE las mismas filas
--       antes y después de cargar trabajos de gomería en los mismos autos.
--   b · security_invoker en la vista nueva, con la consulta que lo prueba.
--   c · Sin el módulo: cero filas y el badge no cuenta nada. Un superadmin
--       tampoco ve filas (no tiene tenant).
--   d · Rotación por km, alineación por meses, y los dos motivos en UNA
--       sola fila.
--   e · El reajuste a los 3 días aparece; a los 20 ya no.
--   f · DOT de 2018 → antigüedad; 2,5 mm → desgaste; sin datos → nada, y
--       no rompe.
--   g · Los tenants existentes y los nuevos tienen su config y su tercera
--       plantilla, sin pisar lo personalizado.
--   h · El anti-spam: un aviso por vehículo por ciclo, por motivo
--       'neumaticos', posterior al último trabajo de gomería.
--   i · El beneficio: con dos o más colocadas, desde la config; con
--       beneficio_km = 0 desaparece de todos lados; se recalcula al editar.
--   j · Los CHECK de la configuración y su RLS por tenant.
--   k · resumen_inicio emite el tipo de cada trabajo.
--   l · El ritmo sale de TODOS los trabajos con kilómetros.
-- ============================================================

-- >>> R16-setup
-- Helpers temporales (se borran en R16-fin). Los que escriben datos corren
-- como postgres; los que llaman a guardar_service corren como el owner.
create function r16_lub() returns uuid language sql as $$
  select id from lubricentros where slug = 'demo' $$;
create function r16_owner() returns uuid language sql as $$
  select u.id from usuarios u where u.lubricentro_id = r16_lub() and u.rol = 'owner' limit 1 $$;
create function r16_super() returns uuid language sql as $$
  select u.id from usuarios u where u.rol = 'superadmin' limit 1 $$;
create function r16_sucursal() returns uuid language sql as $$
  select su.id from sucursales su where su.lubricentro_id = r16_lub() and su.activa
  order by su.created_at limit 1 $$;

create function r16_como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function r16_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- El interruptor, por la puerta real de /fidelli.
create function r16_modulo(p_on boolean) returns void language plpgsql as $$
begin
  perform r16_como(r16_super());
  perform fijar_override_plan(r16_lub(),
    case when p_on then '{"neumaticos": true}'::jsonb else '{}'::jsonb end,
    'Módulo gomería · bonificado · 2026-09-12 — prueba de regresión R16');
  perform r16_postgres();
end $$;

create function r16_cliente(p_nombre text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into clientes (lubricentro_id, nombre, telefono)
  values (r16_lub(), p_nombre, '351 555 0100') returning id into v;
  return v;
end $$;

create function r16_vehiculo(p_cliente uuid, p_patente text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (r16_lub(), p_cliente, p_patente, 'Fiat', 'Cronos') returning id into v;
  return v;
end $$;

-- Un trabajo de gomería con la fecha que se pida (el created_at es ahora).
create function r16_neum(p_veh uuid, p_fecha date, p_km integer, p_alineacion boolean, p_ruedas jsonb)
returns uuid language sql as $$
  select guardar_service(
    p_vehiculo_id => p_veh, p_sucursal_id => r16_sucursal(), p_fecha => p_fecha,
    p_kilometros => p_km, p_aceite_tipo => null, p_prox_service_km => null,
    p_tipo => 'neumaticos', p_alineacion => p_alineacion, p_ruedas => p_ruedas) $$;

create function r16_service(p_veh uuid, p_fecha date, p_km integer) returns uuid language sql as $$
  select guardar_service(
    p_vehiculo_id => p_veh, p_sucursal_id => r16_sucursal(), p_fecha => p_fecha,
    p_kilometros => p_km, p_aceite_tipo => '10W40', p_prox_service_km => p_km + 10000) $$;

create function r16_mecanica(p_veh uuid, p_fecha date, p_km integer) returns uuid language sql as $$
  select guardar_service(
    p_vehiculo_id => p_veh, p_sucursal_id => r16_sucursal(), p_fecha => p_fecha,
    p_kilometros => p_km, p_aceite_tipo => null, p_prox_service_km => null,
    p_tipo => 'mecanica', p_trabajo_descripcion => 'Prueba R16: cambio de pastillas') $$;

-- El juego nuevo: cuatro colocadas y balanceadas.
create function r16_cuatro_colocadas() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('posicion', 'delantera_izquierda', 'colocada', true, 'balanceada', true),
    jsonb_build_object('posicion', 'delantera_derecha',   'colocada', true, 'balanceada', true),
    jsonb_build_object('posicion', 'trasera_izquierda',   'colocada', true, 'balanceada', true),
    jsonb_build_object('posicion', 'trasera_derecha',     'colocada', true, 'balanceada', true)) $$;

-- Una medición: las cuatro con profundidad, y un DOT en la delantera
-- izquierda si se pide.
create function r16_medicion(p_mm_di numeric, p_mm_resto numeric, p_dot text) returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('posicion', 'delantera_izquierda', 'profundidad_mm', p_mm_di::text, 'dot', p_dot),
    jsonb_build_object('posicion', 'delantera_derecha',   'profundidad_mm', p_mm_resto::text),
    jsonb_build_object('posicion', 'trasera_izquierda',   'profundidad_mm', p_mm_resto::text),
    jsonb_build_object('posicion', 'trasera_derecha',     'profundidad_mm', p_mm_resto::text)) $$;

create function r16_limpiar(p_cliente uuid) returns void language plpgsql as $$
begin
  delete from contactos where vehiculo_id in (select id from vehiculos where cliente_id = p_cliente);
  delete from services  where vehiculo_id in (select id from vehiculos where cliente_id = p_cliente);
  delete from vehiculos where cliente_id = p_cliente;
  delete from clientes  where id = p_cliente;
end $$;
-- <<< R16-setup

-- >>> R16a
-- ---------- R16a · vista_proximos_service no se mueve ----------
do $$
declare
  v_antes   text;
  v_despues text;
  v_ids     uuid[];
  v_kms     integer[];
  v_nuevos  uuid[] := '{}';
  v_n       integer;
  i         integer;
begin
  -- La foto, campo por campo, de TODA la vista (como postgres: sin RLS).
  select coalesce(string_agg(row_to_json(vp)::text, E'\n' order by vp.vehiculo_id), '')
    into v_antes from vista_proximos_service vp;

  select array_agg(x.vehiculo_id), array_agg(x.ultimo_service_km)
    into v_ids, v_kms
  from (select vp.vehiculo_id, vp.ultimo_service_km
        from vista_proximos_service vp
        where vp.lubricentro_id = r16_lub()
        order by vp.vehiculo_id limit 3) x;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'R16a SIN PISO: el seed no deja ningún auto en la lista de a quién llamar.';
  end if;

  -- Trabajos de gomería de HOY, con MÁS kilómetros que el último service,
  -- en los mismos autos que están en la lista: colocación con alineación,
  -- rotación, y una medición con DOT viejo y dibujo al límite. Si
  -- cualquiera de los tres se colara como "último service", la fila cambia.
  perform r16_modulo(true);
  perform r16_como(r16_owner());
  for i in 1 .. array_length(v_ids, 1) loop
    v_nuevos := v_nuevos || case i
      when 1 then r16_neum(v_ids[i], current_date, v_kms[i] + 500, true, r16_cuatro_colocadas())
      when 2 then r16_neum(v_ids[i], current_date, v_kms[i] + 500, false, jsonb_build_array(
        jsonb_build_object('posicion','delantera_izquierda','rotada',true,'balanceada',true,'posicion_anterior','trasera_izquierda'),
        jsonb_build_object('posicion','delantera_derecha','rotada',true,'balanceada',true,'posicion_anterior','trasera_derecha'),
        jsonb_build_object('posicion','trasera_izquierda','rotada',true,'balanceada',true,'posicion_anterior','delantera_izquierda'),
        jsonb_build_object('posicion','trasera_derecha','rotada',true,'balanceada',true,'posicion_anterior','delantera_derecha')))
      else r16_neum(v_ids[i], current_date, v_kms[i] + 500, false, r16_medicion(2.5, 6, '1218'))
    end;
  end loop;
  perform r16_postgres();

  select coalesce(string_agg(row_to_json(vp)::text, E'\n' order by vp.vehiculo_id), '')
    into v_despues from vista_proximos_service vp;

  if v_despues is distinct from v_antes then
    raise exception
      E'R16a · RETENCIÓN ROTA: cargar trabajos de gomería alteró vista_proximos_service.\n  antes:   %\n  después: %',
      left(v_antes, 400), left(v_despues, 400)
      using hint = 'Este bloque no toca esa vista. Si cambió, alguien le sacó el filtro de tipo o la redefinió.';
  end if;

  -- Y la tercera vista SÍ los ve (control positivo: la prueba no es vacía).
  perform r16_como(r16_owner());
  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = any(v_ids);
  perform r16_postgres();
  if v_n = 0 then
    raise exception 'R16a SIN PISO: los trabajos de gomería no aparecen en vista_proximos_neumaticos (la medición con DOT 2018 tendría que estar vencida).';
  end if;

  delete from services where id = any(v_nuevos);
  perform r16_modulo(false);
end $$;
-- <<< R16a

-- >>> R16b
-- ---------- R16b · security_invoker en la vista nueva ----------
do $$
declare v_opts text;
begin
  select array_to_string(reloptions, ',') into v_opts
  from pg_class where relname = 'vista_proximos_neumaticos';
  if v_opts is null
     or (v_opts not like '%security_invoker=on%' and v_opts not like '%security_invoker=true%') then
    raise exception
      'R16b · AISLAMIENTO ROTO: vista_proximos_neumaticos perdió el security_invoker — un owner vería los retornos de TODOS los lubricentros.'
      using hint = 'alter view vista_proximos_neumaticos set (security_invoker = on);';
  end if;
end $$;
-- <<< R16b

-- >>> R16c
-- ---------- R16c · Sin el módulo, nada ----------
do $$
declare
  v_cli  uuid; v_veh uuid; v_id uuid;
  v_base integer; v_con integer; v_sin integer; v_n integer;
begin
  v_cli := r16_cliente('R16c'); v_veh := r16_vehiculo(v_cli, 'RC 016 AA');

  -- El badge SIN el módulo, como owner: la base.
  perform r16_modulo(false);
  perform r16_como(r16_owner());
  v_base := contactos_por_hacer();
  perform r16_postgres();

  -- Con el módulo: un auto con motivo vencido (DOT de 2018).
  perform r16_modulo(true);
  perform r16_como(r16_owner());
  v_id := r16_neum(v_veh, current_date, 50000, false, r16_medicion(6, 6, '1218'));
  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = v_veh;
  if v_n <> 1 then
    raise exception 'R16c SIN PISO: con el módulo prendido el auto con DOT 2018 no aparece (% filas).', v_n;
  end if;
  v_con := contactos_por_hacer();
  perform r16_postgres();
  if v_con <> v_base + 1 then
    raise exception 'R16c: el badge no suma la tercera fuente — con el módulo dice % y la base era % (esperaba %).', v_con, v_base, v_base + 1;
  end if;

  -- Se apaga el módulo: el trabajo sigue en la base, pero la vista no lo
  -- devuelve y el badge vuelve a la base.
  perform r16_modulo(false);
  perform r16_como(r16_owner());
  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = v_veh;
  v_sin := contactos_por_hacer();
  perform r16_postgres();
  if v_n <> 0 then
    raise exception 'R16c: un tenant SIN el módulo ve % fila(s) de retornos de gomería en "A quién llamar".', v_n;
  end if;
  if v_sin <> v_base then
    raise exception 'R16c: sin el módulo, el badge cuenta retornos de gomería (% vs base %).', v_sin, v_base;
  end if;

  -- Un superadmin no tiene tenant: cero filas, sin error.
  perform r16_como(r16_super());
  select count(*) into v_n from vista_proximos_neumaticos;
  perform r16_postgres();
  if v_n <> 0 then
    raise exception 'R16c: un superadmin ve % fila(s) en vista_proximos_neumaticos.', v_n;
  end if;

  perform r16_limpiar(v_cli);
end $$;
-- <<< R16c

-- >>> R16d
-- ---------- R16d · Rotación, alineación, y los dos en una fila ----------
do $$
declare
  v_cli uuid; v_a uuid; v_b uuid; v_c uuid;
  v_mot text[]; v_n integer; v_km integer;
begin
  v_cli := r16_cliente('R16d');
  v_a := r16_vehiculo(v_cli, 'RD 016 AA');
  v_b := r16_vehiculo(v_cli, 'RD 016 BB');
  v_c := r16_vehiculo(v_cli, 'RD 016 CC');

  perform r16_modulo(true);
  perform r16_como(r16_owner());

  -- A · cubiertas colocadas hace 12.000 km (y una alineación reciente,
  --     para que el ÚNICO motivo sea la rotación).
  perform r16_service(v_a, current_date - 400, 50000);
  perform r16_neum(v_a, current_date - 380, 51000, false, r16_cuatro_colocadas());
  perform r16_neum(v_a, current_date - 30, 61500, true, '[]'::jsonb);
  perform r16_service(v_a, current_date - 10, 62000);

  -- B · alineación hace 14 meses, sin colocación.
  perform r16_neum(v_b, current_date - 425, 40000, true, '[]'::jsonb);
  perform r16_service(v_b, current_date - 5, 43000);

  -- C · colocación con alineación hace 14 meses: vencen las dos.
  perform r16_neum(v_c, current_date - 425, 30000, true, r16_cuatro_colocadas());
  perform r16_service(v_c, current_date - 5, 45000);

  select motivos, km_faltantes into v_mot, v_km from vista_proximos_neumaticos where vehiculo_id = v_a;
  if v_mot is null or v_mot <> array['rotacion'] then
    raise exception 'R16d: el auto con cubiertas colocadas hace 12.000 km tiene motivos % (esperaba {rotacion}).', coalesce(v_mot::text, 'SIN FILA');
  end if;
  if v_km <> 0 then
    raise exception 'R16d: la rotación ya vencida por km dice que faltan % km (esperaba 0).', v_km;
  end if;

  select motivos into v_mot from vista_proximos_neumaticos where vehiculo_id = v_b;
  if v_mot is null or v_mot <> array['alineacion'] then
    raise exception 'R16d: el auto alineado hace 14 meses tiene motivos % (esperaba {alineacion}).', coalesce(v_mot::text, 'SIN FILA');
  end if;

  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = v_c;
  if v_n <> 1 then
    raise exception 'R16d: el auto con rotación Y alineación vencidas aparece % veces (esperaba UNA fila con los dos motivos).', v_n;
  end if;
  select motivos into v_mot from vista_proximos_neumaticos where vehiculo_id = v_c;
  if not (v_mot @> array['rotacion', 'alineacion']) then
    raise exception 'R16d: la fila única del auto con los dos motivos dice % (esperaba rotacion y alineacion).', v_mot;
  end if;

  perform r16_postgres();
  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16d

-- >>> R16e
-- ---------- R16e · El reajuste de tuercas: a los 3 días sí, a los 20 no ----------
do $$
declare
  v_cli uuid; v_d uuid; v_e uuid; v_mot text[]; v_n integer;
begin
  v_cli := r16_cliente('R16e');
  v_d := r16_vehiculo(v_cli, 'RE 016 AA');
  v_e := r16_vehiculo(v_cli, 'RE 016 BB');

  perform r16_modulo(true);
  perform r16_como(r16_owner());
  perform r16_neum(v_d, current_date - 3,  70000, false, r16_cuatro_colocadas());
  perform r16_neum(v_e, current_date - 20, 70000, false, r16_cuatro_colocadas());

  select motivos into v_mot from vista_proximos_neumaticos where vehiculo_id = v_d;
  if v_mot is null or v_mot <> array['reajuste'] then
    raise exception 'R16e: la colocación de hace 3 días tiene motivos % (esperaba {reajuste}).', coalesce(v_mot::text, 'SIN FILA');
  end if;

  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = v_e;
  if v_n <> 0 then
    raise exception 'R16e: la colocación de hace 20 días sigue en la lista (%): el reajuste de tuercas a los dos meses es ridículo.',
      (select motivos from vista_proximos_neumaticos where vehiculo_id = v_e);
  end if;

  perform r16_postgres();
  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16e

-- >>> R16f
-- ---------- R16f · Antigüedad, desgaste, y nada ----------
do $$
declare
  v_cli uuid; v_f uuid; v_g uuid; v_h uuid;
  v_mot text[]; v_anio integer; v_mm numeric; v_n integer;
begin
  v_cli := r16_cliente('R16f');
  v_f := r16_vehiculo(v_cli, 'RF 016 AA');
  v_g := r16_vehiculo(v_cli, 'RF 016 BB');
  v_h := r16_vehiculo(v_cli, 'RF 016 CC');

  perform r16_modulo(true);
  perform r16_como(r16_owner());
  -- F · un DOT de 2018 (semana 12), dibujo sano.
  perform r16_neum(v_f, current_date, 50000, false, r16_medicion(6, 6, '1218'));
  -- G · 2,5 mm en una, sin DOT.
  perform r16_neum(v_g, current_date, 50000, false, r16_medicion(2.5, 6, null));
  -- H · ni DOT ni profundidad: una alineación y una rueda balanceada.
  perform r16_neum(v_h, current_date, 50000, true, jsonb_build_array(
    jsonb_build_object('posicion', 'delantera_izquierda', 'balanceada', true)));

  select motivos, anio_dot into v_mot, v_anio from vista_proximos_neumaticos where vehiculo_id = v_f;
  if v_mot is null or v_mot <> array['antiguedad'] then
    raise exception 'R16f: el auto con DOT de 2018 tiene motivos % (esperaba {antiguedad}).', coalesce(v_mot::text, 'SIN FILA');
  end if;
  if v_anio <> 2018 then
    raise exception 'R16f: anio_dot dice % (esperaba 2018).', v_anio;
  end if;

  select motivos, mm_minimo into v_mot, v_mm from vista_proximos_neumaticos where vehiculo_id = v_g;
  if v_mot is null or v_mot <> array['desgaste'] then
    raise exception 'R16f: el auto con 2,5 mm tiene motivos % (esperaba {desgaste}).', coalesce(v_mot::text, 'SIN FILA');
  end if;
  if v_mm <> 2.5 then
    raise exception 'R16f: mm_minimo dice % (esperaba 2.5).', v_mm;
  end if;

  select count(*) into v_n from vista_proximos_neumaticos where vehiculo_id = v_h;
  if v_n <> 0 then
    raise exception 'R16f: el auto sin DOT ni profundidad aparece con motivos %.',
      (select motivos from vista_proximos_neumaticos where vehiculo_id = v_h);
  end if;

  perform r16_postgres();
  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16f

-- >>> R16g
-- ---------- R16g · Config y plantilla para todos, sin pisar nada ----------
do $$
declare
  v_nuevo uuid; v_n integer; v_m integer; v_t record;
begin
  -- Todos los tenants que existen tienen su config y su tercera plantilla.
  select count(*) into v_n from lubricentros l
  where not exists (select 1 from config_neumaticos c where c.lubricentro_id = l.id);
  if v_n > 0 then
    raise exception 'R16g: % lubricentro(s) sin fila en config_neumaticos.', v_n;
  end if;
  select count(*) into v_n from mensaje_templates where contenido_neumaticos is null;
  if v_n > 0 then
    raise exception 'R16g: % plantilla(s) sin contenido_neumaticos después de la migración.', v_n;
  end if;

  -- Un tenant nuevo nace con su config (trigger) y sus tres tonos con las
  -- tres plantillas cada uno.
  insert into lubricentros (nombre, slug) values ('R16 Gomería', 'r16-gomeria') returning id into v_nuevo;
  if not exists (select 1 from config_neumaticos where lubricentro_id = v_nuevo) then
    raise exception 'R16g: un lubricentro nuevo nació sin config_neumaticos — el trigger no corrió.';
  end if;
  perform sembrar_templates(v_nuevo, 'R16 Gomería');
  select count(*), count(contenido_neumaticos) into v_n, v_m from mensaje_templates where lubricentro_id = v_nuevo;
  if v_n <> 3 or v_m <> 3 then
    raise exception 'R16g: la siembra dejó % tonos y % con contenido_neumaticos (esperaba 3 y 3).', v_n, v_m;
  end if;
  if not exists (select 1 from mensaje_templates where lubricentro_id = v_nuevo and tono = 'Cercano'
                 and contenido_neumaticos like '%R16 Gomería%' and contenido_neumaticos like '%{motivo}%') then
    raise exception 'R16g: el tono Cercano sembrado no nombra al lubricentro o no lleva {motivo}.';
  end if;

  -- El backfill no pisa lo personalizado: una plantilla propia del tenant,
  -- con sus dos textos escritos a mano y sin el tercero.
  insert into mensaje_templates (lubricentro_id, tono, contenido, contenido_pendiente, contenido_neumaticos, activo)
  values (v_nuevo, 'Promo', 'PERSONALIZADO DE SERVICE', 'PERSONALIZADO DE PENDIENTE', null, false);
  v_n := completar_templates_neumaticos();
  if v_n <> 1 then
    raise exception 'R16g: completar_templates_neumaticos() completó % fila(s) (esperaba 1: solo la que estaba en null).', v_n;
  end if;
  select * into v_t from mensaje_templates where lubricentro_id = v_nuevo and tono = 'Promo';
  if v_t.contenido <> 'PERSONALIZADO DE SERVICE' or v_t.contenido_pendiente <> 'PERSONALIZADO DE PENDIENTE' then
    raise exception 'R16g: el backfill PISÓ lo personalizado (contenido=%, pendiente=%).', v_t.contenido, v_t.contenido_pendiente;
  end if;
  if v_t.contenido_neumaticos is null or v_t.contenido_neumaticos not like '%R16 Gomería%' then
    raise exception 'R16g: el backfill no cargó contenido_neumaticos con el nombre del lubricentro (%).', v_t.contenido_neumaticos;
  end if;
  v_n := completar_templates_neumaticos();
  if v_n <> 0 then
    raise exception 'R16g: el backfill no es idempotente: la segunda corrida tocó % fila(s).', v_n;
  end if;

  delete from mensaje_templates where lubricentro_id = v_nuevo;
  delete from lubricentros where id = v_nuevo;
end $$;
-- <<< R16g

-- >>> R16h
-- ---------- R16h · El anti-spam: un aviso por ciclo, por motivo 'neumaticos' ----------
do $$
declare
  v_cli uuid; v_veh uuid; v_nuevo uuid; v_c boolean; v_antes integer; v_despues integer;
begin
  v_cli := r16_cliente('R16h'); v_veh := r16_vehiculo(v_cli, 'RH 016 AA');

  perform r16_modulo(true);
  perform r16_como(r16_owner());
  perform r16_neum(v_veh, current_date, 50000, false, r16_medicion(6, 6, '1218'));

  select contactado into v_c from vista_proximos_neumaticos where vehiculo_id = v_veh;
  if v_c is null or v_c then
    raise exception 'R16h: un auto recién cargado ya figura como contactado (%).', coalesce(v_c::text, 'SIN FILA');
  end if;

  -- Un contacto por OTRO motivo (el service vencido) no cuenta.
  -- created_at explícito con clock_timestamp(): dentro de UNA transacción
  -- now() es el mismo instante para el trabajo y para el contacto, y el
  -- anti-spam pide un contacto estrictamente POSTERIOR. En la vida real
  -- son dos transacciones separadas por minutos; acá se simula el reloj.
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  values (r16_lub(), v_veh, r16_owner(), 'vencido', 'manual', clock_timestamp());
  select contactado into v_c from vista_proximos_neumaticos where vehiculo_id = v_veh;
  if v_c then
    raise exception 'R16h: un contacto por motivo ''vencido'' marcó como contactado el retorno de gomería — se perdió la semántica por motivo.';
  end if;

  -- El contacto por 'neumaticos' sí, y baja el badge en 1.
  v_antes := contactos_por_hacer();
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  values (r16_lub(), v_veh, r16_owner(), 'neumaticos', 'whatsapp', clock_timestamp());
  select contactado into v_c from vista_proximos_neumaticos where vehiculo_id = v_veh;
  if not v_c then
    raise exception 'R16h: el contacto por ''neumaticos'' no marcó la fila como contactada.';
  end if;
  v_despues := contactos_por_hacer();
  if v_despues <> v_antes - 1 then
    raise exception 'R16h: contactar no bajó el badge en 1 (% → %).', v_antes, v_despues;
  end if;

  -- Un trabajo NUEVO de gomería abre otro ciclo: vuelve a estar sin contactar.
  -- (Su created_at se adelanta con el reloj real por lo mismo de arriba.)
  v_nuevo := r16_neum(v_veh, current_date, 50100, false, r16_medicion(6, 6, '1218'));
  perform r16_postgres();
  update services set created_at = clock_timestamp() where id = v_nuevo;
  perform r16_como(r16_owner());
  select contactado into v_c from vista_proximos_neumaticos where vehiculo_id = v_veh;
  if v_c then
    raise exception 'R16h: un trabajo de gomería posterior al contacto no abrió un ciclo nuevo.';
  end if;

  perform r16_postgres();
  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16h

-- >>> R16i
-- ---------- R16i · El beneficio de la compra ----------
do $$
declare
  v_cli uuid; v_j uuid; v_k uuid; v_l uuid;
  v_sj uuid; v_sk uuid; v_sl uuid;
  v_km integer; v_fecha date; v_json jsonb; v_pat text;
begin
  v_cli := r16_cliente('R16i');
  v_j := r16_vehiculo(v_cli, 'RI 016 AA');
  v_k := r16_vehiculo(v_cli, 'RI 016 BB');
  v_l := r16_vehiculo(v_cli, 'RI 016 CC');

  perform r16_modulo(true);
  perform r16_como(r16_owner());

  -- J · el juego completo: beneficio desde la config (10.000 km / 6 meses).
  v_sj := r16_neum(v_j, current_date, 100000, false, r16_cuatro_colocadas());
  select beneficio_hasta_km, beneficio_hasta_fecha into v_km, v_fecha from services where id = v_sj;
  if v_km is distinct from 110000 or v_fecha is distinct from (current_date + interval '6 months')::date then
    raise exception 'R16i: con cuatro colocadas el beneficio quedó en % km / % (esperaba 110000 / %).',
      v_km, v_fecha, (current_date + interval '6 months')::date;
  end if;

  -- K · UNA cubierta: sin beneficio.
  v_sk := r16_neum(v_k, current_date, 80000, false, jsonb_build_array(
    jsonb_build_object('posicion', 'delantera_izquierda', 'colocada', true)));
  select beneficio_hasta_km into v_km from services where id = v_sk;
  if v_km is not null then
    raise exception 'R16i: con UNA cubierta colocada se dio beneficio (% km).', v_km;
  end if;

  -- El cartón del cliente lo muestra…
  perform r16_postgres();
  select patente into v_pat from vehiculos where id = v_j;
  v_json := get_carton('demo', v_pat);
  if (v_json->'services'->0->>'beneficio_hasta_km')::integer is distinct from 110000 then
    raise exception 'R16i: get_carton no emite el beneficio (%).', v_json->'services'->0->>'beneficio_hasta_km';
  end if;

  -- …y con beneficio_km = 0 desaparece de todos lados: del cartón de J
  -- (que ya lo tenía guardado) y de un trabajo nuevo.
  perform r16_como(r16_owner());
  update config_neumaticos set beneficio_km = 0 where lubricentro_id = r16_lub();
  v_sl := r16_neum(v_l, current_date, 90000, false, r16_cuatro_colocadas());
  select beneficio_hasta_km into v_km from services where id = v_sl;
  if v_km is not null then
    raise exception 'R16i: con beneficio_km = 0 un trabajo nuevo recibió beneficio (% km).', v_km;
  end if;
  perform r16_postgres();
  v_json := get_carton('demo', v_pat);
  if v_json->'services'->0->>'beneficio_hasta_km' is not null then
    raise exception 'R16i: con beneficio_km = 0 el cartón de J sigue mostrando el beneficio (%).', v_json->'services'->0->>'beneficio_hasta_km';
  end if;

  -- Se vuelve a prender: J lo recupera sin tocar el trabajo.
  perform r16_como(r16_owner());
  update config_neumaticos set beneficio_km = 10000 where lubricentro_id = r16_lub();
  perform r16_postgres();
  v_json := get_carton('demo', v_pat);
  if (v_json->'services'->0->>'beneficio_hasta_km')::integer is distinct from 110000 then
    raise exception 'R16i: al volver a prender el beneficio, el cartón de J no lo recuperó.';
  end if;

  -- Editar recalcula: K pasa a dos colocadas y gana el beneficio.
  perform r16_como(r16_owner());
  perform actualizar_service(
    p_service_id => v_sk, p_sucursal_id => r16_sucursal(), p_fecha => current_date,
    p_kilometros => 80000, p_aceite_tipo => null, p_prox_service_km => null,
    p_alineacion => false,
    p_ruedas => jsonb_build_array(
      jsonb_build_object('posicion', 'delantera_izquierda', 'colocada', true),
      jsonb_build_object('posicion', 'delantera_derecha',   'colocada', true)));
  select beneficio_hasta_km into v_km from services where id = v_sk;
  if v_km is distinct from 90000 then
    raise exception 'R16i: al editar a dos colocadas el beneficio no se recalculó (% km, esperaba 90000).', v_km;
  end if;

  perform r16_postgres();
  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16i

-- >>> R16j
-- ---------- R16j · Los CHECK de la configuración y su RLS ----------
do $$
declare
  v_ajeno uuid; v_n integer; v_km integer;
begin
  insert into lubricentros (nombre, slug) values ('R16 ajeno', 'r16-ajeno') returning id into v_ajeno;

  perform r16_modulo(true);
  perform r16_como(r16_owner());

  -- Fuera de rango: rechazado.
  begin
    update config_neumaticos set km_rotacion = 500 where lubricentro_id = r16_lub();
    raise exception 'R16j: entró una rotación cada 500 km — el CHECK no rige.';
  exception when check_violation then null;
  end;
  begin
    update config_neumaticos set mm_alerta = 1.0 where lubricentro_id = r16_lub();
    raise exception 'R16j: entró una alerta de dibujo a 1,0 mm, por debajo del mínimo legal.';
  exception when check_violation then null;
  end;
  begin
    update config_neumaticos set beneficio_km = 100 where lubricentro_id = r16_lub();
    raise exception 'R16j: entró un beneficio de 100 km (0 apaga, o de 3.000 para arriba).';
  exception when check_violation then null;
  end;

  -- En rango: entra y se lee.
  update config_neumaticos set km_rotacion = 5000 where lubricentro_id = r16_lub();
  select km_rotacion into v_km from config_neumaticos where lubricentro_id = r16_lub();
  if v_km <> 5000 then
    raise exception 'R16j: el owner guardó km_rotacion = 5000 y se lee %.', v_km;
  end if;
  update config_neumaticos set km_rotacion = 10000 where lubricentro_id = r16_lub();

  -- RLS: el owner ve SOLO su fila y no toca la ajena.
  select count(*) into v_n from config_neumaticos;
  if v_n <> 1 then
    raise exception 'R16j: el owner ve % filas de config_neumaticos (esperaba 1: la suya).', v_n;
  end if;
  update config_neumaticos set km_rotacion = 5000 where lubricentro_id = v_ajeno;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'R16j: el owner modificó la configuración de OTRO lubricentro.';
  end if;
  perform r16_postgres();

  -- Sin el módulo, la lectura sigue y la escritura no.
  perform r16_modulo(false);
  perform r16_como(r16_owner());
  select count(*) into v_n from config_neumaticos where lubricentro_id = r16_lub();
  if v_n <> 1 then
    raise exception 'R16j: apagar el módulo le escondió al owner su propia configuración.';
  end if;
  begin
    update config_neumaticos set km_rotacion = 5000 where lubricentro_id = r16_lub();
    raise exception 'R16j: sin el módulo el owner pudo escribir la configuración.';
  exception when insufficient_privilege then null;
  end;
  perform r16_postgres();

  delete from lubricentros where id = v_ajeno;
end $$;
-- <<< R16j

-- >>> R16k
-- ---------- R16k · resumen_inicio emite el tipo ----------
do $$
declare
  v_cli uuid; v_veh uuid; v_json jsonb; v_ultimo jsonb;
begin
  v_cli := r16_cliente('R16k'); v_veh := r16_vehiculo(v_cli, 'RK 016 AA');

  perform r16_modulo(true);
  perform r16_como(r16_owner());
  perform r16_neum(v_veh, current_date, 50000, true, r16_cuatro_colocadas());
  v_json := resumen_inicio();
  perform r16_postgres();

  v_ultimo := v_json->'ultimos'->0;
  if v_ultimo->>'tipo' is distinct from 'neumaticos' then
    raise exception 'R16k: el último trabajo de Inicio dice tipo % (esperaba neumaticos). Sin el tipo, "Últimos trabajos" muestra kilómetros para los tres.', coalesce(v_ultimo->>'tipo', 'NULL');
  end if;
  if jsonb_array_length(coalesce(v_ultimo->'ruedas', '[]'::jsonb)) <> 4
     or (v_ultimo->'ruedas'->0->>'colocada')::boolean is distinct from true
     or (v_ultimo->>'alineacion')::boolean is distinct from true then
    raise exception 'R16k: resumen_inicio no emite las ruedas y la alineación del trabajo de gomería (%).', v_ultimo;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_json->'ultimos') u where u->>'tipo' = 'service') then
    raise exception 'R16k: ningún service de los últimos trae tipo ''service''.';
  end if;

  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16k

-- >>> R16l
-- ---------- R16l · El ritmo sale de TODOS los trabajos con kilómetros ----------
do $$
declare
  v_cli uuid; v_veh uuid; v_kmd numeric; v_n bigint; v_ini boolean;
begin
  v_cli := r16_cliente('R16l'); v_veh := r16_vehiculo(v_cli, 'RL 016 AA');

  perform r16_modulo(true);
  perform r16_como(r16_owner());
  -- Un service, una mecánica con odómetro y la colocación de hoy:
  -- 6.000 km en 100 días = 60 km/día. Si el ritmo mirara solo gomería,
  -- daría el default de 40 con una sola lectura.
  perform r16_service(v_veh, current_date - 100, 10000);
  perform r16_mecanica(v_veh, current_date - 50, 13000);
  perform r16_neum(v_veh, current_date, 16000, false, r16_cuatro_colocadas());

  select km_por_dia, cantidad_services, estimacion_inicial into v_kmd, v_n, v_ini
  from vista_proximos_neumaticos where vehiculo_id = v_veh;
  perform r16_postgres();

  if v_kmd is null then
    raise exception 'R16l SIN PISO: la colocación de hoy no aparece (el reajuste tendría que estar dado).';
  end if;
  if v_kmd <> 60 or v_n <> 3 or v_ini then
    raise exception 'R16l: el ritmo da % km/día sobre % lecturas (inicial=%) — esperaba 60 sobre 3, medido. El ritmo tiene que salir de todos los trabajos con kilómetros, no solo de los de gomería.', v_kmd, v_n, v_ini;
  end if;

  perform r16_limpiar(v_cli);
  perform r16_modulo(false);
end $$;
-- <<< R16l

-- >>> R16-fin
drop function r16_limpiar(uuid);
drop function r16_medicion(numeric, numeric, text);
drop function r16_cuatro_colocadas();
drop function r16_mecanica(uuid, date, integer);
drop function r16_service(uuid, date, integer);
drop function r16_neum(uuid, date, integer, boolean, jsonb);
drop function r16_vehiculo(uuid, text);
drop function r16_cliente(text);
drop function r16_modulo(boolean);
drop function r16_postgres();
drop function r16_como(uuid);
drop function r16_sucursal();
drop function r16_super();
drop function r16_owner();
drop function r16_lub();
-- <<< R16-fin

-- ============================================================
-- R17 · Los renglones del vehículo pesado (sprint de septiembre de 2026)
--
-- Dos invariantes que, rotos, no dan error:
--   (a) El orden del enum item_tipo ES el orden del cartón. "order by
--       item_tipo" es lo que dibuja el papel en get_carton, en la
--       exportación y en pantalla: un valor agregado al final —o anclado
--       en el lugar equivocado— pone el filtro de urea después de los
--       aditivos en el cartón de un camión. El build pasa igual.
--   (b) Ninguna función SQL enumera valores de item_tipo. guardar_service
--       y actualizar_service tienen que aceptar los 21 tal cual llegan,
--       y get_carton devolverlos en el orden del papel. Si alguien escribe
--       un `case item_tipo when …` o un CHECK con la lista de los once,
--       esto lo atrapa.
-- ============================================================

-- >>> R17a
do $$
declare
  v_esperado text[] := array[
    'filtro_aceite', 'filtro_aire', 'filtro_combustible', 'filtro_habitaculo',
    'filtro_combustible_secundario', 'filtro_separador_agua', 'filtro_aire_secundario',
    'filtro_secador_aire', 'filtro_urea', 'filtro_hidraulico',
    'aceite_caja', 'aceite_diferencial', 'aceite_hidraulico',
    'aceite_caja_reductora', 'aceite_diferencial_delantero',
    'liq_refrigerante', 'liq_frenos',
    'aditivo_motor', 'aditivo_transmision',
    'engrase', 'bateria'
  ];
  v_real text[];
begin
  select array_agg(e.enumlabel::text order by e.enumsortorder) into v_real
  from pg_enum e where e.enumtypid = 'item_tipo'::regtype;

  if v_real is distinct from v_esperado then
    raise exception E'R17a ORDEN DEL CARTÓN ROTO: item_tipo no está en el orden del papel.\n  real:     %\n  esperado: %',
      array_to_string(v_real, ' · '), array_to_string(v_esperado, ' · ')
      using hint =
        'Todo valor nuevo de item_tipo entra con ADD VALUE … AFTER, anclado a un valor que ya existía '
        '(ver 20260915120000_item_tipo_pesado). Nunca al final: el orden del enum es el del cartón físico.';
  end if;
end $$;
-- <<< R17a

-- >>> R17b
do $$
declare
  v_lub   uuid;
  v_owner uuid;
  v_suc   uuid;
  v_veh   uuid;
  v_pat   text;
  v_serv  uuid;
  v_items jsonb;
  v_todos text[];
  v_menos text[];
  v_tipos text[];
  v_json  jsonb;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;
  select su.id into v_suc from sucursales su where su.lubricentro_id = v_lub and su.activa limit 1;
  select v.id, v.patente_normalizada into v_veh, v_pat
  from vehiculos v where v.lubricentro_id = v_lub order by v.created_at limit 1;

  -- Los 21, en el orden del enum tal cual está en la base (R17a ya
  -- verificó que ese orden es el del cartón).
  select array_agg(e.enumlabel::text order by e.enumsortorder) into v_todos
  from pg_enum e where e.enumtypid = 'item_tipo'::regtype;
  -- Guarda explícita, para que este bloque no se pruebe a sí mismo: con
  -- la base sin la migración, 11 contra 11 pasaba en verde.
  if coalesce(array_length(v_todos, 1), 0) <> 21 then
    raise exception 'R17b: item_tipo tiene % valores, esperaba los 21 del cartón de camión (20260915120000).',
      coalesce(array_length(v_todos, 1), 0);
  end if;
  -- Los mismos sin el primero y sin el último: lo que la edición conserva.
  select array_agg(u.t order by u.n) into v_menos
  from unnest(v_todos) with ordinality as u(t, n)
  where u.t not in ('filtro_aceite', 'bateria');

  -- 1 · Un service de camión completo: el cartón entero, los 21 a la vez.
  select jsonb_agg(jsonb_build_object('tipo', u.t, 'cambiado', true) order by u.n) into v_items
  from unnest(v_todos) with ordinality as u(t, n);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_serv := guardar_service(
    p_vehiculo_id => v_veh, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 998100, p_aceite_tipo => '15W40', p_prox_service_km => 1023100,
    p_items => v_items);

  select array_agg(si.item_tipo::text order by si.item_tipo) into v_tipos
  from service_items si where si.service_id = v_serv;
  if v_tipos is distinct from v_todos then
    raise exception 'R17b: guardar_service guardó % renglones de 21 (%). Alguna función SQL enumera valores de item_tipo.',
      coalesce(array_length(v_tipos, 1), 0), array_to_string(v_tipos, ' · ');
  end if;

  -- 2 · La edición conserva los renglones nuevos y borra SOLO lo que dejó
  --     de viajar: el `delete … not in (…)` de actualizar_service es una
  --     subconsulta sobre el jsonb entrante, no una lista fija.
  select jsonb_agg(jsonb_build_object('tipo', u.t, 'cambiado', false) order by u.n) into v_items
  from unnest(v_menos) with ordinality as u(t, n);
  perform actualizar_service(
    p_service_id => v_serv, p_sucursal_id => v_suc, p_fecha => current_date,
    p_kilometros => 998100, p_aceite_tipo => '15W40', p_prox_service_km => 1023100,
    p_items => v_items);

  select array_agg(si.item_tipo::text order by si.item_tipo) into v_tipos
  from service_items si where si.service_id = v_serv;
  if v_tipos is distinct from v_menos then
    raise exception 'R17b: actualizar_service dejó % renglones (esperaba 19: sin filtro_aceite ni bateria, con los nueve de camión): %',
      coalesce(array_length(v_tipos, 1), 0), array_to_string(v_tipos, ' · ');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- 3 · La puerta pública devuelve los renglones en el orden del cartón.
  --     El service recién cargado es el más nuevo: va primero.
  v_json := get_carton('demo', v_pat);
  select array_agg(i.item->>'tipo' order by i.n) into v_tipos
  from jsonb_array_elements(v_json->'services'->0->'items') with ordinality as i(item, n);
  if v_tipos is distinct from v_menos then
    raise exception 'R17b: get_carton devolvió los renglones fuera del orden del cartón: %',
      array_to_string(v_tipos, ' · ');
  end if;
  delete from landing_busquedas where lubricentro_id = v_lub and patente = v_pat;

  -- limpieza total
  delete from service_items where service_id = v_serv;
  delete from services where id = v_serv;
end $$;
-- <<< R17b

-- ============================================================
-- R18 · La clase del vehículo (fase 2 del sprint de vehículo pesado)
--
-- Lo que se rompe sin avisar: (a) alguien le pone `default 'liviano'` o
-- NOT NULL a vehiculos.clase "para simplificar", y los camiones que SA ya
-- tiene cargados quedan afirmados como autos; (b) crear_cliente_con_vehiculo
-- deja de guardar la clase (o la guarda cuando no se contestó); (c)
-- get_carton deja de emitirla y el papel del cliente vuelve a ser el de un
-- auto para un camión; (d) vista_vehiculos la pierde y el dialog de
-- edición arranca siempre en liviano. Ninguna da error.
-- ============================================================

-- >>> R18
do $$
declare
  v_lub     uuid;
  v_owner   uuid;
  v_veh_p   uuid;
  v_veh_n   uuid;
  v_cli_p   uuid;
  v_cli_n   uuid;
  v_notnull boolean;
  v_default text;
  v_json    jsonb;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;

  -- (a) la columna existe, es anulable y no tiene default: null = "nunca
  --     se preguntó", que no es lo mismo que "liviano".
  select a.attnotnull, pg_get_expr(d.adbin, d.adrelid) into v_notnull, v_default
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'vehiculos'::regclass and a.attname = 'clase' and not a.attisdropped;
  if not found then
    raise exception 'R18: vehiculos.clase no existe (20260915130000).';
  end if;
  if v_notnull or v_default is not null then
    raise exception 'R18: vehiculos.clase tiene % — tiene que ser anulable y sin default: null distingue "nunca se preguntó" de "se contestó liviano", y los camiones ya cargados no son autos.',
      case when v_notnull then 'NOT NULL' else 'default ' || v_default end;
  end if;
  if (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = 'clase_vehiculo'::regtype)
     is distinct from array['liviano', 'pesado'] then
    raise exception 'R18: clase_vehiculo no es exactamente (liviano, pesado). Un tercer valor tiene que discutirse: el front lo leería como liviano.';
  end if;

  -- (b) el alta del Momento 0 guarda la clase contestada, y omitida queda null.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_veh_p := crear_cliente_con_vehiculo('Cliente R18 pesado', '351555018', '', 'AR 018 PS', 'Scania', 'R450', 2019, null, 'pesado');
  v_veh_n := crear_cliente_con_vehiculo('Cliente R18 sin clase', '351555019', '', 'AR 018 PL', 'Ford', 'Ranger');

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  select cliente_id into v_cli_p from vehiculos where id = v_veh_p;
  select cliente_id into v_cli_n from vehiculos where id = v_veh_n;

  if (select clase from vehiculos where id = v_veh_p) is distinct from 'pesado'::clase_vehiculo then
    raise exception 'R18: crear_cliente_con_vehiculo no guardó la clase contestada (quedó %).', (select clase from vehiculos where id = v_veh_p);
  end if;
  if (select clase from vehiculos where id = v_veh_n) is not null then
    raise exception 'R18: crear_cliente_con_vehiculo guardó una clase (%) que nadie contestó. Tiene que quedar null.', (select clase from vehiculos where id = v_veh_n);
  end if;

  -- (d) vista_vehiculos la expone. Que siga con security_invoker lo vigila
  --     el primer bloque de este archivo, para todas las vistas.
  if (select clase from vista_vehiculos where id = v_veh_p) is distinct from 'pesado'::clase_vehiculo then
    raise exception 'R18: vista_vehiculos no expone la clase (o la expone mal).';
  end if;

  -- (c) la puerta pública la emite tal cual: 'pesado' para el camión y
  --     null —la clave presente, sin valor— para el que nunca se preguntó.
  --     Leer null como liviano es del front, no de la base.
  v_json := get_carton('demo', 'AR 018 PS');
  if v_json->'vehiculo'->>'clase' is distinct from 'pesado' then
    raise exception 'R18: get_carton no emite la clase del camión (vehiculo = %).', v_json->'vehiculo';
  end if;
  v_json := get_carton('demo', 'AR 018 PL');
  if not (v_json->'vehiculo' ? 'clase') or v_json->'vehiculo'->>'clase' is not null then
    raise exception 'R18: get_carton tiene que emitir clase = null para un vehículo sin clase (vehiculo = %).', v_json->'vehiculo';
  end if;
  delete from landing_busquedas where lubricentro_id = v_lub and patente in ('AR018PS', 'AR018PL');

  -- limpieza total
  delete from vehiculos where id in (v_veh_p, v_veh_n);
  delete from clientes where id in (v_cli_p, v_cli_n);
end $$;
-- <<< R18

-- ============================================================
-- R19 · Editar un vehículo sin contestar la clase la deja en null
--
-- Una sugerencia no es una respuesta. Al editar un vehículo con la clase
-- en null, el selector la SUGIERE por la marca pero no la manda hasta que
-- el mecánico toca un botón: el input oculto viaja vacío, esClaseVehiculo
-- lo lee como null y editarVehiculo no incluye `clase` en el update. Este
-- bloque cubre la mitad que vive en la base: el update que emite esa
-- acción —los cuatro campos, sin clase— tiene que dejar la clase como
-- estaba, null o contestada, y nada de la base (un trigger "útil", un
-- default) puede inventar una clasificación. La mitad del front (el
-- input vacío y el update sin la clave) se vio en rojo y en verde a mano
-- en #95. Se resigna volver una clase a null: nadie lo necesita.
-- ============================================================

-- >>> R19
do $$
declare
  v_lub   uuid;
  v_owner uuid;
  v_cli   uuid;
  v_veh   uuid;
  v_clase clase_vehiculo;
begin
  select l.id into v_lub from lubricentros l where l.slug = 'demo';
  select u.id into v_owner from usuarios u where u.lubricentro_id = v_lub and u.rol = 'owner' limit 1;

  -- Un auto cargado antes del sprint: la clase nunca se preguntó.
  insert into clientes (lubricentro_id, nombre, telefono)
  values (v_lub, 'Cliente R19', '351555190') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
  values (v_lub, v_cli, 'AR 019 PL', 'Chevrolet', 'Corsa', 2011) returning id into v_veh;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1 · La edición sin tocar el selector: exactamente lo que escribe
  --     editarVehiculo cuando la clase no se contestó — los cuatro
  --     campos, sin clase.
  update vehiculos
  set patente = 'AR 019 PL', marca = 'Chevrolet', modelo = 'Corsa', anio = 2012
  where id = v_veh;

  select clase into v_clase from vehiculos where id = v_veh;
  if v_clase is not null then
    raise exception 'R19: editar un vehículo sin contestar la clase la dejó en % — tiene que quedar null. Algo en la base (un trigger, un default) está inventando una clasificación.', v_clase;
  end if;

  -- 2 · La edición que SÍ la contesta la guarda.
  update vehiculos set clase = 'pesado' where id = v_veh;
  select clase into v_clase from vehiculos where id = v_veh;
  if v_clase is distinct from 'pesado'::clase_vehiculo then
    raise exception 'R19: contestar la clase al editar no la guardó (quedó %).', v_clase;
  end if;

  -- 3 · Y una edición posterior sin la clave no la pisa: el update de
  --     editarVehiculo no manda `clase` cuando no se contestó.
  update vehiculos set marca = 'Scania', modelo = 'R450' where id = v_veh;
  select clase into v_clase from vehiculos where id = v_veh;
  if v_clase is distinct from 'pesado'::clase_vehiculo then
    raise exception 'R19: una edición sin la clase pisó la clasificación guardada (quedó %).', v_clase;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- limpieza total
  delete from vehiculos where id = v_veh;
  delete from clientes where id = v_cli;
end $$;
-- <<< R19

-- ============================================================
-- R20 · El catálogo de cobranza (20260916100000)
--
-- Toda la plata es dato y no constante, y todo cambio de plata deja
-- rastro con autor, fecha y motivo. Este bloque protege las tres mitades
-- de esa regla:
--
--   a · El módulo existe con su precio, y su `codigo` coincide con la
--       clave del override. No hay FK posible contra un tipo de
--       TypeScript: si alguien escribe 'neumatico' en una de las dos
--       puntas, el monto sale sin el módulo y nadie se entera.
--   b · El catálogo local es el de PRODUCCIÓN. La drift de septiembre de
--       2026 (semestral 10 vs 0, el plan del demo a 45.000 con 15% anual)
--       hacía que la pantalla de pago ofreciera el período semestral en
--       local y no en producción. Corre después del seed a propósito: el
--       plan del demo nace en `seed.sql`, no en las migraciones.
--   c · El candado. Un UPDATE suelto de precio se rechaza venga de donde
--       venga, y la función oficial deja el rastro.
--   d · El motivo es obligatorio de verdad, y un guardado que no mueve
--       ningún número no ensucia la auditoría.
-- ============================================================

-- >>> R20
do $$
declare
  v_super   uuid;
  v_plan    uuid;
  v_modulo  uuid;
  v_precio  numeric;
  v_n       integer;
  v_catalogo text;
  v_fila    record;
  v_aud     record;
begin
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  if v_super is null then
    raise exception 'R20 SIN PISO: el seed local no dejó ningún superadmin (ver supabase/seed.sql).';
  end if;

  -- ---------- a · El módulo y su código ----------
  select id, precio_mensual into v_modulo, v_precio
  from modulos where codigo = 'neumaticos';

  if v_modulo is null then
    raise exception 'R20a: no hay fila en `modulos` con codigo = ''neumaticos''. El cálculo del monto no tiene de dónde sacar el precio del módulo y lo cobraría en cero, en silencio.';
  end if;
  if v_precio is distinct from 25000 then
    raise exception 'R20a: el módulo gomería vale % y tiene que valer 25000.', v_precio;
  end if;

  -- El código de `modulos` y la clave del override son la misma palabra,
  -- en dos lugares que ningún tipo ata. El día que se agregue un módulo,
  -- esto avisa antes que una factura.
  if not exists (
    select 1 from lubricentros
    where plan_overrides ? 'neumaticos'
  ) and exists (select 1 from lubricentros where plan_overrides <> '{}'::jsonb) then
    raise exception 'R20a: hay overrides de plan cargados y ninguno usa la clave ''neumaticos'', que es el `codigo` del único módulo del catálogo. Una de las dos puntas se escribió distinto.';
  end if;

  -- ---------- b · El catálogo local es el de producción ----------
  select activo, heredado, precio_mensual, descuento_anual_pct, descuento_semestral_pct
    into v_fila
  from planes where nombre = 'Fidelli Motors';

  if not found then
    raise exception 'R20b: el plan "Fidelli Motors" no existe después del seed. Los dos seeds lo buscan POR NOMBRE (20260723225403:58 y 20260724040841:144) y si no está lo recrean a $45.000, pisando el precio real.';
  end if;
  if v_fila.activo then
    raise exception 'R20b: el plan "Fidelli Motors" quedó ACTIVO. Tiene que salir del catálogo con activo = false — ni borrado (lo bloquea on delete restrict y el seed lo recrea) ni renombrado (los seeds lo buscan por nombre y crearían un duplicado). Falta el backfill de supabase/seed.sql.';
  end if;
  if v_fila.precio_mensual is distinct from 46750
     or v_fila.descuento_anual_pct is distinct from 25 then
    raise exception 'R20b: el plan "Fidelli Motors" quedó en % / %%% anual y producción dice 46750 / 25%%. El `db reset` está dejando un catálogo que no es el real y el cálculo de plata se prueba contra números que no existen.',
      v_fila.precio_mensual, v_fila.descuento_anual_pct;
  end if;

  select count(*) into v_n from planes where descuento_semestral_pct <> 0;
  if v_n > 0 then
    raise exception 'R20b: % plan(es) con descuento semestral distinto de 0. En producción los cuatro están en 0, y la pantalla de pago decide si OFRECE el período semestral mirando ese número: con la drift, la opción aparece en local y no en producción.', v_n;
  end if;

  select string_agg(nombre || '=' || precio_mensual, ' ' order by nombre) into v_catalogo
  from planes where activo and not heredado;
  if v_catalogo is distinct from 'Basic=39000.00 Pro=49000.00 Ultra=99000.00' then
    raise exception 'R20b: el catálogo vigente quedó en «%» y tiene que ser Basic 39000 / Pro 49000 / Ultra 99000.', v_catalogo;
  end if;

  -- ---------- c · El candado ----------
  select id into v_plan from planes where nombre = 'Pro' and not heredado;

  begin
    update planes set precio_mensual = 1 where id = v_plan;
    raise exception 'R20c: un UPDATE suelto movió el precio de Pro. El candado no rige y /fidelli/precios puede cambiar la factura de los 17 tenants sin dejar rastro.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%precio_solo_por_funcion%' then raise; end if;
  end;

  begin
    update planes set descuento_anual_pct = 30 where id = v_plan;
    raise exception 'R20c: un UPDATE suelto movió el descuento anual de Pro. El 25%% del anual sale de esta columna: moverla sin rastro cambia el monto de todos los anuales.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%precio_solo_por_funcion%' then raise; end if;
  end;

  begin
    update modulos set precio_mensual = 1 where id = v_modulo;
    raise exception 'R20c: un UPDATE suelto movió el precio del módulo gomería.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%precio_solo_por_funcion%' then raise; end if;
  end;

  -- Lo que el candado NO bloquea, y no tiene que bloquear: activo,
  -- heredado, features y limites tienen sus propios caminos. Si esto
  -- empieza a fallar, el candado se comió el ABM de planes y el alta.
  begin
    update planes set activo = activo where id = v_plan;
  exception when others then
    raise exception 'R20c: el candado bloqueó un UPDATE que NO toca precios (%). Se comió el ABM de planes.', sqlerrm;
  end;

  -- ---------- d · La puerta oficial, el motivo y el rastro ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Sin motivo con sustancia, no pasa.
  --
  -- La afirmación es sobre el INVARIANTE ("un motivo corto no mueve un
  -- precio"), no sobre QUÉ defensa lo rechaza. Son dos y a propósito: el
  -- chequeo de fijar_precio_plan(), que da un mensaje legible, y el CHECK
  -- `motivo_con_sustancia` de la tabla, que es el piso. Atar la prueba a
  -- una sola las vuelve frágiles: sacarle el mínimo a la función ponía este
  -- bloque en rojo con el mensaje del CHECK, o sea rojo por la razón
  -- equivocada, que es justo lo que manda a arreglar la verificación en vez
  -- del bug.
  declare
    v_paso boolean := false;
  begin
    begin
      perform fijar_precio_plan(v_plan, 51000, 0, 25, 'ajuste');
      v_paso := true;
    exception when others then
      null;  -- cualquiera de las dos defensas que lo rechace sirve
    end;

    if v_paso then
      raise exception 'R20d: se movió un precio de lista con un motivo de 6 caracteres. Sin motivo, dentro de un año nadie puede contestar por qué un cliente paga lo que paga — que es la única razón por la que existe cambios_precio_catalogo.';
    end if;
  end;

  select count(*) into v_n from cambios_precio_catalogo;

  -- Con motivo, pasa y deja rastro.
  perform fijar_precio_plan(v_plan, 51000, 0, 25, 'Regresión R20 · ajuste de prueba');

  select precio_mensual into v_precio from planes where id = v_plan;
  if v_precio is distinct from 51000 then
    raise exception 'R20d: fijar_precio_plan() no movió el precio (quedó %).', v_precio;
  end if;

  select count(*) into v_precio from cambios_precio_catalogo;
  if v_precio <> v_n + 1 then
    raise exception 'R20d: el cambio de precio no dejó fila en cambios_precio_catalogo (% → %).', v_n, v_precio;
  end if;

  select antes->>'precio_mensual' as antes, despues->>'precio_mensual' as despues, cambiado_por
    into v_aud
  from cambios_precio_catalogo order by created_at desc limit 1;

  if v_aud.cambiado_por is distinct from v_super then
    raise exception 'R20d: la fila de auditoría no guardó al autor.';
  end if;

  -- Un guardado que no mueve ningún número no ensucia la auditoría:
  -- /fidelli/precios manda el formulario entero en cada submit.
  perform fijar_precio_plan(v_plan, 51000, 0, 25, 'Regresión R20 · el mismo valor otra vez');
  select count(*) into v_precio from cambios_precio_catalogo;
  if v_precio <> v_n + 1 then
    raise exception 'R20d: un guardado que no cambió ningún número dejó una fila de auditoría. En seis meses la tabla es ilegible justo cuando hay que leerla.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- Un no-superadmin no puede ni llamar a la puerta.
  declare
    v_owner uuid;
  begin
    select u.id into v_owner from usuarios u where u.rol = 'owner' limit 1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    begin
      perform fijar_precio_plan(v_plan, 1, 0, 25, 'Regresión R20 · un owner intentando');
      raise exception 'R20d: un OWNER movió el precio de lista de un plan.';
    exception
      when sqlstate '42501' then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);
  end;

  -- limpieza: el precio vuelve a lo que era y la auditoría de la prueba se va.
  perform set_config('fidelli.precio_de_catalogo', 'si', true);
  update planes set precio_mensual = 49000 where id = v_plan;
  delete from cambios_precio_catalogo where motivo like 'Regresión R20 ·%';
end $$;
-- <<< R20

-- ============================================================
-- R21 · El reloj de cobranza (20260916140000)
--
--   a · Los cuatro estados, fecha por fecha, con los bordes EXACTOS de la
--       spec (hoy, hoy−1, hoy−7, hoy−8) y el contador que ve el cliente.
--       La función es pura, así que esto se prueba con literales: no hace
--       falta crear un tenant por cada borde.
--   b · Las exenciones y quién le gana a quién. `activo = false` gana
--       SIEMPRE, incluso sobre estar afuera del reloj; `descuento_pct =
--       100` queda fuera del circuito entero; sin `cobranza_desde` no hay
--       reloj que corra.
--   c · EL SEGUNDO INTERRUPTOR. Con `suspension_automatica` en false el
--       reloj avisa pero NUNCA cierra el panel: el estado se topa en
--       `gracia` y `activo` sigue en true. Es el "primer ciclo solo
--       avisos", y es lo que separa un monto mal calculado de un monto
--       mal calculado que además suspende a alguien.
--   d · El contrato del payload: las NUEVE claves del jsonb, una por una.
--       Viajan en snake_case a un tipo camelCase detrás de un cast que
--       TypeScript no revisa —los campos calculados de PostgREST no
--       aparecen en el `Row` de la tabla—, así que una clave renombrada
--       de un lado no rompe del otro: deja un "te quedan undefined días".
--   e · SEGURIDAD. El payload como `security definer` filtrando por un
--       `lubricentro_id` que viene en el argumento se verificó EXPLOTABLE
--       EN VIVO durante el diseño: un owner leía el vencimiento, el
--       descuento negociado y el precio del vecino. Este bloque llama a la
--       función con un composite FORJADO y exige que no devuelva los datos
--       del otro tenant.
--   f · Los montos, con los casos que decidió Santiago.
-- ============================================================

-- >>> R21a
do $$
declare
  v_caso record;
  v_dio  text;
  v_hoy  date := current_date;
begin
  for v_caso in
    select * from (values
      ( 8, 'al_dia'),
      ( 7, 'por_vencer'),   -- el borde del aviso, alineado con estado_atencion()
      ( 1, 'por_vencer'),
      ( 0, 'por_vencer'),   -- vence HOY: todavía no debe nada
      (-1, 'gracia'),
      (-6, 'gracia'),
      (-7, 'gracia'),       -- el ÚLTIMO día de gracia
      (-8, 'suspendido')    -- el primero sin gracia
    ) as t(dias, esperado)
  loop
    v_dio := estado_cobranza(true, v_hoy + v_caso.dias, v_hoy - 1, true, 0);
    if v_dio is distinct from v_caso.esperado then
      raise exception 'R21a BORDE ROTO: con vencimiento = hoy % el reloj dio «%» y tenía que dar «%». El borde de la gracia es EXACTAMENTE vencimiento + dias_de_gracia().',
        case when v_caso.dias >= 0 then '+' || v_caso.dias else v_caso.dias::text end,
        coalesce(v_dio,'null'), v_caso.esperado;
    end if;
  end loop;

  -- El contador que LEE EL CLIENTE. Vale 1 el último día útil y nunca 0:
  -- un "te quedan 0 días" con el panel escribiendo normal es la clase de
  -- detalle que hace que el dueño deje de creerle al aviso.
  if dias_de_gracia_restantes(v_hoy - 1) is distinct from dias_de_gracia() then
    raise exception 'R21a: el primer día de gracia el contador dice % y tenía que decir %.',
      dias_de_gracia_restantes(v_hoy - 1), dias_de_gracia();
  end if;
  if dias_de_gracia_restantes(v_hoy - dias_de_gracia()) is distinct from 1 then
    raise exception 'R21a OFF-BY-ONE: el ÚLTIMO día de gracia el contador dice % y tiene que decir 1 ("hoy es el último día"), con el panel todavía abierto.',
      dias_de_gracia_restantes(v_hoy - dias_de_gracia());
  end if;
end $$;
-- <<< R21a

-- >>> R21b
do $$
declare v_hoy date := current_date;
begin
  -- `activo = false` gana sobre cualquier fecha...
  if estado_cobranza(false, v_hoy + 999, v_hoy - 1, false, 0) is distinct from 'suspendido' then
    raise exception 'R21b: el interruptor manual dejó de ganar sobre la fecha.';
  end if;
  -- ...y también sobre estar AFUERA del reloj. La rama @activo va PRIMERO.
  if estado_cobranza(false, v_hoy + 999, null, false, 0) is distinct from 'suspendido' then
    raise exception 'R21b: un tenant apagado a mano y afuera del reloj dio distinto de suspendido. La rama @activo tiene que ir ANTES que @desde, o apagar un tenant deja de tener efecto.';
  end if;

  -- Quien no paga nada no puede deber nada.
  if estado_cobranza(true, v_hoy - 999, v_hoy - 1, true, 100) is distinct from 'al_dia' then
    raise exception 'R21b: un tenant con descuento_pct = 100 entró al circuito de cobranza. No paga nada: no hay nada que reclamarle, ni barra, ni modal, ni orden de pago.';
  end if;
  -- ...pero el 50 del founding NO exime.
  if estado_cobranza(true, v_hoy - 999, v_hoy - 1, true, 50) is distinct from 'suspendido' then
    raise exception 'R21b: un descuento parcial (50) está eximiendo del reloj. Solo el 100 exime.';
  end if;

  -- Afuera del reloj, y el día que todavía no llegó.
  if estado_cobranza(true, v_hoy - 999, null, true, 0) is distinct from 'al_dia' then
    raise exception 'R21b LA RAMA @desde SE CAYÓ: un tenant AFUERA del reloj, con el vencimiento de hace tres años, dio distinto de al_dia. El día del deploy los 17 están así.';
  end if;
  if estado_cobranza(true, v_hoy - 999, v_hoy + 1, true, 0) is distinct from 'al_dia' then
    raise exception 'R21b: el reloj corrió antes de la fecha de encendido.';
  end if;

  -- Sin suscripción no se le reclama a quien no sabemos qué debe.
  if estado_cobranza(true, null, v_hoy - 1, true, 0) is distinct from 'al_dia' then
    raise exception 'R21b: un tenant sin vencimiento entró al circuito.';
  end if;

  -- Y lo que pasa con `activo` en null, escrito porque la versión cómoda
  -- de esta frase es falsa: NO cae a al_dia, sigue con las fechas.
  if estado_cobranza(null, v_hoy + 999, v_hoy - 1, true, 0) is distinct from 'al_dia' then
    raise exception 'R21b: con activo null y fecha sana esperaba al_dia.';
  end if;
  if estado_cobranza(null, v_hoy - 999, v_hoy - 1, true, 0) is distinct from 'suspendido' then
    raise exception 'R21b: con activo null y vencido hace tres años esperaba suspendido — la rama @activo no se toma y la evaluación sigue con las fechas. Si esto cambió, corregí también el comentario de la migración, que documenta exactamente este caso.';
  end if;
end $$;
-- <<< R21b

-- >>> R21c
do $$
declare
  v_hoy date := current_date;
  v_lub uuid;
  v_act boolean;
begin
  -- Pasada la ventana, CON el segundo interruptor: suspende.
  if estado_cobranza(true, v_hoy - 8, v_hoy - 1, true, 0) is distinct from 'suspendido' then
    raise exception 'R21c: con suspension_automatica prendida, un tenant a +8 días no llegó a suspendido.';
  end if;
  -- Pasada la ventana, SIN el segundo interruptor: avisa y NO suspende.
  if estado_cobranza(true, v_hoy - 8, v_hoy - 1, false, 0) is distinct from 'gracia' then
    raise exception 'R21c EL PRIMER CICLO DEJÓ DE SER SOLO AVISOS: con suspension_automatica APAGADA, un tenant a +8 días dio «%» y tenía que quedarse en gracia. El primer ciclo avisa; suspender se prende en el segundo, después de ver el cálculo de plata contra tenants reales.',
      coalesce(estado_cobranza(true, v_hoy - 8, v_hoy - 1, false, 0), 'null');
  end if;
  -- Ni a los 300 días.
  if estado_cobranza(true, v_hoy - 300, v_hoy - 1, false, 0) is distinct from 'gracia' then
    raise exception 'R21c: con la suspensión apagada, un vencido de hace 300 días salió de gracia.';
  end if;

  -- Y el default de la columna es APAGADO, para todos.
  if exists (select 1 from lubricentros where suspension_automatica) then
    raise exception 'R21c: hay % lubricentro(s) con suspension_automatica prendida. Arranca apagada PARA TODOS; se prende tenant por tenant, a mano, en el segundo ciclo.',
      (select count(*) from lubricentros where suspension_automatica);
  end if;

  -- El reloj NO escribe `activo`: no hay ningún cron dando vuelta booleanos.
  select id, activo into v_lub, v_act from lubricentros where slug = 'demo';
  if not v_act then
    raise exception 'R21c SIN PISO: el demo quedó con activo = false.';
  end if;
end $$;
-- <<< R21c

-- >>> R21d
do $$
declare
  v_json  jsonb;
  v_falta text;
  v_clave text;
begin
  select reloj_cobranza(l.*) into v_json from lubricentros l where l.slug = 'demo';

  if v_json is null then
    raise exception 'R21d: reloj_cobranza() devolvió null para el demo. El panel se queda sin el estado y la escalera no se muestra nunca.';
  end if;

  -- LAS NUEVE CLAVES, UNA POR UNA. El payload viaja en snake_case a un
  -- tipo camelCase de TypeScript, detrás de un cast que el compilador no
  -- revisa: una clave renombrada acá deja "te quedan undefined días" en
  -- pantalla y NADA falla en el build. Este bloque es el contrato.
  foreach v_clave in array array[
    'estado','vencimiento','dias_restantes','dias_para_vencer',
    'periodo','es_trial','exento','en_el_reloj','corta'
  ] loop
    if not (v_json ? v_clave) then
      v_falta := coalesce(v_falta || ', ', '') || v_clave;
    end if;
  end loop;

  if v_falta is not null then
    raise exception E'R21d CONTRATO ROTO: al payload de reloj_cobranza() le faltan las claves: %.\nlib/auth/cobranza.ts las lee en snake_case y las expone en camelCase; una clave que cambia de nombre acá NO rompe el build, deja "te quedan undefined días" en la pantalla del cliente.', v_falta;
  end if;

  if not (v_json->>'estado' = any(array['al_dia','por_vencer','gracia','suspendido'])) then
    raise exception 'R21d: el payload emite el estado «%», que no es uno de los cuatro de ESTADOS_COBRANZA.', v_json->>'estado';
  end if;

  -- EL DEMO NUNCA ENTRA AL RELOJ. Es la exención que la spec llama el peor
  -- bug posible del sprint: verlo suspendido en medio de una venta.
  if (select cobranza_desde is not null from lubricentros where slug = 'demo') then
    raise exception 'R21d: el tenant demo quedó DENTRO del reloj de cobranza. Verlo suspendido en medio de una demo comercial es el peor bug de este sprint.';
  end if;
  if v_json->>'estado' is distinct from 'al_dia' then
    raise exception 'R21d: el demo salió de al_dia (dio «%»).', v_json->>'estado';
  end if;

  -- Y el candado tiene que rechazar el intento de meterlo.
  begin
    update lubricentros set cobranza_desde = current_date where slug = 'demo';
    raise exception 'R21d: el demo se pudo meter al reloj con un UPDATE suelto. El candado no rige, y el UPDATE de encendido con un `where` olvidado lo metería en silencio.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%demo_fuera_del_reloj%' then raise; end if;
  end;
end $$;
-- <<< R21d

-- >>> R21e
do $$
declare
  v_owner uuid;
  v_otro  uuid;
  v_json  jsonb;
begin
  -- El owner del demo, y OTRO lubricentro que no es el suyo.
  select u.id into v_owner from usuarios u
  join lubricentros l on l.id = u.lubricentro_id
  where l.slug = 'demo' and u.rol = 'owner' limit 1;

  -- El vecino tiene que tener SUSCRIPCIÓN: es lo que se filtraría. Sin
  -- ella el payload sale null por falta de datos y no por seguridad, y la
  -- prueba pasa en verde sin haber probado nada. También se vio en rojo.
  insert into lubricentros (nombre, slug) values ('Vecino R21', 'vecino-r21')
  returning id into v_otro;

  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, vencimiento)
  select v_otro, p.id, 'activa', 'anual', 50, current_date + 5
  from planes p where p.nombre = 'Pro' and not p.heredado;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- EL COMPOSITE FORJADO, armado a mano y SIN LEER la fila del vecino.
  --
  -- ⚠ ESTE DETALLE ES LA PRUEBA. La versión obvia —hacer un join contra
  -- `lubricentros` para sacar la fila del vecino y pasarla— NO prueba
  -- nada: el RLS ya bloquea ESE select, el join devuelve cero filas y el
  -- bloque pasa en verde aunque la función sea `security definer`. Se vio
  -- en rojo: con esa versión, la rotura de R21e se escapaba.
  --
  -- Un atacante no lee la fila, la INVENTA: `/rpc/reloj_cobranza` acepta
  -- un objeto con el `id` que él elija, y el uuid de la víctima no es
  -- secreto (viaja en el logo_url público de su propia vidriera).
  -- `jsonb_populate_record` construye exactamente ese composite.
  select reloj_cobranza(
    jsonb_populate_record(null::lubricentros, jsonb_build_object('id', v_otro))
  ) into v_json;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  if v_json is not null then
    raise exception E'R21e LECTURA CRUZADA DE TENANTS: el owner del demo leyó el payload de cobranza de OTRO lubricentro (%).\nreloj_cobranza() tiene que ser SECURITY INVOKER para que el RLS recorte la subconsulta. Con definer, cualquier owner autenticado lee el vencimiento, el descuento negociado y el precio del vecino por /rpc/, y el uuid de la víctima no es secreto: viaja en el logo_url público de su vidriera.', v_json;
  end if;

  delete from suscripciones where lubricentro_id = v_otro;
  delete from lubricentros where id = v_otro;
end $$;
-- <<< R21e

-- >>> R21f
do $$
declare
  v_lub   uuid;
  v_plan  uuid;
  v_super uuid;
  v_m     jsonb;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;

  insert into lubricentros (nombre, slug) values ('Monto R21', 'monto-r21') returning id into v_lub;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, vencimiento)
  values (v_lub, v_plan, 'activa', 'anual', 0, current_date + 30);

  -- Pro anual: 49.000 × 12 × 0,75 = 441.000. El 25% sale de `planes`.
  v_m := monto_de_renovacion(v_lub);
  if (v_m->>'total')::numeric is distinct from 441000 then
    raise exception 'R21f: Pro anual dio % y tenía que dar 441000 (49.000 × 12 × 0,75). Si el 25%% se hardcodeó en vez de leerse de planes.descuento_anual_pct, esto se rompe.', v_m->>'total';
  end if;

  -- Con el módulo BONIFICADO no se cobra. Es el caso de Capuzzi, que lo
  -- tiene de por vida: cobrarlo le facturaría $25.000 de más.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · bonificado · 15/09/2026 · DE POR VIDA — regresión R21f');
  execute 'reset role';
  -- Los dos cambios de este bloque corren en la MISMA transacción, así que
  -- `now()` les da el mismo created_at y el «más reciente» queda al azar.
  -- Se separa a mano: en producción son dos requests distintos.
  update cambios_override_plan set created_at = now() - interval '1 hour'
  where lubricentro_id = v_lub;
  perform set_config('request.jwt.claims', '{}', true);

  v_m := monto_de_renovacion(v_lub);
  if (v_m->>'modulo')::numeric is distinct from 0 then
    raise exception 'R21f SE LE COBRÓ A UN BONIFICADO: con el motivo en «bonificado» el módulo sumó % y tenía que sumar 0. Hoy los dos tenants con gomería la tienen bonificada de por vida.', v_m->>'modulo';
  end if;

  -- Y con el motivo en `pago` sí: 25.000 × 12 × 0,75 = 225.000. El módulo
  -- lleva el descuento del PERÍODO pero no el del tenant.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · pago · 15/09/2026 · regresión R21f');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  v_m := monto_de_renovacion(v_lub);
  if (v_m->>'modulo')::numeric is distinct from 225000 then
    raise exception 'R21f: el módulo pago anual dio % y tenía que dar 225000 (25.000 × 12 × 0,75: lleva el descuento del período).', v_m->>'modulo';
  end if;
  if (v_m->>'total')::numeric is distinct from 666000 then
    raise exception 'R21f: Pro + gomería paga anual dio % y tenía que dar 666000.', v_m->>'total';
  end if;

  -- El founding NO se le aplica al módulo: se negoció sobre el plan, antes
  -- de que el módulo existiera.
  update suscripciones set descuento_pct = 50 where lubricentro_id = v_lub;
  v_m := monto_de_renovacion(v_lub);
  if (v_m->>'plan')::numeric is distinct from 220500 then
    raise exception 'R21f: founding 50%% anual dio % de plan y tenía que dar 220500.', v_m->>'plan';
  end if;
  if (v_m->>'modulo')::numeric is distinct from 225000 then
    raise exception 'R21f EL FOUNDING SE LE APLICÓ AL MÓDULO: dio % y tenía que quedar en 225000. El 50%% se negoció sobre el PLAN, antes de que el módulo existiera.', v_m->>'modulo';
  end if;

  delete from cambios_override_plan where lubricentro_id = v_lub;
  delete from suscripciones where lubricentro_id = v_lub;
  delete from lubricentros where id = v_lub;
end $$;
-- <<< R21f

-- >>> R21g
do $$
declare v_hoy date := current_date;
begin
  -- ============================================================
  -- R21g · EL QUE NUNCA PAGÓ NO TIENE GRACIA (20260917140000)
  --
  -- La rama nueva está guardada por `p_nunca_pago`, y las CATORCE llamadas
  -- literales de R21a, R21b y R21c pasan cinco argumentos: para todas
  -- ellas el sexto es `false` y la rama queda inerte. O sea que se la
  -- podría haber puesto arriba de @activo, arriba de @exento o abajo de
  -- @borde y las diez roturas del reloj seguirían en verde.
  --
  -- Este bloque es la única red que tiene, y por eso repite con el
  -- argumento en TRUE los cuatro casos en los que la rama NO tiene que
  -- ganar, además del caso en que sí.
  -- ============================================================

  -- ---------- Lo que le gana a la rama nueva ----------
  -- El interruptor manual, primero que todo.
  if estado_cobranza(false, v_hoy - 99, v_hoy - 1, false, 0, true) is distinct from 'suspendido' then
    raise exception 'R21g: el interruptor manual dejó de ganarle a la rama del que nunca pagó.';
  end if;
  -- El exento: quien no paga nada tampoco "nunca pagó" en el sentido que
  -- importa. Si esta rama le ganara, un bonificado vería "te falta el
  -- primer pago" para siempre.
  if estado_cobranza(true, v_hoy - 99, v_hoy - 1, false, 100, true) is distinct from 'al_dia' then
    raise exception 'R21g UN BONIFICADO ENTRÓ AL CIRCUITO: la rama del que nunca pagó le ganó a la exención del 100%%. Nunca pagó porque no tiene nada que pagar.';
  end if;
  -- Afuera del reloj: los 16 tenants viejos no tienen cobranza_desde, y
  -- muchos de ellos tampoco tienen pagos registrados. Si la rama les
  -- ganara, el día del deploy les aparecería un aviso a todos.
  if estado_cobranza(true, v_hoy - 99, null, false, 0, true) is distinct from 'al_dia' then
    raise exception 'R21g LOS DE AFUERA DEL RELOJ ENTRARON: un tenant sin cobranza_desde y sin pagos dio distinto de al_dia. El día del deploy son 16.';
  end if;
  -- Y sin vencimiento no se le reclama a quien no sabemos qué debe.
  if estado_cobranza(true, null, v_hoy - 1, false, 0, true) is distinct from 'al_dia' then
    raise exception 'R21g: un tenant sin vencimiento y sin pagos entró al circuito.';
  end if;

  -- ---------- La escalera de dos escalones ----------
  -- EL DÍA DEL ALTA: vencimiento mañana, todavía en plazo.
  if estado_cobranza(true, v_hoy + 1, v_hoy, false, 0, true) is distinct from 'por_vencer' then
    raise exception 'R21g: el día del alta, con el vencimiento mañana, dio «%» en vez de por_vencer.',
      estado_cobranza(true, v_hoy + 1, v_hoy, false, 0, true);
  end if;

  -- EL DÍA DEL VENCIMIENTO: todavía NO se bloquea. Es el redondeo a favor
  -- del cliente (D2): un alta a las 23:50 tendría diez minutos si esto
  -- fuera `>=`.
  if estado_cobranza(true, v_hoy, v_hoy - 1, false, 0, true) is distinct from 'por_vencer' then
    raise exception 'R21g EL PLAZO SE CORTÓ A MEDIANOCHE: el DÍA del vencimiento ya dio «%». El bloqueo cae al día SIGUIENTE, nunca el mismo: con el vencimiento a un día del alta, un `>=` acá le da diez minutos a quien se dio de alta a las 23:50.',
      estado_cobranza(true, v_hoy, v_hoy - 1, false, 0, true);
  end if;

  -- AL DÍA SIGUIENTE: con el tercer interruptor APAGADO, avisa y no bloquea.
  if bloqueo_de_alta_activo() then
    raise exception 'R21g EL TERCER INTERRUPTOR ESTÁ PRENDIDO: bloqueo_de_alta_activo() dio true. Arranca APAGADO y se prende recién cuando entre un pago real con el monto correcto — el cálculo de plata nunca se verificó contra uno.';
  end if;
  if estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, true) is distinct from 'por_vencer' then
    raise exception 'R21g SE BLOQUEÓ CON EL INTERRUPTOR APAGADO: pasado el plazo dio «%» y tenía que quedarse avisando. El primer cliente que se bloquee podría ser uno bloqueado por un monto mal calculado, en su segundo día de uso.',
      estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, true);
  end if;

  -- Y NUNCA, EN NINGÚN CASO, PASA POR GRACIA. Se recorre la ventana entera
  -- día por día: del vencimiento hasta bastante después del borde de los
  -- siete días. La gracia es para el que YA es cliente y se atrasó.
  for i in 0..20 loop
    if estado_cobranza(true, v_hoy - i, v_hoy - i - 1, false, 0, true) = 'gracia' then
      raise exception 'R21g EL QUE NUNCA PAGÓ CAYÓ EN GRACIA (a % días del vencimiento). Su escalera es de DOS escalones y salta la ventana entera: la gracia de siete días está escrita para el mes trece de una relación, y le diría «te quedan 5 días» a alguien que es cliente hace 48 horas.', i;
    end if;
  end loop;
  -- Ni con el segundo interruptor prendido, que es el de la gracia.
  for i in 0..20 loop
    if estado_cobranza(true, v_hoy - i, v_hoy - i - 1, true, 0, true) = 'gracia' then
      raise exception 'R21g: con suspension_automatica prendida, el que nunca pagó cayó en gracia a los % días.', i;
    end if;
  end loop;

  -- ---------- Y con el tercer interruptor PRENDIDO ----------
  -- Se prende a mano acá adentro, como hace R21d con el candado del demo.
  create or replace function bloqueo_de_alta_activo()
  returns boolean language sql immutable parallel safe as $f$ select true; $f$;

  if estado_cobranza(true, v_hoy, v_hoy - 1, false, 0, true) is distinct from 'por_vencer' then
    raise exception 'R21g: con el interruptor prendido, el DÍA del vencimiento igual se bloqueó. El redondeo a favor del cliente no depende del interruptor.';
  end if;
  if estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, true) is distinct from 'suspendido' then
    raise exception 'R21g: con el interruptor prendido, pasado el plazo NO se bloqueó (dio «%»).',
      estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, true);
  end if;
  -- Y el que SÍ pagó sigue teniendo su gracia, con el interruptor prendido
  -- o apagado: los dos interruptores son independientes.
  if estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, false) is distinct from 'gracia' then
    raise exception 'R21g EL TERCER INTERRUPTOR SE COMIÓ LA GRACIA DE TODOS: un tenant CON pagos, vencido ayer, dio «%» en vez de gracia. El bloqueo del alta gobierna SOLO al que nunca pagó.',
      estado_cobranza(true, v_hoy - 1, v_hoy - 2, false, 0, false);
  end if;

  create or replace function bloqueo_de_alta_activo()
  returns boolean language sql immutable parallel safe as $f$ select false; $f$;
end $$;
-- <<< R21g

-- ============================================================
-- R22 · El cobro por Cresium (20260916180000)
--
-- Lo que esta red cubre es lo que el script de webhook NO puede cubrir:
-- los invariantes de la BASE, que tienen que seguir en pie aunque alguien
-- llame a la función desde otro lado o inserte a mano.
--
--   a · El cobro sin dueño. `pagos.registrado_por` es anulable ahora, y
--       el CHECK es lo que evita que eso sea un agujero: un pago MANUAL
--       sin autor no entra, y uno de Cresium sin id de transacción
--       tampoco. Sin el CHECK, el null se filtra al histórico y en seis
--       meses nadie distingue un cobro automático de uno que cargó
--       Santiago a mano.
--   b · La idempotencia, en la base y no en la ruta. Cresium reintenta
--       hasta cinco veces: el unique es lo único que impide que un
--       reintento le regale doce meses a alguien.
--   c · `PARTIAL` no mueve el vencimiento ni un día.
--   e · La referencia con sufijo de intento (`sub:hasta:2`) acredita a la
--       misma suscripción y hasta la misma fecha: el parser lee las dos
--       primeras partes e ignora el resto.
--   d · La evidencia se guarda SIEMPRE, incluso cuando no se acredita.
--   f · Y NO SE PUEDE BORRAR NI EDITAR (20260917110000). La tabla dice ser
--       append-only desde que nació y se vació en su primera semana: sin un
--       candado, la promesa vivía en un comentario. Se prueban los dos
--       caminos —el delete y el update del payload— y, sobre todo, que el
--       candado NO se coma las seis escrituras del webhook, que tocan solo
--       procesado_at y motivo.
--   g · Ni vaciar: el trigger por fila no se despierta con un `truncate`,
--       así que hace falta el de statement. Se prueba por catálogo y a lo
--       bruto.
-- ============================================================

-- >>> R22
do $$
declare
  v_lub uuid; v_sus uuid; v_plan uuid; v_super uuid;
  v_ext text; v_hasta date; v_venc date; v_r jsonb; v_n integer;
  v_evento uuid;
begin
  select id into v_plan from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;

  insert into lubricentros (nombre, slug) values ('Cresium R22', 'cresium-r22') returning id into v_lub;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual', 0, current_date + 3) returning id into v_sus;

  v_hasta := current_date + 33;
  v_ext   := cresium_external_id(v_sus, v_hasta);

  -- ---------- a · El CHECK que hace que el null no sea un agujero ----------
  begin
    insert into pagos (lubricentro_id, suscripcion_id, registrado_por, origen,
                       periodo_desde, periodo_hasta, monto, fecha_pago)
    values (v_lub, v_sus, null, 'manual', current_date, v_hasta, 1, current_date);
    raise exception 'R22a: entró un pago MANUAL sin autor. `registrado_por` se hizo anulable para el cobro por webhook, y el CHECK es lo único que evita que ese null se filtre a los pagos que carga una persona — con el null suelto, en seis meses nadie distingue un cobro automático de uno tipeado a mano.';
  exception
    when check_violation then null;
  end;

  begin
    insert into pagos (lubricentro_id, suscripcion_id, registrado_por, origen,
                       cresium_transaccion_id, periodo_desde, periodo_hasta, monto, fecha_pago)
    values (v_lub, v_sus, null, 'cresium', null, current_date, v_hasta, 1, current_date);
    raise exception 'R22a: entró un pago de Cresium SIN id de transacción. Ese id es toda la idempotencia: sin él, el reintento número dos acredita de nuevo.';
  exception
    when check_violation then null;
  end;

  -- ---------- b · La idempotencia ----------
  v_r := acreditar_deposito_cresium(jsonb_build_object(
    'type', 'DEPOSIT', 'retry', 1,
    'data', jsonb_build_object('id', 990001, 'paymentOrder', jsonb_build_object(
      'externalId', v_ext, 'status', 'PAID', 'amount', 49000, 'amountPaid', 49000))));

  if v_r->>'resultado' is distinct from 'acreditado' then
    raise exception 'R22b: un DEPOSIT en PAID no acreditó (%).', v_r;
  end if;

  select vencimiento into v_venc from suscripciones where id = v_sus;
  if v_venc is distinct from v_hasta then
    raise exception 'R22b: el vencimiento quedó en % y tenía que moverse a %.', v_venc, v_hasta;
  end if;

  -- Los cuatro reintentos que faltan.
  for v_n in 2..5 loop
    v_r := acreditar_deposito_cresium(jsonb_build_object(
      'type', 'DEPOSIT', 'retry', v_n,
      'data', jsonb_build_object('id', 990001, 'paymentOrder', jsonb_build_object(
        'externalId', v_ext, 'status', 'PAID', 'amount', 49000, 'amountPaid', 49000))));
    if v_r->>'resultado' is distinct from 'ya_acreditado' then
      raise exception 'R22b: el reintento % devolvió «%» en vez de ya_acreditado. Cresium reintenta CINCO veces: sin idempotencia, cada reintento le regala otro período al tenant.',
        v_n, v_r->>'resultado';
    end if;
  end loop;

  select count(*) into v_n from pagos where lubricentro_id = v_lub;
  if v_n <> 1 then
    raise exception 'R22b LA IDEMPOTENCIA SE CAYÓ: cinco entregas del MISMO depósito dejaron % pagos. Tiene que quedar uno.', v_n;
  end if;

  select vencimiento into v_venc from suscripciones where id = v_sus;
  if v_venc is distinct from v_hasta then
    raise exception 'R22b: los reintentos movieron el vencimiento a %. Tenía que quedar en %.', v_venc, v_hasta;
  end if;

  -- ---------- c · PARTIAL no activa nada ----------
  v_r := acreditar_deposito_cresium(jsonb_build_object(
    'type', 'DEPOSIT', 'retry', 1,
    'data', jsonb_build_object('id', 990002, 'paymentOrder', jsonb_build_object(
      'externalId', cresium_external_id(v_sus, current_date + 63),
      'status', 'PARTIAL', 'amount', 49000, 'amountPaid', 20000))));

  if v_r->>'resultado' is distinct from 'sin_acreditar' then
    raise exception 'R22c: un PARTIAL acreditó (%). Solo PAID extiende el vencimiento; el CVU sigue vivo para completar.', v_r;
  end if;
  if (v_r->>'falta')::numeric is distinct from 29000 then
    raise exception 'R22c: el PARTIAL informó que faltan % y faltan 29000. La pantalla muestra ese número.', v_r->>'falta';
  end if;

  select vencimiento into v_venc from suscripciones where id = v_sus;
  if v_venc is distinct from v_hasta then
    raise exception 'R22c EL PARTIAL MOVIÓ EL VENCIMIENTO: quedó en % y tenía que quedar en %.', v_venc, v_hasta;
  end if;

  -- ---------- e · La referencia con número de intento ----------
  -- `sub:hasta:2` es lo que manda la acción cuando la primera referencia
  -- ya existe en Cresium (lib/cresium/orden.ts): el externalId es único
  -- ALLÁ para siempre, también después de PAID o EXPIRED. El parser lee
  -- las DOS primeras partes y tiene que ignorar el sufijo. Si alguien lo
  -- "aprieta" para exigir exactamente dos, el segundo intento de cualquier
  -- tenant se cobra en Cresium y acá queda como «externalId no corresponde
  -- a ninguna suscripción»: la plata entró y el panel sigue vencido.
  -- Va con la forma real (data.transaction), que es la que manda un
  -- DEPOSIT de verdad.
  v_r := acreditar_deposito_cresium(jsonb_build_object(
    'type', 'DEPOSIT',
    'data', jsonb_build_object('transaction', jsonb_build_object(
      'id', 990003, 'paymentOrder', jsonb_build_object(
        'externalId', cresium_external_id(v_sus, current_date + 63) || ':2',
        'status', 'PAID', 'amount', 49000, 'amountPaid', 49000)))));

  if v_r->>'resultado' is distinct from 'acreditado' then
    raise exception 'R22e: un DEPOSIT con la referencia del SEGUNDO intento (sub:hasta:2) no acreditó (%). El sufijo del intento existe porque el externalId es único en Cresium para siempre; el parser tiene que leer las dos primeras partes e ignorar el resto.', v_r;
  end if;

  select vencimiento into v_venc from suscripciones where id = v_sus;
  if v_venc is distinct from current_date + 63 then
    raise exception 'R22e: el vencimiento quedó en % y tenía que moverse a % — el sufijo del intento no cambia hasta cuándo se acredita.', v_venc, current_date + 63;
  end if;

  -- ---------- d · La evidencia, incluso de lo que no acreditó ----------
  select count(*) into v_n from cresium_eventos where external_id like v_sus::text || ':%';
  if v_n <> 7 then
    raise exception 'R22d: se guardaron % eventos y tenían que ser 7 (cinco entregas del cobro + el PARTIAL + el segundo intento). La evidencia es append-only: guarda CADA entrega, no cada transacción — si no, no se puede saber si el cobro entró al primer intento o al quinto.', v_n;
  end if;
  if exists (select 1 from cresium_eventos where procesado_at is null and external_id like v_sus::text || ':%') then
    raise exception 'R22d: quedó un evento sin procesar_at. Todo evento que entra se resuelve: acreditado, reintento o el motivo por el que no.';
  end if;

  -- ---------- f · El candado: la evidencia no se borra ni se edita ----------
  --
  -- Se prueba ACÁ y no en un bloque aparte porque acá ya están las siete
  -- filas de evidencia reales, hechas por el camino de verdad. Borrar una
  -- fila inventada no prueba lo mismo.
  select id into v_evento from cresium_eventos
   where external_id like v_sus::text || ':%' order by recibido_at limit 1;

  begin
    delete from cresium_eventos where id = v_evento;
    raise exception 'R22f LA EVIDENCIA SE PUEDE BORRAR: un delete sobre cresium_eventos pasó. La tabla se diseñó append-only y ya se vació una vez, en su primera semana: del cobro de $390 del 16/09/2026 no quedó una fila, y ese borrado quemó el externalId (único en Cresium PARA SIEMPRE, también después de PAID). Sin candado no es evidencia: es un log.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_borra%' then raise; end if;
  end;

  -- Peor que el delete, porque la fila queda y sigue pareciendo evidencia:
  -- el conteo de R22d pasaría en verde con el payload en blanco.
  begin
    update cresium_eventos set payload = '{}'::jsonb where id = v_evento;
    raise exception 'R22f LA EVIDENCIA SE PUEDE EDITAR: se le cambió el payload a un evento. Una fila con el payload pisado sigue contando en R22d y ya no contesta «yo transferí». La inmutabilidad que cubre la existencia de la fila y no su contenido no es inmutabilidad.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  -- LAS SEIS COLUMNAS, UNA POR UNA Y NO DE MUESTRA. El candado es una lista
  -- de `is distinct from`, y una lista se acorta sin que nada se note:
  -- probando solo `payload` y `transaccion_id`, una versión con las otras
  -- cuatro afuera pasa en verde. Y `external_id` es justamente la
  -- referencia cuyo quemado es toda la historia de la regla 20.
  begin
    update cresium_eventos set transaccion_id = 1 where id = v_evento;
    raise exception 'R22f: se le cambió el id de transacción a un evento. Es la identidad de la entrega y la llave de la idempotencia.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  begin
    update cresium_eventos set external_id = 'otra:cosa' where id = v_evento;
    raise exception 'R22f: se le cambió el external_id a un evento. Es la referencia que ata la entrega a una suscripción y a un período, y la que Cresium reserva PARA SIEMPRE: una fila con la referencia pisada es evidencia que ya no contesta a quién se le acreditó.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  begin
    update cresium_eventos set tipo = 'OTRO' where id = v_evento;
    raise exception 'R22f: se le cambió el tipo a un evento.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  begin
    update cresium_eventos set intento = 5 where id = v_evento;
    raise exception 'R22f: se le cambió el número de intento a un evento. Es lo que contesta si el cobro entró al primer intento o al quinto, que es lo que se mira cuando algo salió mal.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  begin
    update cresium_eventos set recibido_at = now() - interval '1 year' where id = v_evento;
    raise exception 'R22f: se le cambió la hora de recepción a un evento. Es el «cuándo» de «qué nos mandaron y cuándo».';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_edita%' then raise; end if;
  end;

  -- Lo que el candado NO bloquea, y no tiene que bloquear: el DICTAMEN.
  -- El webhook escribe seis veces sobre esta tabla y las seis tocan solo
  -- procesado_at y motivo (cresium_reprocesar_evento toca motivo SOLO).
  -- Si esto empieza a fallar, el candado se comió el cobro: la ruta
  -- devuelve 500, Cresium reintenta cinco veces y el dueño ve una pantalla
  -- que sigue diciendo "esperando tu transferencia" con la plata adentro.
  begin
    update cresium_eventos set procesado_at = now(), motivo = 'regresión R22f' where id = v_evento;
    update cresium_eventos set motivo = motivo || ' · reprocesado' where id = v_evento;
  exception when others then
    raise exception 'R22f EL CANDADO SE COMIÓ EL COBRO: bloqueó un UPDATE de procesado_at/motivo (%), que es exactamente lo que el webhook escribe en sus seis escrituras. Tiene que mirar SOLO las columnas de evidencia.', sqlerrm;
  end;

  -- ---------- g · El candado: la evidencia no se vacía ----------
  --
  -- Un trigger `before delete ... for each row` NO se despierta con un
  -- truncate, y authenticated, service_role y postgres tienen los tres ese
  -- privilegio. Hace falta el de statement, y se prueba en dos pasos: el
  -- catálogo primero (atrapa un trigger borrado sin llegar a ejecutar nada)
  -- y recién después el truncate de verdad (atrapa una función vaciada).
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'cresium_eventos'::regclass
       and not tgisinternal
       and (tgtype & 32) = 32          -- 32 = TRUNCATE en pg_trigger.tgtype
  ) then
    raise exception 'R22g NO HAY CANDADO DE TRUNCATE: cresium_eventos no tiene un trigger `before truncate ... for each statement`. El de borrado por fila no se despierta con un truncate, así que la tabla entera se vacía en una línea y el candado de R22f no se entera.';
  end if;

  -- LOS TRES CANDADOS, `ALWAYS` Y NO `ORIGIN`. Es lo único que impide
  -- apagarlos a los tres juntos con `set session_replication_role =
  -- replica`, que en esta base `postgres` puede ejecutar — y `postgres` es
  -- exactamente el rol con el que corre un script de limpieza de pruebas,
  -- que es cómo se vació esta tabla la primera vez.
  --
  -- Va como chequeo de CATÁLOGO y no de comportamiento porque el estado de
  -- habilitación de un trigger no se puede observar desde adentro de este
  -- bloque sin cambiarlo: un `set session_replication_role` acá dejaría el
  -- resto del reset corriendo sin ningún trigger de la base.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'cresium_eventos'::regclass
     and not tgisinternal
     and tgenabled = 'A';             -- 'A' = ALWAYS · 'O' = ORIGIN (el default)
  if v_n <> 3 then
    raise exception 'R22g LOS CANDADOS TIENEN UNA PERILLA DE APAGADO AL LADO: % de 3 triggers de cresium_eventos están en ALWAYS. Los que quedaron en ORIGIN se apagan enteros con `set session_replication_role = replica`, y ahí el delete y el truncate vuelven a pasar. Es una línea `alter table cresium_eventos enable always trigger <nombre>` por candado.', v_n;
  end if;

  begin
    truncate cresium_eventos;
    raise exception 'R22g LA EVIDENCIA SE PUEDE VACIAR: un truncate sobre cresium_eventos pasó. Es el borrado de la primera semana otra vez, pero entero y en una línea.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%evidencia_no_se_vacia%' then raise; end if;
  end;

  -- ---------- La limpieza ----------
  --
  -- ⚠ LOS SIETE EVENTOS NO SE BORRAN, Y NO ES UN OLVIDO: con el candado
  -- puesto, el `delete from cresium_eventos` que había acá hacía fallar
  -- TODO `supabase db reset`. Quedan en la base del reset y está bien que
  -- queden — es lo que dice ser esta tabla. No ensucian a nadie: los dos
  -- conteos de R22d filtran por el uuid de suscripción, que es nuevo en
  -- cada reset.
  delete from pagos where lubricentro_id = v_lub;
  delete from suscripciones where lubricentro_id = v_lub;
  delete from lubricentros where id = v_lub;
end $$;
-- <<< R22

-- ============================================================
-- R23 · La pantalla de cobranzas de /fidelli (20260916220000)
--
--   a · Es SOLO del superadmin. La función es `security definer` porque
--       cruza `usuarios` y `contactos_fidelli` de todos los tenants, así
--       que el RLS no la protege: la guarda está adentro y tiene que
--       rechazar a un owner devolviendo CERO FILAS, no los datos de la
--       plataforma entera.
--   b · El monto sale de `monto_de_renovacion_en()`, la MISMA función que
--       usa la pantalla de pago del cliente. Si las dos pantallas dijeran
--       números distintos, la conversación por WhatsApp arrancaría con el
--       dueño y Santiago mirando cosas diferentes.
--   c · Quien no paga nada NO aparece: perseguir una cobranza de alguien
--       con el plan bonificado es trabajo inventado.
-- ============================================================

-- >>> R23
do $$
declare
  v_super uuid; v_owner uuid; v_plan uuid;
  v_lub uuid; v_lub2 uuid;
  v_n integer; v_monto numeric; v_esperado numeric;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;

  -- Uno que vence pronto y paga, y otro bonificado al 100.
  insert into lubricentros (nombre, slug) values ('Cobranza R23', 'cobranza-r23') returning id into v_lub;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual', 0, current_date - 27, current_date + 3);

  insert into lubricentros (nombre, slug) values ('Bonificado R23', 'bonificado-r23') returning id into v_lub2;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (v_lub2, v_plan, 'activa', 'mensual', 100, current_date - 27, current_date + 3);

  -- ---------- a · Un OWNER no ve nada ----------
  select u.id into v_owner from usuarios u where u.rol = 'owner' limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from cobranzas_pendientes(15);

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  if v_n <> 0 then
    raise exception 'R23a FUGA ENTRE TENANTS: un owner leyó % filas de cobranzas_pendientes(). La función es SECURITY DEFINER y cruza usuarios y contactos_fidelli de TODA la plataforma: si la guarda soy_superadmin() se cae, cualquier dueño de lubricentro ve el vencimiento, el monto y el teléfono de todos los demás.', v_n;
  end if;

  -- ---------- b y c · Como superadmin ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from cobranzas_pendientes(15) where lubricentro_id = v_lub;
  if v_n <> 1 then
    raise exception 'R23b: el tenant que vence en 3 días no aparece en la lista (% filas).', v_n;
  end if;

  select monto into v_monto from cobranzas_pendientes(15) where lubricentro_id = v_lub;
  v_esperado := (monto_de_renovacion_en(v_lub, 'mensual') ->> 'total')::numeric;
  if v_monto is distinct from v_esperado then
    raise exception 'R23b DOS CUENTAS PARA LA MISMA PLATA: la pantalla de cobranzas dice % y monto_de_renovacion_en() dice %. Tienen que salir de la MISMA función, o el mensaje de WhatsApp le cotiza al cliente un número distinto del que ve en su pantalla de pago.',
      v_monto, v_esperado;
  end if;

  select count(*) into v_n from cobranzas_pendientes(15) where lubricentro_id = v_lub2;
  if v_n <> 0 then
    raise exception 'R23c: un tenant con descuento_pct = 100 apareció en la lista de cobranzas. No paga nada: perseguirle una cobranza es trabajo inventado.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  delete from suscripciones where lubricentro_id in (v_lub, v_lub2);
  delete from lubricentros where id in (v_lub, v_lub2);
end $$;
-- <<< R23


-- ============================================================
-- R24 · La atención de /fidelli exime al 100% (20260917100000)
--
-- `estado_atencion()` decidía con dos datos —estado y vencimiento— y la
-- lista de "a quién llamar" le reclamaba a quien no debe nada. El caso que
-- lo disparó tenía fecha: el 20/09/2026 Brothers Oil aparecía como
-- `cobranza_por_vencer` y el 28/09 como `cobranza_vencida`, con el plan
-- bonificado al 100 y una deuda de cero pesos.
--
-- Este bloque es la red de la REGLA, no de la fila: prueba la función pura
-- con literales en las dos fechas del caso real y en los cuatro estados, y
-- después prueba que los dos llamadores —el listado y la ficha— la
-- consuman con el descuento puesto. Mover la fecha de un tenant lo saca de
-- la lista hasta diciembre; esto es lo que protege al próximo al 100%.
--
--   a · La función pura: el exento no tiene ninguno de los cuatro estados,
--       en ninguna fecha. Y el contracaso, que es lo que hace que el verde
--       signifique algo: el MISMO tenant con descuento 0 sí aparece, y un
--       descuento parcial (50) no exime.
--   b · listado_lubricentros(): el bonificado sale de la lista, del
--       contador del chip y del ORDER BY de una sola vez.
--   c · atencion_tenant(): la ficha dice lo mismo que el listado sobre el
--       mismo tenant. Que compartan la función es toda la razón por la que
--       no pueden contradecirse.
-- ============================================================

-- >>> R24
do $$
declare
  v_hoy   date := current_date;
  v_lub   uuid;
  v_sus   uuid;
  v_plan  uuid;
  v_super uuid;
  v_at    text;
  v_json  jsonb;
  v_n     integer;
begin
  -- ---------- a · La función, con literales ----------
  --
  -- Los cuatro estados que el exento NO puede tener, cada uno con la
  -- combinación que lo produciría si el descuento no se mirara.
  if estado_atencion('activa', v_hoy - 30, 100) is not null then
    raise exception 'R24a: un tenant al 100%% dio «%» estando vencido hace 30 días. Quien no paga nada no puede deber nada: queda fuera del circuito ENTERO, que es la regla 17 de CLAUDE.md y lo que estado_cobranza() ya hacía en su rama @exento.',
      estado_atencion('activa', v_hoy - 30, 100);
  end if;
  if estado_atencion('activa', v_hoy + 3, 100) is not null then
    raise exception 'R24a: un tenant al 100%% apareció como cobranza_por_vencer.';
  end if;
  if estado_atencion('trial', v_hoy - 1, 100) is not null then
    raise exception 'R24a LA EXENCIÓN SE QUEDÓ CORTA: un trial al 100%% dio «%». El exento no es una venta por cerrar tampoco: el precio ya es cero. Los CUATRO estados se apagan, no solo los dos de cobranza.',
      estado_atencion('trial', v_hoy - 1, 100);
  end if;
  if estado_atencion('trial', v_hoy + 3, 100) is not null then
    raise exception 'R24a: un trial al 100%% apareció como trial_por_vencer.';
  end if;

  -- LAS DOS FECHAS DEL CASO REAL, y por qué van relativas a hoy.
  --
  -- El caso es: vencimiento el 24/09/2026 y plan al 100%. El 20/09 faltaban
  -- 4 días (`cobranza_por_vencer`) y el 28/09 hacían 4 que había vencido
  -- (`cobranza_vencida`). Las fechas literales NO lo reproducen:
  -- `current_date` adentro de la función es el día real del reset, así que
  -- un 2026-09-24 escrito a mano deja de estar a 4 días apenas pasa el
  -- sábado, y a partir de ahí la prueba queda verde por la fecha y no por
  -- la regla. Lo que se conserva es la POSICIÓN relativa, que es lo único
  -- que el CASE mira.
  if estado_atencion('activa', v_hoy + 4, 100) is not null then
    raise exception 'R24a EL CASO BROTHERS OIL SIGUE VIVO: un tenant al 100%% que vence en 4 días dio «%». Es el 20/09/2026 del caso real, y es la fila que alguien iba a llamar para cobrarle cero pesos.',
      estado_atencion('activa', v_hoy + 4, 100);
  end if;
  if estado_atencion('activa', v_hoy - 4, 100) is not null then
    raise exception 'R24a EL CASO BROTHERS OIL SIGUE VIVO: un tenant al 100%% que venció hace 4 días dio «%». Es el 28/09/2026 del caso real.',
      estado_atencion('activa', v_hoy - 4, 100);
  end if;
  -- Y LAS MISMAS DOS POSICIONES SIN EL DESCUENTO, que es lo que convierte
  -- lo de arriba en una prueba: si la exención no estuviera, acá aparecen
  -- los dos estados del caso, con ese nombre.
  if estado_atencion('activa', v_hoy + 4, 0) is distinct from 'cobranza_por_vencer'
     or estado_atencion('activa', v_hoy - 4, 0) is distinct from 'cobranza_vencida' then
    raise exception 'R24a: las dos posiciones del caso —a 4 días y vencido hace 4— dejaron de dar cobranza_por_vencer y cobranza_vencida sin descuento. Sin este par, el chequeo de arriba pasaría en verde con una función que no reclama nunca.';
  end if;

  -- EL CONTRACASO. Sin esto el bloque pasaría en verde con una función que
  -- devuelve null siempre, que es la peor forma de "arreglar" esto: la
  -- lista de a quién llamar se vacía y nadie se entera.
  if estado_atencion('activa', v_hoy - 30, 0) is distinct from 'cobranza_vencida' then
    raise exception 'R24a LA LISTA SE VACIÓ: un tenant SIN descuento y vencido hace 30 días dio «%» en vez de cobranza_vencida. La exención se comió la pantalla que trae la plata.',
      estado_atencion('activa', v_hoy - 30, 0);
  end if;
  if estado_atencion('activa', v_hoy + 3, 0) is distinct from 'cobranza_por_vencer' then
    raise exception 'R24a: un tenant sin descuento que vence en 3 días dejó de aparecer como cobranza_por_vencer.';
  end if;
  if estado_atencion('trial', v_hoy - 1, 0) is distinct from 'trial_vencido' then
    raise exception 'R24a: un trial vencido ayer dejó de aparecer como trial_vencido.';
  end if;
  if estado_atencion('trial', v_hoy + 3, 0) is distinct from 'trial_por_vencer' then
    raise exception 'R24a: un trial que termina en 3 días dejó de aparecer como trial_por_vencer.';
  end if;

  -- El descuento PARCIAL no exime. El founding tiene 50 y paga la mitad:
  -- si el corte se aflojara, el reclamo desaparece para media cartera.
  if estado_atencion('activa', v_hoy - 30, 50) is distinct from 'cobranza_vencida' then
    raise exception 'R24a: un descuento parcial (50) está eximiendo de la lista de atención. Solo el 100 exime — el founding paga la mitad, no cero.';
  end if;

  -- Sin suscripción no hay descuento que mirar, y el coalesce del llamador
  -- manda un 0: no puede explotar ni eximir por null.
  if estado_atencion('activa', v_hoy - 30, null) is distinct from 'cobranza_vencida' then
    raise exception 'R24a: con descuento null la función dejó de reclamar. Un tenant sin suscripción entra por LEFT JOIN y trae null: el coalesce interno tiene que tratarlo como 0.';
  end if;

  -- ---------- b · El listado ----------
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;

  insert into lubricentros (nombre, slug) values ('Bonificado R24', 'bonificado-r24')
    returning id into v_lub;
  -- Vencido hace 30 días: sin la exención sería `cobranza_vencida`, el
  -- primer renglón de la lista. El `inicio` va explícito y anterior —hay un
  -- CHECK `vencimiento >= inicio` y el default de inicio es hoy.
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual', 100, v_hoy - 60, v_hoy - 30) returning id into v_sus;

  -- El listado es SECURITY INVOKER: sin impersonar al superadmin el RLS no
  -- devuelve la fila y el bloque pasaría en verde por la razón equivocada.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select atencion into v_at from listado_lubricentros() where id = v_lub;
  if v_at is not null then
    raise exception 'R24b: el bonificado aparece en el listado de /fidelli con atencion = «%». La columna alimenta el filtro "necesitan atención", el contador del chip y el ORDER BY: con esto puesto, alguien lo va a llamar para cobrarle cero pesos.', v_at;
  end if;

  select atencion_orden into v_n from listado_lubricentros() where id = v_lub;
  if v_n is distinct from 99 then
    raise exception 'R24b: el bonificado quedó con atencion_orden = % y tenía que ser 99 (el fondo de la lista). orden_atencion(null) es lo que lo manda abajo sin un CASE en el front.', v_n;
  end if;

  -- ---------- c · La ficha ----------
  v_json := atencion_tenant(v_lub);
  if v_json->>'atencion' is not null then
    raise exception 'R24c LA FICHA Y EL LISTADO SE CONTRADICEN: atencion_tenant() dice «%» para un tenant que el listado deja en null. Comparten estado_atencion() justamente para que eso no pueda pasar — si difieren, a uno de los dos le falta el descuento.', v_json->>'atencion';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  -- EL CONTRACASO, con el descuento bajado a cero sobre el MISMO tenant:
  -- los dos caminos tienen que volver a reclamar. Va para los DOS —el
  -- listado y la ficha— porque un contracaso que solo mira uno deja al otro
  -- libre de devolver null siempre, que es la forma silenciosa de romper
  -- esto: la pantalla no da error, deja de marcar.
  update suscripciones set descuento_pct = 0 where id = v_sus;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select atencion into v_at from listado_lubricentros() where id = v_lub;
  if v_at is distinct from 'cobranza_vencida' then
    raise exception 'R24b LA LISTA SE VACIÓ: el mismo tenant con descuento 0 y vencido hace 30 días dio «%» en vez de cobranza_vencida. Sin este contracaso, una función que devuelve null siempre pasaría en verde.', v_at;
  end if;

  v_json := atencion_tenant(v_lub);
  if v_json->>'atencion' is distinct from 'cobranza_vencida' then
    raise exception 'R24c LA FICHA DEJÓ DE MARCAR: atencion_tenant() dio «%» para un tenant con descuento 0 y vencido hace 30 días. El chequeo de arriba pasaría en verde con una ficha que no marca a nadie nunca — un subselect roto, un order by cambiado o un coalesce al revés se ven exactamente así.', v_json->>'atencion';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  delete from suscripciones where lubricentro_id = v_lub;
  delete from lubricentros where id = v_lub;
end $$;
-- <<< R24

-- R25 · El alias fijo por tenant (20260917120000)
--
-- El bloque tiene una particularidad y conviene decirla arriba: la mitad
-- de lo que vigila es que NADA PASE. Mientras Cresium no confirme el
-- formato, el largo y el tope de cambios, la única conducta correcta es
-- rechazar todo — y una conducta que consiste en no hacer nada es
-- exactamente la que se rompe sin que nadie se entere.
--
--   a · El interruptor está APAGADO y la puerta rechaza. Con un alias
--       perfectamente válido. Es el invariante del sprint.
--   b · Los 17 tenants (y el demo) siguen en null, y un tenant en null NO
--       es un estado roto: es "todavía no se le asignó". Con el
--       interruptor prendido a mano, la puerta escribe.
--   c · El alias es INMUTABLE. Escrito una vez, ni un UPDATE directo lo
--       mueve. Es la promesa entera: el dueño ya lo cargó en su banco.
--   d · La unicidad de nuestro lado, incluida la de mayúsculas, y que el
--       índice parcial deje convivir a los 17 nulls.
--   e · El formato y los dos largos, con su contracaso.
--   f · El alta puede traer el alias, y lo asigna por la MISMA puerta —o
--       sea que hoy, con el interruptor apagado, un alta con alias falla
--       entera en vez de dejar un tenant a medias.
-- ============================================================

-- >>> R25
do $$
declare
  v_plan  uuid;
  v_lub   uuid;
  v_lub2  uuid;
  v_lub3  uuid;
  v_super uuid;
  v_n     integer;
  v_alias text;
begin
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  insert into lubricentros (nombre, slug) values ('Alias R25', 'alias-r25')
    returning id into v_lub;

  -- ---------- a · El interruptor apagado ----------
  if alias_confirmado_por_cresium() then
    raise exception 'R25a EL INTERRUPTOR DEL ALIAS ESTÁ PRENDIDO: alias_confirmado_por_cresium() devolvió true. Arranca APAGADO y se prende recién cuando Cresium confirme el largo máximo, el formato exacto y el tope de cambios por CVU. Un alias asignado con el formato equivocado no se corrige barato: TOO_MANY_ALIAS_UPDATES es un tope y no sabemos cuál.';
  end if;

  begin
    perform fijar_alias_de_tenant(v_lub, 'fm.aliasr25');
    raise exception 'R25a SE ASIGNÓ UN ALIAS: la puerta escribió con el interruptor apagado. Mientras Cresium no conteste, ningún tenant recibe alias — ni siquiera uno con la forma correcta.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_sin_confirmar%' then raise; end if;
  end;

  if exists (select 1 from lubricentros where cresium_alias is not null) then
    raise exception 'R25a HAY ALIAS ASIGNADOS EN LA BASE. Tienen que ser CERO: el sprint entero se escribió para no asignar ninguno hasta que Cresium conteste.';
  end if;

  -- ---------- b · El null no es un estado roto ----------
  --
  -- A partir de acá el interruptor se prende A MANO para poder probar el
  -- camino de verdad. Es el mismo recurso que usa R21d con el candado del
  -- demo: se redefine la función adentro de la transacción del reset.
  create or replace function alias_confirmado_por_cresium()
  returns boolean language sql immutable parallel safe as $f$ select true; $f$;

  select fijar_alias_de_tenant(v_lub, 'fm.aliasr25') into v_alias;
  if v_alias is distinct from 'fm.aliasr25' then
    raise exception 'R25b: la puerta devolvió «%» en vez del alias asignado.', v_alias;
  end if;

  select cresium_alias into v_alias from lubricentros where id = v_lub;
  if v_alias is distinct from 'fm.aliasr25' then
    raise exception 'R25b: el alias no quedó escrito en la fila (quedó «%»).', v_alias;
  end if;

  if (select cresium_alias_asignado_at from lubricentros where id = v_lub) is null then
    raise exception 'R25b: se escribió el alias y no la fecha. El día que alguien pregunte desde cuándo tiene ese alias, la fila tiene que contestarlo — y es lo único con lo que vamos a poder contar los cambios contra el tope de Cresium.';
  end if;

  -- ---------- c · Inmutable ----------
  begin
    update lubricentros set cresium_alias = 'fm.otroalias' where id = v_lub;
    raise exception 'R25c EL ALIAS SE PUDO CAMBIAR: un UPDATE directo lo movió. Es el alias que el dueño YA dejó cargado en su home banking para la transferencia programada; cambiarlo rompe exactamente lo que el alias fijo vino a habilitar, y además gasta uno de los cambios que Cresium permite por CVU.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_inmutable%' then raise; end if;
  end;

  begin
    perform fijar_alias_de_tenant(v_lub, 'fm.otroalias');
    raise exception 'R25c: la puerta reasignó el alias de un tenant que ya tenía.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_ya_asignado%' then raise; end if;
  end;

  -- Lo que el candado NO tiene que bloquear: cualquier otro UPDATE sobre
  -- la fila. Si esto empieza a fallar, el candado se comió el ABM entero
  -- de /fidelli — editar el nombre de un tenant con alias dejaría de andar.
  begin
    update lubricentros set nombre = 'Alias R25 editado' where id = v_lub;
  exception when others then
    raise exception 'R25c EL CANDADO SE COMIÓ EL ABM: bloqueó un UPDATE que no toca el alias (%). Tiene que mirar SOLO cresium_alias.', sqlerrm;
  end;

  -- ---------- d · La unicidad, y el índice parcial ----------
  insert into lubricentros (nombre, slug) values ('Alias R25 dos', 'alias-r25-dos')
    returning id into v_lub2;

  begin
    perform fijar_alias_de_tenant(v_lub2, 'fm.aliasr25');
    raise exception 'R25d: dos tenants se quedaron con el mismo alias. Un alias repetido es la plata de un lubricentro entrando al CVU de otro.';
  exception
    when unique_violation then null;
  end;

  -- Y la de mayúsculas: para un banco, dos alias que difieren solo en el
  -- case son EL MISMO alias. Por eso el índice va sobre lower().
  begin
    perform fijar_alias_de_tenant(v_lub2, 'FM.ALIASR25');
    raise exception 'R25d: entró un alias que difiere del de otro tenant SOLO en mayúsculas. Para el banco es el mismo alias.';
  exception
    when unique_violation then null;
  end;

  -- Varios tenants sin alias conviven. Esto lo garantiza Postgres solo
  -- —dos NULL nunca colisionan en un unique— y NO el `where` del índice, que
  -- está por tamaño y no por corrección. Se afirma igual porque es la
  -- condición de todos los días mientras Cresium no conteste: los 17 en null.
  select count(*) into v_n from lubricentros where cresium_alias is null;
  if v_n < 2 then
    raise exception 'R25d: hay % tenants sin alias y tendría que haber al menos dos. Mientras Cresium no confirme el formato, TODOS están en null: si dos nulls no pueden convivir, no se puede dar de alta a nadie.', v_n;
  end if;

  -- ⚠ Y AHORA CONTRA EL ÍNDICE, NO CONTRA LA PUERTA. Las dos pruebas de
  -- arriba pasan por `fijar_alias_de_tenant()`, así que lo que demuestran
  -- es que la puerta valida — no que el índice exista. Un UPDATE directo no
  -- pasa por la puerta, y ahí el índice es la única defensa que queda. Un
  -- alias repetido es la plata de un lubricentro entrando al CVU de otro.
  --
  -- Va en minúsculas a propósito: el CHECK `alias_formato` rechaza las
  -- mayúsculas antes de que el índice llegue a opinar, así que un duplicado
  -- en mayúsculas probaría el CHECK y no el índice. (El `lower()` del
  -- índice es seguro para el día que Cresium conteste que sí acepta
  -- mayúsculas y el formato se abra: ahí pasa a hacer trabajo. Hoy no se
  -- puede probar, y por eso no tiene rotura.)
  insert into lubricentros (nombre, slug) values ('Alias R25 tres', 'alias-r25-tres')
    returning id into v_lub3;
  begin
    update lubricentros set cresium_alias = 'fm.aliasr25' where id = v_lub3;
    raise exception 'R25d NO HAY ÍNDICE ÚNICO: entró por UPDATE directo un alias que otro tenant ya tiene. La puerta no es suficiente — lo que no pasa por la puerta solo lo frena el índice.';
  exception
    when unique_violation then null;
  end;

  -- ---------- e · El formato y los largos ----------
  if not alias_formato_valido('fm.taller') then
    raise exception 'R25e: se rechazó un alias con la forma que Cresium ya aceptó en producción (minúsculas, dígitos y puntos simples). Es la única forma MEDIDA que tenemos.';
  end if;
  if alias_formato_valido('FM.taller')  then raise exception 'R25e: entró un alias con mayúsculas, que no está medido contra Cresium.'; end if;
  if alias_formato_valido('fm-taller')  then raise exception 'R25e: entró un alias con guiones, que no está medido contra Cresium.'; end if;
  if alias_formato_valido('fm..taller') then raise exception 'R25e: entró un alias con dos puntos seguidos.'; end if;
  if alias_formato_valido('.fmtaller')  then raise exception 'R25e: entró un alias que empieza con punto.'; end if;
  if alias_formato_valido('fmtaller.')  then raise exception 'R25e: entró un alias que termina en punto.'; end if;

  begin
    perform fijar_alias_de_tenant(v_lub2, 'fm.x');   -- 4 caracteres
    -- ⚠ EL MENSAJE NO PUEDE NOMBRAR `alias_largo`, y no es cosmético: el
    -- handler de abajo filtra por esa misma palabra, así que un mensaje que
    -- la contenga se traga a sí mismo y el bloque pasa en verde con la
    -- rotura puesta. Se vio exactamente así, con el mínimo bajado a 1.
    raise exception 'R25e SE ACEPTÓ UN ALIAS DEMASIADO CORTO: entró uno de 4 caracteres. El piso del estándar argentino de alias CBU/CVU es 6, y uno más corto lo rechaza el banco cuando el dueño lo tipea.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_largo%' then raise; end if;
  end;

  begin
    perform fijar_alias_de_tenant(v_lub2, 'fm.aliasdemasiadolargoparaelbanco');
    raise exception 'R25e SE ACEPTÓ UN ALIAS DEMASIADO LARGO: entró uno de 32 caracteres. El estándar argentino de alias CBU/CVU topa en 20 y el banco del dueño lo va a rechazar cuando lo tipee. (El mensaje no nombra la excepción a propósito: el handler filtra por esa palabra.)';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_largo%' then raise; end if;
  end;

  -- El contracaso de los dos largos: uno que SÍ entra.
  select fijar_alias_de_tenant(v_lub2, 'fm.segundo') into v_alias;
  if v_alias is distinct from 'fm.segundo' then
    raise exception 'R25e: un alias de largo válido no entró (dio «%»).', v_alias;
  end if;

  -- ---------- f · El alta ----------
  --
  -- Con el interruptor PRENDIDO el alta puede traerlo; con el apagado la
  -- transacción del alta falla entera, que es lo correcto: un tenant a
  -- medias es peor que un alta rechazada.
  perform crear_lubricentro(
    'Alta con alias R25', 'alta-alias-r25',
    '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0, 'fm.altar25');

  if (select cresium_alias from lubricentros where slug = 'alta-alias-r25') is distinct from 'fm.altar25' then
    raise exception 'R25f: el alta no guardó el alias que le pasaron.';
  end if;

  -- Y con el interruptor apagado, el alta entera se cae.
  create or replace function alias_confirmado_por_cresium()
  returns boolean language sql immutable parallel safe as $f$ select false; $f$;

  begin
    perform crear_lubricentro(
      'Alta sin confirmar R25', 'alta-sin-confirmar-r25',
      '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0, 'fm.nodebe');
    raise exception 'R25f: un alta CON alias pasó con el interruptor apagado.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%alias_sin_confirmar%' then raise; end if;
  end;

  if exists (select 1 from lubricentros where slug = 'alta-sin-confirmar-r25') then
    raise exception 'R25f EL ALTA QUEDÓ A MEDIAS: el alias falló y el tenant se creó igual. Tiene que abortar la transacción entera — un lubricentro sin suscripción ni templates es peor que un alta rechazada.';
  end if;

  -- Y un alta SIN alias sigue andando con el interruptor apagado, que es
  -- el caso de todos los días mientras Cresium no conteste.
  perform crear_lubricentro(
    'Alta sin alias R25', 'alta-sin-alias-r25',
    '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0);

  if (select cresium_alias from lubricentros where slug = 'alta-sin-alias-r25') is not null then
    raise exception 'R25f: un alta sin alias le inventó uno. El null es la respuesta «todavía no se le asignó», y es lo que lo deja cobrando por el alias de cada orden.';
  end if;

  -- ---------- La limpieza ----------
  perform set_config('request.jwt.claims', null, true);

  delete from sucursales  where lubricentro_id in (
    select id from lubricentros where slug in ('alta-alias-r25', 'alta-sin-alias-r25'));
  delete from mensaje_templates where lubricentro_id in (
    select id from lubricentros where slug in ('alta-alias-r25', 'alta-sin-alias-r25'));
  delete from config_experiencia where lubricentro_id in (
    select id from lubricentros where slug in ('alta-alias-r25', 'alta-sin-alias-r25'));
  delete from suscripciones where lubricentro_id in (
    select id from lubricentros where slug in ('alta-alias-r25', 'alta-sin-alias-r25'));
  delete from lubricentros where slug in ('alta-alias-r25', 'alta-sin-alias-r25');
  delete from lubricentros where id in (v_lub, v_lub2, v_lub3);
end $$;
-- <<< R25


-- ============================================================
-- R26 · El alta prende el reloj, y el primer pago define el ciclo
--       (20260917130000 · 20260917140000 · 20260917150000)
--
--   a · El alta escribe `cobranza_desde` y nace PAGANDO, con el
--       vencimiento al día siguiente. Y los que ya estaban NO se tocan:
--       es la garantía de que el rollout no es un script peligroso.
--   b · El primer pago que llega TARDE corre el ciclo entero a la fecha
--       del pago, con el largo contratado. El que llega en plazo, no — y
--       una renovación, tampoco.
--   c · Las dos puertas del cobro hacen lo mismo. Si solo cambiara el
--       webhook, el cobro manual —que es el que va a usar Santiago en las
--       primeras altas— dejaría el ciclo corrido.
--   d · La cuarta pantalla del onboarding: `pago_presentado_at` arranca en
--       null, la función lo escribe una sola vez y es definer.
-- ============================================================

-- >>> R26
do $$
declare
  v_hoy   date := current_date;
  v_plan  uuid;
  v_super uuid;
  v_lub   uuid;
  v_otro  uuid;
  v_pago  uuid;
  v_sus   uuid;
  v_desde date;
  v_venc  date;
  v_ini   date;
  v_n     integer;
  v_c     record;
begin
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;

  -- ---------- a · El alta ----------
  --
  -- UN TENANT "VIEJO": de los 16 que están afuera del reloj y tienen que
  -- seguir afuera. Sin esta fila, la afirmación de más abajo —"no se le
  -- prendió a nadie más"— pasaría en verde por casualidad, porque en la
  -- base local del reset no hay ningún otro tenant al que prendérselo.
  insert into lubricentros (nombre, slug) values ('Viejo R26', 'viejo-r26')
    returning id into v_otro;

  -- Antes de dar de alta a nadie: cuántos están HOY adentro del reloj. Es
  -- el número que no tiene que moverse.
  select count(*) into v_n from lubricentros where cobranza_desde is not null;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  select crear_lubricentro('Alta R26', 'alta-r26',
    '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0) into v_lub;

  select cobranza_desde into v_desde from lubricentros where id = v_lub;
  if v_desde is distinct from v_hoy then
    raise exception 'R26a EL ALTA NO PRENDIÓ EL RELOJ: cobranza_desde quedó en «%». Es TODO el bloque: si el alta no lo escribe, prenderlo vuelve a ser un UPDATE a mano contra producción con un `where`, con 16 tenants sin proteger.', v_desde;
  end if;

  select id, inicio, vencimiento into v_sus, v_ini, v_venc
  from suscripciones where lubricentro_id = v_lub;

  if v_venc is distinct from v_hoy + 1 then
    raise exception 'R26a: el alta dejó el vencimiento en % y tenía que ser mañana (%).', v_venc, v_hoy + 1;
  end if;
  if (select estado from suscripciones where id = v_sus) is distinct from 'activa' then
    raise exception 'R26a NACIÓ EN TRIAL: la suscripción del alta quedó en «%». El tenant nuevo nace PAGANDO — si nace en trial, el copy le habla con la voz de la prueba y el reloj no tiene nada que reclamar.',
      (select estado from suscripciones where id = v_sus);
  end if;

  -- Y LOS QUE YA ESTABAN NO SE MOVIERON. Es la mitad que se olvida: el
  -- valor del cambio no es solo que los nuevos entren, es que los viejos
  -- NO. Se cuenta contra el número de arriba, +1 por el que se acaba de
  -- crear.
  if (select count(*) from lubricentros where cobranza_desde is not null) <> v_n + 1 then
    raise exception 'R26a SE LE PRENDIÓ EL RELOJ A ALGUIEN MÁS: había % tenants adentro y ahora hay %. El alta prende el reloj del que se da de alta y de nadie más — los 16 viejos se prenden de a uno, a mano, cuando Santiago quiera.',
      v_n, (select count(*) from lubricentros where cobranza_desde is not null);
  end if;
  if (select cobranza_desde from lubricentros where id = v_otro) is not null then
    raise exception 'R26a EL TENANT VIEJO ENTRÓ AL RELOJ: dar de alta a uno nuevo le prendió el reloj a otro que estaba afuera. Es exactamente el UPDATE peligroso que este bloque vino a hacer innecesario, escrito adentro del alta.';
  end if;

  -- El tenant recién nacido, mirado por el reloj: en plazo y sin pagos.
  if estado_cobranza(true, v_venc, v_desde, false, 0, true) is distinct from 'por_vencer' then
    raise exception 'R26a: el tenant recién dado de alta no dio por_vencer.';
  end if;

  -- ---------- b · El primer pago que llega tarde ----------
  --
  -- El caso del brief: se da de alta el día 1, el vencimiento es el 2, y
  -- transfiere el 6. Sin esto pierde cuatro días de su primer mes.
  select * into v_c from ciclo_tras_el_pago(
    true,                    -- es el primero
    v_hoy,                   -- inicio: el día del alta
    v_hoy + 1,               -- vencimiento: mañana
    v_hoy + 5,               -- paga cinco días después
    v_hoy + 31,              -- el `hasta` que quedó congelado en la orden
    interval '1 month');
  if v_c.inicio is distinct from v_hoy + 5 then
    raise exception 'R26b: el primer pago no movió `inicio` a la fecha del pago (quedó en %).', v_c.inicio;
  end if;
  if v_c.vencimiento is distinct from (v_hoy + 5 + interval '1 month')::date then
    raise exception 'R26b EL TENANT PERDIÓ LOS DÍAS QUE TARDÓ: pagó el día 6 un mes y el vencimiento quedó en % en vez de %. Un tenant que tarda cinco días en terminar el onboarding no puede perder cinco días de su primer mes.',
      v_c.vencimiento, (v_hoy + 5 + interval '1 month')::date;
  end if;

  -- EL PRIMERO PERO EN PLAZO: no se toca nada. Si el dueño transfiere
  -- dentro del plazo no pierde un solo día, y el comportamiento de siempre
  -- ya es el correcto.
  select * into v_c from ciclo_tras_el_pago(
    true, v_hoy, v_hoy + 5, v_hoy, v_hoy + 35, interval '1 month');
  if v_c.inicio is distinct from v_hoy or v_c.vencimiento is distinct from v_hoy + 35 then
    raise exception 'R26b SE LE RECORTÓ EL CICLO A ALGUIEN QUE PAGÓ EN PLAZO: quedó % → %. La regla es "el primero Y tarde", no "el primero" a secas — sin la segunda mitad, un cliente viejo del que nunca registramos un pago pierde días en su próxima renovación.',
      v_c.inicio, v_c.vencimiento;
  end if;

  -- Y UNA RENOVACIÓN, aunque llegue tarde, extiende desde el vencimiento
  -- vigente: pagar tres días antes no puede regalar tres días menos.
  select * into v_c from ciclo_tras_el_pago(
    false, v_hoy - 300, v_hoy - 5, v_hoy, v_hoy + 25, interval '1 month');
  if v_c.inicio is distinct from v_hoy - 300 then
    raise exception 'R26b: una renovación movió `inicio`. Solo lo mueve el primer pago.';
  end if;
  if v_c.vencimiento is distinct from v_hoy + 25 then
    raise exception 'R26b: una renovación dejó el vencimiento en % en vez de %.', v_c.vencimiento, v_hoy + 25;
  end if;

  -- ---------- c · Las dos puertas ----------
  --
  -- El cobro manual, que es el que va a usar Santiago durante las primeras
  -- altas. Se le cobra al tenant del alta, tarde.
  perform registrar_pago(v_lub, v_hoy + 5, v_hoy + 35, 49000, v_hoy + 5);

  select inicio, vencimiento into v_ini, v_venc from suscripciones where id = v_sus;
  if v_ini is distinct from v_hoy + 5 then
    raise exception 'R26c LA PUERTA MANUAL NO CORRE EL CICLO: `inicio` quedó en %. Es la puerta que más se va a usar en las primeras altas, según la decisión de cobrar a mano hasta verificar el monto.', v_ini;
  end if;
  if v_venc is distinct from v_hoy + 35 then
    raise exception 'R26c: la puerta manual dejó el vencimiento en % y tenía que ser % (el pago + los 30 días que se tipearon).', v_venc, v_hoy + 35;
  end if;

  -- Y el SEGUNDO pago del mismo tenant ya no corre nada: extiende.
  perform registrar_pago(v_lub, v_hoy + 35, v_hoy + 65, 49000, v_hoy + 20);
  select inicio, vencimiento into v_ini, v_venc from suscripciones where id = v_sus;
  if v_ini is distinct from v_hoy + 5 then
    raise exception 'R26c EL SEGUNDO PAGO VOLVIÓ A MOVER `inicio` (a %). Solo lo mueve el PRIMERO: `inicio` es por lo que todo el repo ordena para saber cuál es la suscripción vigente.', v_ini;
  end if;
  if v_venc is distinct from v_hoy + 65 then
    raise exception 'R26c: el segundo pago dejó el vencimiento en % en vez de %.', v_venc, v_hoy + 65;
  end if;

  -- Y ahora que tiene pagos, el reloj le habla con la voz de siempre.
  if estado_cobranza(true, v_hoy - 1, v_hoy - 30, false, 0,
                     not exists (select 1 from pagos p where p.lubricentro_id = v_lub))
     is distinct from 'gracia' then
    raise exception 'R26c: un tenant que YA pagó no entró en gracia al vencerse.';
  end if;

  -- ---------- d · La cuarta pantalla ----------
  insert into lubricentros (nombre, slug) values ('Pago R26', 'pago-r26') returning id into v_pago;

  if (select pago_presentado_at from lubricentros where id = v_pago) is not null then
    raise exception 'R26d: un tenant nuevo nació con pago_presentado_at escrito. Null es "todavía no vio la pantalla de pago", y es lo que hace que la vea.';
  end if;

  if not exists (
    select 1 from pg_proc where proname = 'marcar_pago_presentado' and prosecdef
  ) then
    raise exception 'R26d: marcar_pago_presentado() no es SECURITY DEFINER. El owner no puede tocar `lubricentros` por RLS, así que sin definer la marca nunca se escribe — y el dueño vuelve a ver la pantalla de pago cada vez que entre, para siempre.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  delete from pagos where lubricentro_id = v_lub;
  delete from sucursales where lubricentro_id = v_lub;
  delete from mensaje_templates where lubricentro_id = v_lub;
  delete from config_experiencia where lubricentro_id = v_lub;
  delete from suscripciones where lubricentro_id = v_lub;
  delete from lubricentros where id in (v_lub, v_otro, v_pago);
end $$;
-- <<< R26
