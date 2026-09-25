#!/bin/bash
# La rotura a mano de R17 y R18 (regla 13): cada bloque se corre con SU
# rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R17a · un valor agregado AL FINAL del enum (sin AFTER): el orden del
#          cartón se rompe y el build no se entera.
#   R17b · un CHECK en service_items con la lista de los once renglones
#          de siempre: la forma más probable de "alguien enumeró los
#          valores de item_tipo" y de dejar afuera los diez de camión.
#   R18  · vehiculos.clase con default 'liviano' ("para simplificar"): los
#          camiones que SA ya tiene cargados quedan afirmados como autos;
#          crear_cliente_con_vehiculo que ignora p_clase; y get_carton que
#          deja de emitirla. Las dos funciones rotas salen de la MISMA
#          migración, con sed sobre las líneas marcadas `-- @clase`.
#   R19  · un trigger "útil" que rellena la clase al editar: la edición sin
#          contestarla deja de dejarla en null. Una sugerencia no es una
#          respuesta, tampoco en la base.
#
# Todo corre en transacciones con rollback: no deja rastro. ADD VALUE
# entra en una transacción desde Postgres 12; lo que no se puede es USAR
# el valor antes del commit, y R17a solo lee pg_enum. Requiere el stack
# local levantado (supabase start) con el schema al día (supabase db reset).
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20260915130000_clase_vehiculo.sql
# get_carton se redefinió después (el plazo de edición por tipo): la
# versión vigente vive acá y es la que hay que romper.
M_CARTON=supabase/migrations/20260925110000_edicion_mecanica_7_dias.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

# Una función de la migración, rota con un sed sobre su línea `-- @clase`.
funcion_rota() {
  bloque "$1" "$M" | sed "s/^create function/create or replace function/" | sed "$2"
}
carton_roto() {
  bloque get_carton "$M_CARTON" | sed "$1"
}

fallas=0
correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque (R17x) · $4 = patrón esperado en el error
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

echo "── R17a · un valor nuevo al final del enum, sin AFTER ──"
correr "valor al final" "alter type item_tipo add value 'luces';" R17a "R17a"

echo "── R17b · un CHECK con la lista de los once ──"
correr "CHECK con los once" "alter table service_items add constraint r17_solo_once check (item_tipo is null or item_tipo in ('filtro_aceite','filtro_aire','filtro_combustible','filtro_habitaculo','aceite_caja','aceite_diferencial','aceite_hidraulico','liq_refrigerante','liq_frenos','aditivo_motor','aditivo_transmision'));" R17b "R17b\|invalid input value\|r17_solo_once"

echo "── R18 · la clase con default, el alta que la ignora, la puerta pública que la calla ──"
correr "default 'liviano'" "alter table vehiculos alter column clase set default 'liviano';" R18 "R18"
correr "alta que ignora p_clase" "$(funcion_rota crear_cliente_con_vehiculo "/@clase/s/p_clase)/null)/")" R18 "R18"
correr "get_carton sin la clase" "$(carton_roto "/@clase/s/v_vehiculo.clase/null/")" R18 "R18"

echo "── R19 · un trigger que rellena la clase al editar ──"
correr "trigger que inventa liviano" "create function r19_rellena() returns trigger language plpgsql as \$f\$ begin new.clase := coalesce(new.clase, 'liviano'); return new; end \$f\$; create trigger r19_rellena before update on vehiculos for each row execute function r19_rellena();" R19 "R19"

exit $fallas
