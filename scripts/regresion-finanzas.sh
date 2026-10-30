#!/bin/bash
# La rotura a mano de R52 (regla 13): origen de los movimientos y fondos
# personales. Finanzas estrena su regresión acá. Cada rotura pone R52 en
# ROJO — una prueba que nunca se vio fallar no existe.
#
#   R52a · un egreso PERSONAL no ensucia el taller: el arqueo y los totales
#          del taller lo excluyen. Se rompe sacándole a resumen_caja el
#          filtro `fondos = 'taller'` (el arqueo, y el total de hoy).
#   R52b · los CHECK de categoría/fondos: un valor fuera de la lista no entra.
#   R52c · vista_movimientos_caja sigue siendo security_invoker (regla 4).
#
# Corre en transacciones con rollback: no deja rastro. Requiere el stack
# local levantado con el schema al día (supabase db reset). Otro stack:
# DB_CONTAINER=supabase_db_<proyecto>. Sale 0 si la red atrapó todo; 1 si no.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i ${DB_CONTAINER:-supabase_db_fidelli-motors} psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261031120000_finanzas_origen_fondos.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

fallas=0
total=0

correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque · $4 = texto esperado
  local salida
  total=$((total + 1))
  salida=$( { echo "begin;"; echo "$2"; bloque "$3" "$V"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -qF "$4"; then
    echo "  ✓ $1 — atrapado ($4)"
  else
    echo "  ✗ $1 — SE ESCAPÓ (esperaba «$4»)"
    echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
    fallas=1
  fi
}

correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = texto
  local orig roto
  orig=$(bloque "$2" "$3" | sed -e "s/^create function /create or replace function /")
  roto=$(printf '%s\n' "$orig" | sed "$4")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré el bloque «$2» en $3"; fallas=1; total=$((total + 1)); return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: el verde no significa nada."
    fallas=1; total=$((total + 1)); return
  fi
  correr "$1" "$roto" "$5" "$6"
}

echo "── R52a · el personal no ensucia el taller ──"
correr_marcada "el arqueo contando el egreso personal" resumen_caja "$M" \
  "/@arqueo-taller/s/ and e.fondos = 'taller'//" R52 "R52a"
correr_marcada "los egresos de hoy contando el personal" resumen_caja "$M" \
  "/@egr-hoy/s/ and fondos = 'taller'//" R52 "R52a"

echo "── R52b · los CHECK de categoría/fondos ──"
correr "el CHECK de fondos borrado" \
  "alter table egresos drop constraint egreso_fondos_valido;" R52 "R52b"
correr "el CHECK de categoría de egreso borrado" \
  "alter table egresos drop constraint egreso_categoria_valida;" R52 "R52b"

echo "── R52c · la vista security_invoker ──"
correr "la vista sin security_invoker" \
  "alter view vista_movimientos_caja set (security_invoker = off);" R52 "R52c"

echo ""
if [ "$fallas" -eq 0 ]; then
  echo "✓ R52: la red atrapó las $total roturas."
else
  echo "✗ R52: alguna rotura se escapó (de $total)."
fi
exit "$fallas"
