#!/bin/bash
# La rotura a mano de R35 (regla 13): el plazo de edición por tipo. Cada
# afirmación se corre con SU rotura —la regla exacta que dice cubrir— y
# tiene que ponerse en ROJO. Una prueba que nunca se vio fallar es una
# prueba que no existe.
#
#   R35a · plazo_edicion(): la mecánica de vuelta a 24 horas (la rotura
#          más probable: alguien "unifica"); el service y los neumáticos a
#          7 días (la pasada de rosca, que no da ningún error: solo afloja
#          el cartón del dueño del auto); y un tipo que se cae del case —
#          sin else devuelve null y sus trabajos nacen fijados, por eso el
#          bloque recorre el enum entero.
#   R35b · services_edicion con el literal de 24 horas en vez de la
#   R35c   función, e items_escritura ídem: la función dice 7 días y la
#          base fija a las 24. Es la forma en que el panel y la base se
#          contradicen sin ruido.
#   R35d · get_carton con el sello 'fijado' midiendo 24 horas: el panel
#          dice "editable 6 días" y la página del cliente ya muestra el
#          candado.
#   R35e · desbloquear_service() que "acompaña" el plazo y abre 7 días.
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
M=supabase/migrations/20260925110000_edicion_mecanica_7_dias.sql

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

echo "── R35 · el plazo de edición por tipo ──"
correr_marcada "la mecánica de vuelta a 24 horas" plazo_edicion "$M" \
  "/@plazo-mecanica/s/interval '7 days'/interval '24 hours'/" R35 "R35a"
correr_marcada "el service a 7 días (la pasada de rosca)" plazo_edicion "$M" \
  "/@plazo-service/s/interval '24 hours'/interval '7 days'/" R35 "R35a"
correr_marcada "los neumáticos a 7 días (el plazo que se contagia)" plazo_edicion "$M" \
  "/@plazo-neumaticos/s/interval '24 hours'/interval '7 days'/" R35 "R35a"
# Sin else, el tipo que se cae del case devuelve null: sus trabajos nacen
# fijados y nadie se entera. R35a recorre el enum entero por esto.
correr_marcada "un tipo afuera del case (neumáticos sin plazo)" plazo_edicion "$M" \
  "/@plazo-neumaticos/d" R35 "R35a"
# La función dice 7 días y la policy sigue con el literal: el panel pinta
# "editable" y el guardado falla limpio. Es la rotura de un refactor.
correr_marcada "services_edicion con el literal de 24 horas" services_edicion "$M" \
  "/@policy-services/s/plazo_edicion(tipo)/interval '24 hours'/" R35 "R35b"
correr_marcada "items_escritura con el literal de 24 horas" items_escritura "$M" \
  "/@policy-items/s/plazo_edicion(s.tipo)/interval '24 hours'/" R35 "R35c"
correr_marcada "get_carton con el sello a 24 horas" get_carton "$M" \
  "/@fijado/s/plazo_edicion(s.tipo)/interval '24 hours'/" R35 "R35d"
# La ventana de desbloqueo que "acompaña" el plazo: es la salida
# extraordinaria, no el plazo, y son 24 horas fijas para cualquier tipo.
correr "desbloquear_service abriendo 7 días" \
  "create or replace function desbloquear_service(p_service_id uuid) returns timestamptz language plpgsql volatile set search_path = public as \$f\$ declare v_hasta timestamptz; begin if not soy_superadmin() then raise exception 'Solo el equipo Fidelli puede desbloquear un service' using errcode = '42501'; end if; update services set desbloqueado_hasta = now() + interval '7 days', desbloqueado_por = auth.uid() where id = p_service_id and not anulado returning desbloqueado_hasta into v_hasta; if not found then raise exception 'service_no_desbloqueable'; end if; return v_hasta; end \$f\$;" R35 "R35e"

exit $fallas
