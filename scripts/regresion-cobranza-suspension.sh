#!/bin/bash
# La rotura a mano de R36 (regla 13): cada afirmación se corre con SU
# rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R36a · get_landing ofreciendo el premio con `l.activo` (la forma en que
#          estaba: la suspensión por reloj no escribe `activo`, así que un
#          suspendido a 20 días seguía prometiendo el premio); get_carton
#          con el progreso y con el mensaje al escanear, cada uno por
#          separado, porque son dos condiciones y cualquiera puede volver
#          sola; y LA VIDRIERA APAGADA para el suspendido por reloj (un
#          `and es_activo(l)` en el where), que es el arreglo equivocado
#          que la regla 8 prohíbe.
#   R36b · La pasada de rosca: el premio apagado también en gracia. Los
#          Términos prometen siete días con el servicio completo.
#   R36c · El trigger que no cierra nada, el que cierra TAMBIÉN la PAID
#          (se lleva la contabilidad), y el trigger borrado del todo.
#   R36d · `ciclo_tras_el_pago()` ignorando el `hasta` de la orden (el
#          pago tardío no compra nada) y, al revés, arrancando SIEMPRE
#          desde hoy (el que paga en plazo gana días).
#   R36e · `cerrar_dia()` sin la rama de la vuelta: el pago tardío no deja
#          `reactivacion_reloj`.
#
# La regla del `hasta` del lado de TypeScript la rompe
# `scripts/regresion-cresium-orden.mjs` (sección 6).
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
M=supabase/migrations/20260926200000_suspension_por_reloj.sql
# get_carton se redefinió después (el próximo de caja, 20261004120100): la
# versión vigente vive ahí y es la que hay que romper. Las dos condiciones
# de la suspensión por reloj viajaron intactas. (get_landing sigue en $M.)
M_CARTON=supabase/migrations/20261004120100_service_caja.sql
M_CICLO=supabase/migrations/20260917130000_primer_pago_define_el_ciclo.sql
M_SN=supabase/migrations/20260922204000_snapshots.sql

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

echo "── R36a · la vidriera del suspendido por reloj ──"
correr_marcada "get_landing con el premio decidido por l.activo (como estaba)" get_landing "$M" \
  "/@premio_reloj/s/es_activo(l)/l.activo/" R36 "R36a"
correr_marcada "get_carton con el progreso decidido por v_lubricentro.activo" get_carton "$M_CARTON" \
  "/@fidelizacion_reloj/s/es_activo(v_lubricentro)/v_lubricentro.activo/" R36 "R36a"
correr_marcada "get_carton con el mensaje al escanear decidido por v_lubricentro.activo" get_carton "$M_CARTON" \
  "/@mensaje_reloj/s/es_activo(v_lubricentro)/v_lubricentro.activo/" R36 "R36a"
# El arreglo EQUIVOCADO: apagar la vidriera entera del suspendido por reloj.
correr_marcada "get_landing apagando la vidriera del suspendido por reloj" get_landing "$M" \
  "s/^  where l.slug = p_slug;$/  where l.slug = p_slug and es_activo(l);/" R36 "R36a"

echo "── R36b · la pasada de rosca: el premio apagado en gracia ──"
correr_marcada "get_landing escondiendo el premio también en gracia" get_landing "$M" \
  "/@premio_reloj/s/es_activo(l)/es_activo(l) and coalesce(reloj_cobranza(l) ->> 'estado', 'al_dia') = 'al_dia'/" R36 "R36b"

echo "── R36c · las órdenes del suspendido a mano ──"
correr_marcada "el trigger que no cierra nada" cerrar_ordenes_al_suspender "$M" \
  "/@ordenes_abiertas/s/estado in ('NOT_PAID', 'PARTIAL')/estado in ('NADA')/" R36 "R36c"
correr_marcada "el trigger que cierra TAMBIÉN la PAID" cerrar_ordenes_al_suspender "$M" \
  "/@ordenes_abiertas/s/estado in ('NOT_PAID', 'PARTIAL')/estado in ('NOT_PAID', 'PARTIAL', 'PAID')/" R36 "R36c"
correr "el trigger borrado" \
  "drop trigger cerrar_ordenes_al_suspender on lubricentros;" R36 "R36c"

echo "── R36d · el pago tardío y el pago en plazo ──"
correr_marcada "ciclo_tras_el_pago ignorando el hasta de la orden" ciclo_tras_el_pago "$M_CICLO" \
  "s/else greatest(p_venc_actual, p_periodo_hasta)/else p_venc_actual/" R36 "R36d"
correr_marcada "ciclo_tras_el_pago arrancando siempre desde hoy" ciclo_tras_el_pago "$M_CICLO" \
  "s/else greatest(p_venc_actual, p_periodo_hasta)/else (p_fecha_pago + p_largo)::date/" R36 "R36d"

echo "── R36e · la vuelta que no deja rastro ──"
correr_marcada "cerrar_dia sin la rama de reactivacion_reloj" cerrar_dia "$M_SN" \
  "s/elsif not v_prev and v_act then/elsif false then/" R36 "R36e"

exit $fallas
