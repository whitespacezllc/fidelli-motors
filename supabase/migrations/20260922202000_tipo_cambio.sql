-- ════════════════════════════════════════════════════════════════════
-- TIPO_CAMBIO · la cotización oficial, un registro por día
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 1 "MRR en USD" y § 4)
--
-- No había tipo de cambio en ningún lado: todos los montos son numeric sin
-- moneda y el "MRR en USD" no existía (docs/ADMIN-INVENTARIO.md § 4.6 iii).
-- Acá vive, un registro por día calendario, con la fuente escrita.
--
-- NUNCA SE INVENTA UN VALOR. Si el día no tiene fuente, el cierre repite el
-- último conocido y lo dice: fuente = 'repetido'. La fila cuenta de dónde
-- salió el número y eso no se pierde.
-- ════════════════════════════════════════════════════════════════════

create table tipo_cambio (
  fecha      date primary key,
  compra     numeric(12,4) check (compra is null or compra > 0),
  venta      numeric(12,4) not null check (venta > 0),
  fuente     text not null,
  created_at timestamptz not null default now()
);

comment on table tipo_cambio is
  'La cotización oficial ARS/USD por día (docs/METRICAS.md § 4). La escribe el cierre diario (cerrar_dia) y scripts/backfill-tc.mjs. fuente = de dónde salió: dolarapi.com/oficial, argentinadatos.com/oficial, repetido (el último conocido, cuando no hubo fuente ese día), manual.';

alter table tipo_cambio enable row level security;

create policy tipo_cambio_lectura on tipo_cambio
  for select to authenticated using (soy_superadmin());

revoke all on table tipo_cambio from anon;
revoke insert, update, delete, truncate, references, trigger on table tipo_cambio from authenticated;


-- El registro vigente a una fecha: el más reciente con fecha <= p_fecha.
-- Devuelve la fila entera (o null). Security invoker: con el RLS de quien
-- llama; service_role y postgres ven todo, un superadmin también.

-- >>> tc_vigente
create or replace function tc_vigente(p_fecha date)
returns tipo_cambio
language sql
stable
set search_path = public
as $$
  select t
    from tipo_cambio t
   where t.fecha <= p_fecha
   order by t.fecha desc
   limit 1;
$$;
-- <<< tc_vigente

comment on function tc_vigente is
  'El tipo de cambio vigente a una fecha: el registro con fecha <= p_fecha más reciente, o null si no hay ninguno (docs/METRICAS.md § 4).';

revoke all on function tc_vigente(date) from public, anon;
grant execute on function tc_vigente(date) to authenticated, service_role;
