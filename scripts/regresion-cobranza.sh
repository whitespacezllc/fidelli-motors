#!/bin/bash
# La rotura a mano de R20 (regla 13): cada mitad del bloque se corre con SU
# rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R20a · el código del módulo escrito distinto de la clave del override.
#          No hay FK posible entre una columna y un tipo de TypeScript:
#          con el typo, el monto sale sin el módulo y nadie se entera.
#   R20b · el plan "Fidelli Motors" de vuelta en el catálogo, y el
#          descuento semestral en 10 como lo deja el default de la
#          migración de planes. Las dos son la DRIFT que hacía que la
#          pantalla de pago ofreciera semestral en local y no en prod.
#   R20c · el candado desarmado: un UPDATE suelto vuelve a poder mover un
#          precio de lista sin dejar rastro. Es la mitad que hace que la
#          auditoría no se pueda saltear por descuido.
#   R20d · el mínimo del motivo sacado de fijar_precio_plan(), y el
#          registro que deja de escribirse. Sin motivo, la tabla existe
#          pero no contesta la pregunta para la que se creó.
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
M=supabase/migrations/20260916100000_catalogo_de_cobranza.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

# Una función de la migración, rota con un sed sobre su línea marcada.
#
# ⚠ EL PRIMER `sed` NO ES DECORATIVO. Las funciones de la migración están
# escritas con `create or replace`, pero si alguna se escribiera con
# `create function` a secas, el bloque volvería a mandarse contra una
# función que YA existe: Postgres responde «already exists», la
# transacción queda abortada, el bloque R20 ni llega a correr y el script
# imprime «SE ESCAPÓ» por una razón que no tiene nada que ver con la regla
# que quería probar. Es el modo de falla más caro que tiene este molde:
# manda a arreglar la verificación en vez de la rotura.
funcion_rota() {
  bloque "$1" "$M" | sed "s/^create function/create or replace function/" | sed "$2"
}

# Y el guard del sed: si el patrón no muerde, la "rotura" es un no-op y el
# bloque pasa en verde. Un falso VERDE es peor que un falso rojo.
sed_mordio() { # $1 = original · $2 = roto
  if [ "$1" = "$2" ]; then return 1; fi
  return 0
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

correr_funcion() { # $1 = nombre · $2 = función · $3 = sed · $4 = bloque · $5 = patrón
  local orig roto
  orig=$(bloque "$2" "$M")
  roto=$(funcion_rota "$2" "$3")
  if ! sed_mordio "$(echo "$orig" | sed 's/^create function/create or replace function/')" "$roto"; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó y el verde no significa nada."
    fallas=1
    return
  fi
  correr "$1" "$roto" "$4" "$5"
}

correr_funcion_mas() { # $1 = nombre · $2 = función · $3 = sed · $4 = SQL extra · $5 = bloque · $6 = patrón
  local orig roto
  orig=$(bloque "$2" "$M")
  roto=$(funcion_rota "$2" "$3")
  if ! sed_mordio "$(echo "$orig" | sed 's/^create function/create or replace function/')" "$roto"; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó y el verde no significa nada."
    fallas=1
    return
  fi
  correr "$1" "$4
$roto" "$5" "$6"
}

echo "── R20a · el código del módulo escrito distinto de la clave del override ──"
correr "codigo con typo" "update modulos set codigo = 'neumatico' where codigo = 'neumaticos';" R20 "R20a"
correr "el módulo sin precio real" "select set_config('fidelli.precio_de_catalogo','si',true); update modulos set precio_mensual = 0 where codigo = 'neumaticos';" R20 "R20a"

echo "── R20b · la drift de vuelta ──"
correr "Fidelli Motors otra vez en el catálogo" "update planes set activo = true where nombre = 'Fidelli Motors';" R20 "R20b"
correr "el semestral en su default de 10" "select set_config('fidelli.precio_de_catalogo','si',true); update planes set descuento_semestral_pct = 10;" R20 "R20b"
correr "el plan del demo al precio del seed" "select set_config('fidelli.precio_de_catalogo','si',true); update planes set precio_mensual = 45000, descuento_anual_pct = 15 where nombre = 'Fidelli Motors';" R20 "R20b"

echo "── R20c · el candado desarmado ──"
correr_funcion "el candado que deja pasar todo" candado "/@candado/s/if v_toca_plata/if false/" R20 "R20c"

echo "── R20d · el motivo que deja de ser obligatorio, y el rastro que no se escribe ──"
# ⚠ La rotura tiene que sacar LAS DOS defensas. El mínimo del motivo está
# en la función Y en el CHECK `motivo_con_sustancia` de la tabla: sacar
# solo una deja el invariante en pie —el sistema sigue seguro— y el bloque
# pasaría en verde con razón. Sacando las dos, si R20d no salta es una
# fuga de verdad.
correr_funcion_mas "sin mínimo de motivo, en la función Y en la tabla" fijar_precio_plan "/@motivo/s/< 10 then/< 0 then/" \
  "alter table cambios_precio_catalogo drop constraint motivo_con_sustancia;" R20 "R20d"
correr_funcion "el cambio que no deja rastro" fijar_precio_plan "/@registro/s/if v_antes is distinct from jsonb_build_object(/if false and v_antes is distinct from jsonb_build_object(/" R20 "R20d"

exit $fallas
