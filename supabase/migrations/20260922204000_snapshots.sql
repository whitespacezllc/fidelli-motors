-- ════════════════════════════════════════════════════════════════════
-- SNAPSHOTS DIARIOS · la foto inmutable del cierre de cada día
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 4 y § 5)
--
-- No había ningún histórico: todas las métricas se recalculan en vivo, así
-- que un service anulado hoy cambia el gráfico de hace tres meses y nadie
-- puede saber qué decía el dashboard ayer (docs/ADMIN-INVENTARIO.md § 4.6
-- ii). Acá queda la foto: una fila por día y una por tenant y día. LOS
-- HISTÓRICOS SE LEEN DE ACÁ, NUNCA SE RECALCULAN.
--
-- Dos tablas, dos funciones:
--   · cerrar_dia()            — el cierre de verdad. La llama el cron de
--                               Vercel (app/api/fidelli/cierre-diario) a
--                               las 00:10 hora argentina. fuente = 'cierre'.
--   · reconstruir_snapshots() — la reconstrucción del pasado, a mano, con
--                               el plan y el estado ACTUALES de cada tenant
--                               porque no hay historia anterior.
--                               fuente = 'reconstruido'.
--
-- Las dos tablas son inmutables con los tres candados de tenant_eventos.
-- La FK de snapshots_tenant_diarios es `on delete cascade` por la misma
-- razón que la de tenant_eventos (las pruebas borran sus tenants).
--
-- EL DÍA se corta en hora argentina, América/Argentina/Buenos_Aires: la
-- misma zona de lib/fechas.ts (hoyISO) y de la base (20260813120000).
-- Los trabajos se cuentan por services.fecha; recordatorios, escaneos y
-- eventos, por su created_at / ocurrido_at llevado a esa zona.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @ya_cerrado` y `-- @dia_terminado` NO SE
-- REFORMATEAN: scripts/regresion-metricas.sh las muerde con sed.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Las tablas
-- ════════════════════════════════════════════════════════════════════

create table snapshots_diarios (
  fecha               date primary key,
  tenants_activos     integer not null,
  tenants_suspendidos integer not null,
  tenants_exentos     integer not null,
  mrr_ars             numeric(12,2) not null,
  tc_venta            numeric(12,4),
  mrr_usd             numeric(12,2),
  altas_dia           integer not null,
  bajas_dia           integer not null,
  trabajos_dia        integer not null,
  trabajos_service    integer not null,
  trabajos_mecanica   integer not null,
  trabajos_neumaticos integer not null,
  recordatorios_dia   integer not null,
  escaneos_dia        integer not null,
  fuente              text not null check (fuente in ('cierre', 'reconstruido')),
  created_at          timestamptz not null default now()
);

comment on table snapshots_diarios is
  'La foto de la plataforma al cierre de cada día en hora argentina (docs/METRICAS.md § 4). Inmutable. fuente = cierre (cerrar_dia, el cron) o reconstruido (reconstruir_snapshots, con el estado actual de cada tenant). Los históricos se leen de acá, nunca se recalculan.';

create table snapshots_tenant_diarios (
  fecha          date not null,
  lubricentro_id uuid not null references lubricentros(id) on delete cascade,
  activo         boolean not null,
  exento         boolean not null,
  mrr_ars        numeric(12,2) not null,
  plan_id        uuid references planes(id) on delete restrict,
  periodo        periodo_suscripcion,
  modulo_pago    boolean not null default false,
  trabajos_dia   integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (fecha, lubricentro_id)
);

create index snapshots_tenant_diarios_tenant_idx on snapshots_tenant_diarios (lubricentro_id, fecha);

comment on table snapshots_tenant_diarios is
  'La foto de cada tenant al cierre de cada día (docs/METRICAS.md § 4): activo (es_activo), exento, MRR (mrr_de_tenant), plan, período, módulo pago (modulo_es_pago) y trabajos del día. Inmutable. Es lo que compara cerrar_dia() para detectar suspension_reloj / reactivacion_reloj.';

alter table snapshots_diarios        enable row level security;
alter table snapshots_tenant_diarios enable row level security;

create policy snapshots_diarios_lectura on snapshots_diarios
  for select to authenticated using (soy_superadmin());
create policy snapshots_tenant_diarios_lectura on snapshots_tenant_diarios
  for select to authenticated using (soy_superadmin());

revoke all on table snapshots_diarios        from anon;
revoke all on table snapshots_tenant_diarios from anon;
revoke insert, update, delete, truncate, references, trigger on table snapshots_diarios        from authenticated;
revoke insert, update, delete, truncate, references, trigger on table snapshots_tenant_diarios from authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · Los candados (el molde de tenant_eventos)
-- ════════════════════════════════════════════════════════════════════

create or replace function bloquear_edicion_de_snapshot()
returns trigger
language plpgsql
as $$
begin
  raise exception 'snapshot_no_se_edita'
    using hint = 'Un snapshot es la foto de un día que ya terminó. Si quedó mal, queda como quedó y su fuente lo dice; los históricos no se corrigen a mano.';
  return new;
end;
$$;

create or replace function bloquear_borrado_de_snapshot_diario()
returns trigger
language plpgsql
as $$
begin
  raise exception 'snapshot_no_se_borra'
    using hint = 'snapshots_diarios es la memoria de la plataforma. La única forma legítima de vaciarla es supabase db reset.';
  return old;
end;
$$;

-- Con salida: la fila se va solo si su tenant ya no existe (cascade).
create or replace function bloquear_borrado_de_snapshot_tenant()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from lubricentros where id = old.lubricentro_id) then
    raise exception 'snapshot_no_se_borra'
      using hint = 'snapshots_tenant_diarios es la memoria de cada tenant. La única forma legítima de vaciarla es supabase db reset.';
  end if;
  return old;
end;
$$;

create or replace function bloquear_purga_de_snapshots()
returns trigger
language plpgsql
as $$
begin
  raise exception 'snapshots_no_se_vacian'
    using hint = 'Un truncate sobre los snapshots borra la historia entera en una línea. Usá supabase db reset si necesitás una base limpia.';
  return null;
end;
$$;

create trigger candado_edicion_snapshot_diario
  before update on snapshots_diarios
  for each row execute function bloquear_edicion_de_snapshot();
create trigger candado_borrado_snapshot_diario
  before delete on snapshots_diarios
  for each row execute function bloquear_borrado_de_snapshot_diario();
create trigger candado_purga_snapshots_diarios
  before truncate on snapshots_diarios
  for each statement execute function bloquear_purga_de_snapshots();

create trigger candado_edicion_snapshot_tenant
  before update on snapshots_tenant_diarios
  for each row execute function bloquear_edicion_de_snapshot();
create trigger candado_borrado_snapshot_tenant
  before delete on snapshots_tenant_diarios
  for each row execute function bloquear_borrado_de_snapshot_tenant();
create trigger candado_purga_snapshots_tenant
  before truncate on snapshots_tenant_diarios
  for each statement execute function bloquear_purga_de_snapshots();

alter table snapshots_diarios        enable always trigger candado_edicion_snapshot_diario;
alter table snapshots_diarios        enable always trigger candado_borrado_snapshot_diario;
alter table snapshots_diarios        enable always trigger candado_purga_snapshots_diarios;
alter table snapshots_tenant_diarios enable always trigger candado_edicion_snapshot_tenant;
alter table snapshots_tenant_diarios enable always trigger candado_borrado_snapshot_tenant;
alter table snapshots_tenant_diarios enable always trigger candado_purga_snapshots_tenant;


-- ════════════════════════════════════════════════════════════════════
-- 3 · Un helper: la foto de un tenant en un día
-- ════════════════════════════════════════════════════════════════════
--
-- La comparten el cierre y la reconstrucción para que las dos escriban
-- exactamente lo mismo. Devuelve true si insertó (false si ya existía).
-- Definer sin grant: solo la llaman cerrar_dia() y reconstruir_snapshots().

create or replace function foto_tenant_del_dia(p_fecha date, p_lub lubricentros)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sub  record;
  v_trab integer;
  v_n    integer;
begin
  select s.plan_id, s.periodo, s.descuento_pct
    into v_sub
    from suscripciones s
   where s.lubricentro_id = p_lub.id
   order by s.inicio desc, s.created_at desc
   limit 1;

  select count(*)::integer into v_trab
    from services sv
   where sv.lubricentro_id = p_lub.id
     and not sv.anulado
     and sv.fecha = p_fecha;

  insert into snapshots_tenant_diarios
    (fecha, lubricentro_id, activo, exento, mrr_ars, plan_id, periodo, modulo_pago, trabajos_dia)
  values (
    p_fecha, p_lub.id,
    coalesce(es_activo(p_lub), false),
    coalesce(v_sub.descuento_pct, 0) >= 100,
    coalesce(mrr_de_tenant(p_lub.id), 0),
    v_sub.plan_id, v_sub.periodo,
    coalesce(modulo_es_pago(p_lub.id, 'neumaticos'), false),
    v_trab)
  on conflict (fecha, lubricentro_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function foto_tenant_del_dia(date, lubricentros) from public, anon, authenticated;


-- Y el agregado del día, también compartido.
create or replace function foto_plataforma_del_dia(p_fecha date, p_tc_venta numeric, p_fuente text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := (p_fecha::timestamp       at time zone 'America/Argentina/Buenos_Aires');
  v_hasta timestamptz := ((p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  insert into snapshots_diarios (
    fecha, tenants_activos, tenants_suspendidos, tenants_exentos, mrr_ars, tc_venta, mrr_usd,
    altas_dia, bajas_dia, trabajos_dia, trabajos_service, trabajos_mecanica, trabajos_neumaticos,
    recordatorios_dia, escaneos_dia, fuente)
  select
    p_fecha,
    count(*) filter (where st.activo)::integer,
    count(*) filter (where not st.activo)::integer,
    count(*) filter (where st.exento)::integer,
    coalesce(sum(st.mrr_ars), 0),
    p_tc_venta,
    case when p_tc_venta > 0 then round(coalesce(sum(st.mrr_ars), 0) / p_tc_venta, 2) end,
    (select count(*) from tenant_eventos e
      where e.tipo = 'alta' and e.ocurrido_at >= v_desde and e.ocurrido_at < v_hasta)::integer,
    (select count(*) from tenant_eventos e
      where e.tipo in ('suspension', 'suspension_reloj')
        and e.ocurrido_at >= v_desde and e.ocurrido_at < v_hasta)::integer,
    (select count(*) from services sv where not sv.anulado and sv.fecha = p_fecha)::integer,
    (select count(*) from services sv where not sv.anulado and sv.fecha = p_fecha and sv.tipo = 'service')::integer,
    (select count(*) from services sv where not sv.anulado and sv.fecha = p_fecha and sv.tipo = 'mecanica')::integer,
    (select count(*) from services sv where not sv.anulado and sv.fecha = p_fecha and sv.tipo = 'neumaticos')::integer,
    (select count(*) from contactos c where c.created_at >= v_desde and c.created_at < v_hasta)::integer,
    (select count(*) from landing_busquedas b where b.created_at >= v_desde and b.created_at < v_hasta)::integer,
    p_fuente
  from snapshots_tenant_diarios st
  where st.fecha = p_fecha;
end;
$$;

revoke all on function foto_plataforma_del_dia(date, numeric, text) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 4 · El cierre
-- ════════════════════════════════════════════════════════════════════
--
-- Idempotente: cerrar dos veces el mismo día no cambia nada. Ejecutable
-- solo por service_role (el cron) y postgres. Devuelve 'ya cerrado' o
-- 'cerrado'.

-- >>> cerrar_dia
create or replace function cerrar_dia(
  p_fecha     date,
  p_tc_venta  numeric,
  p_tc_compra numeric default null,
  p_fuente    text default 'manual'
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tc    tipo_cambio;
  v_l     lubricentros;
  v_prev  boolean;
  v_hubo  boolean;
  v_act   boolean;
  v_desde timestamptz := (p_fecha::timestamp       at time zone 'America/Argentina/Buenos_Aires');
  v_hasta timestamptz := ((p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if p_fecha is null then
    raise exception 'fecha_vacia';
  end if;

  -- Un día se cierra cuando terminó.
  if p_fecha >= current_date then                                      -- @dia_terminado
    raise exception 'dia_no_terminado'
      using hint = 'cerrar_dia() cierra días que ya pasaron en hora argentina. Hoy se cierra mañana a las 00:10.';
  end if;

  if exists (select 1 from snapshots_diarios where fecha = p_fecha) then   -- @ya_cerrado
    return 'ya cerrado';
  end if;

  -- El tipo de cambio del día, si no estaba. Nunca se inventa: si no hay
  -- valor, la ruta del cron ya lo trajo como 'repetido' del día anterior.
  if not exists (select 1 from tipo_cambio where fecha = p_fecha) then
    if p_tc_venta is null or p_tc_venta <= 0 then
      raise exception 'tc_vacio'
        using hint = 'Sin tipo de cambio no hay cierre: pasá la cotización del día, o la última conocida con fuente = repetido.';
    end if;
    insert into tipo_cambio (fecha, compra, venta, fuente)
    values (p_fecha, p_tc_compra, p_tc_venta, coalesce(nullif(trim(coalesce(p_fuente, '')), ''), 'manual'));
  end if;

  select * into v_tc from tipo_cambio where fecha = p_fecha;

  -- La foto de cada tenant que existía ese día.
  for v_l in
    select * from lubricentros l
     where l.created_at < v_hasta
     order by l.created_at
  loop
    perform foto_tenant_del_dia(p_fecha, v_l);

    -- Las transiciones del reloj, contra el último día cerrado anterior.
    select st.activo into v_prev
      from snapshots_tenant_diarios st
     where st.lubricentro_id = v_l.id and st.fecha < p_fecha
     order by st.fecha desc
     limit 1;

    if found then
      select st.activo into v_act
        from snapshots_tenant_diarios st
       where st.lubricentro_id = v_l.id and st.fecha = p_fecha;

      if v_prev and not v_act and v_l.activo then
        -- Ayer estaba, hoy no, y nadie lo apagó a mano: fue el reloj.
        perform emitir_evento_tenant(v_l.id, 'suspension_reloj',
          jsonb_build_object('activo', true),
          jsonb_build_object('activo', false, 'estado_reloj', reloj_cobranza(v_l) ->> 'estado'),
          'reloj de cobranza', 'sistema', v_hasta - interval '1 second', null);
      elsif not v_prev and v_act then
        select exists (
          select 1 from tenant_eventos e
           where e.lubricentro_id = v_l.id and e.tipo = 'reactivacion'
             and e.ocurrido_at >= v_desde and e.ocurrido_at < v_hasta
        ) into v_hubo;
        if not v_hubo then
          perform emitir_evento_tenant(v_l.id, 'reactivacion_reloj',
            jsonb_build_object('activo', false),
            jsonb_build_object('activo', true, 'estado_reloj', reloj_cobranza(v_l) ->> 'estado'),
            'reloj de cobranza', 'sistema', v_hasta - interval '1 second', null);
        end if;
      end if;
    end if;
  end loop;

  perform foto_plataforma_del_dia(p_fecha, v_tc.venta, 'cierre');

  return 'cerrado';
end;
$$;
-- <<< cerrar_dia

comment on function cerrar_dia is
  'El cierre de un día en hora argentina (docs/METRICAS.md § 4): tipo de cambio, foto por tenant, transiciones de reloj (suspension_reloj / reactivacion_reloj) y foto de la plataforma con fuente = cierre. Idempotente: devuelve ya cerrado si el día ya tiene snapshot. Solo service_role (el cron de Vercel) y postgres.';

revoke all on function cerrar_dia(date, numeric, numeric, text) from public, anon, authenticated;
grant execute on function cerrar_dia(date, numeric, numeric, text) to service_role;


-- ════════════════════════════════════════════════════════════════════
-- 5 · La reconstrucción del pasado
-- ════════════════════════════════════════════════════════════════════
--
-- Para cada día del rango sin snapshot y con tipo de cambio vigente, arma
-- la foto con los tenants que existían ese día y su estado ACTUAL. No hay
-- historia anterior de plan, período, descuento ni activo, y eso queda
-- dicho en la fuente: 'reconstruido'. Nunca pisa un snapshot existente.
-- Devuelve cuántos días armó. Se corre a mano (postgres o service_role).

-- >>> reconstruir_snapshots
create or replace function reconstruir_snapshots(p_desde date, p_hasta date)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dia   date;
  v_tc    tipo_cambio;
  v_l     lubricentros;
  v_hasta timestamptz;
  v_n     integer := 0;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango_invalido';
  end if;
  if p_hasta >= current_date then
    raise exception 'dia_no_terminado'
      using hint = 'Solo se reconstruyen días que ya pasaron en hora argentina.';
  end if;

  for v_dia in select d::date from generate_series(p_desde, p_hasta, interval '1 day') d loop
    continue when exists (select 1 from snapshots_diarios where fecha = v_dia);

    v_tc := tc_vigente(v_dia);
    continue when v_tc.fecha is null;

    v_hasta := ((v_dia + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');

    for v_l in
      select * from lubricentros l where l.created_at < v_hasta order by l.created_at
    loop
      perform foto_tenant_del_dia(v_dia, v_l);
    end loop;

    perform foto_plataforma_del_dia(v_dia, v_tc.venta, 'reconstruido');
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;
-- <<< reconstruir_snapshots

comment on function reconstruir_snapshots is
  'Arma los snapshots de los días sin foto y con tipo de cambio (docs/METRICAS.md § 5) usando el estado, plan, período y MRR ACTUALES de cada tenant: no hay historia anterior. fuente = reconstruido. Nunca pisa un snapshot existente. Devuelve cuántos días armó.';

revoke all on function reconstruir_snapshots(date, date) from public, anon, authenticated;
grant execute on function reconstruir_snapshots(date, date) to service_role;
