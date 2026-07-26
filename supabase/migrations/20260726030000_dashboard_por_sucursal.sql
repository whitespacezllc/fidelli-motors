-- ============================================================
-- Fidelli Motors · El dashboard, con filtro por sucursal
--
-- Se rehacen las dos funciones porque las dos cambian de firma, y
-- agregar un parámetro —aunque tenga default— crea OTRA función: un
-- create or replace dejaría las dos conviviendo y las llamadas
-- ambiguas. Por eso drop + create, con los grants repuestos.
--
-- LAS DEFINICIONES QUE HAY QUE FIJAR (y que este comentario documenta
-- porque Bruno va a mirar estos números todos los meses):
--
--   · CLIENTES NUEVOS = clientes cuyo PRIMER service cayó en el período.
--     Filtrado por sucursal: cuyo primer service fue EN esa sucursal.
--     Antes se contaba por clientes.created_at, que es cuándo se cargó
--     la fila. Se cambia por dos razones: un cliente tipeado en el ABM
--     pero sin service todavía no es un cliente nuevo del negocio, y con
--     la definición vieja los números por sucursal no sumaban el total.
--     Ahora sí suman.
--
--   · RECUPERADOS = contactados que registraron un service dentro de los
--     30 días. Filtrado por sucursal: que volvieron A ESA sucursal.
--
--   · % DE ESCANEO = de los vehículos que pasaron por el taller en los
--     últimos 12 meses, cuántos fueron buscados alguna vez en la landing
--     en ese mismo lapso. Se eligió penetración (vehículos únicos) y no
--     volumen (búsquedas sobre services) porque mide cuántos clientes
--     ADOPTARON el producto, no cuántas veces entró el mismo. Un cliente
--     que escanea diez veces no son diez clientes.
--     La ventana es de 12 meses y no del mes porque el cliente escanea
--     dos o tres veces al año: medirlo mensualmente daría un número
--     bajísimo que no significa nada.
--     El numerador se calcula sobre la MISMA flota del denominador, así
--     que no puede pasar de 100%.
--
--   · NO SE FILTRA POR SUCURSAL, nunca. landing_busquedas solo tiene
--     lubricentro_id porque el QR es de la marca — una marca, un slug,
--     un QR. La pantalla lo muestra con su etiqueta para que nadie lea
--     un número de marca como si fuera de un local.
--
-- POSTURA DE SEGURIDAD — sin cambios de fondo en ninguna de las dos:
--   · SECURITY INVOKER (el default): cada subconsulta se evalúa con el
--     RLS de quien llama, y por eso ninguna filtra por lubricentro a
--     mano. search_path fijo (recuperados_del_mes no lo tenía: se
--     aprovecha para agregárselo).
--   · p_sucursal_id no es una puerta: si llega el id de una sucursal de
--     otro tenant, los joins contra services y sucursales lo filtran por
--     RLS igual y devuelve cero. Lo mismo que ya pasaba con
--     p_lubricentro_id.
--   · Se revocan de PUBLIC y se conceden solo a authenticated.
-- ============================================================

drop function if exists recuperados_del_mes(uuid, date);

create or replace function recuperados_del_mes(
  p_lubricentro_id uuid,
  p_desde          date default null,
  p_sucursal_id    uuid default null
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(distinct co.vehiculo_id)::integer
  from contactos co
  where co.lubricentro_id = p_lubricentro_id
    and co.created_at >= coalesce(p_desde, date_trunc('month', current_date))
    and exists (
      select 1 from services s
      where s.vehiculo_id = co.vehiculo_id
        and not s.anulado
        and s.created_at > co.created_at
        and s.created_at <= co.created_at + interval '30 days'
        -- Volvió A ESA sucursal: el filtro va sobre el service de vuelta,
        -- no sobre el contacto.
        and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
    );
$$;

comment on function recuperados_del_mes is
  'Contactados que registraron un service dentro de los 30 días. Con p_sucursal_id, los que volvieron a esa sucursal.';

revoke execute on function recuperados_del_mes(uuid, date, uuid) from public;
grant execute on function recuperados_del_mes(uuid, date, uuid) to authenticated;


drop function if exists resumen_inicio();

create or replace function resumen_inicio(p_sucursal_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  -- El primer service de cada cliente: define "cliente nuevo" y de qué
  -- sucursal es. Se calcula una vez y se usa dos veces.
  primer_service as (
    select distinct on (v.cliente_id)
      v.cliente_id,
      s.fecha,
      s.sucursal_id
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
    order by v.cliente_id, s.fecha, s.created_at
  ),
  -- La flota que pasó por el taller en el último año. Es el universo del
  -- % de escaneo: son los autos que tienen calco en el parasol.
  flota_anual as (
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.fecha >= current_date - interval '12 months'
  )
  select jsonb_build_object(

    -- El checklist no se filtra: es el estado de configuración del
    -- lubricentro entero.
    'checklist', jsonb_build_object(
      'sucursales', (select count(*) from sucursales where activa),
      'productos',  (select count(*) from productos where activo),
      'premio_meta',(select meta_services from premios where activo limit 1),
      'services',   (select count(*) from services where not anulado)
    ),

    'metricas', jsonb_build_object(
      'services_mes', (
        select count(*) from services
        where not anulado
          and fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'clientes_nuevos', (
        select count(*) from primer_service ps
        where ps.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or ps.sucursal_id = p_sucursal_id)),
      'recuperados', coalesce(
        recuperados_del_mes(mi_lubricentro_id(), null, p_sucursal_id), 0),
      'canjes_mes', (
        select count(*) from canjes c
        left join services s on s.id = c.service_id
        where c.created_at >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id))
    ),

    -- La landing es de la marca: estos dos NUNCA se filtran por sucursal.
    'landing', jsonb_build_object(
      'flota', (select count(*) from flota_anual),
      'escaneados', (
        select count(*) from flota_anual f
        where exists (
          select 1 from landing_busquedas lb
          where lb.patente = f.patente_normalizada
            and lb.created_at >= now() - interval '12 months')),
      'leads', (
        select count(*) from landing_busquedas
        where not encontrada
          and created_at >= now() - interval '12 months')
    ),

    'services_por_sucursal', coalesce((
      select jsonb_agg(
        jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
        order by x.cantidad desc)
      from (
        select suc.nombre, count(*)::integer as cantidad
        from services s
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and s.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        group by suc.nombre
      ) x
    ), '[]'::jsonb),

    -- Los seis meses del gráfico, de la misma pasada. generate_series
    -- garantiza que un mes sin services aparezca en cero y no se saltee:
    -- un hueco en la serie miente sobre la tendencia.
    'evolucion', coalesce((
      select jsonb_agg(
        jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'cantidad', (
          select count(*)::integer from services s
          where not s.anulado
            and s.fecha >= m.mes
            and s.fecha < m.mes + interval '1 month'
            and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        ))
        order by m.mes)
      from generate_series(
        date_trunc('month', current_date) - interval '5 months',
        date_trunc('month', current_date),
        interval '1 month') m(mes)
    ), '[]'::jsonb),

    -- La vista ya trae el estado calculado por el ritmo real del vehículo.
    -- Se filtra por la sucursal del último service, que es la que la
    -- vista expone.
    'retencion', jsonb_build_object(
      'vencido', (select count(*) from vista_proximos_service
                  where estado = 'vencido'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'urgente', (select count(*) from vista_proximos_service
                  where estado = 'urgente'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'proximo', (select count(*) from vista_proximos_service
                  where estado = 'proximo'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id))
    ),

    'ultimos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'fecha', u.fecha,
          'creado', u.created_at,
          'patente', u.patente,
          'vehiculo', u.vehiculo,
          'sucursal', u.sucursal,
          'km', u.kilometros)
        order by u.fecha desc, u.created_at desc)
      from (
        select s.id, s.fecha, s.created_at, s.kilometros,
               v.patente,
               nullif(trim(concat_ws(' ', v.marca, v.modelo)), '') as vehiculo,
               suc.nombre as sucursal
        from services s
        join vehiculos v on v.id = s.vehiculo_id
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        order by s.fecha desc, s.created_at desc
        limit 5
      ) u
    ), '[]'::jsonb)
  );
$$;

comment on function resumen_inicio is
  'Todo lo que dibuja el Inicio, en una consulta. Con p_sucursal_id filtra todo salvo el bloque landing, que es de la marca. Security invoker.';

revoke execute on function resumen_inicio(uuid) from public;
grant execute on function resumen_inicio(uuid) to authenticated;
