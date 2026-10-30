#!/bin/bash
# La rotura a mano de R51 (regla 13): el depósito al CVU dedicado se acredita
# por MONTO EXACTO o lo mira una persona. Cada afirmación se corre con SU
# rotura y tiene que ponerse en ROJO.
#
#   R51a · El CHECK dedicada_de_renovacion borrado; los candados del libro
#          bajados a ORIGIN.
#   R51b · La rama del CVU dedicado sacada (el depósito cae al motivo viejo:
#          «sin paymentOrder»); las otras órdenes vivas que no se cierran.
#   R51e · El monto con una tolerancia de $1.000 (lo que no es exacto
#          acredita: es inferir); la idempotencia del libro sacada (la frena
#          el unique, con OTRO error); la suma de `amounts` ignorada.
#   R51f · El semestral ofrecido siempre.
#   R51g · paymentOrder sin prioridad (un pago único entra por la rama
#          dedicada).
#   R51h · El resolver sin guarda; el que resuelve dos veces (lo frena el
#          unique de pagos, con OTRO error); descartar sin nota.
#   R51j · El candado de edición vaciado; el de borrado vaciado.
#
# Todo corre en transacciones con rollback. Requiere el stack local
# (supabase start) con el schema al día (supabase db reset).
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261031100000_cvu_dedicado.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }
# La función entera: del `create or replace function nombre(` a su `$$;`.
funcion() {
  awk -v f="$1" '
    $0 ~ ("^create or replace function " f "\\(") { p = 1 }
    p { print }
    p && /^\$\$;$/ { p = 0 }
  ' "$M"
}
# R51 necesita su helper, que vive fuera del bloque.
HELPER=$(awk '/^create or replace function r51_deposito/,/^\$\$;$/' "$V")

fallas=0
correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = patrón esperado
  local salida
  salida=$( { echo "begin;"; echo "$HELPER"; echo "$2"; bloque R51 "$V"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -q "$3"; then
    echo "  ✓ $1 — atrapado ($3)"
  else
    echo "  ✗ $1 — SE ESCAPÓ (esperaba $3)"
    echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
    fallas=1
  fi
}
correr_marcada() { # $1 = nombre · $2 = texto original (función o bloque) · $3 = sed · $4 = patrón
  local roto
  if [ -z "$2" ]; then echo "  ✗ $1 — no encontré la función en $M"; fallas=1; return; fi
  roto=$(printf '%s\n' "$2" | sed "$3")
  if [ "$2" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; return
  fi
  correr "$1" "$roto" "$4"
}

PUERTA=$(funcion acreditar_deposito_cresium)
DEDICADO=$(bloque acreditar_deposito_dedicado "$M")
RESOLVER=$(bloque resolver_deposito_cresium "$M")
MONTOS=$(bloque montos_ofrecidos "$M")

echo "── R51a · la forma ──"
correr "el CHECK dedicada_de_renovacion borrado" \
  "alter table cresium_ordenes drop constraint dedicada_de_renovacion;" "R51a EL CHECK dedicada_de_renovacion"
correr "los candados del libro bajados a ORIGIN" \
  "alter table depositos_cresium enable trigger candado_borrado_deposito;" "R51a LOS CANDADOS"

echo "── R51b · la rama ──"
correr_marcada "la rama del CVU dedicado sacada" "$PUERTA" \
  "/@rama_dedicado/s/if v_orden is null then/if false then/" "R51b EL MONTO EXACTO DEL MENSUAL NO ACREDITÓ"
correr_marcada "las otras órdenes vivas no se cierran" "$DEDICADO" \
  "s/     and estado in ('NOT_PAID', 'PARTIAL');/     and false;/" "R51b la orden interna del ANUAL"

echo "── R51e · el monto exacto ──"
# Con `<=` cualquier monto por encima del mensual lo acredita, pero el anual
# pasa a coincidir con dos períodos y R51d se pone en rojo antes; la rotura
# que aísla R51e es una TOLERANCIA (mil pesos de más también acreditan).
correr_marcada "el monto con una tolerancia de \$1.000 (acredita lo que no es exacto)" "$DEDICADO" \
  "/@monto_exacto/s/where m.total = round(p_monto, 2)/where abs(m.total - round(p_monto, 2)) <= 1000/" "R51e UN MONTO QUE NO ES"
# Sin la idempotencia del libro, el reintento inserta la misma transacción
# otra vez y lo frena el unique: el rojo llega por la segunda defensa.
correr_marcada "la idempotencia del libro sacada (la frena el unique)" "$DEDICADO" \
  "/@idem_dedicado/s/if exists (select 1 from depositos_cresium d where d.transaccion_id = p_tx) then/if false then/" "depositos_cresium_transaccion_id_key"
correr_marcada "la suma de amounts ignorada (solo totalAmount)" "$PUERTA" \
  "s/(select sum((a ->> 'amount')::numeric) from jsonb_array_elements(coalesce(v_t -> 'amounts', '\[\]'::jsonb)) a),/null,/" "R51e sin totalAmount"

echo "── R51f · el semestral ──"
correr_marcada "el semestral ofrecido siempre" "$MONTOS" \
  "/@semestral_ofrecido/s/where p.descuento_semestral_pct > 0/where true/" "R51f EL SEMESTRAL ACREDITÓ"

echo "── R51g · la prioridad de paymentOrder ──"
correr_marcada "un pago único entra por la rama dedicada" "$PUERTA" \
  "/@rama_dedicado/s/if v_orden is null then/if true then/" "R51g UN DEPOSIT CON paymentOrder"

echo "── R51h · resolver ──"
correr_marcada "el resolver sin guarda" "$RESOLVER" \
  "/@resolver_guard/s/if not soy_superadmin() then/if false then/" "R51h UN OWNER RESOLVIÓ"
# Sin mirar el estado, el segundo «acreditar» inserta otro pago con la misma
# transacción y lo frena el unique de pagos: la segunda defensa, con su error.
correr_marcada "un depósito resuelto se resuelve de nuevo (lo frena el unique de pagos)" "$RESOLVER" \
  "/@resolver_estado/s/if v_d.estado <> 'a_confirmar' then/if false then/" "pagos_cresium_transaccion_id_key"
correr_marcada "descartar sin nota" "$RESOLVER" \
  "/@resolver_nota/s/if v_nota is null then/if false then/" "R51h resolver(descartar"

echo "── R51j · los candados ──"
correr_marcada "el candado de edición vaciado" "$(funcion bloquear_edicion_de_deposito)" \
  "s/    raise exception 'deposito_no_se_edita'/    return new; raise exception 'deposito_no_se_edita'/" "R51j SE EDITÓ"
correr_marcada "el candado de borrado vaciado" "$(funcion bloquear_borrado_de_deposito)" \
  "s/  raise exception 'deposito_no_se_borra'/  return null; raise exception 'deposito_no_se_borra'/" "R51j SE BORRÓ"

exit $fallas
