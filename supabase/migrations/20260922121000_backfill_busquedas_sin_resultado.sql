-- ============================================================
-- Fidelli Motors · Backfill: las patentes de las consultas sin resultado
--
-- ⚠ ESTA MIGRACIÓN BORRA DATOS PERSONALES, y por eso va sola.
--
-- Hasta 20260922120000, cada consulta sin resultado en la vidriera de un
-- lubricentro guardaba la patente que alguien escribió: la patente de un
-- auto que NO es cliente de ese lubricentro —y muchas veces de ninguno—,
-- guardada "como lead" y nunca leída. La Política de Privacidad vigente
-- desde el 22/09/2026 promete lo contrario ("Si la patente no está cargada
-- en ese lubricentro, no la guardamos"), y una promesa escrita se cumple
-- también hacia atrás: acá se anulan las patentes que ya estaban.
--
-- La fila NO se borra: la métrica (cuántas consultas, cuántas sin
-- resultado, cuándo) no pierde nada. Se va solo el dato que identifica.
--
-- Y después del backfill, el CHECK: desde acá una fila con `not encontrada`
-- y patente escrita no puede existir, ni aunque alguien apague el trigger.
-- Va en esta migración y no en la anterior porque un CHECK no se puede
-- agregar mientras haya filas que lo violen.
--
-- Antes de mergear: Santiago mira el conteo de este backfill en dev (sale
-- en el log de la migración) — es un borrado y se revisa. Lo vigila R28.
-- ============================================================

do $$
declare
  v_antes   integer;
  v_tocadas integer;
begin
  select count(*) into v_antes from landing_busquedas where not encontrada;

  update landing_busquedas
     set patente = null
   where not encontrada
     and patente is not null;
  get diagnostics v_tocadas = row_count;

  raise notice 'búsquedas sin patente · consultas sin resultado: % · patentes anuladas por el backfill: %',
    v_antes, v_tocadas;
end $$;

alter table landing_busquedas
  add constraint busqueda_sin_resultado_sin_patente
  check (encontrada or patente is null);

comment on constraint busqueda_sin_resultado_sin_patente on landing_busquedas is
  'Segunda defensa detrás del trigger landing_busquedas_sin_patente: una consulta sin resultado nunca guarda la patente.';

-- La red: si quedó UNA fila con la patente de una consulta sin resultado,
-- la migración falla acá, ruidosa.
do $$
declare v_n integer;
begin
  select count(*) into v_n from landing_busquedas where not encontrada and patente is not null;
  if v_n <> 0 then
    raise exception 'busquedas sin patente: quedaron % fila(s) sin resultado con la patente escrita después del backfill.', v_n;
  end if;
end $$;
