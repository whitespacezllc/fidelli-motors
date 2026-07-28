-- ============================================================
-- Fidelli Motors · Los mensajes de WhatsApp nacen con el tenant
--
-- EL BUG: crear_lubricentro() creaba el tenant, su configuración, sus
-- sucursales y la suscripción — pero NO los mensaje_templates. El demo los
-- tiene porque seed_demo() los inserta aparte, así que el agujero no se
-- veía en desarrollo. Consecuencia real: un lubricentro dado de alta por el
-- wizard abría /panel/proximos y el botón de WhatsApp estaba muerto. La
-- función de retención —el corazón del producto— no funcionaba el día uno.
--
-- EL ARREGLO, en tres partes:
--   1. sembrar_templates(): los tres tonos por defecto, con Cercano activo,
--      parametrizados con el nombre del lubricentro.
--   2. crear_lubricentro() la llama dentro de la misma transacción del
--      alta: el tenant y sus mensajes nacen juntos o no nace nada.
--   3. Backfill: se siembran los templates a todo lubricentro existente
--      que no tenga ninguno. Esto cubre a Brothers Oil en producción sin
--      ningún SQL manual — lo arregla el propio `db push`.
-- ============================================================


-- ---------- 1. La siembra, reutilizable ----------
-- Separada de crear_lubricentro para poder usarla también en el backfill
-- (y en cualquier reparación futura) sin duplicar los textos.
--
-- POSTURA DE SEGURIDAD: SECURITY INVOKER (el default). El insert se evalúa
-- contra templates_tenant, que exige pertenecer al tenant o ser superadmin.
-- Queda ejecutable por authenticated A PROPÓSITO: crear_lubricentro() es
-- invoker y la llama con el rol de quien llama, así que revocarla la
-- rompería. No es un agujero: un owner que la invoque a mano sólo puede
-- sembrar SU tenant (el with check de la policy rechaza cualquier otro id)
-- y sólo si no tiene ninguno — que es exactamente la reparación que
-- querríamos ofrecerle.
create or replace function sembrar_templates(p_lubricentro_id uuid, p_nombre text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  -- Si ya tiene alguno, no se toca nada: la siembra es sólo para un tenant
  -- virgen. Hace la función idempotente y al backfill inofensivo.
  if exists (
    select 1 from mensaje_templates where lubricentro_id = p_lubricentro_id
  ) then
    return;
  end if;

  insert into mensaje_templates (lubricentro_id, tono, contenido, activo) values
    (p_lubricentro_id, 'Cercano',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un turno?',
     true),
    (p_lubricentro_id, 'Formal',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     false),
    (p_lubricentro_id, 'Directo',
     '{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y te damos turno.',
     false);
end;
$$;

comment on function sembrar_templates is
  'Los tres tonos por defecto (Cercano activo) para un tenant sin templates. Idempotente: con templates existentes no hace nada.';

revoke execute on function sembrar_templates(uuid, text) from public;
revoke execute on function sembrar_templates(uuid, text) from anon;
grant execute on function sembrar_templates(uuid, text) to authenticated;


-- ---------- 2. crear_lubricentro() siembra en la misma transacción ----------
-- Se redefine entera (mismo cuerpo que 20260726120000) con una línea nueva
-- al final. La POSTURA DE SEGURIDAD NO CAMBIA: sigue siendo security
-- invoker con soy_superadmin() explícito arriba de todo, y el insert de
-- templates se evalúa contra la misma policy que los demás. La única
-- diferencia es que el tenant ya no puede nacer sin sus mensajes.
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

  if p_dias_trial is null or p_dias_trial < 0 or p_dias_trial > 365 then
    raise exception 'trial_invalido';
  end if;

  insert into lubricentros (nombre, slug)
  values (trim(p_nombre), lower(trim(coalesce(p_slug, ''))))
  returning id into v_id;

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

  -- Los mensajes de WhatsApp, con el tono Cercano activo: el botón de
  -- contacto de /panel/proximos funciona desde el primer día, sin que el
  -- owner tenga que configurar nada.
  perform sembrar_templates(v_id, trim(p_nombre));

  return v_id;
end;
$$;

comment on function crear_lubricentro is
  'Fase 1 del alta: tenant + config + sucursales + suscripción en trial + templates de WhatsApp, en una transacción. Exige soy_superadmin(). La invitación del owner es la fase 2 y va por HTTP.';


-- ---------- 3. Backfill de los tenants que ya existen ----------
-- Brothers Oil (y cualquier otro creado antes de esta migración) recibe sus
-- tres tonos acá, al aplicarse el push. sembrar_templates() no toca a los
-- que ya tienen alguno, así que el demo queda como está.
do $$
declare l record;
begin
  for l in select id, nombre from lubricentros loop
    perform sembrar_templates(l.id, l.nombre);
  end loop;
end $$;


-- ---------- 4. activar_template — el cambio de tono, atómico ----------
-- Activar un mensaje implica desactivar el que estaba: dos updates que no
-- pueden ir sueltos desde la app. Si el segundo fallara, el tenant queda
-- sin ningún activo (el botón de WhatsApp muere) o —peor, por el índice
-- único parcial mensaje_templates_uno_activo— con un error crudo de
-- unicidad. En una función es una transacción: o cambia el tono entero o
-- no cambia nada.
--
-- POSTURA DE SEGURIDAD: SECURITY INVOKER. Los dos updates se evalúan
-- contra templates_tenant, así que un owner sólo puede tocar los mensajes
-- de SU lubricentro. El `found` es obligatorio: RLS rechaza en silencio, y
-- sin él un rechazo parecería un cambio de tono exitoso.
create or replace function activar_template(p_template_id uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
begin
  select lubricentro_id into v_lubricentro
  from mensaje_templates where id = p_template_id;

  if v_lubricentro is null then
    raise exception 'template_no_existe';
  end if;

  -- Primero se apaga el vigente: el índice único parcial no admite dos
  -- activos ni por un instante dentro de la transacción.
  update mensaje_templates
  set activo = false
  where lubricentro_id = v_lubricentro and activo and id <> p_template_id;

  update mensaje_templates
  set activo = true
  where id = p_template_id;

  if not found then
    raise exception 'sin_permiso_template';
  end if;
end;
$$;

comment on function activar_template is
  'Activa un template y desactiva el vigente en una transacción. Security invoker: RLS limita al tenant propio.';

revoke execute on function activar_template(uuid) from public;
revoke execute on function activar_template(uuid) from anon;
grant execute on function activar_template(uuid) to authenticated;
