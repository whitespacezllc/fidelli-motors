-- ============================================================
-- Fidelli Motors · CUIL/CUIT del cliente
--
-- Pedido de Brothers Oil: al cargar el cliente, poder guardar su
-- CUIL/CUIT para que cuando vuelva la factura salga sin pedirle el dato
-- de nuevo. Es un dato del mostrador, opcional — un alta sin CUIT no se
-- traba, igual que el email.
--
-- Se guarda NORMALIZADO: 11 dígitos pelados, sin guiones. El formato
-- con guiones (20-12345678-3) es presentación y lo pone el front. El
-- CHECK acepta null o exactamente 11 dígitos: un CUIT a medias no sirve
-- para facturar y guardarlo daría la ilusión de que el dato está.
--
-- PRIVACIDAD: es un identificador fiscal. Vive en el panel del
-- lubricentro y NADA MÁS — get_carton no lo devuelve (no se toca acá) y
-- la landing pública jamás lo muestra.
-- ============================================================

alter table clientes add column cuit text;

alter table clientes add constraint cuit_formato
  check (cuit is null or cuit ~ '^\d{11}$');

comment on column clientes.cuit is
  'CUIL/CUIT normalizado: 11 dígitos sin guiones. Opcional. Solo panel — nunca sale por get_carton.';

-- ---------- vista_clientes: el dato viaja con la ficha ----------
-- Misma definición de 20260726010000 más c.cuit. Como c.id es la PK,
-- el group by existente ya lo cubre.
--
-- DROP y no REPLACE: replace no puede meter una columna en el medio de
-- la lista ("cannot change name of view column"). Nada depende de la
-- vista, así que recrearla es seguro — y obliga igual a reponer el
-- security_invoker de abajo.
drop view if exists vista_clientes;

create view vista_clientes as
select
  c.id,
  c.lubricentro_id,
  c.nombre,
  c.telefono,
  c.email,
  c.cuit,
  c.created_at,

  lower(fm_unaccent(c.nombre)) as nombre_busqueda,
  coalesce(string_agg(distinct v.patente_normalizada, ' '), '') as patentes,

  count(distinct v.id)::integer as cantidad_vehiculos,
  max(s.fecha) filter (where not s.anulado) as ultimo_service_fecha,

  coalesce(string_agg(distinct upper(v.patente), ', '), '') as patentes_lista,
  ult.kilometros      as ultimo_service_km,
  ult.prox_service_km as ultimo_prox_service_km

from clientes c
left join vehiculos v on v.cliente_id = c.id
left join services  s on s.vehiculo_id = v.id
left join lateral (
  select s2.kilometros, s2.prox_service_km
  from services s2
  join vehiculos v2 on v2.id = s2.vehiculo_id
  where v2.cliente_id = c.id and not s2.anulado
  order by s2.fecha desc, s2.created_at desc
  limit 1
) ult on true
group by c.id, ult.kilometros, ult.prox_service_km;

-- El replace de arriba borró esta opción: sin ella la vista corre con
-- los permisos de su dueño y un owner vería los clientes de todos los
-- lubricentros. Se repone SIEMPRE que se reemplaza la vista.
alter view vista_clientes set (security_invoker = on);

comment on view vista_clientes is
  'Listado de clientes con agregados de vehículos y último service, más las columnas del export. security_invoker: respeta el RLS de quien consulta.';

-- ---------- El alta del flujo de service también lo carga ----------
-- Misma función de 20260724210204 con p_cuit al final, con default.
--
-- La firma vieja se DROPEA a propósito: si quedara, habría dos
-- sobrecargas y una llamada sin p_cuit matchearía las dos — PostgREST
-- responde 300 (ambiguo) y el alta se rompe para todos. Con una sola
-- función, el código desplegado que llama sin p_cuit sigue andando: el
-- default null hace exactamente lo que hacía la firma vieja.
drop function if exists crear_cliente_con_vehiculo(text, text, text, text, text, text, integer);

create function crear_cliente_con_vehiculo(
  p_nombre   text,
  p_telefono text,
  p_email    text,
  p_patente  text,
  p_marca    text default null,
  p_modelo   text default null,
  p_anio     integer default null,
  p_cuit     text default null
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

  insert into clientes (lubricentro_id, nombre, telefono, email, cuit)
  values (v_lubricentro, p_nombre, p_telefono, nullif(trim(p_email), ''),
          nullif(trim(p_cuit), ''))
  returning id into v_cliente;

  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
  values (v_lubricentro, v_cliente, p_patente,
          nullif(trim(p_marca), ''), nullif(trim(p_modelo), ''), p_anio)
  returning id into v_vehiculo;

  return v_vehiculo;
end;
$$;

comment on function crear_cliente_con_vehiculo is
  'Caso C del Momento 0: crea cliente y vehículo en una sola transacción. El tenant sale de la sesión. p_cuit opcional, normalizado por el front.';

grant execute on function crear_cliente_con_vehiculo(text, text, text, text, text, text, integer, text)
  to authenticated;
