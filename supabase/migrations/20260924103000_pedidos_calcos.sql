-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 3 · pedidos de calcos
--
-- docs/METRICAS.md § 1 «Pedido de calcos»: cada entrega de calcos a un
-- tenant, con cantidad, si estaban incluidas en el plan o se cobraron, el
-- monto y la fecha. Hasta acá lo único que había era el contador
-- `lubricentros.calcos_entregadas`, que se editaba a mano desde el dialog
-- Editar y no decía ni cuándo ni cuántas veces.
--
-- Desde ahora EL CONTADOR ES LA SUMA DE LOS PEDIDOS: `registrar_pedido_calcos()`
-- inserta la fila y recalcula la columna, y el trigger de siempre
-- (tenant_evento_tras_update_lubricentro) deja el evento `calcos`. La regla
-- del slug inmutable con calcos > 0 no cambia. El campo del dialog pasa a
-- solo lectura.
--
-- Append-only con los tres candados de tenant_eventos (edición, borrado,
-- purga, en `enable always`): es la constancia de qué se le entregó y qué
-- se le cobró a cada lubricentro.
-- ════════════════════════════════════════════════════════════════════

create table pedidos_calcos (
  id              uuid primary key default gen_random_uuid(),
  -- cascade + candado condicional, como tenant_eventos: la fila no se borra
  -- mientras el tenant exista; solo se va con él (las pruebas de la red
  -- borran tenants de prueba).
  lubricentro_id  uuid not null references lubricentros(id) on delete cascade,
  fecha           date not null,
  cantidad        integer not null check (cantidad > 0),
  -- true = dentro del plan; false = se cobraron.
  incluidas       boolean not null,
  monto_ars       numeric(12,2) check (monto_ars is null or monto_ars >= 0),
  nota            text,
  registrado_por  uuid references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now(),

  constraint cobradas_con_monto check (incluidas or monto_ars is not null)
);

create index pedidos_calcos_tenant on pedidos_calcos (lubricentro_id, fecha desc);

comment on table pedidos_calcos is
  'Cada entrega de calcos a un tenant (bloque MÉTRICAS 3): cantidad, incluidas o cobradas, monto en ARS, fecha. Append-only con tres candados. lubricentros.calcos_entregadas es la suma de estas filas.';

-- ---------- Los tres candados ----------

-- >>> bloquear_edicion_de_pedido_calcos
create or replace function bloquear_edicion_de_pedido_calcos()
returns trigger
language plpgsql
as $$
begin
  raise exception 'pedido_calcos_no_se_edita'                          -- @candado_edicion_calcos
    using hint = 'Un pedido de calcos es una entrega que ya pasó. Si se cargó mal, se registra otro '
                 'pedido que lo corrija (la cantidad puede ser la diferencia) con la nota que lo explique.';
  return old;
end;
$$;
-- <<< bloquear_edicion_de_pedido_calcos

-- >>> bloquear_borrado_de_pedido_calcos
create or replace function bloquear_borrado_de_pedido_calcos()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from lubricentros where id = old.lubricentro_id) then   -- @candado_borrado_calcos
    raise exception 'pedido_calcos_no_se_borra'
      using hint = 'Los pedidos de calcos no se borran mientras el lubricentro exista: son la '
                   'constancia de qué se le entregó y qué se le cobró.';
  end if;
  return old;
end;
$$;
-- <<< bloquear_borrado_de_pedido_calcos

-- >>> bloquear_purga_de_pedidos_calcos
create or replace function bloquear_purga_de_pedidos_calcos()
returns trigger
language plpgsql
as $$
begin
  raise exception 'pedidos_calcos_no_se_vacian'                        -- @candado_purga_calcos
    using hint = 'Si necesitás una base limpia para probar, usá supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_pedidos_calcos

create trigger candado_edicion_pedido_calcos
  before update on pedidos_calcos
  for each row execute function bloquear_edicion_de_pedido_calcos();
create trigger candado_borrado_pedido_calcos
  before delete on pedidos_calcos
  for each row execute function bloquear_borrado_de_pedido_calcos();
create trigger candado_purga_pedidos_calcos
  before truncate on pedidos_calcos
  for each statement execute function bloquear_purga_de_pedidos_calcos();

alter table pedidos_calcos enable always trigger candado_edicion_pedido_calcos;
alter table pedidos_calcos enable always trigger candado_borrado_pedido_calcos;
alter table pedidos_calcos enable always trigger candado_purga_pedidos_calcos;

-- ---------- RLS: solo superadmin lee; escribe la función ----------
alter table pedidos_calcos enable row level security;

create policy pedidos_calcos_lectura on pedidos_calcos
  for select to authenticated using (soy_superadmin());

grant select on pedidos_calcos to authenticated;
revoke insert, update, delete, truncate, references, trigger on pedidos_calcos from authenticated;
grant all on pedidos_calcos to service_role;

-- ---------- La puerta ----------

-- >>> registrar_pedido_calcos
create or replace function registrar_pedido_calcos(
  p_lubricentro_id uuid,
  p_fecha          date,
  p_cantidad       integer,
  p_incluidas      boolean,
  p_monto          numeric default null,
  p_nota           text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli registra pedidos de calcos' using errcode = '42501';
  end if;
  if not exists (select 1 from lubricentros where id = p_lubricentro_id) then
    raise exception 'no_existe' using hint = 'Ese lubricentro no existe.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad_invalida' using hint = 'La cantidad tiene que ser mayor que cero.';
  end if;
  if p_fecha is null or p_fecha > current_date then
    raise exception 'fecha_futura' using hint = 'La fecha del pedido no puede ser posterior a hoy.';
  end if;
  if not p_incluidas and p_monto is null then
    raise exception 'monto_obligatorio' using hint = 'Si las calcos se cobraron, hay que decir cuánto.';
  end if;

  insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, monto_ars, nota, registrado_por)
  values (p_lubricentro_id, p_fecha, p_cantidad, p_incluidas,
          case when p_incluidas then null else round(p_monto, 2) end,
          nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;

  -- El contador es la suma. Este update dispara el evento `calcos`.
  update lubricentros l
     set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0)              -- @suma_calcos
                                from pedidos_calcos pc
                               where pc.lubricentro_id = p_lubricentro_id)
   where l.id = p_lubricentro_id;

  return v_id;
end;
$$;
-- <<< registrar_pedido_calcos

comment on function registrar_pedido_calcos is
  'Registra una entrega de calcos y deja lubricentros.calcos_entregadas igual a la suma de los pedidos del tenant (bloque MÉTRICAS 3). Con cobradas, el monto es obligatorio. Solo superadmin.';

-- ---------- El backfill del contador ----------
-- Una fila por tenant con calcos_entregadas > 0 y sin ningún pedido:
-- cantidad = el contador, incluidas, fecha = el alta, con la nota que dice
-- de dónde salió. Idempotente: un tenant que ya tiene pedidos no se toca.
-- Corre acá y otra vez en seed.sql, porque el demo nace después de las
-- migraciones.
create or replace function backfill_pedidos_calcos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, monto_ars, nota, registrado_por)
  select l.id, l.created_at::date, l.calcos_entregadas, true, null, 'backfill del contador', null
  from lubricentros l
  where l.calcos_entregadas > 0
    and not exists (select 1 from pedidos_calcos pc where pc.lubricentro_id = l.id);
  get diagnostics v_n = row_count;
  raise notice 'backfill pedidos_calcos · filas: %', v_n;
  return v_n;
end;
$$;

revoke all on function backfill_pedidos_calcos() from public, anon, authenticated;
grant execute on function backfill_pedidos_calcos() to service_role;

select backfill_pedidos_calcos();

-- ---------- Permisos ----------
revoke all on function registrar_pedido_calcos(uuid, date, integer, boolean, numeric, text) from public, anon;
grant execute on function registrar_pedido_calcos(uuid, date, integer, boolean, numeric, text) to authenticated, service_role;
