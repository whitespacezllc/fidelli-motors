-- ════════════════════════════════════════════════════════════════════
-- LA ACEPTACIÓN DE LOS TÉRMINOS · es producto, no texto
--
-- Hasta hoy nadie aceptaba nada: dieciocho tenants usaban el servicio sin
-- contrato. Desde este sprint (22/09/2026) los Términos y Condiciones y la
-- Política de Privacidad viven en /terminos y /privacidad con una versión,
-- y el panel no se usa sin haber aceptado la versión vigente.
--
--
-- HISTORIAL, NO UNA COLUMNA
--
-- `aceptaciones_terminos` guarda UNA FILA POR ACEPTACIÓN: qué tenant, qué
-- usuario, qué versión y cuándo. Cuando cambie la versión se agrega otra
-- fila y las anteriores quedan. Es evidencia —la respuesta al día que un
-- cliente diga "yo nunca acepté eso"—, así que lleva el mismo candado que
-- `cresium_eventos` (20260917110000): no se borra, no se edita, no se
-- vacía, con los tres triggers en `always`.
--
--
-- ⚠ LA VERSIÓN VIGENTE NO VIVE EN LA BASE, y no es un descuido
--
-- La fuente única es `VERSION_LEGAL` en lib/legal.ts, atada por build al
-- frontmatter de los dos textos. Guardar acá "cuál es la vigente" sería
-- una segunda fuente que se desincroniza en silencio el día que alguien
-- suba una y no la otra. Por eso:
--
--   · `aceptaciones_legales(lubricentros)` es un CAMPO CALCULADO de
--     PostgREST que devuelve las VERSIONES que ese tenant aceptó. Viaja en
--     el mismo select de la sesión que `plan_capacidades` y
--     `reloj_cobranza`: cero round trips extra. El gate del panel compara
--     ese arreglo contra VERSION_LEGAL en TypeScript.
--   · `acepto_terminos_vigentes(p_lubricentro_id, p_version)` es el mismo
--     predicado para SQL: lo usan la red de verificaciones y cualquier
--     consulta a mano. Recibe la versión porque no puede saberla.
--
-- El campo calculado es SECURITY INVOKER a propósito (regla 18 de
-- CLAUDE.md): un campo calculado es también un endpoint /rpc/ y el
-- composite lo elige quien llama. Como invoker, el RLS de la tabla recorta
-- la subconsulta y un composite forjado con el uuid de otro tenant
-- devuelve vacío.
--
--
-- LOS EXENTOS
--
-- El superadmin no tiene tenant y no acepta nada (el gate es del panel del
-- owner). Y el tenant DEMO tampoco: un prospecto mirando la demo no firma
-- un contrato. El predicado lo exime POR SLUG —no por descuento ni por
-- plan— y el gate en TypeScript hace lo mismo con SLUG_DEMO (lib/legal.ts).
--
--
-- QUIÉN ESCRIBE
--
-- Solo `aceptar_terminos(p_version)`, definer, con el tenant y el usuario
-- resueltos desde la sesión —nunca por parámetro: una aceptación que acepta
-- el autor por parámetro no es una aceptación—. La tabla no tiene policy
-- de insert: la única puerta es la función. Un tenant suspendido TAMBIÉN
-- puede aceptar: la suspensión apaga la escritura de datos operativos, y
-- esto es un acto contractual que, si no pudiera hacerse, dejaría al
-- suspendido encerrado en el modal sin salida.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @…` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-legal.sh los muerde
-- con `sed` y `awk`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La tabla
-- ════════════════════════════════════════════════════════════════════

create table aceptaciones_terminos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  -- "1.0", "1.1", … La misma cadena que VERSION_LEGAL en lib/legal.ts.
  version         text not null,
  aceptado_at     timestamptz not null default now(),

  constraint version_no_vacia check (char_length(trim(version)) > 0)
);

-- El gate pregunta "¿este tenant aceptó esta versión?" en cada request del
-- panel: la respuesta tiene que salir del índice.
create index aceptaciones_terminos_tenant_version_idx
  on aceptaciones_terminos(lubricentro_id, version);

comment on table aceptaciones_terminos is
  'Una fila por aceptación de los documentos legales: tenant, usuario, versión (VERSION_LEGAL de lib/legal.ts) y cuándo. Historial: al subir la versión se agrega una fila y las anteriores quedan. Evidencia: append-only con tres candados (borrado, edición, truncate). Escribe solo aceptar_terminos().';

alter table aceptaciones_terminos enable row level security;

-- El owner ve las de su tenant; el superadmin, todas. Sin policy de insert,
-- update ni delete: la única puerta de escritura es aceptar_terminos().
create policy aceptaciones_lectura on aceptaciones_terminos for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- Y el default ACL del schema le daba insert/update/delete/truncate a
-- authenticated: sin policy no matchean nada, pero el permiso ni se deja.
revoke insert, update, delete, truncate, references, trigger
  on table aceptaciones_terminos from authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · Los tres candados — molde de 20260917110000
-- ════════════════════════════════════════════════════════════════════

-- >>> bloquear_borrado_de_aceptacion
create or replace function bloquear_borrado_de_aceptacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'aceptacion_no_se_borra'                             -- @candado_borrado
    using hint = 'aceptaciones_terminos es el historial de qué versión de los Términos aceptó cada '
                 'lubricentro y cuándo: es la respuesta del día que un cliente diga «yo nunca acepté eso». '
                 'No se borra. Si la versión cambió, se agrega una fila nueva con aceptar_terminos().';
  return old;
end;
$$;
-- <<< bloquear_borrado_de_aceptacion

create trigger candado_borrado_aceptacion
  before delete on aceptaciones_terminos
  for each row execute function bloquear_borrado_de_aceptacion();

-- >>> bloquear_edicion_de_aceptacion
create or replace function bloquear_edicion_de_aceptacion()
returns trigger
language plpgsql
as $$
begin
  -- Todas las columnas son la evidencia: no hay dictamen que reescribir.
  raise exception 'aceptacion_no_se_edita'                             -- @candado_edicion
    using hint = 'Una aceptación registrada no se corrige: quién, de qué tenant, qué versión y '
                 'cuándo son lo que pasó. Una fila editada sigue pareciendo evidencia sin serlo.';
  return new;
end;
$$;
-- <<< bloquear_edicion_de_aceptacion

create trigger candado_edicion_aceptacion
  before update on aceptaciones_terminos
  for each row execute function bloquear_edicion_de_aceptacion();

-- >>> bloquear_purga_de_aceptacion
create or replace function bloquear_purga_de_aceptacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'aceptacion_no_se_vacia'                             -- @candado_purga
    using hint = 'Un truncate sobre aceptaciones_terminos borra el contrato de todos los tenants en '
                 'una línea. Si necesitás una base limpia para probar, usá supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_aceptacion

create trigger candado_purga_aceptacion
  before truncate on aceptaciones_terminos
  for each statement execute function bloquear_purga_de_aceptacion();

-- `always`: un trigger ORIGIN se apaga entero con
-- `set session_replication_role = replica`. Un restore lógico entra por
-- INSERT, que ninguno de los tres mira.
alter table aceptaciones_terminos enable always trigger candado_borrado_aceptacion;
alter table aceptaciones_terminos enable always trigger candado_edicion_aceptacion;
alter table aceptaciones_terminos enable always trigger candado_purga_aceptacion;


-- ════════════════════════════════════════════════════════════════════
-- 3 · La única puerta de escritura
-- ════════════════════════════════════════════════════════════════════

-- >>> aceptar_terminos
create or replace function aceptar_terminos(p_version text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_lub     uuid;
  v_version text := trim(coalesce(p_version, ''));
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;

  if v_version = '' then
    raise exception 'version_vacia';
  end if;

  -- El tenant sale de la sesión, nunca de un parámetro. Un superadmin no
  -- tiene tenant y no acepta nada: el contrato es del lubricentro.
  select u.lubricentro_id into v_lub
    from usuarios u
   where u.id = v_uid and u.rol = 'owner';

  if v_lub is null then
    raise exception 'sin_lubricentro' using errcode = '42501';
  end if;

  -- Idempotente por (tenant, versión): el doble toque del botón no deja
  -- dos filas, y el segundo usuario del mismo taller no vuelve a firmar
  -- lo que su tenant ya firmó. Cada versión NUEVA sí deja su fila.
  if exists (
    select 1 from aceptaciones_terminos a
     where a.lubricentro_id = v_lub and a.version = v_version
  ) then
    return;
  end if;

  insert into aceptaciones_terminos (lubricentro_id, usuario_id, version)
  values (v_lub, v_uid, v_version);                                    -- @aceptar
end;
$$;
-- <<< aceptar_terminos

comment on function aceptar_terminos is
  'El owner acepta la versión vigente de los Términos y la Política de Privacidad. Definer: el tenant y el usuario salen de auth.uid(), y la tabla no tiene policy de insert. Idempotente por (tenant, versión). Un tenant suspendido también puede aceptar.';

revoke all on function aceptar_terminos(text) from public, anon;
grant execute on function aceptar_terminos(text) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 4 · El predicado y el campo calculado
-- ════════════════════════════════════════════════════════════════════

-- >>> acepto_terminos_vigentes
create or replace function acepto_terminos_vigentes(p_lubricentro_id uuid, p_version text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  -- El demo está exento POR SLUG: un prospecto mirando la demo no firma
  -- nada. El resto: existe una aceptación de ESA versión.
  select exists (
    select 1 from lubricentros l
     where l.id = p_lubricentro_id and l.slug = 'demo'                 -- @exento_demo
  ) or exists (
    select 1 from aceptaciones_terminos a
     where a.lubricentro_id = p_lubricentro_id
       and a.version = p_version                                       -- @version
  );
$$;
-- <<< acepto_terminos_vigentes

comment on function acepto_terminos_vigentes is
  '¿Este tenant aceptó esta versión de los documentos legales? Recibe la versión porque la vigente vive en lib/legal.ts (VERSION_LEGAL), no en la base. El demo (por slug) siempre da true. Invoker: respeta el RLS de quien pregunta.';

revoke all on function acepto_terminos_vigentes(uuid, text) from public, anon;
grant execute on function acepto_terminos_vigentes(uuid, text) to authenticated;

-- El campo calculado de la sesión: las versiones aceptadas por el tenant,
-- ordenadas. Lo lee obtenerSesion() en el mismo select que el rol y el
-- plan; el gate compara contra VERSION_LEGAL. Vacío = no aceptó ninguna.
-- >>> aceptaciones_legales
create or replace function aceptaciones_legales(l lubricentros)
returns text[]
language sql
stable
security invoker                                                       -- @invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct a.version order by a.version), '{}'::text[])
    from aceptaciones_terminos a
   where a.lubricentro_id = l.id;
$$;
-- <<< aceptaciones_legales

comment on function aceptaciones_legales is
  'Campo calculado de PostgREST sobre lubricentros: las versiones de los documentos legales que el tenant aceptó. Viaja en el select de la sesión; el gate del panel compara contra VERSION_LEGAL (lib/legal.ts). Invoker a propósito (regla 18): con un composite forjado, el RLS deja la subconsulta vacía.';

revoke all on function aceptaciones_legales(lubricentros) from public, anon;
grant execute on function aceptaciones_legales(lubricentros) to authenticated;
