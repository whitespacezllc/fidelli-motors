-- ============================================================
-- Fidelli Motors · El buscador de clientes encuentra el teléfono por sus
-- dígitos (21/10/2026)
--
-- El teléfono de un cliente se guarda como lo escribió el mostrador:
-- «351 317-2545», «3513172545», «+54 9 351 317 2545». El buscador compara
-- lo que se tipea —solo dígitos— contra la columna cruda, así que un
-- teléfono cargado con espacios o guiones no aparecía al buscarlo.
--
-- Una columna más en vista_clientes, al FINAL (create or replace view no
-- deja insertar columnas en el medio): `telefono_digitos`, el teléfono sin
-- nada que no sea un número. El filtro del front (lib/clientes.ts) compara
-- contra esta y no contra `telefono`. La vista no cambia en nada más.
--
-- Va junto con el arreglo de la forma de la búsqueda: letras y números
-- juntos son una patente, y se busca SOLO en las patentes; antes «KXM616»
-- buscaba además «616» adentro de todos los teléfonos y devolvía cuatro
-- clientes en Brothers Oil. Esa parte vive en el front; la base solo suma
-- la columna.
-- ============================================================

create or replace view vista_clientes as
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
  max(s.fecha) filter (where not s.anulado and s.tipo = 'service') as ultimo_service_fecha,
  coalesce(string_agg(distinct upper(v.patente), ', '), '') as patentes_lista,
  ult.kilometros      as ultimo_service_km,
  ult.prox_service_km as ultimo_prox_service_km,
  -- la última visita: cualquier tipo de trabajo (ver vista_vehiculos)
  max(s.fecha) filter (where not s.anulado) as ultima_visita_fecha,
  -- El teléfono como se busca: solo dígitos. «351 317-2545» → «3513172545».
  regexp_replace(c.telefono, '\D', '', 'g') as telefono_digitos
from clientes c
left join vehiculos v on v.cliente_id = c.id
left join services  s on s.vehiculo_id = v.id
left join lateral (
  select s2.kilometros, s2.prox_service_km
  from services s2
  join vehiculos v2 on v2.id = s2.vehiculo_id
  where v2.cliente_id = c.id
    and not s2.anulado
    and s2.tipo = 'service'
  order by s2.fecha desc, s2.created_at desc
  limit 1
) ult on true
group by c.id, ult.kilometros, ult.prox_service_km;

-- Regla 4: create or replace view RESETEA las reloptions. Sin esto la vista
-- corre con los permisos de su dueño y un owner ve los clientes de todos.
alter view vista_clientes set (security_invoker = on);

comment on column vista_clientes.telefono_digitos is
  'El teléfono sin nada que no sea un número. Es la columna contra la que busca el front (lib/clientes.ts).';
