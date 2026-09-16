#!/bin/bash
# La rotura a mano de R24 y del candado de R22 (regla 13): cada bloque se
# corre con SU rotura —la regla exacta que dice cubrir— y tiene que ponerse
# en ROJO. Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R24a · la exención del 100% corrida al 101 (no exime a nadie), y la
#          exención achicada a los dos estados de cobranza: un trial
#          bonificado vuelve a aparecer como "venta por cerrar" cuando su
#          precio ya es cero.
#   R24b · el listado llamando a estado_atencion() con un 0 en vez del
#          descuento del tenant. Es la forma más probable del bug: la
#          función se arregla y el llamador se olvida, y NADA falla al
#          aplicar la migración — el cuerpo de una función SQL no se valida.
#   R24c · lo mismo en la ficha. Si el listado y la ficha no comparten el
#          dato, dicen cosas distintas del mismo lubricentro.
#   R22f · los tres candados de `cresium_eventos` vaciados de a uno: el de
#          borrado, el de edición, y el de edición PASADO DE ROSCA —que
#          bloquea cualquier update y se come las seis escrituras del
#          webhook, que es la forma en que este candado rompería el cobro.
#   R22g · el candado de truncate borrado del catálogo, y el mismo candado
#          vaciado: son dos roturas distintas porque R22g se defiende en dos
#          pasos y sacando una sola el invariante queda en pie.
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
M_AT=supabase/migrations/20260917100000_atencion_con_descuento.sql
M_EV=supabase/migrations/20260917110000_candado_evidencia_cresium.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

# La función entera, para las que no tienen marcadores: del
# `create or replace function nombre(` a su `$$;`. Mismo molde que
# scripts/regresion-cobranza-cresium.sh.
funcion() {
  awk -v f="$1" '
    $0 ~ ("^create or replace function " f "\\(") { p = 1 }
    p { print }
    p && /^\$\$;$/ { p = 0 }
  ' "$2"
}

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

# El guard del sed, en los dos extractores: si el patrón no muerde, la
# "rotura" es un no-op y el bloque pasa en verde. Un falso VERDE es peor
# que un falso rojo.
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

correr_funcion() { # $1 = nombre · $2 = función · $3 = migración · $4 = sed · $5 = bloque · $6 = patrón
  local orig roto
  orig=$(funcion "$2" "$3")
  roto=$(printf '%s\n' "$orig" | sed "$4")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré $2 en $3"; fallas=1; return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; return
  fi
  correr "$1" "$roto" "$5" "$6"
}

echo "── R24a · la exención de la lista de atención ──"
correr_marcada "la exención corrida al 101 (no exime a nadie)" estado_atencion "$M_AT" \
  "/@exento_atencion/s/>= 100/>= 101/" R24 "R24a"
correr_marcada "la exención achicada a los estados de cobranza (el trial bonificado vuelve)" estado_atencion "$M_AT" \
  "/@exento_atencion/s/coalesce(p_descuento_pct, 0) >= 100/coalesce(p_descuento_pct, 0) >= 100 and p_estado <> 'trial'/" R24 "R24a"

echo "── R24b · el listado que se olvidó de pasar el descuento ──"
correr_funcion "listado_lubricentros llamando con 0" listado_lubricentros "$M_AT" \
  "s/estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0))/estado_atencion(v.estado, v.vencimiento, 0)/" R24 "R24b"

echo "── R24c · la ficha que dice otra cosa que el listado ──"
correr_funcion "atencion_tenant llamando con 0 (reclama de más)" atencion_tenant "$M_AT" \
  "s/estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0))/estado_atencion(v.estado, v.vencimiento, 0)/" R24 "R24c"
# La otra dirección, que es la silenciosa: la ficha deja de marcar a NADIE.
# No da error, no se ve vacía, simplemente nunca dice que haya que llamar.
correr_funcion "atencion_tenant que no marca a nadie nunca" atencion_tenant "$M_AT" \
  "s/estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0))/null::text/" R24 "R24c"

echo "── R22f · el candado de la evidencia ──"
# El candado que "avisa" en vez de rechazar. Es la forma realista de este
# bug: alguien baja el nivel para destrabar un script de limpieza y la
# tabla queda sin candado con el comentario intacto.
correr_marcada "el candado de borrado bajado a notice" bloquear_borrado_de_evidencia "$M_EV" \
  "/@candado_borrado/s/raise exception/raise notice/" R22 "R22f"
correr_marcada "el candado de edición vaciado" bloquear_edicion_de_evidencia "$M_EV" \
  "/@candado_edicion/s/new.payload        is distinct from old.payload/false/" R22 "R22f"
# La lista de columnas acortada. Es la rotura más probable de todas —una
# lista se acorta sola en un refactor— y la única que prueba que R22f mira
# las SEIS y no una muestra. Se saca external_id, que es la referencia cuyo
# quemado es toda la historia de la regla 20.
correr_marcada "la lista de columnas sin external_id" bloquear_edicion_de_evidencia "$M_EV" \
  "s/     or new.external_id    is distinct from old.external_id//" R22 "R22f"
# Dos comandos `d` y no una alternancia: el sed de macOS es BSD y su regex
# básico no tiene `\(a\|b\)`. Escrito así, el guard decía «EL SED NO MORDIÓ»
# —que es el comportamiento correcto— y la rotura no probaba nada.
correr_marcada "la lista de columnas sin intento ni recibido_at" bloquear_edicion_de_evidencia "$M_EV" \
  "/is distinct from old.intento/d; /is distinct from old.recibido_at/d" R22 "R22f"
# Las otras dos, que rompen el COBRO en vez de la evidencia — que es la
# forma en que este candado hace daño de verdad: la ruta devuelve 500,
# Cresium reintenta cinco veces y no se ve un error, se ve una pantalla que
# sigue diciendo "esperando tu transferencia" con la plata ya acreditada.
#
# El candado sin acotar por columna se lleva puestas las seis escrituras del
# webhook, así que revienta ADENTRO de acreditar_deposito_cresium y R22b
# muere antes de llegar al contra-chequeo de R22f. Por eso acá el patrón
# esperado es el nombre del error y no una letra: el rojo llega igual y
# llega antes, que es lo que importa.
correr_marcada "el candado de edición sin acotar (bloquea todo update)" bloquear_edicion_de_evidencia "$M_EV" \
  "/@candado_edicion/s/new.payload        is distinct from old.payload/true/" R22 "evidencia_no_se_edita"

# Y la formulación equivocada contra la que avisa la migración: «solo se
# permite si cambian procesado_at Y motivo». Deja pasar las cinco
# escrituras del webhook —que tocan las dos— y rompe la sexta,
# cresium_reprocesar_evento, que toca `motivo` sola. Es la rotura que
# llega hasta el contra-chequeo de R22f.
correr "el candado escrito como «solo si cambian procesado_at Y motivo»" \
  "create or replace function bloquear_edicion_de_evidencia() returns trigger language plpgsql as \$f\$ begin if not (new.procesado_at is distinct from old.procesado_at and new.motivo is distinct from old.motivo) then raise exception 'evidencia_no_se_edita'; end if; return new; end \$f\$;" \
  R22 "R22f"

echo "── R22g · el candado del truncate ──"
correr "el trigger de truncate borrado del catálogo" \
  "drop trigger candado_purga_evidencia on cresium_eventos;" R22 "R22g"
correr_marcada "el candado de truncate bajado a notice" bloquear_purga_de_evidencia "$M_EV" \
  "/@candado_purga/s/raise exception/raise notice/" R22 "R22g"
# Los tres candados bajados de ALWAYS a ORIGIN. No cambia NINGÚN
# comportamiento mientras nadie toque session_replication_role, así que sin
# el chequeo de catálogo de R22g esta rotura es invisible: el bloque entero
# y las otras once roturas siguen en verde. Es la razón por la que ese
# chequeo mira el catálogo y no el comportamiento.
correr "los tres candados bajados de ALWAYS a ORIGIN" \
  "alter table cresium_eventos enable trigger candado_borrado_evidencia;
   alter table cresium_eventos enable trigger candado_edicion_evidencia;
   alter table cresium_eventos enable trigger candado_purga_evidencia;" \
  R22 "R22g"

exit $fallas
