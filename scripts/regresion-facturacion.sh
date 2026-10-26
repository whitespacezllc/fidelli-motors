#!/bin/bash
# La rotura a mano de R48 (regla 13): los cimientos de facturación (Nivel 3).
# Cada afirmación se corre con SU rotura —la regla exacta que dice cubrir— y
# tiene que ponerse en ROJO. Una prueba que nunca se vio fallar no existe.
#
#   R48a · el gating en dos capas: la policy de alta sin el gate del módulo
#          deja armar un comprobante a un tenant que no lo tiene.
#   R48b · la letra: tipo_comprobante_para() con RI→RI devolviendo B, y
#          monotributo dejando de dar C.
#   R48c · el desglose: el neto de un precio FINAL sin dividir por el IVA.
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el stack
# local levantado (supabase start) con el schema al día (supabase db reset).
# Otro stack: DB_CONTAINER=supabase_db_<proyecto>.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i ${DB_CONTAINER:-supabase_db_fidelli-motors} psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261023120000_facturacion_cimientos.sql

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

# Igual que en los otros scripts: la función se pasa a `create or replace`
# antes de comparar, para que el guard mida solo la rotura del sed.
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = texto
  local orig roto
  orig=$(bloque "$2" "$3" | sed -e "s/^create function /create or replace function /")
  roto=$(printf '%s\n' "$orig" | sed "$4")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré el bloque «$2» en $3"; fallas=1; total=$((total + 1)); return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; total=$((total + 1)); return
  fi
  correr "$1" "$roto" "$5" "$6"
}

echo "── R48a · el gating en dos capas ──"
# La policy de alta sin el gate del módulo: un tenant sin 'facturacion' mete
# un comprobante igual (la capa RLS deja de sostener sola). Alcanza con
# romper comprobantes_alta: comprobante_items_alta sigue gateada, así que
# armar() todavía corta por los renglones y el hueco lo acusa el INSERT
# directo de R48a (por eso el texto esperado es «R48a», no una frase).
correr "la policy de alta sin plan_permite('facturacion')" \
  "drop policy comprobantes_alta on comprobantes;
   create policy comprobantes_alta on comprobantes for insert to authenticated
     with check (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));" \
  R48 "R48a"

echo "── R48b · la letra del comprobante ──"
correr_marcada "RI→RI devolviendo Factura B" tipo_comprobante_para "$M" \
  "/@tipo-a/s/'factura_a'/'factura_b'/" R48 "R48b"
correr_marcada "monotributo dejando de dar Factura C" tipo_comprobante_para "$M" \
  "/@tipo-c/s/'factura_c'/null/" R48 "R48b"

echo "── R48c · el desglose de IVA ──"
# El neto de un precio FINAL sin dividir por (1 + alícuota): queda igual al
# precio, así que el neto gravado y el total se van de 1000/1210 a 1210/…
correr_marcada "el neto de un precio final sin descontar el IVA" armar_comprobante_desde_presupuesto "$M" \
  "/@neto-desde-final/s#round(r.precio_unitario / (1 + v_alic / 100), 2)#r.precio_unitario#" \
  R48 "desglose FINAL"

echo ""
if [ "$fallas" -eq 0 ]; then
  echo "✓ R48: la red atrapó las $total roturas."
else
  echo "✗ R48: alguna rotura se escapó (de $total)."
fi
exit "$fallas"
