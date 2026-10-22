-- ============================================================
-- Fidelli Motors · Finanzas — Nivel 2B: cuenta corriente (fiados)
--
-- Lleva la DEUDA por cliente: quién debe cuánto, y los cobros (totales o
-- parciales) que la van saldando.
--
-- LA IDEA, grabada para que no se desarme después:
--   · Una DEUDA (un fiado) es plata que te deben: NO entró a la caja. Por
--     eso crear un fiado no crea ningún ingreso.
--   · COBRAR un fiado —total o parcial— SÍ es plata que entra: cada cobro
--     es un `ingreso` con `deuda_id`. Así la cuenta corriente y la caja
--     ("El día") quedan consistentes sin duplicar un peso.
--   · SALDO de una deuda = monto − suma de sus cobros. No se guarda: se
--     calcula (mismo criterio que el total del presupuesto).
--
-- Un fiado va SIEMPRE contra un cliente con ficha (cliente_id not null):
-- la cuenta corriente se lleva por cliente, no por un nombre suelto.
--
-- Sigue sin ser facturación ni contabilidad: sin intereses, sin
-- vencimientos, sin mora. Es la libreta del fiado, digital.
-- ============================================================


-- ---------- 1 · La tabla de deudas ----------
create table deudas (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- cascade: la purga de un tenant borra sus clientes y con ellos sus
  -- deudas. En la operación normal un cliente no se borra (se anonimiza).
  cliente_id      uuid not null references clientes(id) on delete cascade,
  sucursal_id     uuid not null references sucursales(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  fecha           date not null default current_date,
  monto           numeric(12,2) not null check (monto > 0),
  concepto        text not null,
  presupuesto_id  uuid references presupuestos(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint deuda_concepto_no_vacio check (char_length(trim(concepto)) >= 2)
);

create index deudas_lubricentro_cliente_idx
  on deudas (lubricentro_id, cliente_id, fecha desc);

-- Un presupuesto se fía una sola vez (igual que se cobra una sola vez).
create unique index deudas_presupuesto_unico_idx
  on deudas (presupuesto_id) where presupuesto_id is not null;

comment on table deudas is
  'Fiados: plata que un cliente debe. NO es un ingreso (no entró a la caja). El saldo se calcula contra los cobros (ingresos con deuda_id). Siempre contra un cliente con ficha.';


-- ---------- 2 · El cobro de un fiado vive en `ingresos` ----------
-- Un cobro de fiado es plata que entra: es un ingreso, con el fiado que
-- salda apuntado. set null: si se borra la deuda, el ingreso queda (la
-- plata entró igual), solo pierde el vínculo.
alter table ingresos
  add column deuda_id uuid references deudas(id) on delete set null;

comment on column ingresos.deuda_id is
  'Si el ingreso es el cobro de un fiado, la deuda que salda (total o parcial). Null = ingreso normal.';


-- ---------- 3 · RLS: patrón de tenant + gating por módulo ----------
alter table deudas enable row level security;

create policy deudas_lectura on deudas for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));

create policy deudas_alta on deudas for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

create policy deudas_edicion on deudas for update to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()))
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

create policy deudas_borrado on deudas for delete to authenticated
  using ((select soy_superadmin()));


-- ---------- 4 · Registrar un fiado ----------
create or replace function guardar_deuda(
  p_cliente_id     uuid,
  p_sucursal_id    uuid,
  p_monto          numeric,
  p_concepto       text,
  p_fecha          date default current_date,
  p_presupuesto_id uuid default null
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
    raise exception 'deuda_sin_concepto';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'deuda_monto_invalido';
  end if;

  -- El cliente tiene que ser de ESTE tenant: la FK solo garantiza que
  -- existe, no de quién es.
  if not exists (
    select 1 from clientes
    where id = p_cliente_id and lubricentro_id = v_lubricentro
  ) then
    raise exception 'deuda_cliente_ajeno';
  end if;

  insert into deudas (
    lubricentro_id, cliente_id, sucursal_id, usuario_id, fecha, monto,
    concepto, presupuesto_id
  ) values (
    v_lubricentro, p_cliente_id, p_sucursal_id, auth.uid(),
    coalesce(p_fecha, current_date), p_monto, v_concepto, p_presupuesto_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function guardar_deuda is
  'Registra un fiado contra un cliente del tenant. Invoker: el RLS impone tenant y módulo. No crea ingreso: la plata todavía no entró.';

revoke all on function guardar_deuda(uuid, uuid, numeric, text, date, uuid) from public, anon;
grant execute on function guardar_deuda(uuid, uuid, numeric, text, date, uuid) to authenticated;


-- ---------- 5 · Cobrar un fiado (total o parcial) ----------
-- El cobro es un ingreso con deuda_id. Valida contra el saldo vivo para no
-- cobrar de más ni cobrar una deuda ya saldada.
create or replace function cobrar_deuda(
  p_deuda_id uuid,
  p_monto    numeric,
  p_medio    text default 'efectivo',
  p_fecha    date default current_date
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_deuda       deudas%rowtype;
  v_saldo       numeric;
  v_nombre      text;
  v_id          uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  select * into v_deuda from deudas where id = p_deuda_id;
  if not found or v_deuda.lubricentro_id <> v_lubricentro then
    raise exception 'deuda_inexistente';
  end if;

  v_saldo := v_deuda.monto
    - coalesce((select sum(monto) from ingresos where deuda_id = p_deuda_id), 0);

  if v_saldo <= 0 then
    raise exception 'deuda_saldada';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'cobro_monto_invalido';
  end if;
  if p_monto > v_saldo then
    raise exception 'cobro_excede_saldo';
  end if;

  select nombre into v_nombre from clientes where id = v_deuda.cliente_id;

  insert into ingresos (
    lubricentro_id, sucursal_id, usuario_id, fecha, monto, concepto,
    cliente_id, deuda_id, medio
  ) values (
    v_lubricentro, v_deuda.sucursal_id, auth.uid(),
    coalesce(p_fecha, current_date), p_monto,
    'Pago cuenta: ' || coalesce(v_nombre, 'cliente'),
    v_deuda.cliente_id, p_deuda_id, coalesce(p_medio, 'efectivo')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function cobrar_deuda is
  'Cobra un fiado (total o parcial): inserta un ingreso con deuda_id. Valida contra el saldo vivo. La plata entra a la caja por este camino.';

revoke all on function cobrar_deuda(uuid, numeric, text, date) from public, anon;
grant execute on function cobrar_deuda(uuid, numeric, text, date) to authenticated;


-- ---------- 6 · Las vistas de la cuenta corriente ----------
-- Por deuda: con lo cobrado y el saldo vivo. security_invoker: hereda el
-- RLS de las tablas base.
create view vista_deudas
with (security_invoker = true) as
  select
    d.id,
    d.lubricentro_id,
    d.cliente_id,
    c.nombre as cliente_nombre,
    d.sucursal_id,
    d.fecha,
    d.concepto,
    d.monto,
    d.presupuesto_id,
    d.created_at,
    coalesce((select sum(i.monto) from ingresos i where i.deuda_id = d.id), 0) as cobrado,
    d.monto - coalesce((select sum(i.monto) from ingresos i where i.deuda_id = d.id), 0) as saldo
  from deudas d
  join clientes c on c.id = d.cliente_id;

comment on view vista_deudas is
  'Cada fiado con lo cobrado y el saldo vivo (monto − cobros). security_invoker: hereda el RLS de deudas/ingresos/clientes.';

-- Por cliente: el saldo total que debe. La lista de "quién debe".
create view vista_saldos_cliente
with (security_invoker = true) as
  select
    cliente_id,
    cliente_nombre,
    lubricentro_id,
    sum(monto)   as total,
    sum(cobrado) as cobrado,
    sum(saldo)   as saldo
  from vista_deudas
  group by cliente_id, cliente_nombre, lubricentro_id;

comment on view vista_saldos_cliente is
  'Saldo por cliente (suma de sus fiados). La lista de quién debe: filtrar saldo > 0.';
