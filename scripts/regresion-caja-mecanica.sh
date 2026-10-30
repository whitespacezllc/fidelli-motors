#!/bin/bash
# La rotura a mano de R49 (regla 13): service de caja + mecánica en UNA
# carga (20261029200000). Cada afirmación se corre con SU rotura —la regla
# exacta que dice cubrir— y tiene que ponerse en ROJO. Una prueba que nunca
# se vio fallar es una prueba que no existe.
#
#   R49a · la puerta de p_mecanica de vuelta a «solo en un service» (la
#          pareja no nace: mecanica_adjunta_solo_en_service); la mecánica
#          adjunta con la fecha de HOY en vez de la de la caja; sin el
#          vínculo; con sus renglones ignorados; «ordenada» con
#          clock_timestamp() (otro created_at: la del día del canje abre el
#          ciclo nuevo); y con los pendientes reenviados a la recursiva.
#   R49b · las policies sin el gate por tipo: un Basic cuela la mecánica
#          adjunta a la caja (las dos policies a la vez, como en R38d: el
#          vínculo se escribe con un UPDATE y el WITH CHECK de
#          services_edicion, solo, ya frenaba al Basic).
#   R49d · premio_disponible y ciclos_fidelizacion de vuelta a contar filas
#          (con alcance 'todos' la pareja vale 2).
#   R49e · la propagación de la rama de la caja sin efecto: corregir la
#          caja deja la mecánica en la fecha y los km viejos. (La rotura
#          que explica por qué el bloque se copió en esa rama.)
#   R49f · el trigger del vínculo de vuelta a exigir un service (la pareja
#          no nace: vinculo_invalido) y sin exigir nada (una mecánica se
#          cuelga de un trabajo de gomería).
#
# Las roturas que NO están, y por qué: el CHECK del vínculo abierto a la
# caja lo acusa R42b («una caja quedó cargada con un service»), y la caja
# sin su rama o sin sus renglones como hechos, R42c. Lo que R38 ya rompe
# sobre la rama compartida (la descripción mínima, el definer, el vínculo
# por vehículo) no se repite acá: es la misma línea de código.
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
# guardar_service, actualizar_service y el trigger del vínculo viven,
# desde este sprint, en la migración de la pareja con la caja.
M_PAR=supabase/migrations/20261029200000_caja_con_mecanica.sql
# premio_disponible y ciclos_fidelizacion: la versión vigente.
M_IM=supabase/migrations/20261002120000_importado_de.sql

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
  orig=$(bloque "$2" "$3" | sed "s/^create function /create or replace function /")
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

echo "── R49 · service de caja + mecánica en una carga ──"
# La puerta: de vuelta a «solo en un service».
correr_marcada "la puerta de p_mecanica de vuelta a solo en un service" guardar_service "$M_PAR" \
  "/@adjunta-solo-service/s/p_tipo not in ('service', 'caja')/p_tipo <> 'service'/" R49 "mecanica_adjunta_solo_en_service"
# La pareja: misma fecha, vínculo y renglones (la misma rama que en R38,
# vista desde la caja).
correr_marcada "la mecánica adjunta con la fecha de hoy y no la de la caja" guardar_service "$M_PAR" \
  "/@adjunta-fecha/s/=> p_fecha,/=> current_date,/" R49 "R49a"
correr_marcada "la mecánica adjunta sin el vínculo a la caja" guardar_service "$M_PAR" \
  "/@adjunta-vinculo/s/cargado_con_id = v_service/cargado_con_id = null/" R49 "R49a"
correr_marcada "los renglones de la mecánica adjunta ignorados" guardar_service "$M_PAR" \
  "/@adjunta-items/s/= 'array'/= 'nunca'/" R49 "R49a"
correr_marcada "la mecánica adjunta «ordenada» con clock_timestamp()" guardar_service "$M_PAR" \
  "/@adjunta-vinculo/s/cargado_con_id = v_service where/cargado_con_id = v_service, created_at = clock_timestamp() where/" R49 "R49a"
correr_marcada "los pendientes reenviados a la mecánica adjunta" guardar_service "$M_PAR" \
  "/@adjunta-llamada/s/p_trabajo_descripcion => p_mecanica->>'descripcion'/p_trabajo_descripcion => p_mecanica->>'descripcion', p_pendientes => p_pendientes/" R49 "R49a"
# El gating: las dos policies sin el gate por tipo (ver R38d).
correr "services_insercion y services_edicion sin el gate por tipo" \
  "alter policy services_insercion on services with check ((lubricentro_id = mi_lubricentro_id()) or soy_superadmin()); alter policy services_edicion on services with check ((lubricentro_id = mi_lubricentro_id()) or soy_superadmin());" R49 "R49b"
# El conteo por visitas, en las dos funciones.
correr_marcada "premio_disponible de vuelta a contar filas" premio_disponible "$M_IM" \
  "/@visitas/s/count(distinct s.fecha)/count(*)/" R49 "R49d con alcance «todos»"
correr_marcada "ciclos_fidelizacion de vuelta a contar filas (la copia que se olvida)" ciclos_fidelizacion "$M_IM" \
  "/@visitas-flota/s/count(distinct s.fecha)/count(s.id)/" R49 "R49d con alcance «todos»"
# La propagación en la rama de la caja: sin ella la visita se parte en dos.
correr_marcada "actualizar_service sin propagar desde la caja" actualizar_service "$M_PAR" \
  "/@propaga-visita-caja/s/where cargado_con_id = p_service_id/where cargado_con_id = null/" R49 "R49e"
# El vínculo: el destino.
correr_marcada "el trigger del vínculo de vuelta a exigir un service como destino" services_validar_vinculo "$M_PAR" \
  "/@vinculo-tipo/s/and s.tipo in ('service', 'caja')/and s.tipo = 'service'/" R49 "vinculo_invalido"
correr_marcada "el trigger del vínculo sin exigir ningún tipo como destino" services_validar_vinculo "$M_PAR" \
  "/@vinculo-tipo/s/and s.tipo in ('service', 'caja')/and true/" R49 "R49f"

exit $fallas
