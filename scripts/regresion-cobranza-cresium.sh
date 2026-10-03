#!/bin/bash
# La rotura a mano de R22e (regla 13): el parser del webhook "apretado" a
# exactamente dos partes. Con eso, la referencia del segundo intento
# (`sub:hasta:2`, ver lib/cresium/orden.ts) deja de encontrar la
# suscripción: la plata entra en Cresium y acá queda como «externalId no
# corresponde a ninguna suscripción», con el panel vencido. R22e tiene que
# ponerse en ROJO.
#
# La línea no lleva `-- @marca`: el sed muerde el texto literal del
# split_part. Si alguien la reescribe, el guard de abajo lo dice en vez de
# dar verde.
#
# ⚠ LA FUNCIÓN SE SACA DE SU ÚLTIMA DEFINICIÓN. Hasta el PR 2 de calcos este
# script la extraía de 20260917000000, que ya no era la vigente desde
# 20260917130000 (el primer pago define el ciclo): reinstalaba, adentro de
# su transacción, un cuerpo dos versiones viejo. Desde 20261003200000 la
# vigente es la que tiene la rama de calcos, y es la que hay que romper.
#
# Corre en una transacción con rollback: no deja rastro. Requiere el stack
# local levantado (supabase start) con el schema al día (supabase db reset).
#
# Sale con 0 si la red atrapó la rotura; 1 si se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261003200000_calcos_pago.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }
# La función entera: del `create or replace function nombre(` a su `$$;`.
funcion() {
  awk -v f="$1" '
    $0 ~ ("^create or replace function " f "\\(") { p = 1 }
    p { print }
    p && /^\$\$;$/ { p = 0 }
  ' "$M"
}

orig=$(funcion acreditar_deposito_cresium)
roto=$(printf '%s\n' "$orig" | sed "s/v_suscripcion := nullif(split_part(v_external, ':', 1), '')::uuid;/v_suscripcion := case when array_length(string_to_array(v_external, ':'), 1) = 2 then nullif(split_part(v_external, ':', 1), '')::uuid end;/")

if [ -z "$orig" ]; then
  echo "  ✗ no encontré acreditar_deposito_cresium en $M"; exit 1
fi
if [ "$orig" = "$roto" ]; then
  echo "  ✗ el sed no mordió: la línea del split_part cambió y la rotura sería un no-op"; exit 1
fi

salida=$( { echo "begin;"; printf '%s\n' "$roto"; bloque R22 "$V"; echo "rollback;"; } | $DB -f - 2>&1 )
if echo "$salida" | grep -q "R22e"; then
  echo "  ✓ R22e · parser apretado a dos partes — atrapado"
  exit 0
fi
echo "  ✗ R22e · parser apretado a dos partes — SE ESCAPÓ"
echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
exit 1
