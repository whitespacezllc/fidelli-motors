#!/bin/bash
# La rotura a mano de R31 (regla 13): cada regla del bloque MÉTRICAS 1 se
# rompe a propósito y el bloque tiene que ponerse en ROJO. Una prueba que
# nunca se vio fallar es una prueba que no existe.
#
#   R31a · los tres candados de tenant_eventos bajados a notice, de a uno.
#   R31b · el trigger de pagos SIN el envoltorio defensivo: el sabotaje del
#          evento bloquea el cobro, que es exactamente lo que no puede pasar.
#   R31c · cerrar_dia() que dice «cerrado» la segunda vez, y la que pisa la
#          idempotencia entera (el segundo cierre revienta por la PK).
#   R31d · el MRR sin mensualizar (el anual entero como MRR) y el exento
#          corrido al 101 (un bonificado con MRR).
#   R31e · es_activo() mirando solo la columna, sin el reloj.
#   R31f · el motivo de la suspensión opcional.
#   R31g · el alta como trigger inmediato (el evento nace sin plan), y el
#          evento de módulo sin el motivo del override.
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día (supabase db
# reset). DB_CONTAINER cambia el contenedor (default: el del proyecto).
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i ${DB_CONTAINER:-supabase_db_fidelli-motors} psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M_EV=supabase/migrations/20260922201000_tenant_eventos.sql
M_PL=supabase/migrations/20260922203000_metricas_plata.sql
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

echo "── R31a · los candados de tenant_eventos ──"
correr_marcada "el candado de edición bajado a notice" bloquear_edicion_de_evento_tenant "$M_EV" \
  "s/raise exception 'evento_no_se_edita'/raise notice 'evento_no_se_edita'/" R31 "R31a"
correr_marcada "el candado de borrado bajado a notice" bloquear_borrado_de_evento_tenant "$M_EV" \
  "s/raise exception 'evento_no_se_borra'/raise notice 'evento_no_se_borra'/" R31 "R31a"
correr_marcada "el candado de purga bajado a notice" bloquear_purga_de_eventos_tenant "$M_EV" \
  "s/raise exception 'eventos_no_se_vacian'/raise notice 'eventos_no_se_vacian'/" R31 "R31a"

echo "── R31b · la instrumentación que bloquea el cobro ──"
correr_marcada "el trigger de pagos sin el envoltorio defensivo" tenant_evento_tras_pago "$M_EV" \
  "s/raise warning 'tenant_eventos: pago/raise exception 'tenant_eventos: pago/" R31 "R31b"

echo "── R31c · la idempotencia del cierre ──"
correr_marcada "cerrar_dia() dice «cerrado» la segunda vez" cerrar_dia "$M_SN" \
  "/@ya_cerrado/,/end if;/s/return 'ya cerrado'/return 'cerrado'/" R31 "R31c"
correr_marcada "cerrar_dia() sin el chequeo de «ya cerrado» (el segundo cierre revienta)" cerrar_dia "$M_SN" \
  "/@ya_cerrado/s/if exists/if false and exists/" R31 "duplicate key"
correr_marcada "cerrar_dia() que cierra hoy" cerrar_dia "$M_SN" \
  "/@dia_terminado/s/>= current_date/> current_date/" R31 "R31c"

echo "── R31d · la plata ──"
correr_marcada "el MRR sin mensualizar (el anual entero)" mrr_de_tenant "$M_PL" \
  "/@mrr_meses/s|/ meses_del_periodo(sub.periodo), 2)|/ 1, 2)|" R31 "R31d"
correr_marcada "la exención corrida al 101 (un bonificado con MRR)" mrr_de_tenant "$M_PL" \
  "/@exento_mrr/s/>= 100/>= 101/" R31 "R31d"

echo "── R31e · la definición de activo ──"
correr_marcada "es_activo() sin mirar el reloj" es_activo "$M_PL" \
  "/@activo_reloj/s/and coalesce(reloj_cobranza(l) ->> 'estado', 'al_dia') <> 'suspendido';/;/" R31 "R31e"

echo "── R31f · el motivo de la suspensión ──"
correr_marcada "suspender sin motivo" cambiar_estado_lubricentro "$M_EV" \
  "s/raise exception 'motivo_vacio'/raise notice 'motivo_vacio'/" R31 "R31f"

echo "── R31g · el alta y el override ──"
correr "el alta como trigger inmediato (nace sin plan)" \
  "drop trigger tenant_evento_alta on lubricentros;
   create trigger tenant_evento_alta after insert on lubricentros
     for each row execute function tenant_evento_alta();" R31 "R31g"
correr_marcada "el evento de módulo sin el motivo del override" tenant_evento_tras_override "$M_EV" \
  "s/new.motivo, origen_evento_de_sesion(), new.created_at, new.cambiado_por/null, origen_evento_de_sesion(), new.created_at, new.cambiado_por/" R31 "R31g"

echo
if [ "$fallas" = 0 ]; then
  echo "La red atrapó todas las roturas de R31."
else
  echo "ALGUNA ROTURA SE ESCAPÓ: el bloque que la cubre no la ve."
fi
exit $fallas
