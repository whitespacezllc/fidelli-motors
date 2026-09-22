-- ════════════════════════════════════════════════════════════════════
-- RETENCIÓN DE 12 MESES AL CANCELAR · y después, la purga
--
-- Los Términos (sección 7) y la Política de Privacidad (sección 6) del
-- 22/09/2026 dicen: al cancelar, todo queda intacto 12 meses —si vuelve en
-- ese plazo retoma donde dejó— y pasados los 12 meses se borra
-- definitivamente. Hasta hoy no existía ni la fecha de cancelación ni el
-- borrado. Esta migración crea las dos cosas.
--
--
-- 1 · LA FECHA: `suscripciones.cancelada_at`, por trigger
--
-- Se escribe sola cuando `estado` pasa a 'cancelada' y se limpia sola si
-- vuelve a otro estado: no depende de que alguien se acuerde. Un `update
-- cancelada_at` directo (sin tocar `estado`) no despierta el trigger, así
-- que retro-datar una cancelación real es posible y explícito.
--
-- Las suscripciones que YA estén en 'cancelada' cuando esto corra quedan
-- con la fecha en null, y una fecha en null NUNCA purga: no se inventa una
-- fecha de cancelación que no sabemos. Hoy no hay ninguna.
--
--
-- 2 · LA PURGA: purgar_tenants_vencidos(p_simular, p_lubricentro_id, p_motivo)
--
-- Para cada lubricentro cuya suscripción vigente esté 'cancelada' hace más
-- de 12 meses borra lo que la política promete borrar —clientes, vehículos,
-- trabajos con sus renglones y ruedas, contactos, productos, premios,
-- configuración, plantillas, búsquedas de la vidriera— más lo que cuelga de
-- eso por FK (canjes, notas, pendientes, presupuestos, correcciones de
-- patente, supresiones) y deja la fila de `lubricentros` con
-- `activo = false` y `purgado_at`.
--
-- ⚠ NO BORRA `pagos`, `suscripciones`, `cresium_*`, `contactos_fidelli`,
-- `cambios_override_plan` ni `aceptaciones_terminos`: eso es contabilidad
-- y contrato, y se guarda el plazo fiscal. Tampoco `sucursales` (es el
-- comercio, no una persona) ni `usuarios` (el owner sigue pudiendo entrar
-- y ver un panel vacío en solo lectura; la baja de su cuenta de Auth es
-- otra decisión).
--
-- ⚠ EVIDENCIA PRIMERO: antes de borrar escribe en `purgas` qué tenant,
-- cuántas filas de cada tabla y cuándo, en la MISMA transacción. Si el
-- borrado falla, el registro se va con él; es imposible que el borrado
-- pase sin que el registro exista. `purgas` lleva los tres candados de
-- evidencia (molde de 20260917110000).
--
-- ⚠ SIMULACIÓN POR DEFECTO: `p_simular = true` solo cuenta y escribe qué
-- haría (`purgas.simulacion = true`). Borra únicamente con `false`.
--
-- El reloj: pg_cron, mensual, EN SIMULACIÓN. Santiago lo pasa a real cuando
-- haya visto una simulación correcta:
--   select cron.schedule('purgar-tenants-vencidos', '0 6 1 * *',
--                        $$select purgar_tenants_vencidos(false)$$);
-- (schedule() con el mismo nombre reemplaza el job). Hoy no hay ningún
-- tenant cancelado: está bien que exista y no haga nada durante meses.
--
-- A pedido del tenant: la misma función con `p_lubricentro_id` y un
-- `p_motivo` obligatorio, auditado en `purgas` con quién lo pidió. Exige
-- que la suscripción esté 'cancelada' (sin plazo): primero se cancela desde
-- /fidelli, después se purga. Y el demo no se purga nunca.
--
-- QUIÉN LA EJECUTA: el superadmin (por rpc o SQL) y el reloj (pg_cron corre
-- como `postgres`, sin sesión). El guard es "con sesión, solo superadmin":
-- `auth.uid()` vacío es una llamada de la base, no de un usuario; anon no
-- tiene execute.
--
-- ⚠ EL LOGO no se toca desde SQL: `storage.objects` tiene un trigger que
-- rechaza el delete directo (hay que usar la Storage API). La purga anota
-- su ruta en `purgas.conteos.logo_pendiente` para borrarlo por la API.
--
-- ⚠ Las líneas marcadas `-- @…` y los marcadores `-- >>>`/`-- <<<` no se
-- reformatean: scripts/regresion-legal-datos.sh los muerde. Lo vigila R29.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La fecha de cancelación
-- ════════════════════════════════════════════════════════════════════

alter table suscripciones add column cancelada_at timestamptz;

comment on column suscripciones.cancelada_at is
  'Cuándo el estado pasó a cancelada (trigger suscripciones_cancelacion). Null si nunca se canceló, si volvió a otro estado, o si ya estaba cancelada antes de 20260922140000. Es lo que cuenta los 12 meses de retención: null NUNCA purga.';

alter table lubricentros add column purgado_at timestamptz;

comment on column lubricentros.purgado_at is
  'Cuándo purgar_tenants_vencidos() borró los datos del tenant (con p_simular = false). La fila queda, con activo = false; pagos y suscripciones también.';

-- >>> suscripciones_marcar_cancelacion
create or replace function suscripciones_marcar_cancelacion()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'cancelada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'cancelada' then
      new.cancelada_at := now();                                       -- @cancelada_at
    end if;
  else
    -- Volvió (o nunca estuvo): el reloj de los 12 meses no corre.
    new.cancelada_at := null;                                          -- @reactivada
  end if;
  return new;
end;
$$;
-- <<< suscripciones_marcar_cancelacion

create trigger suscripciones_cancelacion
  before insert or update of estado on suscripciones
  for each row execute function suscripciones_marcar_cancelacion();


-- ════════════════════════════════════════════════════════════════════
-- 2 · El libro de purgas
-- ════════════════════════════════════════════════════════════════════

create table purgas (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- true = solo contó. false = borró.
  simulacion      boolean not null,
  -- true = a pedido del tenant (p_lubricentro_id), con motivo. false = el
  -- reloj de los 12 meses.
  a_pedido        boolean not null default false,
  motivo          text,
  -- Quién la ejecutó: auth.uid(). Null = el reloj (pg_cron, sin sesión).
  ejecutada_por   uuid references usuarios(id) on delete restrict,
  -- Cuándo se canceló la suscripción que la habilitó.
  cancelada_at    timestamptz not null,
  -- Cuántas filas por tabla (y logo_pendiente si había logo).
  conteos         jsonb not null,
  created_at      timestamptz not null default now(),

  constraint purga_a_pedido_con_motivo
    check (not a_pedido or char_length(trim(coalesce(motivo, ''))) >= 10)
);

create index purgas_lubricentro_idx on purgas(lubricentro_id, created_at desc);

comment on table purgas is
  'Evidencia de cada purga (simulada o real) de un tenant cancelado: qué tenant, cuántas filas de cada tabla, quién, cuándo y por qué. Se escribe ANTES de borrar, en la misma transacción. Append-only con tres candados.';

alter table purgas enable row level security;

-- Es el libro de la plataforma: solo Fidelli lo lee. Nadie lo escribe por
-- fuera de la función.
create policy purgas_lectura on purgas for select to authenticated
  using (soy_superadmin());

revoke insert, update, delete, truncate, references, trigger
  on table purgas from authenticated;

-- >>> bloquear_borrado_de_purga
create or replace function bloquear_borrado_de_purga()
returns trigger
language plpgsql
as $$
begin
  raise exception 'purga_no_se_borra'                                  -- @candado_borrado
    using hint = 'purgas es el registro de qué datos se borraron de qué tenant y cuándo: es lo que '
                 'responde el día que alguien pregunte por sus datos. No se borra.';
  return old;
end;
$$;
-- <<< bloquear_borrado_de_purga

-- >>> bloquear_edicion_de_purga
create or replace function bloquear_edicion_de_purga()
returns trigger
language plpgsql
as $$
begin
  raise exception 'purga_no_se_edita'                                  -- @candado_edicion
    using hint = 'Una purga registrada no se corrige: los conteos, el motivo y el autor son lo que pasó.';
  return new;
end;
$$;
-- <<< bloquear_edicion_de_purga

-- >>> bloquear_purga_de_purgas
create or replace function bloquear_purga_de_purgas()
returns trigger
language plpgsql
as $$
begin
  raise exception 'purgas_no_se_vacian'                                -- @candado_purga
    using hint = 'Si necesitás una base limpia para probar, usá supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_purgas

create trigger candado_borrado_purga
  before delete on purgas for each row execute function bloquear_borrado_de_purga();
create trigger candado_edicion_purga
  before update on purgas for each row execute function bloquear_edicion_de_purga();
create trigger candado_purga_purgas
  before truncate on purgas for each statement execute function bloquear_purga_de_purgas();

alter table purgas enable always trigger candado_borrado_purga;
alter table purgas enable always trigger candado_edicion_purga;
alter table purgas enable always trigger candado_purga_purgas;


-- ════════════════════════════════════════════════════════════════════
-- 3 · La purga
-- ════════════════════════════════════════════════════════════════════

-- >>> purgar_tenants_vencidos
create or replace function purgar_tenants_vencidos(
  p_simular        boolean default true,
  p_lubricentro_id uuid    default null,
  p_motivo         text    default null
)
returns setof purgas
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_lub     record;
  v_logo    text;
  v_conteos jsonb;
  v_purga   purgas;
  v_hechas  integer := 0;
begin
  -- Con sesión, solo Fidelli. Sin sesión (pg_cron, psql) es una llamada de
  -- la base. anon no tiene execute sobre esta función.
  if v_uid is not null and not soy_superadmin() then                   -- @guard
    raise exception 'solo_fidelli' using errcode = '42501';
  end if;

  if p_lubricentro_id is not null and (v_motivo is null or char_length(v_motivo) < 10) then
    raise exception 'motivo_insuficiente';
  end if;

  for v_lub in
    select l.id, l.slug, s.cancelada_at
      from lubricentros l
      -- La suscripción VIGENTE: la última que arrancó, el mismo criterio
      -- que el listado y la ficha de /fidelli.
      join lateral (
        select su.estado, su.cancelada_at
          from suscripciones su
         where su.lubricentro_id = l.id
         order by su.inicio desc, su.created_at desc
         limit 1
      ) s on true
     where l.purgado_at is null
       and l.slug <> 'demo'                                            -- @demo
       and s.estado = 'cancelada'
       and s.cancelada_at is not null
       and (
         (p_lubricentro_id is null
          and s.cancelada_at <= now() - interval '12 months')          -- @plazo
         or p_lubricentro_id = l.id
       )
     order by s.cancelada_at
  loop
    select logo_url into v_logo from config_experiencia where lubricentro_id = v_lub.id;

    v_conteos := jsonb_strip_nulls(jsonb_build_object(
      'clientes',             (select count(*) from clientes             where lubricentro_id = v_lub.id),
      'vehiculos',            (select count(*) from vehiculos            where lubricentro_id = v_lub.id),
      'services',             (select count(*) from services             where lubricentro_id = v_lub.id),
      'service_items',        (select count(*) from service_items        where lubricentro_id = v_lub.id),
      'service_ruedas',       (select count(*) from service_ruedas       where lubricentro_id = v_lub.id),
      'canjes',               (select count(*) from canjes               where lubricentro_id = v_lub.id),
      'contactos',            (select count(*) from contactos            where lubricentro_id = v_lub.id),
      'notas_vehiculo',       (select count(*) from notas_vehiculo       where lubricentro_id = v_lub.id),
      'trabajos_pendientes',  (select count(*) from trabajos_pendientes  where lubricentro_id = v_lub.id),
      'presupuestos',         (select count(*) from presupuestos         where lubricentro_id = v_lub.id),
      'presupuesto_items',    (select count(*) from presupuesto_items    where lubricentro_id = v_lub.id),
      'correcciones_patente', (select count(*) from correcciones_patente where lubricentro_id = v_lub.id),
      'supresiones_cliente',  (select count(*) from supresiones_cliente  where lubricentro_id = v_lub.id),
      'productos',            (select count(*) from productos            where lubricentro_id = v_lub.id),
      'premios',              (select count(*) from premios              where lubricentro_id = v_lub.id),
      'mensaje_templates',    (select count(*) from mensaje_templates    where lubricentro_id = v_lub.id),
      'config_neumaticos',    (select count(*) from config_neumaticos    where lubricentro_id = v_lub.id),
      'config_experiencia',   (select count(*) from config_experiencia   where lubricentro_id = v_lub.id),
      'landing_busquedas',    (select count(*) from landing_busquedas    where lubricentro_id = v_lub.id),
      'logo_pendiente',       v_logo
    ));

    -- EVIDENCIA PRIMERO, en la misma transacción que el borrado.
    insert into purgas (lubricentro_id, simulacion, a_pedido, motivo, ejecutada_por, cancelada_at, conteos)
    values (v_lub.id, p_simular, p_lubricentro_id is not null, v_motivo, v_uid, v_lub.cancelada_at, v_conteos)
    returning * into v_purga;                                          -- @evidencia

    if not p_simular then                                              -- @simular
      -- En orden de dependencias: primero lo que cuelga, después de qué cuelga.
      delete from canjes               where lubricentro_id = v_lub.id;
      delete from contactos            where lubricentro_id = v_lub.id;
      delete from notas_vehiculo       where lubricentro_id = v_lub.id;
      delete from trabajos_pendientes  where lubricentro_id = v_lub.id;
      delete from presupuesto_items    where lubricentro_id = v_lub.id;
      delete from presupuestos         where lubricentro_id = v_lub.id;
      delete from correcciones_patente where lubricentro_id = v_lub.id;
      delete from supresiones_cliente  where lubricentro_id = v_lub.id;
      delete from service_ruedas       where lubricentro_id = v_lub.id;
      delete from service_items        where lubricentro_id = v_lub.id;
      delete from services             where lubricentro_id = v_lub.id;
      delete from vehiculos            where lubricentro_id = v_lub.id;
      delete from clientes             where lubricentro_id = v_lub.id;
      delete from productos            where lubricentro_id = v_lub.id;
      delete from premios              where lubricentro_id = v_lub.id;
      delete from mensaje_templates    where lubricentro_id = v_lub.id;
      delete from config_neumaticos    where lubricentro_id = v_lub.id;
      delete from config_experiencia   where lubricentro_id = v_lub.id;
      delete from landing_busquedas    where lubricentro_id = v_lub.id;
      -- NO: pagos, suscripciones, cresium_*, contactos_fidelli,
      -- cambios_override_plan, aceptaciones_terminos, sucursales, usuarios.

      update lubricentros
         set activo = false, purgado_at = now()
       where id = v_lub.id;
    end if;

    v_hechas := v_hechas + 1;
    return next v_purga;
  end loop;

  -- A pedido y no calificó: se dice por qué, no se calla.
  if p_lubricentro_id is not null and v_hechas = 0 then
    if not exists (select 1 from lubricentros where id = p_lubricentro_id) then
      raise exception 'lubricentro_no_existe';
    elsif exists (select 1 from lubricentros where id = p_lubricentro_id and slug = 'demo') then
      raise exception 'demo_no_se_purga';
    elsif exists (select 1 from lubricentros where id = p_lubricentro_id and purgado_at is not null) then
      raise exception 'ya_purgado';
    else
      raise exception 'suscripcion_no_cancelada'
        using hint = 'La purga a pedido exige la suscripción vigente en estado cancelada con su fecha: primero se cancela desde /fidelli, después se purga.';
    end if;
  end if;

  return;
end;
$$;
-- <<< purgar_tenants_vencidos

comment on function purgar_tenants_vencidos is
  'Borra los datos de los tenants cancelados hace más de 12 meses (o de uno, a pedido, con motivo). p_simular = true (default) solo cuenta y escribe en purgas qué haría. Nunca toca pagos, suscripciones, cresium_*, contactos_fidelli, cambios_override_plan ni aceptaciones_terminos. Nunca el demo. Superadmin con sesión, o el reloj de pg_cron sin sesión.';

revoke all on function purgar_tenants_vencidos(boolean, uuid, text) from public, anon;
grant execute on function purgar_tenants_vencidos(boolean, uuid, text) to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 4 · El reloj: mensual, en simulación
-- ════════════════════════════════════════════════════════════════════
--
-- El día 1 de cada mes a las 06:00 UTC (03:00 en Argentina). Corre como
-- `postgres`, sin sesión. Con el mismo nombre, cron.schedule() reemplaza el
-- job: para pasarlo a real se vuelve a llamar con `false` (ver arriba).

create extension if not exists pg_cron;

select cron.schedule(
  'purgar-tenants-vencidos',
  '0 6 1 * *',
  $$select purgar_tenants_vencidos(true)$$                             -- @cron_simulacion
);
