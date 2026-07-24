-- ============================================================
-- Fix: PUBLIC recibía EXECUTE sobre toda función nueva
--
-- Postgres otorga EXECUTE a PUBLIC por defecto en cada función que se
-- crea, y anon es miembro de PUBLIC. Por eso, aunque una migración
-- anterior le revocó los privilegios a anon de forma explícita, seguía
-- pudiendo ejecutar todas las funciones del schema por la puerta de
-- atrás.
--
-- Hoy eso no era explotable porque ninguna de nuestras funciones es
-- security definer: al correr con los permisos de quien llama, anon se
-- choca igual contra el RLS y contra la falta de grants sobre las tablas
-- (verificado: "permission denied for table vehiculos"). Pero es una
-- mina: el día que se agregue una función security definer, PUBLIC va a
-- recibir execute sobre ella automáticamente y ahí sí sería una puerta.
--
-- Se revoca solo de PUBLIC. NO se re-otorga en bloque a authenticated a
-- propósito: eso desharía los revokes deliberados de seed_demo() y
-- crear_identidad_email(), que no debe poder ejecutar ningún usuario de
-- la app. Los grants explícitos que authenticated ya tiene alcanzan.
-- ============================================================

-- Lo que hereden las funciones futuras.
--
-- OJO: va SIN "in schema public" a propósito. El grant a PUBLIC no sale de
-- las default privileges del schema sino de las globales del rol, así que
-- revocarlo con "in schema public" no tiene efecto: se comprobó creando una
-- función después y la ACL seguía trayendo "=X/postgres". Sin "in schema"
-- sí desaparece, y authenticated conserva su execute.
--
-- El alcance es rol-wide para postgres, que es con quien corren las
-- migraciones. Los schemas internos de Supabase (auth, storage, realtime)
-- son de supabase_admin, así que no los toca.
alter default privileges revoke execute on functions from public;

-- Lo que ya existe
revoke execute on all functions in schema public from public;

-- La única puerta pública sigue abierta, explícita para que se lea sola
grant execute on function get_carton(text, text) to anon;
