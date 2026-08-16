-- ============================================================
-- Las series de los dos gráficos, TODAS las granularidades de una vez.
--
-- Los gráficos pasan a ser interactivos: el toggle de período cambia de
-- serie al instante, sin viaje al servidor. Para eso cada RPC devuelve
-- todas sus series juntas — sigue siendo una consulta por pantalla, y
-- agregar por período sobre los índices (lubricentro_id, fecha) es
-- barato a la escala de un tenant.
--
-- Cada serie se RECORTA al primer service bajo el filtro vigente, como
-- ya hacía metricas_plataforma: un eje lleno de ceros anteriores al
-- arranque miente sobre la tendencia.
-- ============================================================

-- ---------- resumen_inicio: se agrega 'series' ----------
--
-- MISMA FIRMA (create or replace conserva los grants). Es una función,
-- no una vista: acá no existe el trap de reloptions/security_invoker.
--
-- ⚠ 'evolucion' SE CONSERVA A PROPÓSITO durante la transición: el front
-- desplegado la lee, y si desaparece antes del deploy nuevo el Inicio de
-- todos los tenants se cae con un TypeError. Se elimina en una migración
-- de limpieza cuando el front nuevo esté en producción.
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
  ),
  -- El arranque de las series: el primer service bajo el filtro vigente.
  -- Con el filtro de sucursal puesto, cada sucursal arranca donde
  -- realmente arrancó — no donde arrancó el tenant.
  primer_de_serie as (
    select min(s.fecha) as fecha
    from services s
    where not s.anulado
      and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
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

    -- ⚠ TRANSICIÓN: la lee el front viejo. El nuevo usa 'series.mes'.
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

    -- Las cuatro series del gráfico nuevo. Ventanas: 12 semanas, 12
    -- meses, 8 trimestres (dos años de estacionalidad) y todos los años.
    -- El punto es {inicio: date, cantidad} — 'inicio' como fecha real y
    -- no 'YYYY-MM', para que las cuatro compartan el mismo formateador
    -- de etiquetas en el front.
    'series', (
      select jsonb_object_agg(g.clave, serie.datos)
      from (values
        ('semana',    'week',    interval '1 week',   12),
        ('mes',       'month',   interval '1 month',  12),
        ('trimestre', 'quarter', interval '3 months',  8),
        -- 1000 = "sin tope": el greatest() de abajo recorta al primer
        -- service igual, así que el techo real lo pone la antigüedad.
        ('anio',      'year',    interval '1 year', 1000)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select case
          when (select fecha from primer_de_serie) is null then '[]'::jsonb
          else coalesce((
            select jsonb_agg(
              jsonb_build_object('inicio', p.inicio, 'cantidad', (
                select count(*)::integer from services s
                where not s.anulado
                  and s.fecha >= p.inicio
                  and s.fecha < (p.inicio + g.paso)::date
                  and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
              ))
              order by p.inicio)
            from (
              select generate_series(
                greatest(
                  (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                  date_trunc(g.unidad, (select fecha from primer_de_serie))::date
                ),
                date_trunc(g.unidad, current_date)::date,
                g.paso)::date as inicio
            ) p
          ), '[]'::jsonb)
        end as datos
      ) serie
    ),

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
  'Todo lo que dibuja el Inicio, en una consulta. Con p_sucursal_id filtra todo salvo el bloque landing, que es de la marca. series = {semana, mes, trimestre, anio} para el gráfico interactivo; evolucion queda solo por la transición del deploy. Security invoker.';

-- ---------- metricas_plataforma: todas las granularidades juntas ----------
--
-- La firma CAMBIA (se va p_granularidad), y una función con default no
-- puede convivir con la de cero argumentos: PostgREST no sabría a cuál
-- despachar rpc("metricas_plataforma"). Drop + create — y el drop pierde
-- los grants, así que se reponen explícitos (mismo patrón que
-- 20260726030000_dashboard_por_sucursal).
drop function if exists metricas_plataforma(text);

create function metricas_plataforma()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_primero date;
  v_series jsonb;
begin
  -- SECURITY INVOKER a propósito, con guarda ruidosa: si la llamara un
  -- owner, el RLS le recortaría services a los suyos y esto devolvería
  -- los datos de UN tenant con cara de "toda la plataforma". Un número
  -- equivocado con cara de correcto es peor que un error.
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  select min(fecha) into v_primero from services where not anulado;

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
              where not s.anulado
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
    'services_mes', (select count(*) from services
                     where not anulado and fecha >= date_trunc('month', current_date)),
    'acumulado', (select count(*) from services where not anulado),
    'primer_service', v_primero,
    'series', v_series
  );
end;
$$;

comment on function metricas_plataforma is
  'El Pulso de /fidelli: series {dia, semana, mes} de toda la plataforma en una llamada, para el toggle instantáneo del front. Exige superadmin con excepción ruidosa.';

revoke execute on function metricas_plataforma() from public;
grant execute on function metricas_plataforma() to authenticated;
