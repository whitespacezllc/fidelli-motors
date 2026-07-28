-- ============================================================
-- Fidelli Motors · La patente es inmutable después del primer service
--
-- POR QUÉ
-- El producto entero se apoya en que la patente identifica un auto físico:
-- el cliente escanea el QR, busca su patente y ve el historial de SU auto.
-- Si esa patente se pudiera cambiar después de tener services, se podría
-- mudar el historial de un auto a otro —vender un auto con service que no
-- tuvo, borrarle el pasado a otro—. La patente es la llave, y una llave que
-- se puede recortar no sirve.
--
-- LA REGLA
-- Un vehículo con al menos un service NO anulado tiene la patente congelada.
-- Cambiar marca, modelo o año sigue permitido; sólo la patente se traba.
--
-- LA SALIDA PARA EL ERROR DE TIPEO
-- Se traba con service NO anulado, no con "cualquier service". Si el
-- mecánico tipeó mal la patente y ya cargó el service, dentro de las 24 hs
-- puede anular ese service (la regla de las 24 hs se lo permite), corregir
-- la patente y recargarlo. Pasada esa ventana el service queda fijado, no
-- se puede anular, y la patente queda fija con él. La misma filosofía de 24
-- horas que gobierna todo lo demás.
--
-- DÓNDE VIVE
-- En un trigger, no en la Server Action. Que la regla la imponga la base es
-- lo único a prueba de fraude: no importa por qué puerta se intente el
-- cambio —el panel, la API directa con la clave del tenant, un script—, la
-- base lo rechaza igual. El front sólo muestra el candado; la base lo cierra.
-- ============================================================

create or replace function bloquear_cambio_de_patente()
returns trigger
language plpgsql
-- SECURITY DEFINER a propósito: la comprobación tiene que ver TODOS los
-- services del vehículo, sin que el RLS de quien llama pueda esconder
-- alguno y dejar pasar el cambio. Es la garantía anti-fraude.
security definer
set search_path = public
as $$
begin
  -- Sólo importa si la patente cambia DE VERDAD. Se compara normalizada, así
  -- reescribir "AB 123 CD" como "AB123CD" —la misma chapa, otro formato— no
  -- cuenta como cambio y no se bloquea.
  if normalizar_patente(new.patente) is distinct from normalizar_patente(old.patente) then
    if exists (
      select 1 from services s
      where s.vehiculo_id = old.id and not s.anulado
    ) then
      -- errcode por defecto (P0001), NO check_violation: el CHECK de formato
      -- de la patente ya usa 23514, y compartir código haría que el front
      -- confunda "patente bloqueada" con "formato inválido". Se distingue por
      -- el mensaje 'patente_bloqueada'.
      raise exception 'patente_bloqueada'
        using
          hint = 'La patente queda fija en cuanto el vehículo tiene un service. '
                 'Si fue un error, anulá el service dentro de las 24 horas, '
                 'corregí la patente y volvé a cargarlo.';
    end if;
  end if;

  return new;
end;
$$;

comment on function bloquear_cambio_de_patente is
  'Rechaza el cambio de patente de un vehículo que ya tiene un service no anulado. Es la regla anti-fraude, del lado de la base.';

-- `of patente`: el trigger sólo se despierta cuando el UPDATE toca la
-- columna patente. Editar marca/modelo/año no lo activa. Independiente del
-- orden con el trigger de normalización: compara normalizando ambos lados.
drop trigger if exists vehiculos_patente_inmutable on vehiculos;

create trigger vehiculos_patente_inmutable
  before update of patente on vehiculos
  for each row
  execute function bloquear_cambio_de_patente();
