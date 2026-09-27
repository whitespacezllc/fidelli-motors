-- ════════════════════════════════════════════════════════════════════
-- LOS TRES EMAILS DE COBRANZA · bloque 2 del sprint de cobranza
-- (docs/PROMPT-cobranza-hoy.md, bloque 2 y anexo)
--
-- El email es LA VOZ DEL PANEL, ENTREGADA. El panel ya tiene tres momentos
-- —por_vencer, vencido (día 0 y gracia), suspendido— y tres voces
-- —cobranza, trial, alta— en lib/cobranza/copy.ts. El email de cada
-- momento dice lo que el panel diría ese día. Acá vive LA DECISIÓN (a
-- quién le toca cuál, hoy); el envío es del lado de Node
-- (app/api/fidelli/avisos-cobranza), y las plantillas en lib/email/.
--
-- DOS PIEZAS:
--
--   1 · `emails_cobranza` — la evidencia de lo que se avisó. UNA fila por
--       (tenant, tipo, vencimiento): un email por tipo por ciclo, y un
--       vencimiento nuevo habilita los tres otra vez. Se inserta DESPUÉS
--       de que Resend confirma, con su id; si Resend falla no hay fila y
--       la corrida siguiente reintenta sola. Tres candados como
--       cresium_eventos: no se borra, no se edita, no se vacía.
--
--   2 · `avisos_pendientes()` — por tenant, el email MÁS AVANZADO que
--       corresponde hoy y no se mandó para este vencimiento. Umbrales, no
--       igualdades: `por_vencer` con días <= 7, `vencido` con días <= 0,
--       `suspendido` con el estado derivado en suspendido. Así un día en
--       que el cron no corrió no pierde el aviso, y el primer día en
--       producción alcanza a los que ya están adentro del ciclo: ferrari
--       recibe el 2, no el 1 y el 2. Y si el más avanzado ya se mandó, NO
--       se cae al anterior: después de «hoy vence» no se manda «vence el
--       DD/MM».
--
-- QUIÉN NO RECIBE NADA, NUNCA: el exento (descuento_pct = 100), el que
-- está afuera del reloj (cobranza_desde null), y el suspendido A MANO
-- (activo = false) —a ése el panel no le habla con la voz de cobranza,
-- le habla Fidelli por WhatsApp (bloque 1)—. Y el alta no tiene email
-- intermedio: su escalera es de dos escalones (el día del alta y al
-- bloquearse), como su panel.
--
-- ⚠ SERVICE ROLE Y NADIE MÁS. `avisos_pendientes()` cruza usuarios,
-- suscripciones y pagos de TODOS los tenants: es definer y no está
-- grantada a authenticated. La llama el cron con la clave de servicio.
-- Un owner que la ejecute recibe 42501, no una lista vacía.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @manual`, `-- @sin_reloj`, `-- @exento`,
-- `-- @suspendido`, `-- @vencido`, `-- @alta_sin_intermedio`,
-- `-- @por_vencer`, `-- @alta_en_plazo`, `-- @enviado`,
-- `-- @candado_borrado_email`, `-- @candado_edicion_email` y
-- `-- @candado_purga_email` NO SE REFORMATEAN NUNCA, ni los marcadores
-- `-- >>> nombre` / `-- <<< nombre`: los muerde el `sed` de
-- `scripts/regresion-cobranza-emails.sh`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La evidencia
-- ════════════════════════════════════════════════════════════════════

create table emails_cobranza (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- El momento: 'por_vencer' | 'vencido' | 'suspendido'. Es el tipo del
  -- brief, no el estado del reloj: 'vencido' cubre el día 0 (estado
  -- por_vencer) y la gracia.
  tipo            text not null check (tipo in ('por_vencer', 'vencido', 'suspendido')),
  -- La voz con la que se le habló. No está en el brief y se agrega como
  -- evidencia: la fila tiene que poder decir QUÉ se mandó, y el mismo tipo
  -- suena distinto en cada voz.
  voz             text not null check (voz in ('cobranza', 'trial', 'alta')),
  -- El ciclo al que pertenece. Un vencimiento nuevo habilita los tres.
  vencimiento     date not null,
  destinatario    text not null,
  resend_id       text,
  enviado_at      timestamptz not null default now(),
  unique (lubricentro_id, tipo, vencimiento)
);

comment on table emails_cobranza is
  'Los emails de cobranza que SE MANDARON (bloque 2, 20260926230000): uno por (tenant, tipo, vencimiento). Se inserta después de que Resend confirma, con su id. Es evidencia de que se avisó: tres candados (borrado, edición, truncate). Un vencimiento nuevo habilita los tres tipos otra vez.';

create index emails_cobranza_lubricentro_idx
  on emails_cobranza (lubricentro_id, enviado_at desc);

alter table emails_cobranza enable row level security;

-- El superadmin lee (la ficha de /fidelli va a poder decir «se le avisó
-- el DD/MM por email»); un owner no lee la de nadie, ni la suya —es
-- nuestra operación, no su producto—. Nadie escribe por PostgREST: escribe
-- el cron con la clave de servicio.
create policy emails_cobranza_superadmin on emails_cobranza
  for select to authenticated
  using (soy_superadmin());

-- El default ACL del schema le da truncate/references/trigger a
-- authenticated. Segunda capa, como en cresium_eventos.
revoke truncate, references, trigger on table emails_cobranza from authenticated;


-- ---------- Los tres candados ----------
--
-- Calcados de cresium_eventos (20260917110000). Sin escape hatch: no hay
-- ninguna función autorizada a borrar evidencia. El candado es contra el
-- descuido —un delete sin where en un script de limpieza— y `enable
-- always` les saca la perilla de apagado (`session_replication_role`).

-- >>> bloquear_borrado_de_email
create or replace function bloquear_borrado_de_email()
returns trigger
language plpgsql
as $$
begin
  raise exception 'email_no_se_borra'                                  -- @candado_borrado_email
    using hint = 'emails_cobranza es evidencia de que se avisó: uno por tipo por ciclo. Borrar la fila '
                 'hace que el cron vuelva a mandar el mismo email mañana. Si necesitás una base limpia '
                 'para probar, usá supabase db reset.';
  return old;
end;
$$;
-- <<< bloquear_borrado_de_email

create trigger candado_borrado_email
  before delete on emails_cobranza
  for each row execute function bloquear_borrado_de_email();

-- >>> bloquear_edicion_de_email
create or replace function bloquear_edicion_de_email()
returns trigger
language plpgsql
as $$
begin
  -- Toda la fila es la evidencia: a quién, qué, para qué ciclo, cuándo y
  -- con qué id lo confirmó Resend. Nada se vuelve a escribir.
  if new is distinct from old then                                     -- @candado_edicion_email
    raise exception 'email_no_se_edita'
      using hint = 'Una fila de emails_cobranza no se corrige: es lo que se mandó, a quién y cuándo. '
                   'Si algo salió mal, el rastro tiene que seguir diciendo lo que pasó.';
  end if;
  return new;
end;
$$;
-- <<< bloquear_edicion_de_email

create trigger candado_edicion_email
  before update on emails_cobranza
  for each row execute function bloquear_edicion_de_email();

-- >>> bloquear_purga_de_email
create or replace function bloquear_purga_de_email()
returns trigger
language plpgsql
as $$
begin
  raise exception 'email_no_se_vacia'                                  -- @candado_purga_email
    using hint = 'Un truncate sobre emails_cobranza vuelve a mandar los tres emails de este ciclo a '
                 'todos los tenants en la próxima corrida del cron. Si necesitás una base limpia para '
                 'probar, usá supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_email

create trigger candado_purga_email
  before truncate on emails_cobranza
  for each statement execute function bloquear_purga_de_email();

alter table emails_cobranza enable always trigger candado_borrado_email;
alter table emails_cobranza enable always trigger candado_edicion_email;
alter table emails_cobranza enable always trigger candado_purga_email;


-- ════════════════════════════════════════════════════════════════════
-- 2 · La decisión
-- ════════════════════════════════════════════════════════════════════
--
-- El estado, los días, la voz y el monto salen de las mismas funciones
-- que el panel: `reloj_cobranza(l)` (el payload de la sesión, invoker: acá
-- corre con los permisos del dueño de la definer, igual que en
-- `foto_tenant_del_dia`) y `monto_de_renovacion(l.id)` (el mismo número
-- que la barra de Inicio y la pantalla de pago). Ningún umbral se repite:
-- el 7 del aviso es `dias_de_aviso()`.

-- >>> avisos_pendientes
create or replace function avisos_pendientes()
returns table (
  lubricentro_id uuid,
  slug           text,
  nombre         text,
  tipo           text,
  voz            text,
  vencimiento    date,
  dias           integer,
  -- El segundo interruptor: si es false, el email no promete el solo
  -- lectura, igual que la barra del panel (1.2 del bloque 1).
  corta          boolean,
  destinatario   text,
  plan_nombre    text,
  periodo        periodo_suscripcion,
  monto          numeric,
  -- El alias FIJO del tenant, si lo tiene. Hoy null para todos: el lugar
  -- en la plantilla es condicional (bloque B del sprint del 17/09).
  alias          text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select l.id, l.slug, l.nombre, l.cresium_alias, l.suspension_automatica,
           reloj_cobranza(l) as r
    from lubricentros l
    where l.activo                                                      -- @manual
      and l.cobranza_desde is not null                                  -- @sin_reloj
      and l.cobranza_desde <= current_date
  ),
  datos as (
    select b.id, b.slug, b.nombre, b.cresium_alias, b.suspension_automatica,
      b.r ->> 'estado'                      as estado,
      (b.r ->> 'vencimiento')::date         as venc,
      (b.r ->> 'dias_para_vencer')::integer as dias,
      (b.r ->> 'periodo')::periodo_suscripcion as periodo,
      (b.r ->> 'es_trial')::boolean         as es_trial,
      (b.r ->> 'tiene_pago')::boolean       as tiene_pago,
      (b.r ->> 'exento')::boolean           as exento
    from base b
    where b.r is not null
  ),
  con_voz as (
    -- La MISMA elección que claveDe() en lib/cobranza/copy.ts: el trial
    -- gana, después el alta (sin ningún pago), y si no, la cobranza.
    select d.*,
      case when d.es_trial then 'trial'
           when not d.tiene_pago then 'alta'
           else 'cobranza' end as voz
    from datos d
    where not d.exento                                                  -- @exento
      and d.venc is not null
  ),
  momento as (
    -- El MÁS AVANZADO que corresponde hoy. El orden del case es el orden
    -- de la escalera.
    select c.*,
      case
        when c.estado = 'suspendido'                              then 'suspendido'  -- @suspendido
        when c.dias <= 0                                                            -- @vencido
         and c.voz <> 'alta'                                      then 'vencido'     -- @alta_sin_intermedio
        when c.dias <= dias_de_aviso()                                              -- @por_vencer
         and (c.voz <> 'alta' or c.dias >= 0)                     then 'por_vencer'  -- @alta_en_plazo
      end as tipo
    from con_voz c
  )
  select
    m.id,
    m.slug,
    m.nombre,
    m.tipo,
    m.voz,
    m.venc,
    m.dias,
    m.suspension_automatica,
    (select u.email from usuarios u
      where u.lubricentro_id = m.id and u.rol = 'owner'
      order by u.created_at limit 1),
    (select p.nombre from suscripciones s join planes p on p.id = s.plan_id
      where s.lubricentro_id = m.id
      order by s.inicio desc, s.created_at desc limit 1),
    m.periodo,
    (monto_de_renovacion(m.id) ->> 'total')::numeric,
    m.cresium_alias
  from momento m
  where m.tipo is not null
    -- Nunca dos veces: si ESTE tipo ya se mandó para ESTE vencimiento, no
    -- hay nada que mandar — y no se cae a un tipo anterior.
    and not exists (                                                    -- @enviado
      select 1 from emails_cobranza e
       where e.lubricentro_id = m.id and e.tipo = m.tipo and e.vencimiento = m.venc)
  order by m.venc, m.slug;
$$;
-- <<< avisos_pendientes

comment on function avisos_pendientes is
  'Por tenant, el email de cobranza MÁS AVANZADO que corresponde hoy y no se mandó para este vencimiento (por_vencer: días <= 7 · vencido: días <= 0 · suspendido: estado derivado). Umbrales, no igualdades. Excluye al exento, al de afuera del reloj y al suspendido a mano; el alta no tiene email intermedio. Solo service_role: cruza usuarios, suscripciones y pagos de todos los tenants.';

revoke all on function avisos_pendientes() from public, anon, authenticated;
grant execute on function avisos_pendientes() to service_role;
