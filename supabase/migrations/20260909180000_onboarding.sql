-- ============================================================
-- Fidelli Motors · Onboarding de tres pasos (bloque de ayuda)
--
-- Una cuenta nueva queda lista sola, en menos de cinco minutos: carga su
-- primer producto, confirma cómo lo ven sus clientes y define (u omite)
-- el premio. Hasta que termina, el panel está bloqueado salvo
-- /panel/onboarding y /panel/ayuda.
--
-- EL PROGRESO SON LOS DATOS, no un contador:
--   paso 1 hecho ⇔ el taller tiene al menos un producto
--   paso 2 hecho ⇔ confirmó su diseño (diseno_confirmado_at)
--   paso 3 hecho ⇔ hay un premio definido, o lo omitió (premio_omitido_at)
-- Los pasos dependen del plan: sin la feature `premios` el paso 3 no
-- existe. Cuando todos los que aplican están hechos se escribe
-- onboarding_completado_at, y esa columna es la única que mira el gate.
--
-- ES POR TALLER, no por usuario: las cuatro marcas viven en lubricentros.
-- El owner no puede escribir esa tabla por RLS (lubricentros_admin es solo
-- de Fidelli), así que cada escritura pasa por una función SECURITY
-- DEFINER que resuelve el tenant con mi_lubricentro_id() — igual que
-- actualizar_nombre_lubricentro().
-- ============================================================

-- ---------- 1 · Las cuatro marcas ----------

alter table lubricentros
  add column diseno_confirmado_at     timestamptz,
  add column premio_omitido_at        timestamptz,
  add column onboarding_completado_at timestamptz,
  add column bienvenida_vista_at      timestamptz;

comment on column lubricentros.diseno_confirmado_at is
  'Paso 2 del onboarding: el taller confirmó cómo lo ven sus clientes (guardó el diseño, o "Así está bien" en Basic).';
comment on column lubricentros.premio_omitido_at is
  'Paso 3 del onboarding: eligió no definir el premio por ahora. Cuenta como paso hecho; el premio se define después desde Fidelización.';
comment on column lubricentros.onboarding_completado_at is
  'Null = panel bloqueado salvo /panel/onboarding y /panel/ayuda. Lo escribe completar_onboarding() cuando todos los pasos que aplican al plan están hechos. Se deriva de los datos, nunca de un contador.';
comment on column lubricentros.bienvenida_vista_at is
  'La animación de bienvenida se muestra UNA vez por taller, al completar el onboarding. Esta es la marca; la escribe marcar_bienvenida_vista().';

-- ---------- 2 · Las cuentas existentes: nada cambia para ellas ----------
-- Todas las que existen al momento del deploy reciben el onboarding como
-- completo y la bienvenida como vista. El conteo antes y después se imprime
-- en el log de la migración y, si no coinciden, la migración aborta.

do $$
declare
  v_antes   integer;
  v_despues integer;
begin
  select count(*) into v_antes from lubricentros;

  update lubricentros
     set onboarding_completado_at = now(),
         bienvenida_vista_at      = now()
   where onboarding_completado_at is null;

  select count(*) into v_despues
    from lubricentros
   where onboarding_completado_at is not null;

  raise notice 'onboarding · lubricentros existentes: % · con onboarding_completado_at después del backfill: %',
    v_antes, v_despues;

  if v_antes <> v_despues then
    raise exception 'onboarding: el backfill dejó cuentas afuera (% existentes, % completas)',
      v_antes, v_despues;
  end if;
end $$;

-- ---------- 3 · El estado, derivado de los datos ----------
-- Dos capas: la interna (onboarding_estado_de) no tiene guard y solo la
-- llaman otras funciones definer y los triggers —también cuando quien
-- inserta es Fidelli por SQL, sin sesión—; la pública (onboarding_estado)
-- le pone el guard y es la que consumen el panel y /fidelli.

create or replace function onboarding_estado_de(p_lubricentro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lub                    lubricentros%rowtype;
  v_productos              integer;
  v_ultimo_producto        timestamptz;
  v_premio                 boolean;
  v_premio_at              timestamptz;
  v_aplica_premio          boolean;
  v_aplica_personalizacion boolean;
  v_pasos                  integer;
  v_paso                   integer;
begin
  if p_lubricentro_id is null then
    return null;
  end if;

  select * into v_lub from lubricentros where id = p_lubricentro_id;
  if not found then
    return null;
  end if;

  -- Paso 1: cualquier producto cuenta, activo o no. Un producto apagado
  -- también dice que el taller ya usó su catálogo.
  select count(*), max(created_at)
    into v_productos, v_ultimo_producto
    from productos
   where lubricentro_id = p_lubricentro_id;

  -- Paso 3: "definido" es que exista la fila del programa, esté activo o
  -- apagado — definirlo y apagarlo es una decisión, no una omisión.
  select count(*) > 0, max(created_at)
    into v_premio, v_premio_at
    from premios
   where lubricentro_id = p_lubricentro_id;

  v_aplica_premio          := feature_de_tenant(p_lubricentro_id, 'premios');
  v_aplica_personalizacion := feature_de_tenant(p_lubricentro_id, 'personalizacion_pagina');
  v_pasos := case when v_aplica_premio then 3 else 2 end;

  -- El paso actual es el primero que falta, en orden. Null = todos hechos,
  -- o el onboarding ya completado: las cuentas que existían antes de esta
  -- migración lo tienen completo por decreto aunque nunca hayan confirmado
  -- un diseño, y /fidelli las tiene que mostrar como "Completo".
  v_paso := case
    when v_lub.onboarding_completado_at is not null then null
    when v_productos = 0 then 1
    when v_lub.diseno_confirmado_at is null then 2
    when v_aplica_premio and not v_premio and v_lub.premio_omitido_at is null then 3
    else null
  end;

  return jsonb_build_object(
    'productos',              v_productos,
    'diseno_confirmado_at',   v_lub.diseno_confirmado_at,
    'premio_definido',        v_premio,
    'premio_omitido_at',      v_lub.premio_omitido_at,
    'aplica_premio',          v_aplica_premio,
    'aplica_personalizacion', v_aplica_personalizacion,
    'pasos',                  v_pasos,
    'paso_actual',            v_paso,
    -- El último avance: lo más reciente de todo lo que cuenta como paso.
    -- greatest() ignora los nulls y devuelve null solo si no hay nada.
    'avance_at',              greatest(v_ultimo_producto, v_lub.diseno_confirmado_at,
                                       v_premio_at, v_lub.premio_omitido_at),
    'completado_at',          v_lub.onboarding_completado_at,
    'bienvenida_vista_at',    v_lub.bienvenida_vista_at
  );
end;
$$;

create or replace function onboarding_estado(p_lubricentro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_lubricentro_id is null then
    return null;
  end if;

  if p_lubricentro_id is distinct from mi_lubricentro_id() and not soy_superadmin() then
    raise exception 'Sin permiso sobre ese lubricentro' using errcode = '42501';
  end if;

  return onboarding_estado_de(p_lubricentro_id);
end;
$$;

comment on function onboarding_estado_de is
  'La capa interna del estado del onboarding, sin guard: la llaman las funciones definer y los triggers. Sin EXECUTE para authenticated.';
comment on function onboarding_estado is
  'El estado del onboarding de un tenant, derivado de los datos: pasos que aplican al plan, paso actual (null = todos hechos), fechas. Definer con guard: el propio tenant o un superadmin.';

-- ---------- 4 · Completar ----------
-- Se escribe onboarding_completado_at si todos los pasos que aplican están
-- hechos. Idempotente: llamarla de más no hace nada. La capa interna, por
-- tenant, es la que usan los triggers; la pública es para el owner.

create or replace function onboarding_completar_de(p_lubricentro_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_estado jsonb;
begin
  v_estado := onboarding_estado_de(p_lubricentro_id);
  if v_estado is null then
    return null;
  end if;

  if v_estado->>'paso_actual' is null and v_estado->>'completado_at' is null then
    update lubricentros set onboarding_completado_at = now() where id = p_lubricentro_id;
    v_estado := onboarding_estado_de(p_lubricentro_id);
  end if;

  return v_estado;
end;
$$;

create or replace function completar_onboarding()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := mi_lubricentro_id();
begin
  if v_id is null then
    raise exception 'Solo el owner de un lubricentro puede completar su onboarding'
      using errcode = '42501';
  end if;

  return onboarding_completar_de(v_id);
end;
$$;

-- LOS TRIGGERS: el paso 1 y el 3 se hacen con las acciones de siempre
-- (productos/actions, fidelizacion/actions), que revalidan y refrescan la
-- pantalla en la misma respuesta. Si la base no evaluara sola, el cliente
-- tendría que avisar después de guardar — y para entonces el componente del
-- paso ya se desmontó. Con el trigger, guardar el premio ES completar el
-- onboarding, y la página, al refrescarse ya completa, va sola a /panel.
-- Definer: una importación por SQL de Fidelli también tiene que evaluar.

create or replace function onboarding_tras_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform onboarding_completar_de(new.lubricentro_id);
  return null;
end;
$$;

create trigger onboarding_productos
  after insert on productos
  for each row execute function onboarding_tras_cambio();

create trigger onboarding_premios
  after insert or update on premios
  for each row execute function onboarding_tras_cambio();

-- Paso 2: guardó el diseño o dijo "Así está bien". Se puede volver a
-- confirmar (la fecha se actualiza); nunca se des-confirma.
create or replace function confirmar_diseno()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := mi_lubricentro_id();
begin
  if v_id is null then
    raise exception 'Solo el owner de un lubricentro puede confirmar su diseño'
      using errcode = '42501';
  end if;

  update lubricentros set diseno_confirmado_at = now() where id = v_id;
  return onboarding_completar_de(v_id);
end;
$$;

-- Paso 3: "Omitir por ahora". Solo tiene sentido si el plan incluye
-- premios; si no, el paso no existe y esto no escribe nada.
create or replace function omitir_premio()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := mi_lubricentro_id();
begin
  if v_id is null then
    raise exception 'Solo el owner de un lubricentro puede omitir el premio'
      using errcode = '42501';
  end if;

  if feature_de_tenant(v_id, 'premios') then
    update lubricentros set premio_omitido_at = now() where id = v_id;
  end if;

  return onboarding_completar_de(v_id);
end;
$$;

-- La bienvenida se marca como vista apenas se muestra —no al terminar—,
-- así una recarga a mitad de la animación no la repite.
create or replace function marcar_bienvenida_vista()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := mi_lubricentro_id();
begin
  if v_id is null then
    return;
  end if;

  update lubricentros
     set bienvenida_vista_at = now()
   where id = v_id and bienvenida_vista_at is null;
end;
$$;

comment on function onboarding_completar_de is
  'Escribe onboarding_completado_at si todos los pasos que aplican al plan están hechos. Idempotente. La llaman los triggers de productos y premios y las funciones del owner.';
comment on function completar_onboarding is
  'La capa pública de onboarding_completar_de(), para el owner (mi_lubricentro_id()).';
comment on function confirmar_diseno is 'Paso 2 del onboarding: el owner confirmó cómo lo ven sus clientes.';
comment on function omitir_premio is 'Paso 3 del onboarding: el owner deja el premio para después. Cuenta como hecho.';
comment on function marcar_bienvenida_vista is 'La animación de bienvenida ya se mostró: no se repite.';

-- ---------- 5 · Permisos ----------
-- Las públicas con sesión: ninguna tiene sentido para anon. Las internas
-- (_de, el trigger) no las llama nadie por la API: solo otras funciones
-- definer, que corren como su dueño. feature_de_tenant() sigue igual.

revoke all on function onboarding_estado_de(uuid)   from public, anon, authenticated;
revoke all on function onboarding_completar_de(uuid) from public, anon, authenticated;
revoke all on function onboarding_tras_cambio()     from public, anon, authenticated;
revoke all on function onboarding_estado(uuid)      from public, anon;
revoke all on function completar_onboarding()       from public, anon;
revoke all on function confirmar_diseno()           from public, anon;
revoke all on function omitir_premio()              from public, anon;
revoke all on function marcar_bienvenida_vista()    from public, anon;

grant execute on function onboarding_estado(uuid)   to authenticated, service_role;
grant execute on function completar_onboarding()    to authenticated, service_role;
grant execute on function confirmar_diseno()        to authenticated, service_role;
grant execute on function omitir_premio()           to authenticated, service_role;
grant execute on function marcar_bienvenida_vista() to authenticated, service_role;

-- ---------- 6 · /fidelli: la columna Onboarding del listado ----------
-- Es la versión de 20260726230000 más tres columnas al final. La firma
-- cambia, así que hay que borrarla antes (returns table no se puede
-- alterar). Security invoker, como siempre: el RLS decide qué se ve.

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
  telefono          text,
  -- El onboarding: en qué paso está (null = completo), de cuántos, y la
  -- fecha del último avance.
  onboarding_paso   integer,
  onboarding_pasos  integer,
  onboarding_avance timestamptz
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
    telefono_de_contacto(b.id),
    (ob.estado->>'paso_actual')::integer,
    (ob.estado->>'pasos')::integer,
    (ob.estado->>'avance_at')::timestamptz
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
  'La tabla de /fidelli en una consulta, con la atención, el check y el onboarding ya resueltos. Security invoker: el RLS decide qué tenants se ven.';

revoke execute on function listado_lubricentros() from public;
grant execute on function listado_lubricentros() to authenticated;
