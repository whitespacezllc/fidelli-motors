-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 2 · lo que leen el Resumen y el listado de /fidelli
--
-- El bloque 1 (20260922200000…205000) dejó los cimientos: eventos,
-- snapshots, `es_activo()`, `mrr_de_tenant()`, `mrr_plataforma()`. Este
-- archivo agrega las lecturas que las pantallas nuevas necesitan y NO
-- modifica ninguna de esas funciones ni `listado_lubricentros()` ni
-- `cobranzas_pendientes()`: todo lo nuevo va AL LADO y se consume junto.
--
--   · `metricas_plataforma()`  — se REDEFINE (es la única existente que se
--                                toca): cuenta trabajos de cualquier tipo,
--                                no solo `service`. docs/METRICAS.md § 1:
--                                "services del mes" ya no existe como
--                                nombre. Sus claves cambian de nombre.
--   · `salud_tenants()`        — la salud de cada tenant, EN SQL, con la
--                                exención resuelta por `estado_atencion()`
--                                (una sola regla del 100%). Reemplaza a
--                                lib/fidelli/salud.ts, que la calculaba en
--                                el navegador con una copia de esa regla.
--   · `trabajos_semanales()`   — las últimas N semanas de trabajos de
--                                todos los tenants en UNA consulta, para el
--                                sparkline del listado. Nunca por fila.
--   · `indicadores_tenants()`  — por tenant: activo, exento, estado del
--                                reloj, MRR, módulo pago o bonificado,
--                                trabajos de 30 días y último trabajo.
--   · `resumen_admin()`        — los cinco números del Resumen con su
--                                comparación, y los conteos de las alertas.
--
-- Todas son `security invoker` con guarda `soy_superadmin()`: a un owner le
-- contestan 42501 antes de leer nada (regla 12 de CLAUDE.md, y R32a lo
-- prueba). Como invoker, el RLS —que a un superadmin le abre todo— es la
-- segunda capa.
--
-- ⚠ Las líneas marcadas `-- @algo` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-metricas.sh los
-- muerde con sed para romper cada regla a propósito (regla 13).
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · metricas_plataforma() — trabajos de cualquier tipo
-- ════════════════════════════════════════════════════════════════════
--
-- Mismo contrato de series (día × 30, semana × 12, mes × 12), pero sin el
-- filtro `tipo = 'service'` que tenía desde 20260822210000. Las claves
-- `services_mes`, `mecanicas_*` y `primer_service` se van; el único
-- consumidor es app/fidelli/page.tsx y cambia en el mismo PR.

-- >>> metricas_plataforma
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_primero date;
  v_series  jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función mira `tipo`.
  select min(fecha) into v_primero
  from services where not anulado;

  if v_primero is null then
    v_series := jsonb_build_object(
      'dia', '[]'::jsonb, 'semana', '[]'::jsonb, 'mes', '[]'::jsonb);
  else
    select jsonb_object_agg(g.clave, serie.datos)
      into v_series
      from (values
        ('dia',    'day',   interval '1 day',   30),
        ('semana', 'week',  interval '1 week',  12),
        ('mes',    'month', interval '1 month', 12)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select coalesce((
          select jsonb_agg(
            jsonb_build_object('inicio', p.inicio, 'cantidad', (
              select count(*)::integer from services s
              where not s.anulado                                    -- @serie_todos
                and s.fecha >= p.inicio
                and s.fecha < (p.inicio + g.paso)::date
            ))
            order by p.inicio)
          from (
            select generate_series(
              greatest(
                (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                date_trunc(g.unidad, v_primero)::date
              ),
              date_trunc(g.unidad, current_date)::date,
              g.paso)::date as inicio
          ) p
        ), '[]'::jsonb) as datos
      ) serie;
  end if;

  return jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and fecha >= date_trunc('month', current_date)),
    'acumulado', (select count(*) from services where not anulado),
    'primer_trabajo', v_primero,
    'series', v_series
  );
end;
$$;
-- <<< metricas_plataforma

comment on function metricas_plataforma is
  'El pulso de la plataforma para /fidelli: trabajos del mes, acumulado histórico y las tres series (día × 30, semana × 12, mes × 12). Desde 20260923100000 cuenta trabajos DE CUALQUIER TIPO (docs/METRICAS.md § 1); antes solo `service`. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 2 · salud_tenants() — la salud, en SQL y con UNA regla de exención
-- ════════════════════════════════════════════════════════════════════
--
-- La salud contesta "¿a quién tengo que prestarle atención hoy?" y cruza
-- dos ejes con la plata mandando: si el cobro está vencido, no importa
-- cuánto cargue; con la plata en orden, la señal es si está trabajando.
--
-- LA EXENCIÓN NO SE REPITE ACÁ. Si el tenant está vencido lo decide
-- `estado_atencion()`, que ya exime al 100% (R24) — es la misma función
-- que pinta la columna de atención y el bloque de aviso de la ficha, así
-- que la salud y la atención no pueden contradecirse en la misma fila.
-- La versión de TypeScript que esto reemplaza tenía una COPIA de esa
-- regla (`descuentoPct >= 100`), y una copia es la forma en que la
-- próxima corrección le llega a una y no a la otra.
--
-- Cortes de actividad, en días desde el último trabajo (de cualquier
-- tipo): hasta 3 al día · hasta 7 actividad baja · más, sin actividad.
-- Un tenant suspendido a mano o cancelado no tiene salud: no es trabajo
-- de hoy, y el listado ya lo dice en la columna de estado.

-- >>> salud_tenants
create or replace function salud_tenants()
returns table (
  lubricentro_id uuid,
  -- 'cobro_vencido' · 'al_dia' · 'actividad_baja' · 'sin_actividad' · null
  salud          text,
  -- La oración que acompaña al chip: «venció hace 4 días», «3 trabajos en
  -- 7 días», «sin trabajos hace 9 días», «nunca cargó un trabajo».
  motivo         text,
  ultimo_trabajo date
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then                                          -- @guarda_salud
    raise exception 'Solo el equipo Fidelli puede ver la salud de los tenants'
      using errcode = '42501';
  end if;

  return query
  with vigente as (
    -- La suscripción vigente, con el criterio de todo el repo.
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      max(sv.fecha) as ultimo,
      count(*) filter (where sv.fecha >= current_date - 6)::integer as en_7_dias
    from services sv
    where not sv.anulado
    group by sv.lubricentro_id
  ),
  base as (
    select
      l.id,
      l.activo,
      v.estado,
      v.vencimiento,
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion,
      a.ultimo,
      coalesce(a.en_7_dias, 0) as en_7_dias,
      (current_date - a.ultimo) as dias
    from lubricentros l
    left join vigente   v on v.lubricentro_id = l.id
    left join actividad a on a.lubricentro_id = l.id
  )
  select
    b.id,
    case
      when not b.activo or b.estado = 'cancelada' then null
      when b.atencion in ('trial_vencido', 'cobranza_vencida') then 'cobro_vencido'   -- @cobro_por_atencion
      when b.ultimo is null then 'sin_actividad'
      when b.dias <= 3 then 'al_dia'                                    -- @corte_al_dia
      when b.dias <= 7 then 'actividad_baja'                            -- @corte_baja
      else 'sin_actividad'
    end,
    case
      when not b.activo or b.estado = 'cancelada' then null
      when b.atencion = 'trial_vencido' then
        'trial terminado ' || case when current_date - b.vencimiento = 1 then 'ayer'
                                   else 'hace ' || (current_date - b.vencimiento) || ' días' end
      when b.atencion = 'cobranza_vencida' then
        'venció ' || case when current_date - b.vencimiento = 1 then 'ayer'
                          else 'hace ' || (current_date - b.vencimiento) || ' días' end
      when b.ultimo is null then 'nunca cargó un trabajo'
      when b.dias <= 3 then
        b.en_7_dias || case when b.en_7_dias = 1 then ' trabajo en 7 días' else ' trabajos en 7 días' end
      when b.dias <= 7 then
        'último trabajo ' || case when b.dias = 1 then 'ayer' else 'hace ' || b.dias || ' días' end
      else 'sin trabajos hace ' || b.dias || ' días'
    end,
    b.ultimo
  from base b;
end;
$$;
-- <<< salud_tenants

comment on function salud_tenants is
  'La salud de cada tenant para el listado de /fidelli (bloque MÉTRICAS 2): cobro_vencido si estado_atencion() lo tiene vencido (la exención del 100% vive SOLO ahí), y si no, por días desde el último trabajo de cualquier tipo: ≤3 al_dia · ≤7 actividad_baja · más sin_actividad. Null para suspendidos a mano y cancelados. Solo superadmin (42501 si no). Reemplaza a lib/fidelli/salud.ts.';


-- ════════════════════════════════════════════════════════════════════
-- 3 · trabajos_semanales() — el sparkline, en una consulta
-- ════════════════════════════════════════════════════════════════════
--
-- Semanas ISO (lunes a domingo) por `services.fecha`, las últimas
-- p_semanas incluida la que está corriendo, para TODOS los tenants de una
-- vez (o para uno, si viene p_lubricentro_id). Una fila por (tenant,
-- semana), también las semanas en cero: el dibujo no tiene que rellenar
-- huecos.

-- >>> trabajos_semanales
create or replace function trabajos_semanales(
  p_lubricentro_id uuid    default null,
  p_semanas        integer default 12
)
returns table (
  lubricentro_id uuid,
  semana         date,
  cantidad       integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver los trabajos por semana'
      using errcode = '42501';
  end if;
  if p_semanas < 1 or p_semanas > 104 then
    raise exception 'semanas_fuera_de_rango'
      using hint = 'Entre 1 y 104 semanas.';
  end if;

  v_desde := (date_trunc('week', current_date) - (p_semanas - 1) * interval '1 week')::date;

  return query
  with semanas as (
    select generate_series(v_desde, date_trunc('week', current_date)::date, interval '1 week')::date as inicio
  ),
  tenants as (
    select l.id from lubricentros l
    where p_lubricentro_id is null or l.id = p_lubricentro_id
  ),
  conteo as (
    select
      sv.lubricentro_id,
      date_trunc('week', sv.fecha)::date as inicio,
      count(*)::integer as n
    from services sv
    where not sv.anulado                                                -- @semana_todos
      and sv.fecha >= v_desde
      and (p_lubricentro_id is null or sv.lubricentro_id = p_lubricentro_id)
    group by sv.lubricentro_id, date_trunc('week', sv.fecha)::date
  )
  select t.id, s.inicio, coalesce(c.n, 0)
  from tenants t
  cross join semanas s
  left join conteo c on c.lubricentro_id = t.id and c.inicio = s.inicio
  order by t.id, s.inicio;
end;
$$;
-- <<< trabajos_semanales

comment on function trabajos_semanales is
  'Trabajos (de cualquier tipo, por services.fecha) por semana ISO y por tenant, las últimas p_semanas incluida la corriente, con las semanas en cero. Sin p_lubricentro_id devuelve todos los tenants en una sola consulta: es lo que lee el sparkline del listado de /fidelli. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 4 · indicadores_tenants() — la fila del listado, con la plata de SQL
-- ════════════════════════════════════════════════════════════════════
--
-- Lo que la tabla de /fidelli muestra por tenant y que
-- `listado_lubricentros()` no trae (y no se toca): la definición única
-- de activo, la exención, el estado del reloj, el MRR mensualizado de
-- `mrr_de_tenant()`, si el módulo se cobra o está bonificado
-- (`modulo_es_pago()`), los trabajos de los últimos 30 días y el último.
-- Una llamada para todas las filas; nunca `mrr_de_tenant()` por fila desde
-- la pantalla.

-- >>> indicadores_tenants
create or replace function indicadores_tenants()
returns table (
  lubricentro_id uuid,
  es_activo      boolean,
  exento         boolean,
  estado_reloj   text,
  mrr_ars        numeric,
  modulo_pago    boolean,
  trabajos_30    integer,
  ultimo_trabajo date
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver los indicadores de los tenants'
      using errcode = '42501';
  end if;

  return query
  with vigente as (
    select distinct on (s.lubricentro_id) s.lubricentro_id, s.descuento_pct
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      count(*) filter (where sv.fecha >= current_date - 29)::integer as en_30, -- @trabajos_30
      max(sv.fecha) as ultimo
    from services sv
    where not sv.anulado
    group by sv.lubricentro_id
  )
  select
    l.id,
    public.es_activo(l),
    coalesce(v.descuento_pct, 0) >= 100,
    reloj_cobranza(l) ->> 'estado',
    mrr_de_tenant(l.id),                                                 -- @mrr_indicador
    -- El único módulo pago del catálogo; lib/planes.ts (MODULOS_PAGOS) lo
    -- espeja. Un módulo nuevo entra acá y allá a la vez.
    modulo_es_pago(l.id, 'neumaticos'),
    coalesce(a.en_30, 0),
    a.ultimo
  from lubricentros l
  left join vigente   v on v.lubricentro_id = l.id
  left join actividad a on a.lubricentro_id = l.id;
end;
$$;
-- <<< indicadores_tenants

comment on function indicadores_tenants is
  'Por tenant, lo que el listado de /fidelli muestra y listado_lubricentros() no trae: es_activo() (la definición única), exento, el estado del reloj, mrr_de_tenant() en ARS, si el módulo gomería se cobra (modulo_es_pago), trabajos de los últimos 30 días (cualquier tipo) y último trabajo. Una llamada para todas las filas. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 5 · resumen_admin() — los cinco números y las alertas
-- ════════════════════════════════════════════════════════════════════
--
-- Cada número lleva su comparación al lado (docs/METRICAS.md § 1):
--   · MRR en ARS (`mrr_plataforma()`) y en USD con `tc_vigente(hoy)`; la
--     comparación es contra el snapshot del ÚLTIMO DÍA DEL MES ANTERIOR,
--     que se lee y no se recalcula. Sin ese snapshot, null: la pantalla
--     dice "sin historia todavía".
--   · Tenants activos (`es_activo()`), y altas − bajas del mes.
--   · Altas del mes y del anterior (eventos `alta`).
--   · Bajas del mes (`suspension` + `suspension_reloj`) y cuántas fueron
--     involuntarias (falta de pago o reloj).
--   · Trabajos del mes de cualquier tipo, desglosados.
-- Y los conteos de las alertas: si ayer cerró, las órdenes de Cresium que
-- quedaron vencidas o parciales (solo lectura de cresium_ordenes, mirando
-- la ÚLTIMA orden de cada tenant), los tenants con atención, los activos
-- que no cargan trabajos hace más de 7 días, los owners sin activar a más
-- de 7 días del alta y los tenants sin origen.

-- >>> resumen_admin
create or replace function resumen_admin()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_mes         date := date_trunc('month', current_date)::date;
  v_mes_ant     date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_fin_mes_ant date := date_trunc('month', current_date)::date - 1;
  v_mrr         numeric;
  v_tc          tipo_cambio;
  v_snap        snapshots_diarios;
  v_atencion    integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver el resumen'
      using errcode = '42501';
  end if;

  v_mrr := mrr_plataforma();
  v_tc  := tc_vigente(current_date);
  select * into v_snap from snapshots_diarios where fecha = v_fin_mes_ant;

  select count(*) into v_atencion
  from lubricentros l
  left join lateral (
    select s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    where s.lubricentro_id = l.id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v on true
  where estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) is not null;

  return jsonb_build_object(
    -- La plata
    'mrr_ars',                  v_mrr,
    'tc_venta',                 v_tc.venta,
    'tc_fecha',                 v_tc.fecha,
    'mrr_usd',                  case when v_tc.venta > 0 then round(v_mrr / v_tc.venta, 2) end,
    'fin_mes_anterior',         v_fin_mes_ant,
    'mrr_ars_fin_mes_anterior', v_snap.mrr_ars,
    'mrr_usd_fin_mes_anterior', v_snap.mrr_usd,

    -- Los tenants
    'activos',            (select count(*) from lubricentros l where es_activo(l)),
    'altas_mes',          (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes),
    'altas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),
    'bajas_mes',          (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj') and ocurrido_at >= v_mes),
    'bajas_involuntarias_mes',
                          (select count(*) from tenant_eventos
                           where ocurrido_at >= v_mes
                             and (tipo = 'suspension_reloj'
                                  or (tipo = 'suspension' and motivo like 'falta_de_pago%'))),
    'bajas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj')
                             and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),

    -- Los trabajos, de cualquier tipo y por tipo
    'trabajos_mes',          (select count(*) from services
                              where not anulado                          -- @resumen_trabajos
                                and fecha >= v_mes),
    'trabajos_service',      (select count(*) from services
                              where not anulado and tipo = 'service' and fecha >= v_mes),
    'trabajos_mecanica',     (select count(*) from services
                              where not anulado and tipo = 'mecanica' and fecha >= v_mes),
    'trabajos_neumaticos',   (select count(*) from services
                              where not anulado and tipo = 'neumaticos' and fecha >= v_mes),
    'trabajos_mes_anterior', (select count(*) from services
                              where not anulado and fecha >= v_mes_ant and fecha < v_mes),

    -- Las alertas
    'cierre_ayer',     exists (select 1 from snapshots_diarios where fecha = current_date - 1),
    'ultimo_snapshot', (select max(fecha) from snapshots_diarios),
    'ordenes_cresium', (select count(*) from (
                          select distinct on (o.lubricentro_id) o.estado
                          from cresium_ordenes o
                          order by o.lubricentro_id, o.created_at desc
                        ) u where u.estado in ('EXPIRED', 'PARTIAL')),
    'atencion',        v_atencion,
    'sin_origen',      (select count(*) from lubricentros where origen is null),
    'sin_trabajos',    (select coalesce(jsonb_agg(
                          jsonb_build_object('id', x.id, 'nombre', x.nombre, 'dias', x.dias)
                          order by x.dias desc nulls first, x.nombre), '[]'::jsonb)
                        from (
                          select l.id, l.nombre, (current_date - a.ultimo) as dias
                          from lubricentros l
                          left join lateral (
                            select max(sv.fecha) as ultimo from services sv
                            where sv.lubricentro_id = l.id and not sv.anulado
                          ) a on true
                          where es_activo(l)
                            and (a.ultimo is null or a.ultimo < current_date - 7)
                        ) x),
    'owner_pendiente', (select coalesce(jsonb_agg(
                          jsonb_build_object('id', l.id, 'nombre', l.nombre,
                                             'dias', current_date - l.created_at::date)
                          order by l.created_at), '[]'::jsonb)
                        from lubricentros l
                        join estados_owner() o on o.lubricentro_id = l.id
                        where o.estado = 'pendiente'
                          and l.created_at < now() - interval '7 days')
  );
end;
$$;
-- <<< resumen_admin

comment on function resumen_admin is
  'Los cinco números del Resumen de /fidelli con su comparación (MRR ARS/USD contra el snapshot del último día del mes anterior; activos; altas; bajas e involuntarias; trabajos por tipo) y los conteos de las alertas (cierre de ayer, última orden de Cresium vencida o parcial por tenant, atención, activos sin trabajos en 7 días, owners sin activar, sin origen). Solo lee. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 6 · Permisos
-- ════════════════════════════════════════════════════════════════════
-- Los default privileges del schema están revocados de PUBLIC: cada
-- función nueva se granta a mano. `anon` no llega a ninguna.

revoke all on function metricas_plataforma() from public, anon;
revoke all on function salud_tenants() from public, anon;
revoke all on function trabajos_semanales(uuid, integer) from public, anon;
revoke all on function indicadores_tenants() from public, anon;
revoke all on function resumen_admin() from public, anon;

grant execute on function metricas_plataforma()               to authenticated, service_role;
grant execute on function salud_tenants()                     to authenticated, service_role;
grant execute on function trabajos_semanales(uuid, integer)   to authenticated, service_role;
grant execute on function indicadores_tenants()               to authenticated, service_role;
grant execute on function resumen_admin()                     to authenticated, service_role;
