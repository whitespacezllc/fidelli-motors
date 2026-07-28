-- ============================================================
-- Fidelli Motors · Momento 0 de la carga de service
--
-- Dos funciones para la pantalla que decide el producto. Ninguna es
-- security definer a propósito: corren con los permisos de quien llama,
-- así el RLS multi-tenant sigue aplicando sobre cada tabla que tocan.
-- ============================================================

-- ---------- 1. Identificar el vehículo por patente ----------
-- La mini-ficha del Caso A necesita, de una sola vez: el vehículo, su
-- dueño, el último service (fecha, km y sucursal) y si tiene premio
-- disponible. Son cuatro tablas más una función: resolverlo desde el
-- front serían varios viajes con el auto esperando, así que se arma acá
-- y viaja una fila.
create or replace function buscar_vehiculo_por_patente(p_patente text)
returns table (
  vehiculo_id            uuid,
  patente                text,
  marca                  text,
  modelo                 text,
  anio                   integer,
  cliente_id             uuid,
  cliente_nombre         text,
  cliente_telefono       text,
  ultimo_service_fecha   date,
  ultimo_service_km      integer,
  ultimo_service_sucursal text,
  cantidad_services      integer,
  premio_disponible      boolean,
  premio_descripcion     text,
  premio_services_ciclo  integer,
  premio_meta            integer
)
language sql
stable
set search_path = public
as $$
  select
    v.id,
    v.patente,
    v.marca,
    v.modelo,
    v.anio,
    c.id,
    c.nombre,
    c.telefono,
    ult.fecha,
    ult.kilometros,
    ult.sucursal_nombre,
    coalesce(
      (select count(*)::integer from services s
       where s.vehiculo_id = v.id and not s.anulado),
      0),
    coalesce(pr.disponible, false),
    pr.descripcion,
    pr.services_ciclo,
    pr.meta_services
  from vehiculos v
  join clientes c on c.id = v.cliente_id
  -- El último service no anulado, con el nombre de su sucursal
  left join lateral (
    select s.fecha, s.kilometros, suc.nombre as sucursal_nombre
    from services s
    join sucursales suc on suc.id = s.sucursal_id
    where s.vehiculo_id = v.id and not s.anulado
    order by s.fecha desc, s.created_at desc
    limit 1
  ) ult on true
  -- El ciclo con reset lo calcula la base, no el front
  left join lateral premio_disponible(v.id) pr on true
  where v.patente_normalizada = normalizar_patente(p_patente)
  limit 1;
$$;

comment on function buscar_vehiculo_por_patente is
  'Momento 0: vehículo + dueño + último service + estado del premio, en una sola consulta.';

grant execute on function buscar_vehiculo_por_patente(text) to authenticated;

-- ---------- 2. Alta de cliente y vehículo, atómica ----------
-- El Caso C crea los dos juntos. Una función de plpgsql corre dentro de
-- una sola transacción: si la patente choca con el índice único, el
-- cliente tampoco queda creado. Hacerlo con dos inserts desde el front
-- dejaría clientes huérfanos cada vez que falla el segundo.
--
-- El lubricentro NO viaja como parámetro: sale de la sesión con
-- mi_lubricentro_id(), así no hay forma de pedir el alta en otro tenant.
create or replace function crear_cliente_con_vehiculo(
  p_nombre   text,
  p_telefono text,
  p_email    text,
  p_patente  text,
  p_marca    text default null,
  p_modelo   text default null,
  p_anio     integer default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_cliente     uuid;
  v_vehiculo    uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  insert into clientes (lubricentro_id, nombre, telefono, email)
  values (v_lubricentro, p_nombre, p_telefono, nullif(trim(p_email), ''))
  returning id into v_cliente;

  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
  values (v_lubricentro, v_cliente, p_patente,
          nullif(trim(p_marca), ''), nullif(trim(p_modelo), ''), p_anio)
  returning id into v_vehiculo;

  return v_vehiculo;
end;
$$;

comment on function crear_cliente_con_vehiculo is
  'Caso C del Momento 0: crea cliente y vehículo en una sola transacción. El tenant sale de la sesión.';

grant execute on function crear_cliente_con_vehiculo(text, text, text, text, text, text, integer)
  to authenticated;
