-- ============================================================
-- Fidelli Motors · Dejar de guardar las patentes que no son de nadie
--
-- landing_busquedas registra cada consulta de la vidriera pública: qué
-- lubricentro, si encontró el auto y cuándo. Hasta hoy guardaba también LA
-- PATENTE de las consultas sin resultado —"los leads", con su propio
-- índice— y la Política de Privacidad (22/09/2026) dice otra cosa: "Si la
-- patente no está cargada en ese lubricentro, no la guardamos". Santiago
-- confirmó que esa patente solo se usa EN EL MOMENTO, para armar el
-- mensaje de WhatsApp de "no encontramos tu patente", y nunca se lee
-- después. La métrica —cuántas consultas, cuántas sin resultado— no la
-- necesita.
--
-- QUÉ CAMBIA
--   · `patente` pasa a anulable.
--   · Se va `landing_busquedas_leads_idx`, el índice de los leads.
--   · Un trigger deja `patente` en null cuando `encontrada = false`, venga
--     de donde venga el insert.
--
-- POR QUÉ UN TRIGGER Y NO SOLO TOCAR get_carton
-- get_carton() es quien escribe estas filas en producción, pero no es el
-- único que puede escribirlas: seed_demo() inserta cuatro consultas sin
-- resultado con su patente, y cualquier función futura podría copiar el
-- insert de siempre. La regla "una consulta sin resultado no guarda la
-- patente" es de la TABLA, y en la tabla se hace cumplir. Redefinir
-- get_carton (270 líneas) solo para cambiar una expresión que el trigger
-- ya resuelve sería copiar la función más tocada del repo por cuarta vez
-- —y desplazar `scripts/regresion-pesado.sh`, que la muerde de
-- 20260915130000— sin ganar nada.
--
-- El mensaje de WhatsApp de la página pública NO cambia: la patente viaja
-- en el request (`?nohay=` → components/cliente/patente-no-encontrada.tsx),
-- no en la tabla. Se verificó antes de escribir esto.
--
-- El backfill de las filas que ya existen va en su propia migración
-- (20260922121000): es un borrado de datos personales y se revisa aparte.
-- Lo vigila R28.
-- ============================================================

alter table landing_busquedas alter column patente drop not null;

drop index if exists landing_busquedas_leads_idx;

-- >>> landing_busquedas_sin_patente
create or replace function landing_busquedas_sin_patente()
returns trigger
language plpgsql
as $$
begin
  -- Sin resultado, sin patente. La consulta se cuenta igual.
  if not new.encontrada then
    new.patente := null;                                               -- @sin_patente
  end if;
  return new;
end;
$$;
-- <<< landing_busquedas_sin_patente

create trigger landing_busquedas_sin_patente
  before insert or update on landing_busquedas
  for each row execute function landing_busquedas_sin_patente();

comment on function landing_busquedas_sin_patente is
  'Una consulta sin resultado no guarda la patente (Política de Privacidad, 22/09/2026): el trigger la deja en null venga de donde venga el insert. La patente solo se usa en el momento, para el mensaje de WhatsApp, y viaja en el request.';

comment on column landing_busquedas.patente is
  'La patente normalizada SOLO cuando encontrada = true (para el % de vehículos escaneados). Null en las consultas sin resultado: no se guardan patentes de gente que no es cliente de nadie.';

comment on table landing_busquedas is
  'Métrica de escaneo de la vidriera pública: una fila por consulta, con la patente solo si encontró el auto. Desde 20260922120000 ya no captura leads.';
