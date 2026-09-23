-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 4 · las consultas que hacían trabajo por fila
--
-- Dos lecturas del admin crecían con la cantidad de tenants y de días de la
-- peor manera: no por leer más filas, sino por llamar funciones POR FILA.
--
--   · `listado_lubricentros()` llamaba, por cada tenant, a
--     `contactado_fidelli()`, `telefono_de_contacto()`, `onboarding_estado()`
--     (que a su vez llama `feature_de_tenant()` dos veces y lee `productos`
--     y `premios`) y un subselect sobre `usuarios`. Con 17 tenants son más
--     de cien consultas escondidas adentro de una; con 100 tenants, más de
--     seiscientas. Acá se reescribe con CTEs de UNA pasada por tabla y el
--     mismo `returns table` de 28 columnas, en el mismo orden y tipo: la
--     pantalla y `lib/database.types.ts` no cambian.
--   · `metricas_plataforma()` contaba cada punto de las tres series con un
--     `count(*)` correlacionado sobre `services`: 30 + 12 + 12 = 54 pasadas
--     por la tabla más grande del sistema. Acá se agrupa UNA vez por fecha
--     y los puntos de `generate_series` se cuelgan de ese agrupado. La
--     salida jsonb es EXACTAMENTE la misma (R34h la compara con `=`).
--
-- Y dos funciones nuevas para que la ficha y la pantalla de precios dejen
-- de traer el listado entero:
--
--   · `estado_owner(p_lubricentro_id)` — el estado del owner de UN tenant,
--     con la misma regla que `estados_owner()` (`auth.users.last_sign_in_at`).
--   · `suscriptos_por_plan()` — las seis columnas que `app/fidelli/precios`
--     necesita, una fila por tenant con suscripción vigente.
--
-- Lo que se midió antes de escribir (explain-performance.md): con RLS
-- prendido, cada fila de `services` que una consulta VISITA paga
-- `mi_lubricentro_id()` y `soy_superadmin()` (dos lecturas de `usuarios`,
-- ~27 µs por fila). Por eso lo que manda no es cuántas veces se llama a
-- una función, sino cuántas PASADAS COMPLETAS se hacen por `services`, y
-- por eso las dos reescrituras cuentan pasadas: el pulso baja de ~4,3 N a
-- 1 N (una sola pasada alimenta las series, el acumulado y el primer
-- trabajo), y el listado deja de recorrer `services` entero para contar el
-- mes y buscar el último trabajo (índice parcial por `fecha` para el mes,
-- `services_lubricentro_fecha_idx` para el último, un sondeo por tenant).
--
--   · Índice nuevo `services_fecha_idx (fecha) where not anulado`: no había
--     ninguno con `fecha` adelante, así que «trabajos del mes» era un seq
--     scan en el pulso, en el listado y en resumen_admin(). Parcial sobre
--     `not anulado` porque todas esas lecturas filtran así. Y para que el
--     índice sirva con RLS la comparación tiene que ser `date >= date`
--     (`::date` sobre el `date_trunc`): `date >= timestamptz` no es
--     leakproof y el planificador no lo baja al índice (ver el comentario
--     en `del_mes`).
--
-- Lo que NO cambia: `estado_atencion()` se sigue llamando por fila. Es la
-- regla única de la atención (R24 vive de que el listado y la ficha la
-- compartan) y no es de la lista prohibida; inlinearla sería copiar la
-- regla del 100% una vez más, que es justo lo que 20260917100000 vino a
-- borrar. `estados_owner()` se sigue llamando UNA vez (no por fila): es la
-- única puerta con guarda hacia `auth.users`, que `authenticated` no puede
-- leer. `feature_de_tenant()` NO se llama (regla 12 de CLAUDE.md, R15i):
-- sus tres escalones se resuelven en línea sobre `plan_overrides` y
-- `planes.features`, igual que ya hacía el listado con el módulo.
--
-- Todas con guarda `soy_superadmin()` → 42501 antes de leer nada;
-- `listado_lubricentros()` la gana explícita (antes la daba `estados_owner()`
-- desde adentro, con el mismo código pero después de armar medio plan).
--
-- ⚠ Las líneas marcadas `-- @algo` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-metricas.sh los
-- muerde con sed para romper cada regla a propósito (regla 13). Los dos de
-- `metricas_plataforma()` (`@serie_todos`, `@trabajos_mes`) se conservan
-- de 20260924102000 en las líneas equivalentes: el script apunta acá. Los
-- nuevos de este archivo: `@owner_estado_listado`, `@owner_mas_viejo` (×2),
-- `@modulo_plan`, `@sin_trabajos`, `@regla_owner`, `@suscriptos_vigente`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 0 · El índice por fecha
-- ════════════════════════════════════════════════════════════════════
--
-- «Trabajos del mes» (`fecha >= date_trunc('month', current_date)` con
-- `not anulado`) se lee en tres lugares y hasta hoy era una pasada completa
-- por `services`: los índices existentes arrancan por vehículo, sucursal o
-- tenant. Con este, el mes se recorre solo. `if not exists` por si el reset
-- local corre dos veces.

create index if not exists services_fecha_idx on services (fecha) where not anulado;


-- ════════════════════════════════════════════════════════════════════
-- 1 · listado_lubricentros() — una pasada por tabla
-- ════════════════════════════════════════════════════════════════════
--
-- Qué se inlinea y de dónde sale cada regla (para que la próxima vez que
-- cambie la original se pueda encontrar la copia):
--
--   contactado      ← contactado_fidelli() (20260726230000): hay un contacto
--                     de Fidelli posterior al último pago, o al alta si no
--                     pagó nunca. max() por tenant sobre `pagos` y sobre
--                     `contactos_fidelli` en vez de un exists por fila.
--   telefono        ← telefono_de_contacto() (20260726230000): el WhatsApp
--                     de `config_experiencia.datos_contacto`, y si no, el
--                     de la primera sucursal activa con teléfono (por
--                     created_at). `distinct on` por tenant.
--   owner_nombre    ← el subselect `limit 1` del listado viejo, ahora
--                     `distinct on` ordenado por created_at, id: el viejo
--                     no ordenaba, así que con dos owners elegía cualquiera;
--                     este elige el más antiguo, siempre el mismo, y con el
--                     MISMO created_at el de id menor (un uuid: el desempate
--                     es tan arbitrario como el heap, pero fijo).
--   onboarding_*    ← onboarding_estado_de() (20260909180000): productos
--                     (cualquiera, activo o no), diseño confirmado, premio
--                     definido u omitido, y si el premio APLICA según la
--                     feature `premios` del tenant. Tres CTEs agrupados.
--   services_mes y ultimo_service ← el CTE `actividad` del listado viejo,
--                     que era `group by lubricentro_id` sobre services
--                     ENTERA (N filas, cada una pagando el RLS). Ahora el
--                     mes sale del índice parcial por fecha (solo las filas
--                     del mes) y el último trabajo de un sondeo por tenant
--                     por índice (max(fecha) = una fila por tenant). Mismo
--                     número, N filas menos.
--   modulo_neumaticos y aplica_premio ← feature_de_tenant() (20260822150000):
--                     override del tenant si es booleano → feature del plan
--                     de la suscripción vigente si es booleano → cerrado.
--                     `jsonb_typeof = 'boolean'` es literalmente lo que hace
--                     la original; un valor no booleano se saltea, no
--                     revienta.
--
-- Va en plpgsql y no en sql por la guarda: una función `language sql` no
-- puede levantar 42501 antes de la consulta. Con `set search_path` de por
-- medio el planificador tampoco la inlineaba antes, así que no se pierde
-- nada. `create or replace` alcanza: el `returns table` no cambia.

-- >>> listado_lubricentros
create or replace function listado_lubricentros()
returns table (
  id                uuid,
  nombre            text,
  slug              text,
  activo            boolean,
  calcos_entregadas integer,
  creado            date,
  suscripcion_id    uuid,
  sub_estado        estado_suscripcion,
  sub_periodo       periodo_suscripcion,
  sub_descuento_pct numeric,
  sub_vencimiento   date,
  plan_id           uuid,
  plan_nombre       text,
  plan_precio       numeric,
  plan_desc_sem     numeric,
  plan_desc_anual   numeric,
  services_mes      integer,
  ultimo_service    date,
  owner_estado      text,
  owner_nombre      text,
  atencion          text,
  atencion_orden    integer,
  contactado        boolean,
  telefono          text,
  onboarding_paso   integer,
  onboarding_pasos  integer,
  onboarding_avance timestamptz,
  modulo_neumaticos boolean
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver el listado de lubricentros'
      using errcode = '42501';
  end if;

  -- Todo lo que sigue va calificado (l., v., b.…) a propósito: en plpgsql
  -- los nombres de las columnas de salida son variables, y una referencia
  -- suelta a `id` o `telefono` sería ambigua.
  return query
  with
  -- Un lubricentro acumula suscripciones (el histórico no se borra). La
  -- vigente es la última que arrancó; es el mismo criterio de la ficha,
  -- de feature_de_tenant() y de suscriptos_por_plan().
  vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  -- Solo las filas del mes, por el índice parcial por fecha. El `::date`
  -- no es cosmético: `date_trunc()` devuelve timestamptz y el operador
  -- `date >= timestamptz` NO es leakproof, así que con RLS el planificador
  -- no puede usarlo como condición de índice y evalúa la policy en TODAS
  -- las filas (medido: 2.000 buffers contra 152). `date >= date` sí lo es.
  del_mes as (
    select sv.lubricentro_id, count(*)::integer as n
    from services sv
    where not sv.anulado
      and sv.fecha >= date_trunc('month', current_date)::date
    group by sv.lubricentro_id
  ),
  -- Una sola llamada para todos los tenants: es definer con guarda y la
  -- única que puede mirar auth.users. Devuelve UNA FILA POR USUARIO owner,
  -- así que un tenant con dos owners (una reinvitación con otro mail) sale
  -- DOS veces en el listado, una por estado. La versión anterior hacía
  -- exactamente lo mismo y se conserva a propósito: este archivo cambia
  -- cómo se lee, no qué se devuelve (R34g lo compara fila por fila, con un
  -- tenant de dos owners entre los fixtures). En producción cada tenant
  -- tiene un owner.
  owners as (
    select eo.lubricentro_id, eo.estado from estados_owner() eo
  ),
  -- El nombre del owner: con dos, el más antiguo (created_at, id), siempre
  -- el mismo. El subselect viejo era `limit 1` sin order by y elegía
  -- cualquiera; es la única salida que puede diferir de la versión
  -- anterior, y solo con dos owners. Con el MISMO created_at (dos
  -- invitaciones en la misma transacción) decide el id: un uuid al azar,
  -- o sea un desempate tan arbitrario como el heap, pero fijo y el mismo
  -- que usa estado_owner(), para que la ficha y el listado hablen del
  -- mismo owner también en el empate (R34g lo prueba con un tenant así).
  duenos as (
    select distinct on (u.lubricentro_id) u.lubricentro_id, u.nombre
    from usuarios u
    where u.rol = 'owner'
    order by u.lubricentro_id, u.created_at, u.id                           -- @owner_mas_viejo
  ),
  ultimo_pago as (
    select pg.lubricentro_id, max(pg.created_at) as at
    from pagos pg
    group by pg.lubricentro_id
  ),
  ultimo_contacto as (
    select cf.lubricentro_id, max(cf.created_at) as at
    from contactos_fidelli cf
    group by cf.lubricentro_id
  ),
  tel_sucursal as (
    select distinct on (su.lubricentro_id)
      su.lubricentro_id, nullif(trim(su.telefono), '') as tel
    from sucursales su
    where su.activa
      and nullif(trim(su.telefono), '') is not null
    order by su.lubricentro_id, su.created_at
  ),
  -- Paso 1 del onboarding: cualquier producto cuenta, activo o no.
  catalogo as (
    select pr.lubricentro_id, count(*)::integer as n, max(pr.created_at) as ultimo
    from productos pr
    group by pr.lubricentro_id
  ),
  -- Paso 3: "definido" es que exista la fila del programa, activo o no.
  programa as (
    select pm.lubricentro_id, max(pm.created_at) as ultimo
    from premios pm
    group by pm.lubricentro_id
  ),
  base as (
    select
      l.id, l.nombre, l.slug, l.activo, l.calcos_entregadas, l.created_at,
      l.plan_overrides, l.diseno_confirmado_at, l.premio_omitido_at,
      l.onboarding_completado_at,
      v.id as v_id, v.estado as v_estado, v.periodo as v_periodo,
      v.descuento_pct as v_desc, v.vencimiento as v_venc, v.plan_id as v_plan,
      p.nombre as p_nombre, p.precio_mensual as p_precio,
      p.descuento_semestral_pct as p_sem, p.descuento_anual_pct as p_anual,
      p.features as p_features,
      coalesce(dm.n, 0) as del_mes,
      ult.fecha as ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,                       -- @owner_estado_listado
      d.nombre as o_nombre,
      -- La regla única de la atención, con el descuento puesto (R24).
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion,
      -- Sin contactos el max() es null, y null > x es null: por eso el
      -- coalesce a false, que es lo que devolvía el exists.
      coalesce(uc.at > coalesce(up.at, l.created_at), false) as contactado,
      coalesce(nullif(trim(ce.datos_contacto ->> 'whatsapp'), ''), ts.tel) as telefono,
      coalesce(c.n, 0) as productos,
      c.ultimo as ultimo_producto,
      (pg.lubricentro_id is not null) as premio_definido,
      pg.ultimo as premio_at,
      -- Los tres escalones de feature_de_tenant(), en línea.
      case
        when jsonb_typeof(l.plan_overrides -> 'premios') = 'boolean'
          then (l.plan_overrides ->> 'premios')::boolean
        when jsonb_typeof(p.features -> 'premios') = 'boolean'
          then (p.features ->> 'premios')::boolean
        else false
      end as aplica_premio,
      case
        when jsonb_typeof(l.plan_overrides -> 'neumaticos') = 'boolean'
          then (l.plan_overrides ->> 'neumaticos')::boolean
        when jsonb_typeof(p.features -> 'neumaticos') = 'boolean'          -- @modulo_plan
          then (p.features ->> 'neumaticos')::boolean
        else false
      end as modulo
    from lubricentros l
    left join vigente            v  on v.lubricentro_id  = l.id
    left join planes             p  on p.id              = v.plan_id
    left join del_mes            dm on dm.lubricentro_id = l.id
    -- El último trabajo: un sondeo por tenant que el planificador resuelve
    -- como «primera fila del índice» (services_lubricentro_fecha_idx bajo
    -- carga; el parcial por fecha con pocas filas) y no como una pasada.
    left join lateral (
      select max(sv.fecha) as fecha
      from services sv
      where sv.lubricentro_id = l.id
        and not sv.anulado
    ) ult on true
    left join owners             o  on o.lubricentro_id  = l.id
    left join duenos             d  on d.lubricentro_id  = l.id
    left join ultimo_pago        up on up.lubricentro_id = l.id
    left join ultimo_contacto    uc on uc.lubricentro_id = l.id
    left join config_experiencia ce on ce.lubricentro_id = l.id
    left join tel_sucursal       ts on ts.lubricentro_id = l.id
    left join catalogo           c  on c.lubricentro_id  = l.id
    left join programa           pg on pg.lubricentro_id = l.id
  )
  select
    b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.created_at::date,
    b.v_id, b.v_estado, b.v_periodo, b.v_desc, b.v_venc,
    b.v_plan, b.p_nombre, b.p_precio, b.p_sem, b.p_anual,
    b.del_mes, b.ultimo,
    b.o_estado, b.o_nombre,
    b.atencion,
    orden_atencion(b.atencion),
    b.contactado,
    b.telefono,
    -- El paso actual es el primero que falta, en orden. Null = todos
    -- hechos, o el onboarding completado por decreto (las cuentas
    -- anteriores a 20260909180000).
    case
      when b.onboarding_completado_at is not null then null
      when b.productos = 0 then 1
      when b.diseno_confirmado_at is null then 2
      when b.aplica_premio and not b.premio_definido and b.premio_omitido_at is null then 3
      else null
    end,
    case when b.aplica_premio then 3 else 2 end,
    -- El último avance: lo más reciente de todo lo que cuenta como paso.
    greatest(b.ultimo_producto, b.diseno_confirmado_at, b.premio_at, b.premio_omitido_at),
    b.modulo
  from base b
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
end;
$$;
-- <<< listado_lubricentros

comment on function listado_lubricentros is
  'La tabla de /fidelli/lubricentros en una consulta: suscripción vigente, plan, actividad (services_mes y ultimo_service cuentan trabajos según docs/METRICAS.md § 1 «Trabajo»: no anulados, de cualquier tipo), owner (una fila por owner: con dos, el tenant sale dos veces, como siempre; owner_nombre es el más antiguo por created_at y, con empate, el de id menor), atención (regla única de estado_atencion, que exime al 100%), contactado, teléfono, onboarding y módulo de gomería, todo resuelto con una pasada por tabla y sin funciones por fila (bloque MÉTRICAS 4, decisiones en docs/METRICAS.md § 6). Solo superadmin (42501 si no); security invoker, el RLS es la segunda capa.';

revoke all on function listado_lubricentros() from public, anon;
grant execute on function listado_lubricentros() to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 2 · metricas_plataforma() — una pasada por services
-- ════════════════════════════════════════════════════════════════════
--
-- Mismo contrato que 20260924102000: `trabajos_mes`, `acumulado`,
-- `primer_trabajo` y `series` con `dia` × 30, `semana` × 12 y `mes` × 12,
-- cada punto con `inicio`, `cantidad`, `service`, `mecanica`, `neumaticos`.
-- Cambia solo cómo se cuenta:
--
--   1. `por_dia` agrupa `services` UNA vez por fecha (los tres tipos y el
--      total). Es la única lectura completa de la tabla: de ahí salen las
--      tres series, el `acumulado` (Σ total) y el `primer_trabajo`
--      (min fecha), que antes eran dos pasadas más.
--   2. `por_bucket` recorta cada fecha a su día, su semana y su mes con
--      `date_trunc`, que es exactamente el rango `[inicio, inicio + paso)`
--      del count correlacionado (la semana arranca el lunes en los dos
--      lados; el mes, el día 1).
--   3. `puntos` es el `generate_series` de siempre y cada punto se cuelga
--      de su bucket por igualdad; los que no tienen trabajos salen en 0.
--      Sin trabajos no hay puntos y las tres series salen `[]`, como la
--      rama explícita que tenía la versión vieja: lo garantiza el `where
--      r.primero is not null` de `puntos` (`@sin_trabajos`; sin él,
--      greatest() ignora el null y una base recién instalada vería 30
--      puntos en cero). R34h lo prueba con `services` vacía en una
--      subtransacción que se deshace.
--
-- `trabajos_mes` se queda como subconsulta escalar propia y no se deriva
-- del agrupado: la línea `@trabajos_mes` la muerde R32f con `sed` sobre el
-- texto `where not anulado`, y una lectura desde el CTE la dejaría sin
-- línea que morder (el script diría EL SED NO MORDIÓ). Con el índice
-- parcial por fecha ya no es una pasada: son las filas del mes.

-- >>> metricas_plataforma
create or replace function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_json jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  -- Un trabajo es una fila de services no anulada, DE CUALQUIER TIPO
  -- (docs/METRICAS.md § 1). Ninguna rama de esta función filtra por tipo:
  -- el desglose es además del total, no en vez.
  with
  -- LA pasada por services: una fila por fecha con el total y los tipos.
  por_dia as (
    select
      s.fecha,
      count(*)::integer                                       as total,
      count(*) filter (where s.tipo = 'service')::integer     as svc,
      count(*) filter (where s.tipo = 'mecanica')::integer    as mec,
      count(*) filter (where s.tipo = 'neumaticos')::integer  as neu
    from services s
    where not s.anulado                                        -- @serie_todos
    group by s.fecha
  ),
  resumen as (
    select min(d.fecha) as primero, coalesce(sum(d.total), 0)::bigint as acumulado
    from por_dia d
  ),
  grupos as (
    select * from (values
      ('dia',    'day',   interval '1 day',   30),
      ('semana', 'week',  interval '1 week',  12),
      ('mes',    'month', interval '1 month', 12)
    ) as g(clave, unidad, paso, pasos)
  ),
  -- Cada fecha, sumada en su día, su semana y su mes. Son pocas filas (una
  -- por fecha con trabajos), no la tabla.
  por_bucket as (
    select
      g.clave,
      date_trunc(g.unidad, d.fecha)::date as inicio,
      sum(d.total)::integer as total,
      sum(d.svc)::integer   as svc,
      sum(d.mec)::integer   as mec,
      sum(d.neu)::integer   as neu
    from grupos g
    cross join por_dia d
    group by g.clave, date_trunc(g.unidad, d.fecha)::date
  ),
  -- Los puntos de cada serie: desde el más viejo de la ventana (o el primer
  -- trabajo, si es posterior) hasta el período actual. Sin primer trabajo
  -- no hay puntos: greatest() ignora el null, por eso el where.
  puntos as (
    select g.clave, p.inicio::date as inicio
    from grupos g
    cross join resumen r
    cross join lateral generate_series(
      greatest(
        (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
        date_trunc(g.unidad, r.primero)::date
      ),
      date_trunc(g.unidad, current_date)::date,
      g.paso) as p(inicio)
    where r.primero is not null                                         -- @sin_trabajos
  )
  -- El `::date` de trabajos_mes es el mismo caso que en el listado: sin
  -- él, `date >= timestamptz` no es leakproof, el índice no se usa y la
  -- policy se evalúa en toda la tabla.
  select jsonb_build_object(
    'trabajos_mes', (select count(*) from services
                     where not anulado                                 -- @trabajos_mes
                       and fecha >= date_trunc('month', current_date)::date),
    'acumulado', r.acumulado,
    'primer_trabajo', r.primero,
    'series', (
      select jsonb_object_agg(g.clave, coalesce(serie.datos, '[]'::jsonb))
      from grupos g
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'inicio',     p.inicio,
            'cantidad',   coalesce(b.total, 0),
            'service',    coalesce(b.svc, 0),
            'mecanica',   coalesce(b.mec, 0),
            'neumaticos', coalesce(b.neu, 0))
          order by p.inicio) as datos
        from puntos p
        left join por_bucket b on b.clave = p.clave and b.inicio = p.inicio
        where p.clave = g.clave
      ) serie on true
    )
  )
  into v_json
  from resumen r;

  return v_json;
end;
$$;
-- <<< metricas_plataforma

comment on function metricas_plataforma is
  'El pulso de la plataforma para /fidelli: trabajos del mes, acumulado histórico y las tres series (día × 30, semana × 12, mes × 12), cada punto con el total (`cantidad`) y el desglose `service` / `mecanica` / `neumaticos`. Cuenta trabajos de cualquier tipo (docs/METRICAS.md § 1 «Trabajo»). Desde el bloque MÉTRICAS 4 recorre services una sola vez (agrupada por fecha) en vez de 54 count por punto más dos pasadas; la salida es la misma. Solo superadmin (42501 si no).';

revoke all on function metricas_plataforma() from public, anon;
grant execute on function metricas_plataforma() to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 3 · estado_owner(p_lubricentro_id) — el owner de UN tenant
-- ════════════════════════════════════════════════════════════════════
--
-- La ficha (app/fidelli/[id]) llamaba `estados_owner()` —todos los tenants—
-- para quedarse con una fila. Esta es la versión por tenant, con la misma
-- regla: 'pendiente' si el owner nunca inició sesión, 'activo' si sí, null
-- si el tenant no tiene owner. Con dos owners elige el más antiguo (por
-- `usuarios.created_at`, y con el mismo created_at el de `id` menor): el
-- mismo criterio con que el listado elige `owner_nombre`, para que la
-- cabecera de la ficha y la tabla hablen del mismo owner, también en el
-- empate. `estados_owner()`, en cambio, devuelve una
-- fila por owner; R34i prueba que esta coincide con una de ellas y, con
-- dos, con la del más viejo.
--
-- Security DEFINER porque `auth.users` no es legible para `authenticated`,
-- y por eso mismo la guarda va PRIMERO: sin ella cualquier owner leería si
-- el vecino ya entró al sistema. Es la misma postura que `estados_owner()`.

-- >>> estado_owner
create or replace function estado_owner(p_lubricentro_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede consultar el estado de los owners'
      using errcode = '42501';
  end if;

  if p_lubricentro_id is null then
    return null;
  end if;

  return (
    select case when au.last_sign_in_at is null then 'pendiente' else 'activo' end   -- @regla_owner
    from usuarios u
    join auth.users au on au.id = u.id
    where u.lubricentro_id = p_lubricentro_id
      and u.rol = 'owner'
    order by u.created_at, u.id                                                     -- @owner_mas_viejo
    limit 1
  );
end;
$$;
-- <<< estado_owner

comment on function estado_owner is
  'El estado del owner de un tenant: pendiente (nunca inició sesión), activo, o null si no tiene owner; con dos owners, el del más antiguo por created_at (con empate, el de id menor). La misma regla que estados_owner() (auth.users.last_sign_in_at), para la cabecera de la ficha. No es una métrica de docs/METRICAS.md § 1 (no tiene definición ahí): es un dato operativo del bloque MÉTRICAS 4, anotado en § 2 y § 6. Solo superadmin (42501 si no).';

revoke all on function estado_owner(uuid) from public, anon;
grant execute on function estado_owner(uuid) to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════
-- 4 · suscriptos_por_plan() — lo que precios necesita del listado
-- ════════════════════════════════════════════════════════════════════
--
-- app/fidelli/precios pedía `listado_lubricentros()` entero (28 columnas,
-- onboarding, atención, teléfono…) para pintar, al lado de cada plan,
-- quién lo tiene contratado con qué período, descuento y estado. Esto
-- devuelve solo eso, una fila por tenant CON suscripción, la vigente: el
-- mismo `distinct on` del listado, así las dos pantallas no pueden decir
-- cosas distintas del mismo tenant. Un tenant sin suscripción no aparece
-- (no está suscripto a ningún plan).

-- >>> suscriptos_por_plan
create or replace function suscriptos_por_plan()
returns table (
  plan_id        uuid,
  lubricentro_id uuid,
  nombre         text,
  periodo        periodo_suscripcion,
  descuento_pct  numeric,
  estado         estado_suscripcion
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver los suscriptos por plan'
      using errcode = '42501';
  end if;

  return query
  with vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.plan_id, s.periodo, s.descuento_pct, s.estado
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc            -- @suscriptos_vigente
  )
  select v.plan_id, l.id, l.nombre, v.periodo, v.descuento_pct, v.estado
  from vigente v
  join lubricentros l on l.id = v.lubricentro_id
  order by v.plan_id, l.nombre;
end;
$$;
-- <<< suscriptos_por_plan

comment on function suscriptos_por_plan is
  'Por tenant con suscripción, la vigente (la última que arrancó, el mismo criterio del listado): plan, período, descuento propio y estado. Es lo que /fidelli/precios muestra al lado de cada plan sin traer el listado entero. No es una métrica de docs/METRICAS.md § 1 (no tiene definición ahí): es una lectura operativa del bloque MÉTRICAS 4, anotada en § 2 y § 6. Solo superadmin (42501 si no); security invoker.';

revoke all on function suscriptos_por_plan() from public, anon;
grant execute on function suscriptos_por_plan() to authenticated, service_role;
