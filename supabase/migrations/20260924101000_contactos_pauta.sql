-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 3 · contactos de pauta, gasto semanal y embudo
--
-- docs/METRICAS.md § 1 («Contacto», «Demo», «Cierre», «Pérdida», «Tasa de
-- cierre», «Ciclo», «Gasto de pauta», «CAC del canal»).
--
-- ESTO NO ES UN CRM. Un contacto son cinco campos que se cargan desde el
-- celular en menos de diez segundos cuando entra un mensaje: fecha, canal,
-- origen (solo Meta), teléfono opcional, y después tres fechas que se
-- marcan con un toque (demo, cierre, pérdida). No hay etapas, responsables,
-- seguimientos ni notas, y no se agregan acá: si una columna hace más lento
-- el registro, está mal.
--
-- El gasto es UNA fila por semana (siempre lunes) y canal, en USD: Meta y
-- Google se pagan en dólares y el peso de ese día sale de tc_vigente().
--
-- El embudo cuenta POR COHORTE de primer contacto: un contacto de la
-- semana 1 que cierra en la semana 3 es un cierre de la semana 1. Lo único
-- que va por el período calendario es la plata: el gasto y el CAC (gasto
-- del período ÷ cierres cuya fecha de cierre cae en el período).
--
-- Todo es solo superadmin: RLS en las dos tablas y guarda en cada función.
--
-- ⚠ Las líneas marcadas `-- @algo` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-metricas.sh los
-- muerde con sed (regla 13).
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Los enums
-- ════════════════════════════════════════════════════════════════════

create type canal_pauta as enum ('meta', 'google', 'otro');

-- Solo aplica a `meta`: por dónde entró el mensaje.
create type origen_meta as enum ('instagram', 'messenger', 'whatsapp');

create type motivo_perdida as enum (
  'precio', 'no_responde', 'ya_tiene_sistema', 'no_factura', 'no_es_dueno', 'otro'
);


-- ════════════════════════════════════════════════════════════════════
-- 2 · Las tablas
-- ════════════════════════════════════════════════════════════════════

create table contactos_pauta (
  id              uuid primary key default gen_random_uuid(),
  -- La fecha del PRIMER mensaje: es la cohorte.
  fecha           date not null,
  canal           canal_pauta not null,
  origen          origen_meta,
  telefono        text,
  demo_at         date,
  cierre_at       date,
  lubricentro_id  uuid references lubricentros(id) on delete restrict,
  perdida_at      date,
  motivo_perdida  motivo_perdida,
  registrado_por  uuid references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Cerrado Y perdido a la vez no significa nada. Para cambiar de uno al
  -- otro se reabre primero.
  constraint cierre_o_perdida check (not (cierre_at is not null and perdida_at is not null)),
  constraint cierre_con_tenant check (cierre_at is null or lubricentro_id is not null),
  constraint origen_solo_meta check (origen is null or canal = 'meta'),
  constraint fechas_desde_el_contacto check (
    (demo_at    is null or demo_at    >= fecha) and
    (cierre_at  is null or cierre_at  >= fecha) and
    (perdida_at is null or perdida_at >= fecha)
  )
);

create index contactos_pauta_fecha on contactos_pauta (fecha desc, created_at desc);
create index contactos_pauta_canal on contactos_pauta (canal, fecha);
create index contactos_pauta_tenant on contactos_pauta (lubricentro_id) where lubricentro_id is not null;

create trigger contactos_pauta_updated_at
  before update on contactos_pauta
  for each row execute function tocar_updated_at();

comment on table contactos_pauta is
  'Un contacto de pauta (bloque MÉTRICAS 3, docs/METRICAS.md § 1): una persona que escribió por un canal pago. Cinco campos y tres fechas; NO es un CRM. La cohorte es `fecha` (el primer mensaje). Solo superadmin.';

create table gasto_pauta (
  -- Siempre un lunes: la semana ISO en la que se gastó.
  semana          date not null check (extract(isodow from semana) = 1),        -- @lunes
  canal           canal_pauta not null,
  monto_usd       numeric(12,2) not null check (monto_usd >= 0),
  nota            text,
  registrado_por  uuid references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (semana, canal)
);

create trigger gasto_pauta_updated_at
  before update on gasto_pauta
  for each row execute function tocar_updated_at();

comment on table gasto_pauta is
  'El gasto de pauta por semana (lunes) y canal, en USD (bloque MÉTRICAS 3). Una fila por (semana, canal); el equivalente en pesos sale de tc_vigente() y no se guarda.';

-- RLS: solo superadmin, para leer y para escribir. Las escrituras del
-- producto entran por las funciones de abajo; la policy es la segunda capa.
alter table contactos_pauta enable row level security;
alter table gasto_pauta     enable row level security;

create policy contactos_pauta_superadmin on contactos_pauta
  for all to authenticated using (soy_superadmin()) with check (soy_superadmin());
create policy gasto_pauta_superadmin on gasto_pauta
  for all to authenticated using (soy_superadmin()) with check (soy_superadmin());

grant select, insert, update, delete on contactos_pauta to authenticated;
grant select, insert, update, delete on gasto_pauta     to authenticated;
grant all on contactos_pauta, gasto_pauta to service_role;


-- ════════════════════════════════════════════════════════════════════
-- 3 · Las puertas del contacto
-- ════════════════════════════════════════════════════════════════════

-- >>> registrar_contacto_pauta
create or replace function registrar_contacto_pauta(
  p_fecha    date        default current_date,
  p_canal    canal_pauta default 'meta',
  p_origen   origen_meta default null,
  p_telefono text        default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli registra contactos de pauta' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > current_date then
    raise exception 'fecha_futura' using hint = 'La fecha del primer mensaje no puede ser posterior a hoy.';
  end if;

  insert into contactos_pauta (fecha, canal, origen, telefono, registrado_por)
  values (
    p_fecha,
    p_canal,
    -- El origen es de Meta solo. Sin origen, WhatsApp: es por donde entra
    -- casi todo.
    case when p_canal = 'meta' then coalesce(p_origen, 'whatsapp') end,
    nullif(trim(coalesce(p_telefono, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< registrar_contacto_pauta

-- >>> marcar_demo
create or replace function marcar_demo(p_id uuid, p_fecha date default current_date)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli marca contactos de pauta' using errcode = '42501';
  end if;
  update contactos_pauta set demo_at = coalesce(p_fecha, current_date) where id = p_id;
  if not found then
    raise exception 'no_existe' using hint = 'Ese contacto no existe.';
  end if;
end;
$$;
-- <<< marcar_demo

-- El origen del tenant que corresponde a cada canal (docs/METRICAS.md § 1
-- «Cierre»). `google` existe desde 20260924100000.
create or replace function origen_de_canal(p_canal canal_pauta)
returns origen_tenant
language sql
immutable
as $$
  select case p_canal
    when 'meta'   then 'meta'::origen_tenant
    when 'google' then 'google'::origen_tenant
    else 'otro'::origen_tenant
  end;
$$;

-- >>> marcar_cierre
create or replace function marcar_cierre(
  p_id             uuid,
  p_fecha          date default current_date,
  p_lubricentro_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_canal  canal_pauta;
  v_fecha  date;
  v_origen origen_tenant;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli marca contactos de pauta' using errcode = '42501';
  end if;
  if p_lubricentro_id is null then
    raise exception 'tenant_vacio' using hint = 'Un cierre es un tenant: elegí cuál.';
  end if;

  select origen into v_origen from lubricentros where id = p_lubricentro_id;
  if not found then
    raise exception 'no_existe_tenant' using hint = 'Ese lubricentro no existe.';
  end if;

  update contactos_pauta
     set cierre_at = coalesce(p_fecha, current_date),
         lubricentro_id = p_lubricentro_id,
         perdida_at = null,
         motivo_perdida = null
   where id = p_id
   returning canal, fecha into v_canal, v_fecha;
  if not found then
    raise exception 'no_existe' using hint = 'Ese contacto no existe.';
  end if;

  -- El origen del tenant se fija SOLO si estaba vacío: si alguien ya lo
  -- cargó a mano (o vino del alta), eso vale más que la inferencia. Deja
  -- el evento `origen` de siempre, por el trigger de lubricentros. El
  -- detalle es para leerlo en el chip y el historial (la fecha del primer
  -- mensaje), no el id: el vínculo al contacto queda en contactos_pauta.
  if v_origen is null then                                              -- @origen_si_vacio
    perform fijar_origen_tenant(
      p_lubricentro_id,
      origen_de_canal(v_canal),
      'contacto de pauta del ' || to_char(v_fecha, 'DD/MM/YYYY')
    );
  end if;
end;
$$;
-- <<< marcar_cierre

-- >>> marcar_perdida
create or replace function marcar_perdida(
  p_id     uuid,
  p_fecha  date           default current_date,
  p_motivo motivo_perdida default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cierre date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli marca contactos de pauta' using errcode = '42501';
  end if;

  select cierre_at into v_cierre from contactos_pauta where id = p_id;
  if not found then
    raise exception 'no_existe' using hint = 'Ese contacto no existe.';
  end if;
  if v_cierre is not null then
    raise exception 'contacto_cerrado'
      using hint = 'Este contacto ya cerró. Para marcarlo perdido, reabrilo primero.';
  end if;

  update contactos_pauta
     set perdida_at = coalesce(p_fecha, current_date),
         motivo_perdida = p_motivo
   where id = p_id;
end;
$$;
-- <<< marcar_perdida

-- Vuelve el contacto a «abierto». La demo queda (se envió igual). El
-- origen que el cierre le fijó al tenant NO se deshace: sigue siendo
-- verdad de dónde vino; se corrige a mano desde Editar si hace falta.
-- >>> reabrir_contacto_pauta
create or replace function reabrir_contacto_pauta(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli marca contactos de pauta' using errcode = '42501';
  end if;
  update contactos_pauta
     set cierre_at = null, lubricentro_id = null, perdida_at = null, motivo_perdida = null
   where id = p_id;
  if not found then
    raise exception 'no_existe' using hint = 'Ese contacto no existe.';
  end if;
end;
$$;
-- <<< reabrir_contacto_pauta


-- ════════════════════════════════════════════════════════════════════
-- 4 · El gasto: un upsert por (semana, canal)
-- ════════════════════════════════════════════════════════════════════
-- Con monto null se BORRA la fila: «no se cargó» y «cero» son dos cosas
-- distintas, y la pantalla las distingue («cargar el lunes» vs «US$ 0»).

-- >>> fijar_gasto_pauta
create or replace function fijar_gasto_pauta(
  p_semana    date,
  p_canal     canal_pauta,
  p_monto_usd numeric default null,
  p_nota      text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli carga el gasto de pauta' using errcode = '42501';
  end if;
  if p_semana is null or extract(isodow from p_semana) <> 1 then
    raise exception 'semana_no_es_lunes' using hint = 'El gasto se carga por semana, con la fecha del lunes.';
  end if;

  if p_monto_usd is null then
    delete from gasto_pauta where semana = p_semana and canal = p_canal;
    return;
  end if;
  if p_monto_usd < 0 then
    raise exception 'monto_negativo' using hint = 'El gasto no puede ser negativo.';
  end if;

  insert into gasto_pauta (semana, canal, monto_usd, nota, registrado_por)
  values (p_semana, p_canal, round(p_monto_usd, 2), nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  on conflict (semana, canal) do update
    set monto_usd = excluded.monto_usd,
        nota = excluded.nota,
        registrado_por = excluded.registrado_por;
end;
$$;
-- <<< fijar_gasto_pauta


-- ════════════════════════════════════════════════════════════════════
-- 5 · El embudo
-- ════════════════════════════════════════════════════════════════════
--
-- Una fila por período (semana ISO o mes) entre p_desde y p_hasta, con los
-- períodos vacíos incluidos. Con p_canal null suma todos los canales
-- (`canal` sale null); con un canal, solo ese.
--
--   · contactos, demos, cierres, perdidos, abiertos, tasas y ciclo: POR
--     COHORTE de `fecha` (primer contacto).
--   · cierres_periodo: los cierres cuya fecha de cierre cae en el período.
--   · gasto_usd: la suma de gasto_pauta cuyos lunes caen en el período.
--   · cac_usd: gasto_usd ÷ cierres_periodo; null sin gasto o sin cierres.

-- >>> embudo_pauta
create or replace function embudo_pauta(
  p_desde   date,
  p_hasta   date,
  p_agrupar text        default 'semana',
  p_canal   canal_pauta default null
)
returns table (
  periodo            date,
  canal              canal_pauta,
  contactos          integer,
  demos              integer,
  cierres            integer,
  perdidos           integer,
  abiertos           integer,
  tasa_demo          numeric,
  tasa_cierre        numeric,
  ciclo_mediana_dias numeric,
  cierres_periodo    integer,
  gasto_usd          numeric,
  cac_usd            numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_unidad text;
  v_paso   interval;
  v_ini    date;
  v_fin    date;  -- exclusivo
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve el embudo de pauta' using errcode = '42501';
  end if;
  if p_agrupar not in ('semana', 'mes') then
    raise exception 'agrupar_invalido' using hint = 'semana o mes.';
  end if;

  v_unidad := case p_agrupar when 'mes' then 'month' else 'week' end;
  v_paso   := case p_agrupar when 'mes' then interval '1 month' else interval '1 week' end;
  v_ini    := date_trunc(v_unidad, p_desde::timestamp)::date;
  v_fin    := (date_trunc(v_unidad, p_hasta::timestamp) + v_paso)::date;

  return query
  with periodos as (
    select generate_series(v_ini, v_fin - 1, v_paso)::date as inicio
  ),
  cohorte as (
    select
      date_trunc(v_unidad, c.fecha::timestamp)::date as inicio,
      count(*)::integer                                          as n_contactos,
      count(*) filter (where c.demo_at    is not null)::integer  as n_demos,
      count(*) filter (where c.cierre_at  is not null)::integer  as n_cierres,   -- @cohorte
      count(*) filter (where c.perdida_at is not null)::integer  as n_perdidos,
      percentile_cont(0.5) within group (order by (c.cierre_at - c.fecha))
        filter (where c.cierre_at is not null)                   as ciclo
    from contactos_pauta c
    where c.fecha >= v_ini and c.fecha < v_fin
      and (p_canal is null or c.canal = p_canal)
    group by 1
  ),
  cerrados as (
    select date_trunc(v_unidad, c.cierre_at::timestamp)::date as inicio, count(*)::integer as n
    from contactos_pauta c
    where c.cierre_at is not null and c.cierre_at >= v_ini and c.cierre_at < v_fin
      and (p_canal is null or c.canal = p_canal)
    group by 1
  ),
  gasto as (
    select date_trunc(v_unidad, g.semana::timestamp)::date as inicio, sum(g.monto_usd) as usd
    from gasto_pauta g
    where g.semana >= v_ini and g.semana < v_fin
      and (p_canal is null or g.canal = p_canal)
    group by 1
  )
  select
    p.inicio,
    p_canal,
    coalesce(co.n_contactos, 0),
    coalesce(co.n_demos, 0),
    coalesce(co.n_cierres, 0),
    coalesce(co.n_perdidos, 0),
    coalesce(co.n_contactos, 0) - coalesce(co.n_cierres, 0) - coalesce(co.n_perdidos, 0),
    case when coalesce(co.n_contactos, 0) > 0
         then round(coalesce(co.n_demos, 0)::numeric / co.n_contactos, 4) end,
    case when coalesce(co.n_contactos, 0) > 0
         then round(coalesce(co.n_cierres, 0)::numeric / co.n_contactos, 4) end,
    round(co.ciclo::numeric, 1),
    coalesce(ce.n, 0),
    g.usd,
    case when coalesce(ce.n, 0) > 0 and g.usd is not null
         then round(g.usd / ce.n, 2) end                                     -- @cac_periodo
  from periodos p
  left join cohorte  co on co.inicio = p.inicio
  left join cerrados ce on ce.inicio = p.inicio
  left join gasto    g  on g.inicio  = p.inicio
  order by p.inicio;
end;
$$;
-- <<< embudo_pauta

comment on function embudo_pauta is
  'El embudo de pauta por semana ISO o mes (bloque MÉTRICAS 3): contactos, demos, cierres, perdidos, abiertos, tasas y ciclo POR COHORTE de primer contacto; cierres_periodo, gasto_usd y cac_usd por el período calendario. Con p_canal null suma los canales. Solo superadmin.';

-- La oración del Resumen: este mes y la tasa del anterior.
-- >>> embudo_pauta_mes_actual
create or replace function embudo_pauta_mes_actual()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_mes     date := date_trunc('month', current_date)::date;
  v_mes_ant date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_actual  record;
  v_ant     record;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve el embudo de pauta' using errcode = '42501';
  end if;

  select * into v_actual from embudo_pauta(v_mes, v_mes, 'mes') limit 1;
  select * into v_ant    from embudo_pauta(v_mes_ant, v_mes_ant, 'mes') limit 1;

  return jsonb_build_object(
    'mes',                v_mes,
    'contactos',          coalesce(v_actual.contactos, 0),
    'demos',              coalesce(v_actual.demos, 0),
    'cierres',            coalesce(v_actual.cierres, 0),
    'tasa_cierre',        v_actual.tasa_cierre,
    'cierres_periodo',    coalesce(v_actual.cierres_periodo, 0),
    'gasto_usd',          v_actual.gasto_usd,
    'cac_usd',            v_actual.cac_usd,
    'mes_anterior_contactos',   coalesce(v_ant.contactos, 0),
    'mes_anterior_tasa_cierre', v_ant.tasa_cierre
  );
end;
$$;
-- <<< embudo_pauta_mes_actual


-- ════════════════════════════════════════════════════════════════════
-- 6 · Permisos
-- ════════════════════════════════════════════════════════════════════

revoke all on function registrar_contacto_pauta(date, canal_pauta, origen_meta, text) from public, anon;
revoke all on function marcar_demo(uuid, date) from public, anon;
revoke all on function marcar_cierre(uuid, date, uuid) from public, anon;
revoke all on function marcar_perdida(uuid, date, motivo_perdida) from public, anon;
revoke all on function reabrir_contacto_pauta(uuid) from public, anon;
revoke all on function fijar_gasto_pauta(date, canal_pauta, numeric, text) from public, anon;
revoke all on function embudo_pauta(date, date, text, canal_pauta) from public, anon;
revoke all on function embudo_pauta_mes_actual() from public, anon;
revoke all on function origen_de_canal(canal_pauta) from public, anon;

grant execute on function registrar_contacto_pauta(date, canal_pauta, origen_meta, text) to authenticated, service_role;
grant execute on function marcar_demo(uuid, date)                          to authenticated, service_role;
grant execute on function marcar_cierre(uuid, date, uuid)                  to authenticated, service_role;
grant execute on function marcar_perdida(uuid, date, motivo_perdida)       to authenticated, service_role;
grant execute on function reabrir_contacto_pauta(uuid)                     to authenticated, service_role;
grant execute on function fijar_gasto_pauta(date, canal_pauta, numeric, text) to authenticated, service_role;
grant execute on function embudo_pauta(date, date, text, canal_pauta)      to authenticated, service_role;
grant execute on function embudo_pauta_mes_actual()                        to authenticated, service_role;
grant execute on function origen_de_canal(canal_pauta)                     to authenticated, service_role;
