-- ============================================================
-- Fidelli Motors · Finanzas — Nivel 2A: la caja del día (arqueo)
--
-- Completa "El día" con lo que falta para el cierre mental del dueño:
--   · MEDIO DE PAGO en cada movimiento (efectivo / transferencia /
--     tarjeta / otro), para el arqueo —cuánto efectivo quedó en el cajón.
--   · EGRESOS: lo que sale (un repuesto, un pago). Con los ingresos, da el
--     "entró − salió = queda" del día.
--
-- SIGUE SIENDO Nivel 1 en su frontera: NO es facturación ni contabilidad.
-- Sin IVA, sin comprobante, sin costo de productos, sin estados
-- cobrado/pendiente, sin cuenta corriente. El egreso es un renglón con
-- monto y concepto, igual que el ingreso — no un asiento contable. La
-- cuenta corriente (fiados) es otra rebanada (2B).
--
-- Los cuatro medios son una lista corta y cerrada (CHECK), espejada en
-- lib/finanzas.ts. Un medio nuevo es editar las dos puntas en el mismo PR.
-- ============================================================


-- ---------- 1 · El medio de pago en los ingresos ----------
-- Default 'efectivo': es el mostrador, y backfillea las filas del Nivel 1
-- con el supuesto más probable sin romper nada.
alter table ingresos
  add column medio text not null default 'efectivo'
    constraint ingresos_medio_valido
      check (medio in ('efectivo', 'transferencia', 'tarjeta', 'otro'));


-- ---------- 2 · La tabla de egresos ----------
-- Misma forma que `ingresos`, sin presupuesto_id ni cliente_id: un egreso
-- no se cobra a nadie ni sale de un presupuesto.
create table egresos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  sucursal_id     uuid not null references sucursales(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  fecha           date not null default current_date,
  monto           numeric(12,2) not null check (monto >= 0),
  concepto        text not null,
  medio           text not null default 'efectivo'
    constraint egresos_medio_valido
      check (medio in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  created_at      timestamptz not null default now(),

  constraint egreso_concepto_no_vacio check (char_length(trim(concepto)) >= 2)
);

create index egresos_lubricentro_fecha_idx
  on egresos (lubricentro_id, fecha desc);

comment on table egresos is
  'Egresos del lubricentro (módulo Finanzas, Nivel 2A). Lo que sale de la caja. NO es contabilidad: sin categorías contables, sin comprobante, sin IVA. Un renglón con monto, concepto y medio, igual que un ingreso.';


-- ---------- 3 · RLS: patrón de tenant + gating por módulo ----------
alter table egresos enable row level security;

create policy egresos_lectura on egresos for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

-- El gating va en el WITH CHECK, nunca en el USING (regla de oro).
create policy egresos_alta on egresos for insert to authenticated
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('finanzas'))
    or soy_superadmin()
  );

create policy egresos_edicion on egresos for update to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('finanzas'))
    or soy_superadmin()
  );

create policy egresos_borrado on egresos for delete to authenticated
  using (soy_superadmin());


-- ---------- 4 · Guardar un egreso ----------
create or replace function guardar_egreso(
  p_sucursal_id uuid,
  p_monto       numeric,
  p_concepto    text,
  p_medio       text default 'efectivo',
  p_fecha       date default current_date
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_concepto    text;
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

  insert into egresos (
    lubricentro_id, sucursal_id, usuario_id, fecha, monto, concepto, medio
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), coalesce(p_fecha, current_date),
    p_monto, v_concepto, coalesce(p_medio, 'efectivo')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function guardar_egreso is
  'Registra un egreso. Invoker: el RLS impone tenant y módulo. El lubricentro y el autor salen de la sesión.';

revoke all on function guardar_egreso(uuid, numeric, text, text, date) from public, anon;
grant execute on function guardar_egreso(uuid, numeric, text, text, date) to authenticated;


-- ---------- 5 · guardar_ingreso: ahora con medio ----------
-- Agregar un parámetro cambia la firma → es un OVERLOAD, no un reemplazo.
-- Se tira la versión del Nivel 1 y se crea la nueva con p_medio al final.
drop function if exists guardar_ingreso(uuid, numeric, text, date, uuid, uuid);

create or replace function guardar_ingreso(
  p_sucursal_id    uuid,
  p_monto          numeric,
  p_concepto       text,
  p_fecha          date default current_date,
  p_presupuesto_id uuid default null,
  p_cliente_id     uuid default null,
  p_medio          text default 'efectivo'
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_concepto    text;
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

  insert into ingresos (
    lubricentro_id, sucursal_id, usuario_id, fecha, monto, concepto,
    presupuesto_id, cliente_id, medio
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), coalesce(p_fecha, current_date),
    p_monto, v_concepto, p_presupuesto_id, p_cliente_id, coalesce(p_medio, 'efectivo')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function guardar_ingreso is
  'Registra un ingreso (con medio de pago desde 2A). Invoker: el RLS impone tenant y módulo. El único parcial de presupuesto_id evita cobrarlo dos veces.';

revoke all on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid, text) from public, anon;
grant execute on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid, text) to authenticated;


-- ---------- 6 · El resumen de la caja ----------
-- Reemplaza a resumen_ingresos(): ahora cuenta entró/salió por período y el
-- arqueo (neto por medio) de hoy. Todo en la base.
drop function if exists resumen_ingresos();

create or replace function resumen_caja()
returns jsonb
language sql
stable
set search_path = public
as $$
  with i as (
    select fecha, monto, medio from ingresos where lubricentro_id = mi_lubricentro_id()
  ), e as (
    select fecha, monto, medio from egresos where lubricentro_id = mi_lubricentro_id()
  ), medios(medio) as (
    select unnest(array['efectivo', 'transferencia', 'tarjeta', 'otro'])
  )
  select jsonb_build_object(
    'hoy', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha = current_date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha = current_date), 0)
    ),
    'semana', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha >= date_trunc('week', current_date)::date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha >= date_trunc('week', current_date)::date), 0)
    ),
    'mes', jsonb_build_object(
      'ingresos', coalesce((select sum(monto) from i where fecha >= date_trunc('month', current_date)::date), 0),
      'egresos',  coalesce((select sum(monto) from e where fecha >= date_trunc('month', current_date)::date), 0)
    ),
    -- Arqueo de hoy: neto por medio (lo que entró menos lo que salió en
    -- ese medio). El efectivo neto es lo que tendría que haber en el cajón.
    'arqueo_hoy', (
      select jsonb_object_agg(m.medio, jsonb_build_object(
        'ingresos', coalesce((select sum(monto) from i where i.medio = m.medio and i.fecha = current_date), 0),
        'egresos',  coalesce((select sum(monto) from e where e.medio = m.medio and e.fecha = current_date), 0)
      ))
      from medios m
    )
  );
$$;

comment on function resumen_caja is
  'La caja del tenant de la sesión: ingresos y egresos de hoy/semana/mes, y el arqueo (por medio) de hoy. En la base, para que el front no sume plata. El RLS recorta al tenant.';

revoke all on function resumen_caja() from public, anon;
grant execute on function resumen_caja() to authenticated;


-- ---------- 7 · La vista unificada de movimientos ----------
-- Para la lista de "El día": ingresos y egresos en una sola consulta
-- ordenable y paginable. security_invoker: el RLS de las tablas base
-- recorta al tenant (un superadmin ve todo: filtrar en la consulta).
create view vista_movimientos_caja
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
    i.created_at
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
    e.created_at
  from egresos e
  join sucursales s on s.id = e.sucursal_id;

comment on view vista_movimientos_caja is
  'Ingresos y egresos unificados para la lista de la caja, con tipo e importe en positivo (el signo lo pone la pantalla). security_invoker: hereda el RLS de las tablas base.';
