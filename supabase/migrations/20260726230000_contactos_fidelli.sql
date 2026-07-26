-- ============================================================
-- Fidelli Motors · El aviso de vencimiento de plan
--
-- El mismo patrón que Bruno usa con sus clientes, aplicado a nosotros con
-- Bruno: abrir /fidelli, ver quién necesita atención, contactar en un tap.
--
-- Son DOS conversaciones distintas y la base las distingue desde acá:
--
--   · TRIAL = una venta por cerrar. Todavía no pagó nunca. Un trial que
--     vence sin que nadie lo llame es plata que se escapa.
--   · COBRANZA = ya es cliente y hay una transferencia pendiente. Es
--     plata ganada que no se cobró.
--
-- Mismo mecanismo, distinta urgencia. El trial vencido va primero porque
-- es el único de los cuatro donde todavía no hubo ni un peso.
-- ============================================================


-- ---------- El umbral, en un solo lugar ----------
-- Una constante y no un 7 suelto en medio de un CASE: el día que se decida
-- avisar con diez días de anticipación se cambia acá y cambia en el
-- listado, en la ficha y en el orden, a la vez.
create or replace function dias_de_aviso()
returns integer
language sql
immutable
parallel safe
as $$
  select 7;
$$;

comment on function dias_de_aviso is
  'Con cuántos días de anticipación un vencimiento entra en "necesitan atención".';


-- ---------- El registro de contactos ----------
create type motivo_contacto_fidelli as enum ('trial', 'cobranza');

create table contactos_fidelli (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- Quién contactó. Es la firma: sin esto no se sabe si el aviso salió.
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  motivo          motivo_contacto_fidelli not null,
  -- canal_contacto ya existe ('whatsapp','manual'): el manual es el llamado
  -- telefónico hecho por afuera del sistema.
  canal           canal_contacto not null,
  created_at      timestamptz not null default now()
);

create index contactos_fidelli_lubricentro_idx
  on contactos_fidelli(lubricentro_id, created_at desc);

comment on table contactos_fidelli is
  'Avisos de vencimiento que mandó el equipo Fidelli. El check del listado sale de comparar su created_at contra el último pago.';

alter table contactos_fidelli enable row level security;

-- Esta tabla es de nuestra operación comercial, no del producto: un owner
-- no tiene por qué saber que lo estamos por llamar, ni cuándo, ni cuántas
-- veces. Una sola policy, para superadmin, en las cuatro operaciones.
create policy contactos_fidelli_admin on contactos_fidelli for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- anon no toca ninguna tabla; se deja explícito igual porque las tablas
-- nuevas heredan los default privileges y este es el que no queremos.
revoke all on table contactos_fidelli from anon;


-- ============================================================
-- Las tres reglas, cada una en su función
--
-- Se separan en vez de escribirlas dentro del listado porque la ficha del
-- tenant necesita exactamente lo mismo para una sola fila. Con la lógica
-- en un lugar, las dos pantallas no pueden contradecirse.
-- ============================================================

-- 1. Qué clase de atención necesita una suscripción.
--    Inmutable y sin tocar tablas: entran dos valores, sale una palabra.
create or replace function estado_atencion(
  p_estado      estado_suscripcion,
  p_vencimiento date
)
returns text
language sql
stable
set search_path = public
as $$
  select case
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

comment on function estado_atencion is
  'trial_vencido | cobranza_vencida | trial_por_vencer | cobranza_por_vencer, o null si no necesita nada.';

-- 2. El orden del trabajo del día. 99 para los que no necesitan nada, así
--    ordenar por esta columna deja arriba lo urgente sin ningún CASE en el
--    front.
create or replace function orden_atencion(p_atencion text)
returns integer
language sql
immutable
parallel safe
as $$
  select case p_atencion
    when 'trial_vencido'       then 1
    when 'cobranza_vencida'    then 2
    when 'trial_por_vencer'    then 3
    when 'cobranza_por_vencer' then 4
    else 99
  end;
$$;

-- 3. El check, relativo al ciclo y no permanente.
--
--    Un tenant está contactado si tiene un aviso POSTERIOR al último pago
--    registrado —o posterior al alta, si nunca pagó—. No hay reseteo
--    manual ni tarea programada: registrar un pago mueve el ancla hacia
--    adelante y el check se apaga solo. Sale de cómo está modelado.
create or replace function contactado_fidelli(p_lubricentro_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from contactos_fidelli cf
    where cf.lubricentro_id = p_lubricentro_id
      and cf.created_at > coalesce(
        (select max(p.created_at) from pagos p
          where p.lubricentro_id = p_lubricentro_id),
        (select l.created_at from lubricentros l where l.id = p_lubricentro_id)
      )
  );
$$;

comment on function contactado_fidelli is
  'Si hay un aviso posterior al último pago. Registrar un pago cierra el ciclo y lo resetea sin que nadie lo destilde.';

-- 4. A qué número escribirle. No tenemos teléfono del owner en el schema,
--    así que se busca en orden: el WhatsApp que el lubri configuró para su
--    landing, y si no, el de su primera sucursal activa.
create or replace function telefono_de_contacto(p_lubricentro_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(ce.datos_contacto->>'whatsapp'), '')
       from config_experiencia ce
      where ce.lubricentro_id = p_lubricentro_id),
    (select nullif(trim(s.telefono), '')
       from sucursales s
      where s.lubricentro_id = p_lubricentro_id
        and s.activa
        and nullif(trim(s.telefono), '') is not null
      order by s.created_at
      limit 1)
  );
$$;

comment on function telefono_de_contacto is
  'El WhatsApp de la landing, y si no hay, el de la primera sucursal activa. Null si el lubri no cargó ninguno.';

revoke execute on function estado_atencion(estado_suscripcion, date) from public;
revoke execute on function orden_atencion(text) from public;
revoke execute on function contactado_fidelli(uuid) from public;
revoke execute on function telefono_de_contacto(uuid) from public;
grant execute on function estado_atencion(estado_suscripcion, date) to authenticated;
grant execute on function orden_atencion(text) to authenticated;
grant execute on function contactado_fidelli(uuid) to authenticated;
grant execute on function telefono_de_contacto(uuid) to authenticated;


-- ============================================================
-- El listado, ahora con la atención resuelta en la consulta
--
-- Cambia la firma de retorno, así que va drop + create: un create or
-- replace no puede cambiar el TABLE que devuelve.
--
-- El cálculo de quién necesita atención vive acá y no en el front por dos
-- razones: el ORDER BY lo necesita —no se puede ordenar en el servidor por
-- algo que se calcula en el navegador— y el filtro "necesitan atención"
-- tiene que poder recortar antes de traer las filas.
--
-- POSTURA DE SEGURIDAD: sin cambios. Security invoker, el RLS decide qué
-- tenants se ven, y el único pedazo elevado sigue siendo estados_owner()
-- con su propio guard.
-- ============================================================

drop function if exists listado_lubricentros();

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
  telefono          text
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
      coalesce(a.del_mes, 0) as del_mes,
      a.ultimo,
      coalesce(o.estado, 'sin_owner') as o_estado,
      (select u.nombre from usuarios u
        where u.lubricentro_id = l.id and u.rol = 'owner' limit 1) as o_nombre,
      estado_atencion(v.estado, v.vencimiento) as atencion
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
    telefono_de_contacto(b.id)
  from base b
  order by
    -- Primero el trabajo del día, y dentro de cada motivo el que vence antes.
    orden_atencion(b.atencion),
    case when b.atencion is not null then b.v_venc end nulls last,
    -- El resto como siempre: los suspendidos al final, alfabético.
    b.activo desc,
    b.nombre;
$$;

comment on function listado_lubricentros is
  'La tabla de /fidelli en una consulta, con la atención y el check ya resueltos. Security invoker: el RLS decide qué tenants se ven.';

revoke execute on function listado_lubricentros() from public;
grant execute on function listado_lubricentros() to authenticated;


-- ============================================================
-- atencion_tenant — lo mismo, para una sola ficha
--
-- La pestaña Suscripción necesita exactamente los mismos cuatro datos que
-- una fila del listado. Componer las mismas funciones en vez de repetir el
-- CASE es lo que garantiza que la ficha y el listado nunca digan cosas
-- distintas del mismo lubricentro.
-- ============================================================

create or replace function atencion_tenant(p_lubricentro_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'atencion', estado_atencion(v.estado, v.vencimiento),
    'contactado', contactado_fidelli(p_lubricentro_id),
    'telefono', telefono_de_contacto(p_lubricentro_id),
    'owner_nombre', (select u.nombre from usuarios u
                      where u.lubricentro_id = p_lubricentro_id
                        and u.rol = 'owner' limit 1)
  )
  from (
    select s.estado, s.vencimiento
    from suscripciones s
    where s.lubricentro_id = p_lubricentro_id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v;
$$;

comment on function atencion_tenant is
  'El estado de atención de un solo tenant, con las mismas funciones que usa el listado.';

revoke execute on function atencion_tenant(uuid) from public;
grant execute on function atencion_tenant(uuid) to authenticated;
