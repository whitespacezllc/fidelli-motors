#!/bin/bash
# La rotura a mano de R27 (regla 13): cada afirmación se corre con SU rotura
# —la regla exacta que dice cubrir— y tiene que ponerse en ROJO. Una prueba
# que nunca se vio fallar es una prueba que no existe.
#
#   R27a · `legal` sacado de slug_reservado(): un lubricentro podría
#          registrar ese slug y pisar la página.
#   R27c · aceptar_terminos() como INVOKER (el owner no tiene insert sobre la
#          tabla: la puerta se cierra para todos), y aceptar_terminos() que
#          registra la fila en OTRO tenant que el de la sesión — la forma en
#          que una aceptación deja de ser una aceptación.
#   R27d · El predicado que ignora la versión (subir VERSION_LEGAL no vuelve
#          a pedirle nada a nadie), y el predicado sin la exención del demo
#          (un prospecto se come el modal).
#   R27b · Los tres candados de la evidencia bajados a `notice` de a uno, y
#          los tres bajados de ALWAYS a ORIGIN — que no cambia ningún
#          comportamiento hasta que alguien escriba
#          `set session_replication_role = replica`.
#   R27e · El campo calculado de la sesión como DEFINER: con un composite
#          forjado (regla 18) devuelve las versiones del vecino.
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
M_SLUG=supabase/migrations/20260922100000_slugs_reservados_legal.sql
M=supabase/migrations/20260922110000_aceptaciones_terminos.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

# La función entera, para las que no tienen marcadores: del
# `create or replace function nombre(` a su `$$;`.
funcion() {
  awk -v f="$1" '
    $0 ~ ("^create or replace function " f "\\(") { p = 1 }
    p { print }
    p && /^\$\$;$/ { p = 0 }
  ' "$2"
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

echo "── R27a · los slugs ──"
orig=$(funcion slug_reservado "$M_SLUG")
roto=$(printf '%s\n' "$orig" | sed "s/'legal', 'condiciones'/'condiciones'/")
if [ "$orig" = "$roto" ]; then
  echo "  ✗ el slug legal sin reservar — EL SED NO MORDIÓ"; fallas=1
else
  correr "el slug legal sin reservar" "$roto" R27 "R27a"
fi

echo "── R27c · la única puerta ──"
correr_marcada "aceptar_terminos como invoker (la puerta se cierra para todos)" aceptar_terminos "$M" \
  "s/^security definer$//" R27 "permission denied"
# La fila que va a parar a OTRO tenant. La función sigue "funcionando" y la
# sesión sigue siendo la del owner: solo cambia en nombre de quién queda
# el contrato. Es la forma en que una aceptación deja de ser una aceptación.
correr_marcada "aceptar_terminos que registra la fila en otro tenant" aceptar_terminos "$M" \
  "/@aceptar/s/values (v_lub, v_uid, v_version)/values ((select id from lubricentros where slug = 'demo'), v_uid, v_version)/" R27 "R27c"

echo "── R27d · el predicado ──"
correr_marcada "el predicado que ignora la versión" acepto_terminos_vigentes "$M" \
  "/@version/s/and a.version = p_version/and true/" R27 "R27d"
correr_marcada "el predicado sin la exención del demo" acepto_terminos_vigentes "$M" \
  "/@exento_demo/s/l.slug = 'demo'/l.slug = 'nadie'/" R27 "R27d"

echo "── R27b · los candados de la evidencia ──"
# El candado que "avisa" en vez de rechazar: la forma realista, porque la
# tabla queda sin candado con el comentario intacto.
correr_marcada "el candado de borrado bajado a notice" bloquear_borrado_de_aceptacion "$M" \
  "/@candado_borrado/s/raise exception/raise notice/" R27 "R27b"
correr_marcada "el candado de edición bajado a notice" bloquear_edicion_de_aceptacion "$M" \
  "/@candado_edicion/s/raise exception/raise notice/" R27 "R27b"
correr_marcada "el candado de truncate bajado a notice" bloquear_purga_de_aceptacion "$M" \
  "/@candado_purga/s/raise exception/raise notice/" R27 "R27b"
# Los tres candados bajados de ALWAYS a ORIGIN. No cambia NINGÚN
# comportamiento hasta que alguien escriba `set session_replication_role =
# replica`; por eso R27b lo mira en pg_trigger.tgenabled y no en lo que la
# base hace.
correr "los tres candados bajados de ALWAYS a ORIGIN" \
  "alter table aceptaciones_terminos enable trigger candado_borrado_aceptacion;
   alter table aceptaciones_terminos enable trigger candado_edicion_aceptacion;
   alter table aceptaciones_terminos enable trigger candado_purga_aceptacion;" \
  R27 "R27b"

echo "── R27e · el campo calculado de la sesión ──"
# Como definer, la subconsulta corre con los permisos de postgres y el RLS
# no recorta: el composite forjado con el uuid del vecino devuelve SUS
# versiones. Es exactamente lo que se verificó explotable en vivo sobre
# plan_capacidades (regla 18).
correr_marcada "el campo calculado como definer" aceptaciones_legales "$M" \
  "/@invoker/s/security invoker/security definer/" R27 "R27e"

exit $fallas
