-- ============================================================
-- Fidelli Motors · Patentes de moto
--
-- vehiculos solo aceptaba patentes de auto: ABC123 (1995-2016) y AB123CD
-- (Mercosur). Los lubricentros también atienden motos y hay talleres de
-- mecánica de moto entre los clientes nuevos; en la importación de
-- Fassetta dos motos quedaron afuera por esto.
--
-- LOS FORMATOS ARGENTINOS (Casa Rosada / DNRPA, sistema 1995 y Mercosur):
--   Auto  1995-2016   ABC 123     Auto  Mercosur   AB 123 CD
--   Moto  1995-2016   123 ABC     Moto  Mercosur   A 123 BCD
-- La disposición de letras y números distingue auto de moto sin
-- ambigüedad en las dos épocas: no hace falta preguntarle al mecánico ni
-- guardar un tipo. El día que el cartón necesite renglones de moto, la
-- columna se agrega entonces y la misma regla clasifica lo ya cargado.
-- Quedan afuera a propósito las chapas anteriores a 1995 (letra + 6/7
-- dígitos provinciales, casi no circulan) y las series diplomáticas.
--
-- FUENTE ÚNICA: patente_formato_valido(). La usan el CHECK de la tabla y
-- corregir_patente(); el front repite las cuatro expresiones en
-- lib/texto.ts solo para avisar antes del rechazo del server. Mismo
-- patrón que slug_reservado() para los slugs.
--
-- Nada más cambia: normalizar_patente(), get_carton(), el índice único
-- por tenant, las búsquedas y los exports trabajan sobre la patente
-- normalizada sin mirar su forma. La constraint nueva es un superconjunto
-- de la vieja: ningún vehículo existente deja de cumplirla.
-- ============================================================


-- ---------- 1 · La fuente única del formato ----------
create or replace function patente_formato_valido(p text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select p ~ '^[A-Z]{3}[0-9]{3}$'         -- auto 1995-2016   ABC123
      or p ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$' -- auto Mercosur    AB123CD
      or p ~ '^[0-9]{3}[A-Z]{3}$'         -- moto 1995-2016   123ABC
      or p ~ '^[A-Z][0-9]{3}[A-Z]{3}$';   -- moto Mercosur    A123BCD
$$;

comment on function patente_formato_valido is
  'Los cuatro formatos de patente argentina que acepta Fidelli, sobre la patente YA normalizada (mayúsculas, sin espacios): auto ABC123 / AB123CD y moto 123ABC / A123BCD. Fuente única: la usan el CHECK de vehiculos y corregir_patente().';


-- ---------- 2 · El CHECK de vehiculos usa la fuente única ----------
-- Mismo nombre de constraint: el front sigue traduciendo el 23514 igual.
alter table vehiculos drop constraint patente_formato;

alter table vehiculos add constraint patente_formato
  check (patente_formato_valido(patente_normalizada));

comment on column vehiculos.patente_normalizada is
  'Sin espacios ni guiones, mayúsculas. Se completa sola por trigger. Formatos: auto ABC123 / AB123CD, moto 123ABC / A123BCD (patente_formato_valido).';


-- ---------- 3 · corregir_patente valida con la fuente única ----------
-- Misma firma y mismo cuerpo que 20260801120000, con la guarda de formato
-- delegada a patente_formato_valido(). create or replace, sin drop: los
-- grants y revokes se conservan y el front desplegado no nota nada.
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
  if not patente_formato_valido(v_nueva_norm) then
    raise exception 'patente_formato';
  end if;

  if v_nueva_norm = v_vehiculo.patente_normalizada then
    raise exception 'patente_sin_cambio';
  end if;

  -- Dos vehículos del mismo lubricentro no pueden compartir chapa: eso no
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
  'Nivel 2: corrige la patente de un vehículo pasada la ventana de 72 hs. Exige superadmin y un motivo, que quedan registrados en correcciones_patente antes de tocar el dato. Acepta los cuatro formatos (patente_formato_valido).';


-- ---------- 4 · Las marcas de moto entran al catálogo global ----------
-- Las más patentadas en Argentina en 2026 (ACARA/DNRPA vía prensa
-- especializada). Honda, Suzuki y BMW ya estaban por el lado de los
-- autos. Solo sugiere: la marca sigue siendo texto libre.
insert into marcas_vehiculo (nombre, alias, orden) values
  ('Gilera',        '{}', 35),
  ('Motomel',       '{}', 36),
  ('Keller',        '{}', 37),
  ('Corven',        '{}', 38),
  ('Zanella',       '{}', 39),
  ('Yamaha',        '{}', 40),
  ('Bajaj',         '{}', 41),
  ('Keeway',        '{}', 42),
  ('Benelli',       '{}', 43),
  ('Guerrero',      '{}', 44),
  ('Mondial',       '{}', 45),
  ('Brava',         '{}', 46),
  ('KTM',           '{}', 47),
  ('Kawasaki',      '{}', 48),
  ('Royal Enfield', '{}', 49)
on conflict (nombre) do nothing;
