-- ============================================================
-- Fidelli Motors · Finanzas — Nivel 1: "El día" (ingresos)
--
-- Un REGISTRO DE INGRESOS para que el dueño vea cuánta plata entró hoy,
-- esta semana y este mes. Nada más. Es la primera vez que un importe
-- vive FUERA del presupuesto, y se cruza esa frontera a propósito — con
-- la misma disciplina con la que presupuestos y productos la respetaron.
--
-- LO QUE NO ES, grabado acá para que nadie lo "complete" después:
--   · NO es facturación. Sin IVA, sin comprobante, sin numeración
--     fiscal, sin CAE. La regla 6 sigue en pie.
--   · NO es contabilidad. Sin COSTO, sin rentabilidad, sin medios de
--     pago, sin estados cobrado/pendiente, sin arqueo, sin fiados. Todo
--     eso es Nivel 2/3 — "otro producto", como dice la frontera de
--     productos. El día que entre, se discute en un bloque nuevo.
--   · El modelo operativo (services, items, trabajos) SIGUE sin un solo
--     numérico de plata. Un ingreso no se cuelga de un trabajo: se cuelga,
--     opcionalmente, de un presupuesto (la plata ya vivía ahí) o se carga
--     a mano. Esa frontera no se mueve.
--
-- MÓDULO PAGO, molde `neumaticos`: 'finanzas' entra al catálogo de
-- features para que plan_permite() lo resuelva, NO figura en el `features`
-- de ningún plan, y se prende por tenant con el override de /fidelli. Su
-- precio vive en `modulos` y entra al monto de renovación solo.
-- ============================================================


-- ---------- 1 · El catálogo de features: + 'finanzas' ----------
-- create or replace sobre la fuente de verdad ejecutable. El espejo tipado
-- va en lib/planes.ts, en el MISMO PR.
-- >>> catalogo_features_plan
create or replace function catalogo_features_plan()
returns text[] language sql immutable as $$
  select array[
    'mecanica', 'pendientes', 'premios',
    'presupuestos', 'personalizacion_pagina', 'pagina_premium',
    -- Módulo pago aparte del plan. No va en el features de ningún plan.
    'neumaticos',
    -- El service de caja automática: por tenant, con el override, SIN
    -- costo (no es un módulo: no tiene fila en `modulos`). Tampoco va en
    -- el features de ningún plan.
    'caja', -- @feature-caja
    -- Finanzas: MÓDULO PAGO, como `neumaticos`. Tiene fila en `modulos`
    -- (entra al monto) y se prende por tenant con el override. No va en el
    -- features de ningún plan.
    'finanzas'
  ];
$$;
-- <<< catalogo_features_plan

comment on function catalogo_features_plan is
  'El catálogo canónico de features. Su espejo tipado está en lib/planes.ts. ''neumaticos'' y ''finanzas'' son MÓDULOS PAGOS y ''caja'' una feature sin costo: las tres están acá para que plan_permite() las resuelva, pero no figuran en el features de ningún plan — se habilitan por tenant con el override.';


-- ---------- 2 · El precio del módulo ----------
-- $15.000 mensuales, valor semilla. Santiago/Gregorio lo mueven desde
-- /fidelli → Plan y precios con fijar_precio_modulo() (motivo + auditoría).
-- `codigo` = el valor de ModuloPago en lib/planes.ts. Si no coinciden, el
-- monto sale en cero y en silencio: lo vigila R20a.
insert into modulos (codigo, nombre, precio_mensual) values
  ('finanzas', 'Módulo Finanzas', 15000);


-- ---------- 3 · La tabla ----------
create table ingresos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  sucursal_id     uuid not null references sucursales(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  -- El día del ingreso, en hora argentina (el rol ya corre en
  -- America/Argentina/Buenos_Aires): current_date = hoy del mostrador.
  fecha           date not null default current_date,
  monto           numeric(12,2) not null check (monto >= 0),
  -- Qué entró, en texto libre. Si el ingreso nace de un presupuesto, el
  -- concepto puede arrancar con su número; igual se guarda el enlace.
  concepto        text not null,
  -- Enlaces OPCIONALES. set null: el ingreso sobrevive a lo que le pase a
  -- la ficha o al presupuesto — es el registro de que la plata entró.
  presupuesto_id  uuid references presupuestos(id) on delete set null,
  cliente_id      uuid references clientes(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint concepto_no_vacio check (char_length(trim(concepto)) >= 2)
);

create index ingresos_lubricentro_fecha_idx
  on ingresos (lubricentro_id, fecha desc);

-- Un presupuesto se cobra UNA vez: el índice parcial lo hace cumplir sin
-- bloquear los ingresos a mano (presupuesto_id null no entra al unique).
create unique index ingresos_presupuesto_unico_idx
  on ingresos (presupuesto_id) where presupuesto_id is not null;

comment on table ingresos is
  'Registro de ingresos del lubricentro (módulo Finanzas, Nivel 1). NO es facturación ni contabilidad: sin IVA, sin costo, sin medios de pago, sin estados. Un importe vive acá o en un presupuesto; el modelo operativo sigue sin plata.';
comment on column ingresos.presupuesto_id is
  'Si el ingreso nació de "Marcar como cobrado" en un presupuesto, su id. Único parcial: un presupuesto se cobra una sola vez. Null = ingreso cargado a mano.';


-- ---------- 4 · RLS: patrón de tenant + gating por módulo ----------
alter table ingresos enable row level security;

-- Lectura: el tenant ve lo suyo; el superadmin ve todo (y filtra en la
-- consulta, regla del multi-tenant invertido de /fidelli).
create policy ingresos_lectura on ingresos for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));

-- Alta: el gating del módulo va en el WITH CHECK, NUNCA en el USING
-- (regla de oro: se apaga la escritura, no la lectura; un tenant que
-- pierde el módulo sigue viendo lo que cargó).
create policy ingresos_alta on ingresos for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

create policy ingresos_edicion on ingresos for update to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()))
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

-- Sin delete para el owner: un ingreso errado se edita. Solo el superadmin
-- borra (misma política que presupuestos).
create policy ingresos_borrado on ingresos for delete to authenticated
  using ((select soy_superadmin()));


-- ---------- 5 · Guardar un ingreso ----------
-- Invoker, igual que guardar_presupuesto: el RLS impone tenant y módulo.
-- La sesión pone el lubricentro y el autor; el cliente no los manda.
create or replace function guardar_ingreso(
  p_sucursal_id    uuid,
  p_monto          numeric,
  p_concepto       text,
  p_fecha          date default current_date,
  p_presupuesto_id uuid default null,
  p_cliente_id     uuid default null
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
    presupuesto_id, cliente_id
  ) values (
    v_lubricentro, p_sucursal_id, auth.uid(), coalesce(p_fecha, current_date),
    p_monto, v_concepto, p_presupuesto_id, p_cliente_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function guardar_ingreso is
  'Registra un ingreso. Invoker: el RLS impone el tenant y el módulo. El lubricentro y el autor salen de la sesión. Si viene p_presupuesto_id, el único parcial evita cobrarlo dos veces.';

revoke all on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid) from public, anon;
grant execute on function guardar_ingreso(uuid, numeric, text, date, uuid, uuid) to authenticated;


-- ---------- 6 · El resumen: hoy / semana / mes ----------
-- Los totales del Inicio del módulo, calculados en la base (números del
-- lado del servidor, no del front). Stable + invoker: el RLS recorta al
-- tenant. La semana arranca el lunes (date_trunc 'week' en Postgres).
create or replace function resumen_ingresos()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'hoy',    coalesce(sum(monto) filter (where fecha = current_date), 0),
    'semana', coalesce(sum(monto) filter (where fecha >= date_trunc('week',  current_date)::date), 0),
    'mes',    coalesce(sum(monto) filter (where fecha >= date_trunc('month', current_date)::date), 0)
  )
  from ingresos
  where lubricentro_id = mi_lubricentro_id();
$$;

comment on function resumen_ingresos is
  'Totales de ingresos del tenant de la sesión: hoy, esta semana (desde el lunes) y este mes. En la base, para que el front no sume plata. El RLS recorta al tenant.';

revoke all on function resumen_ingresos() from public, anon;
grant execute on function resumen_ingresos() to authenticated;
