-- ============================================================
-- Fidelli Motors · Resumen de la pantalla de Inicio
--
-- El Inicio necesita ocho cosas distintas: el estado del checklist del
-- día 1, cuatro métricas del mes, el desglose de services por sucursal,
-- los tres conteos de retención y los últimos services. Cada una es un
-- agregado, y los agregados de PostgREST están deshabilitados, así que
-- desde el front serían ocho viajes para dibujar una sola pantalla.
--
-- Acá se arma todo en una consulta y viaja un jsonb.
--
-- Security invoker, como el resto: el RLS de cada tabla se evalúa igual
-- que si la consulta viniera del front, y por eso no hace falta filtrar
-- por lubricentro en ninguna de las subconsultas. La única excepción es
-- recuperados_del_mes(), que recibe el tenant por parámetro: se le pasa
-- mi_lubricentro_id(), no algo que venga del cliente.
-- ============================================================

create or replace function resumen_inicio()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(

    -- Estado del checklist. Cada paso muestra el dato real conseguido,
    -- así que se cuentan de verdad en lugar de devolver un booleano.
    'checklist', jsonb_build_object(
      'sucursales', (select count(*) from sucursales where activa),
      'productos',  (select count(*) from productos where activo),
      'premio_meta',(select meta_services from premios where activo limit 1),
      'services',   (select count(*) from services where not anulado)
    ),

    'metricas', jsonb_build_object(
      'services_mes', (
        select count(*) from services
        where not anulado and fecha >= date_trunc('month', current_date)),
      'clientes_nuevos', (
        select count(*) from clientes
        where created_at >= date_trunc('month', current_date)),
      'recuperados', coalesce(recuperados_del_mes(mi_lubricentro_id()), 0),
      'canjes_mes', (
        select count(*) from canjes
        where created_at >= date_trunc('month', current_date))
    ),

    'services_por_sucursal', coalesce((
      select jsonb_agg(
        jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
        order by x.cantidad desc)
      from (
        select suc.nombre, count(*)::integer as cantidad
        from services s
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado and s.fecha >= date_trunc('month', current_date)
        group by suc.nombre
      ) x
    ), '[]'::jsonb),

    -- La vista ya trae el estado calculado por el ritmo real del vehículo.
    'retencion', jsonb_build_object(
      'vencido', (select count(*) from vista_proximos_service where estado = 'vencido'),
      'urgente', (select count(*) from vista_proximos_service where estado = 'urgente'),
      'proximo', (select count(*) from vista_proximos_service where estado = 'proximo')
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
        order by s.fecha desc, s.created_at desc
        limit 5
      ) u
    ), '[]'::jsonb)
  );
$$;

comment on function resumen_inicio is
  'Todo lo que dibuja la pantalla de Inicio, en una sola consulta. Security invoker: respeta el RLS de quien consulta.';

revoke execute on function resumen_inicio() from public;
grant execute on function resumen_inicio() to authenticated;
