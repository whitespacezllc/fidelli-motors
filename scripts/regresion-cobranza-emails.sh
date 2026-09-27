#!/bin/bash
# La rotura a mano de R37 (regla 13): cada afirmación se corre con SU
# rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R37a · el suspendido a mano, el de afuera del reloj y el exento
#          recibiendo emails: cada filtro sacado por separado, porque
#          cualquiera puede caerse solo y los otros dos siguen tapando.
#   R37b · los umbrales: el 2 con `< 0` en vez de `<= 0` (el día 0 pasa a
#          ser el 1, «vence el DD/MM» el día que vence); el 1 con `<` en vez
#          de `<=` (el borde de los 7 días no entra); el 3 decidido por
#          nada (el suspendido recibe el 2); el alta con email intermedio y
#          el alta con el 1 pasado el plazo («tenés hasta mañana» a alguien
#          cuyo plazo pasó ayer).
#   R37c · «nunca dos veces» sacado: el email ya mandado vuelve a aparecer.
#   R37f · los tres candados bajados a `notice` de a uno, los tres bajados
#          de ALWAYS a ORIGIN, y el unique borrado.
#   R37g · la decisión grantada a authenticated.
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
M=supabase/migrations/20260926230000_emails_cobranza.sql

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
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = patrón
  local orig roto
  orig=$(bloque "$2" "$3" | sed "s/^create function/create or replace function/")
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

echo "── R37a · quién no recibe nada ──"
correr_marcada "el suspendido a mano recibe emails" avisos_pendientes "$M" \
  "/@manual/s/where l.activo/where true/" R37 "R37a"
# Son DOS condiciones sobre cobranza_desde (`is not null` y `<= current_date`),
# y un null no pasa ninguna de las dos: sacar una sola no rompe nada. Se
# sacan las dos, que es la única rotura que existe.
correr_marcada "el de afuera del reloj recibe emails" avisos_pendientes "$M" \
  "/@sin_reloj/s/and l.cobranza_desde is not null/and true/; s/and l.cobranza_desde <= current_date/and true/" R37 "R37a"
correr_marcada "el exento recibe emails" avisos_pendientes "$M" \
  "/@exento/s/where not d.exento/where true/" R37 "R37a"

echo "── R37b · los umbrales y la voz ──"
correr_marcada "el 2 con < 0 (el día 0 recibe el 1)" avisos_pendientes "$M" \
  "/@vencido/s/c.dias <= 0/c.dias < 0/" R37 "R37b"
correr_marcada "el 1 con < 7 (el borde no entra)" avisos_pendientes "$M" \
  "/@por_vencer/s/c.dias <= dias_de_aviso()/c.dias < dias_de_aviso()/" R37 "R37b"
correr_marcada "el 3 decidido por nada (el suspendido recibe el 2)" avisos_pendientes "$M" \
  "/@suspendido/s/c.estado = 'suspendido'/false/" R37 "R37b"
correr_marcada "el alta con email intermedio" avisos_pendientes "$M" \
  "/@alta_sin_intermedio/s/and c.voz <> 'alta'/and true/" R37 "R37b"
correr_marcada "el alta con el 1 pasado el plazo" avisos_pendientes "$M" \
  "/@alta_en_plazo/s/and (c.voz <> 'alta' or c.dias >= 0)/and true/" R37 "R37b"

echo "── R37c · nunca dos veces ──"
correr_marcada "el ya mandado vuelve a aparecer" avisos_pendientes "$M" \
  "/@enviado/s/and not exists (/and true or exists (/" R37 "R37c"

echo "── R37f · la evidencia ──"
correr_marcada "el candado de borrado bajado a notice" bloquear_borrado_de_email "$M" \
  "/@candado_borrado_email/s/raise exception/raise notice/" R37 "R37f"
correr_marcada "el candado de edición bajado a notice" bloquear_edicion_de_email "$M" \
  "s/raise exception 'email_no_se_edita'/raise notice 'email_no_se_edita'/" R37 "R37f"
correr_marcada "el candado de purga bajado a notice" bloquear_purga_de_email "$M" \
  "/@candado_purga_email/s/raise exception/raise notice/" R37 "R37f"
correr "los tres candados bajados de ALWAYS a ORIGIN" \
  "alter table emails_cobranza enable trigger candado_borrado_email; alter table emails_cobranza enable trigger candado_edicion_email; alter table emails_cobranza enable trigger candado_purga_email;" \
  R37 "R37f"
correr "el unique borrado" \
  "alter table emails_cobranza drop constraint emails_cobranza_lubricentro_id_tipo_vencimiento_key;" \
  R37 "R37f"

echo "── R37g · la decisión abierta a los owners ──"
correr "avisos_pendientes() grantada a authenticated" \
  "grant execute on function avisos_pendientes() to authenticated;" \
  R37 "R37g"

exit $fallas
