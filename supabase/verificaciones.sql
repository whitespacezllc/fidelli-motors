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
  v_pd    date;
  v_ph    date;
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
  -- La ventana TIPEADA arranca en el vencimiento viejo (hoy + 1), que es lo
  -- que una persona tipea naturalmente —"desde que venció"—, y el pago cae
  -- cuatro días después. Que difieran es lo que hace que la afirmación de
  -- abajo sobre `pagos` pruebe algo: si la ventana tipeada coincidiera con
  -- la calculada, un pago que guardara la tipeada pasaría en verde.
  perform registrar_pago(v_lub, v_hoy + 1, v_hoy + 31, 49000, v_hoy + 5);

  select inicio, vencimiento into v_ini, v_venc from suscripciones where id = v_sus;
  if v_ini is distinct from v_hoy + 5 then
    raise exception 'R26c LA PUERTA MANUAL NO CORRE EL CICLO: `inicio` quedó en %. Es la puerta que más se va a usar en las primeras altas, según la decisión de cobrar a mano hasta verificar el monto.', v_ini;
  end if;
  if v_venc is distinct from v_hoy + 35 then
    raise exception 'R26c: la puerta manual dejó el vencimiento en % y tenía que ser % (el pago + los 30 días que se tipearon).', v_venc, v_hoy + 35;
  end if;

  -- Y EL PAGO REGISTRA EL PERÍODO QUE CUBRE DE VERDAD, no el tipeado. Es el
  -- invariante `vencimiento = max(pagos.periodo_hasta)` que la auditoría de
  -- producción del 15/09 encontró intacto en las 15 filas con pagos: un
  -- ciclo corrido con el pago escrito con la ventana vieja lo rompe, y la
  -- próxima auditoría lo lee como data sucia.
  select periodo_desde, periodo_hasta into v_pd, v_ph
    from pagos where lubricentro_id = v_lub order by created_at desc limit 1;
  if v_pd is distinct from v_hoy + 5 or v_ph is distinct from v_hoy + 35 then
    raise exception 'R26c EL PAGO GUARDÓ LA VENTANA TIPEADA (% → %) y el ciclo se corrió a % → %. `vencimiento` dejó de coincidir con max(pagos.periodo_hasta): es el invariante que la auditoría de producción mira, y acá se acaba de romper.',
      v_pd, v_ph, v_ini, v_venc;
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

  -- LOS QUE YA ESTABAN NO VEN LA PANTALLA. Ninguna cuenta con el onboarding
  -- completo puede quedar con `pago_presentado_at` en null: los 17 tenants
  -- de producción los marcó el backfill de la migración, y al demo lo marca
  -- el seed (que corre después de la migración y lo crea de cero). Mismo
  -- criterio que R14 con `onboarding_completado_at`: un cliente que paga
  -- hace meses no puede entrar a /panel/onboarding y leer "te falta el
  -- primer pago". Acá se afirma el invariante sobre los datos del reset; el
  -- backfill sobre los 17 reales se verifica contra prod después del push.
  select count(*) into v_n from lubricentros
   where onboarding_completado_at is not null and pago_presentado_at is null;
  if v_n <> 0 then
    raise exception 'R26d HAY % CUENTA(S) CON EL ONBOARDING COMPLETO Y EL PAGO SIN PRESENTAR. Si es el demo, al seed le falta la marca; si es un tenant de prueba de otro bloque, ese bloque completó un onboarding sin marcar el pago. En producción esto es un cliente de meses leyendo "te falta el primer pago".', v_n;
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

-- ============================================================
-- R27 · Las páginas legales y la aceptación de los Términos
--       (20260922100000 · 20260922110000)
--
--   a · Los cuatro slugs de las páginas legales —terminos, privacidad,
--       legal, condiciones— están reservados: lo dice slug_reservado() Y
--       lo hace cumplir el CHECK de lubricentros.
--   b · aceptaciones_terminos es evidencia: los tres candados existen,
--       están en ALWAYS, y un delete, un update y un truncate se rechazan.
--   c · La única puerta: aceptar_terminos() escribe el tenant y el usuario
--       DE LA SESIÓN, es idempotente por versión, guarda el historial (la
--       fila de 1.0 sigue después de aceptar 1.1) y un superadmin no acepta.
--   d · El predicado: false sin aceptación, true tras aceptar ESA versión,
--       false para otra versión (subir VERSION_LEGAL vuelve a pedirla), y
--       el demo exento por slug. El campo calculado devuelve las versiones.
--   e · El aislamiento: un owner lee CERO filas de otro tenant, y el campo
--       calculado con un composite forjado (regla 18, con
--       jsonb_populate_record y no con un join) devuelve vacío.
--
-- ⚠ Las escrituras corren en una subtransacción que se deshace a
-- propósito al final: las aceptaciones de prueba no se pueden borrar
-- —son evidencia, el candado lo impide— y no tienen por qué quedar.
-- ============================================================

-- >>> R27
do $$
declare
  v_slug     text;
  v_lub      uuid;
  v_uid      uuid := gen_random_uuid();
  v_demo     uuid;
  v_demo_own uuid;
  v_super    uuid;
  v_n        integer;
  v_vers     text[];
begin
  select id into v_demo from lubricentros where slug = 'demo';
  select u.id into v_demo_own from usuarios u
   where u.lubricentro_id = v_demo and u.rol = 'owner' limit 1;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  if v_demo is null or v_demo_own is null or v_super is null then
    raise exception 'R27 SIN PISO: falta el demo, su owner o el superadmin del seed (ver supabase/seed.sql).';
  end if;

  -- ---------- a · Los slugs ----------
  foreach v_slug in array array['terminos', 'privacidad', 'legal', 'condiciones'] loop
    if not slug_reservado(v_slug) then
      raise exception 'R27a EL SLUG «%» NO ESTÁ RESERVADO: un lubricentro podría registrarlo y pisar una página legal de la superficie comercial. Toda ruta nueva de nivel superior se agrega a slug_reservado() en el mismo PR que la crea (migración 20260922100000).', v_slug;
    end if;

    begin
      insert into lubricentros (nombre, slug) values ('Slug R27', v_slug);
      raise exception 'R27a: la constraint slug_no_reservado dejó entrar el slug «%». slug_reservado() lo reserva pero el CHECK de lubricentros no lo está usando.', v_slug;
    exception
      when check_violation then null; -- exactamente lo esperado
    end;
  end loop;

  -- ---------- El piso: un tenant nuevo con su owner ----------
  -- No es el demo (está exento) y no es el de otro bloque: se crea acá y
  -- se borra al final. El owner entra por auth.users como en el seed, así
  -- el trigger handle_new_user() le crea la fila de usuarios.
  insert into lubricentros (nombre, slug) values ('Legal R27', 'legal-r27')
    returning id into v_lub;

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000',
    'r27@fidellimotors.app', extensions.crypt('r27', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Owner R27', 'lubricentro_id', v_lub),
    '', '', '', ''
  );

  if not exists (
    select 1 from usuarios where id = v_uid and lubricentro_id = v_lub and rol = 'owner'
  ) then
    raise exception 'R27 SIN PISO: el trigger de auth no creó el owner de prueba.';
  end if;

  -- ---------- b · Los candados, en el catálogo ----------
  select count(*) into v_n from pg_trigger
   where tgrelid = 'aceptaciones_terminos'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception 'R27b FALTAN CANDADOS: aceptaciones_terminos tiene % trigger(s) y necesita 3 (borrado, edición, truncate). Sin los tres no es evidencia: es un log.', v_n;
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'aceptaciones_terminos'::regclass
       and not tgisinternal
       and (tgtype & 32) = 32          -- 32 = TRUNCATE en pg_trigger.tgtype
  ) then
    raise exception 'R27b NO HAY CANDADO DE TRUNCATE: el de borrado por fila no se despierta con un truncate, y la tabla entera se vacía en una línea.';
  end if;

  select count(*) into v_n from pg_trigger
   where tgrelid = 'aceptaciones_terminos'::regclass
     and not tgisinternal
     and tgenabled = 'A';             -- 'A' = ALWAYS · 'O' = ORIGIN (el default)
  if v_n <> 3 then
    raise exception 'R27b LOS CANDADOS TIENEN UNA PERILLA DE APAGADO AL LADO: % de 3 triggers de aceptaciones_terminos están en ALWAYS. Los que quedaron en ORIGIN se apagan enteros con `set session_replication_role = replica`. Es una línea `alter table aceptaciones_terminos enable always trigger <nombre>` por candado.', v_n;
  end if;

  -- ---------- c · d · e · Las escrituras, que se deshacen al final ----------
  begin
    -- Sin aceptar nada: pendiente.
    if acepto_terminos_vigentes(v_lub, '1.0') then
      raise exception 'R27d: un tenant nuevo, sin ninguna aceptación, da por aceptada la versión 1.0. El gate no le pediría nada a nadie.';
    end if;

    -- Como el owner del tenant nuevo.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select aceptaciones_legales(l) into v_vers from lubricentros l where l.id = v_lub;
    if v_vers is distinct from '{}'::text[] then
      raise exception 'R27d: el campo calculado de un tenant sin aceptaciones devolvió % (esperaba vacío).', v_vers;
    end if;

    perform aceptar_terminos('1.0');
    perform aceptar_terminos('1.0'); -- el doble toque: idempotente

    if not acepto_terminos_vigentes(v_lub, '1.0') then
      raise exception 'R27c EL OWNER ACEPTÓ Y NO QUEDÓ REGISTRADO: acepto_terminos_vigentes(1.0) sigue en false después de aceptar_terminos(''1.0''). El modal volvería en cada request.';
    end if;

    -- La versión cuenta: 1.1 no está aceptada aunque 1.0 sí.
    if acepto_terminos_vigentes(v_lub, '1.1') then
      raise exception 'R27d LA VERSIÓN NO CUENTA: con la 1.0 aceptada, la 1.1 da por aceptada. Subir VERSION_LEGAL no volvería a pedirle la aceptación a nadie, y un texto nuevo quedaría "aceptado" por gente que nunca lo leyó.';
    end if;

    perform aceptar_terminos('1.1');

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    -- Historial, no una columna: dos filas, y la de 1.0 sigue ahí.
    select count(*) into v_n from aceptaciones_terminos where lubricentro_id = v_lub;
    if v_n <> 2 then
      raise exception 'R27c: después de aceptar 1.0 (dos veces) y 1.1 hay % fila(s) y tenían que ser 2. O la función no es idempotente por versión, o no guarda una fila por versión.', v_n;
    end if;
    if not exists (
      select 1 from aceptaciones_terminos where lubricentro_id = v_lub and version = '1.0'
    ) then
      raise exception 'R27c EL HISTORIAL SE PERDIÓ: aceptar la 1.1 se llevó la fila de la 1.0. Es historial, no una columna.';
    end if;
    if exists (
      select 1 from aceptaciones_terminos
       where lubricentro_id = v_lub and usuario_id is distinct from v_uid
    ) then
      raise exception 'R27c: la aceptación quedó registrada con OTRO usuario que el de la sesión.';
    end if;
    if exists (
      select 1 from aceptaciones_terminos
       where usuario_id = v_uid and lubricentro_id is distinct from v_lub
    ) then
      raise exception 'R27c: la aceptación quedó registrada en OTRO tenant que el de la sesión.';
    end if;

    select aceptaciones_legales(l) into v_vers from lubricentros l where l.id = v_lub;
    if v_vers is distinct from array['1.0', '1.1'] then
      raise exception 'R27d: el campo calculado devolvió % y esperaba {1.0,1.1}. Es lo que viaja en la sesión: si miente, el gate miente.', v_vers;
    end if;

    -- Un superadmin no tiene tenant y no acepta nada.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform aceptar_terminos('1.0');
      raise exception 'R27c: un superadmin aceptó los Términos. No tiene tenant: ¿en nombre de quién quedó la fila?';
    exception
      when insufficient_privilege then null;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    -- El demo, exento por slug, con una versión que nadie aceptó nunca.
    if not acepto_terminos_vigentes(v_demo, '9.9') then
      raise exception 'R27d EL DEMO NO ESTÁ EXENTO: un prospecto mirando la demo se comería el modal de los Términos. La exención es por slug (''demo''), no por descuento ni por plan.';
    end if;

    -- ---------- e · El aislamiento, como el owner del demo ----------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_demo_own, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select count(*) into v_n from aceptaciones_terminos where lubricentro_id = v_lub;
    if v_n <> 0 then
      raise exception 'R27e: el owner del demo lee % aceptación(es) de otro tenant. El RLS de aceptaciones_terminos no recorta.', v_n;
    end if;

    -- El composite forjado (regla 18): con jsonb_populate_record y no con
    -- un join, porque leer la fila del vecino ya lo bloquea el RLS y la
    -- versión con join pasaría en verde aunque la función fuera definer.
    select aceptaciones_legales(
      jsonb_populate_record(null::lubricentros, jsonb_build_object('id', v_lub))
    ) into v_vers;
    if v_vers is distinct from '{}'::text[] then
      raise exception 'R27e EL CAMPO CALCULADO ES UNA PUERTA: con un composite forjado con el uuid de otro tenant devolvió %. Tiene que ser SECURITY INVOKER para que el RLS deje la subconsulta vacía (regla 18 de CLAUDE.md).', v_vers;
    end if;

    if acepto_terminos_vigentes(v_lub, '1.0') then
      raise exception 'R27e: el predicado le contesta al owner del demo por las aceptaciones de otro tenant.';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    -- ---------- b · Los candados, en acción ----------
    begin
      delete from aceptaciones_terminos where lubricentro_id = v_lub;
      raise exception 'R27b LA EVIDENCIA SE PUEDE BORRAR: un delete sobre aceptaciones_terminos pasó. Es la respuesta al día que un cliente diga «yo nunca acepté eso»: sin candado no es evidencia.';
    exception
      when sqlstate 'P0001' then
        if sqlerrm not like '%aceptacion_no_se_borra%' then raise; end if;
    end;

    begin
      update aceptaciones_terminos set version = '0.9' where lubricentro_id = v_lub;
      raise exception 'R27b LA EVIDENCIA SE PUEDE EDITAR: un update sobre aceptaciones_terminos pasó. Una fila editada sigue pareciendo evidencia sin serlo.';
    exception
      when sqlstate 'P0001' then
        if sqlerrm not like '%aceptacion_no_se_edita%' then raise; end if;
    end;

    begin
      truncate aceptaciones_terminos;
      raise exception 'R27b LA EVIDENCIA SE PUEDE VACIAR: un truncate sobre aceptaciones_terminos pasó. El contrato de todos los tenants, borrado en una línea.';
    exception
      when sqlstate 'P0001' then
        if sqlerrm not like '%aceptacion_no_se_vacia%' then raise; end if;
    end;

    -- Todo lo escrito en este bloque se deshace acá. Cualquier otra
    -- excepción de arriba NO se atrapa: sube y pone el reset en rojo.
    raise exception 'rollback_r27' using errcode = 'P0027';
  exception
    when sqlstate 'P0027' then
      execute 'reset role';
      perform set_config('request.jwt.claims', '{}', true);
  end;

  if exists (select 1 from aceptaciones_terminos where lubricentro_id = v_lub) then
    raise exception 'R27 SIN PISO: la subtransacción no deshizo las aceptaciones de prueba.';
  end if;

  -- ---------- La limpieza ----------
  delete from auth.users where id = v_uid;   -- cascade → usuarios
  delete from lubricentros where id = v_lub; -- config_neumaticos cae en cascada
end $$;
-- <<< R27

-- ============================================================
-- R28 · Las consultas sin resultado no guardan la patente
--       (20260922120000 · 20260922121000)
--
--   a · Después del seed no queda UNA fila con `not encontrada` y patente:
--       el backfill y el trigger cubren también las cuatro del seed.
--   b · El índice de leads no existe; el CHECK y el trigger sí.
--   c · get_carton() con una patente que no existe registra la consulta
--       CON patente null; con una que existe, la guarda (es la métrica del
--       % de vehículos escaneados).
--   d · Un insert directo sin resultado y con patente: el trigger la anula.
--   e · La métrica sigue viva: `leads` de resumen_inicio cuenta las
--       consultas sin resultado igual que antes.
--
-- El mensaje de WhatsApp de "no encontramos tu patente" no se prueba acá
-- porque no toca la base: la patente viaja en la URL (?nohay=) y
-- components/cliente/patente-no-encontrada.tsx la lee de ahí.
-- ============================================================

-- >>> R28
do $$
declare
  v_demo   uuid;
  v_own    uuid;
  -- now() y no clock_timestamp(): created_at nace con now(), que es el
  -- inicio de la transacción del reset, anterior a cualquier reloj de pared
  -- leído acá adentro.
  v_desde  timestamptz := now();
  v_n      integer;
  v_antes  integer;
  v_id     uuid;
  v_pat    text;
  v_leads  integer;
begin
  select id into v_demo from lubricentros where slug = 'demo';
  select id into v_own from usuarios where lubricentro_id = v_demo and rol = 'owner' limit 1;
  if v_demo is null or v_own is null then
    raise exception 'R28 SIN PISO: falta el demo o su owner.';
  end if;

  -- ---------- a · el estado después del seed ----------
  select count(*) into v_n from landing_busquedas where not encontrada and patente is not null;
  if v_n <> 0 then
    raise exception 'R28a HAY % CONSULTA(S) SIN RESULTADO CON LA PATENTE GUARDADA. La Política de Privacidad dice "si la patente no está cargada en ese lubricentro, no la guardamos": o el backfill de 20260922121000 no corrió, o el trigger landing_busquedas_sin_patente dejó pasar un insert (seed_demo inserta cuatro).', v_n;
  end if;

  -- ---------- b · el catálogo ----------
  if exists (select 1 from pg_class where relname = 'landing_busquedas_leads_idx') then
    raise exception 'R28b: el índice landing_busquedas_leads_idx sigue existiendo. Era el índice de los leads por patente; sin patentes no tiene qué indexar y su presencia dice que la captura sigue.';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'busqueda_sin_resultado_sin_patente' and conrelid = 'landing_busquedas'::regclass
  ) then
    raise exception 'R28b: falta el CHECK busqueda_sin_resultado_sin_patente. Es la segunda defensa: sin él, apagar el trigger vuelve a guardar patentes.';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'landing_busquedas_sin_patente' and tgrelid = 'landing_busquedas'::regclass
  ) then
    raise exception 'R28b: falta el trigger landing_busquedas_sin_patente. Sin él, cualquier insert con encontrada = false y patente (el CHECK lo rechaza) hace fallar get_carton entero: la vidriera deja de responder a las patentes que no existen.';
  end if;

  -- ---------- c · get_carton, las dos ramas ----------
  if exists (select 1 from vehiculos where lubricentro_id = v_demo and patente_normalizada = 'ZZ999ZZ') then
    raise exception 'R28c SIN PISO: ZZ999ZZ existe en el demo.';
  end if;
  select count(*) into v_antes from landing_busquedas where lubricentro_id = v_demo and not encontrada;
  perform get_carton('demo', 'ZZ999ZZ');
  select count(*) into v_n from landing_busquedas where lubricentro_id = v_demo and not encontrada;
  if v_n <> v_antes + 1 then
    raise exception 'R28c: get_carton no registró la consulta sin resultado. La métrica de escaneo se apagó.';
  end if;
  if exists (select 1 from landing_busquedas where not encontrada and patente is not null) then
    raise exception 'R28c LA VIDRIERA SIGUE GUARDANDO LA PATENTE DE UNA CONSULTA SIN RESULTADO. Es la patente de alguien que no es cliente de nadie, y la política promete no guardarla.';
  end if;

  select patente_normalizada into v_pat from vehiculos where lubricentro_id = v_demo order by created_at limit 1;
  perform get_carton('demo', v_pat);
  if not exists (
    select 1 from landing_busquedas
     where lubricentro_id = v_demo and created_at >= v_desde and encontrada and patente = v_pat
  ) then
    raise exception 'R28c: una consulta CON resultado no quedó con su patente (%). El porcentaje de vehículos escaneados del Inicio se calcula cruzando esa patente contra la flota: sin ella, la métrica se va a cero.', v_pat;
  end if;

  -- ---------- d · el trigger, por la puerta directa ----------
  insert into landing_busquedas (lubricentro_id, patente, encontrada)
  values (v_demo, 'AB123CD', false) returning id into v_id;
  if (select patente from landing_busquedas where id = v_id) is not null then
    raise exception 'R28d: un insert directo con encontrada = false guardó la patente. El trigger no la anula.';
  end if;

  -- ---------- e · la métrica del Inicio ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (resumen_inicio(p_sucursal_id => null)->'landing'->>'leads')::integer into v_leads;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  select count(*) into v_n from landing_busquedas
   where lubricentro_id = v_demo and not encontrada
     and created_at >= now() - interval '12 months';
  if v_leads is distinct from v_n then
    raise exception 'R28e: resumen_inicio cuenta % consulta(s) sin resultado y en la tabla hay %. Sin la patente, la métrica tenía que seguir igual.', v_leads, v_n;
  end if;

  -- ---------- La limpieza ----------
  delete from landing_busquedas where lubricentro_id = v_demo and created_at >= v_desde;
end $$;
-- <<< R28

-- ============================================================
-- R29 · La retención de 12 meses y la purga (20260922140000)
--
--   a · `cancelada_at` se escribe al pasar a cancelada y se limpia al
--       volver; retro-datarla sin tocar el estado es posible.
--   b · La SIMULACIÓN escribe en `purgas` (con conteos y el logo pendiente)
--       y no borra nada ni toca `lubricentros`.
--   c · La purga REAL borra las tablas listadas, no toca `pagos`,
--       `suscripciones`, `sucursales` ni `usuarios`, deja `activo = false`
--       y `purgado_at`, y respeta el plazo: el cancelado hace 11 meses y el
--       demo no se tocan.
--   d · Una segunda corrida no purga dos veces.
--   e · A pedido: sin motivo no; el demo no; ya purgado no; con motivo sí,
--       auditado con quién.
--   f · Un owner no la ejecuta. El reloj está programado EN SIMULACIÓN.
--       `purgas` tiene los tres candados en ALWAYS.
--
-- ⚠ Las purgas corren en una subtransacción que se deshace: sus filas en
-- `purgas` son evidencia y no se pueden borrar.
-- ============================================================

-- >>> R29
do $$
declare
  v_plan       uuid;
  v_super      uuid;
  v_demo       uuid;
  v_lub        uuid;
  v_uid        uuid := gen_random_uuid();
  v_suc        uuid;
  v_sus        uuid;
  v_rec        uuid;
  v_cli        uuid;
  v_veh        uuid;
  v_prod       uuid;
  v_serv       uuid;
  v_premio     uuid;
  v_n          integer;
  v_purga      purgas;
  v_demo_antes bigint;
  v_lub_fila   lubricentros;
begin
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_demo  from lubricentros where slug = 'demo';
  if v_plan is null or v_super is null or v_demo is null then
    raise exception 'R29 SIN PISO: falta el plan Pro, el superadmin o el demo.';
  end if;

  -- ---------- f · el catálogo: candados y reloj ----------
  select count(*) into v_n from pg_trigger
   where tgrelid = 'purgas'::regclass and not tgisinternal and tgenabled = 'A';
  if v_n <> 3 then
    raise exception 'R29f: purgas tiene % de 3 candados en ALWAYS. El libro de purgas es evidencia: borrado, edición y truncate se rechazan siempre.', v_n;
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'purgas'::regclass and not tgisinternal and (tgtype & 32) = 32
  ) then
    raise exception 'R29f: purgas no tiene candado de truncate.';
  end if;

  select count(*) into v_n from cron.job
   where jobname = 'purgar-tenants-vencidos' and active
     and command like '%purgar_tenants_vencidos(true)%';
  if v_n <> 1 then
    raise exception 'R29f EL RELOJ NO ESTÁ PROGRAMADO EN SIMULACIÓN: cron.job no tiene el job purgar-tenants-vencidos con purgar_tenants_vencidos(true). El primer ciclo es solo contar: se pasa a real a mano, después de ver una simulación correcta.';
  end if;

  -- ---------- El piso: un tenant cancelado hace 13 meses, con de todo ----------
  insert into lubricentros (nombre, slug, onboarding_completado_at, bienvenida_vista_at, pago_presentado_at)
  values ('Purga R29', 'purga-r29', now(), now(), now()) returning id into v_lub;
  insert into config_experiencia (lubricentro_id, logo_url)
  values (v_lub, 'https://x.supabase.co/storage/v1/object/public/logos/' || v_lub || '/logo.png');
  insert into sucursales (lubricentro_id, nombre) values (v_lub, 'Casa Central') returning id into v_suc;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, inicio, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual', current_date - 400, current_date - 370)
  returning id into v_sus;

  -- ---------- a · cancelada_at ----------
  if (select cancelada_at from suscripciones where id = v_sus) is not null then
    raise exception 'R29a: una suscripción activa nació con cancelada_at escrito.';
  end if;
  update suscripciones set estado = 'cancelada' where id = v_sus;
  if (select cancelada_at from suscripciones where id = v_sus) is null then
    raise exception 'R29a EL TRIGGER NO ESCRIBIÓ cancelada_at al pasar a cancelada. Sin fecha, los 12 meses no se cuentan nunca y la promesa de borrar queda en el papel.';
  end if;
  update suscripciones set estado = 'activa' where id = v_sus;
  if (select cancelada_at from suscripciones where id = v_sus) is not null then
    raise exception 'R29a: volvió a activa y cancelada_at quedó escrito. El reloj de los 12 meses seguiría corriendo para un tenant que volvió.';
  end if;
  update suscripciones set estado = 'cancelada' where id = v_sus;
  -- Retro-datar SIN tocar el estado: el trigger no se despierta.
  update suscripciones set cancelada_at = now() - interval '13 months' where id = v_sus;
  if (select cancelada_at from suscripciones where id = v_sus) > now() - interval '12 months' then
    raise exception 'R29a: retro-datar cancelada_at sin tocar el estado la pisó. Una cancelación real del pasado no se puede registrar.';
  end if;

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000',
    'r29@fidellimotors.app', extensions.crypt('r29', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Owner R29', 'lubricentro_id', v_lub),
    '', '', '', ''
  );

  insert into clientes (lubricentro_id, nombre, telefono, email)
  values (v_lub, 'Persona R29', '351 555 0290', 'r29@ejemplo.com') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (v_lub, v_cli, 'AB290CD', 'Fiat', 'Cronos') returning id into v_veh;
  insert into productos (lubricentro_id, categoria, nombre)
  values (v_lub, 'aceite', 'Aceite R29') returning id into v_prod;
  insert into premios (lubricentro_id, meta_services, descripcion)
  values (v_lub, 3, 'Premio R29') returning id into v_premio;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros, aceite_tipo, prox_service_km)
  values (v_lub, v_suc, v_veh, v_uid, current_date - 380, 50000, '10W40', 60000) returning id into v_serv;
  insert into service_items (service_id, lubricentro_id, item_tipo) values (v_serv, v_lub, 'filtro_aceite');
  insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id) values (v_lub, v_veh, v_premio, v_serv);
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado) values (v_lub, v_veh, v_uid, 'vencido');
  insert into notas_vehiculo (lubricentro_id, vehiculo_id, usuario_id, contenido) values (v_lub, v_veh, v_uid, 'Nota R29');
  insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_km) values (v_lub, v_veh, v_uid, 'Pendiente de prueba R29', 60000);
  insert into landing_busquedas (lubricentro_id, patente, encontrada) values (v_lub, 'AB290CD', true);
  perform sembrar_templates(v_lub, 'Purga R29');
  insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago)
  values (v_lub, v_sus, v_super, current_date - 400, current_date - 370, 49000, current_date - 400);

  -- Y uno cancelado hace 11 meses, que NO tiene que tocarse.
  insert into lubricentros (nombre, slug) values ('Reciente R29', 'reciente-r29') returning id into v_rec;
  insert into config_experiencia (lubricentro_id) values (v_rec);
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, inicio, vencimiento)
  values (v_rec, v_plan, 'cancelada', 'mensual', current_date - 340, current_date - 310);
  update suscripciones set cancelada_at = now() - interval '11 months' where lubricentro_id = v_rec;
  insert into clientes (lubricentro_id, nombre, telefono) values (v_rec, 'Persona reciente', '351 555 0291');

  select count(*) into v_demo_antes from clientes where lubricentro_id = v_demo;

  begin
    -- EL DEMO, CANCELADO HACE 13 MESES A PROPÓSITO: es la única forma de
    -- probar que la exención por slug existe. Con la suscripción del demo
    -- activa, sacarle el `slug <> 'demo'` a la purga no cambia nada y la
    -- prueba pasaría en verde con la exención borrada. Se deshace con el
    -- rollback de este bloque.
    update suscripciones set estado = 'cancelada' where lubricentro_id = v_demo;
    update suscripciones set cancelada_at = now() - interval '13 months' where lubricentro_id = v_demo;

    -- ---------- b · la simulación ----------
    select count(*) into v_n from purgar_tenants_vencidos(true);
    if v_n <> 1 then
      raise exception 'R29b: la simulación devolvió % tenant(s) y tenía que ser 1 (solo el cancelado hace 13 meses: ni el de 11 meses ni el demo, que está cancelado hace 13 a propósito).', v_n;
    end if;
    if exists (select 1 from purgas where lubricentro_id = v_demo) then
      raise exception 'R29b EL DEMO ENTRÓ A LA PURGA: cancelado hace 13 meses, la simulación lo contó. El demo no se purga nunca — es la vidriera de las demos comerciales.';
    end if;
    select * into v_purga from purgas where lubricentro_id = v_lub order by created_at desc limit 1;
    if not found or not v_purga.simulacion then
      raise exception 'R29b LA SIMULACIÓN NO ESCRIBIÓ EN purgas. Evidencia primero: sin la fila, Santiago no tiene qué revisar antes de pasar el reloj a real.';
    end if;
    if (v_purga.conteos->>'clientes')::integer <> 1
       or (v_purga.conteos->>'services')::integer <> 1
       or (v_purga.conteos->>'service_items')::integer <> 1
       or (v_purga.conteos->>'canjes')::integer <> 1
       or (v_purga.conteos->>'mensaje_templates')::integer < 1 then
      raise exception 'R29b: los conteos de la simulación no son los de la base: %', v_purga.conteos;
    end if;
    if v_purga.conteos->>'logo_pendiente' is null then
      raise exception 'R29b: el logo del tenant no quedó anotado en purgas.conteos. Desde SQL no se borra (storage.objects lo rechaza) y alguien tiene que borrarlo por la API.';
    end if;
    if (select count(*) from clientes where lubricentro_id = v_lub) <> 1
       or (select count(*) from services where lubricentro_id = v_lub) <> 1 then
      raise exception 'R29b LA SIMULACIÓN BORRÓ. p_simular = true solo cuenta.';
    end if;
    select * into v_lub_fila from lubricentros where id = v_lub;
    if not v_lub_fila.activo or v_lub_fila.purgado_at is not null then
      raise exception 'R29b: la simulación tocó la fila de lubricentros.';
    end if;

    -- ---------- c · la purga real ----------
    select count(*) into v_n from purgar_tenants_vencidos(false);
    if v_n <> 1 then
      raise exception 'R29c: la purga real devolvió % tenant(s) y tenía que ser 1.', v_n;
    end if;
    if (select count(*) from clientes            where lubricentro_id = v_lub) <> 0
       or (select count(*) from vehiculos        where lubricentro_id = v_lub) <> 0
       or (select count(*) from services         where lubricentro_id = v_lub) <> 0
       or (select count(*) from service_items    where lubricentro_id = v_lub) <> 0
       or (select count(*) from canjes           where lubricentro_id = v_lub) <> 0
       or (select count(*) from contactos        where lubricentro_id = v_lub) <> 0
       or (select count(*) from notas_vehiculo   where lubricentro_id = v_lub) <> 0
       or (select count(*) from trabajos_pendientes where lubricentro_id = v_lub) <> 0
       or (select count(*) from productos        where lubricentro_id = v_lub) <> 0
       or (select count(*) from premios          where lubricentro_id = v_lub) <> 0
       or (select count(*) from mensaje_templates where lubricentro_id = v_lub) <> 0
       or (select count(*) from config_experiencia where lubricentro_id = v_lub) <> 0
       or (select count(*) from config_neumaticos  where lubricentro_id = v_lub) <> 0
       or (select count(*) from landing_busquedas  where lubricentro_id = v_lub) <> 0 then
      raise exception 'R29c LA PURGA DEJÓ DATOS: alguna de las tablas listadas sigue con filas del tenant purgado.';
    end if;
    if (select count(*) from pagos where lubricentro_id = v_lub) <> 1 then
      raise exception 'R29c LA PURGA BORRÓ pagos. Es contabilidad y se guarda el plazo fiscal.';
    end if;
    if (select count(*) from suscripciones where lubricentro_id = v_lub) <> 1
       or (select count(*) from sucursales where lubricentro_id = v_lub) <> 1
       or (select count(*) from usuarios where lubricentro_id = v_lub) <> 1 then
      raise exception 'R29c: la purga borró suscripciones, sucursales o usuarios. Esos quedan.';
    end if;
    select * into v_lub_fila from lubricentros where id = v_lub;
    if v_lub_fila.activo or v_lub_fila.purgado_at is null then
      raise exception 'R29c: la fila de lubricentros no quedó con activo = false y purgado_at.';
    end if;
    if (select count(*) from purgas where lubricentro_id = v_lub and not simulacion) <> 1 then
      raise exception 'R29c: la purga real no dejó su fila en purgas.';
    end if;
    if (select count(*) from clientes where lubricentro_id = v_rec) <> 1 then
      raise exception 'R29c EL PLAZO NO RIGE: purgó a un tenant cancelado hace 11 meses. La política dice 12.';
    end if;
    if (select count(*) from clientes where lubricentro_id = v_demo) <> v_demo_antes then
      raise exception 'R29c LA PURGA TOCÓ AL DEMO.';
    end if;

    -- ---------- d · dos veces no ----------
    select count(*) into v_n from purgar_tenants_vencidos(false);
    if v_n <> 0 then
      raise exception 'R29d: la segunda corrida purgó % tenant(s). Uno purgado no se vuelve a purgar.', v_n;
    end if;

    -- ---------- e · a pedido, como superadmin ----------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    begin
      perform purgar_tenants_vencidos(false, v_rec, null);
      raise exception 'R29e: una purga a pedido SIN motivo pasó.';
    exception when others then
      if sqlerrm not like '%motivo_insuficiente%' then raise; end if;
    end;
    begin
      perform purgar_tenants_vencidos(false, v_demo, 'Prueba R29 sobre el demo, que no se purga');
      raise exception 'R29e EL DEMO SE PURGÓ a pedido.';
    exception when others then
      if sqlerrm not like '%demo_no_se_purga%' then raise; end if;
    end;
    begin
      perform purgar_tenants_vencidos(false, v_lub, 'Prueba R29: purgar dos veces al mismo');
      raise exception 'R29e: un tenant ya purgado se volvió a purgar a pedido.';
    exception when others then
      if sqlerrm not like '%ya_purgado%' then raise; end if;
    end;

    select count(*) into v_n from purgar_tenants_vencidos(false, v_rec, 'Pedido del titular por email, prueba R29');
    if v_n <> 1 then
      raise exception 'R29e: la purga a pedido de un cancelado hace 11 meses no corrió (%).', v_n;
    end if;
    select * into v_purga from purgas where lubricentro_id = v_rec order by created_at desc limit 1;
    if not v_purga.a_pedido or v_purga.motivo not like 'Pedido del titular%' or v_purga.ejecutada_por is distinct from v_super then
      raise exception 'R29e: la purga a pedido no quedó auditada con a_pedido, motivo y quién (%).', row_to_json(v_purga);
    end if;
    if (select count(*) from clientes where lubricentro_id = v_rec) <> 0 then
      raise exception 'R29e: la purga a pedido no borró.';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    -- ---------- f · un owner no ----------
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform purgar_tenants_vencidos(true);
      raise exception 'R29f: un OWNER corrió la purga (aunque sea en simulación).';
    exception
      when insufficient_privilege then null;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);

    raise exception 'rollback_r29' using errcode = 'P0029';
  exception
    when sqlstate 'P0029' then
      execute 'reset role';
      perform set_config('request.jwt.claims', '{}', true);
  end;

  -- ---------- La limpieza (todo volvió con el rollback) ----------
  delete from pagos              where lubricentro_id in (v_lub, v_rec);
  delete from canjes             where lubricentro_id in (v_lub, v_rec);
  delete from contactos          where lubricentro_id in (v_lub, v_rec);
  delete from notas_vehiculo     where lubricentro_id in (v_lub, v_rec);
  delete from trabajos_pendientes where lubricentro_id in (v_lub, v_rec);
  delete from service_items      where lubricentro_id in (v_lub, v_rec);
  delete from services           where lubricentro_id in (v_lub, v_rec);
  delete from vehiculos          where lubricentro_id in (v_lub, v_rec);
  delete from clientes           where lubricentro_id in (v_lub, v_rec);
  delete from productos          where lubricentro_id in (v_lub, v_rec);
  delete from premios            where lubricentro_id in (v_lub, v_rec);
  delete from mensaje_templates  where lubricentro_id in (v_lub, v_rec);
  delete from config_experiencia where lubricentro_id in (v_lub, v_rec);
  delete from landing_busquedas  where lubricentro_id in (v_lub, v_rec);
  delete from suscripciones      where lubricentro_id in (v_lub, v_rec);
  delete from sucursales         where lubricentro_id in (v_lub, v_rec);
  delete from auth.users where id = v_uid;
  delete from lubricentros where id in (v_lub, v_rec);
end $$;
-- <<< R29

-- ============================================================
-- R30 · Supresión de un cliente final: anonimizar, no borrar (20260922130000)
--
--   a · El owner de OTRO tenant no puede, ni con el uuid en la mano.
--   b · Sin motivo, no.
--   c · El owner del tenant: nombre, teléfono, email y CUIT quedan en los
--       sentinelas; el vehículo y el service quedan; la auditoría dice
--       quién y por qué.
--   d · La ficha sigue abriendo (vista_clientes lo devuelve) y el teléfono
--       sentinela no tiene dígitos: WhatsApp apagado solo.
--   e · Dos veces no. f · El libro no se escribe por fuera de la función.
--   g · El superadmin también puede.
-- ============================================================

-- >>> R30
do $$
declare
  v_demo     uuid;
  v_own      uuid;
  v_super    uuid;
  v_suc      uuid;
  v_cli      uuid;
  v_cli2     uuid;
  v_veh      uuid;
  v_otro_lub uuid;
  v_otro_uid uuid := gen_random_uuid();
  v_c        clientes;
  v_n        integer;
begin
  select id into v_demo  from lubricentros where slug = 'demo';
  select id into v_own   from usuarios where lubricentro_id = v_demo and rol = 'owner' limit 1;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_suc   from sucursales where lubricentro_id = v_demo and activa order by created_at limit 1;
  if v_demo is null or v_own is null or v_super is null or v_suc is null then
    raise exception 'R30 SIN PISO: falta el demo, su owner, su sucursal o el superadmin.';
  end if;

  insert into clientes (lubricentro_id, nombre, telefono, email, cuit)
  values (v_demo, 'Persona R30', '351 555 0300', 'r30@ejemplo.com', '20123456786') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (v_demo, v_cli, 'AB130CD', 'Fiat', 'Cronos') returning id into v_veh;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros, aceite_tipo, prox_service_km)
  values (v_demo, v_suc, v_veh, v_own, current_date - 30, 50000, '10W40', 60000);
  insert into clientes (lubricentro_id, nombre, telefono)
  values (v_demo, 'Persona R30 bis', '351 555 0301') returning id into v_cli2;

  -- Otro tenant con su owner: el que no puede.
  insert into lubricentros (nombre, slug) values ('Otro R30', 'otro-r30') returning id into v_otro_lub;
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_otro_uid, '00000000-0000-0000-0000-000000000000',
    'r30@fidellimotors.app', extensions.crypt('r30', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Owner R30', 'lubricentro_id', v_otro_lub),
    '', '', '', ''
  );

  -- ---------- a · otro owner ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_otro_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform anonimizar_cliente(v_cli, 'Pedido del titular, prueba R30 desde otro tenant');
    raise exception 'R30a EL OWNER DE OTRO TENANT ANONIMIZÓ UN CLIENTE AJENO. El guard tiene que comparar el tenant del cliente con mi_lubricentro_id().';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- b · c · el owner del tenant ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform anonimizar_cliente(v_cli, 'corto');
    raise exception 'R30b: una supresión sin motivo pasó. El motivo es lo que queda registrado.';
  exception when others then
    if sqlerrm not like '%motivo_insuficiente%' then raise; end if;
  end;

  perform anonimizar_cliente(v_cli, 'Pedido del titular por email, prueba R30');

  -- d · la ficha sigue abriendo para el owner
  select count(*) into v_n from vista_clientes where id = v_cli;
  if v_n <> 1 then
    raise exception 'R30d: vista_clientes ya no devuelve al cliente suprimido. La ficha tiene que seguir abriendo: los trabajos son del lubricentro.';
  end if;

  -- e · dos veces no
  begin
    perform anonimizar_cliente(v_cli, 'Otra vez, prueba R30');
    raise exception 'R30e: un cliente ya suprimido se volvió a suprimir (y a auditar).';
  exception when others then
    if sqlerrm not like '%cliente_ya_suprimido%' then raise; end if;
  end;

  -- f · el libro no se escribe por fuera
  begin
    insert into supresiones_cliente (lubricentro_id, cliente_id, motivo, suprimido_por)
    values (v_demo, v_cli, 'directo, prueba R30', v_own);
    raise exception 'R30f: un owner escribió supresiones_cliente por fuera de la función.';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  select * into v_c from clientes where id = v_cli;
  if v_c.nombre <> 'Cliente eliminado' or v_c.telefono <> '-' or v_c.email is not null or v_c.cuit is not null then
    raise exception 'R30c LA PERSONA NO DESAPARECIÓ: quedó nombre=«%», telefono=«%», email=«%», cuit=«%». Los sentinelas son "Cliente eliminado", "-", null, null (lib/clientes.ts los repite).',
      v_c.nombre, v_c.telefono, v_c.email, v_c.cuit;
  end if;
  if v_c.telefono ~ '\d' then
    raise exception 'R30d: el teléfono sentinela tiene dígitos y "A quién llamar" lo tomaría por un número de WhatsApp.';
  end if;
  if (select count(*) from services where vehiculo_id = v_veh) <> 1
     or not exists (select 1 from vehiculos where id = v_veh and patente_normalizada = 'AB130CD') then
    raise exception 'R30c LOS TRABAJOS SE FUERON CON LA PERSONA: el vehículo o el service del cliente suprimido no están. Anonimizar no es borrar.';
  end if;
  select count(*) into v_n from supresiones_cliente
   where cliente_id = v_cli and suprimido_por = v_own and motivo like 'Pedido del titular%';
  if v_n <> 1 then
    raise exception 'R30c: la supresión no quedó auditada con quién y por qué (% fila(s)).', v_n;
  end if;

  -- ---------- g · el superadmin ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform anonimizar_cliente(v_cli2, 'Pedido por email a Fidelli, prueba R30');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  if (select nombre from clientes where id = v_cli2) <> 'Cliente eliminado' then
    raise exception 'R30g: el superadmin no pudo suprimir. El reclamo llega por email a Fidelli: esta es la puerta que se va a usar.';
  end if;
  if (select suprimido_por from supresiones_cliente where cliente_id = v_cli2) is distinct from v_super then
    raise exception 'R30g: la supresión del superadmin no quedó firmada por él.';
  end if;

  -- ---------- La limpieza ----------
  delete from supresiones_cliente where cliente_id in (v_cli, v_cli2);
  delete from services where vehiculo_id = v_veh;
  delete from vehiculos where id = v_veh;
  delete from clientes where id in (v_cli, v_cli2);
  delete from auth.users where id = v_otro_uid;
  delete from lubricentros where id = v_otro_lub;
end $$;
-- <<< R30


-- ============================================================
-- R31 · Los cimientos de las métricas (20260922200000 … 20260922205000)
--
-- El bloque MÉTRICAS 1 (docs/METRICAS.md) deja la memoria que el admin no
-- tenía: tenant_eventos, el tipo de cambio, los snapshots diarios y una
-- sola definición de "activo" y de la plata. Todo lo de abajo se rompe sin
-- avisar —los triggers son defensivos a propósito, y un trigger que falla
-- baja a WARNING y el reset sigue en verde—, así que este bloque CUENTA
-- eventos y filas, nunca mira las warnings.
--
--   a · tenant_eventos es inmutable: UPDATE, DELETE y TRUNCATE fallan.
--   b · Un pago genera exactamente UN evento `pago`, y el pago queda
--       registrado aunque el trigger falle (se sabotea el insert del
--       evento dentro de un savepoint y el pago tiene que sobrevivir).
--   c · cerrar_dia() es idempotente: la segunda llamada devuelve
--       'ya cerrado' y no cambia ninguna fila.
--   d · mrr_plataforma() = Σ mrr_de_tenant(); con módulo pago,
--       mrr_de_tenant = monto_de_renovacion_en()/meses (mensual y anual);
--       un exento da 0.
--   e · es_activo() es false con activo = false y con el reloj en
--       'suspendido'; true al reactivar.
--   f · Suspender con motivo deja `suspension` con el motivo y el actor;
--       reactivar deja `reactivacion`; sin motivo, o con «Otro» sin
--       detalle, la puerta rechaza.
--   g · El alta deja `alta` con plan y período; fijar el origen deja
--       `origen`; el override deja `modulo_activado` con el motivo; el
--       cambio de plan deja `cambio_plan`.
--   h · Después del seed: un `alta` por lubricentro, y cada pago tiene
--       exactamente un evento.
-- ============================================================

-- >>> R31
create or replace function r31_sabotaje()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sabotaje R31: el insert del evento falla a propósito';
end;
$$;

do $$
declare
  v_hoy      date := current_date;
  v_super    uuid;
  v_plan     uuid;
  v_lub      uuid;
  v_lub2     uuid;
  v_sus      uuid;
  v_sus2     uuid;
  v_pago     uuid;
  v_ev       tenant_eventos;
  v_l        lubricentros;
  v_n        integer;
  v_m        integer;
  v_ok       boolean;
  v_res      text;
  v_esperado numeric;
  v_suma     numeric;
  v_venta    numeric;
  -- Un día del pasado lejano, distinto en cada corrida: los snapshots son
  -- inmutables y quedan, así que el bloque tiene que poder correr de nuevo
  -- (scripts/regresion-metricas.sh lo corre en una transacción con
  -- rollback, pero el reset ya dejó cerrado el día que usó).
  v_dia      date := date '1990-01-01' + (extract(epoch from clock_timestamp())::bigint % 3650)::integer;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  if v_super is null or v_plan is null then
    raise exception 'R31 SIN PISO: falta el superadmin o el plan Pro del seed.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  -- Como `authenticated`, que es el rol con el que escribe el superadmin
  -- desde PostgREST: los triggers tienen que poder emitir bajo ESE rol. Como
  -- postgres pasaba todo aunque el trigger no tuviera permiso de escribir.
  execute 'set local role authenticated';

  -- ---------- g · El alta y el origen ----------
  select crear_lubricentro('Metricas R31', 'metricas-r27',
    '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0) into v_lub;

  -- El alta es un trigger DIFERIDO: dispara al commit, o acá, a mano.
  set constraints all immediate;

  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'alta';
  if v_n <> 1 then
    raise exception 'R31g EL ALTA NO DEJÓ EVENTO (% en vez de 1). Sin `alta` no hay altas por mes ni activación: crear_lubricentro() insertó el tenant y el trigger diferido no escribió nada — mirá las WARNING del reset, ahí está el error real.', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'alta';
  if v_ev.despues ->> 'plan_id' is distinct from v_plan::text
     or v_ev.despues ->> 'periodo' is distinct from 'mensual'
     or v_ev.despues ->> 'slug' is distinct from 'metricas-r27' then
    raise exception 'R31g: el evento alta no trae el plan y el período de la suscripción (despues = %). El trigger tiene que ser diferido para verla: crear_lubricentro() la inserta DESPUÉS del tenant.', v_ev.despues;
  end if;
  if v_ev.actor is distinct from v_super or v_ev.origen_evento <> 'admin' then
    raise exception 'R31g: el alta quedó con actor % y origen_evento «%»; tenía que ser el superadmin de la sesión y «admin».', v_ev.actor, v_ev.origen_evento;
  end if;

  perform fijar_origen_tenant(v_lub, 'meta', 'campaña R31');
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'origen';
  if v_n <> 1 then
    raise exception 'R31g: fijar_origen_tenant() no dejó el evento origen (% en vez de 1).', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'origen';
  if v_ev.despues ->> 'origen' is distinct from 'meta' or v_ev.despues ->> 'origen_detalle' is distinct from 'campaña R31' then
    raise exception 'R31g: el evento origen no trae el origen y el detalle (%).', v_ev.despues;
  end if;
  -- Volver a fijar el MISMO origen no es un cambio: cero eventos nuevos.
  perform fijar_origen_tenant(v_lub, 'meta', 'campaña R31');
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'origen';
  if v_n <> 1 then
    raise exception 'R31g: fijar el mismo origen dos veces dejó % eventos. El trigger compara con `is distinct from`: sin cambio no hay evento.', v_n;
  end if;

  -- ---------- a · Inmutable ----------
  -- Como postgres, el dueño de la tabla: el candado es contra el script de
  -- limpieza que corre con ese rol. (A `authenticated` el RLS ya le
  -- contesta cero filas sin error.)
  execute 'reset role';
  v_ok := false;
  begin
    update tenant_eventos set motivo = 'x' where id = v_ev.id;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%evento_no_se_edita%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31a UN UPDATE SOBRE tenant_eventos PASÓ. La tabla es append-only: sin el candado de edición, un `update … set motivo` reescribe la historia y sigue pareciendo historia.';
  end if;

  v_ok := false;
  begin
    delete from tenant_eventos where id = v_ev.id;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%evento_no_se_borra%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31a UN DELETE SOBRE tenant_eventos PASÓ con el tenant vivo. Es la memoria de las bajas y el churn: no se borra mientras el lubricentro exista.';
  end if;

  v_ok := false;
  begin
    truncate tenant_eventos;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%eventos_no_se_vacian%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31a UN TRUNCATE SOBRE tenant_eventos PASÓ. Un trigger `before delete for each row` no se despierta con un truncate: hace falta el `for each statement`.';
  end if;

  execute 'set local role authenticated';

  -- ---------- f · Suspender con motivo ----------
  v_ok := false;
  begin
    perform cambiar_estado_lubricentro(v_lub, false, null, null);
    v_ok := true;
  exception when others then
    if sqlerrm not like '%motivo_vacio%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31f: se suspendió un lubricentro SIN motivo. El motivo es lo que separa el churn voluntario del involuntario; sin él la métrica no existe.';
  end if;

  v_ok := false;
  begin
    perform cambiar_estado_lubricentro(v_lub, false, 'otro', '   ');
    v_ok := true;
  exception when others then
    if sqlerrm not like '%detalle_vacio%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31f: «Otro» sin detalle pasó. Un «otro» pelado en el historial no le dice nada a nadie seis meses después.';
  end if;

  perform cambiar_estado_lubricentro(v_lub, false, 'falta_de_pago', null);

  select * into v_l from lubricentros where id = v_lub;
  if v_l.activo then
    raise exception 'R31f: cambiar_estado_lubricentro(false) no apagó `activo`. El panel del owner sigue escribiendo.';
  end if;

  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'suspension';
  if v_n <> 1 then
    raise exception 'R31f LA SUSPENSIÓN NO DEJÓ EVENTO (% en vez de 1). Sin `suspension` no hay bajas por mes.', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'suspension';
  if v_ev.motivo is distinct from 'falta_de_pago' then
    raise exception 'R31f: el evento suspension quedó con motivo «%» en vez de «falta_de_pago». El GUC app.motivo_evento no llegó del set_config() de la función al trigger.', v_ev.motivo;
  end if;
  if v_ev.actor is distinct from v_super then
    raise exception 'R31f: el evento suspension quedó con actor % en vez del superadmin de la sesión.', v_ev.actor;
  end if;

  -- ---------- e · es_activo con el interruptor manual ----------
  if es_activo(v_l) then
    raise exception 'R31e: es_activo() dio true para un tenant con activo = false. Es LA definición de docs/METRICAS.md § 1 y acaba de fallar en su caso más simple.';
  end if;
  if mrr_de_tenant(v_lub) <> 0 then
    raise exception 'R31d: un tenant suspendido a mano tiene MRR % en vez de 0.', mrr_de_tenant(v_lub);
  end if;

  perform cambiar_estado_lubricentro(v_lub, true, null, null);
  select * into v_l from lubricentros where id = v_lub;
  if not es_activo(v_l) then
    raise exception 'R31e: reactivado, es_activo() sigue en false.';
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'reactivacion';
  if v_n <> 1 then
    raise exception 'R31f: la reactivación no dejó el evento reactivacion (% en vez de 1).', v_n;
  end if;

  -- ---------- e · es_activo con el reloj en 'suspendido' ----------
  -- Adentro del reloj, con el segundo interruptor prendido, con UN pago
  -- (para no caer en la rama del que nunca pagó) y vencido hace 30 días:
  -- pasada la gracia de 7, estado_cobranza() da 'suspendido' con activo
  -- todavía en true. Es exactamente la baja que nadie apagó a mano.
  -- Con created_at anterior a v_dia: es el tenant que va a aparecer en las
  -- fotos de la sección c.
  insert into lubricentros (nombre, slug, cobranza_desde, suspension_automatica, created_at)
  values ('Reloj R31', 'reloj-r27', v_hoy - 60, true,
          (v_dia - 10)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  returning id into v_lub2;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (v_lub2, v_plan, 'activa', 'mensual', 0, v_hoy - 60, v_hoy - 30) returning id into v_sus2;
  insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago)
  values (v_lub2, v_sus2, v_super, v_hoy - 60, v_hoy - 30, 49000, v_hoy - 60);

  select * into v_l from lubricentros where id = v_lub2;
  if reloj_cobranza(v_l) ->> 'estado' is distinct from 'suspendido' then
    raise exception 'R31e SIN PISO: el tenant de prueba tenía que estar en «suspendido» por reloj y está en «%».', reloj_cobranza(v_l) ->> 'estado';
  end if;
  if v_l.activo is distinct from true then
    raise exception 'R31e SIN PISO: lubricentros.activo tenía que seguir en true (nadie lo apagó a mano).';
  end if;
  if es_activo(v_l) then
    raise exception 'R31e es_activo() DIO TRUE PARA UN TENANT QUE EL RELOJ TIENE EN «suspendido». "Activo" es lubricentros.activo Y el reloj (docs/METRICAS.md § 1): mirando solo la columna, los suspendidos por reloj cuentan como activos y el MRR y el churn mienten.';
  end if;
  if mrr_de_tenant(v_lub2) <> 0 then
    raise exception 'R31d: un tenant suspendido por reloj tiene MRR % en vez de 0.', mrr_de_tenant(v_lub2);
  end if;

  -- ---------- b · Un pago, un evento; y el pago sobrevive al trigger roto ----------
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub2 and tipo = 'pago';
  if v_n <> 1 then
    raise exception 'R31b UN INSERT EN pagos DEJÓ % EVENTOS `pago` (tenía que dejar exactamente 1). El trigger de pagos es lo único que cubre las dos puertas del cobro sin tocarlas.', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub2 and tipo = 'pago';
  if (v_ev.despues ->> 'monto')::numeric <> 49000 or v_ev.despues ->> 'origen' is distinct from 'manual' then
    raise exception 'R31b: el evento pago no trae el monto y el origen (%).', v_ev.despues;
  end if;

  -- El sabotaje: un BEFORE INSERT sobre tenant_eventos que revienta. El
  -- pago tiene que entrar igual (savepoint) y NO dejar evento. Crear el
  -- trigger es cosa del dueño de la tabla.
  execute 'reset role';
  execute 'create trigger r31_sabotaje before insert on tenant_eventos for each row execute function r31_sabotaje()';
  begin
    insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago)
    values (v_lub2, v_sus2, v_super, v_hoy - 29, v_hoy + 1, 49000, v_hoy - 29)
    returning id into v_pago;
  exception when others then
    execute 'drop trigger r31_sabotaje on tenant_eventos';
    raise exception 'R31b EL TRIGGER ROTO BLOQUEÓ EL PAGO: «%». La instrumentación tiene que ser defensiva (begin … exception when others then raise warning): un fallo al registrar el evento NUNCA puede impedir que se registre un cobro.', sqlerrm;
  end;
  execute 'drop trigger r31_sabotaje on tenant_eventos';
  execute 'set local role authenticated';

  if not exists (select 1 from pagos where id = v_pago) then
    raise exception 'R31b: el pago no quedó registrado con el trigger roto.';
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub2 and tipo = 'pago';
  if v_n <> 1 then
    raise exception 'R31b: con el insert del evento saboteado igual aparecieron % eventos pago (tenía que seguir en 1).', v_n;
  end if;

  -- ---------- g · El override deja el módulo con su motivo ----------
  perform fijar_override_plan(v_lub, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · pago · ' || to_char(v_hoy, 'DD/MM/YYYY') || ' · prueba R31');
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'modulo_activado';
  if v_n <> 1 then
    raise exception 'R31g: prender el módulo no dejó el evento modulo_activado (% en vez de 1).', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'modulo_activado';
  -- `is null or`: un motivo null NO matchea el `not like` (da null, no true) y
  -- el chequeo pasaba en verde sin motivo. Lo vio scripts/regresion-metricas.sh.
  if v_ev.motivo is null or v_ev.motivo not like 'Módulo gomería · pago · %'
     or v_ev.despues ->> 'modulo' is distinct from 'neumaticos' then
    raise exception 'R31g: el evento modulo_activado no trae el motivo del override ni el módulo (motivo «%», despues %). El motivo es la única constancia de si el módulo se cobra.', v_ev.motivo, v_ev.despues;
  end if;

  -- ---------- d · La plata: una sola cuenta ----------
  if (monto_de_renovacion_en(v_lub, 'mensual') ->> 'modulo')::numeric <= 0 then
    raise exception 'R31d SIN PISO: el módulo pago no entra en monto_de_renovacion_en() (modulo_es_pago no lo cobra).';
  end if;
  v_esperado := round((monto_de_renovacion_en(v_lub, 'mensual') ->> 'total')::numeric / meses_del_periodo('mensual'), 2);
  if mrr_de_tenant(v_lub) is distinct from v_esperado then
    raise exception 'R31d DOS CUENTAS PARA LA MISMA PLATA: mrr_de_tenant() dice % y monto_de_renovacion_en()/meses dice %. El MRR sale de la MISMA función que la pantalla de pago del cliente, con el módulo adentro.', mrr_de_tenant(v_lub), v_esperado;
  end if;
  if v_esperado <= (monto_de_renovacion_en(v_lub, 'mensual') ->> 'plan')::numeric then
    raise exception 'R31d: el MRR con módulo pago (%) no es mayor que el plan solo (%). El módulo se quedó afuera del MRR otra vez.', v_esperado, monto_de_renovacion_en(v_lub, 'mensual') ->> 'plan';
  end if;

  -- Anual: el total del año, dividido 12. Y el cambio de período deja su evento.
  select id into v_sus from suscripciones where lubricentro_id = v_lub order by inicio desc, created_at desc limit 1;
  update suscripciones set periodo = 'anual' where id = v_sus;
  v_esperado := round((monto_de_renovacion_en(v_lub, 'anual') ->> 'total')::numeric / 12, 2);
  if mrr_de_tenant(v_lub) is distinct from v_esperado then
    raise exception 'R31d: con período anual mrr_de_tenant() dice % y el total del año dividido 12 es %. El MRR es el abono MENSUALIZADO: el anual entra dividido 12 y el semestral dividido 6.', mrr_de_tenant(v_lub), v_esperado;
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub and tipo = 'cambio_plan';
  if v_n <> 1 then
    raise exception 'R31g: cambiar el período no dejó el evento cambio_plan (% en vez de 1).', v_n;
  end if;

  -- Exento: activo con MRR 0.
  update suscripciones set descuento_pct = 100 where id = v_sus;
  select * into v_l from lubricentros where id = v_lub;
  if not es_activo(v_l) then
    raise exception 'R31e: un exento (descuento 100) dejó de ser activo. Los exentos son activos con MRR 0.';
  end if;
  if mrr_de_tenant(v_lub) <> 0 then
    raise exception 'R31d: un exento tiene MRR % en vez de 0.', mrr_de_tenant(v_lub);
  end if;
  update suscripciones set descuento_pct = 0, periodo = 'mensual' where id = v_sus;

  -- La suma.
  select coalesce(sum(mrr_de_tenant(id)), 0) into v_suma from lubricentros;
  if mrr_plataforma() is distinct from round(v_suma, 2) then
    raise exception 'R31d: mrr_plataforma() dice % y la suma de mrr_de_tenant() da %.', mrr_plataforma(), v_suma;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- c · cerrar_dia: idempotente, y las transiciones del reloj ----------
  -- Se cierra un día del pasado lejano (v_dia), único por corrida. El
  -- único tenant que existía ese día es el del reloj (v_lub2, nacido
  -- diez días antes): la foto tiene que traerlo y a nadie más.
  select cerrar_dia(v_dia, 1450, 1430, 'prueba R31') into v_res;
  if v_res is distinct from 'cerrado' then
    raise exception 'R31c: la primera llamada a cerrar_dia() devolvió «%» en vez de «cerrado».', v_res;
  end if;
  select count(*) into v_n from snapshots_diarios where fecha = v_dia;
  select count(*) into v_m from snapshots_tenant_diarios where fecha = v_dia;
  if v_n <> 1 then
    raise exception 'R31c: cerrar_dia() dejó % filas en snapshots_diarios para la fecha (tenía que dejar 1).', v_n;
  end if;
  select count(*) into v_esperado from lubricentros
   where created_at < ((v_dia + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
  if v_m <> v_esperado or v_m <> 1 then
    raise exception 'R31c: snapshots_tenant_diarios tiene % filas para la fecha, había % tenants ese día y tenía que ser 1 (el del reloj). La foto entra por created_at.', v_m, v_esperado;
  end if;
  if (select activo from snapshots_tenant_diarios where fecha = v_dia and lubricentro_id = v_lub2) then
    raise exception 'R31c: la foto del tenant suspendido por reloj dice activo = true. La foto usa es_activo(), la única definición.';
  end if;
  if (select tenants_suspendidos from snapshots_diarios where fecha = v_dia) <> 1
     or (select mrr_ars from snapshots_diarios where fecha = v_dia) <> 0 then
    raise exception 'R31c: el agregado del día no cuadra con la foto del tenant (suspendidos = %, mrr = %).',
      (select tenants_suspendidos from snapshots_diarios where fecha = v_dia),
      (select mrr_ars from snapshots_diarios where fecha = v_dia);
  end if;
  select venta into v_venta from tipo_cambio where fecha = v_dia;
  if v_venta is distinct from 1450 then
    raise exception 'R31c: cerrar_dia() no dejó el tipo de cambio del día (venta = %).', v_venta;
  end if;

  -- La segunda vez: nada.
  select cerrar_dia(v_dia, 9999, 9999, 'segunda vez') into v_res;
  if v_res is distinct from 'ya cerrado' then
    raise exception 'R31c CERRAR DOS VECES EL MISMO DÍA NO DEVOLVIÓ «ya cerrado» (dio «%»). El cron reintenta; sin idempotencia, la segunda corrida pisa o duplica la foto.', v_res;
  end if;
  if (select count(*) from snapshots_diarios where fecha = v_dia) <> 1
     or (select count(*) from snapshots_tenant_diarios where fecha = v_dia) <> 1
     or (select venta from tipo_cambio where fecha = v_dia) is distinct from 1450 then
    raise exception 'R31c: la segunda llamada a cerrar_dia() cambió filas (snapshots o tipo de cambio).';
  end if;

  -- LAS TRANSICIONES. El tenant vuelve a estar al día (vence en 30 días):
  -- el cierre del día siguiente lo ve pasar de inactivo a activo sin un
  -- evento manual, y tiene que escribir reactivacion_reloj.
  update suscripciones set vencimiento = v_hoy + 30 where id = v_sus2;
  select cerrar_dia(v_dia + 1, 1450, 1430, 'prueba R31') into v_res;
  if v_res is distinct from 'cerrado' then
    raise exception 'R31c: el cierre del segundo día devolvió «%».', v_res;
  end if;
  select count(*) into v_n from tenant_eventos
   where lubricentro_id = v_lub2 and tipo = 'reactivacion_reloj';
  if v_n <> 1 then
    raise exception 'R31c EL CIERRE NO VIO LA REACTIVACIÓN POR RELOJ (% eventos reactivacion_reloj). Comparar la foto de hoy con la del último día cerrado es lo único que registra las vueltas que nadie hizo a mano.', v_n;
  end if;

  -- Y al revés: vence de nuevo hace 30 días, nadie lo apagó a mano, y el
  -- cierre del tercer día escribe suspension_reloj — que es una BAJA del día.
  update suscripciones set vencimiento = v_hoy - 30 where id = v_sus2;
  select cerrar_dia(v_dia + 2, 1450, 1430, 'prueba R31') into v_res;
  select count(*) into v_n from tenant_eventos
   where lubricentro_id = v_lub2 and tipo = 'suspension_reloj';
  if v_n <> 1 then
    raise exception 'R31c EL CIERRE NO VIO LA SUSPENSIÓN POR RELOJ (% eventos suspension_reloj). Sin esto, las bajas involuntarias no existen: el reloj suspende sin dejar rastro.', v_n;
  end if;
  select * into v_ev from tenant_eventos where lubricentro_id = v_lub2 and tipo = 'suspension_reloj';
  if v_ev.origen_evento <> 'sistema' or v_ev.actor is not null
     or v_ev.despues ->> 'estado_reloj' is distinct from 'suspendido' then
    raise exception 'R31c: el evento suspension_reloj no es del sistema o no trae el estado del reloj (origen «%», actor %, despues %).', v_ev.origen_evento, v_ev.actor, v_ev.despues;
  end if;
  if (select bajas_dia from snapshots_diarios where fecha = v_dia + 2) <> 1 then
    raise exception 'R31c: la baja por reloj no se contó en bajas_dia del día (%).', (select bajas_dia from snapshots_diarios where fecha = v_dia + 2);
  end if;
  -- Mover el vencimiento no es un cambio de plan.
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub2 and tipo = 'cambio_plan';
  if v_n <> 0 then
    raise exception 'R31g: mover el vencimiento dejó % eventos cambio_plan. Solo plan, período y descuento son cambio de plan; el ciclo lo cuenta el pago.', v_n;
  end if;

  -- Y un día que no terminó no se cierra.
  v_ok := false;
  begin
    perform cerrar_dia(v_hoy, 1450, 1430, 'hoy');
    v_ok := true;
  exception when others then
    if sqlerrm not like '%dia_no_terminado%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31c: cerrar_dia() cerró HOY. Un día se cierra cuando terminó; una foto de las 15:00 no es un cierre.';
  end if;

  -- El snapshot también es inmutable.
  v_ok := false;
  begin
    update snapshots_diarios set mrr_ars = 0 where fecha = v_dia;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%snapshot_no_se_edita%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R31c: un UPDATE sobre snapshots_diarios pasó. Los históricos se leen, no se corrigen.';
  end if;

  -- ---------- limpieza ----------
  -- Los eventos y los snapshots de los tenants de prueba se van con el
  -- cascade; lo demás, a mano, como en los otros bloques.
  delete from pagos where lubricentro_id in (v_lub, v_lub2);
  delete from cambios_override_plan where lubricentro_id = v_lub;
  delete from sucursales where lubricentro_id = v_lub;
  delete from mensaje_templates where lubricentro_id = v_lub;
  delete from config_experiencia where lubricentro_id = v_lub;
  delete from suscripciones where lubricentro_id in (v_lub, v_lub2);
  delete from lubricentros where id in (v_lub, v_lub2);
end $$;

drop function r31_sabotaje();

-- ---------- h · Después del seed, la memoria está completa ----------
-- Fuera del `do` de arriba, con los tenants de prueba ya borrados: queda
-- lo que dejó el seed. Un `alta` por lubricentro, y cada pago con
-- exactamente un evento. Es la afirmación que el backfill (20260922205000)
-- tiene que cumplir en producción: se comprueba contra prod después del
-- push (docs/METRICAS.md § 5).
do $$
declare
  v_altas   integer;
  v_lubs    integer;
  v_sin     integer;
  v_dobles  integer;
begin
  select count(*) into v_altas from tenant_eventos where tipo = 'alta';
  select count(*) into v_lubs  from lubricentros;
  if v_altas <> v_lubs then
    raise exception 'R31h HAY % EVENTOS alta PARA % LUBRICENTROS. Cada tenant tiene exactamente un alta: los del seed por el trigger diferido, los de producción por el backfill.', v_altas, v_lubs;
  end if;

  select count(*) into v_sin
    from pagos p
   where not exists (select 1 from tenant_eventos e where e.tipo = 'pago' and e.despues ->> 'pago_id' = p.id::text);
  if v_sin <> 0 then
    raise exception 'R31h HAY % PAGO(S) SIN EVENTO. El trigger de pagos o el backfill dejaron un cobro fuera de la memoria.', v_sin;
  end if;

  select count(*) into v_dobles
    from (select e.despues ->> 'pago_id' from tenant_eventos e where e.tipo = 'pago'
           group by 1 having count(*) > 1) d;
  if v_dobles <> 0 then
    raise exception 'R31h HAY % PAGO(S) CON MÁS DE UN EVENTO. El backfill no es idempotente o el trigger emitió dos veces.', v_dobles;
  end if;
end $$;
-- <<< R31


-- ============================================================
-- R32 · LO QUE LEEN EL RESUMEN Y EL LISTADO DE /fidelli (bloque MÉTRICAS 2)
--
-- La migración 20260923100000 agrega las lecturas de las pantallas nuevas
-- al lado de las funciones de siempre. Lo que este bloque sostiene:
--
--   a · La guarda: un owner NO lee salud_tenants(), indicadores_tenants(),
--       trabajos_semanales(), resumen_admin() ni metricas_plataforma()
--       (42501 antes de tocar nada). Son invoker y el RLS es la segunda
--       capa, pero la primera es la que explica.
--   b · La exención del 100% vive en estado_atencion() y en ningún otro
--       lado: un bonificado con el vencimiento pasado NO tiene la salud en
--       «cobro vencido»; el mismo tenant sin descuento, sí, y el motivo
--       dice hace cuánto. Es el caso Brothers Oil (R24), ahora en la salud.
--   c · Los cortes de actividad: nunca cargó → sin actividad; último
--       trabajo hace 9 días → sin actividad; hace 5 → actividad baja; hoy →
--       al día con la cuenta de la semana. Suspendido a mano → sin salud.
--       Cada uno con su oración.
--   d · trabajos_semanales(): 12 filas por tenant, las semanas en cero
--       incluidas; la suma es la cantidad de trabajos DE CUALQUIER TIPO en
--       la ventana; con tenant filtra; sin tenant trae a todos; el tope de
--       semanas se respeta.
--   e · indicadores_tenants(): trabajos_30 cuenta los tres tipos, el MRR es
--       el de mrr_de_tenant(), activo es es_activo() y el último trabajo es
--       el último.
--   f · metricas_plataforma() cuenta trabajos de cualquier tipo: una
--       mecánica suma uno al mes y a la serie diaria.
--   g · resumen_admin(): activos = es_activo(); trabajos del mes = la suma
--       de los tres tipos = las filas no anuladas del mes; el alta de este
--       tenant cuenta en las altas del mes; sin_origen cuenta; un activo
--       que dejó de cargar hace 20 días aparece en sin_trabajos con sus
--       días; cierre_ayer dice si hay snapshot de ayer; el MRR en USD es el
--       de ARS sobre el tipo de cambio vigente.
--
-- Corre como el superadmin del seed bajo el rol `authenticated` (el rol
-- con el que PostgREST ejecuta estas funciones); los fixtures se escriben
-- como postgres. Se limpia al final. scripts/regresion-metricas.sh rompe
-- cada regla y espera ver este bloque en rojo.
-- ============================================================

-- >>> R32
do $$
declare
  v_hoy     date := current_date;
  v_super   uuid;
  v_owner   uuid;
  v_plan    uuid;
  v_lub     uuid;
  v_sus     uuid;
  v_suc     uuid;
  v_cli     uuid;
  v_veh     uuid;
  v_n       integer;
  v_m       integer;
  v_antes   integer;
  v_despues integer;
  v_ok      boolean;
  v_j       jsonb;
  v_tc      tipo_cambio;
  r         record;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select u.id into v_owner
    from usuarios u join lubricentros l on l.id = u.lubricentro_id
   where l.slug = 'demo' and u.rol = 'owner' limit 1;
  select id into v_plan from planes where nombre = 'Pro' and not heredado;
  if v_super is null or v_owner is null or v_plan is null then
    raise exception 'R32 SIN PISO: falta el superadmin, el owner del demo o el plan Pro del seed.';
  end if;

  -- ---------- a · La guarda ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  for r in select unnest(array[
      'select count(*) from salud_tenants()',
      'select count(*) from indicadores_tenants()',
      'select count(*) from trabajos_semanales()',
      'select resumen_admin()',
      'select metricas_plataforma()']) as consulta
  loop
    v_ok := false;
    begin
      execute r.consulta;
      v_ok := true;
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
    if v_ok then
      raise exception 'R32a UN OWNER PUDO EJECUTAR «%». Las lecturas del admin son invoker con guarda soy_superadmin(): sin la guarda, el RLS de lubricentros le devuelve su propia fila y la función contesta la salud, el MRR y los trabajos del tenant como si fuera el admin — y la del resumen le cuenta la plataforma entera.', r.consulta;
    end if;
  end loop;

  -- De acá en adelante, el superadmin.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  -- El fixture: un tenant recién nacido (activa, vence mañana, sin trabajos).
  select crear_lubricentro('Salud R32', 'salud-r32',
    '[{"nombre":"Centro"}]'::jsonb, v_plan, 'mensual', 0) into v_lub;
  set constraints all immediate;
  select s.id into v_sus from suscripciones s where s.lubricentro_id = v_lub
    order by s.inicio desc, s.created_at desc limit 1;
  select id into v_suc from sucursales where lubricentro_id = v_lub limit 1;

  -- Un cliente y un auto para poder cargarle trabajos. Como postgres:
  -- son fixtures, no el camino del producto.
  execute 'reset role';
  insert into clientes (lubricentro_id, nombre, telefono)
  values (v_lub, 'Cliente R32', '3510000000') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  values (v_lub, v_cli, 'AB123CD', 'AB123CD', 'Fiat', 'Uno') returning id into v_veh;

  -- ---------- b · La exención vive en estado_atencion() ----------
  -- El alta la dejó con inicio = hoy y vencimiento = mañana; para vencerla
  -- hace 10 días hay que correr el inicio también (CHECK vencimiento_posterior).
  update suscripciones set descuento_pct = 100, inicio = v_hoy - 40, vencimiento = v_hoy - 10 where id = v_sus;
  execute 'set local role authenticated';

  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.lubricentro_id is null then
    raise exception 'R32 SIN PISO: salud_tenants() no devolvió la fila del tenant de prueba.';
  end if;
  if r.salud = 'cobro_vencido' then
    raise exception 'R32b UN BONIFICADO (100%%) CON EL VENCIMIENTO PASADO TIENE LA SALUD EN «cobro_vencido» (motivo: «%»). Quien no paga nada no puede deber nada: la exención vive en estado_atencion() y la salud tiene que preguntarle a ELLA, no mirar la fecha. Es el caso Brothers Oil de R24, otra vez.', r.motivo;
  end if;

  execute 'reset role';
  update suscripciones set descuento_pct = 0 where id = v_sus;
  execute 'set local role authenticated';

  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'cobro_vencido' then
    raise exception 'R32b: el mismo tenant SIN descuento y vencido hace 10 días tiene la salud en «%» en vez de «cobro_vencido».', r.salud;
  end if;
  if r.motivo is distinct from 'venció hace 10 días' then
    raise exception 'R32b: el motivo del cobro vencido dice «%» y tenía que decir «venció hace 10 días».', r.motivo;
  end if;

  -- Al día con la plata: de acá en adelante manda la actividad.
  execute 'reset role';
  update suscripciones set vencimiento = v_hoy + 20 where id = v_sus;
  execute 'set local role authenticated';

  -- ---------- c · Los cortes de actividad ----------
  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'sin_actividad' or r.motivo is distinct from 'nunca cargó un trabajo' or r.ultimo_trabajo is not null then
    raise exception 'R32c: sin ningún trabajo la salud dio «%» con motivo «%» (tenía que ser sin_actividad · «nunca cargó un trabajo»).', r.salud, r.motivo;
  end if;

  execute 'reset role';
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha,
                        kilometros, aceite_tipo, prox_service_km)
  values (v_lub, v_suc, v_veh, v_super, 'service', v_hoy - 9, 50000, '10W40', 60000);
  execute 'set local role authenticated';

  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'sin_actividad' or r.motivo is distinct from 'sin trabajos hace 9 días' then
    raise exception 'R32c: con el último trabajo hace 9 días la salud dio «%» · «%» (tenía que ser sin_actividad · «sin trabajos hace 9 días»). El corte de actividad baja es 7.', r.salud, r.motivo;
  end if;

  -- Una MECÁNICA hace 5 días: cuenta como trabajo (docs/METRICAS.md § 1).
  execute 'reset role';
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha,
                        kilometros, trabajo_descripcion)
  values (v_lub, v_suc, v_veh, v_super, 'mecanica', v_hoy - 5, 51000, 'Cambio de pastillas de freno');
  execute 'set local role authenticated';

  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'actividad_baja' or r.motivo is distinct from 'último trabajo hace 5 días' then
    raise exception 'R32c: con una mecánica hace 5 días la salud dio «%» · «%» (tenía que ser actividad_baja · «último trabajo hace 5 días»). O la mecánica no cuenta como trabajo, o el corte de «al día» no es 3.', r.salud, r.motivo;
  end if;

  execute 'reset role';
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha,
                        kilometros, aceite_tipo, prox_service_km)
  values (v_lub, v_suc, v_veh, v_super, 'service', v_hoy, 52000, '10W40', 62000);
  execute 'set local role authenticated';

  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'al_dia' or r.motivo is distinct from '2 trabajos en 7 días' or r.ultimo_trabajo is distinct from v_hoy then
    raise exception 'R32c: con un trabajo hoy la salud dio «%» · «%» · último % (tenía que ser al_dia · «2 trabajos en 7 días» · hoy: el de hace 9 días queda afuera de la semana).', r.salud, r.motivo, r.ultimo_trabajo;
  end if;

  -- Suspendido a mano no tiene salud: no es trabajo de hoy.
  perform cambiar_estado_lubricentro(v_lub, false, 'pedido_del_cliente', null);
  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is not null or r.motivo is not null then
    raise exception 'R32c: un tenant suspendido a mano tiene salud «%». La columna de estado ya dice «Suspendido»; la salud es para los que están operando.', r.salud;
  end if;
  perform cambiar_estado_lubricentro(v_lub, true, null, null);

  -- ---------- d · trabajos_semanales ----------
  select count(*), coalesce(sum(cantidad), 0) into v_n, v_m from trabajos_semanales(v_lub, 12);
  if v_n <> 12 then
    raise exception 'R32d trabajos_semanales(tenant, 12) DEVOLVIÓ % FILAS (tenía que devolver 12, las semanas en cero incluidas). El sparkline no rellena huecos: los espera de la base.', v_n;
  end if;
  if v_m <> 3 then
    raise exception 'R32d: la suma de las 12 semanas es % y los trabajos de la ventana son 3 (un service hace 9 días, una mecánica hace 5 y un service hoy). O falta un tipo, o se cae una semana.', v_m;
  end if;
  select count(*) into v_n from trabajos_semanales(v_lub, 12) where cantidad > 0;
  if v_n < 1 or v_n > 3 then
    raise exception 'R32d: los 3 trabajos cayeron en % semanas con cantidad > 0 (esperaba entre 1 y 3).', v_n;
  end if;
  select count(*) into v_n from trabajos_semanales(null, 12);
  if v_n <> 12 * (select count(*) from lubricentros) then
    raise exception 'R32d: sin tenant, trabajos_semanales() devolvió % filas para % lubricentros (tenía que ser 12 por tenant).', v_n, (select count(*) from lubricentros);
  end if;
  v_ok := false;
  begin
    perform count(*) from trabajos_semanales(null, 200);
    v_ok := true;
  exception when others then
    if sqlerrm not like '%semanas_fuera_de_rango%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R32d: trabajos_semanales() aceptó 200 semanas. El tope es 104.';
  end if;

  -- ---------- e · indicadores_tenants ----------
  select * into r from indicadores_tenants() where lubricentro_id = v_lub;
  if r.lubricentro_id is null then
    raise exception 'R32 SIN PISO: indicadores_tenants() no devolvió la fila del tenant de prueba.';
  end if;
  if r.trabajos_30 <> 3 then
    raise exception 'R32e trabajos_30 = % PARA 3 TRABAJOS EN 30 DÍAS (service hace 9, mecánica hace 5, service hoy). O la ventana no es de 30 días, o un tipo no cuenta.', r.trabajos_30;
  end if;
  if r.mrr_ars is distinct from mrr_de_tenant(v_lub) or r.mrr_ars <= 0 then
    raise exception 'R32e: el MRR de la fila es % y mrr_de_tenant() dice %. La tabla tiene que mostrar EL MISMO número que el snapshot y el resumen: sale de mrr_de_tenant(), no de otra cuenta.', r.mrr_ars, mrr_de_tenant(v_lub);
  end if;
  if not r.es_activo or r.exento then
    raise exception 'R32e: un tenant activo, con reloj al día y sin descuento salió con es_activo = % y exento = %.', r.es_activo, r.exento;
  end if;
  if r.ultimo_trabajo is distinct from v_hoy then
    raise exception 'R32e: ultimo_trabajo = % con un trabajo cargado hoy.', r.ultimo_trabajo;
  end if;
  if r.estado_reloj is distinct from (select reloj_cobranza(l) ->> 'estado' from lubricentros l where l.id = v_lub) then
    raise exception 'R32e: estado_reloj «%» no coincide con reloj_cobranza().', r.estado_reloj;
  end if;

  -- ---------- f · metricas_plataforma cuenta todos los tipos ----------
  v_j := metricas_plataforma();
  v_antes := (v_j ->> 'trabajos_mes')::integer;
  v_m := ((v_j -> 'series' -> 'dia') -> (jsonb_array_length(v_j -> 'series' -> 'dia') - 1) ->> 'cantidad')::integer;
  if v_j -> 'series' -> 'dia' -> (jsonb_array_length(v_j -> 'series' -> 'dia') - 1) ->> 'inicio' is distinct from v_hoy::text then
    raise exception 'R32 SIN PISO: el último punto de la serie diaria no es hoy (%).', v_j -> 'series' -> 'dia';
  end if;

  execute 'reset role';
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha,
                        kilometros, trabajo_descripcion)
  values (v_lub, v_suc, v_veh, v_super, 'mecanica', v_hoy, 52100, 'Cambio de correa de distribución');
  execute 'set local role authenticated';

  v_j := metricas_plataforma();
  v_despues := (v_j ->> 'trabajos_mes')::integer;
  if v_despues <> v_antes + 1 then
    raise exception 'R32f UNA MECÁNICA NO SUMÓ EN trabajos_mes (% → %). metricas_plataforma() tiene que contar trabajos DE CUALQUIER TIPO (docs/METRICAS.md § 1): con el filtro tipo = ''service'' de vuelta, el Pulso vuelve a mentir.', v_antes, v_despues;
  end if;
  v_n := ((v_j -> 'series' -> 'dia') -> (jsonb_array_length(v_j -> 'series' -> 'dia') - 1) ->> 'cantidad')::integer;
  if v_n <> v_m + 1 then
    raise exception 'R32f: la mecánica de hoy no sumó en el último punto de la serie diaria (% → %).', v_m, v_n;
  end if;
  if v_j ? 'services_mes' then
    raise exception 'R32f: metricas_plataforma() sigue devolviendo la clave vieja `services_mes`. El contrato nuevo es `trabajos_mes`.';
  end if;

  -- ---------- g · resumen_admin ----------
  v_j := resumen_admin();

  if (v_j ->> 'activos')::integer <> (select count(*) from lubricentros l where es_activo(l)) then
    raise exception 'R32g: activos = % y es_activo() cuenta %. Es LA definición de docs/METRICAS.md § 1; el resumen no tiene otra.', v_j ->> 'activos', (select count(*) from lubricentros l where es_activo(l));
  end if;
  if (v_j ->> 'trabajos_mes')::integer
     <> (v_j ->> 'trabajos_service')::integer + (v_j ->> 'trabajos_mecanica')::integer + (v_j ->> 'trabajos_neumaticos')::integer then
    raise exception 'R32g TRABAJOS DEL MES (%) NO ES LA SUMA DE LOS TRES TIPOS (% + % + %). El número grande cuenta cualquier tipo y el desglose lo explica: si no cierran, uno de los dos miente.',
      v_j ->> 'trabajos_mes', v_j ->> 'trabajos_service', v_j ->> 'trabajos_mecanica', v_j ->> 'trabajos_neumaticos';
  end if;
  if (v_j ->> 'trabajos_mes')::integer
     <> (select count(*) from services where not anulado and fecha >= date_trunc('month', current_date)) then
    raise exception 'R32g: trabajos_mes = % y las filas no anuladas del mes son %.', v_j ->> 'trabajos_mes', (select count(*) from services where not anulado and fecha >= date_trunc('month', current_date));
  end if;
  if (v_j ->> 'altas_mes')::integer < 1 then
    raise exception 'R32g: el alta de hoy no cuenta en altas_mes (%).', v_j ->> 'altas_mes';
  end if;
  if (v_j ->> 'sin_origen')::integer <> (select count(*) from lubricentros where origen is null) then
    raise exception 'R32g: sin_origen = % y los lubricentros sin origen son %.', v_j ->> 'sin_origen', (select count(*) from lubricentros where origen is null);
  end if;
  if (v_j ->> 'cierre_ayer')::boolean is distinct from exists (select 1 from snapshots_diarios where fecha = v_hoy - 1) then
    raise exception 'R32g: cierre_ayer = % y el snapshot de ayer %.', v_j ->> 'cierre_ayer',
      case when exists (select 1 from snapshots_diarios where fecha = v_hoy - 1) then 'existe' else 'no existe' end;
  end if;
  v_tc := tc_vigente(v_hoy);
  if v_tc.venta is not null and (v_j ->> 'mrr_usd')::numeric is distinct from round((v_j ->> 'mrr_ars')::numeric / v_tc.venta, 2) then
    raise exception 'R32g: mrr_usd = % con mrr_ars = % y venta = %.', v_j ->> 'mrr_usd', v_j ->> 'mrr_ars', v_tc.venta;
  end if;
  if v_tc.venta is null and v_j ->> 'mrr_usd' is not null then
    raise exception 'R32g: sin tipo de cambio vigente el MRR en USD tiene que ser null, no %. Nunca se inventa un valor.', v_j ->> 'mrr_usd';
  end if;
  -- Con un trabajo hoy, el tenant no está en sin_trabajos.
  if exists (select 1 from jsonb_array_elements(v_j -> 'sin_trabajos') e where e ->> 'id' = v_lub::text) then
    raise exception 'R32g: un tenant que cargó un trabajo HOY aparece en sin_trabajos.';
  end if;

  -- Todo lo que cargó pasa a hace 20 días: entra en sin_trabajos con sus días.
  execute 'reset role';
  update services set fecha = v_hoy - 20 where lubricentro_id = v_lub;
  execute 'set local role authenticated';
  v_j := resumen_admin();
  select (e ->> 'dias')::integer into v_n
    from jsonb_array_elements(v_j -> 'sin_trabajos') e where e ->> 'id' = v_lub::text;
  if v_n is distinct from 20 then
    raise exception 'R32g UN ACTIVO SIN TRABAJOS HACE 20 DÍAS NO APARECE EN sin_trabajos (o aparece con % días). Es la alerta «<nombre> no carga trabajos hace N días» del Resumen.', v_n;
  end if;
  select * into r from salud_tenants() where lubricentro_id = v_lub;
  if r.salud is distinct from 'sin_actividad' or r.motivo is distinct from 'sin trabajos hace 20 días' then
    raise exception 'R32c: con todo hace 20 días la salud dio «%» · «%».', r.salud, r.motivo;
  end if;

  -- ---------- limpieza ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  delete from services where lubricentro_id = v_lub;
  delete from vehiculos where lubricentro_id = v_lub;
  delete from clientes where lubricentro_id = v_lub;
  delete from cambios_override_plan where lubricentro_id = v_lub;
  delete from sucursales where lubricentro_id = v_lub;
  delete from mensaje_templates where lubricentro_id = v_lub;
  delete from config_experiencia where lubricentro_id = v_lub;
  delete from suscripciones where lubricentro_id = v_lub;
  delete from lubricentros where id = v_lub;
end $$;
-- <<< R32


-- ============================================================
-- R33 · PAUTA, ACTIVACIÓN, USO Y CALCOS (bloque MÉTRICAS 3)
--
-- Las migraciones 20260924100000 a 20260924104000. Lo que este bloque
-- sostiene:
--
--   a · La guarda: un owner no registra contactos, no ve el embudo, no
--       registra calcos ni lee la activación (42501), y el RLS le devuelve
--       cero contactos.
--   b · Cierre y pérdida son excluyentes (el CHECK), y marcar perdido un
--       contacto cerrado se rechaza. El origen de Meta nace en WhatsApp si
--       no se dijo; un contacto de Google no lleva origen.
--   c · marcar_cierre() fija el origen del tenant SOLO si estaba vacío, con
--       el canal (meta → meta, google → google) y deja el evento `origen`;
--       a un tenant que ya tenía origen no lo toca ni le deja evento.
--   d · embudo_pauta() cuenta POR COHORTE: un contacto de la semana 1
--       cerrado en la semana 3 es un cierre de la semana 1 (y de su tasa y
--       su ciclo), mientras que cierres_periodo, el gasto y el CAC van por
--       el período calendario: la semana 3 muestra CAC = 25 con 1 cierre.
--   e · gasto_pauta rechaza una semana que no sea lunes, por la función y
--       por el CHECK.
--   f · pedidos_calcos rechaza UPDATE, DELETE y TRUNCATE.
--   g · registrar_pedido_calcos() deja calcos_entregadas igual a la suma,
--       emite el evento `calcos` y exige el monto si se cobraron.
--   h · Tras el seed, sum(pedidos_calcos.cantidad) = calcos_entregadas para
--       todos, y el backfill es idempotente.
--   i · activacion_tenant() marca activado exactamente en el trabajo 20 del
--       día 7 y no en el día 8; dice «día 3 de 7» en curso; indicadores_tenants()
--       trae activado y dias_alta.
--   j · metricas_plataforma(): en cada punto, service + mecanica +
--       neumaticos = cantidad.
--   k · uso_tenant() y autos_que_volvieron(): un vehículo con un
--       recordatorio antes del trabajo cuenta como auto que volvió.
--   l · El alta deja `estado` en el evento.
--
-- Corre como el superadmin del seed bajo `authenticated`; los fixtures se
-- escriben como postgres. Limpia al final. scripts/regresion-metricas.sh
-- rompe cada regla y espera ver este bloque en rojo.
-- ============================================================

-- >>> R33
-- Un tenant de prueba con su sucursal, un cliente y un auto, con la fecha
-- de alta que se le pida. Se borra al final del bloque.
create or replace function r33_crear_tenant(p_nombre text, p_slug text, p_alta timestamptz)
returns table (lub uuid, suc uuid, veh uuid)
language plpgsql
as $$
declare
  v_lub uuid; v_suc uuid; v_cli uuid; v_veh uuid; v_pat text;
begin
  insert into lubricentros (nombre, slug, created_at) values (p_nombre, p_slug, p_alta) returning id into v_lub;
  insert into sucursales (lubricentro_id, nombre) values (v_lub, 'Centro') returning id into v_suc;
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'Cliente R33', '3510000000') returning id into v_cli;
  v_pat := 'AC' || lpad((floor(random() * 900) + 100)::text, 3, '0') || 'DR';
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  values (v_lub, v_cli, v_pat, v_pat, 'Ford', 'Ranger') returning id into v_veh;
  return query select v_lub, v_suc, v_veh;
end;
$$;

do $$
declare
  v_hoy      date := current_date;
  v_super    uuid;
  v_owner    uuid;
  v_plan     uuid;
  v_lub_a    uuid;   -- sin origen, va a cerrar un contacto de Meta
  v_lub_b    uuid;   -- con origen 'referido': el cierre no lo toca
  v_lub_c    uuid;   -- sin origen, contacto de Google
  v_t1       uuid;   -- activación: día 7 en curso, el trabajo 20 activa
  v_t2       uuid;   -- activación: 19 adentro y el 20 en el día 8
  v_t3       uuid;   -- activación: 3 días de alta, en curso
  v_t4       uuid;   -- alta por crear_lubricentro: el evento con estado
  v_suc      uuid;
  v_veh      uuid;
  v_c1       uuid;   -- contacto Meta, semana 1, cierra en la semana 3
  v_c2       uuid;   -- contacto Meta, semana 1, demo, queda abierto
  v_c3       uuid;   -- contacto Google, semana 3, perdido
  v_c4       uuid;   -- contacto Google, cierra en el tenant C
  v_w1       date := (date_trunc('week', current_date) - interval '3 weeks')::date;
  v_w3       date;
  v_n        integer;
  v_m        integer;
  v_ok       boolean;
  v_j        jsonb;
  v_ev       tenant_eventos;
  r          record;
  i          integer;
begin
  v_w3 := v_w1 + 14;

  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select u.id into v_owner
    from usuarios u join lubricentros l on l.id = u.lubricentro_id
   where l.slug = 'demo' and u.rol = 'owner' limit 1;
  select id into v_plan from planes where nombre = 'Pro' and not heredado;
  if v_super is null or v_owner is null or v_plan is null then
    raise exception 'R33 SIN PISO: falta el superadmin, el owner del demo o el plan Pro del seed.';
  end if;

  -- ---------- Los fixtures, como postgres ----------
  select lub into v_lub_a from r33_crear_tenant('Pauta A R33', 'pauta-a-r33', now() - interval '20 days');
  select lub into v_lub_b from r33_crear_tenant('Pauta B R33', 'pauta-b-r33', now() - interval '20 days');
  select lub into v_lub_c from r33_crear_tenant('Pauta C R33', 'pauta-c-r33', now() - interval '20 days');

  -- T1: alta hace 6 días y 23 horas (día 7 en curso). 19 trabajos adentro.
  select lub, suc, veh into v_t1, v_suc, v_veh from r33_crear_tenant('Activa T1 R33', 'activa-t1-r33', now() - interval '6 days 23 hours');
  for i in 1..19 loop
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                          kilometros, aceite_tipo, prox_service_km)
    values (v_t1, v_suc, v_veh, v_super, 'service', (now() - interval '6 days 23 hours' + (i || ' hours')::interval)::date,
            now() - interval '6 days 23 hours' + (i || ' hours')::interval, 1000 + i, '10W40', 10000);
  end loop;
  -- Un recordatorio para el auto de T1, antes de los trabajos: es un auto
  -- que volvió.
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  values (v_t1, v_veh, v_super, 'proximo', 'whatsapp', now() - interval '6 days 23 hours 30 minutes');

  -- T2: alta hace 10 días. 19 trabajos adentro y el vigésimo en el DÍA 8.
  select lub, suc, veh into v_t2, v_suc, v_veh from r33_crear_tenant('Activa T2 R33', 'activa-t2-r33', now() - interval '10 days');
  for i in 1..19 loop
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                          kilometros, trabajo_descripcion)
    values (v_t2, v_suc, v_veh, v_super, 'mecanica', (now() - interval '10 days' + (i || ' hours')::interval)::date,
            now() - interval '10 days' + (i || ' hours')::interval, 2000 + i, 'Cambio de pastillas de freno');
  end loop;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                        kilometros, aceite_tipo, prox_service_km)
  values (v_t2, v_suc, v_veh, v_super, 'service', (now() - interval '10 days' + interval '7 days 1 hour')::date,
          now() - interval '10 days' + interval '7 days 1 hour', 2100, '10W40', 12000);

  -- T3: alta hace 2 días y 5 horas: día 3 de 7, en curso, sin trabajos.
  select lub into v_t3 from r33_crear_tenant('Activa T3 R33', 'activa-t3-r33', now() - interval '2 days 5 hours');

  -- B ya tiene origen: lo fija la puerta del bloque 1, como superadmin.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_origen_tenant(v_lub_b, 'referido', 'lo trajo Fassetta');

  -- ---------- a · La guarda ----------
  -- Primero un contacto de verdad, para que el RLS tenga algo que esconder.
  v_c1 := registrar_contacto_pauta(v_w1 + 1, 'meta', null, ' 351 555 0101 ');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select count(*) into v_n from contactos_pauta;
  if v_n <> 0 then
    raise exception 'R33a UN OWNER LEE % CONTACTOS DE PAUTA. La tabla es solo superadmin: el RLS tiene que devolverle cero filas.', v_n;
  end if;
  for r in select unnest(array[
      'select registrar_contacto_pauta(current_date, ''meta'', null, null)',
      'select count(*) from embudo_pauta(current_date - 30, current_date, ''semana'')',
      'select embudo_pauta_mes_actual()',
      'select registrar_pedido_calcos(''' || v_lub_a || ''', current_date, 10, true, null, null)',
      'select count(*) from activacion_tenant(''' || v_lub_a || ''')',
      'select uso_tenant(''' || v_lub_a || ''')',
      'select autos_que_volvieron_plataforma(current_date - 30, current_date)']) as consulta
  loop
    v_ok := false;
    begin
      execute r.consulta;
      v_ok := true;
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
    if v_ok then
      raise exception 'R33a UN OWNER PUDO EJECUTAR «%». Las puertas y las lecturas del bloque 3 son solo superadmin.', r.consulta;
    end if;
  end loop;

  -- De acá en adelante, el superadmin.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  -- ---------- b · El contacto, sus defaults y los excluyentes ----------
  select * into r from contactos_pauta where id = v_c1;
  if r.origen is distinct from 'whatsapp' or r.telefono is distinct from '351 555 0101' or r.canal <> 'meta' then
    raise exception 'R33b: el contacto de Meta sin origen quedó con origen «%» y teléfono «%» (tenía que ser whatsapp y el teléfono sin espacios alrededor).', r.origen, r.telefono;
  end if;

  v_c2 := registrar_contacto_pauta(v_w1 + 2, 'meta', 'instagram', null);
  v_c3 := registrar_contacto_pauta(v_w3, 'google', 'instagram', null);
  v_c4 := registrar_contacto_pauta(v_w3 + 1, 'google', null, null);
  select * into r from contactos_pauta where id = v_c3;
  if r.origen is not null then
    raise exception 'R33b: un contacto de Google quedó con origen «%». El origen es de Meta solo.', r.origen;
  end if;

  v_ok := false;
  begin
    perform registrar_contacto_pauta(v_hoy + 1, 'meta', null, null);
    v_ok := true;
  exception when others then
    if sqlerrm not like '%fecha_futura%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33b: se registró un contacto con fecha de mañana.';
  end if;

  -- Cerrado Y perdido a la vez: el CHECK lo rechaza aunque venga por UPDATE
  -- directo (el superadmin tiene update por RLS).
  v_ok := false;
  begin
    update contactos_pauta
       set cierre_at = v_hoy, lubricentro_id = v_lub_a, perdida_at = v_hoy
     where id = v_c1;
    v_ok := true;
  exception when others then
    if sqlstate <> '23514' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33b UN CONTACTO QUEDÓ CERRADO Y PERDIDO A LA VEZ. El CHECK cierre_o_perdida no rige: la tasa de cierre y la de pérdida se pisan.';
  end if;

  -- ---------- c · El cierre fija el origen solo si estaba vacío ----------
  perform marcar_demo(v_c1, v_w1 + 3);
  perform marcar_cierre(v_c1, v_w3 + 2, v_lub_a);

  select * into r from lubricentros where id = v_lub_a;
  if r.origen is distinct from 'meta' or r.origen_detalle is distinct from ('contacto de pauta del ' || to_char(v_w1 + 1, 'DD/MM/YYYY')) then
    raise exception 'R33c EL CIERRE NO FIJÓ EL ORIGEN DEL TENANT (origen «%», detalle «%»). docs/METRICAS.md § 1 «Cierre»: con el origen vacío, el canal del contacto pasa a ser el origen.', r.origen, r.origen_detalle;
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub_a and tipo = 'origen';
  if v_n <> 1 then
    raise exception 'R33c: el cierre dejó % eventos origen (tenía que dejar 1, por el trigger de lubricentros).', v_n;
  end if;

  -- B ya tenía origen: ni se toca ni deja evento nuevo.
  select count(*) into v_m from tenant_eventos where lubricentro_id = v_lub_b and tipo = 'origen';
  perform marcar_cierre(v_c2, v_hoy, v_lub_b);
  select * into r from lubricentros where id = v_lub_b;
  if r.origen is distinct from 'referido' or r.origen_detalle is distinct from 'lo trajo Fassetta' then
    raise exception 'R33c EL CIERRE PISÓ UN ORIGEN QUE YA ESTABA CARGADO (ahora «%» · «%»). Se fija SOLO si estaba vacío: lo que alguien cargó a mano vale más que la inferencia.', r.origen, r.origen_detalle;
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub_b and tipo = 'origen';
  if v_n <> v_m then
    raise exception 'R33c: el cierre sobre un tenant con origen dejó un evento origen de más (% → %).', v_m, v_n;
  end if;
  -- y se reabre, para que c2 quede abierto con demo para la cohorte.
  perform reabrir_contacto_pauta(v_c2);
  perform marcar_demo(v_c2, v_w1 + 3);
  select * into r from contactos_pauta where id = v_c2;
  if r.cierre_at is not null or r.lubricentro_id is not null or r.demo_at is distinct from (v_w1 + 3) then
    raise exception 'R33c: reabrir no dejó el contacto abierto con su demo (cierre %, tenant %, demo %).', r.cierre_at, r.lubricentro_id, r.demo_at;
  end if;

  -- Google → google. Cierra el viernes de la semana 3: cuenta en el CAC de esa semana.
  perform marcar_cierre(v_c4, v_w3 + 4, v_lub_c);
  select origen into r from lubricentros where id = v_lub_c;
  if r.origen is distinct from 'google' then
    raise exception 'R33c: un cierre de Google dejó el origen en «%» (tenía que ser google, 20260924100000).', r.origen;
  end if;

  -- Perder un contacto cerrado se rechaza.
  v_ok := false;
  begin
    perform marcar_perdida(v_c1, v_hoy, 'precio');
    v_ok := true;
  exception when others then
    if sqlerrm not like '%contacto_cerrado%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33b: se marcó perdido un contacto que ya había cerrado.';
  end if;
  perform marcar_perdida(v_c3, v_w3 + 3, 'no_responde');

  -- ---------- d · El embudo por cohorte ----------
  perform fijar_gasto_pauta(v_w3, 'meta', 25, 'R33');

  select * into r from embudo_pauta(v_w1, v_w3 + 6, 'semana') e where e.periodo = v_w1;
  if r.periodo is null then
    raise exception 'R33d SIN PISO: el embudo no devolvió la semana %.', v_w1;
  end if;
  if r.contactos <> 2 or r.cierres <> 1 or r.demos <> 2 or r.abiertos <> 1 then
    raise exception 'R33d EL EMBUDO NO CUENTA POR COHORTE: la semana % tiene contactos=%, demos=%, cierres=%, abiertos=% (esperaba 2, 2, 1, 1). El contacto que escribió en la semana 1 y cerró en la 3 es un cierre DE LA SEMANA 1.', v_w1, r.contactos, r.demos, r.cierres, r.abiertos;
  end if;
  if r.tasa_cierre is distinct from 0.5 or r.ciclo_mediana_dias is distinct from 15.0 then
    raise exception 'R33d: la semana 1 tiene tasa_cierre % y ciclo % (esperaba 0.5 y 15 días).', r.tasa_cierre, r.ciclo_mediana_dias;
  end if;
  if r.cierres_periodo <> 0 or r.cac_usd is not null then
    raise exception 'R33d: la semana 1 tiene cierres_periodo=% y cac=% (nadie cerró ESA semana y no hubo gasto).', r.cierres_periodo, r.cac_usd;
  end if;

  select * into r from embudo_pauta(v_w1, v_w3 + 6, 'semana') e where e.periodo = v_w3;
  if r.contactos <> 2 or r.cierres <> 1 or r.perdidos <> 1 then
    raise exception 'R33d: la semana 3 tiene contactos=%, cierres=%, perdidos=% (esperaba 2, 1 (c4, cohorte), 1).', r.contactos, r.cierres, r.perdidos;
  end if;
  if r.cierres_periodo <> 2 or r.gasto_usd is distinct from 25.00 or r.cac_usd is distinct from 12.50 then
    raise exception 'R33d EL CAC NO VA POR PERÍODO DE CIERRE: la semana 3 tiene cierres_periodo=%, gasto=%, cac=% (esperaba 2 cierres esa semana —c1 y c4—, US$ 25 y CAC 12,50).', r.cierres_periodo, r.gasto_usd, r.cac_usd;
  end if;

  -- Por canal: Meta sola tiene 1 cierre en la semana 3 (c1) y el gasto es de Meta → CAC 25.
  select * into r from embudo_pauta(v_w1, v_w3 + 6, 'semana', 'meta') e where e.periodo = v_w3;
  if r.cierres_periodo <> 1 or r.cac_usd is distinct from 25.00 then
    raise exception 'R33d: con canal meta, la semana 3 tiene cierres_periodo=% y cac=% (esperaba 1 y US$ 25).', r.cierres_periodo, r.cac_usd;
  end if;

  -- Por mes: los cuatro contactos suman.
  select sum(e.contactos) into v_n from embudo_pauta(v_w1, v_w3 + 6, 'mes') e;
  if v_n <> 4 then
    raise exception 'R33d: agrupado por mes, los contactos suman % (esperaba 4).', v_n;
  end if;

  v_j := embudo_pauta_mes_actual();
  if v_j ->> 'contactos' is null or (v_j ->> 'contactos')::integer < 0 then
    raise exception 'R33d: embudo_pauta_mes_actual() no contesta (%).', v_j;
  end if;

  -- ---------- e · El lunes ----------
  v_ok := false;
  begin
    perform fijar_gasto_pauta(v_w3 + 1, 'meta', 10, null);
    v_ok := true;
  exception when others then
    if sqlerrm not like '%semana_no_es_lunes%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33e: fijar_gasto_pauta() aceptó un martes.';
  end if;
  v_ok := false;
  begin
    insert into gasto_pauta (semana, canal, monto_usd) values (v_w3 + 1, 'google', 10);
    v_ok := true;
  exception when others then
    if sqlstate <> '23514' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33e UN INSERT DIRECTO EN gasto_pauta CON UN MARTES PASÓ. El CHECK del lunes no rige.';
  end if;

  -- ---------- g · Los pedidos de calcos ----------
  select count(*) into v_m from tenant_eventos where lubricentro_id = v_lub_a and tipo = 'calcos';
  perform registrar_pedido_calcos(v_lub_a, v_hoy, 100, false, 15000, 'primer pedido');
  select calcos_entregadas into v_n from lubricentros where id = v_lub_a;
  if v_n <> 100 then
    raise exception 'R33g: tras un pedido de 100, calcos_entregadas = % (tenía que ser 100).', v_n;
  end if;
  select count(*) into v_n from tenant_eventos where lubricentro_id = v_lub_a and tipo = 'calcos';
  if v_n <> v_m + 1 then
    raise exception 'R33g: el pedido no dejó el evento calcos (% → %).', v_m, v_n;
  end if;
  perform registrar_pedido_calcos(v_lub_a, v_hoy, 20, true, null, null);
  select calcos_entregadas into v_n from lubricentros where id = v_lub_a;
  if v_n <> 120 then
    raise exception 'R33g EL CONTADOR NO ES LA SUMA DE LOS PEDIDOS: calcos_entregadas = % con pedidos de 100 y 20.', v_n;
  end if;
  v_ok := false;
  begin
    perform registrar_pedido_calcos(v_lub_a, v_hoy, 10, false, null, null);
    v_ok := true;
  exception when others then
    if sqlerrm not like '%monto_obligatorio%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33g: se registraron calcos cobradas sin monto.';
  end if;

  -- ---------- f · Los candados, como postgres ----------
  execute 'reset role';
  v_ok := false;
  begin
    update pedidos_calcos set cantidad = 1 where lubricentro_id = v_lub_a;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%pedido_calcos_no_se_edita%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33f UN UPDATE SOBRE pedidos_calcos PASÓ. Es la constancia de qué se entregó y qué se cobró: append-only.';
  end if;
  v_ok := false;
  begin
    delete from pedidos_calcos where lubricentro_id = v_lub_a;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%pedido_calcos_no_se_borra%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33f UN DELETE SOBRE pedidos_calcos PASÓ con el tenant vivo.';
  end if;
  v_ok := false;
  begin
    truncate pedidos_calcos;
    v_ok := true;
  exception when others then
    if sqlerrm not like '%pedidos_calcos_no_se_vacian%' then raise; end if;
  end;
  if v_ok then
    raise exception 'R33f UN TRUNCATE SOBRE pedidos_calcos PASÓ.';
  end if;

  -- ---------- h · El backfill dejó la suma igual al contador ----------
  select count(*) into v_n
    from lubricentros l
   where l.calcos_entregadas <> coalesce((select sum(pc.cantidad) from pedidos_calcos pc where pc.lubricentro_id = l.id), 0);
  if v_n <> 0 then
    raise exception 'R33h HAY % TENANT(S) CON calcos_entregadas DISTINTO DE LA SUMA DE SUS PEDIDOS. El backfill (migración + seed.sql) tenía que dejar una fila por contador.', v_n;
  end if;
  if backfill_pedidos_calcos() <> 0 then
    raise exception 'R33h: el backfill volvió a insertar filas en una segunda corrida. No es idempotente.';
  end if;
  execute 'set local role authenticated';

  -- ---------- i · La activación ----------
  select * into r from activacion_tenant(v_t1);
  if r.trabajos_7d <> 19 or r.activado or r.dia <> 7 or not r.en_curso then
    raise exception 'R33i SIN PISO: T1 con 19 trabajos tenía que estar en curso, día 7, no activado (trabajos %, activado %, día %, en curso %).', r.trabajos_7d, r.activado, r.dia, r.en_curso;
  end if;
  -- El trabajo 20, todavía en el día 7.
  execute 'reset role';
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                        kilometros, aceite_tipo, prox_service_km)
  select v_t1, s.id, v.id, v_super, 'service', current_date, l.created_at + interval '6 days 23 hours 30 minutes',
         3000, '10W40', 13000
    from lubricentros l
    join sucursales s on s.lubricentro_id = l.id
    join vehiculos  v on v.lubricentro_id = l.id
   where l.id = v_t1 limit 1;
  execute 'set local role authenticated';
  select * into r from activacion_tenant(v_t1);
  if r.trabajos_7d <> 20 or not r.activado then
    raise exception 'R33i EL TRABAJO 20 DEL DÍA 7 NO ACTIVÓ (trabajos %, activado %). La definición es 20 o más en [alta, alta + 7 días).', r.trabajos_7d, r.activado;
  end if;

  select * into r from activacion_tenant(v_t2);
  if r.trabajos_7d <> 19 or r.activado or r.en_curso then
    raise exception 'R33i EL TRABAJO DEL DÍA 8 CONTÓ PARA LA ACTIVACIÓN (T2: trabajos %, activado %, en curso %). La ventana termina a los 7 días exactos del alta.', r.trabajos_7d, r.activado, r.en_curso;
  end if;

  select * into r from activacion_tenant(v_t3);
  if r.trabajos_7d <> 0 or r.activado or r.dia <> 3 or not r.en_curso then
    raise exception 'R33i: T3 con 2 días y 5 horas de alta tenía que decir «en curso, día 3 de 7» (día %, en curso %).', r.dia, r.en_curso;
  end if;

  select * into r from indicadores_tenants() ind where ind.lubricentro_id = v_t2;
  if r.activado or r.dias_alta <> 10 then
    raise exception 'R33i: indicadores_tenants() dice activado=% y dias_alta=% para T2 (esperaba false y 10). Es lo que pinta el chip «No activado».', r.activado, r.dias_alta;
  end if;
  select * into r from indicadores_tenants() ind where ind.lubricentro_id = v_t1;
  if not r.activado then
    raise exception 'R33i: indicadores_tenants() no marca activado a T1 con 20 trabajos en la primera semana.';
  end if;

  select count(*), coalesce(sum(a.activados), 0), coalesce(sum(a.altas), 0)
    into v_n, v_m, i
    from activacion_por_mes(v_hoy - 40, v_hoy) a;
  if v_n < 1 or v_m < 1 or i < 3 then
    raise exception 'R33i: activacion_por_mes() devolvió % meses, % activados, % altas (esperaba al menos 1, 1 y 3).', v_n, v_m, i;
  end if;

  -- ---------- j · La serie por tipo suma el total ----------
  v_j := metricas_plataforma();
  select count(*) into v_n
    from jsonb_array_elements(v_j -> 'series' -> 'dia') p
   where (p ->> 'cantidad')::integer
      <> (p ->> 'service')::integer + (p ->> 'mecanica')::integer + (p ->> 'neumaticos')::integer;
  if v_n <> 0 then
    raise exception 'R33j EN % PUNTO(S) DE LA SERIE DIARIA service + mecanica + neumaticos ≠ cantidad. El Pulso apilado dibuja tres áreas cuya suma tiene que ser el total.', v_n;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_j -> 'series' -> 'dia') p
   where (p ->> 'mecanica')::integer > 0;
  if v_n = 0 then
    raise exception 'R33j: ninguna fila de la serie diaria tiene mecánicas, con las 19 de T2 cargadas en los últimos 10 días.';
  end if;

  -- ---------- k · Uso y autos que volvieron ----------
  v_j := uso_tenant(v_t1, 30);
  if (v_j ->> 'trabajos')::integer <> 20 or (v_j ->> 'service')::integer <> 20
     or (v_j ->> 'recordatorios')::integer <> 1 or (v_j ->> 'escaneos')::integer <> 0 then
    raise exception 'R33k: uso_tenant(T1) devolvió % (esperaba 20 trabajos, 20 service, 1 recordatorio, 0 escaneos).', v_j;
  end if;
  if (v_j ->> 'autos_volvieron')::integer <> 1 then
    raise exception 'R33k EL AUTO CON RECORDATORIO ANTES DEL TRABAJO NO CUENTA COMO AUTO QUE VOLVIÓ (%). docs/METRICAS.md § 1: recordatorio en los 60 días previos al trabajo.', v_j ->> 'autos_volvieron';
  end if;
  if autos_que_volvieron(v_t2, v_hoy - 30, v_hoy) <> 0 then
    raise exception 'R33k: T2 no tiene recordatorios y cuenta autos que volvieron.';
  end if;
  if autos_que_volvieron_plataforma(v_hoy - 30, v_hoy) < 1 then
    raise exception 'R33k: la versión de plataforma no ve el auto de T1.';
  end if;

  -- ---------- l · El alta con estado ----------
  -- verificaciones.sql corre en UNA transacción: el `set constraints all
  -- immediate` de R31g sigue vigente acá, y con él el trigger diferido del
  -- alta dispara ANTES de que crear_lubricentro() inserte la suscripción
  -- (el evento salía sin plan). Se vuelve a diferir, como en producción.
  set constraints all deferred;
  select crear_lubricentro('Alta R33', 'alta-r33',
    '[{"nombre":"Centro"}]'::jsonb, v_plan, 'mensual', 0) into v_t4;
  set constraints all immediate;
  select * into v_ev from tenant_eventos where lubricentro_id = v_t4 and tipo = 'alta';
  if v_ev.despues ->> 'estado' is distinct from 'activa'
     or v_ev.despues ->> 'periodo' is distinct from 'mensual'
     or v_ev.despues ->> 'plan' is null then
    raise exception 'R33l EL EVENTO alta NO TRAE estado/plan/periodo (despues = %). Es el faltante de docs/METRICAS.md § 8 que 20260924104000 cierra.', v_ev.despues;
  end if;

  -- ---------- limpieza ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  delete from contactos_pauta where id in (v_c1, v_c2, v_c3, v_c4);
  delete from gasto_pauta where semana = v_w3 and canal = 'meta' and nota = 'R33';
  delete from services  where lubricentro_id in (v_t1, v_t2, v_t3);
  delete from contactos where lubricentro_id in (v_t1, v_t2, v_t3);
  delete from vehiculos where lubricentro_id in (v_lub_a, v_lub_b, v_lub_c, v_t1, v_t2, v_t3);
  delete from clientes  where lubricentro_id in (v_lub_a, v_lub_b, v_lub_c, v_t1, v_t2, v_t3);
  delete from sucursales where lubricentro_id in (v_lub_a, v_lub_b, v_lub_c, v_t1, v_t2, v_t3, v_t4);
  delete from mensaje_templates where lubricentro_id = v_t4;
  delete from config_experiencia where lubricentro_id = v_t4;
  delete from suscripciones where lubricentro_id = v_t4;
  -- Los pedidos de calcos y los eventos se van con el cascade.
  delete from lubricentros where id in (v_lub_a, v_lub_b, v_lub_c, v_t1, v_t2, v_t3, v_t4);
end $$;

drop function r33_crear_tenant(text, text, timestamptz);
-- <<< R33


-- ============================================================
-- R34 · BLOQUE MÉTRICAS 4: crecimiento (a–f), performance (g–i) y el candado
-- de calcos (j). Tres tramos escritos por separado y unidos acá; cada uno
-- crea y borra lo suyo (helpers r34_*, tenants r34-*, fotos de 1986 a 1988
-- que la limpieza final de este archivo termina de borrar). Va ANTES de esa
-- limpieza a propósito. scripts/regresion-metricas.sh muerde las tres
-- migraciones (20260925100000, 20260925101000, 20260925102000) y espera ver
-- este bloque en rojo, con el patrón de cada tramo.
-- ============================================================

-- ============================================================
-- R34 · CRECIMIENTO (bloque MÉTRICAS 4)
--
-- La migración 20260925100000. Lo que este bloque sostiene:
--
--   a · La identidad de movimientos_mrr() cierra por construcción sobre
--       TODA la historia, en ARS y en USD (mrr_inicio + nuevo + reactivacion
--       + expansion − contraccion − churn + ajuste_precio = mrr_fin, con un
--       peso o un dólar de tolerancia). Y la guarda: un owner y anon reciben
--       42501 en las seis funciones, y la vista no le devuelve filas al
--       owner ni deja pasar a anon.
--   b · La clasificación: un cambio de lista con el mismo plan, período y
--       módulo es AJUSTE DE PRECIO y no expansión, aunque el tenant tenga
--       en el mes eventos cambio_plan que no tocan el descuento; un
--       descuento renegociado (evento cambio_plan con otro descuento_pct)
--       con el mismo plan, período y módulo es EXPANSIÓN y no ajuste;
--       Pro → Ultra, el módulo pago prendido y anual → mensual son
--       expansión (y mensual → anual, contracción: cambió el período, nunca
--       es ajuste); a > 0, b = 0 es churn; alta en el mes es nuevo y alta
--       anterior es reactivación. El primer mes sale sin foto anterior y
--       con los movimientos en null; sin tipo de cambio en alguna de las
--       dos fotos no hay montos en USD. Y «en el mes» es el mes calendario
--       (hora argentina) tanto para el alta como para el evento cambio_plan:
--       dos tenants en 1986 fijan que, si al mes anterior le falta la foto
--       del último día, un descuento quitado después de esa foto sale como
--       ajuste al mes siguiente (W) y un alta posterior, como reactivación
--       (V). Si esa lectura cambia, cambia primero la definición.
--   c · cohortes_logos(): 3 de 4 activos al mes 1 = 0,75; el mes no cerrado
--       da null y el cerrado da valor; m12 null; la cohorte y su activación
--       no se separan aunque la sesión venga en UTC.
--   d · cohortes_ingresos(): nrr ≥ grr; null en los meses no cumplidos y sin
--       tc; un caso con expansión donde nrr > 1 ≥ grr.
--   e · churn_por_mes(): el reloj y falta_de_pago son involuntarias, el
--       pedido del cliente voluntaria; por_motivo y por_origen (con
--       sin_origen); una baja a las 23:30 argentinas del 31 cae en ese mes.
--   f · altas_bajas_por_mes() cuenta las altas por created_at (una a las
--       22:00 del 31 cae en ese mes) y las reactivaciones por evento;
--       trabajos_por_mes() suma TODAS las fotos del mes y respeta en_curso.
--
-- LAS FOTOS DE PRUEBA VIVEN EN 1988 (bisiesto, como 1992), más una en
-- septiembre de 1987 (Q, para que una cohorte cumpla 6 meses justo en el
-- mes en curso) y tres en 1986 (W y V, la ventana «en el mes»): fuera del rango
-- de R31c, que cierra tres días seguidos de un día AL AZAR entre 1990 y
-- 1999 y, si cayera en la ventana de esta prueba, movería estos números;
-- y antes de 2000-01-01, que es lo que la limpieza final de este archivo
-- borra. Se insertan directamente como postgres con fuente =
-- 'reconstruido' y tc_venta = 1000 (así USD = ARS ÷ 1000). Los tenants se
-- crean insertando en lubricentros (crear_lubricentro() es lento y acá no
-- hace falta la suscripción: las funciones leen fotos, no suscripciones).
--
-- El escenario, mes a mes (fecha de la foto que representa al mes):
--   1988-01-31 (cerrado) · A Basic 39000, B Pro 49000, C Pro 49000,
--                          D Pro 49000, P Pro ANUAL 41650, E Basic con 20 %
--                          de descuento 31200, R suspendido 0, X (fantasma)
--                          10000. Primer mes: sin foto anterior.
--   1988-02-29 (cerrado) · A 42000 mismo plan (AJUSTE +3000, aunque tiene
--                          dos cambio_plan de ida y vuelta que no tocan el
--                          descuento) · B Ultra 99000 (EXPANSIÓN +50000) ·
--                          C Pro + módulo 59000 (EXPANSIÓN +10000) · D 0
--                          (CHURN 49000) · P Pro MENSUAL 49000 (EXPANSIÓN
--                          +7350: cambió el período) · E Basic 39000 con el
--                          descuento quitado por un cambio_plan del 10/02
--                          (EXPANSIÓN +7800: el descuento es el cliente) ·
--                          R vuelve con 49000 (REACTIVACIÓN, alta de 1987) ·
--                          N Basic 39000 (NUEVO, alta 10/02).
--   1988-03-01 y 03-15 (EN CURSO: falta la del 31) · A 40000 (AJUSTE −2000)
--                          · P vuelve a anual 41650 (CONTRACCIÓN 7350).
--   1988-04-30 (cerrado) · A 0 (CHURN 40000) · C Ultra + módulo 109000
--                          (EXPANSIÓN +50000) · D vuelve 49000 (REACTIVACIÓN)
--                          · R 0 (CHURN 49000).
--   1988-05-31 (cerrado, SIN tipo de cambio) · B 105000 (AJUSTE +6000).
--   1988-06-30 (cerrado) · todo igual.
--   (1987-09-30, cerrado · Q Basic 20000: la única foto anterior a 1988.)
-- Y aparte, en 1986 (la ventana «en el mes» cuando al mes anterior le falta
-- la foto del último día):
--   1986-01-31 (cerrado)  · W Pro con 20 % de descuento 39200.
--   1986-02-15 (EN CURSO) · W 39200 igual. El 20/02, DESPUÉS de esta foto,
--                           un cambio_plan le quita el descuento y nace V.
--   1986-03-31 (cerrado)  · W Pro 49000 (AJUSTE +9800: el evento es de
--                           febrero, no de marzo) · V Basic 39000
--                           (REACTIVACIÓN: el alta es de febrero).
-- X es un tenant que se borra DESPUÉS de fotografiarlo: su MRR queda en la
-- foto de la plataforma (mrr_ars) pero no en las filas por tenant, que se
-- van en cascade. Es lo que pasa en toda base local donde una prueba borró
-- un tenant, y es la razón por la que mrr_fin tiene que ser Σ b y no el
-- total de la plataforma: la rotura @identidad_fin la muestra.
--
-- Corre como el superadmin del seed bajo `authenticated`; los fixtures se
-- escriben como postgres. Limpia al final: los tenants se borran (las fotos
-- por tenant y los eventos se van en cascade); las fotos de la plataforma
-- de 1988 las borra la limpieza final de este archivo. scripts/
-- regresion-metricas.sh rompe cada regla y espera ver este bloque en rojo.
-- ============================================================

-- >>> R34
-- Un tenant de prueba con su sucursal, un cliente y un auto, con la fecha
-- de alta y el origen que se le pidan. Se borra al final del bloque.
create or replace function r34_crear_tenant(p_nombre text, p_slug text, p_alta timestamptz, p_origen origen_tenant)
returns table (lub uuid, suc uuid, veh uuid)
language plpgsql
as $$
declare
  v_lub uuid; v_suc uuid; v_cli uuid; v_veh uuid; v_pat text;
begin
  insert into lubricentros (nombre, slug, created_at, origen) values (p_nombre, p_slug, p_alta, p_origen) returning id into v_lub;
  insert into sucursales (lubricentro_id, nombre) values (v_lub, 'Centro') returning id into v_suc;
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'Cliente R34', '3510000000') returning id into v_cli;
  v_pat := 'AD' || lpad((floor(random() * 900) + 100)::text, 3, '0') || 'CR';
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  values (v_lub, v_cli, v_pat, v_pat, 'Ford', 'Ranger') returning id into v_veh;
  return query select v_lub, v_suc, v_veh;
end;
$$;

-- La foto de un tenant en un día, con lo que movimientos_mrr() mira: activo,
-- MRR, plan, período y módulo pago.
create or replace function r34_foto_tenant(
  p_fecha date, p_lub uuid, p_activo boolean, p_mrr numeric,
  p_plan uuid, p_periodo periodo_suscripcion, p_modulo boolean, p_trabajos integer default 0)
returns void
language sql
as $$
  insert into snapshots_tenant_diarios
    (fecha, lubricentro_id, activo, exento, mrr_ars, plan_id, periodo, modulo_pago, trabajos_dia)
  values (p_fecha, p_lub, p_activo, false, p_mrr, p_plan, p_periodo, p_modulo, p_trabajos);
$$;

-- La foto de la plataforma de un día. tc null = sin tipo de cambio.
create or replace function r34_foto_plataforma(
  p_fecha date, p_activos integer, p_suspendidos integer, p_mrr numeric, p_tc numeric,
  p_trabajos integer, p_service integer, p_mecanica integer, p_neumaticos integer,
  p_recordatorios integer, p_escaneos integer)
returns void
language sql
as $$
  insert into snapshots_diarios
    (fecha, tenants_activos, tenants_suspendidos, tenants_exentos, mrr_ars, tc_venta, mrr_usd,
     altas_dia, bajas_dia, trabajos_dia, trabajos_service, trabajos_mecanica, trabajos_neumaticos,
     recordatorios_dia, escaneos_dia, fuente)
  values
    (p_fecha, p_activos, p_suspendidos, 0, p_mrr, p_tc, case when p_tc > 0 then round(p_mrr / p_tc, 2) end,
     0, 0, p_trabajos, p_service, p_mecanica, p_neumaticos, p_recordatorios, p_escaneos, 'reconstruido');
$$;

do $$
declare
  v_super  uuid;
  v_owner  uuid;
  v_basic  uuid;
  v_pro    uuid;
  v_ultra  uuid;
  v_a      uuid;   -- alta 10/01/1988, meta · ajuste de precio, 20 trabajos en la primera semana, un auto que volvió
  v_b      uuid;   -- alta 12/01/1988, sin origen · Pro → Ultra
  v_c      uuid;   -- alta 15/01/1988, referido · módulo pago prendido, después Ultra
  v_d      uuid;   -- alta 20/01/1988, sin origen · churn en febrero, vuelve en abril
  v_p      uuid;   -- alta 05/11/1987, meta · anual → mensual → anual
  v_r      uuid;   -- alta 01/06/1987, sin origen · reactivación en febrero, churn en abril
  v_n      uuid;   -- alta 10/02/1988, google · nuevo en febrero
  v_e      uuid;   -- alta 15/06/1987, sin origen · Basic con 20 % de descuento; en febrero se lo quitan (cambio_plan): expansión con el mismo plan. Comparte cohorte con R.
  v_m      uuid;   -- alta 31/03/1988 22:00, calco · sin fotos; activa (20 trabajos) para el borde de zona de las cohortes; sus bajas de abril son «otro»
  v_x      uuid;   -- el fantasma: fotografiado y borrado
  v_q      uuid;   -- alta 10/09/1987, sin origen · foto solo en 09/1987; su cohorte cumple 6 meses en marzo de 1988, que está en curso
  v_w      uuid;   -- alta 01/06/1985, sin origen · Pro con 20 % de descuento en 1986; se lo quitan el 20/02, DESPUÉS de la última foto de febrero (en curso): en marzo es ajuste, no expansión
  v_v      uuid;   -- alta 20/02/1986, sin origen · nace después de la última foto de febrero; en marzo es reactivación, no nuevo (el alta es del mes calendario anterior)
  v_suc    uuid;
  v_veh    uuid;
  v_suc_m  uuid;
  v_veh_m  uuid;
  v_alta_a timestamptz := '1988-01-10 09:00-03';
  v_alta_m timestamptz := '1988-03-31 22:00-03';
  v_tz     text;
  v_n_int  integer;
  v_ok     boolean;
  v_num    numeric;
  r        record;
  i        integer;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select u.id into v_owner
    from usuarios u join lubricentros l on l.id = u.lubricentro_id
   where l.slug = 'demo' and u.rol = 'owner' limit 1;
  select id into v_basic from planes where nombre = 'Basic' and not heredado;
  select id into v_pro   from planes where nombre = 'Pro'   and not heredado;
  select id into v_ultra from planes where nombre = 'Ultra' and not heredado;
  if v_super is null or v_owner is null or v_basic is null or v_pro is null or v_ultra is null then
    raise exception 'R34 SIN PISO: falta el superadmin, el owner del demo o los planes Basic/Pro/Ultra del seed.';
  end if;
  if exists (select 1 from snapshots_diarios where fecha between '1986-01-01' and '1988-12-31')
     or exists (select 1 from lubricentros where created_at >= '1985-01-01' and created_at < '1989-01-01') then
    raise exception 'R34 SIN PISO: ya hay fotos de 1986 a 1988 o tenants con alta entre 1985 y 1988 en la base (otra prueba los dejó). Estos números suponen que no hay ninguno.';
  end if;

  -- ---------- Los fixtures, como postgres ----------
  select lub, suc, veh into v_a, v_suc, v_veh from r34_crear_tenant('Ajuste A R34',      'r34-a', v_alta_a,                    'meta');
  select lub into v_b from r34_crear_tenant('Plan B R34',        'r34-b', '1988-01-12 09:00-03', null);
  select lub into v_c from r34_crear_tenant('Modulo C R34',      'r34-c', '1988-01-15 09:00-03', 'referido');
  select lub into v_d from r34_crear_tenant('Churn D R34',       'r34-d', '1988-01-20 09:00-03', null);
  select lub into v_p from r34_crear_tenant('Periodo P R34',     'r34-p', '1987-11-05 09:00-03', 'meta');
  select lub into v_r from r34_crear_tenant('Reactivacion R R34','r34-r', '1987-06-01 09:00-03', null);
  select lub into v_n from r34_crear_tenant('Nuevo N R34',       'r34-n', '1988-02-10 10:00-03', 'google');
  select lub into v_e from r34_crear_tenant('Descuento E R34',   'r34-e', '1987-06-15 09:00-03', null);
  -- A las 22:00 argentinas del 31 de marzo ya es 1 de abril en UTC.
  select lub, suc, veh into v_m, v_suc_m, v_veh_m from r34_crear_tenant('Marzo M R34', 'r34-m', v_alta_m, 'calco');
  select lub into v_x from r34_crear_tenant('Fantasma X R34',    'r34-x', '1987-12-01 09:00-03', null);
  select lub into v_q from r34_crear_tenant('Seis meses Q R34',  'r34-q', '1987-09-10 09:00-03', null);
  select lub into v_w from r34_crear_tenant('Ventana W R34',     'r34-w', '1985-06-01 09:00-03', null);
  select lub into v_v from r34_crear_tenant('Ventana V R34',     'r34-v', '1986-02-20 10:00-03', null);

  -- A activa: 20 trabajos en las 20 horas siguientes al alta. Y un auto que
  -- volvió: un recordatorio el 1/02 y un trabajo sobre ese auto el 10/02.
  for i in 1..20 loop
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                          kilometros, aceite_tipo, prox_service_km)
    values (v_a, v_suc, v_veh, v_super, 'service', (v_alta_a + (i || ' hours')::interval)::date,
            v_alta_a + (i || ' hours')::interval, 1000 + i, '10W40', 10000);
  end loop;
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  values (v_a, v_veh, v_super, 'proximo', 'whatsapp', '1988-02-01 10:00-03');
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                        kilometros, aceite_tipo, prox_service_km)
  values (v_a, v_suc, v_veh, v_super, 'service', '1988-02-10', '1988-02-10 11:00-03', 1100, '10W40', 11000);
  -- M también activa: 20 trabajos en las 20 horas que siguen a su alta de
  -- las 22:00 del 31/03 (que en UTC ya es abril). Sin contacto previo, así
  -- que no cuenta como auto que volvió ni toca trabajos_por_mes (que lee
  -- fotos).
  for i in 1..20 loop
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                          kilometros, aceite_tipo, prox_service_km)
    values (v_m, v_suc_m, v_veh_m, v_super, 'service', (v_alta_m + (i || ' hours')::interval)::date,
            v_alta_m + (i || ' hours')::interval, 1000 + i, '10W40', 10000);
  end loop;

  -- 1986, aparte de todo lo demás: la ventana «en el mes» cuando al mes
  -- anterior le falta la foto del último día. Febrero queda EN CURSO (la
  -- última foto es del 15); el 20/02, después de esa foto, a W le quitan el
  -- descuento (cambio_plan 20 → 0) y nace V. Marzo compara la foto del
  -- 15/02 con la del 31/03: ve los dos cambios de MRR, pero ni el evento ni
  -- el alta son de marzo.
  perform r34_foto_tenant('1986-01-31', v_w, true, 39200, v_pro, 'mensual', false);
  perform r34_foto_plataforma('1986-01-31', 1, 0, 39200, 1000, 0, 0, 0, 0, 0, 0);
  perform r34_foto_tenant('1986-02-15', v_w, true, 39200, v_pro, 'mensual', false);
  perform r34_foto_plataforma('1986-02-15', 1, 0, 39200, 1000, 0, 0, 0, 0, 0, 0);
  perform r34_foto_tenant('1986-03-31', v_w, true, 49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1986-03-31', v_v, true, 39000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1986-03-31', 2, 0, 88000, 1000, 0, 0, 0, 0, 0, 0);
  perform emitir_evento_tenant(v_w, 'cambio_plan',
    jsonb_build_object('plan_id', v_pro, 'plan', 'Pro', 'periodo', 'mensual', 'descuento_pct', 20.00),
    jsonb_build_object('plan_id', v_pro, 'plan', 'Pro', 'periodo', 'mensual', 'descuento_pct', 0.00),
    null, 'admin', '1986-02-20 10:00-03', null);

  -- Septiembre de 1987, cerrado: la única foto anterior a 1988. Diciembre
  -- no tiene foto, así que enero de 1988 sigue siendo el primer mes con
  -- foto anterior faltante. Q existe para que una cohorte con MRR inicial
  -- cumpla 6 meses justo en marzo de 1988, el mes en curso.
  perform r34_foto_tenant('1987-09-30', v_q, true, 20000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1987-09-30', 1, 0, 20000, 1000, 0, 0, 0, 0, 0, 0);

  -- Enero, cerrado (Σ tenants = 268850 con X; 258850 sin X).
  perform r34_foto_tenant('1988-01-31', v_a, true,  39000, v_basic, 'mensual', false, 3);
  perform r34_foto_tenant('1988-01-31', v_b, true,  49000, v_pro,   'mensual', false, 2);
  perform r34_foto_tenant('1988-01-31', v_c, true,  49000, v_pro,   'mensual', false, 1);
  perform r34_foto_tenant('1988-01-31', v_d, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-01-31', v_p, true,  41650, v_pro,   'anual',   false);
  perform r34_foto_tenant('1988-01-31', v_e, true,  31200, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-01-31', v_r, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-01-31', v_x, true,  10000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-01-31', 7, 1, 268850, 1000, 6, 4, 1, 1, 1, 2);

  -- Febrero, cerrado (Σ = 386000 con X; 376000 sin X).
  perform r34_foto_tenant('1988-02-29', v_a, true,  42000, v_basic, 'mensual', false, 2);
  perform r34_foto_tenant('1988-02-29', v_b, true,  99000, v_ultra, 'mensual', false, 2);
  perform r34_foto_tenant('1988-02-29', v_c, true,  59000, v_pro,   'mensual', true,  1);
  perform r34_foto_tenant('1988-02-29', v_d, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-02-29', v_p, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-02-29', v_e, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-02-29', v_r, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-02-29', v_n, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-02-29', v_x, true,  10000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-02-29', 8, 1, 386000, 1000, 8, 5, 2, 1, 3, 1);

  -- Marzo, EN CURSO: dos fotos (1 y 15), ninguna del 31. La del 15 manda.
  perform r34_foto_plataforma('1988-03-01', 8, 1, 376000, 1000, 5, 3, 2, 0, 2, 3);
  perform r34_foto_tenant('1988-03-15', v_a, true,  40000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-03-15', v_b, true,  99000, v_ultra, 'mensual', false);
  perform r34_foto_tenant('1988-03-15', v_c, true,  59000, v_pro,   'mensual', true);
  perform r34_foto_tenant('1988-03-15', v_d, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-03-15', v_p, true,  41650, v_pro,   'anual',   false);
  perform r34_foto_tenant('1988-03-15', v_e, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-03-15', v_r, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-03-15', v_n, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-03-15', 7, 2, 366650, 1000, 4, 2, 1, 1, 0, 1);

  -- Abril, cerrado (Σ = 376650).
  perform r34_foto_tenant('1988-04-30', v_a, false,     0, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-04-30', v_b, true,  99000, v_ultra, 'mensual', false);
  perform r34_foto_tenant('1988-04-30', v_c, true, 109000, v_ultra, 'mensual', true);
  perform r34_foto_tenant('1988-04-30', v_d, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-04-30', v_p, true,  41650, v_pro,   'anual',   false);
  perform r34_foto_tenant('1988-04-30', v_e, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-04-30', v_r, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-04-30', v_n, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-04-30', 6, 3, 376650, 1000, 7, 3, 2, 2, 1, 0);

  -- Mayo, cerrado, SIN tipo de cambio (Σ = 382650).
  perform r34_foto_tenant('1988-05-31', v_a, false,     0, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-05-31', v_b, true, 105000, v_ultra, 'mensual', false);
  perform r34_foto_tenant('1988-05-31', v_c, true, 109000, v_ultra, 'mensual', true);
  perform r34_foto_tenant('1988-05-31', v_d, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-05-31', v_p, true,  41650, v_pro,   'anual',   false);
  perform r34_foto_tenant('1988-05-31', v_e, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-05-31', v_r, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-05-31', v_n, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-05-31', 6, 3, 382650, null, 2, 2, 0, 0, 0, 0);

  -- Junio, cerrado, todo igual que mayo (Σ = 382650).
  perform r34_foto_tenant('1988-06-30', v_a, false,     0, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-06-30', v_b, true, 105000, v_ultra, 'mensual', false);
  perform r34_foto_tenant('1988-06-30', v_c, true, 109000, v_ultra, 'mensual', true);
  perform r34_foto_tenant('1988-06-30', v_d, true,  49000, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-06-30', v_p, true,  41650, v_pro,   'anual',   false);
  perform r34_foto_tenant('1988-06-30', v_e, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_tenant('1988-06-30', v_r, false,     0, v_pro,   'mensual', false);
  perform r34_foto_tenant('1988-06-30', v_n, true,  39000, v_basic, 'mensual', false);
  perform r34_foto_plataforma('1988-06-30', 6, 3, 382650, 1000, 0, 0, 0, 0, 0, 0);

  -- Los cambio_plan de febrero: el de E cambia el descuento (20 → 0) y
  -- explica su suba con el mismo plan; los dos de A (Basic → Pro y vuelta)
  -- no tocan el descuento y las fotos lo ven Basic en las dos puntas, así
  -- que su suba sigue siendo la lista. La forma del antes/despues es la del
  -- trigger de suscripciones (20260922201000): descuento_pct numeric(5,2).
  perform emitir_evento_tenant(v_e, 'cambio_plan',
    jsonb_build_object('plan_id', v_basic, 'plan', 'Basic', 'periodo', 'mensual', 'descuento_pct', 20.00),
    jsonb_build_object('plan_id', v_basic, 'plan', 'Basic', 'periodo', 'mensual', 'descuento_pct', 0.00),
    null, 'admin', '1988-02-10 10:00-03', null);
  perform emitir_evento_tenant(v_a, 'cambio_plan',
    jsonb_build_object('plan_id', v_basic, 'plan', 'Basic', 'periodo', 'mensual', 'descuento_pct', 0.00),
    jsonb_build_object('plan_id', v_pro,   'plan', 'Pro',   'periodo', 'mensual', 'descuento_pct', 0.00),
    null, 'admin', '1988-02-05 10:00-03', null);
  perform emitir_evento_tenant(v_a, 'cambio_plan',
    jsonb_build_object('plan_id', v_pro,   'plan', 'Pro',   'periodo', 'mensual', 'descuento_pct', 0.00),
    jsonb_build_object('plan_id', v_basic, 'plan', 'Basic', 'periodo', 'mensual', 'descuento_pct', 0.00),
    null, 'admin', '1988-02-20 10:00-03', null);

  -- Los eventos de estado, con la fecha en 1988 (hora argentina explícita).
  perform emitir_evento_tenant(v_d, 'suspension',         '{"activo":true}',  '{"activo":false}', 'cierre_del_negocio · cerró',    'admin', '1988-02-20 10:00-03', null);
  perform emitir_evento_tenant(v_a, 'suspension',         '{"activo":true}',  '{"activo":false}', 'falta_de_pago · no pagó',       'admin', '1988-03-05 10:00-03', null);
  perform emitir_evento_tenant(v_p, 'suspension_reloj',   '{"activo":true}',  '{"activo":false}', 'reloj de cobranza',             'sistema', '1988-03-05 23:59:59-03', null);
  perform emitir_evento_tenant(v_d, 'reactivacion',       '{"activo":false}', '{"activo":true}',  null,                            'admin', '1988-03-10 10:00-03', null);
  perform emitir_evento_tenant(v_p, 'reactivacion_reloj', '{"activo":false}', '{"activo":true}',  'reloj de cobranza',             'sistema', '1988-03-20 23:59:59-03', null);
  -- A las 23:30 argentinas del 31 de marzo ya es 1 de abril en UTC.
  perform emitir_evento_tenant(v_r, 'suspension',         '{"activo":true}',  '{"activo":false}', 'pedido_del_cliente · se muda',  'admin', '1988-03-31 23:30-03', null);
  perform emitir_evento_tenant(v_m, 'suspension',         '{"activo":true}',  '{"activo":false}', 'otro · se aburrió',             'admin', '1988-04-10 10:00-03', null);
  perform emitir_evento_tenant(v_m, 'reactivacion',       '{"activo":false}', '{"activo":true}',  null,                            'admin', '1988-04-15 10:00-03', null);
  perform emitir_evento_tenant(v_m, 'suspension',         '{"activo":true}',  '{"activo":false}', null,                            'admin', '1988-04-20 10:00-03', null);

  -- El fantasma se va: sus filas por tenant se van en cascade, la foto de la
  -- plataforma conserva su MRR. Se comprueba que quedó así, porque de eso
  -- depende que la rotura @identidad_fin se vea.
  delete from vehiculos  where lubricentro_id = v_x;
  delete from clientes   where lubricentro_id = v_x;
  delete from sucursales where lubricentro_id = v_x;
  delete from lubricentros where id = v_x;
  select coalesce(sum(mrr_ars), 0) into v_num from snapshots_tenant_diarios where fecha = '1988-02-29';
  if v_num <> 376000 or (select mrr_ars from snapshots_diarios where fecha = '1988-02-29') <> 386000 then
    raise exception 'R34 SIN PISO: tras borrar el fantasma, las filas por tenant del 29/02 suman % (esperaba 376000) y la foto de la plataforma dice % (esperaba 386000).',
      v_num, (select mrr_ars from snapshots_diarios where fecha = '1988-02-29');
  end if;

  -- ---------- a · La guarda ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n_int from snapshots_mensuales;
  if v_n_int <> 0 then
    raise exception 'R34a UN OWNER LEE % FILAS DE snapshots_mensuales. La vista es security_invoker sobre snapshots_diarios: el RLS tiene que devolverle cero filas.', v_n_int;
  end if;
  for r in select unnest(array[
      'select count(*) from movimientos_mrr(''1988-01-01'', ''1988-06-30'', ''ars'')',
      'select count(*) from cohortes_logos(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from cohortes_ingresos(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from churn_por_mes(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from altas_bajas_por_mes(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from trabajos_por_mes(''1988-01-01'', ''1988-06-30'')']) as consulta
  loop
    v_ok := false;
    begin
      execute r.consulta;
      v_ok := true;
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
    if v_ok then
      raise exception 'R34a UN OWNER PUDO EJECUTAR «%». Las seis lecturas de Crecimiento son solo superadmin: 42501 antes de leer nada.', r.consulta;
    end if;
  end loop;

  -- anon: sin grant, ni a las funciones ni a la vista.
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  for r in select unnest(array[
      'select count(*) from snapshots_mensuales',
      'select count(*) from movimientos_mrr(''1988-01-01'', ''1988-06-30'', ''ars'')',
      'select count(*) from cohortes_logos(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from cohortes_ingresos(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from churn_por_mes(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from altas_bajas_por_mes(''1988-01-01'', ''1988-06-30'')',
      'select count(*) from trabajos_por_mes(''1988-01-01'', ''1988-06-30'')']) as consulta
  loop
    v_ok := false;
    begin
      execute r.consulta;
      v_ok := true;
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
    if v_ok then
      raise exception 'R34a ANON PUDO EJECUTAR «%». Nada de Crecimiento está grantado a anon.', r.consulta;
    end if;
  end loop;

  -- De acá en adelante, el superadmin.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);

  -- ---------- a · La identidad, sobre toda la historia y en las dos monedas ----------
  for r in
    select m.moneda, x.*
    from (values ('ars'), ('usd')) as m(moneda)
    cross join lateral movimientos_mrr('1900-01-01', current_date, m.moneda) x
    where not x.sin_foto_anterior and x.mrr_inicio is not null
  loop
    if abs(r.mrr_inicio + r.nuevo + r.reactivacion + r.expansion - r.contraccion - r.churn + r.ajuste_precio - r.mrr_fin) > 1 then
      raise exception 'R34a LA IDENTIDAD DE MRR NO CIERRA en % (%): % + nuevo % + reactivación % + expansión % − contracción % − churn % + ajuste % = %, y mrr_fin dice %. mrr_inicio y mrr_fin tienen que ser la suma de los mismos a y b por tenant; si se lee otra cosa, la tabla de «de dónde viene el MRR» no suma.',
        r.mes, r.moneda, r.mrr_inicio, r.nuevo, r.reactivacion, r.expansion, r.contraccion, r.churn, r.ajuste_precio,
        r.mrr_inicio + r.nuevo + r.reactivacion + r.expansion - r.contraccion - r.churn + r.ajuste_precio, r.mrr_fin;
    end if;
    if r.neto is distinct from r.nuevo + r.reactivacion + r.expansion - r.contraccion - r.churn then
      raise exception 'R34a: en % (%) neto = % y no es nuevo + reactivación + expansión − contracción − churn (%). El ajuste de precio queda afuera del neto comercial.',
        r.mes, r.moneda, r.neto, r.nuevo + r.reactivacion + r.expansion - r.contraccion - r.churn;
    end if;
  end loop;
  -- El piso: los cinco meses de 1988 con foto anterior tienen que haber
  -- pasado por el bucle en ARS (si la función devolviera vacío, el verde de
  -- arriba no significaría nada).
  select count(*) into v_n_int
    from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x
   where not x.sin_foto_anterior and x.mrr_inicio is not null;
  if v_n_int <> 5 then
    raise exception 'R34a SIN PISO: movimientos_mrr() devolvió % meses de 1988 con foto anterior y montos (esperaba 5: febrero a junio).', v_n_int;
  end if;

  -- ---------- b · La vista y la clasificación ----------
  select count(*) into v_n_int from snapshots_mensuales where mes between '1988-01-01' and '1988-12-01';
  if v_n_int <> 6 then
    raise exception 'R34b: snapshots_mensuales tiene % meses de 1988 (esperaba 6: enero a junio, con las dos fotos de marzo en una sola fila).', v_n_int;
  end if;
  select * into r from snapshots_mensuales where mes = '1988-03-01';
  if r.fecha <> '1988-03-15' or not r.en_curso then
    raise exception 'R34b MARZO NO ES «EN CURSO» CON LA FOTO DEL 15 (fecha %, en_curso %). El mes está cerrado solo cuando su último día calendario tiene foto; si no, se muestra el último día con foto y se dice en curso.', r.fecha, r.en_curso;
  end if;
  select * into r from snapshots_mensuales where mes = '1988-02-01';
  if r.fecha <> '1988-02-29' or r.en_curso then
    raise exception 'R34b: febrero de 1988 (bisiesto) con la foto del 29 tenía que salir cerrado (fecha %, en_curso %).', r.fecha, r.en_curso;
  end if;

  -- Enero: el primer mes con historia.
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-01-01';
  if not found then
    raise exception 'R34b: movimientos_mrr() no devolvió enero de 1988.';
  end if;
  if not r.sin_foto_anterior or r.mrr_inicio is not null or r.nuevo is not null or r.churn is not null
     or r.neto is not null or r.crecimiento_pct is not null or r.tenants_inicio is not null then
    raise exception 'R34b EL PRIMER MES CON HISTORIA INVENTÓ UN INICIO (sin_foto_anterior %, mrr_inicio %, nuevo %, churn %, neto %, tenants_inicio %). Sin foto del mes anterior no hay movimientos: todo null, no cero.',
      r.sin_foto_anterior, r.mrr_inicio, r.nuevo, r.churn, r.neto, r.tenants_inicio;
  end if;
  if r.mrr_fin <> 258850 or r.tenants_fin <> 7 or r.en_curso then
    raise exception 'R34b: enero tenía que salir con mrr_fin 258850 (la suma de las filas por tenant, sin el fantasma), tenants_fin 7 y cerrado; salió %, %, en_curso %.', r.mrr_fin, r.tenants_fin, r.en_curso;
  end if;

  -- Febrero: las ocho clases en un mes.
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-02-01';
  if r.sin_foto_anterior or r.en_curso then
    raise exception 'R34b: febrero salió con sin_foto_anterior % y en_curso % (esperaba false y false).', r.sin_foto_anterior, r.en_curso;
  end if;
  -- Primero el descuento: si E cayera en ajuste, el ajuste subiría y la
  -- expansión bajaría exactamente en sus 7800.
  if r.ajuste_precio = 3000 + 7800 and r.expansion = 75150 - 7800 then
    raise exception 'R34b UN DESCUENTO RENEGOCIADO CAYÓ EN AJUSTE DE PRECIO: E pasó de 31200 a 39000 con el mismo plan, período y módulo porque un cambio_plan del 10/02 le quitó el 20 %% (descuento_pct 20 → 0). La foto no guarda el descuento, pero el evento sí, y un descuento que se renegocia es el cliente, no la lista: expansión +7800 (salió ajuste %, expansión %).', r.ajuste_precio, r.expansion;
  end if;
  if r.ajuste_precio is distinct from 3000 then
    raise exception 'R34b UN CAMBIO DE PRECIO DE LISTA CAYÓ EN EXPANSIÓN: la expansión mide al cliente, no a la lista. A pasó de 39000 a 42000 con el mismo plan, período y módulo, y sus dos cambio_plan del mes (Basic → Pro y vuelta) no tocaron el descuento: es ajuste_precio +3000 (salió ajuste %, expansión %).', r.ajuste_precio, r.expansion;
  end if;
  if r.expansion is distinct from 75150 then
    raise exception 'R34b LA EXPANSIÓN NO SUMA LOS CUATRO CAMBIOS DEL CLIENTE: Pro → Ultra (+50000), el módulo pago prendido (+10000), anual → mensual con el mismo plan (+7350: cambió el período, así que nunca es ajuste) y el descuento del 20 %% quitado a E con el mismo plan (+7800: cambio_plan con otro descuento_pct) = 75150; salió % (ajuste %, contracción %).', r.expansion, r.ajuste_precio, r.contraccion;
  end if;
  if r.nuevo is distinct from 39000 or r.reactivacion is distinct from 49000 then
    raise exception 'R34b NUEVO Y REACTIVACIÓN SE CONFUNDEN: N (alta 10/02/1988) es nuevo con 39000 y R (alta de 1987, en cero en enero) es reactivación con 49000; salió nuevo %, reactivación %. Lo que decide es el mes del alta en hora argentina.', r.nuevo, r.reactivacion;
  end if;
  if r.churn is distinct from 49000 or r.contraccion is distinct from 0 then
    raise exception 'R34b: D pasó de 49000 a 0 y es churn 49000 (magnitud positiva); no hubo contracción. Salió churn %, contracción %.', r.churn, r.contraccion;
  end if;
  if r.mrr_inicio <> 258850 or r.mrr_fin <> 376000 or r.neto <> 114150 or r.crecimiento_pct <> 0.4410
     or r.tenants_inicio <> 7 or r.tenants_fin <> 8 then
    raise exception 'R34b: febrero tenía que dar inicio 258850, fin 376000, neto 114150 (sin el ajuste), crecimiento 0,4410 y tenants 7 → 8; salió %, %, %, %, % → %.',
      r.mrr_inicio, r.mrr_fin, r.neto, r.crecimiento_pct, r.tenants_inicio, r.tenants_fin;
  end if;

  -- Marzo: en curso, una baja de lista y una contracción por período.
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-03-01';
  if not r.en_curso then
    raise exception 'R34b: marzo tenía que salir en curso (la última foto es del 15).';
  end if;
  if r.ajuste_precio is distinct from -2000 or r.contraccion is distinct from 7350
     or r.expansion is distinct from 0 or r.nuevo is distinct from 0 or r.reactivacion is distinct from 0 or r.churn is distinct from 0 then
    raise exception 'R34b UNA BAJA DE LISTA O UN CAMBIO A ANUAL SE CLASIFICÓ MAL: A bajó de 42000 a 40000 con todo igual (ajuste −2000, con signo) y P volvió de mensual a anual con el mismo plan (49000 → 41650: contracción 7350, cambió el período). Salió ajuste %, contracción %, expansión %, nuevo %, reactivación %, churn %.',
      r.ajuste_precio, r.contraccion, r.expansion, r.nuevo, r.reactivacion, r.churn;
  end if;
  if r.mrr_inicio <> 376000 or r.mrr_fin <> 366650 or r.neto <> -7350 or r.crecimiento_pct <> -0.0195
     or r.tenants_inicio <> 8 or r.tenants_fin <> 7 then
    raise exception 'R34b: marzo tenía que dar inicio 376000, fin 366650, neto −7350, crecimiento −0,0195 y tenants 8 → 7; salió %, %, %, %, % → %.',
      r.mrr_inicio, r.mrr_fin, r.neto, r.crecimiento_pct, r.tenants_inicio, r.tenants_fin;
  end if;

  -- Abril: el inicio es la foto del 15/03 aunque marzo esté en curso.
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-04-01';
  if r.reactivacion is distinct from 49000 or r.expansion is distinct from 50000 or r.churn is distinct from 89000
     or r.nuevo is distinct from 0 or r.contraccion is distinct from 0 or r.ajuste_precio is distinct from 0 then
    raise exception 'R34b: abril tenía que dar reactivación 49000 (D vuelve, alta de enero), expansión 50000 (C Pro → Ultra con módulo) y churn 89000 (A 40000 + R 49000); salió reactivación %, expansión %, churn %, nuevo %, contracción %, ajuste %.',
      r.reactivacion, r.expansion, r.churn, r.nuevo, r.contraccion, r.ajuste_precio;
  end if;
  if r.mrr_inicio <> 366650 or r.mrr_fin <> 376650 or r.neto <> 10000 or r.crecimiento_pct <> 0.0273
     or r.tenants_inicio <> 7 or r.tenants_fin <> 6 or r.en_curso then
    raise exception 'R34b: abril tenía que dar inicio 366650 (la foto del 15/03), fin 376650, neto 10000, crecimiento 0,0273, tenants 7 → 6 y cerrado; salió %, %, %, %, % → %, en_curso %.',
      r.mrr_inicio, r.mrr_fin, r.neto, r.crecimiento_pct, r.tenants_inicio, r.tenants_fin, r.en_curso;
  end if;

  -- Mayo y junio en ARS: un ajuste y después nada; el crecimiento es 0, no null.
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-05-01';
  if r.ajuste_precio is distinct from 6000 or r.neto is distinct from 0 or r.crecimiento_pct is distinct from 0
     or r.mrr_inicio <> 376650 or r.mrr_fin <> 382650 then
    raise exception 'R34b: mayo en ARS tenía que dar ajuste 6000 (B 99000 → 105000, mismo plan), neto 0, crecimiento 0, inicio 376650 y fin 382650; salió ajuste %, neto %, crecimiento %, inicio %, fin %.',
      r.ajuste_precio, r.neto, r.crecimiento_pct, r.mrr_inicio, r.mrr_fin;
  end if;
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'ars') x where x.mes = '1988-06-01';
  if r.mrr_inicio <> 382650 or r.mrr_fin <> 382650 or r.neto <> 0 or r.crecimiento_pct <> 0 or r.ajuste_precio <> 0 then
    raise exception 'R34b: junio en ARS, sin cambios, tenía que dar inicio = fin = 382650 y todo en cero; salió inicio %, fin %, neto %, crecimiento %, ajuste %.',
      r.mrr_inicio, r.mrr_fin, r.neto, r.crecimiento_pct, r.ajuste_precio;
  end if;

  -- Las mismas filas en USD (tc 1000 en todas las fotos salvo mayo).
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'usd') x where x.mes = '1988-01-01';
  if not r.sin_foto_anterior or r.mrr_fin is distinct from 258.85 or r.tenants_fin <> 7 then
    raise exception 'R34b: enero en USD tenía que salir sin foto anterior con mrr_fin 258,85 y tenants_fin 7; salió sin_foto_anterior %, mrr_fin %, tenants_fin %.', r.sin_foto_anterior, r.mrr_fin, r.tenants_fin;
  end if;
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'usd') x where x.mes = '1988-02-01';
  if r.mrr_inicio is distinct from 258.85 or r.nuevo is distinct from 39 or r.reactivacion is distinct from 49
     or r.expansion is distinct from 75.15 or r.contraccion is distinct from 0 or r.churn is distinct from 49
     or r.ajuste_precio is distinct from 3 or r.mrr_fin is distinct from 376 or r.neto is distinct from 114.15
     or r.crecimiento_pct is distinct from 0.4410 or r.tenants_inicio <> 7 or r.tenants_fin <> 8 then
    raise exception 'R34b FEBRERO EN USD NO ES FEBRERO EN ARS ÷ 1000 (tc 1000 en las dos fotos): esperaba inicio 258,85 · nuevo 39 · reactivación 49 · expansión 75,15 · contracción 0 · churn 49 · ajuste 3 · fin 376 · neto 114,15 · 0,4410 · 7 → 8; salió % · % · % · % · % · % · % · % · % · % · % → %.',
      r.mrr_inicio, r.nuevo, r.reactivacion, r.expansion, r.contraccion, r.churn, r.ajuste_precio, r.mrr_fin, r.neto, r.crecimiento_pct, r.tenants_inicio, r.tenants_fin;
  end if;
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'usd') x where x.mes = '1988-05-01';
  if r.sin_foto_anterior or r.mrr_inicio is not null or r.mrr_fin is not null or r.ajuste_precio is not null
     or r.nuevo is not null or r.churn is not null or r.neto is not null or r.crecimiento_pct is not null then
    raise exception 'R34b SIN TIPO DE CAMBIO EN LA FOTO DE FIN, MAYO SALIÓ CON MONTOS EN USD (inicio %, fin %, ajuste %, neto %, sin_foto_anterior %): sin cotización no se inventan dólares; todos los montos del mes van en null y sin_foto_anterior sigue en false.',
      r.mrr_inicio, r.mrr_fin, r.ajuste_precio, r.neto, r.sin_foto_anterior;
  end if;
  if r.tenants_inicio <> 6 or r.tenants_fin <> 6 then
    raise exception 'R34b: en mayo sin tipo de cambio los tenants no son montos y tenían que salir igual (6 → 6); salió % → %.', r.tenants_inicio, r.tenants_fin;
  end if;
  select * into r from movimientos_mrr('1988-01-01', '1988-06-30', 'usd') x where x.mes = '1988-06-01';
  if r.sin_foto_anterior or r.mrr_inicio is not null or r.mrr_fin is not null or r.neto is not null or r.tenants_inicio <> 6 then
    raise exception 'R34b SIN TIPO DE CAMBIO EN LA FOTO DE INICIO, JUNIO SALIÓ CON MONTOS EN USD (inicio %, fin %, neto %): alcanza con que falte en una de las dos fotos.',
      r.mrr_inicio, r.mrr_fin, r.neto;
  end if;

  -- La moneda se valida.
  v_ok := false;
  begin
    perform count(*) from movimientos_mrr('1988-01-01', '1988-06-30', 'eur');
    v_ok := true;
  exception when others then
    if sqlerrm <> 'moneda_invalida' then raise; end if;
  end;
  if v_ok then
    raise exception 'R34b: movimientos_mrr() aceptó la moneda «eur».';
  end if;

  -- La ventana «en el mes» (1986): febrero está en curso (foto del 15) y los
  -- dos cambios (el descuento de W y el alta de V) son del 20/02, DESPUÉS de
  -- esa foto. Febrero no ve diferencia de MRR (a = b para W; V no está en
  -- ninguna de las dos fotos); marzo la ve, pero el evento y el alta son de
  -- febrero: W es ajuste y V reactivación. Es la definición («en el mes» =
  -- mes calendario en hora argentina, la misma frase para el alta y para el
  -- evento), no un accidente: si se quiere la ventana entre las dos fotos,
  -- se cambia primero docs/METRICAS.md § 1 (para las dos) y después estos
  -- números.
  select * into r from movimientos_mrr('1986-01-01', '1986-03-31', 'ars') x where x.mes = '1986-02-01';
  if not found or not r.en_curso or r.mrr_inicio is distinct from 39200 or r.mrr_fin is distinct from 39200
     or r.expansion is distinct from 0 or r.ajuste_precio is distinct from 0 or r.nuevo is distinct from 0 or r.reactivacion is distinct from 0 then
    raise exception 'R34b: febrero de 1986 (en curso, foto del 15) tenía que salir sin movimientos con inicio = fin = 39200: el descuento de W se quitó el 20/02, después de la foto, así que febrero no lo ve. Salió en_curso %, inicio %, fin %, expansión %, ajuste %, nuevo %, reactivación %.',
      r.en_curso, r.mrr_inicio, r.mrr_fin, r.expansion, r.ajuste_precio, r.nuevo, r.reactivacion;
  end if;
  select * into r from movimientos_mrr('1986-01-01', '1986-03-31', 'ars') x where x.mes = '1986-03-01';
  if not found or r.ajuste_precio is distinct from 9800 or r.expansion is distinct from 0 then
    raise exception 'R34b LA VENTANA DEL EVENTO cambio_plan NO ES EL MES CALENDARIO: W pasó de 39200 (foto del 15/02, febrero en curso) a 49000 (31/03) con el mismo plan, período y módulo, y el cambio_plan que le quitó el descuento es del 20/02, no de marzo: marzo lo clasifica como ajuste de precio +9800 (salió ajuste %, expansión %). «En el mes» es el mes calendario en hora argentina, la misma ventana que decide «alta en el mes» (docs/METRICAS.md § 1); si la ventana pasa a ser la de las dos fotos, la tabla de «de dónde viene el MRR» cambia sin que lo haya decidido la definición. Primero se cambia § 1, para el alta y para el evento, y después este número.',
      r.ajuste_precio, r.expansion;
  end if;
  if r.reactivacion is distinct from 39000 or r.nuevo is distinct from 0 then
    raise exception 'R34b EL ALTA POSTERIOR A LA ÚLTIMA FOTO DE UN MES EN CURSO NO SALIÓ COMO REACTIVACIÓN: V nació el 20/02/1986, después de la foto del 15/02, y aparece por primera vez en la del 31/03; su alta es de febrero, no de marzo, así que marzo lo clasifica como reactivación 39000 (salió reactivación %, nuevo %). Es el mismo borde que el del evento, con la misma lectura de «en el mes».',
      r.reactivacion, r.nuevo;
  end if;
  if r.en_curso or r.mrr_inicio <> 39200 or r.mrr_fin <> 88000 or r.neto <> 39000 or r.tenants_inicio <> 1 or r.tenants_fin <> 2 then
    raise exception 'R34b: marzo de 1986 tenía que dar cerrado, inicio 39200 (la foto del 15/02), fin 88000, neto 39000 y tenants 1 → 2; salió en_curso %, %, %, %, % → %.',
      r.en_curso, r.mrr_inicio, r.mrr_fin, r.neto, r.tenants_inicio, r.tenants_fin;
  end if;

  -- ---------- c · cohortes_logos ----------
  select count(*) into v_n_int from cohortes_logos('1988-01-01', '1988-03-31');
  if v_n_int <> 3 then
    raise exception 'R34c: cohortes_logos() de enero a marzo de 1988 devolvió % cohortes (esperaba 3: enero con 4 altas, febrero con 1, marzo con 1).', v_n_int;
  end if;
  select * into r from cohortes_logos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-01-01';
  if r.tamano <> 4 or r.activados <> 1 then
    raise exception 'R34c: la cohorte de enero tenía que tener 4 altas y 1 activado (A cargó 20 trabajos en su primera semana); salió % y %.', r.tamano, r.activados;
  end if;
  if r.m1 is distinct from 0.75 then
    raise exception 'R34c LA RETENCIÓN AL MES 1 NO ES 0,75: 4 altas de enero, 3 activas en la foto del 29/02 (D se fue); salió m1 = %. Un tenant sin fila en la foto cuenta como no activo.', r.m1;
  end if;
  if r.m2 is not null then
    raise exception 'R34c UN MES NO CERRADO DEVOLVIÓ RETENCIÓN (m2 = %): marzo tiene la última foto el 15 y está en curso. Un mes a medias no dice cuántos se quedaron: null hasta que cierre.', r.m2;
  end if;
  if r.m3 is distinct from 0.75 then
    raise exception 'R34c: m3 de la cohorte de enero tenía que ser 0,75 (abril cerrado: B, C y D activos, A suspendido); salió %.', r.m3;
  end if;
  if r.m6 is not null or r.m9 is not null or r.m12 is not null then
    raise exception 'R34c: sin fotos de julio, octubre ni enero de 1989, m6/m9/m12 tenían que ser null; salió %, %, %.', r.m6, r.m9, r.m12;
  end if;
  select * into r from cohortes_logos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-02-01';
  if r.tamano <> 1 or r.activados <> 0 or r.m1 is not null or r.m2 is distinct from 1 or r.m3 is distinct from 1 then
    raise exception 'R34c: la cohorte de febrero (N) tenía que dar tamaño 1, 0 activados, m1 null (marzo en curso), m2 = 1 (abril) y m3 = 1 (mayo); salió %, %, %, %, %.', r.tamano, r.activados, r.m1, r.m2, r.m3;
  end if;
  select * into r from cohortes_logos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-03-01';
  if r.tamano <> 1 or r.activados <> 1 or r.m1 is distinct from 0 or r.m2 is distinct from 0 or r.m3 is distinct from 0 then
    raise exception 'R34c: la cohorte de marzo (M, alta a las 22:00 del 31, activada, sin fotos) tenía que dar tamaño 1, 1 activado y m1 = m2 = m3 = 0 (sin fila en la foto = no activo); salió %, %, %, %, %.', r.tamano, r.activados, r.m1, r.m2, r.m3;
  end if;
  -- La cohorte no depende de la zona de la sesión: M nació a las 22:00
  -- argentinas del 31/03, que en UTC ya es 1/04. activacion_por_mes()
  -- agrupa en la zona de la sesión; cohortes_logos() la fija a la
  -- argentina, así que con la sesión en UTC la cohorte de marzo sigue
  -- teniendo a M y su activación (y abril no aparece con un alta fantasma).
  v_tz := current_setting('timezone');
  execute 'set local timezone = ''UTC''';
  select * into r from cohortes_logos('1988-01-01', '1988-04-30') x where x.cohorte = '1988-03-01';
  select count(*) into v_n_int from cohortes_logos('1988-01-01', '1988-04-30') x where x.cohorte = '1988-04-01';
  execute format('set local timezone = %L', v_tz);
  if not found or r.tamano <> 1 or r.activados <> 1 or v_n_int <> 0 then
    raise exception 'R34c LA COHORTE Y SU ACTIVACIÓN SE SEPARAN CON OTRA ZONA EN LA SESIÓN: con TimeZone = UTC la cohorte de marzo salió con tamaño % y % activados y abril con % fila(s) (esperaba 1, 1 y 0). M nació a las 22:00 argentinas del 31/03; la cohorte se calcula en hora argentina y activacion_por_mes() agrupa en la zona de la sesión, así que cohortes_logos() tiene que fijar la zona para que las dos coincidan.', r.tamano, r.activados, v_n_int;
  end if;
  select count(*) into v_n_int from cohortes_logos('1987-01-01', '1988-12-31');
  if v_n_int <> 6 then
    raise exception 'R34c: de 1987 a 1988 tenían que salir 6 cohortes (1987-06 con R y E, 1987-09, 1987-11, 1988-01, 1988-02, 1988-03; el fantasma de 1987-12 ya no existe); salieron %.', v_n_int;
  end if;

  -- ---------- d · cohortes_ingresos ----------
  for r in select * from cohortes_ingresos('1987-01-01', '1988-12-31') loop
    if (r.nrr_3 is not null and r.grr_3 is not null and r.nrr_3 < r.grr_3)
       or (r.nrr_6 is not null and r.grr_6 is not null and r.nrr_6 < r.grr_6)
       or (r.nrr_12 is not null and r.grr_12 is not null and r.nrr_12 < r.grr_12) then
      raise exception 'R34d NRR < GRR EN LA COHORTE % (nrr_3 %, grr_3 %; nrr_6 %, grr_6 %; nrr_12 %, grr_12 %). GRR toma el mínimo por tenant contra su inicial y NRR el MRR tal cual: NRR ≥ GRR siempre.', r.cohorte, r.nrr_3, r.grr_3, r.nrr_6, r.grr_6, r.nrr_12, r.grr_12;
    end if;
  end loop;
  select * into r from cohortes_ingresos('1987-01-01', '1988-12-31') x where x.cohorte = '1987-09-01';
  if not found or r.mrr_inicial_usd is distinct from 20 or r.grr_6 is not null or r.nrr_6 is not null
     or r.grr_3 is not null or r.nrr_3 is not null or r.grr_12 is not null or r.nrr_12 is not null then
    raise exception 'R34d UN MES NO CUMPLIDO DEVOLVIÓ GRR/NRR A 6 MESES: la cohorte de septiembre de 1987 (Q, US$ 20) cumple 6 meses en marzo de 1988, que está en curso, y 3 y 12 en meses sin foto; esperaba inicial 20 y todo lo demás null; salió inicial %, grr_3 %, nrr_3 %, grr_6 %, nrr_6 %, grr_12 %, nrr_12 %.',
      r.mrr_inicial_usd, r.grr_3, r.nrr_3, r.grr_6, r.nrr_6, r.grr_12, r.nrr_12;
  end if;
  select * into r from cohortes_ingresos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-01-01';
  if not found or r.tamano <> 4 or r.mrr_inicial_usd is distinct from 186 then
    raise exception 'R34d: la cohorte de enero tenía que arrancar con US$ 186 (39 + 49 + 49 + 49 con tc 1000) y 4 tenants; salió % y %.', r.mrr_inicial_usd, r.tamano;
  end if;
  if r.nrr_3 is distinct from 1.3817 or r.grr_3 is distinct from 0.7903 then
    raise exception 'R34d LA COHORTE CON EXPANSIÓN NO DA nrr > 1 ≥ grr: enero arrancó con US$ 186 y en abril tiene 257 (A 0 + B 99 + C 109 + D 49): nrr_3 = 257/186 = 1,3817 y grr_3 = (0 + 49 + 49 + 49)/186 = 0,7903; salió nrr %, grr %.', r.nrr_3, r.grr_3;
  end if;
  if r.grr_6 is not null or r.nrr_6 is not null or r.grr_12 is not null or r.nrr_12 is not null then
    raise exception 'R34d UN MES NO CUMPLIDO DEVOLVIÓ GRR/NRR: julio de 1988 y enero de 1989 no tienen foto, así que grr_6/nrr_6/grr_12/nrr_12 tenían que ser null; salió %, %, %, %.', r.grr_6, r.nrr_6, r.grr_12, r.nrr_12;
  end if;
  select * into r from cohortes_ingresos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-02-01';
  if r.mrr_inicial_usd is distinct from 39 or r.grr_3 is not null or r.nrr_3 is not null then
    raise exception 'R34d SIN TIPO DE CAMBIO EN LA FOTO DE MAYO, LA COHORTE DE FEBRERO SALIÓ CON GRR/NRR A 3 MESES (inicial %, grr_3 %, nrr_3 %): sin cotización no hay dólares, aunque el mes esté cerrado.', r.mrr_inicial_usd, r.grr_3, r.nrr_3;
  end if;
  select * into r from cohortes_ingresos('1988-01-01', '1988-03-31') x where x.cohorte = '1988-03-01';
  if r.mrr_inicial_usd is not null or r.grr_3 is not null or r.nrr_3 is not null then
    raise exception 'R34d UNA COHORTE CUYO MES DE ALTA NO CERRÓ TIENE INICIAL (%, grr_3 %, nrr_3 %): marzo está en curso, así que «sin historia todavía».', r.mrr_inicial_usd, r.grr_3, r.nrr_3;
  end if;

  -- ---------- e · churn_por_mes ----------
  select count(*) into v_n_int from churn_por_mes('1988-01-01', '1988-06-30');
  if v_n_int <> 6 then
    raise exception 'R34e: churn_por_mes() de enero a junio devolvió % filas (esperaba 6: todos los meses del rango, con ceros).', v_n_int;
  end if;
  select * into r from churn_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-03-01';
  if r.bajas <> 3 then
    raise exception 'R34e UNA BAJA A LAS 23:30 ARGENTINAS DEL 31/03 NO CAYÓ EN MARZO (bajas = %, esperaba 3): el día de un evento es su fecha en hora argentina, no en UTC.', r.bajas;
  end if;
  if r.involuntarias <> 2 or r.voluntarias <> 1 then
    raise exception 'R34e EL RELOJ NO CUENTA COMO INVOLUNTARIO: falta_de_pago y suspension_reloj son involuntarias (2) y el pedido del cliente es voluntaria (1); salió % / %. El churn involuntario es el que el reloj y la cobranza explican; mezclarlo con el voluntario esconde el problema de cobro.', r.involuntarias, r.voluntarias;
  end if;
  if r.por_motivo <> '{"falta_de_pago": 1, "reloj": 1, "pedido_del_cliente": 1}'::jsonb then
    raise exception 'R34e: por_motivo de marzo tenía que ser {falta_de_pago: 1, reloj: 1, pedido_del_cliente: 1}; salió %. El código es lo que hay antes de « ·» en el motivo, y el reloj va como reloj.', r.por_motivo;
  end if;
  if r.por_origen <> '{"meta": 2, "sin_origen": 1}'::jsonb then
    raise exception 'R34e: por_origen de marzo tenía que ser {meta: 2, sin_origen: 1} (A y P son de Meta, R no tiene origen); salió %.', r.por_origen;
  end if;
  if r.tenants_inicio <> 8 or r.churn_pct is distinct from 0.375 then
    raise exception 'R34e: marzo tenía que dividir 3 bajas por los 8 activos de la foto del 29/02 (0,375); salió tenants_inicio % y churn_pct %.', r.tenants_inicio, r.churn_pct;
  end if;
  select * into r from churn_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-02-01';
  if r.tenants_inicio <> 7 or r.bajas <> 1 or r.involuntarias <> 0 or r.voluntarias <> 1
     or r.por_motivo <> '{"cierre_del_negocio": 1}'::jsonb or r.por_origen <> '{"sin_origen": 1}'::jsonb or r.churn_pct is distinct from 0.1429 then
    raise exception 'R34e: febrero tenía que dar 7 al inicio, 1 baja voluntaria (D, cierre_del_negocio, sin origen) y 0,1429; salió inicio %, bajas %, invol %, vol %, motivos %, orígenes %, pct %.',
      r.tenants_inicio, r.bajas, r.involuntarias, r.voluntarias, r.por_motivo, r.por_origen, r.churn_pct;
  end if;
  select * into r from churn_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-04-01';
  if r.bajas <> 2 or r.involuntarias <> 0 or r.por_motivo <> '{"otro": 2}'::jsonb or r.por_origen <> '{"calco": 2}'::jsonb
     or r.tenants_inicio <> 7 or r.churn_pct is distinct from 0.2857 then
    raise exception 'R34e UNA SUSPENSIÓN SIN MOTIVO NO CAYÓ EN «otro»: M tuvo una con «otro · se aburrió» y otra sin motivo, las dos voluntarias, origen calco; esperaba bajas 2, invol 0, {otro: 2}, {calco: 2}, inicio 7 (la foto del 15/03), 0,2857; salió bajas %, invol %, motivos %, orígenes %, inicio %, pct %.',
      r.bajas, r.involuntarias, r.por_motivo, r.por_origen, r.tenants_inicio, r.churn_pct;
  end if;
  select * into r from churn_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-01-01';
  if r.tenants_inicio is not null or r.bajas <> 0 or r.por_motivo <> '{}'::jsonb or r.por_origen <> '{}'::jsonb or r.churn_pct is not null then
    raise exception 'R34e: enero, sin foto anterior ni bajas, tenía que dar tenants_inicio null, 0 bajas, {} y churn_pct null; salió %, %, %, %, %.', r.tenants_inicio, r.bajas, r.por_motivo, r.por_origen, r.churn_pct;
  end if;
  select * into r from churn_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-05-01';
  if r.tenants_inicio <> 6 or r.bajas <> 0 or r.churn_pct is distinct from 0 then
    raise exception 'R34e: mayo, con 6 al inicio y sin bajas, tenía que dar churn_pct 0 (no null); salió inicio %, bajas %, pct %.', r.tenants_inicio, r.bajas, r.churn_pct;
  end if;

  -- ---------- f · altas_bajas_por_mes y trabajos_por_mes ----------
  select count(*) into v_n_int from altas_bajas_por_mes('1988-01-01', '1988-06-30');
  if v_n_int <> 6 then
    raise exception 'R34f: altas_bajas_por_mes() de enero a junio devolvió % filas (esperaba 6).', v_n_int;
  end if;
  select * into r from altas_bajas_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-03-01';
  if r.altas <> 1 then
    raise exception 'R34f EL ALTA DE LAS 22:00 ARGENTINAS DEL 31/03 NO CAYÓ EN MARZO (altas = %): el día del alta es created_at en hora argentina, no en UTC.', r.altas;
  end if;
  if r.bajas <> 3 or r.reactivaciones <> 2 or r.neto <> -2 then
    raise exception 'R34f: marzo tenía que dar 3 bajas, 2 reactivaciones (una manual y una del reloj) y neto −2; salió bajas %, reactivaciones %, neto %.', r.bajas, r.reactivaciones, r.neto;
  end if;
  select * into r from altas_bajas_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-01-01';
  if r.altas <> 4 or r.bajas <> 0 or r.reactivaciones <> 0 or r.neto <> 4 then
    raise exception 'R34f: enero tenía que dar 4 altas y neto 4; salió altas %, bajas %, reactivaciones %, neto %.', r.altas, r.bajas, r.reactivaciones, r.neto;
  end if;
  select * into r from altas_bajas_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-02-01';
  if r.altas <> 1 or r.bajas <> 1 or r.reactivaciones <> 0 or r.neto <> 0 then
    raise exception 'R34f: febrero tenía que dar 1 alta (N), 1 baja (D) y neto 0; salió altas %, bajas %, reactivaciones %, neto %.', r.altas, r.bajas, r.reactivaciones, r.neto;
  end if;
  select * into r from altas_bajas_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-04-01';
  if r.altas <> 0 or r.bajas <> 2 or r.reactivaciones <> 1 or r.neto <> -2 then
    raise exception 'R34f: abril tenía que dar 0 altas, 2 bajas, 1 reactivación y neto −2; salió %, %, %, %.', r.altas, r.bajas, r.reactivaciones, r.neto;
  end if;
  select * into r from altas_bajas_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-06-01';
  if r.altas <> 0 or r.bajas <> 0 or r.reactivaciones <> 0 or r.neto <> 0 then
    raise exception 'R34f: junio, sin nada, tenía que salir en ceros y no faltar; salió %, %, %, %.', r.altas, r.bajas, r.reactivaciones, r.neto;
  end if;

  select count(*) into v_n_int from trabajos_por_mes('1988-01-01', '1988-06-30');
  if v_n_int <> 6 then
    raise exception 'R34f: trabajos_por_mes() de enero a junio devolvió % filas (esperaba 6: los meses con alguna foto).', v_n_int;
  end if;
  select count(*) into v_n_int from trabajos_por_mes('1988-07-01', '1988-12-31');
  if v_n_int <> 0 then
    raise exception 'R34f: trabajos_por_mes() de julio a diciembre, sin fotos, devolvió % filas (esperaba 0: solo los meses con foto).', v_n_int;
  end if;
  select * into r from trabajos_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-03-01';
  if r.total <> 9 or r.service <> 5 or r.mecanica <> 3 or r.neumaticos <> 1 or r.recordatorios <> 2 or r.escaneos <> 4 then
    raise exception 'R34f trabajos_por_mes() NO SUMA TODAS LAS FOTOS DEL MES: marzo tiene dos fotos (5 + 4 trabajos, 3 + 2 service, 2 + 1 mecánica, 0 + 1 neumáticos, 2 + 0 recordatorios, 3 + 1 escaneos) y salió total %, service %, mecánica %, neumáticos %, recordatorios %, escaneos %.',
      r.total, r.service, r.mecanica, r.neumaticos, r.recordatorios, r.escaneos;
  end if;
  if not r.en_curso then
    raise exception 'R34f: marzo tenía que salir en curso en trabajos_por_mes() (la última foto es del 15).';
  end if;
  select * into r from trabajos_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-02-01';
  if r.autos_que_volvieron <> 1 then
    raise exception 'R34f EL AUTO CON RECORDATORIO ANTES DEL TRABAJO NO CUENTA COMO AUTO QUE VOLVIÓ en febrero (%): recordatorio el 1/02 y trabajo el 10/02 sobre el mismo auto; la ventana va del día 1 al último día con foto del mes.', r.autos_que_volvieron;
  end if;
  if r.total <> 8 or r.service <> 5 or r.mecanica <> 2 or r.neumaticos <> 1 or r.recordatorios <> 3 or r.escaneos <> 1 or r.en_curso then
    raise exception 'R34f: febrero tenía que dar 8 trabajos (5/2/1), 3 recordatorios, 1 escaneo y cerrado; salió %, %/%/%, %, %, en_curso %.', r.total, r.service, r.mecanica, r.neumaticos, r.recordatorios, r.escaneos, r.en_curso;
  end if;
  select * into r from trabajos_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-01-01';
  if r.total <> 6 or r.service <> 4 or r.mecanica <> 1 or r.neumaticos <> 1 or r.autos_que_volvieron <> 0 or r.recordatorios <> 1 or r.escaneos <> 2 then
    raise exception 'R34f: enero tenía que dar 6 trabajos (4/1/1), 0 autos que volvieron (los 20 trabajos de A no tienen recordatorio previo), 1 recordatorio y 2 escaneos; salió %, %/%/%, %, %, %.', r.total, r.service, r.mecanica, r.neumaticos, r.autos_que_volvieron, r.recordatorios, r.escaneos;
  end if;
  select * into r from trabajos_por_mes('1988-01-01', '1988-06-30') x where x.mes = '1988-06-01';
  if r.total <> 0 or r.autos_que_volvieron <> 0 or r.en_curso then
    raise exception 'R34f: junio, con una foto en cero, tenía que salir con 0 trabajos, 0 autos y cerrado; salió %, %, en_curso %.', r.total, r.autos_que_volvieron, r.en_curso;
  end if;

  -- ---------- limpieza ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  delete from services   where lubricentro_id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  delete from contactos  where lubricentro_id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  delete from vehiculos  where lubricentro_id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  delete from clientes   where lubricentro_id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  delete from sucursales where lubricentro_id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  -- Las fotos por tenant y los eventos se van con el cascade; las fotos de
  -- la plataforma de 1986 a 1988 las borra la limpieza final del archivo.
  delete from lubricentros where id in (v_a, v_b, v_c, v_d, v_p, v_r, v_n, v_m, v_q, v_e, v_w, v_v);
  select count(*) into v_n_int from snapshots_tenant_diarios where fecha between '1986-01-01' and '1988-12-31';
  if v_n_int <> 0 then
    raise exception 'R34: la limpieza dejó % fotos por tenant de 1986 a 1988.', v_n_int;
  end if;
end $$;

drop function r34_crear_tenant(text, text, timestamptz, origen_tenant);
drop function r34_foto_tenant(date, uuid, boolean, numeric, uuid, periodo_suscripcion, boolean, integer);
drop function r34_foto_plataforma(date, integer, integer, numeric, numeric, integer, integer, integer, integer, integer, integer);

-- ============================================================
-- R34g–R34i · PERFORMANCE (bloque MÉTRICAS 4, migración 20260925101000)
--
-- Dos reescrituras y dos funciones nuevas. Lo que este tramo sostiene:
--
--   g · `listado_lubricentros()` reescrita con una pasada por tabla dice
--       EXACTAMENTE lo mismo que la versión vieja (20260917100000), fila
--       por fila y columna por columna, en el mismo orden, sobre diez
--       tenants armados para cubrir cada rama que se inlineó: owner que
--       entró, que nunca entró y sin owner; con pago y sin pago; contacto
--       de Fidelli antes, después y EN EL MISMO INSTANTE del pago (el
--       mismo instante no cuenta: `>` estricto); teléfono por WhatsApp de
--       la página, por sucursal (salteando la inactiva y la vacía, y
--       eligiendo la más vieja por created_at aunque se haya insertado
--       después) y sin teléfono; bonificado al 100; override de módulo
--       pago y de premios apagados; onboarding en cada paso (1, 2, 3,
--       completo por los pasos y completo por decreto), con el único
--       producto de un tenant APAGADO y el premio de otro definido pero
--       APAGADO, que cuentan igual; trabajos en el borde del mes (el día 1
--       cuenta para services_mes, el último del mes anterior no); dos
--       suscripciones (la vigente y una cancelada); sin suscripción; dos
--       suspendidos (uno con atención y otro sin, que solo `activo desc`
--       manda al final); DOS con dos owners —uno con el insertado primero más
--       nuevo por created_at, otro con los dos owners con el MISMO
--       created_at—, que salen dos veces en las dos versiones
--       (estados_owner() es por usuario) y son el único caso en que una
--       columna puede diferir: `owner_nombre`, que la vieja elegía al azar
--       (`limit 1` sin order by) y la nueva fija en el más antiguo por
--       created_at y, con empate, en el de id menor. Ahí se compara todo
--       menos esa columna y se afirma la regla nueva. Y uno suscripto a un
--       PLAN DE PRUEBA con `neumaticos` en sus features (ningún plan real
--       trae la clave): sin él, el escalón del plan del módulo es código
--       muerto para la prueba. La versión vieja se copia TEXTUAL como
--       `r34_listado_v1()` y se borra al final. Y la guarda: un owner
--       recibe 42501 en las cuatro funciones del bloque, y el mensaje es
--       el de CADA función (el del listado no es el de estados_owner()
--       levantado desde adentro: la guarda propia corre antes de leer).
--   h · `metricas_plataforma()` con un solo group by devuelve el MISMO
--       jsonb que la versión de 20260924102000 (`=` de jsonb y la serie
--       como texto), con trabajos de los tres tipos repartidos en varios
--       días —hoy, ayer, hace 8, 40 y 100 días, el día 1 del mes y el
--       último del mes anterior (el borde de `trabajos_mes`)— y uno
--       anulado que no cuenta; y, en una subtransacción que se deshace,
--       con `services` VACÍA: las tres series en `[]`, acumulado 0 y
--       primer trabajo null en las dos (la rama que solo una instalación
--       nueva ejercita). La vieja se copia textual como `r34_metricas_v1()`.
--   i · `estado_owner(id)` coincide con la fila de `estados_owner()` para
--       los tres casos (activo, pendiente, sin owner → null) y para todos
--       los tenants (con dos owners, con una de sus filas: la del más
--       viejo); `suscriptos_por_plan()` coincide con las columnas
--       equivalentes del listado para todos los tenants con suscripción,
--       toma la VIGENTE (no la cancelada de hace un año) y sale ordenada
--       por plan y nombre.
--
-- Corre como el superadmin del seed bajo `authenticated`; los fixtures se
-- escriben como postgres (los owners entran por auth.users, como en el
-- seed, para que handle_new_user() les cree la fila de usuarios). Limpia
-- al final. scripts/regresion-metricas.sh rompe cada regla y espera ver
-- este tramo en rojo.
-- ============================================================

-- La versión de listado_lubricentros() ANTERIOR a 20260925101000, copiada
-- textual de 20260917100000 con otro nombre. Es el patrón de la
-- comparación: si la nueva difiere en algo, la nueva está mal.
create or replace function r34_listado_v1()
returns table (
  id                uuid,
  nombre            text,
  slug              text,
  activo            boolean,
  calcos_entregadas integer,
  creado            date,
  suscripcion_id    uuid,
  sub_estado        estado_suscripcion,
  sub_periodo       periodo_suscripcion,
  sub_descuento_pct numeric,
  sub_vencimiento   date,
  plan_id           uuid,
  plan_nombre       text,
  plan_precio       numeric,
  plan_desc_sem     numeric,
  plan_desc_anual   numeric,
  services_mes      integer,
  ultimo_service    date,
  owner_estado      text,
  owner_nombre      text,
  atencion          text,
  atencion_orden    integer,
  contactado        boolean,
  telefono          text,
  onboarding_paso   integer,
  onboarding_pasos  integer,
  onboarding_avance timestamptz,
  -- El módulo pago de gomería, resuelto EN LÍNEA con los tres escalones
  -- de feature_de_tenant (override → plan → cerrado) y no llamándola.
  --
  -- No se la llama a propósito: feature_de_tenant es SECURITY DEFINER sin
  -- guarda de llamador —acepta cualquier lubricentro_id— y por eso NO
  -- está grantada a authenticated; la puerta pública es plan_permite(),
  -- que se ata a mi_lubricentro_id(). Como esta función es security
  -- INVOKER, llamarla desde acá la hace fallar con "permission denied" y
  -- el listado de /fidelli se vacía SIN ERROR VISIBLE: la pantalla dice
  -- "Todavía no hay ningún lubricentro". Pasó al escribir este bloque.
  -- Grantarla habría sido peor: cualquier owner podría leer las features
  -- de cualquier tenant.
  --
  -- Acá los datos ya están a mano (plan_overrides del tenant y features
  -- del plan vigente, los dos en el CTE base) y el RLS de lubricentros ya
  -- decide qué filas se ven, así que la resolución sale igual sin abrir
  -- ninguna puerta. Lo vigila R15i.
  modulo_neumaticos boolean
)
language sql
stable
set search_path = public
as $$
  with
  vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      count(*) filter (
        where sv.fecha >= date_trunc('month', current_date))::integer as del_mes,
      max(sv.fecha) as ultimo
    from services sv
    where not sv.anulado
    group by sv.lubricentro_id
  ),
  owners as (
    select * from estados_owner()
  ),
  base as (
    select
      l.*,
      v.id as v_id, v.estado as v_estado, v.periodo as v_periodo,
      v.descuento_pct as v_desc, v.vencimiento as v_venc, v.plan_id as v_plan,
      p.nombre as p_nombre, p.precio_mensual as p_precio,
      p.descuento_semestral_pct as p_sem, p.descuento_anual_pct as p_anual,
      p.features as p_features,
      coalesce(a.del_mes, 0) as del_mes,
      a.ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,
      (select u.nombre from usuarios u
        where u.lubricentro_id = l.id and u.rol = 'owner' limit 1) as o_nombre,
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion
    from lubricentros l
    left join vigente   v on v.lubricentro_id = l.id
    left join planes    p on p.id = v.plan_id
    left join actividad a on a.lubricentro_id = l.id
    left join owners    o on o.lubricentro_id = l.id
  )
  select
    b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.created_at::date,
    b.v_id, b.v_estado, b.v_periodo, b.v_desc, b.v_venc,
    b.v_plan, b.p_nombre, b.p_precio, b.p_sem, b.p_anual,
    b.del_mes, b.ultimo,
    b.o_estado, b.o_nombre,
    b.atencion,
    orden_atencion(b.atencion),
    contactado_fidelli(b.id),
    telefono_de_contacto(b.id),
    (ob.estado->>'paso_actual')::integer,
    (ob.estado->>'pasos')::integer,
    (ob.estado->>'avance_at')::timestamptz,
    -- Los tres escalones, en el mismo orden que feature_de_tenant.
    coalesce(
      (b.plan_overrides ->> 'neumaticos')::boolean,
      (b.p_features     ->> 'neumaticos')::boolean,
      false
    )
  from base b
  cross join lateral onboarding_estado(b.id) as ob(estado)
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
$$;

-- La versión de metricas_plataforma() ANTERIOR a 20260925101000, copiada
-- textual de 20260924102000 con otro nombre (los `-- @…` que trae son de
-- la copia; ningún script los muerde acá).
create or replace function r34_metricas_v1()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_primero date;
  v_series  jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función filtra por tipo:
  -- el desglose es además del total, no en vez.
  select min(fecha) into v_primero
  from services where not anulado;

  if v_primero is null then
    v_series := jsonb_build_object(
      'dia', '[]'::jsonb, 'semana', '[]'::jsonb, 'mes', '[]'::jsonb);
  else
    select jsonb_object_agg(g.clave, serie.datos)
      into v_series
      from (values
        ('dia',    'day',   interval '1 day',   30),
        ('semana', 'week',  interval '1 week',  12),
        ('mes',    'month', interval '1 month', 12)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'inicio',     p.inicio,
              'cantidad',   t.total,
              'service',    t.svc,
              'mecanica',   t.mec,
              'neumaticos', t.neu)
            order by p.inicio)
          from (
            select generate_series(
              greatest(
                (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                date_trunc(g.unidad, v_primero)::date
              ),
              date_trunc(g.unidad, current_date)::date,
              g.paso)::date as inicio
          ) p
          cross join lateral (
            select
              count(*)::integer                                       as total,
              count(*) filter (where s.tipo = 'service')::integer     as svc,
              count(*) filter (where s.tipo = 'mecanica')::integer    as mec,
              count(*) filter (where s.tipo = 'neumaticos')::integer  as neu
            from services s
            where not s.anulado                                        -- @serie_todos
              and s.fecha >= p.inicio
              and s.fecha < (p.inicio + g.paso)::date
          ) t
        ), '[]'::jsonb) as datos
      ) serie;
  end if;

  return jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and fecha >= date_trunc('month', current_date)),
    'acumulado', (select count(*) from services where not anulado),
    'primer_trabajo', v_primero,
    'series', v_series
  );
end;
$$;

-- Un tenant de prueba con su sucursal, un cliente, un auto y —si se pide—
-- un owner que entró ('activo'), que nunca entró ('pendiente') o ninguno
-- (null). El owner entra por auth.users como en el seed. Se borra al
-- final del bloque.
create or replace function r34_perf_tenant(
  p_nombre text, p_slug text, p_activo boolean, p_owner text, p_alta timestamptz
)
returns table (lub uuid, suc uuid, veh uuid, uid uuid)
language plpgsql
as $$
declare
  v_lub uuid; v_suc uuid; v_cli uuid; v_veh uuid; v_uid uuid; v_pat text;
begin
  insert into lubricentros (nombre, slug, activo, created_at)
  values (p_nombre, p_slug, p_activo, p_alta) returning id into v_lub;
  insert into sucursales (lubricentro_id, nombre, created_at)
  values (v_lub, 'Centro', p_alta) returning id into v_suc;
  insert into clientes (lubricentro_id, nombre, telefono)
  values (v_lub, 'Cliente R34', '3510000000') returning id into v_cli;
  v_pat := 'AE' || lpad((floor(random() * 900) + 100)::text, 3, '0') || 'PF';
  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  values (v_lub, v_cli, v_pat, v_pat, 'Toyota', 'Hilux') returning id into v_veh;

  if p_owner is not null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, last_sign_in_at, aud, role,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000',
      p_slug || '@r34.fidellimotors.app',
      extensions.crypt('r34', extensions.gen_salt('bf')), now(),
      p_alta, p_alta,
      case when p_owner = 'activo' then p_alta + interval '1 day' end,
      'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('rol', 'owner', 'nombre', 'Owner ' || p_nombre, 'lubricentro_id', v_lub),
      '', '', '', ''
    );
    if not exists (select 1 from usuarios u where u.id = v_uid and u.lubricentro_id = v_lub and u.rol = 'owner') then
      raise exception 'R34 SIN PISO: el trigger de auth no creó el owner de prueba de %.', p_slug;
    end if;
  end if;

  return query select v_lub, v_suc, v_veh, v_uid;
end;
$$;

-- Un owner MÁS para un tenant que ya existe (el caso de la reinvitación
-- con otro mail), con el `created_at` de `usuarios` fijado a mano: así el
-- orden de inserción y el orden por antigüedad se pueden cruzar a
-- propósito, que es lo que distingue «el más viejo» de «el primero que
-- encuentro». Entra por auth.users como el otro helper; el trigger crea la
-- fila de usuarios con created_at = now() y acá se corrige.
create or replace function r34_perf_owner(
  p_lub uuid, p_email text, p_nombre text, p_created timestamptz, p_entro boolean
)
returns uuid
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, last_sign_in_at, aud, role,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000',
    p_email, extensions.crypt('r34', extensions.gen_salt('bf')), now(),
    p_created, p_created,
    case when p_entro then p_created + interval '1 day' end,
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', p_nombre, 'lubricentro_id', p_lub),
    '', '', '', ''
  );
  update usuarios set created_at = p_created where id = v_uid;
  if not exists (select 1 from usuarios u where u.id = v_uid and u.lubricentro_id = p_lub and u.rol = 'owner' and u.created_at = p_created) then
    raise exception 'R34 SIN PISO: el trigger de auth no creó el segundo owner de prueba (%), o su created_at no se pudo fijar.', p_email;
  end if;
  return v_uid;
end;
$$;

do $$
declare
  v_hoy     date := current_date;
  -- El día 1 del mes en curso: el borde de «trabajos del mes» (`>=`).
  v_mes1    date := date_trunc('month', current_date)::date;
  v_super   uuid;
  v_owner   uuid;      -- el owner del demo, para la guarda
  v_pro     uuid;
  v_basic   uuid;
  v_ultra   uuid;
  -- Los diez tenants (t), sus sucursales (s), el auto del séptimo y los
  -- owners (u) para la limpieza.
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid; t9 uuid; t10 uuid;
  s1 uuid; s2 uuid; s3 uuid; s6 uuid; s7 uuid;
  v_uid9a   uuid;      -- los dos owners empatados de T9
  v_uid9b   uuid;
  v_t9_nombre text;    -- lo que la regla del empate tiene que elegir para T9
  v_t9_estado text;
  v_plan_gom uuid;     -- el plan de prueba con `neumaticos` en sus features
  v_msg     text;
  v_claves_v1 text[];
  v_claves_v2 text[];
  v_nombres text[];
  v_veh6    uuid;
  v_veh7    uuid;
  v_uid     uuid;
  v_uids    uuid[] := '{}';
  v_ids     uuid[];
  v_sus     uuid;
  v_n       integer;
  v_m       integer;
  v_k       integer;
  v_ok      boolean;
  v_a       jsonb;
  v_b       jsonb;
  v_ids_v1  uuid[];
  v_ids_v2  uuid[];
  v_ok_k    integer;
  v_plan    uuid;
  r         record;
  k         text;
begin
  select u.id into v_super from usuarios u where u.rol = 'superadmin' limit 1;
  select u.id into v_owner
    from usuarios u join lubricentros l on l.id = u.lubricentro_id
   where l.slug = 'demo' and u.rol = 'owner' limit 1;
  select p.id into v_pro   from planes p where p.nombre = 'Pro'   and not p.heredado;
  select p.id into v_basic from planes p where p.nombre = 'Basic' and not p.heredado;
  select p.id into v_ultra from planes p where p.nombre = 'Ultra' and not p.heredado;
  if v_super is null or v_owner is null or v_pro is null or v_basic is null or v_ultra is null then
    raise exception 'R34g SIN PISO: falta el superadmin, el owner del demo o los planes Basic/Pro/Ultra del seed.';
  end if;

  -- ---------- Los fixtures, como postgres ----------

  -- T1 · owner que entró; Pro activa al día; pagó hace 10 días y Fidelli
  -- lo contactó hace 2 (después del pago → contactado); WhatsApp en la
  -- página con espacios alrededor (gana sobre el de la sucursal);
  -- onboarding completo POR LOS PASOS (sin decreto) con el premio definido
  -- pero APAGADO, que cuenta igual; módulo gomería por override.
  select lub, suc, uid into t1, s1, v_uid from r34_perf_tenant('Perf Uno R34', 'r34g-uno', true, 'activo', now() - interval '60 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t1, v_pro, 'activa', 'mensual', 0, v_hoy - 30, v_hoy + 20) returning id into v_sus;
  insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago, created_at)
  values (t1, v_sus, v_super, v_hoy - 30, v_hoy, 49000, v_hoy - 10, now() - interval '10 days');
  insert into contactos_fidelli (lubricentro_id, usuario_id, motivo, canal, created_at)
  values (t1, v_super, 'cobranza', 'whatsapp', now() - interval '2 days');
  insert into config_experiencia (lubricentro_id, datos_contacto)
  values (t1, '{"whatsapp": "  351 400 0001 "}'::jsonb);
  update sucursales set telefono = '351 999 9999' where id = s1;
  insert into productos (lubricentro_id, categoria, nombre, created_at)
  values (t1, 'aceite', 'Aceite R34 uno', now() - interval '40 days'),
         (t1, 'filtro', 'Filtro R34 uno', now() - interval '35 days');
  -- El premio va APAGADO y se inserta ANTES de confirmar el diseño, las
  -- dos cosas a propósito: (a) un premio definido y apagado cuenta como
  -- definido (onboarding_estado_de: «definirlo y apagarlo es una decisión,
  -- no una omisión»), así que un `where activo` colado en el refactor lo
  -- devolvería al paso 3; (b) el trigger de premios completa el onboarding
  -- por decreto en cuanto el paso queda en null, y con el diseño todavía
  -- sin confirmar no lo hace, así que T1 termina «completo por los pasos»
  -- (onboarding_completado_at null) y su paso null sale de la regla, no
  -- del decreto: la mutación se ve en onboarding_paso y no solo en
  -- onboarding_avance. El premio activo lo tiene T6.
  insert into premios (lubricentro_id, meta_services, descripcion, activo, created_at)
  values (t1, 5, 'Quinto service gratis R34', false, now() - interval '20 days');
  update lubricentros set diseno_confirmado_at = now() - interval '30 days' where id = t1;

  -- T2 · owner que nunca entró; trial que vence mañana (trial_por_vencer);
  -- sin pago, contactado después del alta; TRES sucursales activas: Centro
  -- con el teléfono en blanco (la más vieja: no cuenta), Norte con
  -- teléfono insertada primero pero creada hace 5 días, y Sur con teléfono
  -- insertada DESPUÉS pero creada hace 9 días: gana Sur, porque la regla de
  -- telefono_de_contacto() es «la primera activa con teléfono por
  -- created_at», no la primera del heap (un `desc` colado elegiría Norte);
  -- un único producto, APAGADO (cuenta igual para el paso 1), y sin diseño
  -- → paso 2 de 3.
  select lub, suc, uid into t2, s2, v_uid from r34_perf_tenant('Perf Dos R34', 'r34g-dos', true, 'pendiente', now() - interval '10 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t2, v_pro, 'trial', 'mensual', 0, v_hoy - 10, v_hoy + 1);
  insert into contactos_fidelli (lubricentro_id, usuario_id, motivo, canal, created_at)
  values (t2, v_super, 'trial', 'manual', now() - interval '1 day');
  update sucursales set telefono = '   ' where id = s2;
  insert into sucursales (lubricentro_id, nombre, telefono, created_at)
  values (t2, 'Norte', ' 351 400 0002 ', now() - interval '5 days');
  insert into sucursales (lubricentro_id, nombre, telefono, created_at)
  values (t2, 'Sur', '351 400 0022', now() - interval '9 days');
  insert into productos (lubricentro_id, categoria, nombre, activo, created_at)
  values (t2, 'aceite', 'Aceite R34 dos', false, now() - interval '3 days');

  -- T3 · sin owner, sin suscripción y SUSPENDIDO: sin suscripción no hay
  -- atención, así que su lugar en el listado lo decide solo `activo desc`
  -- (al final); T6 también está suspendido pero tiene atención y sale
  -- primero por eso, con lo que sin T3 un `activo asc` colado en el ORDER
  -- BY no se vería. El único contacto es ANTERIOR al alta (no cuenta); la
  -- sucursal tiene teléfono pero está inactiva (no cuenta); sin productos
  -- → paso 1 de 2 (sin plan no aplica premio).
  select lub, suc, uid into t3, s3, v_uid from r34_perf_tenant('Perf Tres R34', 'r34g-tres', false, null, now() - interval '5 days');
  insert into contactos_fidelli (lubricentro_id, usuario_id, motivo, canal, created_at)
  values (t3, v_super, 'trial', 'whatsapp', now() - interval '6 days');
  update sucursales set telefono = '351 400 0003', activa = false where id = s3;

  -- T4 · bonificado al 100 y vencido hace 30 días (atención null: exento);
  -- pagó hace 5 y tiene DOS contactos: uno de hace 10 (antes del pago) y
  -- otro EN EL MISMO INSTANTE del pago (now() es constante dentro de la
  -- transacción): ninguno es posterior → no contactado, porque
  -- contactado_fidelli() compara con `>` estricto y un `>=` colado lo
  -- marcaría; premios apagados por override → 2 pasos; producto y diseño →
  -- completo. Sin teléfono en ningún lado.
  select lub, suc, uid into t4, v_sus, v_uid from r34_perf_tenant('Perf Cuatro R34', 'r34g-cuatro', true, 'activo', now() - interval '200 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t4, v_pro, 'activa', 'mensual', 100, v_hoy - 60, v_hoy - 30) returning id into v_sus;
  insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago, created_at)
  values (t4, v_sus, v_super, v_hoy - 60, v_hoy - 30, 0, v_hoy - 5, now() - interval '5 days');
  insert into contactos_fidelli (lubricentro_id, usuario_id, motivo, canal, created_at)
  values (t4, v_super, 'cobranza', 'whatsapp', now() - interval '10 days'),
         (t4, v_super, 'cobranza', 'manual',   now() - interval '5 days');
  insert into productos (lubricentro_id, categoria, nombre, created_at)
  values (t4, 'aceite', 'Aceite R34 cuatro', now() - interval '100 days');
  update lubricentros set diseno_confirmado_at = now() - interval '90 days' where id = t4;

  -- T5 · owner que nunca entró; DOS suscripciones: una Basic cancelada de
  -- hace un año y la vigente Pro semestral con 20 de descuento; WhatsApp
  -- en la página; producto y diseño pero sin premio ni omisión → paso 3.
  select lub, suc, uid into t5, v_sus, v_uid from r34_perf_tenant('Perf Cinco R34', 'r34g-cinco', true, 'pendiente', now() - interval '400 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento, created_at)
  values (t5, v_basic, 'cancelada', 'mensual', 0, v_hoy - 400, v_hoy - 35, now() - interval '400 days');
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento, created_at)
  values (t5, v_pro, 'activa', 'semestral', 20, v_hoy - 30, v_hoy + 150, now() - interval '30 days');
  insert into config_experiencia (lubricentro_id, datos_contacto)
  values (t5, '{"whatsapp": "351 400 0005"}'::jsonb);
  insert into productos (lubricentro_id, categoria, nombre, created_at)
  values (t5, 'aceite', 'Aceite R34 cinco', now() - interval '25 days');
  update lubricentros set diseno_confirmado_at = now() - interval '20 days' where id = t5;

  -- T6 · SUSPENDIDO (activo = false desde el alta, sin pasar por la puerta
  -- de suspensión); Pro vencida (cobranza_vencida); onboarding completado
  -- por decreto, con un premio ACTIVO (el de T1 está apagado: con uno de
  -- cada, un filtro por `activo` en cualquier sentido cambia algo). Su
  -- ÚNICO trabajo está anulado y es de ayer: services_mes
  -- tiene que dar 0 y ultimo_service null. Sin este caso, sacarle el
  -- `not anulado` al último trabajo o al mes del listado no se ve (en T7
  -- el anulado comparte fecha con los válidos).
  select lub, suc, veh, uid into t6, s6, v_veh6, v_uid from r34_perf_tenant('Perf Seis R34', 'r34g-seis', false, 'activo', now() - interval '300 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t6, v_pro, 'vencida', 'mensual', 0, v_hoy - 90, v_hoy - 60);
  update lubricentros set onboarding_completado_at = now() - interval '250 days' where id = t6;
  insert into premios (lubricentro_id, meta_services, descripcion, created_at)
  values (t6, 4, 'Cuarto service gratis R34', now() - interval '240 days');
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at, kilometros, aceite_tipo, prox_service_km, anulado)
  values (t6, s6, v_veh6, v_super, 'service', v_hoy - 1, now() - interval '1 day', 30000, '10W40', 40000, true);

  -- T7 · Ultra anual con 10 de descuento; premio OMITIDO → completo; y los
  -- trabajos de R34h: hoy uno de cada tipo más uno ANULADO, ayer un
  -- service, hace 8 días una mecánica (otra semana), hace 40 una gomería
  -- (fuera de la serie diaria, dentro de la semanal y la mensual), hace
  -- 100 un service (solo en la mensual), y el BORDE DEL MES: un service el
  -- día 1 del mes en curso (cuenta para services_mes y trabajos_mes: `>=`)
  -- y una mecánica el último día del mes anterior (no cuenta). Sin esas
  -- dos filas, un `>` en lugar de `>=` pasa en verde en las dos funciones.
  select lub, suc, veh, uid into t7, s7, v_veh7, v_uid from r34_perf_tenant('Perf Siete R34', 'r34g-siete', true, 'activo', now() - interval '120 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t7, v_ultra, 'activa', 'anual', 10, v_hoy - 100, v_hoy + 265);
  insert into productos (lubricentro_id, categoria, nombre, created_at)
  values (t7, 'aceite', 'Aceite R34 siete', now() - interval '90 days');
  update lubricentros set diseno_confirmado_at = now() - interval '85 days', premio_omitido_at = now() - interval '80 days' where id = t7;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at, kilometros, aceite_tipo, prox_service_km, anulado)
  values (t7, s7, v_veh7, v_super, 'service', v_hoy,       now(),                        50000, '10W40', 60000, false),
         (t7, s7, v_veh7, v_super, 'service', v_hoy,       now(),                        50100, '10W40', 60100, true),
         (t7, s7, v_veh7, v_super, 'service', v_hoy - 1,   now() - interval '1 day',     49000, '10W40', 59000, false),
         (t7, s7, v_veh7, v_super, 'service', v_mes1,      v_mes1 + interval '12 hours', 46000, '10W40', 56000, false),
         (t7, s7, v_veh7, v_super, 'service', v_hoy - 100, now() - interval '100 days',  40000, '10W40', 50000, false);
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at, kilometros, trabajo_descripcion)
  values (t7, s7, v_veh7, v_super, 'mecanica', v_hoy,      now(),                            50000, 'Cambio de pastillas R34'),
         (t7, s7, v_veh7, v_super, 'mecanica', v_hoy - 8,  now() - interval '8 days',        48000, 'Cambio de correa R34'),
         (t7, s7, v_veh7, v_super, 'mecanica', v_mes1 - 1, (v_mes1 - 1) + interval '12 hours', 45900, 'Cambio de bujías R34');
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at, kilometros, alineacion)
  values (t7, s7, v_veh7, v_super, 'neumaticos', v_hoy,      now(),                      50000, true),
         (t7, s7, v_veh7, v_super, 'neumaticos', v_hoy - 40, now() - interval '40 days', 45000, false);

  -- T8 · DOS owners. El primero que se inserta («nuevo») tiene el
  -- created_at MÁS RECIENTE y nunca entró; el segundo («viejo») es el más
  -- antiguo y ya entró. Cruzar el orden de inserción con el de antigüedad
  -- es lo que hace visible la regla: `owner_nombre` y estado_owner() tienen
  -- que elegir a «viejo» aunque no sea el primero del heap. El tenant sale
  -- DOS veces en el listado (una fila por owner, en las dos versiones): la
  -- comparación de abajo lo trata aparte. Basic activa al día, sin nada más.
  select lub, suc, veh, uid into t8, v_sus, v_veh6, v_uid from r34_perf_tenant('Perf Ocho R34', 'r34g-ocho', true, null, now() - interval '110 days');
  v_uid := r34_perf_owner(t8, 'r34g-ocho-nuevo@r34.fidellimotors.app', 'Owner Ocho nuevo', now() - interval '1 day',    false);
  v_uids := v_uids || v_uid;
  v_uid := r34_perf_owner(t8, 'r34g-ocho-viejo@r34.fidellimotors.app', 'Owner Ocho viejo', now() - interval '100 days', true);
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t8, v_basic, 'activa', 'mensual', 0, v_hoy - 20, v_hoy + 10);

  -- T9 · DOS owners con el MISMO created_at (dos invitaciones en la misma
  -- transacción: now() es constante). «El más antiguo» empata y la regla
  -- sigue por `id`: un uuid al azar, así que el elegido es el de id MENOR,
  -- sea cual sea de los dos; la vieja tomaba el primero del heap. Uno entró
  -- («A») y el otro no («B») para que estado_owner() también tenga que
  -- elegir. Lo esperado se calcula acá como postgres, con la regla del
  -- empate y no con la de la migración (`order by id`, no `created_at, id`).
  -- Basic activa al día, sin nada más. El nombre arranca con un dígito a
  -- propósito: así el orden por `nombre` y el orden por `slug` no coinciden
  -- en los fixtures (los demás ordenan igual por los dos) y un ORDER BY que
  -- cambie la columna se ve en la secuencia de claves.
  select lub, suc, veh, uid into t9, v_sus, v_veh6, v_uid from r34_perf_tenant('Perf 9 Empate R34', 'r34g-nueve', true, null, now() - interval '50 days');
  v_uid9a := r34_perf_owner(t9, 'r34g-nueve-a@r34.fidellimotors.app', 'Owner Nueve A', now() - interval '50 days', true);
  v_uid9b := r34_perf_owner(t9, 'r34g-nueve-b@r34.fidellimotors.app', 'Owner Nueve B', now() - interval '50 days', false);
  v_uids := v_uids || v_uid9a || v_uid9b;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t9, v_basic, 'activa', 'mensual', 0, v_hoy - 15, v_hoy + 15);
  select u.nombre, case when u.id = v_uid9a then 'activo' else 'pendiente' end
    into v_t9_nombre, v_t9_estado
    from usuarios u where u.lubricentro_id = t9 order by u.id limit 1;

  -- T10 · suscripto a un PLAN DE PRUEBA con `neumaticos: true` (y
  -- `premios: true`) en sus features y sin override: el módulo tiene que
  -- salir prendido por el SEGUNDO escalón de feature_de_tenant(), el del
  -- plan. Ningún plan del seed trae la clave `neumaticos`, así que sin este
  -- fixture ese escalón es código muerto para la prueba y un `when false`
  -- colado ahí pasa la identidad en verde. El plan nace inactivo y
  -- heredado para que ninguna pantalla lo ofrezca si la limpieza no
  -- llegara a correr; el candado de planes solo cuida los precios y solo
  -- en el UPDATE. Owner que entró, sin productos → paso 1 de 3 (el premio
  -- aplica por el plan). Se borra al final, después de su suscripción.
  insert into planes (nombre, precio_mensual, features, activo, heredado)
  values ('Plan Gomería R34', 1000, '{"premios": true, "neumaticos": true}'::jsonb, false, true)
  returning id into v_plan_gom;
  select lub, suc, uid into t10, v_sus, v_uid from r34_perf_tenant('Perf Diez R34', 'r34g-diez', true, 'activo', now() - interval '15 days');
  v_uids := v_uids || v_uid;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (t10, v_plan_gom, 'activa', 'mensual', 0, v_hoy - 15, v_hoy + 15);

  v_ids := array[t1, t2, t3, t4, t5, t6, t7, t8, t9, t10];

  -- Los overrides van por la puerta, como superadmin (el candado rechaza
  -- el UPDATE directo).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform fijar_override_plan(t1, '{"neumaticos": true}'::jsonb,
    'Módulo gomería · pago · 2026-09-25 — prueba R34g del listado');
  perform fijar_override_plan(t4, '{"premios": false}'::jsonb,
    'Prueba R34g: premios apagados por override para que el onboarding tenga 2 pasos');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- g · La guarda: un owner recibe 42501 en las cuatro ----------
  -- Y el mensaje tiene que ser EL DE CADA FUNCIÓN. El listado llama a
  -- estados_owner(), que es definer con la misma guarda: sin la guarda
  -- propia el owner igual recibiría 42501, pero levantado desde adentro de
  -- la consulta, después de que el plan arrancó a leer lubricentros. La
  -- regla es «42501 antes de leer nada», y la única forma de ver la
  -- diferencia es el texto del error.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for r in select * from (values
      ('select count(*) from listado_lubricentros()',   'ver el listado de lubricentros'),
      ('select metricas_plataforma()',                  'ver las métricas de la plataforma'),
      ('select estado_owner(''' || t1 || ''')',         'consultar el estado de los owners'),
      ('select count(*) from suscriptos_por_plan()',    'ver los suscriptos por plan')
    ) as q(consulta, pista)
  loop
    v_ok := false; v_msg := null;
    begin
      execute r.consulta;
    exception
      when insufficient_privilege then v_ok := true; v_msg := sqlerrm;
    end;
    if not v_ok then
      raise exception 'R34g UN OWNER PUDO EJECUTAR «%». Las cuatro lecturas del bloque 4 son solo superadmin: la guarda soy_superadmin() va antes de leer nada (42501).', r.consulta;
    end if;
    if v_msg not like '%' || r.pista || '%' then
      raise exception 'R34g EL 42501 DE «%» NO ES EL SUYO: llegó «%» y la guarda propia dice «… puede %». Si el error lo levanta otra función desde adentro (estados_owner() en el listado), la consulta ya arrancó a leer antes de la guarda; la regla es 42501 ANTES de leer nada, en cada función.', r.consulta, v_msg, r.pista;
    end if;
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- g · El listado nuevo dice lo mismo que el viejo ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Primero, que los fixtures cubran lo que dicen cubrir: una identidad
  -- entre dos funciones sobre siete tenants iguales no probaría nada.
  select
    count(distinct v.owner_estado) = 3                                 as f1,
    bool_or(v.contactado) and bool_or(not v.contactado)                as f2,
    bool_or(v.telefono is null) and bool_or(v.telefono is not null)    as f3,
    count(distinct coalesce(v.onboarding_paso, 0)) = 4                 as f4,
    count(distinct v.onboarding_pasos) = 2                             as f5,
    bool_or(v.modulo_neumaticos) and bool_or(not v.modulo_neumaticos)  as f6,
    bool_or(v.sub_descuento_pct >= 100)                                as f7,
    bool_or(v.atencion is not null) and bool_or(v.atencion is null)    as f8,
    bool_or(v.suscripcion_id is null)                                  as f9,
    bool_or(not v.activo)                                              as f10,
    bool_or(v.services_mes > 0) and bool_or(v.ultimo_service is null)  as f11,
    count(*) filter (where v.id = t8) = 2 and count(*) filter (where v.id = t9) = 2 as f12
    into r
    from r34_listado_v1() v
   where v.id = any(v_ids);
  if not (r.f1 and r.f2 and r.f3 and r.f4 and r.f5 and r.f6 and r.f7 and r.f8 and r.f9 and r.f10 and r.f11 and r.f12) then
    raise exception 'R34g SIN VARIEDAD: los diez tenants de prueba no cubren todas las ramas (owner 3 estados %, contactado %, teléfono %, pasos 1/2/3/null %, 2 y 3 pasos %, módulo %, bonificado %, atención %, sin suscripción %, suspendido %, trabajos %, dos owners = dos filas en T8 y T9 %). Con menos variedad la identidad con el listado viejo pasa en verde sin haber ejercitado lo que se inlineó.',
      r.f1, r.f2, r.f3, r.f4, r.f5, r.f6, r.f7, r.f8, r.f9, r.f10, r.f11, r.f12;
  end if;

  -- Y que los BORDES estén donde tienen que estar. Cada uno existe porque
  -- en la revisión del bloque una mutación concreta pasó en verde sin él:
  -- `>` en vez de `>=` en el mes (listado y pulso), `desc` en el orden de
  -- las sucursales, `where activo` en productos o en premios, `>=` en
  -- contactado. Si un fixture se corre y deja de ser borde, esto lo dice
  -- antes de que la identidad pase en verde sin haber probado nada.
  select
    exists (select 1 from services s where s.lubricentro_id = t7 and not s.anulado and s.fecha = v_mes1)
      and exists (select 1 from services s where s.lubricentro_id = t7 and not s.anulado and s.fecha = v_mes1 - 1) as b1,
    (select v.telefono from r34_listado_v1() v where v.id = t2) = '351 400 0022'                                   as b2,
    exists (select 1 from productos p where p.lubricentro_id = t2)
      and not exists (select 1 from productos p where p.lubricentro_id = t2 and p.activo)                          as b3,
    exists (select 1 from premios p where p.lubricentro_id = t1 and not p.activo)
      and exists (select 1 from premios p where p.lubricentro_id = t6 and p.activo)                                 as b4,
    (select l.onboarding_completado_at is null from lubricentros l where l.id = t1)
      and (select v.onboarding_paso is null from r34_listado_v1() v where v.id = t1)                               as b5,
    exists (select 1 from contactos_fidelli c where c.lubricentro_id = t4
              and c.created_at = (select max(p.created_at) from pagos p where p.lubricentro_id = t4))
      and not (select v.contactado from r34_listado_v1() v where v.id = t4)                                        as b6,
    -- T9: dos owners y UN solo created_at entre los dos (el empate existe).
    (select count(*) = 2 and count(distinct u.created_at) = 1 from usuarios u where u.lubricentro_id = t9)          as b7,
    -- T10: la clave `neumaticos` está en el plan y NO en el override, y la
    -- vieja lo ve prendido: el escalón del plan es el que decide.
    (select p.features -> 'neumaticos' = 'true'::jsonb from planes p where p.id = v_plan_gom)
      and not (select coalesce(l.plan_overrides, '{}'::jsonb) ? 'neumaticos' from lubricentros l where l.id = t10)
      and (select v.modulo_neumaticos from r34_listado_v1() v where v.id = t10)                                    as b8,
    -- T3: suspendido y SIN atención (el orden lo decide `activo desc`), y T6
    -- suspendido CON atención (lo decide la atención): uno de cada.
    (select not v.activo and v.atencion is null from r34_listado_v1() v where v.id = t3)
      and (select not v.activo and v.atencion is not null from r34_listado_v1() v where v.id = t6)                 as b9
    into r;
  if not (r.b1 and r.b2 and r.b3 and r.b4 and r.b5 and r.b6 and r.b7 and r.b8 and r.b9) then
    raise exception 'R34g SIN BORDES: los fixtures no están en el borde que dicen cubrir (trabajo el día 1 del mes y el último del anterior %, teléfono de la sucursal más vieja por created_at aunque insertada después %, único producto apagado %, premio apagado en T1 y activo en T6 %, T1 completo por los pasos y no por decreto %, contacto en el mismo instante que el pago y no contactado %, dos owners con el mismo created_at %, módulo prendido solo por el plan %, un suspendido sin atención y otro con %). Sin el borde, un > por >=, un desc, un where activo, un >=, un when false o un activo asc colados en la reescritura pasan la identidad en verde.',
      r.b1, r.b2, r.b3, r.b4, r.b5, r.b6, r.b7, r.b8, r.b9;
  end if;

  -- Las mismas filas y los mismos tenants: la cantidad de filas Y la de
  -- ids distintos de la nueva tienen que ser las de la vieja (un join que
  -- multiplica filas pasa un EXCEPT sin que nadie lo note). Es identidad,
  -- no unicidad: un tenant con dos owners sale dos veces en las DOS
  -- versiones (estados_owner() es por usuario), y eso no es una rotura.
  select count(*), count(distinct x.id) into v_n, v_k from r34_listado_v1() x;
  select count(*), count(distinct x.id) into v_m, v_ok_k from listado_lubricentros() x;
  if v_n <> v_m or v_k <> v_ok_k then
    raise exception 'R34g EL LISTADO NUEVO DEVUELVE % FILAS (% tenants distintos) Y EL VIEJO % (% distintos). Una pasada por tabla que multiplica o pierde filas cambia la tabla de /fidelli/lubricentros sin ningún error a la vista.', v_m, v_ok_k, v_n, v_k;
  end if;

  -- Fila por fila y columna por columna, con el nombre de lo que difiere.
  -- Solo los tenants con UNA fila en cada versión: los de dos owners
  -- (dos filas en las dos) se comparan después como multiconjunto, porque
  -- un full join por id los cruzaría 2 × 2.
  for r in
    with unicos as (
      select x.id
      from (select a.id, 1 as v from r34_listado_v1() a
            union all
            select b.id, 2 from listado_lubricentros() b) x
      group by x.id
      having count(*) filter (where x.v = 1) = 1
         and count(*) filter (where x.v = 2) = 1
    ),
    pares as (
      select coalesce(a.id, b.id) as id, a.id is null as sin_v1, b.id is null as sin_v2,
        array_remove(array[
          case when a.nombre            is distinct from b.nombre            then 'nombre'            end,
          case when a.slug              is distinct from b.slug              then 'slug'              end,
          case when a.activo            is distinct from b.activo            then 'activo'            end,
          case when a.calcos_entregadas is distinct from b.calcos_entregadas then 'calcos_entregadas' end,
          case when a.creado            is distinct from b.creado            then 'creado'            end,
          case when a.suscripcion_id    is distinct from b.suscripcion_id    then 'suscripcion_id'    end,
          case when a.sub_estado        is distinct from b.sub_estado        then 'sub_estado'        end,
          case when a.sub_periodo       is distinct from b.sub_periodo       then 'sub_periodo'       end,
          case when a.sub_descuento_pct is distinct from b.sub_descuento_pct then 'sub_descuento_pct' end,
          case when a.sub_vencimiento   is distinct from b.sub_vencimiento   then 'sub_vencimiento'   end,
          case when a.plan_id           is distinct from b.plan_id           then 'plan_id'           end,
          case when a.plan_nombre       is distinct from b.plan_nombre       then 'plan_nombre'       end,
          case when a.plan_precio       is distinct from b.plan_precio       then 'plan_precio'       end,
          case when a.plan_desc_sem     is distinct from b.plan_desc_sem     then 'plan_desc_sem'     end,
          case when a.plan_desc_anual   is distinct from b.plan_desc_anual   then 'plan_desc_anual'   end,
          case when a.services_mes      is distinct from b.services_mes      then 'services_mes'      end,
          case when a.ultimo_service    is distinct from b.ultimo_service    then 'ultimo_service'    end,
          case when a.owner_estado      is distinct from b.owner_estado      then 'owner_estado'      end,
          case when a.owner_nombre      is distinct from b.owner_nombre      then 'owner_nombre'      end,
          case when a.atencion          is distinct from b.atencion          then 'atencion'          end,
          case when a.atencion_orden    is distinct from b.atencion_orden    then 'atencion_orden'    end,
          case when a.contactado        is distinct from b.contactado        then 'contactado'        end,
          case when a.telefono          is distinct from b.telefono          then 'telefono'          end,
          case when a.onboarding_paso   is distinct from b.onboarding_paso   then 'onboarding_paso'   end,
          case when a.onboarding_pasos  is distinct from b.onboarding_pasos  then 'onboarding_pasos'  end,
          case when a.onboarding_avance is distinct from b.onboarding_avance then 'onboarding_avance' end,
          case when a.modulo_neumaticos is distinct from b.modulo_neumaticos then 'modulo_neumaticos' end
        ], null) as difs,
        a.slug as slug_v1, b.slug as slug_v2
      from (select * from r34_listado_v1() a0 where a0.id in (select u0.id from unicos u0)) a
      full join (select * from listado_lubricentros() b0 where b0.id in (select u0.id from unicos u0)) b on b.id = a.id
    )
    select * from pares p where p.sin_v1 or p.sin_v2 or cardinality(p.difs) > 0
    order by p.id limit 1
  loop
    if r.sin_v1 or r.sin_v2 then
      raise exception 'R34g EL TENANT % ESTÁ EN UNA VERSIÓN DEL LISTADO Y NO EN LA OTRA (en la vieja: %, en la nueva: %).', r.id, not r.sin_v1, not r.sin_v2;
    end if;
    raise exception 'R34g EL LISTADO NUEVO NO DICE LO MISMO QUE EL VIEJO para «%» en %: la reescritura de una pasada por tabla cambió el dato que ve /fidelli/lubricentros. Cada columna inlineada (contactado, teléfono, owner, onboarding, módulo) tiene que reproducir la función que reemplazó.', r.slug_v1, r.difs;
  end loop;

  -- Los tenants con más de una fila (dos owners): las mismas filas como
  -- multiconjunto en las 27 columnas que no dependen de qué owner se elige
  -- (`except all` en las dos direcciones), y `owner_nombre` aparte.
  select count(*) into v_n from (
    select a.id, a.nombre, a.slug, a.activo, a.calcos_entregadas, a.creado, a.suscripcion_id, a.sub_estado, a.sub_periodo, a.sub_descuento_pct, a.sub_vencimiento, a.plan_id, a.plan_nombre, a.plan_precio, a.plan_desc_sem, a.plan_desc_anual, a.services_mes, a.ultimo_service, a.owner_estado, a.atencion, a.atencion_orden, a.contactado, a.telefono, a.onboarding_paso, a.onboarding_pasos, a.onboarding_avance, a.modulo_neumaticos
      from r34_listado_v1() a where a.id in (select x.id from r34_listado_v1() x group by x.id having count(*) > 1)
    except all
    select b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.creado, b.suscripcion_id, b.sub_estado, b.sub_periodo, b.sub_descuento_pct, b.sub_vencimiento, b.plan_id, b.plan_nombre, b.plan_precio, b.plan_desc_sem, b.plan_desc_anual, b.services_mes, b.ultimo_service, b.owner_estado, b.atencion, b.atencion_orden, b.contactado, b.telefono, b.onboarding_paso, b.onboarding_pasos, b.onboarding_avance, b.modulo_neumaticos
      from listado_lubricentros() b where b.id in (select x.id from listado_lubricentros() x group by x.id having count(*) > 1)
  ) d;
  select count(*) into v_m from (
    select b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.creado, b.suscripcion_id, b.sub_estado, b.sub_periodo, b.sub_descuento_pct, b.sub_vencimiento, b.plan_id, b.plan_nombre, b.plan_precio, b.plan_desc_sem, b.plan_desc_anual, b.services_mes, b.ultimo_service, b.owner_estado, b.atencion, b.atencion_orden, b.contactado, b.telefono, b.onboarding_paso, b.onboarding_pasos, b.onboarding_avance, b.modulo_neumaticos
      from listado_lubricentros() b where b.id in (select x.id from listado_lubricentros() x group by x.id having count(*) > 1)
    except all
    select a.id, a.nombre, a.slug, a.activo, a.calcos_entregadas, a.creado, a.suscripcion_id, a.sub_estado, a.sub_periodo, a.sub_descuento_pct, a.sub_vencimiento, a.plan_id, a.plan_nombre, a.plan_precio, a.plan_desc_sem, a.plan_desc_anual, a.services_mes, a.ultimo_service, a.owner_estado, a.atencion, a.atencion_orden, a.contactado, a.telefono, a.onboarding_paso, a.onboarding_pasos, a.onboarding_avance, a.modulo_neumaticos
      from r34_listado_v1() a where a.id in (select x.id from r34_listado_v1() x group by x.id having count(*) > 1)
  ) d;
  if v_n <> 0 or v_m <> 0 then
    raise exception 'R34g UN TENANT CON DOS OWNERS NO DICE LO MISMO EN LAS DOS VERSIONES (% filas solo en la vieja, % solo en la nueva, sin contar owner_nombre). Con dos owners el listado devuelve dos filas, una por estado del owner, en las dos versiones; el resto de las columnas tiene que ser idéntico.', v_n, v_m;
  end if;

  -- La única salida que cambia a propósito: con dos owners, `owner_nombre`
  -- es el más antiguo (created_at, id), y no «el primero que encontró»
  -- como el `limit 1` sin order by de la vieja. T8 tiene al más nuevo
  -- insertado primero, así que el orden del heap y el de antigüedad no
  -- coinciden y la regla se ve.
  select array_agg(distinct b.owner_nombre) into v_nombres from listado_lubricentros() b where b.id = t8;
  if v_nombres is distinct from array['Owner Ocho viejo'] then
    raise exception 'R34g CON DOS OWNERS EL LISTADO NO ELIGIÓ AL MÁS VIEJO PARA owner_nombre: dio % y el owner más antiguo por usuarios.created_at es «Owner Ocho viejo» (el otro se insertó primero pero es más nuevo). El listado y estado_owner() eligen al mismo owner, el más antiguo, para que la tabla y la ficha no nombren a dos personas distintas.', v_nombres;
  end if;
  -- Y la vieja, que no ordenaba, tiene que haber nombrado a uno de los dos
  -- (si no, la diferencia no sería la documentada).
  select array_agg(distinct a.owner_nombre) into v_nombres from r34_listado_v1() a where a.id = t8;
  if not (v_nombres <@ array['Owner Ocho nuevo', 'Owner Ocho viejo']) then
    raise exception 'R34g SIN PISO: la copia vieja del listado nombra % para el tenant de dos owners; esperaba uno de los dos.', v_nombres;
  end if;
  -- Y con EMPATE de created_at (T9) decide el id menor. No es más
  -- significativo que el heap —es un uuid—, pero es fijo y es el mismo que
  -- usa estado_owner(). Lo esperado se calculó arriba con `order by id`.
  select array_agg(distinct b.owner_nombre) into v_nombres from listado_lubricentros() b where b.id = t9;
  if v_nombres is distinct from array[v_t9_nombre] then
    raise exception 'R34g CON DOS OWNERS EMPATADOS EN created_at EL LISTADO NO ELIGIÓ AL DE id MENOR PARA owner_nombre: dio % y esperaba «%». La regla es created_at y después id, en el listado y en estado_owner(); si el desempate cambia, cambia en los dos y en docs/METRICAS.md § 6.', v_nombres, v_t9_nombre;
  end if;
  select array_agg(distinct a.owner_nombre) into v_nombres from r34_listado_v1() a where a.id = t9;
  if not (v_nombres <@ array['Owner Nueve A', 'Owner Nueve B']) then
    raise exception 'R34g SIN PISO: la copia vieja del listado nombra % para el tenant de dos owners empatados; esperaba uno de los dos.', v_nombres;
  end if;

  -- Y en el mismo orden: la atención primero, el que vence antes adentro
  -- de cada motivo, los suspendidos al final, alfabético. Se compara la
  -- SECUENCIA DE CLAVES del orden y no la de ids: dos tenants homónimos con
  -- la misma atención empatan en las dos versiones y el ORDER BY no promete
  -- cuál va primero, así que comparar ids ahí pondría el bloque en rojo sin
  -- culpa de nadie. Si las claves van en la misma secuencia, el orden es el
  -- mismo hasta donde SQL lo garantiza.
  select array_agg(format('%s·%s·%s·%s', x.atencion_orden, case when x.atencion is not null then x.sub_vencimiento end, x.activo, x.nombre) order by x.ordinality)
    into v_claves_v1 from r34_listado_v1() with ordinality x;
  select array_agg(format('%s·%s·%s·%s', x.atencion_orden, case when x.atencion is not null then x.sub_vencimiento end, x.activo, x.nombre) order by x.ordinality)
    into v_claves_v2 from listado_lubricentros() with ordinality x;
  if v_claves_v1 <> v_claves_v2 then
    raise exception 'R34g EL ORDEN DEL LISTADO CAMBIÓ. La tabla de /fidelli/lubricentros llega ordenada desde SQL (atención → vencimiento → activos → nombre); el front no la reordena.';
  end if;

  -- ---------- h · metricas_plataforma(): el mismo jsonb ----------
  v_a := r34_metricas_v1();
  v_b := metricas_plataforma();

  -- Que los trabajos de prueba estén donde tienen que estar, en la NUEVA:
  -- el punto de hoy de la serie diaria con los tres tipos y sin el anulado.
  select count(*) into v_n from services s where not s.anulado and s.fecha = v_hoy;
  select count(*) into v_m from services s where s.fecha = v_hoy;
  select p into r from jsonb_array_elements(v_b -> 'series' -> 'dia') p where p ->> 'inicio' = v_hoy::text;
  if r.p is null then
    raise exception 'R34h la serie diaria nueva no tiene el punto de hoy (%).', v_hoy;
  end if;
  if (r.p ->> 'cantidad')::integer <> v_n or v_m <= v_n then
    raise exception 'R34h EL PUNTO DE HOY DICE % TRABAJOS Y HAY % NO ANULADOS (% con el anulado). El group by por fecha tiene que excluir los anulados y contar los tres tipos.', r.p ->> 'cantidad', v_n, v_m;
  end if;
  if (r.p ->> 'service')::integer < 1 or (r.p ->> 'mecanica')::integer < 1 or (r.p ->> 'neumaticos')::integer < 1 then
    raise exception 'R34h el punto de hoy no trae los tres tipos (%).', r.p;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_b -> 'series' -> 'semana') p
   where (p ->> 'neumaticos')::integer >= 1 and (p ->> 'inicio')::date <= v_hoy - 40;
  if v_n = 0 then
    raise exception 'R34h la gomería de hace 40 días no aparece en la serie semanal: el bucket por date_trunc no está colgando cada fecha en su semana.';
  end if;

  if v_a <> v_b then
    -- Decir DÓNDE difiere, no solo que difiere.
    foreach k in array array['trabajos_mes', 'acumulado', 'primer_trabajo'] loop
      if v_a -> k is distinct from v_b -> k then
        raise exception 'R34h metricas_plataforma() NUEVA DIFIERE DE LA VIEJA en «%»: % vs %. El contrato del Resumen es el mismo jsonb, clave por clave.', k, v_a -> k, v_b -> k;
      end if;
    end loop;
    foreach k in array array['dia', 'semana', 'mes'] loop
      if v_a -> 'series' -> k is distinct from v_b -> 'series' -> k then
        select coalesce(min(i), -1) into v_n
          from generate_series(0, greatest(jsonb_array_length(v_a -> 'series' -> k), jsonb_array_length(v_b -> 'series' -> k)) - 1) i
         where v_a -> 'series' -> k -> i is distinct from v_b -> 'series' -> k -> i;
        raise exception 'R34h LA SERIE «%» NUEVA DIFIERE DE LA VIEJA en el punto % (vieja %, nueva %; % vs % puntos). Un solo group by tiene que dar los mismos 30/12/12 puntos con los mismos números que los 54 count(*) que reemplazó.',
          k, v_n, v_a -> 'series' -> k -> v_n, v_b -> 'series' -> k -> v_n,
          jsonb_array_length(v_a -> 'series' -> k), jsonb_array_length(v_b -> 'series' -> k);
      end if;
    end loop;
    raise exception 'R34h metricas_plataforma() nueva difiere de la vieja: % vs %.', v_a, v_b;
  end if;
  if (v_a -> 'series')::text <> (v_b -> 'series')::text then
    raise exception 'R34h LAS SERIES SON IGUALES COMO JSONB PERO NO COMO TEXTO: cambió el orden de los puntos o el tipo de algún número (5 vs 5.0). El gráfico del Pulso lee los puntos en orden.';
  end if;

  -- La rama «cero trabajos» (una instalación nueva): la vieja tenía un `if
  -- v_primero is null` explícito; la nueva depende del `where r.primero is
  -- not null` de `puntos` (sin él, greatest() ignora el null y salen 30/12/12
  -- puntos en cero). Se prueba con `services` VACÍA adentro de una
  -- subtransacción que se deshace (el patrón de R27/R29): los trabajos del
  -- seed y de T6/T7 siguen ahí al salir. Cualquier otra excepción de adentro
  -- NO se atrapa: sube y pone el reset en rojo.
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);
    delete from services;
    if exists (select 1 from services) then
      raise exception 'R34h SIN PISO: no se pudo vaciar services adentro de la subtransacción.';
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_a := r34_metricas_v1();
    v_b := metricas_plataforma();
    if v_b -> 'series' <> '{"dia": [], "semana": [], "mes": []}'::jsonb
       or (v_b ->> 'acumulado')::bigint <> 0
       or v_b ->> 'primer_trabajo' is not null
       or (v_b ->> 'trabajos_mes')::bigint <> 0 then
      raise exception 'R34h SIN NINGÚN TRABAJO EL PULSO NUEVO NO ESTÁ VACÍO: series % (% puntos diarios), acumulado %, primer_trabajo %, trabajos_mes %. Una base recién instalada tiene que ver el Pulso vacío (las tres series en []), no 30 puntos en cero: lo garantiza el `where r.primero is not null` de `puntos`.',
        v_b -> 'series', jsonb_array_length(v_b -> 'series' -> 'dia'), v_b -> 'acumulado', v_b -> 'primer_trabajo', v_b -> 'trabajos_mes';
    end if;
    if v_a <> v_b then
      raise exception 'R34h SIN NINGÚN TRABAJO metricas_plataforma() nueva difiere de la vieja: % vs %.', v_a, v_b;
    end if;
    raise exception 'rollback_r34h' using errcode = 'P0034';
  exception
    when sqlstate 'P0034' then
      execute 'reset role';
      perform set_config('request.jwt.claims', '{}', true);
  end;
  if not exists (select 1 from services s where s.lubricentro_id = t7) then
    raise exception 'R34h SIN PISO: la subtransacción no deshizo el borrado de services.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- ---------- i · estado_owner() y suscriptos_por_plan() ----------
  if estado_owner(t1) is distinct from 'activo' then
    raise exception 'R34i estado_owner() dio «%» para un owner que ya inició sesión (esperaba activo).', estado_owner(t1);
  end if;
  if estado_owner(t2) is distinct from 'pendiente' then
    raise exception 'R34i estado_owner() dio «%» para un owner que nunca inició sesión (esperaba pendiente). La ficha muestra el chip «Owner sin activar» con esto.', estado_owner(t2);
  end if;
  if estado_owner(t3) is not null then
    raise exception 'R34i estado_owner() dio «%» para un tenant SIN owner (esperaba null).', estado_owner(t3);
  end if;
  -- estados_owner() devuelve una fila por owner: con uno, estado_owner()
  -- tiene que dar exactamente esa; con dos, una de las dos (y cuál, se
  -- prueba abajo con T8).
  select count(*) into v_n from (
    select eo.lubricentro_id, array_agg(eo.estado) as estados
    from estados_owner() eo group by eo.lubricentro_id
  ) x
  where estado_owner(x.lubricentro_id) is null
     or not (estado_owner(x.lubricentro_id) = any(x.estados));
  if v_n <> 0 then
    raise exception 'R34i estado_owner() Y estados_owner() SE CONTRADICEN en % tenant(s). Son la misma regla (auth.users.last_sign_in_at) en dos funciones; si difieren, la cabecera de la ficha y el listado dicen cosas distintas del mismo owner.', v_n;
  end if;
  if estado_owner(t8) is distinct from 'activo' then
    raise exception 'R34i estado_owner() CON DOS OWNERS NO ELIGIÓ AL MÁS VIEJO: dio «%» y el owner más antiguo por usuarios.created_at ya entró (activo); el otro, insertado primero pero más nuevo, nunca entró. La ficha tiene que hablar del mismo owner que el listado (owner_nombre): el más antiguo, no el primero del heap.', estado_owner(t8);
  end if;
  if estado_owner(t9) is distinct from v_t9_estado then
    raise exception 'R34i estado_owner() CON DOS OWNERS EMPATADOS EN created_at NO ELIGIÓ AL DE id MENOR: dio «%» y el de id menor % (esperaba «%»). El desempate es el mismo del listado (created_at, después id): la ficha y la tabla nombran a la misma persona también en el empate.',
      estado_owner(t9), case when v_t9_estado = 'activo' then 'ya entró' else 'nunca entró' end, v_t9_estado;
  end if;
  select count(*) into v_n from lubricentros l
   where l.id not in (select eo.lubricentro_id from estados_owner() eo)
     and estado_owner(l.id) is not null;
  if v_n <> 0 then
    raise exception 'R34i estado_owner() inventa un owner para % tenant(s) que estados_owner() no lista.', v_n;
  end if;

  -- suscriptos_por_plan() = las columnas equivalentes del listado, para
  -- TODOS los tenants con suscripción; ni una fila más ni una menos.
  -- Tenants, no filas: el listado repite la fila de un tenant con dos
  -- owners y suscriptos_por_plan() no (una por tenant con suscripción).
  select count(*) into v_n from suscriptos_por_plan();
  select count(distinct li.id) into v_m from listado_lubricentros() li where li.suscripcion_id is not null;
  if v_n <> v_m then
    raise exception 'R34i suscriptos_por_plan() devuelve % filas y el listado tiene % tenants (distintos) con suscripción. Una fila por tenant CON suscripción, la vigente.', v_n, v_m;
  end if;
  select count(*) into v_n from (
    select sp.plan_id, sp.lubricentro_id, sp.nombre, sp.periodo, sp.descuento_pct, sp.estado from suscriptos_por_plan() sp
    except
    select li.plan_id, li.id, li.nombre, li.sub_periodo, li.sub_descuento_pct, li.sub_estado from listado_lubricentros() li where li.suscripcion_id is not null
  ) x;
  select count(*) into v_m from (
    select li.plan_id, li.id, li.nombre, li.sub_periodo, li.sub_descuento_pct, li.sub_estado from listado_lubricentros() li where li.suscripcion_id is not null
    except
    select sp.plan_id, sp.lubricentro_id, sp.nombre, sp.periodo, sp.descuento_pct, sp.estado from suscriptos_por_plan() sp
  ) x;
  if v_n <> 0 or v_m <> 0 then
    raise exception 'R34i suscriptos_por_plan() Y EL LISTADO NO COINCIDEN (% filas de más, % de menos). /fidelli/precios y /fidelli/lubricentros tienen que decir el mismo plan, período, descuento y estado de cada tenant.', v_n, v_m;
  end if;
  select sp.plan_id into v_plan from suscriptos_por_plan() sp where sp.lubricentro_id = t5;
  if v_plan is distinct from v_pro then
    raise exception 'R34i SUSCRIPTOS TOMÓ UNA SUSCRIPCIÓN QUE NO ES LA VIGENTE: el tenant con una Basic cancelada de hace un año y una Pro activa salió con el plan %. La vigente es la última que arrancó (inicio desc, created_at desc), el mismo criterio del listado.',
      (select p.nombre from planes p where p.id = v_plan);
  end if;
  -- Ordenada por plan y nombre: ninguna fila va DETRÁS de una con clave
  -- mayor. Se mira así y no contra un reordenado, porque dos tenants
  -- homónimos en el mismo plan empatan y el ORDER BY no promete cuál va
  -- primero; un reordenado los podría dar vuelta sin que nada esté mal.
  select count(*) into v_n from (
    select x.plan_id, x.nombre,
           lag(x.plan_id) over (order by x.ordinality) as plan_ant,
           lag(x.nombre)  over (order by x.ordinality) as nombre_ant
    from suscriptos_por_plan() with ordinality x
  ) y
  where (y.plan_id, y.nombre) < (y.plan_ant, y.nombre_ant);
  if v_n <> 0 then
    raise exception 'R34i suscriptos_por_plan() no sale ordenada por plan y nombre (% fila(s) detrás de una con clave mayor). /fidelli/precios agrupa por plan leyendo las filas en orden.', v_n;
  end if;

  -- ---------- limpieza ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  delete from services            where lubricentro_id = any(v_ids);
  delete from contactos_fidelli   where lubricentro_id = any(v_ids);
  delete from pagos               where lubricentro_id = any(v_ids);
  delete from productos           where lubricentro_id = any(v_ids);
  delete from premios             where lubricentro_id = any(v_ids);
  delete from config_experiencia  where lubricentro_id = any(v_ids);
  delete from vehiculos           where lubricentro_id = any(v_ids);
  delete from clientes            where lubricentro_id = any(v_ids);
  delete from sucursales          where lubricentro_id = any(v_ids);
  delete from suscripciones       where lubricentro_id = any(v_ids);
  delete from cambios_override_plan where lubricentro_id = any(v_ids);
  delete from auth.users          where id = any(v_uids);   -- cascade → usuarios
  -- Los eventos, la config de gomería y los pedidos de calcos se van con
  -- el cascade.
  delete from lubricentros        where id = any(v_ids);
  -- El plan de prueba, ya sin suscripciones que lo apunten (restrict).
  delete from planes              where id = v_plan_gom;
  if exists (select 1 from planes p where p.id = v_plan_gom) then
    raise exception 'R34g SIN LIMPIEZA: el plan de prueba «Plan Gomería R34» quedó en el catálogo.';
  end if;
end $$;

drop function r34_perf_tenant(text, text, boolean, text, timestamptz);
drop function r34_perf_owner(uuid, text, text, timestamptz, boolean);
drop function r34_listado_v1();
drop function r34_metricas_v1();

-- ============================================================
-- R34j · EL CANDADO DEL CONTADOR DE CALCOS (bloque MÉTRICAS 4)
--
-- La migración 20260925102000_calcos_candado.sql. docs/METRICAS.md § 1
-- «Pedido de calcos»: lubricentros.calcos_entregadas ES LA SUMA de
-- pedidos_calcos. Lo que este bloque sostiene:
--
--   1 · Un UPDATE directo del contador como postgres queda en la suma.
--   2 · actualizar_lubricentro() con otro p_calcos (la RPC del ABM, que
--       el dialog Editar ya manda en solo lectura) tampoco lo mueve.
--   3 · registrar_pedido_calcos() sigue sumando y deja el evento `calcos`.
--   4 · Después de un pedido, EN LA MISMA TRANSACCIÓN, la bandera está
--       apagada: un update directo (también como superadmin por PostgREST,
--       que tiene política ALL) vuelve a la suma.
--   5 · No hay trigger de alta porque crear_lubricentro() no escribe la
--       columna: un tenant nuevo nace con 0 y sin pedidos. Si algún día el
--       alta trae calcos, esto se pone rojo y ahí sí hace falta el trigger.
--   6 · El camino del seed sigue sano: un tenant que nace con calcos > 0
--       por INSERT directo (como el demo) + backfill_pedidos_calcos() da
--       contador = suma, y desde ahí el candado lo cuida.
--   7 · tenant_eventos: un update forzado al mismo valor NO deja evento
--       `calcos` (new = old, no hubo cambio real); el pedido sí.
--
-- Corre como el superadmin del seed bajo `authenticated` donde la puerta
-- lo exige; los fixtures y los updates «de postgres» van como postgres.
-- Limpia al final. scripts/regresion-metricas.sh rompe el candado y la
-- bandera y espera ver este bloque en rojo.
-- ============================================================

-- >>> R34j
do $$
declare
  v_super  uuid;
  v_plan   uuid;
  v_lub    uuid;   -- el tenant del candado: pedidos por la puerta y updates por afuera
  v_seed   uuid;   -- nace con 30 por insert directo, como el demo del seed
  v_alta   uuid;   -- nace por crear_lubricentro(): 0 y sin pedidos
  v_n      integer;
  v_m      integer;
  v_ev     integer;
begin
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_plan from planes where nombre = 'Pro' and not heredado;
  if v_super is null or v_plan is null then
    raise exception 'R34j SIN PISO: falta el superadmin o el plan Pro del seed.';
  end if;

  -- ---------- Los fixtures, como postgres ----------
  insert into lubricentros (nombre, slug) values ('Calcos R34', 'calcos-r34') returning id into v_lub;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual', 0, current_date + 30);

  -- ---------- 1 · Un update directo, como postgres, sin pedidos ----------
  update lubricentros set calcos_entregadas = 999 where id = v_lub;
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 0 then
    raise exception 'R34j EL CANDADO NO RIGE: un update directo dejó calcos_entregadas = % en un tenant SIN pedidos (tenía que quedar en 0). El contador es la suma de pedidos_calcos (docs/METRICAS.md § 1 «Pedido de calcos»); si cualquier UPDATE lo pisa, el número de la ficha y la constancia de entregas dejan de ser lo mismo.', v_n;
  end if;
  -- 7 · Forzado al mismo valor (0 → 0) no hay cambio real: sin evento.
  select count(*) into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'calcos';
  if v_ev <> 0 then
    raise exception 'R34j: un update forzado al mismo valor dejó % evento(s) calcos. El trigger AFTER recibe la fila ya corregida (new = old) y no tiene nada que contar.', v_ev;
  end if;

  -- ---------- 3 · La puerta, como superadmin ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform registrar_pedido_calcos(v_lub, current_date, 40, true, null, 'R34j');
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 40 then
    raise exception 'R34j LA PUERTA QUEDÓ TAPADA POR SU PROPIO CANDADO: tras un pedido de 40, calcos_entregadas = %. La bandera app.calcos_desde_pedido tiene que estar prendida durante el update de registrar_pedido_calcos().', v_n;
  end if;
  select count(*) into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'calcos';
  if v_ev <> 1 then
    raise exception 'R34j: el pedido no dejó el evento calcos (hay %). El candado no puede comerse el evento del cambio real.', v_ev;
  end if;

  -- ---------- 4 · La bandera se apagó al salir de la puerta ----------
  if current_setting('app.calcos_desde_pedido', true) is not distinct from 'true' then
    raise exception 'R34j LA BANDERA QUEDÓ PRENDIDA DESPUÉS DEL PEDIDO. En una transacción larga, todo update posterior del contador heredaría el permiso de la puerta: hay que apagarla justo después del update.';
  end if;
  -- Como superadmin por PostgREST: la política lubricentros_admin es ALL,
  -- así que este update es exactamente lo que un `from('lubricentros').update()`
  -- podría hacer.
  update lubricentros set calcos_entregadas = 999 where id = v_lub;
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 40 then
    raise exception 'R34j UN UPDATE DIRECTO DESPUÉS DE UN PEDIDO, EN LA MISMA TRANSACCIÓN, PISÓ EL CONTADOR (% con pedidos que suman 40). La bandera de la puerta no se apagó o el candado no la mira.', v_n;
  end if;

  -- ---------- 2 · actualizar_lubricentro() con otro número ----------
  perform actualizar_lubricentro(v_lub, 'Calcos R34', 'calcos-r34', 999, v_plan, 'mensual', 0, current_date + 30);
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 40 then
    raise exception 'R34j actualizar_lubricentro() PISÓ EL CONTADOR: p_calcos = 999 dejó calcos_entregadas = % con pedidos que suman 40. Es el hueco que § 6 del bloque 3 dejó anotado: la RPC del ABM no mira los pedidos, el candado tiene que hacerlo por ella.', v_n;
  end if;
  select count(*) into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'calcos';
  if v_ev <> 1 then
    raise exception 'R34j: el update forzado al mismo valor por actualizar_lubricentro() dejó un evento calcos de más (hay %). Sin cambio real no hay evento.', v_ev;
  end if;
  -- Y con el valor actual, que es lo que manda el dialog Editar, el resto
  -- de la edición pasa y el contador ni se entera.
  perform actualizar_lubricentro(v_lub, 'Calcos R34 editado', 'calcos-r34', 40, v_plan, 'mensual', 0, current_date + 30);
  select calcos_entregadas, (select count(*) from tenant_eventos e where e.lubricentro_id = v_lub and e.tipo = 'edicion')
    into v_n, v_m from lubricentros where id = v_lub;
  if v_n <> 40 or v_m <> 1 then
    raise exception 'R34j: la edición con el valor actual dejó calcos = % y % evento(s) edicion (esperaba 40 y 1). El candado no puede frenar la edición del nombre.', v_n, v_m;
  end if;

  -- Un segundo pedido: la suma es el total, y el evento sale.
  perform registrar_pedido_calcos(v_lub, current_date, 10, false, 1500, null);
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 50 then
    raise exception 'R34j: con pedidos de 40 y 10, calcos_entregadas = % (tenía que ser 50).', v_n;
  end if;
  select count(*) into v_ev from tenant_eventos where lubricentro_id = v_lub and tipo = 'calcos';
  if v_ev <> 2 then
    raise exception 'R34j: el segundo pedido no dejó su evento calcos (hay %).', v_ev;
  end if;

  -- ---------- 1 (bis) · Como postgres, ahora con pedidos ----------
  execute 'reset role';
  update lubricentros set calcos_entregadas = 999 where id = v_lub;
  select calcos_entregadas into v_n from lubricentros where id = v_lub;
  if v_n <> 50 then
    raise exception 'R34j EL CANDADO NO RIGE PARA postgres: un update directo dejó calcos_entregadas = % con pedidos que suman 50. El trigger es ALWAYS: no distingue roles.', v_n;
  end if;

  -- ---------- 6 · El camino del seed ----------
  -- El demo nace con 50 por INSERT en seed_demo() y seed.sql corre el
  -- backfill después. El candado es BEFORE UPDATE: no se mete en el insert
  -- ni en el backfill (que solo escribe pedidos_calcos).
  insert into lubricentros (nombre, slug, calcos_entregadas)
  values ('Calcos seed R34', 'calcos-seed-r34', 30) returning id into v_seed;
  if backfill_pedidos_calcos() <> 1 then
    raise exception 'R34j: el backfill tenía que insertar exactamente 1 pedido para el tenant que nació con 30 por insert directo.';
  end if;
  select l.calcos_entregadas, (select sum(pc.cantidad) from pedidos_calcos pc where pc.lubricentro_id = v_seed)
    into v_n, v_m from lubricentros l where l.id = v_seed;
  if v_n <> 30 or v_m <> 30 then
    raise exception 'R34j: tras el backfill, el tenant del seed tiene contador % y suma % (esperaba 30 y 30).', v_n, v_m;
  end if;
  update lubricentros set calcos_entregadas = 5 where id = v_seed;
  select calcos_entregadas into v_n from lubricentros where id = v_seed;
  if v_n <> 30 then
    raise exception 'R34j: un update directo bajó el contador del tenant del seed a % (la suma es 30).', v_n;
  end if;

  -- ---------- 5 · El alta no trae calcos ----------
  -- Es la razón por la que NO hay trigger AFTER INSERT que registre un
  -- «pedido inicial». Mismo baile que R33l: el alta es un constraint
  -- trigger diferido y el `set constraints all immediate` de bloques
  -- anteriores puede seguir vigente.
  execute 'set local role authenticated';
  set constraints all deferred;
  select crear_lubricentro('Alta calcos R34', 'alta-calcos-r34',
    '[{"nombre":"Centro"}]'::jsonb, v_plan, 'mensual', 0) into v_alta;
  set constraints all immediate;
  select l.calcos_entregadas, (select count(*) from pedidos_calcos pc where pc.lubricentro_id = v_alta)
    into v_n, v_m from lubricentros l where l.id = v_alta;
  if v_n <> 0 or v_m <> 0 then
    raise exception 'R34j EL ALTA AHORA TRAE CALCOS (contador %, pedidos %). crear_lubricentro() empezó a escribir calcos_entregadas: hace falta el trigger AFTER INSERT que registre el pedido inicial (fecha = alta, incluidas, nota ''alta''), y que no duplique lo que hace backfill_pedidos_calcos().', v_n, v_m;
  end if;

  -- ---------- limpieza ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  delete from sucursales where lubricentro_id = v_alta;
  delete from mensaje_templates where lubricentro_id = v_alta;
  delete from config_experiencia where lubricentro_id = v_alta;
  delete from suscripciones where lubricentro_id in (v_lub, v_alta);
  -- Los pedidos de calcos y los eventos se van con el cascade.
  delete from lubricentros where id in (v_lub, v_seed, v_alta);
end $$;
-- <<< R34j
-- <<< R34

-- ============================================================
-- Limpieza final: las fotos de prueba de R31c. cerrar_dia() se prueba sobre
-- días de 1991 para no pisar ningún día real, y como los candados de
-- snapshots_diarios no dejan borrar nunca (ni a postgres), esas tres fotos
-- quedaban en cada base local y el gráfico del MRR del Resumen arrancaba en
-- 1991 (treinta y cinco años de rótulos de mes pisados). Acá, y SOLO acá,
-- se bajan los dos candados de borrado, se van las fotos y el tipo de cambio
-- de prueba, y los candados vuelven a ALWAYS. Fuera de este archivo la única
-- forma legítima de vaciar snapshots sigue siendo supabase db reset.
-- ============================================================
alter table snapshots_diarios disable trigger candado_borrado_snapshot_diario;
alter table snapshots_diarios disable trigger candado_purga_snapshots_diarios;
alter table snapshots_tenant_diarios disable trigger candado_borrado_snapshot_tenant;
alter table snapshots_tenant_diarios disable trigger candado_purga_snapshots_tenant;
delete from snapshots_tenant_diarios where fecha < '2000-01-01';
delete from snapshots_diarios where fecha < '2000-01-01';
delete from tipo_cambio where fecha < '2000-01-01';
alter table snapshots_diarios enable always trigger candado_borrado_snapshot_diario;
alter table snapshots_diarios enable always trigger candado_purga_snapshots_diarios;
alter table snapshots_tenant_diarios enable always trigger candado_borrado_snapshot_tenant;
alter table snapshots_tenant_diarios enable always trigger candado_purga_snapshots_tenant;

do $$
declare v_n integer;
begin
  select count(*) into v_n from snapshots_diarios where fecha < '2000-01-01';
  if v_n <> 0 then
    raise exception 'La limpieza final dejó % fotos de prueba en snapshots_diarios.', v_n;
  end if;
  select count(*) into v_n from pg_trigger
   where tgrelid in ('snapshots_diarios'::regclass, 'snapshots_tenant_diarios'::regclass)
     and not tgisinternal and tgenabled <> 'A';
  if v_n <> 0 then
    raise exception 'La limpieza final dejó % candados de snapshots sin ALWAYS.', v_n;
  end if;
end $$;


-- ============================================================
-- R35 · El plazo de edición por tipo: 7 días para la mecánica
--
-- La regla de las 24 horas era la única de las reglas grandes sin
-- regresión. Ahora que el plazo depende del tipo hay dos formas de
-- romperla y las dos son silenciosas: que la mecánica vuelva a fijarse a
-- las 24 horas (la ficha queda a medias y el taller llama a Fidelli), o
-- que un service quede editable una semana (el cartón deja de ser
-- confiable para el dueño del auto). Ninguna da error: la policy filtra
-- filas y el UPDATE afecta cero, o afecta una que no debía.
--
-- Y hay una tercera, que vivió en producción desde el primer día: un
-- INSERT no evalúa el USING, solo el WITH CHECK. Con la ventana escrita
-- solo en el USING de items_escritura y ruedas_escritura, un renglón —o
-- una rueda— entraba en un trabajo fijado con un POST directo a
-- PostgREST (las RPC no lo dejaban porque tocan primero la cabecera).
-- Desde 20260925120000 la ventana está en las dos mitades; f y g lo
-- vigilan. Acá RLS sí lanza error —la fila nueva viola la policy— y por
-- eso esas dos esperan un 42501, no cero filas.
--
-- Fixtures propios —cliente, auto y cinco trabajos, cuatro retrodatados,
-- como postgres— para no depender de la edad de lo que dejó el seed. Todo
-- se borra al final.
-- ============================================================
-- >>> R35
do $$
declare
  v_demo    uuid;
  v_own     uuid;
  v_super   uuid;
  v_suc     uuid;
  v_cli     uuid;
  v_veh     uuid;
  v_mec3    uuid;  -- mecánica de hace 3 días: editable
  v_mec8    uuid;  -- mecánica de hace 8 días: fijada
  v_srv3    uuid;  -- service de hace 3 días: fijado
  v_neu3    uuid;  -- neumáticos de hace 3 días: fijado
  v_neu0    uuid;  -- neumáticos recién cargado: editable (para g)
  v_tenia_modulo boolean;
  v_tipo    tipo_trabajo;
  v_n       integer;
  v_carton  jsonb;
  v_fila    jsonb;
  v_hasta   timestamptz;
begin
  select id into v_demo  from lubricentros where slug = 'demo';
  select id into v_own   from usuarios where lubricentro_id = v_demo and rol = 'owner' limit 1;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;
  select id into v_suc   from sucursales where lubricentro_id = v_demo and activa order by created_at limit 1;
  if v_demo is null or v_own is null or v_super is null or v_suc is null then
    raise exception 'R35 SIN PISO: falta el demo, su owner, su sucursal o el superadmin.';
  end if;

  -- ---------- a · plazo_edicion(): existe y contesta por CADA tipo ----------
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plazo_edicion'
  ) then
    raise exception 'R35a plazo_edicion() no existe: las policies y get_carton no tienen de dónde sacar el plazo.';
  end if;
  foreach v_tipo in array enum_range(null::tipo_trabajo) loop
    if plazo_edicion(v_tipo) is null then
      raise exception 'R35a plazo_edicion(%) devuelve null: el tipo quedó afuera del case y sus trabajos nacen fijados.', v_tipo;
    end if;
  end loop;
  if plazo_edicion('mecanica') <> interval '7 days' then
    raise exception 'R35a la mecánica se fija a % y no a los 7 días: la ficha de un arreglo de motor vuelve a quedar a medias.', plazo_edicion('mecanica');
  end if;
  if plazo_edicion('service') <> interval '24 hours' or plazo_edicion('neumaticos') <> interval '24 hours' then
    raise exception 'R35a el service o los neumáticos dejaron de fijarse a las 24 horas (service: %, neumáticos: %): el cartón del dueño del auto deja de ser confiable.', plazo_edicion('service'), plazo_edicion('neumaticos');
  end if;

  -- ---------- los fixtures, como postgres ----------
  insert into clientes (lubricentro_id, nombre, telefono, email)
  values (v_demo, 'Persona R35', '351 555 0350', 'r35@ejemplo.com') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values (v_demo, v_cli, 'AB135CD', 'Peugeot', '208') returning id into v_veh;

  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, tipo, trabajo_descripcion, created_at)
  values (v_demo, v_suc, v_veh, v_own, current_date - 3, 'mecanica', 'R35 mecánica de hace tres días', now() - interval '3 days')
  returning id into v_mec3;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, tipo, trabajo_descripcion, created_at)
  values (v_demo, v_suc, v_veh, v_own, current_date - 8, 'mecanica', 'R35 mecánica de hace ocho días', now() - interval '8 days')
  returning id into v_mec8;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros, aceite_tipo, prox_service_km, created_at)
  values (v_demo, v_suc, v_veh, v_own, current_date - 3, 50000, '10W40', 60000, now() - interval '3 days')
  returning id into v_srv3;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, tipo, kilometros, alineacion, created_at)
  values (v_demo, v_suc, v_veh, v_own, current_date - 3, 'neumaticos', 50100, true, now() - interval '3 days')
  returning id into v_neu3;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, tipo, kilometros, alineacion)
  values (v_demo, v_suc, v_veh, v_own, current_date, 'neumaticos', 50200, true)
  returning id into v_neu0;

  insert into service_items (service_id, item_tipo, detalle) values (v_mec3, null, 'R35 renglón de la mecánica');
  insert into service_items (service_id, item_tipo, detalle) values (v_srv3, null, 'R35 renglón del service');

  -- ---------- b · la cabecera, como owner del demo ----------
  -- RLS no lanza error cuando rechaza: filtra la fila y el UPDATE afecta
  -- 0. Si el USING dejara pasar y el WITH CHECK (plan) rechazara, sería
  -- un 42501: se lo cuenta como "pasó el USING", que es lo que se prueba.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update services set observaciones = 'R35 editada' where id = v_mec3;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'R35b una mecánica de hace 3 días NO se puede editar (filas: %): la policy services_edicion no está midiendo con plazo_edicion(tipo).', v_n;
  end if;

  begin
    update services set observaciones = 'R35 editada' where id = v_srv3;
    get diagnostics v_n = row_count;
  exception when insufficient_privilege then v_n := 1;
  end;
  if v_n <> 0 then
    raise exception 'R35b un service de hace 3 días SE PUDO editar: la policy dejó de fijarlo a las 24 horas y el cartón del cliente deja de ser confiable.';
  end if;

  begin
    update services set observaciones = 'R35 editada' where id = v_neu3;
    get diagnostics v_n = row_count;
  exception when insufficient_privilege then v_n := 1;
  end;
  if v_n <> 0 then
    raise exception 'R35b un trabajo de neumáticos de hace 3 días SE PUDO editar: el plazo de la mecánica se le contagió a la gomería.';
  end if;

  begin
    update services set observaciones = 'R35 editada' where id = v_mec8;
    get diagnostics v_n = row_count;
  exception when insufficient_privilege then v_n := 1;
  end;
  if v_n <> 0 then
    raise exception 'R35b una mecánica de hace 8 días SE PUDO editar: el plazo de la mecánica no cierra a los 7 días.';
  end if;

  -- ---------- c · los renglones heredan el plazo de la cabecera ----------
  delete from service_items where service_id = v_mec3;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'R35c el renglón de una mecánica de hace 3 días NO se puede borrar (filas: %): items_escritura sigue midiendo 24 horas y la mecánica es editable solo a medias.', v_n;
  end if;
  delete from service_items where service_id = v_srv3;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'R35c el renglón de un service de hace 3 días SE PUDO borrar: items_escritura dejó de fijarlo a las 24 horas.';
  end if;

  -- ---------- f · el INSERT: la ventana también en el WITH CHECK ----------
  -- Un INSERT no evalúa el USING. Hasta 20260925120000 la ventana vivía
  -- solo ahí y un renglón entraba en un trabajo fijado con un POST
  -- directo a PostgREST. Acá RLS sí lanza error: la fila nueva viola la
  -- policy y es un 42501, no cero filas.
  begin
    insert into service_items (service_id, item_tipo, detalle)
    values (v_srv3, null, 'R35 renglón colado en un service fijado');
    v_n := 1;
  exception when insufficient_privilege then v_n := 0;
  end;
  if v_n <> 0 then
    raise exception 'R35f un renglón ENTRÓ en un service de hace 3 días por INSERT directo: items_escritura mide la ventana solo en el USING y el WITH CHECK deja pasar. Un cartón fijado se sigue escribiendo por la API.';
  end if;

  begin
    insert into service_items (service_id, item_tipo, detalle)
    values (v_mec3, null, 'R35 renglón nuevo de la mecánica');
  exception when insufficient_privilege then
    raise exception 'R35f un renglón NO entra en una mecánica de hace 3 días: el WITH CHECK de items_escritura no está midiendo con plazo_edicion(tipo) y la mecánica es editable solo a medias.';
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------- d · lo que ve el dueño del auto: el sello por tipo ----------
  v_carton := get_carton('demo', 'AB135CD');
  if v_carton ? 'error' then
    raise exception 'R35d get_carton devolvió % para el auto de la prueba.', v_carton->>'error';
  end if;

  select e.value into v_fila from jsonb_array_elements(v_carton->'services') e
  where e.value->>'trabajo_descripcion' = 'R35 mecánica de hace tres días';
  if v_fila is null then
    raise exception 'R35d la mecánica de la prueba no viaja en get_carton.';
  end if;
  if (v_fila->>'fijado')::boolean then
    raise exception 'R35d get_carton le muestra al dueño del auto una mecánica de hace 3 días con el candado: el sello sigue midiendo 24 horas mientras el panel dice «editable».';
  end if;

  select e.value into v_fila from jsonb_array_elements(v_carton->'services') e
  where e.value->>'trabajo_descripcion' = 'R35 mecánica de hace ocho días';
  if v_fila is null or not (v_fila->>'fijado')::boolean then
    raise exception 'R35d get_carton muestra una mecánica de hace 8 días sin el candado.';
  end if;

  select e.value into v_fila from jsonb_array_elements(v_carton->'services') e
  where e.value->>'tipo' = 'service';
  if v_fila is null or not (v_fila->>'fijado')::boolean then
    raise exception 'R35d get_carton muestra un service de hace 3 días sin el candado: el sello dejó de cerrarse a las 24 horas.';
  end if;

  -- ---------- e · la ventana de desbloqueo: 24 horas fijas, para cualquier tipo ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_hasta := desbloquear_service(v_mec8);
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  if v_hasta is null
     or v_hasta < now() + interval '23 hours 59 minutes'
     or v_hasta > now() + interval '24 hours 1 minute' then
    raise exception 'R35e desbloquear_service abrió hasta % sobre una mecánica: la ventana extraordinaria es de 24 horas fijas, para cualquier tipo — es la salida, no el plazo.', v_hasta;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update services set observaciones = 'R35 desbloqueada' where id = v_mec8;
  get diagnostics v_n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  if v_n <> 1 then
    raise exception 'R35e la mecánica fijada que Fidelli desbloqueó sigue sin poder editarse (filas: %).', v_n;
  end if;

  -- ---------- g · las ruedas: el mismo hueco, con el módulo prendido por la puerta real ----------
  -- El demo no tiene el módulo de gomería (R15a se apoya en eso), y sin
  -- módulo el WITH CHECK rechaza toda rueda por plan_permite antes de
  -- mirar la ventana: la prueba no diría nada. Se prende con
  -- fijar_override_plan(), como R15 —exige superadmin, motivo y deja el
  -- registro— y se apaga al final. Si algún día el demo nace con el
  -- módulo, se prueba igual y no se toca el interruptor.
  v_tenia_modulo := feature_de_tenant(v_demo, 'neumaticos');
  if not v_tenia_modulo then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fijar_override_plan(v_demo, '{"neumaticos": true}'::jsonb,
      'Módulo gomería · bonificado · 2026-09-24 — prueba de regresión R35');
    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not plan_permite('neumaticos') then
    raise exception 'R35g SIN PISO: el override no prendió el módulo de gomería para el demo; sin módulo la prueba de las ruedas no dice nada.';
  end if;

  begin
    insert into service_ruedas (service_id, posicion, balanceada)
    values (v_neu3, 'delantera_izquierda', true);
    v_n := 1;
  exception when insufficient_privilege then v_n := 0;
  end;
  if v_n <> 0 then
    raise exception 'R35g una rueda ENTRÓ en un trabajo de neumáticos de hace 3 días por INSERT directo: ruedas_escritura mide la ventana solo en el USING y el WITH CHECK deja pasar.';
  end if;

  begin
    insert into service_ruedas (service_id, posicion, balanceada)
    values (v_neu0, 'delantera_izquierda', true);
  exception when insufficient_privilege then
    raise exception 'R35g una rueda NO entra en un trabajo de neumáticos recién cargado, con el módulo prendido: el WITH CHECK de ruedas_escritura se cerró de más (perdió el plan_permite o la ventana).';
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  if not v_tenia_modulo then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fijar_override_plan(v_demo, '{}'::jsonb,
      'Módulo gomería · bonificado · 2026-09-24 — fin de la prueba de regresión R35');
    execute 'reset role';
    perform set_config('request.jwt.claims', '{}', true);
  end if;

  -- ---------- La limpieza ----------
  delete from services where vehiculo_id = v_veh;
  delete from landing_busquedas where lubricentro_id = v_demo and patente = 'AB135CD';
  delete from vehiculos where id = v_veh;
  delete from clientes where id = v_cli;
end $$;
-- <<< R35
