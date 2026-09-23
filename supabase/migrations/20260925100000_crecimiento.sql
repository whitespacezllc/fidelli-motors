-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 4 · CRECIMIENTO
-- (docs/METRICAS.md § 1, las definiciones del bloque 4: Mes cerrado,
-- Movimientos de MRR, Cohorte, GRR/NRR, Churn por tipo y origen, Altas y
-- bajas, Trabajos por mes)
--
-- Lo que /fidelli/crecimiento pregunta: de dónde viene el MRR, si entran
-- más de los que se van, si se quedan, si pagan más con el tiempo y si usan
-- el sistema. TODO LO DE ACÁ LEE FOTOS Y EVENTOS; NADA RECALCULA HISTORIA:
-- un service anulado hoy no mueve el MRR de hace tres meses, porque el MRR
-- de hace tres meses está en `snapshots_tenant_diarios` y de ahí se lee.
--
--   · vista `snapshots_mensuales`      — por mes, la foto del último día con
--                                        foto y la bandera `en_curso`.
--   · `movimientos_mrr(desde, hasta, moneda)`
--                                      — nuevo / reactivación / expansión /
--                                        contracción / churn / ajuste de
--                                        precio, POR TENANT entre dos fotos.
--                                        La identidad cierra por construcción.
--   · `cohortes_logos(desde, hasta)`   — retención de logos a 1, 2, 3, 6, 9
--                                        y 12 meses, solo sobre meses cerrados.
--   · `cohortes_ingresos(desde, hasta)`— GRR y NRR a 3, 6 y 12 meses, en USD.
--   · `churn_por_mes(desde, hasta)`    — bajas por tipo (involuntario /
--                                        voluntario), por motivo y por origen.
--   · `altas_bajas_por_mes(desde, hasta)`
--                                      — altas, bajas, reactivaciones, neto.
--   · `trabajos_por_mes(desde, hasta)` — la suma de las fotos diarias del mes.
--
-- Todas `security invoker` con guarda `soy_superadmin()` ANTES de leer nada
-- (42501 a un owner; R34a lo prueba), `stable`, `set search_path = public`,
-- grants a `authenticated` y `service_role` como en 20260923100000. Los
-- meses son siempre `date` del día 1. «Hora argentina» es
-- `America/Argentina/Buenos_Aires`, la misma zona del cierre diario.
--
-- ⚠ Las líneas marcadas `-- @ajuste_vs_expansion`, `-- @descuento_es_cliente`,
-- `-- @evento_en_el_mes` (dos líneas: ev_desde y ev_hasta), `-- @identidad_fin`,
-- `-- @nuevo_vs_react` (dos líneas: nuevo y reactivación), `-- @mes_cumplido`,
-- `-- @mes_alta_cerrado` y `-- @involuntario`, y los
-- marcadores `-- >>> nombre` / `-- <<< nombre`, NO SE REFORMATEAN:
-- scripts/regresion-metricas.sh los muerde con sed y awk (regla 13).
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · snapshots_mensuales — la foto que representa a cada mes
-- ════════════════════════════════════════════════════════════════════
--
-- Un mes está CERRADO cuando su último día calendario tiene foto. El mes
-- en curso no lo está, y tampoco un mes pasado al que le falta la foto del
-- último día: no se inventa el cierre, se muestra el último día con foto y
-- se dice `en_curso`. Las columnas son las de `snapshots_diarios`, todas y
-- en el mismo orden, con `mes` adelante y `en_curso` al final. Se listan
-- una por una en vez de `s.*` para que el contrato de la vista sea
-- legible acá y no dependa de lo que la tabla tenga mañana.
--
-- `security_invoker`: el RLS de `snapshots_diarios` (solo superadmin) rige
-- para quien consulta la vista. Un owner ve cero filas, sin error.

-- >>> snapshots_mensuales
create view snapshots_mensuales with (security_invoker = true) as
select distinct on (date_trunc('month', s.fecha))
  date_trunc('month', s.fecha)::date as mes,
  s.fecha,
  s.tenants_activos,
  s.tenants_suspendidos,
  s.tenants_exentos,
  s.mrr_ars,
  s.tc_venta,
  s.mrr_usd,
  s.altas_dia,
  s.bajas_dia,
  s.trabajos_dia,
  s.trabajos_service,
  s.trabajos_mecanica,
  s.trabajos_neumaticos,
  s.recordatorios_dia,
  s.escaneos_dia,
  s.fuente,
  s.created_at,
  -- El último día del mes es (día 1 del mes siguiente) − 1. Si la foto es
  -- anterior, el mes no cerró.
  s.fecha < (date_trunc('month', s.fecha) + interval '1 month' - interval '1 day')::date as en_curso
from snapshots_diarios s
order by date_trunc('month', s.fecha), s.fecha desc;
-- <<< snapshots_mensuales

comment on view snapshots_mensuales is
  'Por mes (date del día 1), la fila completa de snapshots_diarios del último día con foto del mes y en_curso = la foto no es la del último día calendario (docs/METRICAS.md § 1 «Mes cerrado»). Un mes pasado sin la foto del último día también queda en_curso: no se inventa el cierre. security_invoker: el RLS de snapshots_diarios rige (un owner ve cero filas).';

revoke all on snapshots_mensuales from public, anon;
grant select on snapshots_mensuales to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 2 · movimientos_mrr — de dónde viene el MRR
-- ════════════════════════════════════════════════════════════════════
--
-- Compara, POR TENANT, la foto del mes anterior (`a`) con la del mes (`b`),
-- las dos leídas de `snapshots_tenant_diarios` en las fechas que da
-- `snapshots_mensuales`. Un tenant sin fila en una foto vale 0 ahí. Con eso:
--
--   a = 0, b > 0, alta en el mes      → nuevo          (+b)
--   a = 0, b > 0, alta anterior       → reactivación   (+b)
--   a > 0, b = 0                      → churn          (a, magnitud)
--   a > 0, b > 0, NO cambió el cliente, a ≠ b
--                                     → ajuste de precio (b − a, con signo):
--                                       es la lista de precios en pesos
--                                       moviéndose, no el cliente.
--   a > 0, b > 0, cambió el cliente, b > a → expansión  (b − a)
--   a > 0, b > 0, cambió el cliente, b < a → contracción (a − b)
--   el resto → nada (mismo MRR con otro plan no es movimiento).
--
-- «Cambió el cliente» = cambió `plan_id`, `periodo` o `modulo_pago` entre
-- las dos fotos, O hubo en el mes un evento `cambio_plan` del tenant cuyo
-- `descuento_pct` cambió (`antes ->> 'descuento_pct'` distinto de
-- `despues ->> 'descuento_pct'`): la foto no guarda el descuento negociado,
-- y un descuento que se renegocia es el cliente, no la lista. Un
-- `cambio_plan` que no toca el descuento (Pro → Ultra y vuelta en el mismo
-- mes, con las fotos iguales) no cuenta: lo que hizo el cliente ya se ve
-- en las fotos o no dejó rastro en el MRR. «En el mes» es el mes calendario
-- en hora argentina, la MISMA ventana que decide «alta en el mes»: la
-- definición usa la misma frase para las dos cosas y acá se leen igual. Con
-- los dos meses cerrados es también el intervalo entre las dos fotos.
-- Borde conocido, el mismo que el del alta: si a un mes le falta la foto
-- del último día (en_curso) y el descuento se movió DESPUÉS de esa última
-- foto, el MRR nuevo recién se ve en la foto del mes siguiente, cuyo mes
-- calendario no tiene el evento, y sale como ajuste de precio (como un alta
-- posterior a la última foto sale como reactivación). Con el cron cerrando
-- todos los días no pasa. R34b lo fija con dos tenants en 1986 para que un
-- cambio de lectura se vea en rojo y se decida primero en docs/METRICAS.md
-- § 1, para el alta y para el evento a la vez.
--
-- `mrr_inicio` = Σ a y `mrr_fin` = Σ b sobre la MISMA unión de tenants, así
-- que mrr_inicio + nuevo + reactivacion + expansion − contraccion − churn +
-- ajuste_precio = mrr_fin cierra por construcción (R34a lo comprueba sobre
-- toda la historia, en las dos monedas). NO se lee `snapshots_diarios.mrr_ars`
-- para el fin: en una base donde un tenant se borró (cascade), la foto de la
-- plataforma conserva su MRR y las filas por tenant no, y la identidad
-- dejaría de cerrar.
--
-- En USD cada monto se convierte con el `tc_venta` DE SU PROPIA FOTO
-- (a / tc de la foto inicio, b / tc de la foto fin), redondeado a 2, y la
-- clasificación se hace sobre esos valores: por eso un mes con el mismo
-- abono en pesos y otro dólar sale como ajuste de precio en USD, que es lo
-- que fue. Si alguna de las dos fotos no tiene tipo de cambio, ese mes no
-- tiene montos en USD (null): convertir con el tipo de cambio de otro día
-- sería inventar un número. `sin_foto_anterior` sigue en false porque la
-- foto anterior sí existe; lo que falta es la cotización. Los tenants
-- (`tenants_inicio`, `tenants_fin`) no son montos y se devuelven igual.
--
-- El primer mes con historia no tiene foto anterior: sale con
-- `sin_foto_anterior = true`, `mrr_fin` y `tenants_fin` cargados y todo lo
-- demás en null. No se inventa un inicio en cero.

-- >>> movimientos_mrr
create or replace function movimientos_mrr(p_desde date, p_hasta date, p_moneda text default 'ars')
returns table (
  mes               date,
  en_curso          boolean,
  sin_foto_anterior boolean,
  mrr_inicio        numeric,
  nuevo             numeric,
  reactivacion      numeric,
  expansion         numeric,
  contraccion       numeric,
  churn             numeric,
  ajuste_precio     numeric,
  mrr_fin           numeric,
  neto              numeric,
  crecimiento_pct   numeric,
  tenants_inicio    integer,
  tenants_fin       integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := date_trunc('month', p_hasta)::date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve los movimientos de MRR' using errcode = '42501';
  end if;
  if p_moneda is null or p_moneda not in ('ars', 'usd') then
    raise exception 'moneda_invalida' using hint = 'La moneda es ars o usd.';
  end if;

  return query
  with fin as (
    -- Un mes por cada fila de snapshots_mensuales en el rango.
    select m.mes, m.fecha, m.en_curso, m.tenants_activos, m.tc_venta
    from snapshots_mensuales m
    where m.mes between v_desde and v_hasta
  ),
  par as (
    -- La foto del mes calendario anterior, si existe. nullif(tc, 0): un
    -- tipo de cambio en cero no divide nada. ev_desde / ev_hasta: la ventana
    -- de los eventos cambio_plan, el mes calendario como instantes en hora
    -- argentina (del 1 a las 00:00 al 1 del mes siguiente a las 00:00,
    -- excluido), la misma que decide «alta en el mes». Las dos líneas llevan
    -- el marcador: la rotura las corre a (foto inicio, foto fin].
    select f.mes, f.en_curso,
           f.fecha as fecha_fin, f.tenants_activos as act_fin, nullif(f.tc_venta, 0) as tc_fin,
           i.fecha as fecha_ini, i.tenants_activos as act_ini, nullif(i.tc_venta, 0) as tc_ini,
           (f.mes::timestamp at time zone 'America/Argentina/Buenos_Aires') as ev_desde,                     -- @evento_en_el_mes
           ((f.mes + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires') as ev_hasta  -- @evento_en_el_mes
    from fin f
    left join snapshots_mensuales i on i.mes = (f.mes - interval '1 month')::date
  ),
  suma as (
    select p.mes, p.en_curso, p.act_ini, p.act_fin,
      p.fecha_ini is null as sin_anterior,
      (p_moneda = 'usd' and (p.tc_fin is null or (p.fecha_ini is not null and p.tc_ini is null))) as sin_tc,
      t.ini, t.fin, t.nuevo_, t.react_, t.exp_, t.contr_, t.churn_, t.ajuste_
    from par p
    cross join lateral (
      select
        round(sum(x.a), 2) as ini,
        round(sum(x.b), 2) as fin,                                                                   -- @identidad_fin
        round(sum(x.b)       filter (where x.a = 0 and x.b > 0 and x.alta_en_mes), 2)     as nuevo_, -- @nuevo_vs_react
        round(sum(x.b)       filter (where x.a = 0 and x.b > 0 and not x.alta_en_mes), 2) as react_, -- @nuevo_vs_react
        round(sum(x.b - x.a) filter (where x.a > 0 and x.b > 0 and not x.mismo and x.b > x.a), 2) as exp_,
        round(sum(x.a - x.b) filter (where x.a > 0 and x.b > 0 and not x.mismo and x.b < x.a), 2) as contr_,
        round(sum(x.a)       filter (where x.a > 0 and x.b = 0), 2)                               as churn_,
        round(sum(x.b - x.a) filter (where x.a > 0 and x.b > 0 and x.mismo and x.a <> x.b), 2)   as ajuste_
      from (
        select
          case when p_moneda = 'usd' then round(coalesce(a.mrr_ars, 0) / p.tc_ini, 2) else coalesce(a.mrr_ars, 0) end as a,
          case when p_moneda = 'usd' then round(coalesce(b.mrr_ars, 0) / p.tc_fin, 2) else coalesce(b.mrr_ars, 0) end as b,
          -- Mismo plan, mismo período, mismo módulo pago y sin un descuento
          -- renegociado en el medio: lo que cambió fue la lista, no el
          -- cliente. `is not distinct from` porque plan_id y periodo pueden
          -- venir null de una foto reconstruida.
          case when a.plan_id     is not distinct from b.plan_id
                and a.periodo     is not distinct from b.periodo
                and a.modulo_pago is not distinct from b.modulo_pago
                and not d.cambio_descuento                                                        -- @descuento_es_cliente
               then true                                                                          -- @ajuste_vs_expansion
               else false end as mismo,
          -- El alta cae en el mes si su día en hora argentina está dentro del
          -- mes calendario. Un tenant sin fila en lubricentros (no pasa: las
          -- fotos se van con el tenant) se trata como alta anterior.
          coalesce(
                (l.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= p.mes
            and (l.created_at at time zone 'America/Argentina/Buenos_Aires')::date <  (p.mes + interval '1 month')::date,
            false) as alta_en_mes
        from      (select s.* from snapshots_tenant_diarios s where s.fecha = p.fecha_ini) a
        full join (select s.* from snapshots_tenant_diarios s where s.fecha = p.fecha_fin) b
               on b.lubricentro_id = a.lubricentro_id
        left join lubricentros l on l.id = coalesce(a.lubricentro_id, b.lubricentro_id)
        -- La foto no guarda el descuento: se busca el evento cambio_plan del
        -- tenant en el mes que lo haya movido. Los dos lados salen
        -- de la misma columna numeric(5,2) de suscripciones, así que el texto
        -- de ->> es comparable (0.00 contra 20.00) sin castear nada que
        -- pueda reventar. Índice (lubricentro_id, ocurrido_at).
        cross join lateral (
          select exists (
            select 1
            from tenant_eventos e
            where e.lubricentro_id = coalesce(a.lubricentro_id, b.lubricentro_id)
              and e.tipo = 'cambio_plan'
              and e.ocurrido_at >= p.ev_desde and e.ocurrido_at < p.ev_hasta
              and e.antes ->> 'descuento_pct' is distinct from e.despues ->> 'descuento_pct'
          ) as cambio_descuento
        ) d
      ) x
    ) t
  ),
  armado as (
    -- Sin foto anterior o sin tipo de cambio no hay movimientos; con foto y
    -- sin tenants (una foto vacía) los montos son 0, no null.
    select s.mes, s.en_curso, s.sin_anterior, s.act_ini, s.act_fin,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.ini, 0)     end as ini,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.nuevo_, 0)  end as nuevo_,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.react_, 0)  end as react_,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.exp_, 0)    end as exp_,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.contr_, 0)  end as contr_,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.churn_, 0)  end as churn_,
      case when s.sin_anterior or s.sin_tc then null else coalesce(s.ajuste_, 0) end as ajuste_,
      case when s.sin_tc                   then null else coalesce(s.fin, 0)     end as fin
    from suma s
  )
  select
    r.mes,
    r.en_curso,
    r.sin_anterior,
    r.ini,
    r.nuevo_,
    r.react_,
    r.exp_,
    r.contr_,
    r.churn_,
    r.ajuste_,
    r.fin,
    -- El neto comercial deja el ajuste de precio aparte: es lo que hizo el
    -- cliente, no la lista.
    r.nuevo_ + r.react_ + r.exp_ - r.contr_ - r.churn_,
    round((r.nuevo_ + r.react_ + r.exp_ - r.contr_ - r.churn_) / nullif(r.ini, 0), 4),
    case when r.sin_anterior then null else r.act_ini end,
    r.act_fin
  from armado r
  order by r.mes;
end;
$$;
-- <<< movimientos_mrr

comment on function movimientos_mrr is
  'Los movimientos de MRR de cada mes del rango (docs/METRICAS.md § 1 «Movimientos de MRR de un mes»): por tenant, la foto del último día con foto del mes anterior contra la del mes (snapshots_tenant_diarios en las fechas de snapshots_mensuales); nuevo, reactivacion, expansion, contraccion (magnitud), churn (magnitud), ajuste_precio (con signo: mismo plan, período y módulo pago y ningún evento cambio_plan del tenant en el mes calendario, hora argentina, la misma ventana que «alta en el mes», que haya cambiado descuento_pct; un descuento renegociado es el cliente y va a expansion/contraccion). mrr_inicio = Σ a y mrr_fin = Σ b sobre la misma unión de tenants, así la identidad cierra por construcción. neto = nuevo + reactivacion + expansion − contraccion − churn; crecimiento_pct = neto ÷ mrr_inicio (fracción). El primer mes con historia sale con sin_foto_anterior = true y movimientos null. p_moneda ars o usd (moneda_invalida si no); en usd cada monto se convierte con el tc_venta de su propia foto y, si a alguna de las dos le falta, los montos del mes son null (no se convierte con la cotización de otro día). Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 3 · cohortes_logos — ¿se quedan?
-- ════════════════════════════════════════════════════════════════════
--
-- Cohorte = mes de `lubricentros.created_at` en hora argentina. Una fila
-- por mes del rango con al menos un alta. `mN` = tenants de la cohorte con
-- `activo = true` en la foto de `snapshots_mensuales` del mes cohorte + N,
-- dividido por el tamaño; SOLO si ese mes está cerrado (`en_curso = false`),
-- si no, null: un mes a medias no dice cuántos se quedaron. Un tenant sin
-- fila en esa foto cuenta como no activo. `activados` sale de
-- `activacion_por_mes()` llamada UNA vez para todo el rango (del día 1 del
-- primer mes al último día del último), y se une por mes. Esa función
-- agrupa por `date_trunc('month', created_at)` en la zona de la SESIÓN, así
-- que esta función fija `timezone` a la argentina en su cláusula SET (rige
-- también para lo que llama mientras corre): la cohorte de acá se calcula
-- con `at time zone` explícito y las dos tienen que coincidir aunque la
-- conexión venga con otro TimeZone; si no, un alta a las 22:00 del último
-- día del mes quedaría en una cohorte y su activación en la siguiente.

-- >>> cohortes_logos
create or replace function cohortes_logos(p_desde date, p_hasta date)
returns table (
  cohorte   date,
  tamano    integer,
  activados integer,
  m1        numeric,
  m2        numeric,
  m3        numeric,
  m6        numeric,
  m9        numeric,
  m12       numeric
)
language plpgsql
stable
set search_path = public
set timezone = 'America/Argentina/Buenos_Aires'
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := (date_trunc('month', p_hasta) + interval '1 month' - interval '1 day')::date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve las cohortes' using errcode = '42501';
  end if;

  return query
  with alta as (
    select l.id, date_trunc('month', l.created_at at time zone 'America/Argentina/Buenos_Aires')::date as c
    from lubricentros l
    where (l.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_desde and v_hasta
  ),
  coh as (
    select a.c, count(*)::integer as n from alta a group by a.c
  ),
  act as (
    select ap.mes as c, ap.activados as n from activacion_por_mes(v_desde, v_hasta) ap
  ),
  ret as (
    -- Por cohorte y paso, la foto del mes cumplido: si el mes cohorte + N
    -- no existe o no cerró, no hay fila y el mN queda null.
    select c.c, paso.n as paso,
      (select count(*)
         from alta a
         join snapshots_tenant_diarios st on st.lubricentro_id = a.id and st.fecha = m.fecha
        where a.c = c.c and st.activo)::numeric / c.n as r
    from coh c
    cross join (values (1), (2), (3), (6), (9), (12)) as paso(n)
    join snapshots_mensuales m
      on m.mes = (c.c + make_interval(months => paso.n))::date
     and m.en_curso = false                                            -- @mes_cumplido
  )
  select
    c.c,
    c.n,
    coalesce(act.n, 0),
    round(max(r.r) filter (where r.paso = 1),  4),
    round(max(r.r) filter (where r.paso = 2),  4),
    round(max(r.r) filter (where r.paso = 3),  4),
    round(max(r.r) filter (where r.paso = 6),  4),
    round(max(r.r) filter (where r.paso = 9),  4),
    round(max(r.r) filter (where r.paso = 12), 4)
  from coh c
  left join act   on act.c = c.c
  left join ret r on r.c   = c.c
  group by c.c, c.n, act.n
  order by c.c;
end;
$$;
-- <<< cohortes_logos

comment on function cohortes_logos is
  'Retención de logos por cohorte de alta (docs/METRICAS.md § 1 «Cohorte»): cohorte = mes de lubricentros.created_at en hora argentina, una fila por mes del rango con al menos un alta; tamano; activados (activacion_por_mes, con timezone fijado a la argentina en la función para que agrupe en la misma zona que la cohorte); mN = tenants de la cohorte con activo = true en la foto del último día con foto del mes cohorte + N ÷ tamano, redondeado a 4, y null si ese mes no existe en snapshots_mensuales o está en_curso (mes no cumplido). Un tenant sin fila en la foto cuenta como no activo. N ∈ {1, 2, 3, 6, 9, 12}. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 4 · cohortes_ingresos — ¿pagan más con el tiempo?
-- ════════════════════════════════════════════════════════════════════
--
-- En USD para neutralizar los ajustes en pesos. El MRR inicial de cada
-- tenant es el de la foto del mes de su cohorte convertido con el
-- `tc_venta` de esa foto (redondeado a 2); la cohorte no tiene inicial si
-- su mes no está cerrado o la foto no tiene tipo de cambio. Al mes cohorte
-- + N, el MRR del tenant se convierte con el tc de ESA foto (0 sin fila).
-- GRR_N = Σ mín(mrr_N, inicial) ÷ Σ inicial; NRR_N = Σ mrr_N ÷ Σ inicial.
-- Null si el mes cohorte + N no está cerrado o no tiene tc, si el inicial
-- es null o 0. NRR ≥ GRR por construcción: mín(x, y) ≤ x término a término.

-- >>> cohortes_ingresos
create or replace function cohortes_ingresos(p_desde date, p_hasta date)
returns table (
  cohorte         date,
  tamano          integer,
  mrr_inicial_usd numeric,
  grr_3           numeric,
  nrr_3           numeric,
  grr_6           numeric,
  nrr_6           numeric,
  grr_12          numeric,
  nrr_12          numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := (date_trunc('month', p_hasta) + interval '1 month' - interval '1 day')::date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve las cohortes' using errcode = '42501';
  end if;

  return query
  with alta as (
    select l.id, date_trunc('month', l.created_at at time zone 'America/Argentina/Buenos_Aires')::date as c
    from lubricentros l
    where (l.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_desde and v_hasta
  ),
  coh as (
    select a.c, count(*)::integer as n from alta a group by a.c
  ),
  base as (
    -- La foto del mes de alta: cerrada y con tipo de cambio, o no hay inicial.
    select c.c, m.fecha, m.tc_venta
    from coh c
    left join snapshots_mensuales m
      on m.mes = c.c and m.en_curso = false and coalesce(m.tc_venta, 0) > 0   -- @mes_alta_cerrado
  ),
  inicial as (
    select a.c, a.id,
      round(coalesce((select st.mrr_ars from snapshots_tenant_diarios st
                       where st.lubricentro_id = a.id and st.fecha = b.fecha), 0) / b.tc_venta, 2) as usd
    from alta a
    join base b on b.c = a.c
    where b.fecha is not null
  ),
  tot as (
    select i.c, round(sum(i.usd), 2) as usd from inicial i group by i.c
  ),
  paso as (
    -- Por cohorte y paso, sobre la foto del mes cumplido y con tc.
    select i.c, n.n as paso,
      sum(least(x.usd, i.usd)) as bruto,
      sum(x.usd)               as total
    from inicial i
    cross join (values (3), (6), (12)) as n(n)
    join snapshots_mensuales m
      on m.mes = (i.c + make_interval(months => n.n))::date
     and m.en_curso = false                                            -- @mes_cumplido
     and coalesce(m.tc_venta, 0) > 0
    cross join lateral (
      select round(coalesce((select st.mrr_ars from snapshots_tenant_diarios st
                              where st.lubricentro_id = i.id and st.fecha = m.fecha), 0) / m.tc_venta, 2) as usd
    ) x
    group by i.c, n.n
  )
  select
    c.c,
    c.n,
    t.usd,
    round(max(p.bruto) filter (where p.paso = 3)  / nullif(t.usd, 0), 4),
    round(max(p.total) filter (where p.paso = 3)  / nullif(t.usd, 0), 4),
    round(max(p.bruto) filter (where p.paso = 6)  / nullif(t.usd, 0), 4),
    round(max(p.total) filter (where p.paso = 6)  / nullif(t.usd, 0), 4),
    round(max(p.bruto) filter (where p.paso = 12) / nullif(t.usd, 0), 4),
    round(max(p.total) filter (where p.paso = 12) / nullif(t.usd, 0), 4)
  from coh c
  left join tot  t on t.c = c.c
  left join paso p on p.c = c.c
  group by c.c, c.n, t.usd
  order by c.c;
end;
$$;
-- <<< cohortes_ingresos

comment on function cohortes_ingresos is
  'GRR y NRR por cohorte de alta, en USD (docs/METRICAS.md § 1 «GRR y NRR de una cohorte a N meses»): mrr_inicial_usd = Σ por tenant del MRR de la foto del último día del mes de alta ÷ tc_venta de esa foto (2 decimales); grr_N = Σ mín(MRR al mes alta + N convertido con el tc de esa foto, inicial del tenant) ÷ inicial de la cohorte; nrr_N = Σ MRR al mes alta + N ÷ inicial. Un tenant que se fue aporta 0. Null si el mes de alta o el mes alta + N no está cerrado o no tiene tc, o si el inicial es 0. N ∈ {3, 6, 12}. Redondeo a 4. NRR ≥ GRR siempre. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 5 · churn_por_mes — ¿por qué se van?
-- ════════════════════════════════════════════════════════════════════
--
-- Bajas = eventos `suspension` + `suspension_reloj` cuyo `ocurrido_at` cae
-- en el mes en hora argentina. El motivo de una suspensión manual se guarda
-- como «código · detalle» (cambiar_estado_lubricentro), así que el código
-- es lo que hay antes de « ·». Involuntarias = las del reloj + las de
-- `falta_de_pago`; voluntarias = el resto (incluido sin motivo). Todos los
-- meses del rango salen, con ceros y `{}`.

-- >>> churn_por_mes
create or replace function churn_por_mes(p_desde date, p_hasta date)
returns table (
  mes            date,
  tenants_inicio integer,
  bajas          integer,
  involuntarias  integer,
  voluntarias    integer,
  por_motivo     jsonb,
  por_origen     jsonb,
  churn_pct      numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := date_trunc('month', p_hasta)::date;
  -- Los bordes del rango como instantes: el día 1 del primer mes a las
  -- 00:00 argentinas, y el día 1 del mes siguiente al último.
  v_piso  timestamptz := (v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_tope  timestamptz := ((v_hasta + interval '1 month')::date::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve el churn' using errcode = '42501';
  end if;

  return query
  with meses as (
    select generate_series(v_desde, v_hasta, interval '1 month')::date as m
  ),
  baja as (
    select
      date_trunc('month', e.ocurrido_at at time zone 'America/Argentina/Buenos_Aires')::date as m,
      case when e.tipo = 'suspension_reloj' then true                                        -- @involuntario
           else split_part(coalesce(e.motivo, ''), ' ·', 1) = 'falta_de_pago' end as involuntaria,
      case when e.tipo = 'suspension_reloj' then 'reloj'
           when split_part(coalesce(e.motivo, ''), ' ·', 1)
                in ('falta_de_pago', 'pedido_del_cliente', 'cierre_del_negocio', 'otro')
             then split_part(e.motivo, ' ·', 1)
           -- Sin motivo o con uno que no es del catálogo: otro.
           else 'otro' end as codigo,
      coalesce(l.origen::text, 'sin_origen') as origen
    from tenant_eventos e
    left join lubricentros l on l.id = e.lubricentro_id
    where e.tipo in ('suspension', 'suspension_reloj')
      and e.ocurrido_at >= v_piso and e.ocurrido_at < v_tope
  ),
  conteo as (
    select b.m, count(*)::integer as n, count(*) filter (where b.involuntaria)::integer as invol
    from baja b group by b.m
  ),
  motivos as (
    select q.m, jsonb_object_agg(q.codigo, q.n) as j
    from (select b.m, b.codigo, count(*) as n from baja b group by b.m, b.codigo) q
    group by q.m
  ),
  origenes as (
    select q.m, jsonb_object_agg(q.origen, q.n) as j
    from (select b.m, b.origen, count(*) as n from baja b group by b.m, b.origen) q
    group by q.m
  )
  select
    x.m,
    sm.tenants_activos,
    coalesce(c.n, 0),
    coalesce(c.invol, 0),
    coalesce(c.n, 0) - coalesce(c.invol, 0),
    coalesce(mo.j, '{}'::jsonb),
    coalesce(o.j,  '{}'::jsonb),
    round(coalesce(c.n, 0)::numeric / nullif(sm.tenants_activos, 0), 4)
  from meses x
  left join snapshots_mensuales sm on sm.mes = (x.m - interval '1 month')::date
  left join conteo   c  on c.m  = x.m
  left join motivos  mo on mo.m = x.m
  left join origenes o  on o.m  = x.m
  order by x.m;
end;
$$;
-- <<< churn_por_mes

comment on function churn_por_mes is
  'El churn de cada mes del rango, por tipo y por origen (docs/METRICAS.md § 1 «Churn del mes, por tipo y por origen»): bajas = eventos suspension + suspension_reloj con ocurrido_at en el mes (hora argentina); involuntarias = suspension_reloj + suspension con motivo falta_de_pago (el motivo empieza con el código); voluntarias = el resto; por_motivo = {falta_de_pago | reloj | pedido_del_cliente | cierre_del_negocio | otro: n} solo con n > 0 (sin motivo o irreconocible → otro); por_origen = {lubricentros.origen | sin_origen: n}; tenants_inicio = tenants_activos de snapshots_mensuales del mes anterior (null si no hay); churn_pct = bajas ÷ tenants_inicio (fracción). Todos los meses del rango, con ceros. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 6 · altas_bajas_por_mes — ¿entran más de los que se van?
-- ════════════════════════════════════════════════════════════════════

-- >>> altas_bajas_por_mes
create or replace function altas_bajas_por_mes(p_desde date, p_hasta date)
returns table (
  mes            date,
  altas          integer,
  bajas          integer,
  reactivaciones integer,
  neto           integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := date_trunc('month', p_hasta)::date;
  v_piso  timestamptz := (v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires');
  v_tope  timestamptz := ((v_hasta + interval '1 month')::date::timestamp at time zone 'America/Argentina/Buenos_Aires');
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve las altas y bajas' using errcode = '42501';
  end if;

  return query
  with meses as (
    select generate_series(v_desde, v_hasta, interval '1 month')::date as m
  ),
  alta as (
    -- El alta es lubricentros.created_at, no el evento: el evento `alta` de
    -- los tenants anteriores al bloque 1 es del backfill.
    select date_trunc('month', l.created_at at time zone 'America/Argentina/Buenos_Aires')::date as m,
           count(*)::integer as n
    from lubricentros l
    where l.created_at >= v_piso and l.created_at < v_tope
    group by 1
  ),
  ev as (
    select date_trunc('month', e.ocurrido_at at time zone 'America/Argentina/Buenos_Aires')::date as m,
           count(*) filter (where e.tipo in ('suspension',   'suspension_reloj'))::integer   as bajas_,
           count(*) filter (where e.tipo in ('reactivacion', 'reactivacion_reloj'))::integer as react_
    from tenant_eventos e
    where e.tipo in ('suspension', 'suspension_reloj', 'reactivacion', 'reactivacion_reloj')
      and e.ocurrido_at >= v_piso and e.ocurrido_at < v_tope
    group by 1
  )
  select
    x.m,
    coalesce(a.n, 0),
    coalesce(e.bajas_, 0),
    coalesce(e.react_, 0),
    coalesce(a.n, 0) - coalesce(e.bajas_, 0)
  from meses x
  left join alta a on a.m = x.m
  left join ev   e on e.m = x.m
  order by x.m;
end;
$$;
-- <<< altas_bajas_por_mes

comment on function altas_bajas_por_mes is
  'Altas, bajas, reactivaciones y neto de cada mes del rango (docs/METRICAS.md § 1 «Altas y bajas por mes»): altas = tenants con lubricentros.created_at en el mes (hora argentina); bajas = eventos suspension + suspension_reloj; reactivaciones = eventos reactivacion + reactivacion_reloj; neto = altas − bajas. Todos los meses del rango, con ceros. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 7 · trabajos_por_mes — ¿usan el sistema?
-- ════════════════════════════════════════════════════════════════════
--
-- Suma TODAS las fotos diarias del mes (no la última): los trabajos del
-- mes son la suma de los de cada día. `autos_que_volvieron` se pide a la
-- función del bloque 3 entre el día 1 y el último día con foto del mes,
-- para que la ventana sea la misma que la de las fotos.

-- >>> trabajos_por_mes
create or replace function trabajos_por_mes(p_desde date, p_hasta date)
returns table (
  mes                 date,
  en_curso            boolean,
  total               integer,
  service             integer,
  mecanica            integer,
  neumaticos          integer,
  autos_que_volvieron integer,
  recordatorios       integer,
  escaneos            integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := date_trunc('month', p_hasta)::date;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli ve los trabajos por mes' using errcode = '42501';
  end if;

  return query
  select
    m.mes,
    m.en_curso,
    sum(d.trabajos_dia)::integer,
    sum(d.trabajos_service)::integer,
    sum(d.trabajos_mecanica)::integer,
    sum(d.trabajos_neumaticos)::integer,
    autos_que_volvieron_plataforma(m.mes, m.fecha),
    sum(d.recordatorios_dia)::integer,
    sum(d.escaneos_dia)::integer
  from snapshots_mensuales m
  join snapshots_diarios d
    on d.fecha >= m.mes and d.fecha < (m.mes + interval '1 month')::date
  where m.mes between v_desde and v_hasta
  group by m.mes, m.en_curso, m.fecha
  order by m.mes;
end;
$$;
-- <<< trabajos_por_mes

comment on function trabajos_por_mes is
  'Los trabajos de cada mes del rango (docs/METRICAS.md § 1 «Trabajos por mes»): la suma de trabajos_dia (y por tipo), recordatorios_dia y escaneos_dia de TODAS las fotos diarias del mes, más autos_que_volvieron_plataforma() entre el día 1 y el último día con foto del mes; en_curso de snapshots_mensuales. Solo los meses con alguna foto. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 8 · Permisos
-- ════════════════════════════════════════════════════════════════════
-- Los default privileges del schema están revocados de PUBLIC: cada
-- función nueva se granta a mano. `anon` no llega a ninguna.

revoke all on function movimientos_mrr(date, date, text)  from public, anon;
revoke all on function cohortes_logos(date, date)         from public, anon;
revoke all on function cohortes_ingresos(date, date)      from public, anon;
revoke all on function churn_por_mes(date, date)          from public, anon;
revoke all on function altas_bajas_por_mes(date, date)    from public, anon;
revoke all on function trabajos_por_mes(date, date)       from public, anon;

grant execute on function movimientos_mrr(date, date, text) to authenticated, service_role;
grant execute on function cohortes_logos(date, date)        to authenticated, service_role;
grant execute on function cohortes_ingresos(date, date)     to authenticated, service_role;
grant execute on function churn_por_mes(date, date)         to authenticated, service_role;
grant execute on function altas_bajas_por_mes(date, date)   to authenticated, service_role;
grant execute on function trabajos_por_mes(date, date)      to authenticated, service_role;
