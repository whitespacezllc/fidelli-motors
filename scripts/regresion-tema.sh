#!/bin/bash
# La rotura a mano de R50 (regla 13): el modo oscuro del panel como
# preferencia de la persona (20261030100000). Cada afirmación se corre con
# SU rotura y tiene que ponerse en ROJO.
#
#   R50a · la función como INVOKER (usuarios no tiene policy de update: el
#          interruptor dejaría de guardar); y el grant a anon.
#   R50b · la validación del tema sacada (el CHECK de la tabla la frena
#          igual, con otro error que el front no traduce: el bloque lo
#          acusa por eso); y la guarda de auth.uid() sacada (le cambia el
#          tema a TODOS los usuarios).
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261030100000_tema_del_panel.sql

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
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = patrón · $7 = SQL extra
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
  correr "$1" "${7:-}
$roto" "$5" "$6"
}

echo "── R50 · el modo oscuro del panel ──"
correr_marcada "fijar_mi_tema como security invoker" fijar_mi_tema "$M" \
  "/@tema-definer/s/security definer/security invoker/" R50 "R50a fijar_mi_tema no es SECURITY DEFINER"
correr "fijar_mi_tema grantada a anon" \
  "grant execute on function fijar_mi_tema(text) to anon;" R50 "R50a anon ejecuta"
# La validación de la función sacada: «azul» lo frena igual el CHECK de
# la tabla, pero con OTRO error, que el front no traduce; el bloque lo
# acusa por eso (el CHECK borrado, solo, lo ve R50a en el catálogo).
correr_marcada "la validación del tema sacada (el CHECK la frena con otro error)" fijar_mi_tema "$M" \
  "/@tema-valido/s/if p_tema is null or p_tema not in ('claro', 'oscuro') then/if false then/" R50 "R50b «azul» se rechazó con otro error"
correr_marcada "la guarda de auth.uid() sacada (le cambia el tema a todos)" fijar_mi_tema "$M" \
  "/@tema-propio/s/where id = auth.uid();/where true;/" R50 "R50b fijar_mi_tema tocó la fila de OTRO usuario"

exit $fallas
