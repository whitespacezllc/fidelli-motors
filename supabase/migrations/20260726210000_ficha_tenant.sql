-- ============================================================
-- Fidelli Motors · La ficha del tenant
--
-- LA DISCIPLINA INVERTIDA, que es de lo que trata esta migración entera:
--
-- En /panel nadie filtra por lubricentro_id porque RLS lo hace solo. En
-- /fidelli es al revés: soy_superadmin() abre TODOS los tenants, así que
-- el RLS deja de recortar y el filtro tiene que ser explícito, consulta
-- por consulta. Un `where lubricentro_id = ...` olvidado no da error ni
-- fila vacía: mezcla dos lubricentros en la misma pantalla y nadie se
-- entera hasta que alguien ve un dato ajeno.
--
-- Por eso las funciones de acá reciben el tenant por parámetro y filtran
-- con él en cada subconsulta, incluidas las que en /panel no hacía falta
-- filtrar (landing_busquedas es la más traicionera: dos lubricentros
-- pueden tener la misma patente).
-- ============================================================


-- ============================================================
-- 1. metricas_tenant — las cinco métricas de la pestaña Resumen
--
-- POR QUÉ NO SE REUSA resumen_inicio(): esa función saca el tenant de la
-- sesión, no de un parámetro. Filtra por RLS en todas sus subconsultas y
-- llama a mi_lubricentro_id() para los recuperados. Un superadmin no
-- pertenece a ningún lubricentro: mi_lubricentro_id() le devuelve null y
-- el RLS no le recorta nada, así que resumen_inicio() ejecutada desde
-- /fidelli devolvería la suma de TODA la plataforma presentada como si
-- fuera de un tenant. Es justo el error que describe el encabezado.
--
-- recuperados_del_mes() sí se reusa tal cual: ya recibe el lubricentro
-- por parámetro y filtra con él.
--
-- POSTURA DE SEGURIDAD:
--   · SECURITY INVOKER (el default) y STABLE. El aislamiento NO lo da el
--     RLS —para un superadmin no da ninguno— sino el filtro explícito por
--     p_lubricentro_id que lleva cada subconsulta. El RLS queda como
--     segunda red: si la llamara un owner con el id de otro tenant, sus
--     policies le devolverían ceros.
--   · Exige soy_superadmin(): es una función del panel de administración
--     y no tiene por qué contestarle a nadie más.
--   · search_path fijo. No escribe.
-- ============================================================

create or replace function metricas_tenant(p_lubricentro_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de un tenant'
      using errcode = '42501';
  end if;

  with flota_anual as (
    -- La flota que pasó por el taller en el último año: el universo del
    -- % de escaneo. Son los autos que tienen la calco en el parasol.
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.lubricentro_id = p_lubricentro_id
      and s.fecha >= current_date - interval '12 months'
  )
  select jsonb_build_object(

    'services_mes', (
      select count(*) from services
      where lubricentro_id = p_lubricentro_id
        and not anulado
        and fecha >= date_trunc('month', current_date)),

    'clientes', (
      select count(*) from clientes where lubricentro_id = p_lubricentro_id),

    'vehiculos', (
      select count(*) from vehiculos where lubricentro_id = p_lubricentro_id),

    -- Penetración, no volumen: de los autos que pasaron, cuántos fueron
    -- buscados alguna vez. Mismo criterio que el dashboard del lubri.
    'flota', (select count(*) from flota_anual),
    'escaneados', (
      select count(*) from flota_anual f
      where exists (
        select 1 from landing_busquedas lb
        -- El filtro por tenant acá no es redundante: la patente sola
        -- puede coincidir con la de otro lubricentro.
        where lb.lubricentro_id = p_lubricentro_id
          and lb.patente = f.patente_normalizada
          and lb.created_at >= now() - interval '12 months')),

    'recuperados', coalesce(recuperados_del_mes(p_lubricentro_id), 0),

    'ultimo_service', (
      select jsonb_build_object(
        'creado', s.created_at,
        'fecha', s.fecha,
        'sucursal', suc.nombre)
      from services s
      join sucursales suc on suc.id = s.sucursal_id
      where s.lubricentro_id = p_lubricentro_id
        and not s.anulado
      order by s.fecha desc, s.created_at desc
      limit 1)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function metricas_tenant is
  'Las métricas de la ficha de /fidelli. Filtra por p_lubricentro_id en cada subconsulta: para un superadmin el RLS no recorta nada.';

revoke execute on function metricas_tenant(uuid) from public;
grant execute on function metricas_tenant(uuid) to authenticated;


-- ============================================================
-- 2. registrar_pago — el cobro por transferencia, firmado
--
-- Insertar el pago y mover el vencimiento son dos escrituras que
-- describen un solo hecho: el lubricentro pagó hasta tal fecha. Sueltas,
-- un error en la segunda dejaría el pago registrado y la suscripción
-- vencida — y el owner viendo el aviso de suspensión con la transferencia
-- ya hecha. Van juntas.
--
-- registrado_por sale de auth.uid(), NO de un parámetro: la firma de
-- auditoría no puede venir del cliente, que es exactamente lo que la
-- haría inútil.
--
-- El vencimiento nuevo es el mayor entre el que había y el fin del
-- período pagado. Con greatest() y no con asignación directa porque
-- registrar un pago viejo —uno que se había traspapelado— no puede
-- ACORTAR una suscripción que ya estaba paga más adelante.
--
-- Y el estado pasa a 'activa' solo si el vencimiento resultante todavía
-- no pasó: registrar un pago de un período ya terminado no revive una
-- cuenta que sigue debiendo.
--
-- POSTURA DE SEGURIDAD: security invoker con soy_superadmin() explícito,
-- igual que el resto del ABM. Las policies de pagos y suscripciones ya
-- exigen superadmin para escribir; el guard hace la intención legible y
-- da un error en castellano en vez de una violación de policy.
-- ============================================================

create or replace function registrar_pago(
  p_lubricentro_id uuid,
  p_periodo_desde  date,
  p_periodo_hasta  date,
  p_monto          numeric,
  p_fecha_pago     date
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_suscripcion uuid;
  v_vencimiento date;
  v_nuevo       date;
  v_pago        uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede registrar un pago'
      using errcode = '42501';
  end if;

  if p_periodo_desde is null or p_periodo_hasta is null then
    raise exception 'periodo_incompleto';
  end if;

  if p_periodo_hasta < p_periodo_desde then
    raise exception 'periodo_invertido';
  end if;

  if p_monto is null or p_monto < 0 then
    raise exception 'monto_invalido';
  end if;

  if p_fecha_pago is null then
    raise exception 'fecha_pago_vacia';
  end if;

  -- La suscripción vigente es la última que arrancó, igual que en el listado.
  select id, vencimiento into v_suscripcion, v_vencimiento
  from suscripciones
  where lubricentro_id = p_lubricentro_id
  order by inicio desc, created_at desc
  limit 1;

  if v_suscripcion is null then
    raise exception 'sin_suscripcion';
  end if;

  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    p_lubricentro_id, v_suscripcion, auth.uid(),
    p_periodo_desde, p_periodo_hasta, p_monto, p_fecha_pago
  )
  returning id into v_pago;

  v_nuevo := greatest(v_vencimiento, p_periodo_hasta);

  update suscripciones
  set vencimiento = v_nuevo,
      estado = case
                 when estado in ('trial', 'vencida') and v_nuevo >= current_date
                   then 'activa'::estado_suscripcion
                 else estado
               end
  where id = v_suscripcion;

  -- RLS rechaza los UPDATE en silencio: cero filas y ningún error. Sin
  -- esto, un rechazo se vería en pantalla como un cobro registrado.
  if not found then
    raise exception 'sin_permiso_suscripcion';
  end if;

  return v_pago;
end;
$$;

comment on function registrar_pago is
  'Registra la transferencia y mueve el vencimiento en una transacción. La firma sale de auth.uid(), nunca de un parámetro.';

revoke execute on function registrar_pago(uuid, date, date, numeric, date) from public;
grant execute on function registrar_pago(uuid, date, date, numeric, date) to authenticated;


-- ============================================================
-- 3. desbloquear_service — la ventana extraordinaria de 24 horas
--
-- El caso real: el lubri llama diciendo que cargó 92.000 km en vez de
-- 29.000 y que ya pasaron las 24 horas. Fidelli abre la ventana, el lubri
-- corrige. Nosotros no editamos los datos de nuestro cliente: le
-- devolvemos la posibilidad de hacerlo él.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UN UPDATE DESDE LA SERVER ACTION:
-- la ventana se compara contra now() dentro de la policy de RLS
-- (`now() < desbloqueado_hasta`), que corre en el reloj de Postgres. Si
-- el vencimiento se calculara en el servidor de Next, dos relojes
-- distintos decidirían la misma regla: uno adelantado entregaría una
-- ventana que la base ya considera cerrada, o una más larga que 24 horas.
-- Calculándolo acá hay un solo reloj y la pregunta desaparece.
--
-- desbloqueado_por sale de auth.uid() por la misma razón que la firma del
-- pago: una auditoría que acepta el autor por parámetro no es auditoría.
--
-- 24 horas fijas, que espejan la regla original y son fáciles de
-- explicar por teléfono. Si hace falta más, se vuelve a desbloquear —y
-- queda otro registro.
--
-- POSTURA DE SEGURIDAD: security invoker. El UPDATE se evalúa contra
-- services_edicion, que ya contempla `or soy_superadmin()`. El guard
-- explícito arriba de todo hace que un rol equivocado reciba una frase y
-- no una violación de policy, y deja escrito que esta puerta es de
-- Fidelli aunque mañana alguien afloje la policy por otro motivo.
-- No se toca nada de RLS: la policy ya permitía esto desde el día uno.
-- ============================================================

create or replace function desbloquear_service(p_service_id uuid)
returns timestamptz
language plpgsql
volatile
set search_path = public
as $$
declare
  v_hasta timestamptz;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede desbloquear un service'
      using errcode = '42501';
  end if;

  update services
  set desbloqueado_hasta = now() + interval '24 hours',
      desbloqueado_por   = auth.uid()
  where id = p_service_id
    -- Un service anulado no se corrige: se carga de nuevo.
    and not anulado
  returning desbloqueado_hasta into v_hasta;

  if not found then
    raise exception 'service_no_desbloqueable';
  end if;

  return v_hasta;
end;
$$;

comment on function desbloquear_service is
  'Abre 24 horas de edición sobre un service fijado. La ventana la mide el reloj de Postgres, el mismo que evalúa la policy.';

revoke execute on function desbloquear_service(uuid) from public;
grant execute on function desbloquear_service(uuid) to authenticated;
