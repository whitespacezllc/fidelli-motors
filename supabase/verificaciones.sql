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
-- descuento baja solo lo que lleva stock (renglón por cantidad, aceite
-- por litros); y el aviso aparece bajo el mínimo y calla sin nada abajo.
do $$
declare
  v_lub    uuid;
  v_owner  uuid;
  v_suc    uuid;
  v_veh    uuid;
  v_pelado uuid;
  v_conteo uuid;
  v_aceite uuid;
  v_serv   uuid;
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

  -- el aviso: nada bajo el mínimo → silencio; bajo el mínimo → aparece
  if exists (select 1 from stock_bajo(8) sb where sb.producto_id in (v_conteo, v_aceite)) then
    raise exception 'REGRESIÓN 5: el aviso suena con stock por encima del mínimo.';
  end if;
  update productos set stock = 1 where id = v_conteo;
  if not exists (select 1 from stock_bajo(8) sb where sb.producto_id = v_conteo) then
    raise exception 'REGRESIÓN 5: un producto bajo el mínimo no aparece en el aviso.';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);

  delete from service_items where service_id = v_serv;
  delete from services where id = v_serv;
  delete from productos where id in (v_pelado, v_conteo, v_aceite);
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
