#!/bin/bash
# La rotura a mano de R28, R29 y R30 (regla 13): cada afirmación se corre con
# SU rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R28 · El trigger que deja de anular la patente (vuelve la captura de
#          leads por la puerta directa); el CHECK borrado —que no rompe nada
#          visible hasta que alguien apague el trigger, por eso R28b lo
#          mira en el catálogo—; y el trigger borrado del todo, que es peor
#          que la captura: el CHECK rechaza el insert y get_carton ENTERO
#          deja de responder a las patentes que no existen.
#   R29 · El trigger de cancelada_at que no escribe, y el que no limpia al
#          reactivar; la purga que borra en simulación (la forma más cara
#          del bug: "solo cuenta" y borró); la purga sin evidencia; la purga
#          que se lleva `pagos`; el plazo corrido a 11 meses; la purga que
#          no exime al demo; el guard que deja pasar a un owner; y el reloj
#          programado EN REAL antes de tiempo.
#   R30 · anonimizar_cliente() con el guard abierto (cualquier owner
#          anonimiza a cualquiera); sin la auditoría; con el sentinela del
#          teléfono con dígitos (WhatsApp lo tomaría por un número); y como
#          invoker (la función deja de servir hasta para el owner).
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día
# (supabase db reset).
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M_BUSQ=supabase/migrations/20260922120000_busquedas_sin_patente.sql
M_SUPR=supabase/migrations/20260922130000_supresion_cliente.sql
M_PURGA=supabase/migrations/20260922140000_retencion_tras_cancelar.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

fallas=0

correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque · $4 = patrón esperado
  local salida
  salida=$( { echo "begin;"; echo "$2"; bloque "$3" "$V"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -q "$4"; then
    echo "  ✓ $1 — atrapado ($4)"
  else
    echo "  ✗ $1 — SE ESCAPÓ (esperaba $4)"
    echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
    fallas=1
  fi
}

# El guard del sed: si el patrón no muerde, la "rotura" es un no-op y el
# bloque pasa en verde. Un falso VERDE es peor que un falso rojo.
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = patrón
  local orig roto
  orig=$(bloque "$2" "$3")
  roto=$(printf '%s\n' "$orig" | sed "$4")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré el bloque «$2» en $3"; fallas=1; return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; return
  fi
  correr "$1" "$roto" "$5" "$6"
}

echo "── R28 · las consultas sin resultado no guardan la patente ──"
# Con el trigger apagado la SEGUNDA defensa —el CHECK— rechaza la fila, y
# el bloque se pone en rojo por esa vía: la patente no se guardó, pero
# get_carton explota con una patente que no existe. Por eso el patrón
# esperado es el del CHECK y no "R28".
correr_marcada "el trigger que deja de anular la patente (el CHECK lo frena)" landing_busquedas_sin_patente "$M_BUSQ" \
  "/@sin_patente/s/new.patente := null;/new.patente := new.patente;/" R28 "busqueda_sin_resultado_sin_patente"
# El CHECK borrado no rompe nada visible mientras el trigger esté: por eso
# R28b lo mira en el catálogo y no en la conducta.
correr "el CHECK borrado del catálogo" \
  "alter table landing_busquedas drop constraint busqueda_sin_resultado_sin_patente;" R28 "R28b"
# Y el trigger borrado: el CHECK rechaza el insert de get_carton y la
# vidriera deja de responder a las patentes que no existen.
correr "el trigger borrado (get_carton explota con una patente que no existe)" \
  "drop trigger landing_busquedas_sin_patente on landing_busquedas;" R28 "R28b"

echo "── R29 · la retención y la purga ──"
correr_marcada "cancelada_at que no se escribe" suscripciones_marcar_cancelacion "$M_PURGA" \
  "/@cancelada_at/s/new.cancelada_at := now();/new.cancelada_at := null;/" R29 "R29a"
correr_marcada "cancelada_at que no se limpia al reactivar" suscripciones_marcar_cancelacion "$M_PURGA" \
  "/@reactivada/s/new.cancelada_at := null;/null;/" R29 "R29a"
# La forma más cara del bug: "solo cuenta" y borró.
correr_marcada "la purga que borra en simulación" purgar_tenants_vencidos "$M_PURGA" \
  "/@simular/s/if not p_simular then/if true then/" R29 "R29b"
# La simulación que no escribe en purgas: el insert pasa a un select con
# `where not p_simular` y la fila de la simulación nunca existe. Santiago
# no tendría qué revisar antes de pasar el reloj a real.
correr_marcada "la purga que no deja evidencia (simulación sin fila en purgas)" purgar_tenants_vencidos "$M_PURGA" \
  "s/    values (v_lub.id, p_simular, p_lubricentro_id is not null, v_motivo, v_uid, v_lub.cancelada_at, v_conteos)/    select v_lub.id, p_simular, p_lubricentro_id is not null, v_motivo, v_uid, v_lub.cancelada_at, v_conteos where not p_simular/" R29 "R29b"
correr_marcada "la purga que se lleva pagos" purgar_tenants_vencidos "$M_PURGA" \
  "s/      delete from landing_busquedas    where lubricentro_id = v_lub.id;/      delete from landing_busquedas    where lubricentro_id = v_lub.id; delete from pagos where lubricentro_id = v_lub.id;/" R29 "R29c"
# Las dos las atrapa la simulación de R29b (devuelve un tenant de más): el
# de 11 meses en la primera, el demo —cancelado hace 13 a propósito— en la
# segunda.
correr_marcada "el plazo corrido a 11 meses" purgar_tenants_vencidos "$M_PURGA" \
  "/@plazo/s/interval '12 months'/interval '10 months'/" R29 "R29b"
correr_marcada "la purga que no exime al demo" purgar_tenants_vencidos "$M_PURGA" \
  "/@demo/s/l.slug <> 'demo'/true/" R29 "R29b"
correr_marcada "el guard que deja pasar a un owner" purgar_tenants_vencidos "$M_PURGA" \
  "/@guard/s/if v_uid is not null and not soy_superadmin() then/if false then/" R29 "R29f"
# El reloj programado EN REAL antes de que Santiago haya visto una
# simulación: la primera vez que el cálculo se encuentra con tenants reales,
# borrando.
correr "el reloj programado en real" \
  "select cron.schedule('purgar-tenants-vencidos', '0 6 1 * *', \$\$select purgar_tenants_vencidos(false)\$\$);" R29 "R29f"

echo "── R30 · la supresión de un cliente final ──"
correr_marcada "el guard abierto (cualquier owner anonimiza a cualquiera)" anonimizar_cliente "$M_SUPR" \
  "/@guard/s/if not (soy_superadmin() or v_cliente.lubricentro_id = mi_lubricentro_id()) then/if false then/" R30 "R30a"
correr_marcada "sin la auditoría" anonimizar_cliente "$M_SUPR" \
  "/@auditoria/s/values (v_cliente.lubricentro_id, v_cliente.id, v_motivo, v_uid);/select v_cliente.lubricentro_id, v_cliente.id, v_motivo, v_uid where false;/" R30 "R30c"
correr_marcada "el sentinela del teléfono con dígitos" anonimizar_cliente "$M_SUPR" \
  "s/         telefono = '-',/         telefono = '0',/" R30 "R30"
correr_marcada "anonimizar_cliente como invoker" anonimizar_cliente "$M_SUPR" \
  "s/^security definer$//" R30 "R30"

exit $fallas
