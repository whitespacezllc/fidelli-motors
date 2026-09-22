-- ============================================================
-- Fidelli Motors · Supresión de un cliente final: anonimizar, no borrar
--
-- La Política de Privacidad (22/09/2026) promete que si un cliente de un
-- lubricentro pide que borren sus datos, lo hacemos. Pero el trabajo hecho
-- sobre ese auto es también el registro comercial del lubricentro, y
-- `services → vehiculos → clientes` está en `on delete restrict` a
-- propósito: los datos históricos no se borran (CLAUDE.md).
--
-- LA RESPUESTA: LOS TRABAJOS QUEDAN, LA PERSONA DESAPARECE.
-- anonimizar_cliente() pisa el nombre con "Cliente eliminado" y deja el
-- teléfono, el email y el CUIT sin nada identificable. Los vehículos, los
-- services, los renglones, las notas y los pendientes no se tocan.
--
-- LOS SENTINELAS, fijos y documentados (el front los repite en
-- lib/clientes.ts):
--   · nombre   = 'Cliente eliminado'
--   · telefono = '-'   (es `not null`; sin dígitos, así el WhatsApp de
--                       "A quién llamar" queda apagado solo: telefonoWhatsapp()
--                       devuelve null y la fila dice "Sin teléfono válido")
--   · email    = null
--   · cuit     = null
--
-- QUIÉN PUEDE: el superadmin (el reclamo llega por email a Fidelli) Y el
-- owner del tenant del cliente (la mayoría de las veces se lo piden a él,
-- en el mostrador). Mismo resultado por las dos puertas: una sola función.
--
-- AUDITADA, CON MOTIVO: el mismo patrón que corregir_patente()
-- (20260801120000). El registro se escribe ANTES del update y en la misma
-- transacción: es imposible que el cliente quede anonimizado sin que
-- conste quién lo pidió, cuándo y por qué. El autor sale de auth.uid(),
-- nunca de un parámetro.
--
-- ⚠ Lo que NO hace, dicho para no prometer de más: no toca las notas del
-- vehículo ni las observaciones de los services —texto libre del taller—,
-- ni la patente, que es del auto y no de la persona. Lo vigila R30. (Va ANTES de la purga, 20260922140000, que borra este libro con el tenant.)
-- ============================================================


-- ---------- 1 · El libro ----------
create table supresiones_cliente (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  cliente_id      uuid not null references clientes(id) on delete restrict,
  -- Por qué: "pedido del titular por email el 22/09", "lo pidió en el
  -- mostrador". Es lo que se lee dentro de un año.
  motivo          text not null,
  -- Quién lo hizo: auth.uid(), nunca un parámetro.
  suprimido_por   uuid not null references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now(),

  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);

create index supresiones_cliente_lubricentro_idx
  on supresiones_cliente(lubricentro_id, created_at desc);
create index supresiones_cliente_cliente_idx
  on supresiones_cliente(cliente_id);

comment on table supresiones_cliente is
  'Auditoría de cada supresión de datos de un cliente final (anonimizar_cliente): tenant, cliente, motivo, quién y cuándo. Se escribe antes del update y en su misma transacción. Sin policy de escritura: solo la función.';

alter table supresiones_cliente enable row level security;

-- El owner ve las de su tenant (es su registro comercial también); el
-- superadmin, todas. Nadie escribe por fuera de la función.
create policy supresiones_lectura on supresiones_cliente for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

revoke insert, update, delete, truncate, references, trigger
  on table supresiones_cliente from authenticated;


-- ---------- 2 · La única puerta ----------
-- SECURITY DEFINER: el superadmin no pertenece a ningún tenant y el owner
-- no puede escribir el libro. El guard está en las primeras líneas: sin
-- él, definer sería una puerta abierta.
-- >>> anonimizar_cliente
create or replace function anonimizar_cliente(p_cliente_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_cliente clientes%rowtype;
  v_motivo  text := trim(coalesce(p_motivo, ''));
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;

  select * into v_cliente from clientes where id = p_cliente_id;
  if not found then
    raise exception 'cliente_no_existe';
  end if;

  -- El superadmin, o el owner del tenant DE ESE CLIENTE. Un owner de otro
  -- lubricentro no pasa aunque conozca el uuid.
  if not (soy_superadmin() or v_cliente.lubricentro_id = mi_lubricentro_id()) then   -- @guard
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if char_length(v_motivo) < 10 then
    raise exception 'motivo_insuficiente';
  end if;

  if v_cliente.nombre = 'Cliente eliminado' and v_cliente.telefono = '-' then
    raise exception 'cliente_ya_suprimido';
  end if;

  -- El libro PRIMERO. suprimido_por sale de auth.uid().
  insert into supresiones_cliente (lubricentro_id, cliente_id, motivo, suprimido_por)
  values (v_cliente.lubricentro_id, v_cliente.id, v_motivo, v_uid);       -- @auditoria

  update clientes
     set nombre   = 'Cliente eliminado',                                    -- @sentinela
         telefono = '-',
         email    = null,
         cuit     = null
   where id = p_cliente_id;
end;
$$;
-- <<< anonimizar_cliente

comment on function anonimizar_cliente is
  'Supresión de datos de un cliente final a su pedido: pisa nombre/teléfono/email/CUIT con sentinelas no identificables y deja intactos los vehículos y los trabajos. Superadmin o el owner del tenant del cliente; exige motivo (>= 10) y lo registra en supresiones_cliente antes de tocar el dato.';

revoke all on function anonimizar_cliente(uuid, text) from public, anon;
grant execute on function anonimizar_cliente(uuid, text) to authenticated;
