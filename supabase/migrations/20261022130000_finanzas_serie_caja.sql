-- ============================================================
-- Fidelli Motors · Finanzas — la serie de la caja para el gráfico
--
-- La evolución de ingresos y egresos en el tiempo, TODAS las
-- granularidades de una vez, para el gráfico de "El día" (mismo patrón
-- que resumen_inicio: una consulta por pantalla, el toggle cambia de
-- serie al instante sin viaje al servidor).
--
-- Cada punto es {inicio: date, ingresos, egresos}. El neto lo arma el
-- front (ingresos − egresos). Se recorta al primer movimiento del tenant,
-- como las series de services: un eje lleno de ceros miente la tendencia.
--
-- Invoker + stable: el RLS de ingresos/egresos recorta al tenant solo,
-- como en resumen_inicio (no se filtra por lubricentro_id a mano).
-- ============================================================
create or replace function serie_caja()
returns jsonb
language sql
stable
set search_path = public
as $$
  with primer as (
    select min(f) as fecha from (
      select min(fecha) as f from ingresos
      union all
      select min(fecha) as f from egresos
    ) z
  )
  select coalesce(jsonb_object_agg(g.clave, serie.datos), '{}'::jsonb)
  from (values
    ('semana',    'week',    interval '1 week',   12),
    ('mes',       'month',   interval '1 month',  12),
    ('trimestre', 'quarter', interval '3 months',  8),
    -- 1000 = "sin tope": el greatest() recorta al primer movimiento.
    ('anio',      'year',    interval '1 year', 1000)
  ) as g(clave, unidad, paso, pasos)
  cross join lateral (
    select case
      when (select fecha from primer) is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'inicio', p.inicio,
            'ingresos', (
              select coalesce(sum(monto), 0) from ingresos i
              where i.fecha >= p.inicio and i.fecha < (p.inicio + g.paso)::date
            ),
            'egresos', (
              select coalesce(sum(monto), 0) from egresos e
              where e.fecha >= p.inicio and e.fecha < (p.inicio + g.paso)::date
            )
          )
          order by p.inicio)
        from (
          select generate_series(
            greatest(
              (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
              date_trunc(g.unidad, (select fecha from primer))::date
            ),
            date_trunc(g.unidad, current_date)::date,
            g.paso)::date as inicio
        ) p
      ), '[]'::jsonb)
    end as datos
  ) serie;
$$;

comment on function serie_caja is
  'Series de ingresos y egresos por período (semana/mes/trimestre/año) para el gráfico de la caja. Cada punto {inicio, ingresos, egresos}; el neto lo arma el front. RLS recorta al tenant.';

revoke all on function serie_caja() from public, anon;
grant execute on function serie_caja() to authenticated;
