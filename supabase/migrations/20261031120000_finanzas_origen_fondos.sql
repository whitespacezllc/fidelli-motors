-- ============================================================
-- Fidelli Motors · Finanzas — origen de los movimientos y fondos personales
--
-- Dos "doble click" sobre la plata, en tres ejes INDEPENDIENTES (el medio ya
-- existía):
--   · CATEGORÍA / origen (de qué es la plata): ingresos trabajo/repuesto/otro,
--     egresos insumos/sueldos/servicios/otro. Set corto y FIJO (no lo edita el
--     taller). Es analítico: no toca el arqueo.
--   · FONDOS (de qué bolsillo): un egreso del taller pagado con la plata
--     PERSONAL del dueño (su tarjeta). Versión SIMPLE: un flag; lo `personal`
--     NO entra en el arqueo ni en la caja del taller y se muestra aparte
--     ("de tu bolsillo"). NO es una cuenta del dueño con saldo — eso sería
--     contabilidad, y queda afuera (regla 6 / «retención, no gestión»).
--
-- Finanzas no tenía regresión: esta tanda la estrena (R52; R48 ya es de
-- patentes vecinas). La invariante central: un egreso personal no ensucia el
-- arqueo del taller. Lo vigila R52 y scripts/regresion-finanzas.sh.
-- ============================================================


-- ---------- 1 · Las columnas ----------
-- Nullable: los movimientos viejos quedan "sin categoría" (el front siempre
-- manda una en los nuevos). El CHECK fija el set.
alter table ingresos
  add column categoria text
    constraint ingreso_categoria_valida
      check (categoria is null or categoria in ('trabajo', 'repuesto', 'otro')); -- @check-cat-ing

alter table egresos
  add column categoria text
    constraint egreso_categoria_valida
      check (categoria is null or categoria in ('insumos', 'sueldos', 'servicios', 'otro')), -- @check-cat-egr
  -- De qué bolsillo salió. Default 'taller': los egresos viejos eran del
  -- taller, y así tiene que quedar. 'personal' = lo puso el dueño de lo suyo.
  add column fondos text not null default 'taller'
    constraint egreso_fondos_valido check (fondos in ('taller', 'personal')); -- @check-fondos

comment on column ingresos.categoria is 'Origen del ingreso: trabajo / repuesto / otro (o null = sin categorizar). Analítico, no toca el arqueo.';
comment on column egresos.categoria is 'Categoría del egreso: insumos / sueldos / servicios / otro (o null).';
comment on column egresos.fondos is 'Con qué fondos se pagó: taller (default) o personal (la plata del dueño). Lo personal NO entra en el arqueo del taller y se muestra aparte.';


-- ---------- 2 · Las puertas: + categoría (y + fondos en egreso) ----------
-- ⚠ Cambia la FIRMA → hay que DROP de la vieja antes de crear, o quedan dos
-- sobrecargas y toda llamada contesta «is not unique».
drop function if exists guardar_ingreso(uuid, numeric, text, date, uuid, uuid, text);

-- >>> guardar_ingreso
create function guardar_ingreso(
  p_sucursal_id    uuid,
  p_monto          numeric,
  p_concepto       text,
  p_fecha          date default current_date,
  p_presupuesto_id uuid default null,
  p_cliente_id     uuid default null,
  p_medio          text default 'efectivo',
  p_categoria      text default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_concepto    text;
  v_cat         text;
  v_id          uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  v_concepto := nullif(trim(coalesce(p_concepto, '')), '');
  if v_concepto is null then
    raise exception 'ingreso_sin_concepto';
  end if;
  if p_monto is null or p_monto < 0 then
    raise exception 'ingreso_monto_invalido';
  end if;

  -- La categoría, o null. Una fuera de la lista revienta (no se guarda mal). -- @ing-cat
  v_cat := nullif(trim(coalesce(p_categoria, '')), '');
  if v_cat is not null and v_cat not in ('trabajo', 'repuesto', 'otro') then
    raise exception 'ingreso_categoria_invalida';
  end if;

  insert into ingresos (
    lubricentro_id, sucursal_id, usuario_id, fecha, monto, concepto,
    presupuesto_id, cliente_id, medio, categoria
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), coalesce(p_fecha, current_date),
    p_monto, v_concepto, p_presupuesto_id, p_cliente_id, coalesce(p_medio, 'efectivo'), v_cat
  )
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< guardar_ingreso

revoke all on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid, text, text) from public, anon;
grant execute on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid, text, text) to authenticated;


drop function if exists guardar_egreso(uuid, numeric, text, text, date);

-- >>> guardar_egreso
create function guardar_egreso(
  p_sucursal_id uuid,
  p_monto       numeric,
  p_concepto    text,
  p_medio       text default 'efectivo',
  p_fecha       date default current_date,
  p_categoria   text default null,
  p_fondos      text default 'taller'
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_concepto    text;
  v_cat         text;
  v_fondos      text;
  v_id          uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  v_concepto := nullif(trim(coalesce(p_concepto, '')), '');
  if v_concepto is null then
    raise exception 'egreso_sin_concepto';
  end if;
  if p_monto is null or p_monto < 0 then
    raise exception 'egreso_monto_invalido';
  end if;

  v_cat := nullif(trim(coalesce(p_categoria, '')), '');
  if v_cat is not null and v_cat not in ('insumos', 'sueldos', 'servicios', 'otro') then
    raise exception 'egreso_categoria_invalida';
  end if;

  v_fondos := coalesce(nullif(trim(coalesce(p_fondos, '')), ''), 'taller');
  if v_fondos not in ('taller', 'personal') then
    raise exception 'egreso_fondos_invalido';
  end if;

  insert into egresos (
    lubricentro_id, sucursal_id, usuario_id, fecha, monto, concepto, medio, categoria, fondos
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), coalesce(p_fecha, current_date),
    p_monto, v_concepto, coalesce(p_medio, 'efectivo'), v_cat, v_fondos
  )
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< guardar_egreso

revoke all on function guardar_egreso(uuid, numeric, text, text, date, text, text) from public, anon;
grant execute on function guardar_egreso(uuid, numeric, text, text, date, text, text) to authenticated;


-- ---------- 3 · El resumen de la caja ----------
-- Los totales de egresos y el arqueo pasan a ser SOLO de fondos del taller:
-- lo personal no es plata del taller. Se suman `personal` (lo de tu bolsillo)
-- y `por_origen_mes` (el desglose por categoría del mes).
-- >>> resumen_caja
create or replace function resumen_caja()
returns jsonb
language sql
stable
set search_path = public
as $$
  with i as (
    select fecha, monto, medio, categoria from ingresos where lubricentro_id = mi_lubricentro_id()
  ), e as (
    select fecha, monto, medio, categoria, fondos from egresos where lubricentro_id = mi_lubricentro_id()
  ), medios(medio) as (
    select unnest(array['efectivo', 'transferencia', 'tarjeta', 'otro'])
  )
  select jsonb_build_object(
    'hoy', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha = current_date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha = current_date and fondos = 'taller'), 0) -- @egr-hoy
    ),
    'semana', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha >= date_trunc('week', current_date)::date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha >= date_trunc('week', current_date)::date and fondos = 'taller'), 0) -- @egr-sem
    ),
    'mes', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha >= date_trunc('month', current_date)::date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha >= date_trunc('month', current_date)::date and fondos = 'taller'), 0) -- @egr-mes
    ),
    -- De tu bolsillo: lo que el dueño puso de lo personal (no es del taller).
    'personal', jsonb_build_object(
      'hoy',    coalesce((select sum(monto) from e where fecha = current_date and fondos = 'personal'), 0),
      'semana', coalesce((select sum(monto) from e where fecha >= date_trunc('week', current_date)::date and fondos = 'personal'), 0),
      'mes',    coalesce((select sum(monto) from e where fecha >= date_trunc('month', current_date)::date and fondos = 'personal'), 0)
    ),
    -- Arqueo de hoy: neto por medio, SOLO fondos del taller. El efectivo neto
    -- es lo que tendría que haber en el cajón.
    'arqueo_hoy', (
      select jsonb_object_agg(m.medio, jsonb_build_object(
        'ingresos', coalesce((select sum(monto) from i where i.medio = m.medio and i.fecha = current_date), 0),
        'egresos',  coalesce((select sum(monto) from e where e.medio = m.medio and e.fecha = current_date and e.fondos = 'taller'), 0) -- @arqueo-taller
      ))
      from medios m
    ),
    -- Este mes por origen: ingresos y egresos (del taller) agrupados por
    -- categoría. El null va al bucket 'sin'.
    'por_origen_mes', jsonb_build_object(
      'ingresos', coalesce((
        select jsonb_object_agg(k, total) from (
          select coalesce(categoria, 'sin') as k, sum(monto) as total
          from i where fecha >= date_trunc('month', current_date)::date
          group by coalesce(categoria, 'sin')
        ) q), '{}'::jsonb),
      'egresos', coalesce((
        select jsonb_object_agg(k, total) from (
          select coalesce(categoria, 'sin') as k, sum(monto) as total
          from e where fecha >= date_trunc('month', current_date)::date and fondos = 'taller'
          group by coalesce(categoria, 'sin')
        ) q), '{}'::jsonb)
    )
  );
$$;
-- <<< resumen_caja

comment on function resumen_caja is
  'La caja del tenant: ingresos y egresos (del taller) de hoy/semana/mes, lo personal del dueño (de tu bolsillo), el arqueo por medio (solo taller) y el desglose del mes por categoría. En la base; el RLS recorta al tenant.';


-- ---------- 4 · La vista de movimientos: + categoría y fondos ----------
-- create or replace view RESETEA reloptions: hay que re-fijar security_invoker
-- (regla 4), o un owner vería los movimientos de todos.
-- >>> vista_movimientos_caja
create or replace view vista_movimientos_caja
with (security_invoker = true) as
  select
    i.id,
    'ingreso'::text as tipo,
    i.lubricentro_id,
    i.fecha,
    i.concepto,
    i.monto,
    i.medio,
    s.nombre as sucursal_nombre,
    i.created_at,
    -- Las columnas nuevas van al FINAL: create or replace view no deja
    -- insertarlas en el medio (renombra/reordena). El front las elige por
    -- nombre, así que el orden no importa.
    i.categoria,
    null::text as fondos
  from ingresos i
  join sucursales s on s.id = i.sucursal_id
  union all
  select
    e.id,
    'egreso'::text as tipo,
    e.lubricentro_id,
    e.fecha,
    e.concepto,
    e.monto,
    e.medio,
    s.nombre as sucursal_nombre,
    e.created_at,
    e.categoria,
    e.fondos
  from egresos e
  join sucursales s on s.id = e.sucursal_id;
-- <<< vista_movimientos_caja

alter view vista_movimientos_caja set (security_invoker = on); -- @invoker
