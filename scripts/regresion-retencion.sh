#!/bin/bash
# La prueba 6 del bloque 2A, repetible: verifica que la red de
# verificaciones.sql ATRAPE una vista_proximos_service rota, en sus dos
# modos de falla (filtro de tipo perdido / security_invoker perdido).
# Todo corre en transacciones con rollback: no deja rastro.
#
# Requiere el stack local levantado (supabase start).
# Sale con 0 si la red atrapó los dos casos; 1 si alguno se le escapó.
set -u
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
CHEQUEO=$(sed -n '/El filtro y el security_invoker de la vista/,/^end \$\$;/p' "$(dirname "$0")/../supabase/verificaciones.sql" | tail -n +2)
DEF=$($DB -qtA -c "select pg_get_viewdef('vista_proximos_service'::regclass)")

correr() { # $1 = definición de la vista a probar · $2 = patrón esperado
  local salida
  salida=$( { echo "begin;"; echo "create or replace view vista_proximos_service as";
              echo "${1%;}"; echo ";"; echo "$CHEQUEO"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -q "$2"; then echo "  ✓ atrapado: $2"; return 0
  else echo "  ✗ SE ESCAPÓ: $2"; echo "$salida" | tail -3; return 1; fi
}

fallas=0
echo "── vista sin el filtro de tipo ──"
correr "$(echo "$DEF" | sed "s/AND (s.tipo = 'service'::tipo_trabajo)//g")" "RETENCIÓN ROTA" || fallas=1
echo "── vista con filtro pero sin security_invoker ──"
correr "$DEF" "AISLAMIENTO ROTO" || fallas=1
exit $fallas
