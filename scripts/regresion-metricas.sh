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
# Y las del bloque MÉTRICAS 2 (R32, migración 20260923100000):
#   R32a · salud_tenants() sin la guarda: un owner lee la salud de todos.
#   R32b · la salud que decide «cobro vencido» por la FECHA en vez de por
#          estado_atencion(): un bonificado vencido vuelve a salir en ámbar
#          (la copia de la regla del 100% que este bloque vino a borrar).
#   R32c · los dos cortes de actividad corridos (3 → 30 y 7 → 70).
#   R32d · trabajos_semanales() contando solo `service`.
#   R32e · indicadores_tenants() con el MRR en cero y con la ventana de 30
#          días achicada a 7.
#   R32f · metricas_plataforma() de vuelta con el filtro `tipo = 'service'`.
#   R32g · resumen_admin() contando solo `service` en trabajos del mes.
#
# Y las del bloque MÉTRICAS 3 (R33, migraciones 20260924101000…103000):
#   R33b · el CHECK de cierre y pérdida excluyentes, borrado.
#   R33c · marcar_cierre() que fija el origen SIEMPRE (pisa el que ya estaba).
#   R33d · el embudo contando los cierres por período de cierre en vez de por
#          cohorte, y el CAC dividido por los cierres de la cohorte.
#   R33e · el CHECK del lunes de gasto_pauta, borrado.
#   R33f · los tres candados de pedidos_calcos bajados a notice, de a uno.
#   R33g · registrar_pedido_calcos() que deja el contador en el máximo en
#          vez de la suma.
#   R33i · la ventana de activación corrida a 8 días, y el umbral bajado a 19.
#
# ⚠ indicadores_tenants() y metricas_plataforma() se REDEFINIERON en
# 20260924102000: las roturas de R32 las muerden de ese archivo, no del
# original (CLAUDE.md, «cuando redefinas una función que algún script
# muerde, actualizá el M»).
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
M_RS=supabase/migrations/20260923100000_resumen_admin.sql
M_CP=supabase/migrations/20260924101000_contactos_pauta.sql
M_AU=supabase/migrations/20260924102000_activacion_uso.sql
M_PC=supabase/migrations/20260924103000_pedidos_calcos.sql

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

echo "── R32a · la guarda de la salud ──"
correr_marcada "salud_tenants() sin la guarda (un owner lee la salud de todos)" salud_tenants "$M_RS" \
  "/@guarda_salud/s/if not soy_superadmin() then/if false then/" R32 "R32a"

echo "── R32b · la exención vive en estado_atencion(), no en una copia ──"
correr_marcada "la salud que decide «cobro vencido» por la fecha (el bonificado vencido vuelve al ámbar)" salud_tenants "$M_RS" \
  "/@cobro_por_atencion/s/when b.atencion in ('trial_vencido', 'cobranza_vencida') then/when b.vencimiento < current_date then/" R32 "R32b"

echo "── R32c · los cortes de actividad ──"
correr_marcada "el corte de «al día» corrido a 30 días" salud_tenants "$M_RS" \
  "/@corte_al_dia/s/<= 3 then/<= 30 then/" R32 "R32c"
correr_marcada "el corte de «actividad baja» corrido a 70 días" salud_tenants "$M_RS" \
  "/@corte_baja/s/<= 7 then/<= 70 then/" R32 "R32c"

echo "── R32d · el sparkline cuenta todos los tipos ──"
correr_marcada "trabajos_semanales() contando solo service" trabajos_semanales "$M_RS" \
  "/@semana_todos/s/where not sv.anulado/where not sv.anulado and sv.tipo = 'service'/" R32 "R32d"

echo "── R32e · los indicadores de la fila ──"
correr_marcada "indicadores_tenants() con el MRR en cero" indicadores_tenants "$M_AU" \
  "/@mrr_indicador/s/mrr_de_tenant(l.id),/0::numeric,/" R32 "R32e"
correr_marcada "indicadores_tenants() con la ventana de 30 días achicada a 7" indicadores_tenants "$M_AU" \
  "/@trabajos_30/s/current_date - 29/current_date - 6/" R32 "R32e"

echo "── R32f · el pulso cuenta todos los tipos ──"
correr_marcada "metricas_plataforma() de vuelta con el filtro tipo = 'service'" metricas_plataforma "$M_AU" \
  "/@trabajos_mes/s/where not anulado/where not anulado and tipo = 'service'/" R32 "R32f"

echo "── R32g · el resumen cuenta todos los tipos ──"
correr_marcada "resumen_admin() contando solo service en trabajos del mes" resumen_admin "$M_RS" \
  "/@resumen_trabajos/s/where not anulado/where not anulado and tipo = 'service'/" R32 "R32g"

echo "── R33b · cierre y pérdida excluyentes ──"
correr "el CHECK cierre_o_perdida borrado" \
  "alter table contactos_pauta drop constraint cierre_o_perdida;" R33 "R33b"

echo "── R33c · el origen solo si estaba vacío ──"
correr_marcada "marcar_cierre() que fija el origen siempre" marcar_cierre "$M_CP" \
  "/@origen_si_vacio/s/if v_origen is null then/if true then/" R33 "R33c"

echo "── R33d · la cohorte y el CAC ──"
correr_marcada "el embudo contando cierres por período de cierre" embudo_pauta "$M_CP" \
  "/@cohorte/s/filter (where c.cierre_at  is not null)/filter (where c.cierre_at is not null and date_trunc(v_unidad, c.cierre_at::timestamp) = date_trunc(v_unidad, c.fecha::timestamp))/" R33 "R33d"
correr_marcada "el CAC dividido por los cierres de la cohorte" embudo_pauta "$M_CP" \
  "/@cac_periodo/s|then round(g.usd / ce.n, 2) end|then round(g.usd / nullif(co.n_cierres, 0), 2) end|" R33 "R33d"

echo "── R33e · el lunes ──"
correr "el CHECK del lunes de gasto_pauta borrado" \
  "alter table gasto_pauta drop constraint gasto_pauta_semana_check;" R33 "R33e"

echo "── R33f · los candados de pedidos_calcos ──"
correr_marcada "el candado de edición bajado a notice" bloquear_edicion_de_pedido_calcos "$M_PC" \
  "s/raise exception 'pedido_calcos_no_se_edita'/raise notice 'pedido_calcos_no_se_edita'/" R33 "R33f"
correr_marcada "el candado de borrado bajado a notice" bloquear_borrado_de_pedido_calcos "$M_PC" \
  "s/raise exception 'pedido_calcos_no_se_borra'/raise notice 'pedido_calcos_no_se_borra'/" R33 "R33f"
correr_marcada "el candado de purga bajado a notice" bloquear_purga_de_pedidos_calcos "$M_PC" \
  "s/raise exception 'pedidos_calcos_no_se_vacian'/raise notice 'pedidos_calcos_no_se_vacian'/" R33 "R33f"

echo "── R33g · el contador es la suma ──"
correr_marcada "registrar_pedido_calcos() con el máximo en vez de la suma" registrar_pedido_calcos "$M_PC" \
  "/@suma_calcos/s/coalesce(sum(pc.cantidad), 0)/coalesce(max(pc.cantidad), 0)/" R33 "R33g"

echo "── R33i · la ventana y el umbral de activación ──"
correr_marcada "la ventana de activación corrida a 8 días" activacion_tenant "$M_AU" \
  "/@ventana_activacion/s/interval '7 days'/interval '8 days'/" R33 "R33i"
correr_marcada "el umbral de activación bajado a 19" activacion_tenant "$M_AU" \
  "/@umbral_activacion/s/v_n >= 20,/v_n >= 19,/" R33 "R33i"

echo
if [ "$fallas" = 0 ]; then
  echo "La red atrapó todas las roturas de R31, R32 y R33."
else
  echo "ALGUNA ROTURA SE ESCAPÓ: el bloque que la cubre no la ve."
fi
exit $fallas
