-- ============================================================
-- Fidelli Motors · Lubricentro demo
-- Función idempotente: borra y recrea el tenant 'demo'.
-- Local: la llama seed.sql en cada db reset.
-- Producción: se ejecuta a mano antes de una demo comercial.
-- Todas las fechas son relativas a current_date: nunca envejece.
-- ============================================================

create or replace function seed_demo(p_password text default 'demo1234')
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_lub      uuid;
  v_suc_a    uuid;
  v_suc_b    uuid;
  v_user     uuid;
  v_plan     uuid;
  v_premio   uuid;
  v_cliente  uuid;
  v_vehiculo uuid;
  v_service  uuid;
  v_serv_ant uuid;
  r          record;
  j          integer;
  v_km       integer;
  v_fecha    date;
  v_prox     integer;
  v_n_serv   integer := 0;
  v_n_items  integer := 0;
  v_contador integer := 0;
begin
  -- ---------- 1. Limpieza: de hijo a padre ----------
  select id into v_lub from lubricentros where slug = 'demo';
  if v_lub is not null then
    delete from canjes            where lubricentro_id = v_lub;
    delete from contactos         where lubricentro_id = v_lub;
    delete from landing_busquedas where lubricentro_id = v_lub;
    delete from service_items     where lubricentro_id = v_lub;
    delete from services          where lubricentro_id = v_lub;
    delete from vehiculos         where lubricentro_id = v_lub;
    delete from clientes          where lubricentro_id = v_lub;
    delete from premios           where lubricentro_id = v_lub;
    delete from productos         where lubricentro_id = v_lub;
    delete from mensaje_templates where lubricentro_id = v_lub;
    delete from config_experiencia where lubricentro_id = v_lub;
    delete from pagos             where lubricentro_id = v_lub;
    delete from suscripciones     where lubricentro_id = v_lub;
    delete from usuarios          where lubricentro_id = v_lub;
    delete from sucursales        where lubricentro_id = v_lub;
    delete from lubricentros      where id = v_lub;
  end if;

  -- ---------- 2. Plan comercial (global) ----------
  select id into v_plan from planes where nombre = 'Fidelli Motors' limit 1;
  if v_plan is null then
    insert into planes (nombre, precio_mensual) values ('Fidelli Motors', 45000)
    returning id into v_plan;
  end if;

  -- ---------- 3. El tenant ----------
  insert into lubricentros (nombre, slug, calcos_entregadas)
  values ('Lubricentro San Martín', 'demo', 50)
  returning id into v_lub;

  insert into config_experiencia (lubricentro_id, color_primario, datos_contacto)
  values (v_lub, '#15803D', jsonb_build_object(
    'telefono', '351 555 4120',
    'whatsapp', '5493515554120',
    'direccion', 'Av. San Martín 2450, Córdoba',
    'horarios', 'Lun a Vie 8:00–18:30 · Sáb 8:00–13:00'
  ));

  insert into sucursales (lubricentro_id, nombre, direccion, telefono)
  values (v_lub, 'Casa Central', 'Av. San Martín 2450', '351 555 4120')
  returning id into v_suc_a;

  insert into sucursales (lubricentro_id, nombre, direccion, telefono)
  values (v_lub, 'Sucursal Norte', 'Av. Rafael Núñez 4100', '351 555 4121')
  returning id into v_suc_b;

  -- ---------- 4. El owner ----------
  select id into v_user from auth.users where email = 'demo@fidellimotors.app';
  if v_user is null then
    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data
    ) values (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'demo@fidellimotors.app', crypt(p_password, gen_salt('bf')), now(),
      now(), now(), 'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    ) returning id into v_user;
  end if;

  insert into usuarios (id, lubricentro_id, rol, nombre, email)
  values (v_user, v_lub, 'owner', 'Martín Aguirre', 'demo@fidellimotors.app');

  -- ---------- 5. Suscripción activa ----------
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, inicio, vencimiento)
  values (v_lub, v_plan, 'activa', 'mensual',
          current_date - 90, current_date + 12);

  -- ---------- 6. Catálogo ----------
  insert into productos (lubricentro_id, categoria, nombre, marca) values
    (v_lub, 'aceite',   'Helix HX7 10W40',      'Shell'),
    (v_lub, 'aceite',   'Elaion F50 15W40',     'YPF'),
    (v_lub, 'aceite',   'Quartz 7000 10W40',    'Total'),
    (v_lub, 'aceite',   'Magnatec 5W30',        'Castrol'),
    (v_lub, 'filtro',   'Filtro de aceite W712','Mann'),
    (v_lub, 'filtro',   'Filtro de aire C24',   'Mann'),
    (v_lub, 'filtro',   'Filtro de combustible','Bosch'),
    (v_lub, 'filtro',   'Filtro de habitáculo', 'Fram'),
    (v_lub, 'liquido',  'Refrigerante -35°',    'Radiex'),
    (v_lub, 'liquido',  'Líquido de frenos DOT4','Wagner'),
    (v_lub, 'aditivo',  'Limpia inyectores',    'Bardahl');

  -- ---------- 7. Premio ----------
  insert into premios (lubricentro_id, meta_services, descripcion)
  values (v_lub, 3, '25% de descuento en el próximo service')
  returning id into v_premio;

  -- ---------- 8. Templates de WhatsApp ----------
  insert into mensaje_templates (lubricentro_id, tono, contenido, activo) values
    (v_lub, 'Cercano',
     'Hola {nombre}! Te escribimos de Lubricentro San Martín. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un turno?',
     true),
    (v_lub, 'Formal',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     false),
    (v_lub, 'Directo',
     '{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y te damos turno.',
     false);

  -- ---------- 9. Clientes, vehículos y services ----------
  -- R = km/día real · K = km del último service · dias = hace cuánto fue
  -- T = días hasta el próximo estimado (negativo = vencido)
  for r in
    select * from (values
      -- cliente, telefono, patente, marca, modelo, anio, R, K, dias, T, n_serv, canje_tras
      ('Marta Ledesma','3515550142','GHI 452','Renault','Clio',      2009, 35,  61500, 120, -45, 3, 0),
      ('Jorge Peralta','3515550987','AC 891 QR','Toyota','Hilux',    2020, 90, 104200, 150, -60, 3, 2),
      ('Roberto Molina','3515550864','MNO 567','Chevrolet','Classic',2010, 25,  88000, 200, -30, 2, 0),
      ('Natalia Ávila','3515550628','STU 445','Fiat','Palio',        2015, 40, 142000, 100, -20, 3, 0),
      ('Lucía Fernández','3515550233','AB 456 CD','Fiat','Cronos',   2021, 45,  45100,  90,   3, 3, 0),
      ('Diego Sosa','3515550455','JKL 334','Ford','Ka',              2013, 30,  97400, 110,  -5, 2, 0),
      ('Hugo Cabrera','3515550573','AH 335 DP','Chevrolet','Onix',   2021, 55,  32800,  80,   6, 3, 0),
      ('Pedro Gómez','3515550442','ABC 123','Chevrolet','Corsa',     2011, 42,  98450,  60,  25, 4, 3),
      ('Marcelo Ruiz','3515550678','XYZ 789','Volkswagen','Gol Trend',2014,28,  76040,  70,  15, 3, 1),
      ('Ana Quiroga','3515550311','AD 102 MN','Peugeot','208',       2022, 40,  58700,  50,  28, 1, 0),
      ('Carla Bustos','3515550729','AF 210 KL','Renault','Sandero',  2018, 50, 112300,  65,  12, 3, 2),
      ('Silvia Ferreyra','3515550190','PQR 890','Volkswagen','Suran',2012, 33, 134500,  85,  20, 2, 0),
      ('Pedro Gómez','3515550442','AE 482 TW','Fiat','Uno',          2019, 40,  41200,  12,  60, 2, 0),
      ('Roberto Molina','3515550864','AG 774 BX','Ford','Ranger',    2023, 60,  25400,   8,  90, 2, 0),
      ('Natalia Ávila','3515550628','AJ 908 FR','Toyota','Etios',    2019, 48,  67300,   3,  75, 3, 2)
    ) as t(cliente, telefono, patente, marca, modelo, anio, r_km, k_km, dias, t_obj, n_serv, canje_tras)
  loop
    -- Cliente: reutiliza si ya existe (hay dueños con dos autos)
    select id into v_cliente from clientes
    where lubricentro_id = v_lub and nombre = r.cliente;

    if v_cliente is null then
      insert into clientes (lubricentro_id, nombre, telefono, email)
      values (v_lub, r.cliente, r.telefono,
              lower(replace(split_part(r.cliente,' ',1),'í','i')) || '@mail.com')
      returning id into v_cliente;
    end if;

    insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
    values (v_lub, v_cliente, r.patente, r.marca, r.modelo, r.anio)
    returning id into v_vehiculo;

    v_serv_ant := null;

    -- Services: espaciados 100 días hacia atrás desde el último
    for j in 1..r.n_serv loop
      v_fecha := current_date - r.dias - ((r.n_serv - j) * 100);
      v_km    := r.k_km - ((r.n_serv - j) * 100 * r.r_km);

      if j = r.n_serv then
        v_prox := r.k_km + (r.r_km * (r.dias + r.t_obj));
      else
        v_prox := v_km + 10000;
      end if;

      insert into services (
        lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
        fecha, kilometros, aceite_tipo, prox_service_km,
        aceite_nombre, created_at
      ) values (
        v_lub,
        case when v_contador % 3 = 0 then v_suc_b else v_suc_a end,
        v_vehiculo, v_user,
        v_fecha, v_km,
        case v_contador % 4 when 0 then '10W40' when 1 then '15W40'
                            when 2 then '5W30'  else '10W40' end,
        v_prox,
        case v_contador % 4 when 0 then 'Shell Helix HX7 10W40'
                            when 1 then 'YPF Elaion F50 15W40'
                            when 2 then 'Castrol Magnatec 5W30'
                            else 'Total Quartz 7000 10W40' end,
        v_fecha::timestamptz + interval '11 hours'
      ) returning id into v_service;

      v_n_serv := v_n_serv + 1;
      v_contador := v_contador + 1;

      -- Renglones: el filtro de aceite siempre; el resto, mezcla realista
      insert into service_items (service_id, item_tipo, detalle)
      values (v_service, 'filtro_aceite', 'Mann W712');
      v_n_items := v_n_items + 1;

      if v_contador % 2 = 0 then
        insert into service_items (service_id, item_tipo) values (v_service, 'filtro_aire');
        v_n_items := v_n_items + 1;
      end if;
      if v_contador % 3 = 0 then
        insert into service_items (service_id, item_tipo) values (v_service, 'liq_refrigerante');
        v_n_items := v_n_items + 1;
      end if;
      if v_contador % 5 = 0 then
        insert into service_items (service_id, item_tipo) values (v_service, 'filtro_combustible');
        insert into service_items (service_id, item_tipo) values (v_service, 'liq_frenos');
        v_n_items := v_n_items + 2;
      end if;
      if v_contador % 7 = 0 then
        insert into service_items (service_id, item_tipo, detalle)
        values (v_service, 'aditivo_motor', 'Bardahl limpia inyectores');
        v_n_items := v_n_items + 1;
      end if;

      -- Canje registrado tras el service indicado
      if r.canje_tras > 0 and j = r.canje_tras then
        insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id, created_at)
        values (v_lub, v_vehiculo, v_premio, v_service,
                v_fecha::timestamptz + interval '11 hours 30 minutes');
      end if;

      v_serv_ant := v_service;
    end loop;
  end loop;

  -- ---------- 10. Contactos ya hechos (checks tildados en la tabla) ----------
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'vencido', 'whatsapp', now() - interval '4 days'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'AC891QR';

  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'urgente', 'whatsapp', now() - interval '2 days'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'JKL334';

  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'proximo', 'manual', now() - interval '1 day'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'PQR890';

  -- ---------- 11. Recuperados: contactados que volvieron ----------
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'urgente', 'whatsapp', now() - interval '20 days'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'AE482TW';

  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'vencido', 'whatsapp', now() - interval '15 days'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'AG774BX';

  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at)
  select v_lub, v.id, v_user, 'urgente', 'whatsapp', now() - interval '10 days'
  from vehiculos v where v.lubricentro_id = v_lub and v.patente_normalizada = 'AJ908FR';

  -- ---------- 12. Búsquedas en la landing ----------
  insert into landing_busquedas (lubricentro_id, patente, encontrada, created_at)
  select v_lub,
         v.patente_normalizada,
         true,
         now() - (random() * interval '28 days')
  from vehiculos v, generate_series(1, 3)
  where v.lubricentro_id = v_lub;

  insert into landing_busquedas (lubricentro_id, patente, encontrada, created_at)
  values
    (v_lub, 'KLM901', false, now() - interval '3 days'),
    (v_lub, 'AK220NP', false, now() - interval '9 days'),
    (v_lub, 'RST118', false, now() - interval '17 days'),
    (v_lub, 'AL556GH', false, now() - interval '24 days');

  return format(
    'Demo listo · %s services · %s renglones · slug: demo · login: demo@fidellimotors.app',
    v_n_serv, v_n_items
  );
end;
$$;

comment on function seed_demo is
  'Recrea el lubricentro demo con fechas relativas a hoy. Correr antes de cada demo comercial.';

-- Solo desde el servidor o el SQL editor: ningún usuario de la app puede invocarla
revoke execute on function seed_demo(text) from public, anon, authenticated;