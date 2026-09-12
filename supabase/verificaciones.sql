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
