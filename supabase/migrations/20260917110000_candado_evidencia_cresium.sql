-- ════════════════════════════════════════════════════════════════════
-- EL CANDADO DE `cresium_eventos` · sin candado no es evidencia, es un log
--
-- La tabla se diseñó inmutable y append-only —está escrito en su propio
-- comment (20260916180000:68)— y se vació en su primera semana. Del cobro
-- de $390 del 16/09/2026 no queda una fila, y ese borrado es lo que quemó
-- el `externalId` (la regla 20 de CLAUDE.md): la orden siguiente volvió con
-- «400 EXISTING_EXTERNAL_ID» porque en Cresium la referencia sigue viva
-- para siempre, aunque acá no quede rastro.
--
-- En un repo que ya tiene `bloquear_override_directo`,
-- `bloquear_precio_directo` y `patente_inmutable`, la tabla de EVIDENCIA
-- era la única sin candado. La promesa estaba en un comentario y en la
-- ausencia de una policy; ninguna de las dos cosas frena un `delete`.
--
--
-- TRES CANDADOS, NO UNO, Y CADA UNO TAPA UN CAMINO DISTINTO
--
--   · el BORRADO  — `delete`, fila por fila.
--   · la EDICIÓN  — `update` sobre las columnas de evidencia. Sin esto, un
--                   `update cresium_eventos set payload = '{}'` hace el
--                   mismo daño con una línea y es PEOR: la fila queda y
--                   sigue pareciendo evidencia. Un conteo como el de R22d
--                   seguiría en verde mientras la respuesta a "yo
--                   transferí" ya no existe. Inmutabilidad que cubre la
--                   existencia de la fila y no su contenido no es
--                   inmutabilidad.
--   · la PURGA    — `truncate`. Un trigger `before delete ... for each row`
--                   NO SE DESPIERTA con un truncate, y `authenticated`,
--                   `service_role` y `postgres` tienen los tres ese
--                   privilegio sobre esta tabla. Un trigger de truncate
--                   solo puede ser `for each statement`; `for each row` es
--                   error de sintaxis.
--
--
-- ⚠ EL DE EDICIÓN VA ACOTADO POR COLUMNA, O ROMPE EL COBRO. El webhook
-- escribe seis veces sobre esta tabla (20260917000000): un insert y cinco
-- updates, y los cinco tocan ÚNICAMENTE `procesado_at` y `motivo`
-- —`cresium_reprocesar_evento` toca `motivo` solo—. Ningún update del
-- sistema toca jamás `payload`, `transaccion_id`, `tipo`, `external_id`,
-- `intento` ni `recibido_at`. Un candado sin acotar mata las seis, la ruta
-- devuelve 500 y Cresium reintenta cinco veces: no se ve un error, se ve
-- una pantalla que sigue diciendo "esperando tu transferencia" con la
-- plata ya acreditada.
--
-- Y se escribe como «si CUALQUIER columna de evidencia cambia → rechazo»,
-- NUNCA como «solo se permite si cambian procesado_at y motivo»: la
-- segunda formulación rompe `cresium_reprocesar_evento`, que actualiza
-- `motivo` solo. Es el molde de `bloquear_precio_directo`, que mira solo
-- las columnas de plata y deja pasar el resto del ABM.
--
-- ⚠ SIN ESCAPE HATCH, y esa es la diferencia con los otros dos candados de
-- cobranza. El de precio y el de override tienen un GUC porque existe una
-- puerta oficial (`fijar_precio_plan`, `fijar_override_plan`) que TIENE que
-- poder escribir. Acá no hay ninguna función autorizada a borrar evidencia
-- —eso es, literalmente, lo que significa append-only— y el que vació la
-- tabla fue un script de limpieza de pruebas, o sea exactamente quien
-- prendería el GUC. El molde es `patente_inmutable`, que tampoco lo tiene.
--
-- ⚠ LO QUE ESTE CANDADO NO HACE, dicho para no prometer de más:
--   · No vuelve ruidoso el caso de un owner logueado. Hoy un `delete` suyo
--     devuelve éxito con cero filas porque el RLS no matchea ninguna (la
--     única policy de la tabla es de select). Con el trigger sigue igual:
--     el RLS filtra primero y el trigger por fila nunca se despierta. No
--     hay error que ver ahí, y no hace falta que lo haya.
--   · No frena un `alter table ... disable trigger` del dueño de la tabla.
--     Postgres no tiene defensa contra eso. El candado es contra el
--     DESCUIDO —un delete sin where en un script de limpieza—, no contra
--     una mano decidida. Mismo límite que `patente_inmutable`.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @candado_borrado`, `-- @candado_edicion` y
-- `-- @candado_purga` NO SE REFORMATEAN NUNCA, ni los marcadores
-- `-- >>> nombre` / `-- <<< nombre`: `scripts/regresion-cobranza-deudas.sh`
-- los muerde con `sed` y `awk`, y si cambian de forma el script lo dice con
-- «EL SED NO MORDIÓ» en vez de dejar pasar un falso verde.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · El borrado
-- ════════════════════════════════════════════════════════════════════

-- >>> bloquear_borrado_de_evidencia
create or replace function bloquear_borrado_de_evidencia()
returns trigger
language plpgsql
as $$
begin
  raise exception 'evidencia_no_se_borra'                              -- @candado_borrado
    using hint = 'cresium_eventos es append-only: es la respuesta del día que un cliente diga «yo transferí». '
                 'Borrar una fila no libera el externalId en Cresium (es único allá PARA SIEMPRE, también '
                 'después de PAID o EXPIRED), así que el borrado no sirve ni siquiera para volver a probar: '
                 'lo único que hace es dejarnos sin evidencia. Si un evento se resolvió mal, corregí su '
                 'motivo con cresium_reprocesar_evento().';
  return old;
end;
$$;
-- <<< bloquear_borrado_de_evidencia

create trigger candado_borrado_evidencia
  before delete on cresium_eventos
  for each row execute function bloquear_borrado_de_evidencia();


-- ════════════════════════════════════════════════════════════════════
-- 2 · La edición
-- ════════════════════════════════════════════════════════════════════

-- >>> bloquear_edicion_de_evidencia
create or replace function bloquear_edicion_de_evidencia()
returns trigger
language plpgsql
as $$
begin
  -- Las seis columnas que SON la evidencia. `procesado_at` y `motivo`
  -- quedan afuera a propósito: son el dictamen, no el hecho, y son lo
  -- único que el webhook actualiza.
  if new.payload        is distinct from old.payload                   -- @candado_edicion
     or new.transaccion_id is distinct from old.transaccion_id
     or new.tipo           is distinct from old.tipo
     or new.external_id    is distinct from old.external_id
     or new.intento        is distinct from old.intento
     or new.recibido_at    is distinct from old.recibido_at
  then
    raise exception 'evidencia_no_se_edita'
      using hint = 'El payload crudo de una entrega de Cresium y su identidad (transacción, referencia, '
                   'intento, hora) no se corrigen: son lo que nos mandaron, y una fila editada sigue '
                   'pareciendo evidencia sin serlo. Lo que sí se puede volver a escribir es el dictamen '
                   '(procesado_at, motivo), y para eso está cresium_reprocesar_evento().';
  end if;

  return new;
end;
$$;
-- <<< bloquear_edicion_de_evidencia

create trigger candado_edicion_evidencia
  before update on cresium_eventos
  for each row execute function bloquear_edicion_de_evidencia();


-- ════════════════════════════════════════════════════════════════════
-- 3 · La purga
-- ════════════════════════════════════════════════════════════════════

-- >>> bloquear_purga_de_evidencia
create or replace function bloquear_purga_de_evidencia()
returns trigger
language plpgsql
as $$
begin
  raise exception 'evidencia_no_se_vacia'                              -- @candado_purga
    using hint = 'Un truncate sobre cresium_eventos es el borrado de la primera semana otra vez, pero '
                 'entero y en una línea. Si necesitás una base limpia para probar, usá supabase db reset: '
                 'es la única forma legítima de que esta tabla quede vacía.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_evidencia

create trigger candado_purga_evidencia
  before truncate on cresium_eventos
  for each statement execute function bloquear_purga_de_evidencia();


-- ════════════════════════════════════════════════════════════════════
-- 4 · Que no tengan una perilla de apagado al lado
-- ════════════════════════════════════════════════════════════════════
--
-- Un trigger `ORIGIN` (el default) se apaga entero con
-- `set session_replication_role = replica`, que en esta base `postgres`
-- puede ejecutar. `enable always` los deja corriendo también ahí.
--
-- Es la primera vez que el repo usa `always` y vale decir por qué no
-- molesta: los tres candados miran DELETE, UPDATE y TRUNCATE, y un restore
-- lógico de esta tabla entra por INSERT, que ninguno de los tres toca.

alter table cresium_eventos enable always trigger candado_borrado_evidencia;
alter table cresium_eventos enable always trigger candado_edicion_evidencia;
alter table cresium_eventos enable always trigger candado_purga_evidencia;


-- ════════════════════════════════════════════════════════════════════
-- 5 · El grant que nadie había mirado
-- ════════════════════════════════════════════════════════════════════
--
-- `authenticated` tiene TRUNCATE sobre esta tabla. No es un descuido de la
-- migración que la creó: es el default ACL del schema, y el repo ya declaró
-- ese agujero un agujero en 20260724193320 —«anon no podía leerla pero SÍ
-- pudo ejecutarle un TRUNCATE»— y lo cerró SOLO para anon.
--
-- Hoy no es alcanzable desde el request path (PostgREST no expone
-- truncate) y el candado de arriba lo tapa igual, venga de donde venga.
-- El revoke va como segunda capa, que es como se escriben las dos
-- defensas en este repo: el candado explica, el permiso ni deja intentar.

revoke truncate, references, trigger on table cresium_eventos from authenticated;


comment on table cresium_eventos is
  'El payload CRUDO de cada entrega de webhook de Cresium, inmutable y append-only DE VERDAD desde 20260917110000: tres candados (borrado, edición de las columnas de evidencia, truncate). Es la evidencia: el día que un cliente diga "yo transferí", esto es la respuesta. `pagos` se deriva de acá. Una fila por ENTREGA — los cinco reintentos dejan cinco filas. Lo único que se vuelve a escribir es el dictamen: procesado_at y motivo.';
