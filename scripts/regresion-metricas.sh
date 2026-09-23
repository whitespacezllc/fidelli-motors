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
# Y las del bloque MÉTRICAS 4 (R34, migración 20260925100000):
#   R34a · movimientos_mrr() con mrr_fin leído del total de la plataforma
#          (snapshots_diarios.mrr_ars) en vez de Σ b por tenant: la identidad
#          deja de cerrar por construcción. En la base de prueba un tenant
#          borrado sigue en el total de la plataforma y no en las filas por
#          tenant (el fantasma de R34), que es lo que queda en toda base
#          local donde una prueba borró tenants.
#   R34b · la comparación de plan/período/módulo siempre falsa (un cambio de
#          lista cae en expansión); el evento cambio_plan sin mirar (un
#          descuento renegociado cae en ajuste de precio); la ventana del
#          evento corrida del mes calendario a (foto inicio, foto fin] (un
#          descuento quitado después de la última foto de un mes en curso
#          se le atribuye al mes siguiente: la lectura de «en el mes» cambia
#          sin que lo decida la definición); y todo a = 0, b > 0 como nuevo
#          (la reactivación desaparece).
#   R34c · cohortes_logos() devolviendo retención en un mes no cerrado.
#   R34d · cohortes_ingresos() devolviendo GRR/NRR en un mes no cumplido, y
#          con MRR inicial en una cohorte cuyo mes de alta no cerró.
#   R34e · suspension_reloj contada como voluntaria.
#
# Y las del bloque MÉTRICAS 4 · performance (R34g–R34i, migración 20260925101000):
#   R34g · listado_lubricentros() con el estado del owner invertido
#          (pendiente ↔ activo): la identidad fila por fila contra la copia
#          textual de la versión vieja lo ve en la columna owner_estado. Y
#          owner_nombre eligiendo al owner más NUEVO (@owner_mas_viejo):
#          el tenant de prueba con dos owners (el más nuevo insertado
#          primero) lo delata. Y el módulo de gomería sin el escalón del
#          PLAN (@modulo_plan): el tenant suscripto al plan de prueba con
#          `neumaticos` en sus features sale apagado en la nueva.
#   R34h · metricas_plataforma() con la serie contando solo `service`
#          (@serie_todos): el jsonb ya no es igual al de la versión vieja y
#          el punto de hoy pierde la mecánica y la gomería de prueba. Y sin
#          la rama «cero trabajos» (@sin_trabajos): con services vacía (en
#          una subtransacción que se deshace) la nueva devuelve 30/12/12
#          puntos en cero en vez de las tres series en [].
#   R34i · suscriptos_por_plan() tomando la suscripción más VIEJA en vez de
#          la vigente (el tenant con una Basic cancelada sale con Basic);
#          estado_owner() con la regla invertida (el owner que entró sale
#          «pendiente»); y estado_owner() eligiendo al owner más nuevo con
#          dos owners (@owner_mas_viejo: la ficha y el listado tienen que
#          nombrar al mismo).
#
#
# Y la del candado de calcos (R34j, migración 20260925102000):
#   R34j · el candado del contador de calcos con el `if` en false, el candado
#          que avisa en vez de forzar, el trigger desactivado, y
#          registrar_pedido_calcos() que deja la bandera prendida (un update
#          posterior en la misma transacción hereda el permiso de la puerta).
#
#
# ⚠ metricas_plataforma() se REDEFINIÓ OTRA VEZ en 20260925101000 y
# registrar_pedido_calcos() en 20260925102000: la rotura de R32f muerde el
# archivo de performance ($M_PF) y la de R33g el del candado ($M_CC), no
# los originales (CLAUDE.md, «cuando redefinas una función que algún script
# muerde, actualizá el M»).
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
M_CR=supabase/migrations/20260925100000_crecimiento.sql
M_PF=supabase/migrations/20260925101000_performance.sql
M_CC=supabase/migrations/20260925102000_calcos_candado.sql

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
correr_marcada "metricas_plataforma() de vuelta con el filtro tipo = 'service'" metricas_plataforma "$M_PF" \
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
correr_marcada "registrar_pedido_calcos() con el máximo en vez de la suma" registrar_pedido_calcos "$M_CC" \
  "/@suma_calcos/s/coalesce(sum(pc.cantidad), 0)/coalesce(max(pc.cantidad), 0)/" R33 "R33g"

echo "── R33i · la ventana y el umbral de activación ──"
correr_marcada "la ventana de activación corrida a 8 días" activacion_tenant "$M_AU" \
  "/@ventana_activacion/s/interval '7 days'/interval '8 days'/" R33 "R33i"
correr_marcada "el umbral de activación bajado a 19" activacion_tenant "$M_AU" \
  "/@umbral_activacion/s/v_n >= 20,/v_n >= 19,/" R33 "R33i"

echo "── R34a · la identidad por construcción ──"
correr_marcada "mrr_fin leído del total de la plataforma en vez de Σ b por tenant" movimientos_mrr "$M_CR" \
  "/@identidad_fin/s/round(sum(x.b), 2) as fin,/(select d.mrr_ars from snapshots_diarios d where d.fecha = p.fecha_fin) as fin,/" R34 "R34a"

echo "── R34b · ajuste vs expansión, el descuento, nuevo vs reactivación ──"
correr_marcada "un cambio de lista clasificado como expansión (plan/período/módulo nunca «iguales»)" movimientos_mrr "$M_CR" \
  "/@ajuste_vs_expansion/s/then true/then false/" R34 "R34b"
correr_marcada "un descuento renegociado clasificado como ajuste de precio (el evento cambio_plan no se mira)" movimientos_mrr "$M_CR" \
  "/@descuento_es_cliente/s/and not d.cambio_descuento/and true/" R34 "R34b"
# Las dos líneas de la ventana llevan el marcador (ev_desde y ev_hasta) y el
# sed las corre del mes calendario a (foto inicio, foto fin]: con los meses
# cerrados es lo mismo, así que solo el tenant W de 1986 (febrero en curso,
# descuento quitado después de su última foto) lo ve.
correr_marcada "la ventana del evento cambio_plan corrida del mes calendario a (foto inicio, foto fin]" movimientos_mrr "$M_CR" \
  "/@evento_en_el_mes/s/(f.mes::timestamp/((i.fecha + 1)::timestamp/; /@evento_en_el_mes/s/((f.mes + interval '1 month')::timestamp/((f.fecha + 1)::timestamp/" R34 "R34b"
# Las dos líneas llevan el marcador: la de nuevo (alta en el mes → siempre)
# y la de reactivación (alta anterior → nunca). Cada sustitución va
# direccionada; si solo se mordiera la primera, la reactivación se contaría
# dos veces y la atraparía R34a (la identidad), no R34b.
correr_marcada "todo a = 0, b > 0 como nuevo (la reactivación desaparece)" movimientos_mrr "$M_CR" \
  "/@nuevo_vs_react/s/and x.alta_en_mes)/and true)/; /@nuevo_vs_react/s/and not x.alta_en_mes)/and false)/" R34 "R34b"

echo "── R34c · el mes cumplido en las cohortes de logos ──"
correr_marcada "cohortes_logos() con retención en un mes no cerrado" cohortes_logos "$M_CR" \
  "/@mes_cumplido/s/and m.en_curso = false/and true/" R34 "R34c"

echo "── R34d · el mes cumplido y el mes de alta cerrado en las cohortes de ingresos ──"
correr_marcada "cohortes_ingresos() con GRR/NRR en un mes no cumplido" cohortes_ingresos "$M_CR" \
  "/@mes_cumplido/s/and m.en_curso = false/and true/" R34 "R34d"
correr_marcada "cohortes_ingresos() con MRR inicial en una cohorte cuyo mes de alta no cerró" cohortes_ingresos "$M_CR" \
  "/@mes_alta_cerrado/s/and m.en_curso = false/and true/" R34 "R34d"

echo "── R34e · el reloj es involuntario ──"
correr_marcada "suspension_reloj contada como voluntaria" churn_por_mes "$M_CR" \
  "/@involuntario/s/then true/then false/" R34 "R34e"

echo "── R34g · el estado y el nombre del owner en el listado ──"
correr_marcada "listado_lubricentros() con el estado del owner invertido (pendiente ↔ activo)" listado_lubricentros "$M_PF" \
  "/@owner_estado_listado/s/coalesce(o.estado, 'sin_owner')/case o.estado when 'pendiente' then 'activo' when 'activo' then 'pendiente' else 'sin_owner' end/" R34 "R34g"
correr_marcada "listado_lubricentros() con owner_nombre del owner más nuevo (con dos owners)" listado_lubricentros "$M_PF" \
  "/@owner_mas_viejo/s/u.created_at, u.id/u.created_at desc, u.id desc/" R34 "R34g CON DOS OWNERS EL LISTADO NO ELIGIÓ AL MÁS VIEJO"
correr_marcada "listado_lubricentros() sin el escalón del plan para el módulo de gomería" listado_lubricentros "$M_PF" \
  "/@modulo_plan/s/when jsonb_typeof(p.features -> 'neumaticos') = 'boolean'/when false/" R34 "R34g"

echo "── R34h · la serie del pulso cuenta todos los tipos, y sin trabajos está vacía ──"
correr_marcada "metricas_plataforma() con la serie contando solo service" metricas_plataforma "$M_PF" \
  "/@serie_todos/s/where not s.anulado/where not s.anulado and s.tipo = 'service'/" R34 "R34h"
correr_marcada "metricas_plataforma() sin la rama «cero trabajos» (30 puntos en cero en una base vacía)" metricas_plataforma "$M_PF" \
  "/@sin_trabajos/s/where r.primero is not null/where true/" R34 "R34h SIN NINGÚN TRABAJO"

echo "── R34i · la suscripción vigente y la regla del owner ──"
correr_marcada "suscriptos_por_plan() tomando la suscripción más vieja en vez de la vigente" suscriptos_por_plan "$M_PF" \
  "/@suscriptos_vigente/s/s.inicio desc, s.created_at desc/s.inicio asc, s.created_at asc/" R34 "R34i"
correr_marcada "estado_owner() con la regla invertida (el que entró sale pendiente)" estado_owner "$M_PF" \
  "/@regla_owner/s/is null then 'pendiente' else 'activo'/is null then 'activo' else 'pendiente'/" R34 "R34i"
correr_marcada "estado_owner() eligiendo al owner más nuevo (con dos owners)" estado_owner "$M_PF" \
  "/@owner_mas_viejo/s/u.created_at, u.id/u.created_at desc, u.id desc/" R34 "R34i estado_owner() CON DOS OWNERS NO ELIGIÓ AL MÁS VIEJO"

echo "── R34j · el candado del contador de calcos ──"
correr_marcada "el candado con el if en false" forzar_calcos_desde_pedidos "$M_CC" \
  "/@candado_calcos/s/if current_setting/if false and current_setting/" R34 "R34j"
correr_marcada "el candado que avisa en vez de forzar (bajado a notice)" forzar_calcos_desde_pedidos "$M_CC" \
  "/@forzar_calcos/s/new.calcos_entregadas := v_suma;/raise notice 'calcos fuera de la suma: % (suma %)', new.calcos_entregadas, v_suma;/" R34 "R34j"
correr "el trigger del candado desactivado" \
  "alter table lubricentros disable trigger candado_calcos_desde_pedidos;" R34 "R34j"
correr_marcada "registrar_pedido_calcos() que deja la bandera prendida" registrar_pedido_calcos "$M_CC" \
  "/@apagar_bandera/s/perform set_config('app.calcos_desde_pedido', '', true);/perform true;/" R34 "R34j"

echo
if [ "$fallas" = 0 ]; then
  echo "La red atrapó todas las roturas de R31, R32, R33 y R34."
else
  echo "ALGUNA ROTURA SE ESCAPÓ: el bloque que la cubre no la ve."
fi
exit $fallas
