#!/bin/bash
# La prueba 15 del bloque 2 de gomería, repetible: cada bloque de R16 en
# verificaciones.sql se corre con SU rotura hecha a mano —la regla exacta
# que el bloque dice cubrir— y tiene que ponerse en ROJO. Una prueba que
# nunca se vio fallar es una prueba que no existe: en el bloque 1, R15a
# pasaba en verde con la policy que decía probar rota, porque la rechazaba
# otra policy.
#
# Todo corre en transacciones con rollback: no deja rastro. Las roturas
# salen de la MISMA migración, con sed sobre las líneas marcadas `-- @algo`
# (por eso esas líneas no se reformatean). Requiere el stack local
# levantado (supabase start) con el schema al día (supabase db reset).
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20260912100100_neumaticos_retornos.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

SETUP=$(bloque R16-setup "$V")
FIN=$(bloque R16-fin "$V")
VISTA=$(bloque vista_proximos_neumaticos "$M")
DEF_SERVICE=$($DB -qtA -c "select pg_get_viewdef('vista_proximos_service'::regclass)")

# La vista nueva, rota con un sed. Se suelta y se vuelve a crear entera
# (el grant viaja dentro del bloque, para que la prueba no falle por un
# permiso en vez de por la regla).
vista_rota() {
  echo "drop view vista_proximos_neumaticos;"
  echo "$VISTA" | sed "$1"
}

# Una función de la migración, rota con un sed.
funcion_rota() {
  bloque "$1" "$M" | sed "s/^create function/create or replace function/" | sed "$2"
}

# vista_proximos_service sin el filtro de tipo: la rotura de R2, para R16a.
service_sin_filtro() {
  echo "create or replace view vista_proximos_service as"
  echo "${DEF_SERVICE%;}" | sed "s/AND (s.tipo = 'service'::tipo_trabajo)//g"
  echo ";"
  echo "alter view vista_proximos_service set (security_invoker = on);"
}

fallas=0
correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque (R16x) · $4 = patrón esperado en el error
  local salida
  salida=$( { echo "begin;"; echo "$2"; echo "$SETUP"; bloque "$3" "$V"; echo "$FIN"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -q "$4"; then
    echo "  ✓ $1 — atrapado ($4)"
  else
    echo "  ✗ $1 — SE ESCAPÓ (esperaba $4)"
    echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
    fallas=1
  fi
}

echo "── R16a · vista_proximos_service sin el filtro de tipo ──"
correr "retención sin filtro" "$(service_sin_filtro)" R16a "R16a"

echo "── R16b · la vista nueva sin security_invoker ──"
correr "sin invoker" "alter view vista_proximos_neumaticos reset (security_invoker);" R16b "R16b"

echo "── R16c · el módulo apagado ──"
correr "vista sin el gate del módulo" "$(vista_rota "/@gate/s/plan_permite('neumaticos')/true/")" R16c "R16c"
correr "badge que no suma la tercera fuente" "$(funcion_rota contactos_por_hacer "/@badge/s/plan_permite('neumaticos')/false/")" R16c "R16c"

echo "── R16d · rotación y alineación ──"
correr "sin rotación" "$(vista_rota "/@rotacion/s/c.mov_fecha is not null/false/")" R16d "R16d"
correr "sin alineación" "$(vista_rota "/@alineacion/s/coalesce(c.ali_fecha, c.col_fecha) is not null/false/")" R16d "R16d"

echo "── R16e · el reajuste de tuercas ──"
correr "reajuste que nunca aparece" "$(vista_rota "/@reajuste/s/<= 15/<= -1/")" R16e "R16e"
correr "reajuste que nunca se va" "$(vista_rota "/@reajuste/s/<= 15/<= 3650/")" R16e "R16e"

echo "── R16f · antigüedad, desgaste y nada ──"
correr "sin antigüedad" "$(vista_rota "/@antiguedad/s/c.dot_mas_viejo is not null/false/")" R16f "R16f"
correr "sin desgaste" "$(vista_rota "/@desgaste/s/c.mm_minimo is not null and c.mm_minimo <= c.mm_alerta/false/")" R16f "R16f"
correr "fila para cualquier auto" "$(vista_rota "/@ventana/s/x.fecha is not null and x.fecha <= current_date + 30/coalesce(x.fecha, current_date) <= current_date + 30/")" R16f "R16f"

echo "── R16g · config y plantillas de todos ──"
correr "sin el trigger de config" "drop trigger config_neumaticos_alta on lubricentros;" R16g "R16g"
correr "siembra sin la tercera plantilla" "$(funcion_rota sembrar_templates "s/'{nombre}, a tu {vehiculo} le toca {motivo}. Escribinos y te damos turno.',/null,/")" R16g "R16g"
correr "backfill que pisa lo personalizado" "$(funcion_rota completar_templates_neumaticos "/@completar/s/set contenido_neumaticos = case t.tono/set contenido = 'PISADO', contenido_neumaticos = case t.tono/")" R16g "R16g"

echo "── R16h · el anti-spam ──"
correr "contacto por otro motivo" "$(vista_rota "/@antispam/s/'neumaticos'/'pendiente'/")" R16h "R16h"

echo "── R16i · el beneficio ──"
correr "beneficio recién con tres" "$(funcion_rota calcular_beneficio_neumaticos "/@beneficio/s/>= 2/>= 3/")" R16i "R16i"
correr "beneficio con la config en 0" "$(funcion_rota calcular_beneficio_neumaticos "/@beneficio/s/coalesce(v_cfg.beneficio_km, 0) > 0/true/")" R16i "R16i"
correr "cartón que ignora la config" "$(funcion_rota get_carton "s/coalesce(v_beneficio_km, 0) > 0/true/g")" R16i "R16i"

echo "── R16j · CHECK y RLS de la configuración ──"
correr "sin el CHECK de rotación" "alter table config_neumaticos drop constraint km_rotacion_rango;" R16j "R16j"
correr "sin RLS" "alter table config_neumaticos disable row level security;" R16j "R16j"

echo "── R16k · resumen_inicio sin el tipo ──"
correr "ultimos sin tipo" "$(funcion_rota resumen_inicio "/'tipo', u.tipo,/d")" R16k "R16k"

echo "── R16l · ritmo solo de gomería ──"
correr "ritmo de un solo tipo" "$(vista_rota "/@ritmo/s/s.kilometros is not null/s.kilometros is not null and s.tipo = 'neumaticos'/")" R16l "R16l"

echo
if [ "$fallas" -eq 0 ]; then echo "La red atrapó las 22 roturas."; else echo "ALGUNA ROTURA SE ESCAPÓ: revisar arriba."; fi
exit $fallas
