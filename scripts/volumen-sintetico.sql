-- ============================================================
-- Volumen sintético para medir (SOLO LOCAL, nunca en dev ni en prod).
--
-- Infla el demo a volumen tipo Sassi (3.000 clientes, 3.500 vehículos,
-- 10.000 trabajos) y crea un segundo tenant, zz-volumen, con lo mismo:
-- así cada tabla tiene filas de OTRO tenant, que es lo que el RLS tiene
-- que descartar fila por fila en cada consulta del panel. Es el escenario
-- con el que se midieron las búsquedas el 21/10/2026 (ver el PR) y sirve
-- para cualquier `explain analyze` como owner del demo.
--
-- Correr, con el stack local arriba:
--   docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X -q \
--     < scripts/volumen-sintetico.sql
-- Deshacer: `supabase db reset` (es su única limpieza).
--
-- Deja además el caso de Brothers Oil tal cual: un solo auto KXM616 (de
-- BRUNO) y tres clientes cuyo teléfono contiene «616».
-- ============================================================
\set ON_ERROR_STOP on

begin;

-- ---------- 1 · el segundo tenant, por la puerta de siempre ----------
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from usuarios where rol = 'superadmin' limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;

select crear_lubricentro(
  'Lubricentro Volumen', 'zz-volumen',
  '[{"nombre":"Central","direccion":"Av. Colón 1000","telefono":"351 555 9000"}]'::jsonb,
  (select id from planes where nombre = 'Basic' and activo limit 1), 'mensual', 0
);

reset role;
select set_config('request.jwt.claims', '{}', true);

-- Su owner: un usuario de auth con la metadata de la invitación, como el
-- seed hace con el superadmin. El trigger crea la fila de usuarios.
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000',
    'volumen@fidellimotors.app', extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Owner Volumen',
                       'lubricentro_id', (select id from lubricentros where slug = 'zz-volumen')),
    '', '', '', ''
  );
  perform crear_identidad_email(v_id, 'volumen@fidellimotors.app');
end $$;

-- ---------- 2 · el relleno, por tenant ----------
create or replace function pg_temp.inflar(p_lub uuid, p_prefijo text)
returns void
language plpgsql
as $$
declare
  v_owner uuid;
  v_suc   uuid;
  nombres   text[] := array['Juan','María','Carlos','Ana','Luis','Laura','Jorge','Marta','Pedro','Lucía',
                            'Diego','Carla','Hugo','Silvia','Marcelo','Natalia','Roberto','Paula','Sergio','Valeria',
                            'Gabriel','Marcela','Matías','Bruno','Florencia','Gustavo','Cecilia','Pablo','Romina','Andrés',
                            'Daniela','Fernando','Claudia','Martín','Gabriela','Nicolás','Soledad','Javier','Verónica','Esteban'];
  apellidos text[] := array['Gómez','Pérez','López','Fernández','Rodríguez','Martínez','García','Sánchez','Romero','Sosa',
                            'Torres','Álvarez','Ruiz','Ramírez','Flores','Benítez','Acosta','Medina','Herrera','Aguirre',
                            'Giménez','Molina','Castro','Rojas','Ortiz','Silva','Núñez','Luna','Cabrera','Ríos',
                            'Ferreyra','Godoy','Morales','Domínguez','Moreno','Peralta','Vega','Carrizo','Quiroga','Ledesma',
                            'Bustos','Ávila','Vera','Maldonado','Ojeda','Villalba','Paz','Juárez','Coronel','Figueroa',
                            'Ponce','Arias','Leiva'];
  marcas text[] := array['Fiat','Volkswagen','Renault','Chevrolet','Ford','Peugeot','Toyota','Citroën'];
begin
  select id into v_owner from usuarios where lubricentro_id = p_lub and rol = 'owner' limit 1;
  select id into v_suc from sucursales where lubricentro_id = p_lub order by created_at limit 1;

  -- 3.000 clientes. El teléfono es determinístico y algunos contienen
  -- «616», que es justo lo que confundía al buscador.
  insert into clientes (lubricentro_id, nombre, telefono, email)
  select p_lub,
         nombres[(i % 40) + 1] || ' ' || apellidos[(i % 53) + 1],
         '351' || lpad(((i * 7919) % 10000000)::text, 7, '0'),
         'sint' || i || '@volumen.test'
  from generate_series(1, 3000) i;

  -- 3.500 vehículos: uno por cliente y los primeros 500 tienen dos.
  -- Patente Mercosur válida y única: <prefijo><letra><3 dígitos>Z<letra>.
  with c as (
    select id, row_number() over (order by created_at, id) rn
    from clientes where lubricentro_id = p_lub and email like '%@volumen.test'
  )
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
  select p_lub, c.id,
         p_prefijo || chr(65 + (i - 1) / 1000) || lpad(((i - 1) % 1000)::text, 3, '0')
                  || 'Z' || chr(65 + (i - 1) % 26),
         marcas[(i % 8) + 1], 'Modelo ' || (i % 20), 2005 + (i % 19)
  from generate_series(1, 3500) i
  join c on c.rn = ((i - 1) % 3000) + 1;

  -- 10.000 trabajos: dos por vehículo y un tercero para 3.000 de ellos,
  -- repartidos en los últimos dos años.
  with v as (
    select id, row_number() over (order by created_at, id) rn
    from vehiculos where lubricentro_id = p_lub and patente like p_prefijo || '%Z_'
  )
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros,
                        aceite_tipo, prox_service_km, aceite_nombre, created_at, tipo)
  select p_lub, v_suc, v.id, v_owner,
         current_date - ((v.rn % 400) + k * 150)::int,
         (20000 + (v.rn % 50) * 1000 + (2 - k) * 6000)::int,
         '10W40',
         (20000 + (v.rn % 50) * 1000 + (2 - k) * 6000 + 10000)::int,
         'Shell Helix HX7 10W40',
         (current_date - ((v.rn % 400) + k * 150)::int)::timestamptz + interval '11 hours',
         'service'::tipo_trabajo
  from v cross join generate_series(0, 2) k
  where k < 2 or v.rn <= 3000;
end;
$$;

select pg_temp.inflar((select id from lubricentros where slug = 'demo'), 'K');
select pg_temp.inflar((select id from lubricentros where slug = 'zz-volumen'), 'L');

-- ---------- 3 · el caso de Brothers Oil, tal cual, en el demo ----------
do $$
declare
  v_lub uuid := (select id from lubricentros where slug = 'demo');
  v_c uuid;
begin
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'BRUNO', '3513172545') returning id into v_c;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo) values (v_lub, v_c, 'KXM616', 'Fiat', 'Palio');
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'GABRIEL', '3516168821') returning id into v_c;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo) values (v_lub, v_c, 'KPA 001', 'Ford', 'Ka');
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'MARCELA', '3516161193') returning id into v_c;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo) values (v_lub, v_c, 'KPA 002', 'Ford', 'Ka');
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'MATIAS LOPEZ', '3515591616') returning id into v_c;
  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo) values (v_lub, v_c, 'KPA 003', 'Ford', 'Ka');
end $$;

commit;
analyze clientes; analyze vehiculos; analyze services;

select l.slug,
       (select count(*) from clientes c where c.lubricentro_id = l.id) clientes,
       (select count(*) from vehiculos v where v.lubricentro_id = l.id) vehiculos,
       (select count(*) from services s where s.lubricentro_id = l.id) trabajos
from lubricentros l order by 1;
