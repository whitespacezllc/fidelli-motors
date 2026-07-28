-- ============================================================
-- Fidelli Motors · El ABM de lubricentros
--
-- Todo lo que el panel de administración necesita de la base:
-- validar un slug, listar los tenants con su suscripción, saber si
-- el owner ya activó su cuenta, y dar de alta un lubricentro entero
-- en una sola transacción.
--
-- Lo que NO está acá: la invitación del owner. Es una llamada HTTP a
-- la API de Auth y no se puede meter en una transacción de Postgres.
-- Por eso el alta son dos fases —primero el tenant, después la
-- invitación— y el orden importa: si falla la segunda, queda un
-- lubricentro sin owner, que se recupera reinvitando. Al revés
-- quedaría un usuario huérfano sin tenant, que no se recupera con
-- nada de lo que hay en el panel.
-- ============================================================


-- ============================================================
-- 1. Slugs reservados — una sola lista
--
-- La lista vivía embebida en el CHECK de la tabla, y el wizard
-- necesita la MISMA lista para poder decir "reservado" antes de
-- intentar el alta. Copiarla al front (o a otra función) crea dos
-- fuentes que se separan sin que nadie se entere: el día que se
-- agregue una ruta nueva al producto, el wizard va a decir
-- "disponible" y el insert va a explotar contra la constraint.
--
-- Se extrae a una función inmutable y la constraint pasa a usarla.
-- Ahora agregar una ruta reservada es tocar UN lugar.
-- ============================================================

create or replace function slug_reservado(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  -- Chocarían con rutas del producto: fidellimotors.app/[slug]
  select lower(coalesce(p_slug, '')) = any (array[
    'admin', 'api', 'auth', 'login', 'app', 'www', 'dashboard', 'panel', 'fidelli'
  ]);
$$;

comment on function slug_reservado is
  'Rutas del producto que ningún lubricentro puede quedarse. Fuente única: la usan la constraint de lubricentros y slug_estado().';

alter table lubricentros drop constraint slug_no_reservado;

alter table lubricentros
  add constraint slug_no_reservado check (not slug_reservado(slug));


-- ============================================================
-- 2. slug_estado — la validación en vivo del wizard
--
-- Devuelve el mismo veredicto que van a dar las constraints, pero
-- antes de escribir. Los cuatro estados son los cuatro motivos por
-- los que el insert podría fallar, así que el wizard puede
-- explicarlos con palabras en vez de mostrar un error de Postgres.
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER (el default) y STABLE. Consulta lubricentros
--     con el RLS de quien llama, que es lo correcto: la respuesta
--     "ocupado" solo es cierta si se ven TODOS los slugs, y eso solo
--     lo cumple un superadmin. Un owner vería su propia fila nada
--     más y recibiría "disponible" para un slug tomado.
--   · Por eso además exige soy_superadmin() explícitamente: en vez
--     de devolver una respuesta incorrecta a quien no corresponde,
--     falla. El guard no reemplaza al RLS — lo hace explícito.
--   · No expone nada de otros tenants: entra un texto, sale una de
--     cuatro palabras.
-- ============================================================

create or replace function slug_estado(p_slug text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede validar slugs'
      using errcode = '42501';
  end if;

  -- Las mismas dos constraints de formato de la tabla
  if char_length(v_slug) < 3 or char_length(v_slug) > 60
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return 'invalido';
  end if;

  if slug_reservado(v_slug) then
    return 'reservado';
  end if;

  if exists (select 1 from lubricentros where slug = v_slug) then
    return 'ocupado';
  end if;

  return 'disponible';
end;
$$;

comment on function slug_estado is
  'disponible | ocupado | reservado | invalido. Lo mismo que dirían las constraints, pero antes de escribir.';

revoke execute on function slug_estado(text) from public;
grant execute on function slug_estado(text) to authenticated;


-- ============================================================
-- 3. estados_owner — lo único que obliga a salir de public
--
-- El listado necesita saber si el owner ya entró alguna vez. Ese
-- dato es auth.users.last_sign_in_at, y auth.users no está en el
-- schema public: ninguna policy nuestra lo alcanza y la API de
-- PostgREST no lo expone. Hace falta una función security definer.
--
-- POSTURA DE SEGURIDAD — la función es deliberadamente angosta:
--   · DEVUELVE UN ENUM DE TRES PALABRAS, no datos de auth. No sale
--     de acá ni el email, ni la fecha, ni el id de auth, ni nada
--     que se pueda correlacionar. Un booleano vestido de texto.
--   · NO RECIBE PARÁMETROS. No hay nada que inyectar ni un id que
--     enumerar: devuelve la tabla entera, y quien puede llamarla ya
--     puede ver la tabla entera de lubricentros por RLS.
--   · EXIGE soy_superadmin() antes de mirar nada. Es obligatorio
--     acá y no un lujo: al ser definer corre como el dueño de la
--     función, que además es dueño de usuarios, así que el RLS de
--     usuarios NO se evalúa. El guard es lo único que separa a un
--     owner de la lista completa. Sin él, esto es un agujero.
--   · STABLE y search_path fijo. No escribe.
--   · Se revoca de public y de anon; se concede solo a
--     authenticated (que igual choca contra el guard si no es
--     superadmin). anon explícito porque Supabase concede execute
--     por default privileges y quedaría expuesta como RPC pública.
--
-- Un lubricentro sin fila acá es un "sin owner": la invitación
-- nunca llegó a crear el usuario. Ese caso no se representa con una
-- fila porque no hay nada que leer — se deduce del left join.
-- ============================================================

create or replace function estados_owner()
returns table (
  lubricentro_id uuid,
  estado         text
)
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

  return query
    select
      u.lubricentro_id,
      case
        when au.last_sign_in_at is null then 'pendiente'
        else 'activo'
      end
    from usuarios u
    join auth.users au on au.id = u.id
    where u.rol = 'owner'
      and u.lubricentro_id is not null;
end;
$$;

comment on function estados_owner is
  'pendiente | activo por lubricentro. Definer porque last_sign_in_at vive en auth.users. Devuelve solo el estado: ningún dato de auth sale de acá.';

revoke execute on function estados_owner() from public;
revoke execute on function estados_owner() from anon;
grant execute on function estados_owner() to authenticated;


-- ============================================================
-- 4. listado_lubricentros — la pantalla entera, en una consulta
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER y STABLE. Lubricentros, suscripciones,
--     planes y services se leen con el RLS de quien llama, y por
--     eso ninguna subconsulta filtra por tenant a mano: un
--     superadmin ve todo porque sus policies lo dicen, no porque la
--     función lo decida.
--   · El único pedazo elevado es estados_owner(), que tiene su
--     propio guard.
-- ============================================================

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
  services_mes      integer,
  ultimo_service    date,
  owner_estado      text
)
language sql
stable
set search_path = public
as $$
  with
  -- Un lubricentro puede acumular suscripciones (el histórico no se
  -- borra). La vigente es la última que arrancó.
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
  )
  select
    l.id,
    l.nombre,
    l.slug,
    l.activo,
    l.calcos_entregadas,
    l.created_at::date,
    v.id,
    v.estado,
    v.periodo,
    v.descuento_pct,
    v.vencimiento,
    v.plan_id,
    p.nombre,
    p.precio_mensual,
    coalesce(a.del_mes, 0),
    a.ultimo,
    coalesce(o.estado, 'sin_owner')
  from lubricentros l
  left join vigente   v on v.lubricentro_id = l.id
  left join planes    p on p.id = v.plan_id
  left join actividad a on a.lubricentro_id = l.id
  left join owners    o on o.lubricentro_id = l.id
  -- Los suspendidos al final: son los que no dan trabajo diario.
  order by l.activo desc, l.nombre;
$$;

comment on function listado_lubricentros is
  'La tabla de /fidelli en una consulta. Security invoker: el RLS decide qué tenants se ven.';

revoke execute on function listado_lubricentros() from public;
grant execute on function listado_lubricentros() to authenticated;


-- ============================================================
-- 5. crear_lubricentro — la fase 1 del alta
--
-- Todo o nada: el tenant, su configuración de experiencia, sus
-- sucursales y la suscripción en trial entran en la misma
-- transacción. Si algo falla, no queda un lubricentro a medias.
--
-- La invitación del owner NO está acá a propósito: es HTTP, no SQL.
-- Ver el comentario del encabezado.
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER (el default), que es la decisión de fondo:
--     los cinco inserts se evalúan contra las policies de quien
--     llama. Las cinco tablas ya exigen soy_superadmin() (o
--     pertenencia al tenant, que acá no aplica porque el tenant
--     todavía no existe), así que un owner no puede crear nada por
--     esta puerta ni aunque el guard desapareciera. La función no
--     agrega permisos: solo agrupa escrituras que el que llama ya
--     podía hacer, en una transacción.
--   · Y ADEMÁS exige soy_superadmin() explícitamente, arriba de
--     todo. Dos razones: el error es una frase en castellano en vez
--     de una violación de policy ilegible, y —la que importa— la
--     intención queda escrita. Si mañana alguien afloja una policy
--     de sucursales por otro motivo, esta función no se convierte
--     en el camino para crear tenants.
--   · search_path fijo.
--   · Valida antes de escribir: nombre, al menos una sucursal, y
--     los rangos de descuento y trial. Las constraints de las
--     tablas siguen siendo el backstop.
-- ============================================================

create or replace function crear_lubricentro(
  p_nombre         text,
  p_slug           text,
  p_sucursales     jsonb,
  p_plan_id        uuid,
  p_periodo        periodo_suscripcion,
  p_descuento_pct  numeric,
  p_dias_trial     integer
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_id      uuid;
  v_suc     jsonb;
  v_nombre  text;
  v_cuantas integer := 0;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede dar de alta un lubricentro'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'nombre_vacio';
  end if;

  if p_plan_id is null then
    raise exception 'plan_vacio';
  end if;

  if p_descuento_pct is null or p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'descuento_invalido';
  end if;

  -- Trial de 0 días es válido: el tenant arranca vencido el mismo día,
  -- que es lo que corresponde para uno que ya pagó antes de entrar.
  if p_dias_trial is null or p_dias_trial < 0 or p_dias_trial > 365 then
    raise exception 'trial_invalido';
  end if;

  insert into lubricentros (nombre, slug)
  values (trim(p_nombre), lower(trim(coalesce(p_slug, ''))))
  returning id into v_id;

  -- La experiencia arranca con los defaults del schema: shell neutro,
  -- color #0A0A0A, campos visibles por default. El owner la pinta después.
  insert into config_experiencia (lubricentro_id) values (v_id);

  for v_suc in
    select * from jsonb_array_elements(coalesce(p_sucursales, '[]'::jsonb))
  loop
    v_nombre := nullif(trim(coalesce(v_suc->>'nombre', '')), '');
    if v_nombre is null then
      continue;
    end if;

    insert into sucursales (lubricentro_id, nombre, direccion, telefono, horarios)
    values (
      v_id,
      v_nombre,
      nullif(trim(coalesce(v_suc->>'direccion', '')), ''),
      nullif(trim(coalesce(v_suc->>'telefono', '')), ''),
      nullif(trim(coalesce(v_suc->>'horarios', '')), '')
    );

    v_cuantas := v_cuantas + 1;
  end loop;

  -- Sin sucursal no se puede cargar un service: el tenant nacería inútil.
  if v_cuantas = 0 then
    raise exception 'sin_sucursales';
  end if;

  insert into suscripciones (
    lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento
  )
  values (
    v_id, p_plan_id, 'trial', p_periodo, p_descuento_pct,
    current_date, current_date + p_dias_trial
  );

  return v_id;
end;
$$;

comment on function crear_lubricentro is
  'Fase 1 del alta: tenant + config + sucursales + suscripción en trial, en una transacción. Exige soy_superadmin(). La invitación del owner es la fase 2 y va por HTTP.';

revoke execute on function crear_lubricentro(text, text, jsonb, uuid, periodo_suscripcion, numeric, integer) from public;
grant execute on function crear_lubricentro(text, text, jsonb, uuid, periodo_suscripcion, numeric, integer) to authenticated;


-- ============================================================
-- 6. actualizar_lubricentro — la edición, también todo o nada
--
-- Un tenant y su suscripción son dos tablas, y el formulario es uno
-- solo: si se guardara con dos updates sueltos, un error en el
-- segundo dejaría el nombre cambiado y el plan viejo, sin que la
-- pantalla pueda decir cuál de los dos quedó. Van juntos.
--
-- LA REGLA DEL SLUG, que es la razón de fondo de que esto sea una
-- función y no dos updates: el slug está impreso en las calcos
-- pegadas en los parasoles. Cambiarlo rompe los QR de todos los
-- autos que ya lo tienen. Con calcos_entregadas > 0 no se toca, y
-- la comprobación se hace contra el valor GUARDADO, no contra el
-- que viene del formulario — si no, alcanzaría con mandar
-- calcos = 0 y el slug nuevo en el mismo submit para saltear la
-- regla desde afuera.
--
-- POSTURA DE SEGURIDAD: la misma que crear_lubricentro. Security
-- invoker, todas las escrituras contra las policies de quien llama,
-- y soy_superadmin() explícito arriba de todo.
--
-- El `if not found` después de cada update no es paranoia: RLS
-- rechaza los UPDATE en silencio. La fila se filtra, se actualizan
-- cero filas y Postgres no devuelve error. Sin este chequeo, un
-- update rechazado se vería en la pantalla como un guardado exitoso.
-- ============================================================

create or replace function actualizar_lubricentro(
  p_id            uuid,
  p_nombre        text,
  p_slug          text,
  p_calcos        integer,
  p_plan_id       uuid,
  p_periodo       periodo_suscripcion,
  p_descuento_pct numeric,
  p_vencimiento   date
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_slug_actual   text;
  v_calcos_actual integer;
  v_slug_nuevo    text := nullif(lower(trim(coalesce(p_slug, ''))), '');
  v_suscripcion   uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede editar un lubricentro'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'nombre_vacio';
  end if;

  if p_calcos is null or p_calcos < 0 then
    raise exception 'calcos_invalidas';
  end if;

  if p_descuento_pct is null or p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'descuento_invalido';
  end if;

  select slug, calcos_entregadas
    into v_slug_actual, v_calcos_actual
  from lubricentros
  where id = p_id;

  if not found then
    raise exception 'no_existe';
  end if;

  if v_slug_nuevo is not null
     and v_slug_nuevo is distinct from v_slug_actual
     and v_calcos_actual > 0 then
    raise exception 'slug_bloqueado';
  end if;

  update lubricentros
  set nombre            = trim(p_nombre),
      slug              = coalesce(v_slug_nuevo, slug),
      calcos_entregadas = p_calcos
  where id = p_id;

  if not found then
    raise exception 'sin_permiso_lubricentro';
  end if;

  -- La suscripción vigente es la última que arrancó, igual que en el listado.
  select id into v_suscripcion
  from suscripciones
  where lubricentro_id = p_id
  order by inicio desc, created_at desc
  limit 1;

  if v_suscripcion is null then
    raise exception 'sin_suscripcion';
  end if;

  update suscripciones
  set plan_id       = coalesce(p_plan_id, plan_id),
      periodo       = coalesce(p_periodo, periodo),
      descuento_pct = p_descuento_pct,
      vencimiento   = coalesce(p_vencimiento, vencimiento)
  where id = v_suscripcion;

  if not found then
    raise exception 'sin_permiso_suscripcion';
  end if;
end;
$$;

comment on function actualizar_lubricentro is
  'Edita el tenant y su suscripción vigente en una transacción. El slug solo cambia con calcos_entregadas = 0, comprobado contra el valor guardado.';

revoke execute on function actualizar_lubricentro(uuid, text, text, integer, uuid, periodo_suscripcion, numeric, date) from public;
grant execute on function actualizar_lubricentro(uuid, text, text, integer, uuid, periodo_suscripcion, numeric, date) to authenticated;
