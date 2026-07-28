-- ============================================================
-- Fix: anon recibía TRUNCATE sobre cada tabla nueva
--
-- La migración de RLS ya había revocado los privilegios de anon sobre las
-- tablas que existían entonces, anotando el motivo: anon venía con
-- TRUNCATE y RLS no protege contra eso — una policy filtra filas, no
-- impide vaciar la tabla entera.
--
-- Lo que quedó abierto son las DEFAULT PRIVILEGES: siguen otorgando a
-- anon TRUNCATE, REFERENCES y TRIGGER sobre todo objeto creado después.
-- O sea que el agujero se vuelve a abrir solo con cada tabla que agregue
-- una migración futura, sin que nadie lo note.
--
-- Verificado en local: creando una tabla como lo haría una migración, con
-- RLS activo, anon no podía leerla pero SÍ pudo ejecutarle un TRUNCATE.
--
-- anon no necesita absolutamente nada del schema: su única puerta es
-- get_carton(), que es security definer y tiene su grant explícito.
-- ============================================================

-- ---------- 1. Lo que hereden los objetos futuros ----------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------- 2. Lo que ya se coló desde la migración de RLS ----------
-- (vista_clientes, por ejemplo, quedó con TRUNCATE/REFERENCES/TRIGGER)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------- 3. La única puerta pública, de vuelta ----------
grant usage on schema public to anon;
grant execute on function get_carton(text, text) to anon;
