-- ════════════════════════════════════════════════════════════════════
-- LA ATENCIÓN DE /fidelli TAMBIÉN EXIME AL 100%
--
-- `estado_atencion(estado, vencimiento)` no conoce `descuento_pct`, así que
-- la lista de "a quién llamar" le reclama a quien no debe nada. El caso
-- concreto, con fecha: el **20/09/2026** Brothers Oil aparece como
-- `cobranza_por_vencer` y el **28/09** como `cobranza_vencida`, con el
-- plan bonificado al 100 y una deuda de cero pesos.
--
-- La regla del 100% ya estaba escrita DOS veces —`estado_cobranza()` en su
-- rama `@exento` (20260916140000) y `cobranzas_pendientes()` en su
-- `coalesce(v.descuento_pct, 0) < 100` (20260916220000)— y esta función,
-- que es la más vieja de las tres, nunca se enteró. Es la regla 17 de
-- CLAUDE.md: quien no paga nada no puede deber nada, y queda fuera del
-- circuito ENTERO.
--
-- ⚠ SE ARREGLA LA REGLA, NO LA FILA. Mover la fecha de vencimiento de
-- Brothers Oil lo saca de la lista hasta diciembre y no hace nada por el
-- próximo tenant al 100%. El descuento entra a la firma y la decisión
-- vuelve a vivir en un solo lugar.
--
-- ⚠ EXIME LOS CUATRO ESTADOS, no solo los dos de cobranza. Un tenant al
-- 100% tampoco es un `trial_vencido`: no hay venta que cerrar cuando el
-- precio ya es cero, y es el mismo criterio con el que `estado_cobranza()`
-- manda al exento a `al_dia` sin mirar si es trial. La verificación lo dice
-- corto: «no aparece en la lista de atención en ninguna fecha».
--
-- ⚠ LA LÍNEA MARCADA `-- @exento_atencion` NO SE REFORMATEA NUNCA.
-- `scripts/regresion-cobranza-deudas.sh` la muerde con `sed`; si cambia de
-- forma el script lo dice con «EL SED NO MORDIÓ» en vez de dejar pasar un
-- falso verde. Lo mismo con los marcadores `-- >>> nombre` / `-- <<< nombre`,
-- que son el rango que recorta el `awk`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La función, ahora con tres argumentos
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠ EL DROP ES OBLIGATORIO Y NO ES HIGIENE. Un `create or replace` con la
-- firma de tres argumentos no reemplaza nada: crea una SOBRECARGA. Las dos
-- llamadas vivas pasan dos argumentos, seguirían resolviendo a la función
-- vieja, la migración terminaría en verde y NO CAMBIARÍA NADA.
--
-- Va sin `cascade` a propósito: ninguna vista depende de ella (los dos
-- llamadores son funciones SQL, con el cuerpo en un string, así que
-- Postgres no registra la dependencia). Si algún día este drop falla, es
-- porque alguien creó una vista encima y hay que mirarla, no taparla.
--
-- Y por eso mismo los dos llamadores se redefinen ACÁ ABAJO, en esta misma
-- migración: al aplicarla no falla nada —el cuerpo no se valida— pero
-- `listado_lubricentros()` explotaría en runtime con «function
-- estado_atencion(estado_suscripcion, date) does not exist» y /fidelli se
-- vería VACÍO, diciendo "Todavía no hay ningún lubricentro", sin un error a
-- la vista. Es el modo de falla que documenta R15i y que ya pasó una vez.

drop function if exists estado_atencion(estado_suscripcion, date);

-- >>> estado_atencion
create or replace function estado_atencion(
  p_estado        estado_suscripcion,
  p_vencimiento   date,
  p_descuento_pct numeric
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    -- Quien no paga nada no puede deber nada. Va PRIMERO, antes que
    -- cualquier fecha, y exime los cuatro estados: el exento no está
    -- vencido, ni por vencer, ni es una venta por cerrar. Mismo corte y
    -- mismo criterio que la rama `@exento` de estado_cobranza().
    when coalesce(p_descuento_pct, 0) >= 100    then null              -- @exento_atencion

    -- Se acabó la prueba y nunca pagó: lo más urgente que hay.
    when p_estado = 'trial' and p_vencimiento < current_date
      then 'trial_vencido'
    -- Ya es cliente y debe. 'activa' con la fecha pasada cuenta igual:
    -- el estado no se mueve solo, lo mueve el pago.
    when p_estado = 'vencida'
      or (p_estado = 'activa' and p_vencimiento < current_date)
      then 'cobranza_vencida'
    when p_estado = 'trial' and p_vencimiento <= current_date + dias_de_aviso()
      then 'trial_por_vencer'
    when p_estado = 'activa' and p_vencimiento <= current_date + dias_de_aviso()
      then 'cobranza_por_vencer'
    -- 'cancelada' no necesita nada: se fue.
    else null
  end;
$$;
-- <<< estado_atencion

comment on function estado_atencion is
  'trial_vencido | cobranza_vencida | trial_por_vencer | cobranza_por_vencer, o null si no necesita nada. Un descuento del 100% exime los cuatro: quien no paga nada no puede deber nada.';

-- Los privilegios NO se heredan entre sobrecargas ni sobreviven al drop:
-- los del par (estado_suscripcion, date) se fueron con la función vieja y
-- hay que volver a escribirlos para la firma nueva. Se agrega `anon`, que
-- la versión original no revocaba explícitamente.
revoke execute on function estado_atencion(estado_suscripcion, date, numeric) from public, anon;
grant  execute on function estado_atencion(estado_suscripcion, date, numeric) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · Los dos llamadores, con el dato que ya tenían a mano
-- ════════════════════════════════════════════════════════════════════

-- ---------- 2.a · listado_lubricentros() ----------
--
-- Es la versión de 20260911120100 con UNA línea cambiada: la llamada a
-- `estado_atencion()`. El descuento ya estaba en el CTE `vigente` y ya
-- viajaba a la salida como `sub_descuento_pct`; lo único que faltaba era
-- pasárselo al CASE.
--
-- `create or replace` alcanza porque el `returns table` no cambia. Y el
-- `coalesce` no es decorativo: `vigente` entra por LEFT JOIN, así que un
-- tenant sin suscripción trae `v.descuento_pct` en null.

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
  -- El módulo pago de gomería, resuelto EN LÍNEA con los tres escalones
  -- de feature_de_tenant (override → plan → cerrado) y no llamándola.
  --
  -- No se la llama a propósito: feature_de_tenant es SECURITY DEFINER sin
  -- guarda de llamador —acepta cualquier lubricentro_id— y por eso NO
  -- está grantada a authenticated; la puerta pública es plan_permite(),
  -- que se ata a mi_lubricentro_id(). Como esta función es security
  -- INVOKER, llamarla desde acá la hace fallar con "permission denied" y
  -- el listado de /fidelli se vacía SIN ERROR VISIBLE: la pantalla dice
  -- "Todavía no hay ningún lubricentro". Pasó al escribir este bloque.
  -- Grantarla habría sido peor: cualquier owner podría leer las features
  -- de cualquier tenant.
  --
  -- Acá los datos ya están a mano (plan_overrides del tenant y features
  -- del plan vigente, los dos en el CTE base) y el RLS de lubricentros ya
  -- decide qué filas se ven, así que la resolución sale igual sin abrir
  -- ninguna puerta. Lo vigila R15i.
  modulo_neumaticos boolean
)
language sql
stable
set search_path = public
as $$
  with
  vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  actividad as (
    select
      sv.lubricentro_id,
      count(*) filter (
        where sv.fecha >= date_trunc('month', current_date))::integer as del_mes,
      max(sv.fecha) as ultimo
    from services sv
    where not sv.anulado
    group by sv.lubricentro_id
  ),
  owners as (
    select * from estados_owner()
  ),
  base as (
    select
      l.*,
      v.id as v_id, v.estado as v_estado, v.periodo as v_periodo,
      v.descuento_pct as v_desc, v.vencimiento as v_venc, v.plan_id as v_plan,
      p.nombre as p_nombre, p.precio_mensual as p_precio,
      p.descuento_semestral_pct as p_sem, p.descuento_anual_pct as p_anual,
      p.features as p_features,
      coalesce(a.del_mes, 0) as del_mes,
      a.ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,
      (select u.nombre from usuarios u
        where u.lubricentro_id = l.id and u.rol = 'owner' limit 1) as o_nombre,
      estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) as atencion
    from lubricentros l
    left join vigente   v on v.lubricentro_id = l.id
    left join planes    p on p.id = v.plan_id
    left join actividad a on a.lubricentro_id = l.id
    left join owners    o on o.lubricentro_id = l.id
  )
  select
    b.id, b.nombre, b.slug, b.activo, b.calcos_entregadas, b.created_at::date,
    b.v_id, b.v_estado, b.v_periodo, b.v_desc, b.v_venc,
    b.v_plan, b.p_nombre, b.p_precio, b.p_sem, b.p_anual,
    b.del_mes, b.ultimo,
    b.o_estado, b.o_nombre,
    b.atencion,
    orden_atencion(b.atencion),
    contactado_fidelli(b.id),
    telefono_de_contacto(b.id),
    (ob.estado->>'paso_actual')::integer,
    (ob.estado->>'pasos')::integer,
    (ob.estado->>'avance_at')::timestamptz,
    -- Los tres escalones, en el mismo orden que feature_de_tenant.
    coalesce(
      (b.plan_overrides ->> 'neumaticos')::boolean,
      (b.p_features     ->> 'neumaticos')::boolean,
      false
    )
  from base b
  cross join lateral onboarding_estado(b.id) as ob(estado)
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
$$;

comment on function listado_lubricentros is
  'La tabla de /fidelli en una consulta, con la atención (que ya exime al 100%), el check, el onboarding y el módulo de gomería ya resueltos. Security invoker: el RLS decide qué tenants se ven.';

revoke execute on function listado_lubricentros() from public;
grant execute on function listado_lubricentros() to authenticated;


-- ---------- 2.b · atencion_tenant() ----------
--
-- La ficha tiene que decir lo mismo que el listado sobre el mismo tenant,
-- que es toda la razón por la que comparte las funciones en vez de repetir
-- el CASE. Su subselect traía solo estado y vencimiento: se le suma la
-- columna, sin tocar el criterio de vigencia, que ya es el del repo.

create or replace function atencion_tenant(p_lubricentro_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'atencion', estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)),
    'contactado', contactado_fidelli(p_lubricentro_id),
    'telefono', telefono_de_contacto(p_lubricentro_id),
    'owner_nombre', (select u.nombre from usuarios u
                      where u.lubricentro_id = p_lubricentro_id
                        and u.rol = 'owner' limit 1)
  )
  from (
    select s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    where s.lubricentro_id = p_lubricentro_id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v;
$$;

comment on function atencion_tenant is
  'El estado de atención de un solo tenant, con las mismas funciones que usa el listado. Un descuento del 100% lo deja en null, igual que en la lista.';

revoke execute on function atencion_tenant(uuid) from public;
grant execute on function atencion_tenant(uuid) to authenticated;
