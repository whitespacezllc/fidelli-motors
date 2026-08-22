-- Datos de desarrollo. Corre en cada `supabase db reset`.
select seed_demo();

-- El plan del seed nace ACÁ, después de las migraciones — seed_demo() lo
-- inserta recién en el reset. La migración de planes-con-control marca como
-- heredado todo lo que existía al momento de aplicarse, así que a este no
-- llega a verlo: se marca acá. En dev y producción el plan es dato previo y
-- la migración lo marca sola; esto es solo del entorno local.
update planes set heredado = true where nombre = 'Fidelli Motors';

-- Horarios de las sucursales demo. La columna llegó después de que
-- seed_demo() quedó mergeada (las migraciones no se editan), así que se
-- completa acá — este archivo es solo del entorno local.
update sucursales set horarios = 'Lun a Vie 8:00–18:30 · Sáb 8:00–13:00'
where nombre = 'Casa Central';
update sucursales set horarios = 'Lun a Sáb 8:30–18:00'
where nombre = 'Sucursal Norte';

-- seed_demo() deja una búsqueda por CADA vehículo, así que el % de escaneo
-- daba 100% — un número irreal que además tapa los errores: con todos los
-- autos escaneados no se distingue una métrica que anda de una que devuelve
-- el total. Se borran las búsquedas de cinco patentes para que la flota
-- quede repartida y el número sea representativo.
delete from landing_busquedas
where patente in ('AF210KL', 'AG774BX', 'AH335DP', 'AJ908FR', 'STU445');

-- ============================================================
-- Un superadmin para poder abrir /fidelli en local.
--
-- No hay registro público y el alta de un superadmin es interna, así
-- que sin esto la superficie de administración no se puede ni mirar
-- en desarrollo. Va acá y no en una migración a propósito: este
-- archivo solo corre en el `db reset` local, nunca en dev ni en prod.
--
-- Contraseña: la misma que el owner demo (demo1234).
-- ============================================================
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    -- Ver CLAUDE.md: GoTrue lee estas cuatro como string no-nullable.
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000',
    'santi@fidellimotors.app', extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    -- Un superadmin no pertenece a ningún lubricentro: el trigger lo exige.
    jsonb_build_object('rol', 'superadmin', 'nombre', 'Santi'),
    '', '', '', ''
  );

  perform crear_identidad_email(v_id, 'santi@fidellimotors.app');
end $$;
