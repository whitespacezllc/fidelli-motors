#!/bin/bash
# La rotura a mano de R21 (regla 13): cada bloque se corre con SU rotura
# —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R21a · el borde de la gracia corrido un día, y la ventana en cero.
#          Un `>=` donde va un `>` suspende a todo el mundo 24 horas antes.
#   R21b · la exención del 100% bajada al 50 (le perdona la deuda a los
#          founding), y la rama del interruptor manual movida después de
#          la del reloj (apagar un tenant a mano deja de tener efecto).
#   R21c · EL SEGUNDO INTERRUPTOR IGNORADO: el reloj suspende aunque
#          `suspension_automatica` esté en false. Es la rotura más cara
#          del sprint — es exactamente lo que el primer ciclo no puede
#          hacer.
#   R21d · el candado del demo desarmado: el tenant de las demos
#          comerciales puede entrar al reloj.
#   R21e · el payload como `security definer` y el tenant saliendo del
#          ARGUMENTO. Es la vulnerabilidad que se verificó explotable en
#          vivo durante el diseño: un owner leyendo el vencimiento, el
#          descuento negociado y el precio del vecino.
#   R21f · el módulo cobrado siempre que esté prendido, sin mirar si el
#          motivo dice `pago` o `bonificado`. Hoy eso le factura $25.000
#          de más a los dos únicos que lo tienen.
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
M=supabase/migrations/20260916140000_reloj_cobranza.sql
# ⚠ DOS ARCHIVOS, Y NO ES OPCIONAL. `estado_cobranza` y `reloj_cobranza` se
# redefinieron en 20260917140000 (la rama del que nunca pagó y el sexto
# argumento). Extrayéndolas del archivo VIEJO, el `create or replace`
# reinstala la versión de cinco argumentos, queda una SOBRECARGA y todas las
# llamadas contestan «function estado_cobranza(...) is not unique»: el script
# imprime «SE ESCAPÓ» por una razón que no tiene nada que ver con la regla, y
# el guard del sed no lo ve porque el sed sí muerde. Se vio en rojo.
M_NUEVO=supabase/migrations/20260917140000_alta_prende_el_reloj.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

# ⚠ EL PRIMER `sed` NO ES DECORATIVO. Normaliza a `create or replace`: sin
# él, un bloque escrito como `create function` se manda contra una función
# que YA existe, Postgres responde «already exists», la transacción queda
# abortada, el bloque R21 ni llega a correr y el script imprime «SE ESCAPÓ»
# por una razón que no tiene nada que ver con la regla que quería probar.
# Es el modo de falla más caro de este molde: manda a arreglar la
# verificación en vez del bug.
funcion_rota() { # $1 = función · $2 = sed · $3 = migración
  bloque "$1" "$3" | sed "s/^create function/create or replace function/" | sed "$2"
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

correr_funcion() { # $1 = nombre · $2 = función · $3 = sed · $4 = bloque · $5 = patrón · $6 = migración (opcional)
  local orig roto archivo
  archivo="${6:-$M}"
  orig=$(bloque "$2" "$archivo" | sed "s/^create function/create or replace function/")
  roto=$(funcion_rota "$2" "$3" "$archivo")
  # El guard del sed: si el patrón no muerde, la "rotura" es un no-op y el
  # bloque pasa en verde. Un falso VERDE es peor que un falso rojo.
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1
    return
  fi
  correr "$1" "$roto" "$4" "$5"
}

echo "── R21a · los bordes del reloj ──"
correr_funcion "el borde corrido un día (>= en vez de >)" estado_cobranza \
  "/@borde/s/current_date > p_vencimiento + dias_de_gracia()/current_date >= p_vencimiento + dias_de_gracia()/" R21a "R21a" "$M_NUEVO"
correr_funcion "la ventana de gracia en cero" dias_de_gracia \
  "/@gracia_n/s/select 7/select 0/" R21a "R21a"
correr_funcion "el contador sin el +1 (dice 0 el último día útil)" dias_de_gracia_restantes \
  "/@dias/s/current_date + 1/current_date/" R21a "R21a"

echo "── R21b · las exenciones y quién le gana a quién ──"
correr_funcion "la exención bajada al 50 (perdona a los founding)" estado_cobranza \
  "/@exento/s/>= 100/>= 50/" R21b "R21b" "$M_NUEVO"
correr_funcion "el interruptor manual que deja de ganar" estado_cobranza \
  "/@activo/s/when not p_activo/when not p_activo and false/" R21b "R21b" "$M_NUEVO"
correr_funcion "el reloj corriendo para los que están afuera" estado_cobranza \
  "/@desde/s/p_desde is null or //" R21b "R21b" "$M_NUEVO"

echo "── R21c · el segundo interruptor ignorado ──"
correr_funcion "suspende aunque suspension_automatica esté apagada" estado_cobranza \
  "/@corta/s/case when p_suspension then 'suspendido' else 'gracia' end/'suspendido'/" R21c "R21c" "$M_NUEVO"

echo "── R21d · el candado del demo ──"
correr "el demo puede entrar al reloj" \
  "create or replace function bloquear_demo_en_el_reloj() returns trigger language plpgsql as \$f\$ begin return new; end \$f\$;" \
  R21d "R21d"

echo "── R21e · la lectura cruzada de tenants ──"
correr_funcion "el payload como security definer" reloj_cobranza \
  "/@modo/s/^stable/stable security definer/" R21e "R21e" "$M_NUEVO"

echo "── R21f · el módulo cobrado sin mirar el motivo ──"
correr_funcion "se le cobra al bonificado" modulo_es_pago \
  "s/c.motivo ~ ('\^Módulo ' || '\[\^·\]+ · pago · ')/true/" R21f "R21f"

exit $fallas
