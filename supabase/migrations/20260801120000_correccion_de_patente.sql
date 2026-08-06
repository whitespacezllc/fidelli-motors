-- ============================================================
-- Fidelli Motors · La patente se corrige en dos niveles
--
-- EL CASO REAL que motivó esto: una clienta le dictó mal la patente a
-- Bruno. Se cargó AE551IJ y era AG551IJ. Con la regla anterior (patente
-- congelada apenas hay un service) la única salida era anular el service
-- dentro de las 24 hs y recargarlo — y si pasaban, había que tocar la
-- base a mano. Eso no escala y no deja rastro.
--
-- LOS DOS NIVELES
--
--   Nivel 1 · el lubricentro se autocorrige (72 horas)
--     Mientras el primer service del vehículo tenga menos de 72 hs, el
--     lubri edita la patente desde su panel, sin pedir permiso. Un typo se
--     descubre en el momento o al día siguiente; 72 hs cubren el fin de
--     semana (un auto atendido el viernes se corrige el lunes).
--
--   Nivel 2 · Fidelli corrige, con motivo y auditoría
--     Pasada la ventana, la patente SOLO se cambia por corregir_patente(),
--     que exige superadmin + un motivo escrito y lo guarda para siempre en
--     correcciones_patente. Ese registro es la respuesta a "no nos pueden
--     mentir": queda quién pidió qué, cuándo y por qué.
--
-- POR QUÉ SIGUE EXISTIENDO EL CANDADO
-- Lo de siempre: el producto se apoya en que la patente identifica un auto
-- físico. Si se pudiera cambiar libremente, se mudaría el historial de un
-- auto a otro. Lo que cambia acá no es la regla — es que ahora tiene una
-- puerta con llave y libro de visitas, en vez de una pared.
--
-- LA MECÁNICA DEL NIVEL 2, explicada porque no es obvia:
-- El trigger no puede preguntar "¿quién sos?" para decidir, porque un
-- superadmin con acceso SQL crudo también es superadmin — y entonces la
-- auditoría sería opcional, que es lo mismo que no tenerla. En vez de eso
-- el trigger exige una MARCA DE TRANSACCIÓN (un GUC local) que sólo
-- corregir_patente() sabe poner. Como es `set local`, muere al terminar la
-- transacción: no se puede dejar puesta "por las dudas". Resultado: la
-- única forma de cambiar una patente vieja es pasar por la función, y la
-- función siempre escribe el registro ANTES de permitir el cambio.
-- ============================================================


-- ---------- 1. El libro de visitas ----------
create table correcciones_patente (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  vehiculo_id     uuid not null references vehiculos(id) on delete restrict,
  patente_anterior text not null,
  patente_nueva    text not null,
  -- Por qué se corrigió. Lo escribe Fidelli con lo que le contó el lubri.
  motivo          text not null,
  -- Quién la hizo: sale de auth.uid(), nunca de un parámetro. Una
  -- auditoría que acepta el autor por parámetro no es auditoría.
  corregido_por   uuid not null references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now(),

  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);

create index correcciones_patente_lubricentro_idx
  on correcciones_patente(lubricentro_id, created_at desc);
create index correcciones_patente_vehiculo_idx
  on correcciones_patente(vehiculo_id);

comment on table correcciones_patente is
  'Auditoría de las correcciones de patente hechas por Fidelli pasada la ventana de autocorrección. Append-only en la práctica: nadie tiene policy de update ni delete.';

alter table correcciones_patente enable row level security;

-- Sólo Fidelli. El lubricentro NO ve este registro desde su panel: es el
-- libro de la plataforma, y dejarlo escribir o borrar vaciaría de sentido
-- la auditoría. Sin policy de update ni delete a propósito — ni siquiera
-- para el superadmin: una corrección registrada no se edita.
create policy correcciones_lectura on correcciones_patente for select to authenticated
  using (soy_superadmin());

create policy correcciones_alta on correcciones_patente for insert to authenticated
  with check (soy_superadmin());


-- ---------- 2. El candado, ahora en dos niveles ----------
create or replace function bloquear_cambio_de_patente()
returns trigger
language plpgsql
-- SECURITY DEFINER a propósito: la comprobación tiene que ver TODOS los
-- services del vehículo, sin que el RLS de quien llama pueda esconder
-- alguno y dejar pasar el cambio. Es la garantía anti-fraude.
security definer
set search_path = public
as $$
declare
  v_primer_service timestamptz;
begin
  -- Sólo importa si la patente cambia DE VERDAD. Se compara normalizada, así
  -- reescribir "AB 123 CD" como "AB123CD" —la misma chapa, otro formato— no
  -- cuenta como cambio y no se bloquea.
  if normalizar_patente(new.patente) is not distinct from normalizar_patente(old.patente) then
    return new;
  end if;

  -- Nivel 2: la corrección auditada de Fidelli. Se chequea PRIMERO porque
  -- es la excepción explícita — si la marca está puesta, corregir_patente()
  -- ya validó el rol y escribió el registro.
  --
  -- current_setting con true devuelve null si el GUC no existe, en vez de
  -- reventar. Nadie fuera de corregir_patente() lo pone: es `set local`,
  -- vive lo que dura la transacción y muere con ella.
  if coalesce(current_setting('fidelli.correccion_patente', true), '') = 'si' then
    return new;
  end if;

  -- Nivel 1: la ventana de autocorrección del lubricentro. Se mide desde el
  -- PRIMER service no anulado — no desde el último. Si se midiera desde el
  -- último, cargar un service nuevo reabriría la ventana de un auto con
  -- años de historial, y el candado no serviría para nada.
  select min(s.created_at) into v_primer_service
  from services s
  where s.vehiculo_id = old.id and not s.anulado;

  -- Sin services: la patente es libre, como siempre.
  if v_primer_service is null then
    return new;
  end if;

  if now() - v_primer_service < interval '72 hours' then
    return new;
  end if;

  -- errcode por defecto (P0001), NO check_violation: el CHECK de formato
  -- de la patente ya usa 23514, y compartir código haría que el front
  -- confunda "patente bloqueada" con "formato inválido". Se distingue por
  -- el mensaje 'patente_bloqueada'.
  raise exception 'patente_bloqueada'
    using
      hint = 'La patente se puede corregir hasta 72 horas después del primer '
             'service. Pasado ese plazo la cambia el equipo Fidelli, con un '
             'motivo que queda registrado.';
end;
$$;

comment on function bloquear_cambio_de_patente is
  'Candado de patente en dos niveles: libre hasta 72 hs después del primer service; después, sólo por corregir_patente() (superadmin + motivo auditado).';


-- ---------- 3. La única puerta del Nivel 2 ----------
--
-- POSTURA DE SEGURIDAD: SECURITY DEFINER, y acá sí hace falta explicarlo.
-- El UPDATE de vehiculos tiene que correr por encima del RLS del tenant
-- (un superadmin no pertenece a ningún lubricentro), y el trigger de
-- arriba es definer también. El guard soy_superadmin() está en la primera
-- línea: sin él, definer sería una puerta abierta.
--
-- El orden importa y no es casual: se valida TODO, se escribe la
-- auditoría, y recién después se pone la marca y se hace el update. Como
-- es una sola transacción, si el update falla el registro se va con él —
-- pero es imposible que el update pase sin que el registro exista.
create or replace function corregir_patente(
  p_vehiculo_id uuid,
  p_patente_nueva text,
  p_motivo text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehiculo   vehiculos%rowtype;
  v_nueva_norm text;
  v_motivo     text := trim(coalesce(p_motivo, ''));
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede corregir una patente'
      using errcode = '42501';
  end if;

  if char_length(v_motivo) < 10 then
    raise exception 'motivo_insuficiente';
  end if;

  select * into v_vehiculo from vehiculos where id = p_vehiculo_id;
  if not found then
    raise exception 'vehiculo_no_existe';
  end if;

  v_nueva_norm := normalizar_patente(coalesce(p_patente_nueva, ''));

  -- El formato lo valida igual el CHECK de la tabla, pero acá el error
  -- sale con nombre propio y el front puede decir algo útil.
  if v_nueva_norm !~ '^[A-Z]{3}[0-9]{3}$' and v_nueva_norm !~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' then
    raise exception 'patente_formato';
  end if;

  if v_nueva_norm = v_vehiculo.patente_normalizada then
    raise exception 'patente_sin_cambio';
  end if;

  -- Dos autos del mismo lubricentro no pueden compartir chapa: eso no
  -- sería corregir, sería fusionar dos historiales.
  if exists (
    select 1 from vehiculos
    where lubricentro_id = v_vehiculo.lubricentro_id
      and patente_normalizada = v_nueva_norm
  ) then
    raise exception 'patente_ocupada';
  end if;

  -- La auditoría PRIMERO. corregido_por sale de auth.uid().
  insert into correcciones_patente (
    lubricentro_id, vehiculo_id, patente_anterior, patente_nueva,
    motivo, corregido_por
  ) values (
    v_vehiculo.lubricentro_id, v_vehiculo.id, v_vehiculo.patente,
    trim(p_patente_nueva), v_motivo, auth.uid()
  );

  -- La marca que abre el candado. `set local`: muere al cerrar la
  -- transacción, no se puede dejar puesta.
  set local fidelli.correccion_patente = 'si';

  update vehiculos
  set patente = trim(p_patente_nueva)
  where id = p_vehiculo_id;
end;
$$;

comment on function corregir_patente is
  'Nivel 2: corrige la patente de un vehículo pasada la ventana de 72 hs. Exige superadmin y un motivo, que quedan registrados en correcciones_patente antes de tocar el dato.';

revoke execute on function corregir_patente(uuid, text, text) from public;
revoke execute on function corregir_patente(uuid, text, text) from anon;
grant execute on function corregir_patente(uuid, text, text) to authenticated;
