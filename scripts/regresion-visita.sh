#!/bin/bash
# La rotura a mano de R38 (regla 13): service + mecánica en UNA carga, y el
# premio que cuenta visitas. Cada afirmación se corre con SU rotura —la
# regla exacta que dice cubrir— y tiene que ponerse en ROJO. Una prueba que
# nunca se vio fallar es una prueba que no existe.
#
#   R38a · la mecánica adjunta con la fecha de HOY en vez de la del service
#          (la regla «una visita, un punto» necesita la misma fecha); sin el
#          vínculo cargado_con_id (el guardado y el detalle no encuentran la
#          pareja); sin sus renglones (el jsonb de items ignorado); «ordenada»
#          con clock_timestamp() (el bug que nombra la regla 22: con otro
#          created_at, la del día del canje abre el ciclo nuevo); y con los
#          pendientes reenviados a la llamada recursiva (cada pendiente
#          nuevo entra dos veces, sin error).
#   R38b · la descripción mínima de la mecánica bajada a cero: el CHECK de
#          la tabla la frena igual, pero con OTRO error que el front no
#          traduce, y el bloque lo acusa por eso.
#   R38c · la mecánica adjunta colgando de una mecánica (el `p_tipo <>
#          'service'` reemplazado por false).
#   R38d · la policy services_insercion sin el gate por tipo: un Basic
#          cuela la mecánica adjunta —y la mecánica sola—.
#   R38e · premio_disponible de vuelta a contar FILAS (count(*)), la
#          rotura más probable: alguien «arregla» el count(distinct); y
#          ciclos_fidelizacion ídem, que es la forma en que la tarjeta del
#          cliente y la pantalla Fidelización dicen números distintos sin
#          ningún error.
#   R38f · el corte del ciclo pasado de created_at a la fecha «para
#          alinearlo con las visitas»: un trabajo cargado después del canje
#          con fecha anterior deja de contar.
#   R38g · actualizar_service sin la propagación: corregir el service de la
#          pareja deja la mecánica en la fecha y los km viejos.
#   R38h · el CHECK del vínculo borrado (un service acepta cargado_con_id);
#          el trigger sin comparar el vehículo (una mecánica de OTRO auto se
#          cuelga del service); y sin exigir que el destino sea un service.
#   R38j · guardar_service como SECURITY DEFINER «para simplificar»: la
#          policy de plan deja de regir adentro. R38j lo ve en el catálogo
#          antes de que R38d tenga que descubrirlo por las malas.
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
M=supabase/migrations/20260929100000_service_con_mecanica.sql
# premio_disponible y ciclos_fidelizacion se redefinieron para no contar lo
# importado: la versión vigente vive acá y es la que hay que romper.
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
# guardar_service nace con `create function` (la firma cambió y la vieja
# se soltó antes): para volver a emitirla dentro de la transacción se pasa
# a `create or replace`, ANTES de comparar, así el guard sigue midiendo
# solo la rotura.
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

echo "── R38 · service + mecánica en una carga, y el premio por visitas ──"
# El conteo: la rotura más probable es que alguien «arregle» el distinct.
correr_marcada "premio_disponible de vuelta a contar filas" premio_disponible "$M_IM" \
  "/@visitas/s/count(distinct s.fecha)/count(*)/" R38 "R38e"
correr_marcada "ciclos_fidelizacion de vuelta a contar filas (la copia que se olvida)" ciclos_fidelizacion "$M_IM" \
  "/@visitas-flota/s/count(distinct s.fecha)/count(s.id)/" R38 "R38e"
# La pareja: misma fecha, vínculo y renglones.
correr_marcada "la mecánica adjunta con la fecha de hoy y no la del service" guardar_service "$M" \
  "/@adjunta-fecha/s/=> p_fecha,/=> current_date,/" R38 "R38a"
correr_marcada "la mecánica adjunta sin el vínculo al service" guardar_service "$M" \
  "/@adjunta-vinculo/s/cargado_con_id = v_service/cargado_con_id = null/" R38 "R38a"
correr_marcada "los renglones de la mecánica adjunta ignorados" guardar_service "$M" \
  "/@adjunta-items/s/= 'array'/= 'nunca'/" R38 "R38a"
# El bug que nombra la regla 22: «ordenar» la mecánica con clock_timestamp()
# le da otro created_at, y la del día del canje cuenta para el ciclo nuevo.
correr_marcada "la mecánica adjunta «ordenada» con clock_timestamp()" guardar_service "$M" \
  "/@adjunta-vinculo/s/cargado_con_id = v_service where/cargado_con_id = v_service, created_at = clock_timestamp() where/" R38 "R38a"
# Los pendientes reenviados a la recursiva: cada uno entra dos veces.
correr_marcada "los pendientes reenviados a la mecánica adjunta" guardar_service "$M" \
  "/@adjunta-llamada/s/p_trabajo_descripcion => p_mecanica->>'descripcion'/p_trabajo_descripcion => p_mecanica->>'descripcion', p_pendientes => p_pendientes/" R38 "R38a"
# El corte del ciclo por fecha en vez de created_at: el trabajo cargado
# después del canje con fecha vieja deja de contar.
correr_marcada "el corte del ciclo por fecha en vez de created_at" premio_disponible "$M_IM" \
  "/@corte-ciclo/s/s.created_at > uc.fecha/s.fecha > uc.fecha::date/" R38 "R38f"
# La propagación al editar: sin ella la visita se parte en dos.
correr_marcada "actualizar_service sin propagar a la mecánica adjunta" actualizar_service "$M" \
  "/@propaga-visita/s/where cargado_con_id = p_service_id/where cargado_con_id = null/" R38 "R38g"
# La descripción: el CHECK de la tabla frena igual, pero con otro error.
correr_marcada "la descripción mínima de la mecánica bajada a cero" guardar_service "$M" \
  "/@descripcion-minima/s/< 5 then/< 0 then/" R38 "R38b"
correr_marcada "la mecánica adjunta colgando de una mecánica" guardar_service "$M" \
  "/@adjunta-solo-service/s/p_tipo <> 'service'/false/" R38 "R38c"
# El gating: las policies sin el gate por tipo (20260911120100) dejan
# entrar la segunda fila a un Basic. Se rompen LAS DOS —inserción y
# edición— porque el vínculo se escribe con un UPDATE sobre la mecánica
# recién creada y el WITH CHECK de services_edicion, solo, ya la frena:
# con la inserción rota nada más, la rotura no rompe nada y el verde
# mentiría. R3b también acusaría la inserción; acá se prueba que la carga
# doble no encontró otra puerta.
correr "services_insercion y services_edicion sin el gate por tipo" \
  "alter policy services_insercion on services with check ((lubricentro_id = mi_lubricentro_id()) or soy_superadmin()); alter policy services_edicion on services with check ((lubricentro_id = mi_lubricentro_id()) or soy_superadmin());" R38 "R38d"
# La función como definer: la policy deja de regir adentro. Se ve en el
# catálogo (R38j), antes de descubrirlo por las malas.
correr_marcada "guardar_service como security definer" guardar_service "$M" \
  "/@invoker/s/set search_path = public/security definer set search_path = public/" R38 "R38j"
# El vínculo: el CHECK y las dos condiciones del trigger.
correr "el CHECK del vínculo borrado" \
  "alter table services drop constraint cargado_con_solo_mecanica;" R38 "R38h"
correr_marcada "el trigger del vínculo sin comparar el vehículo" services_validar_vinculo "$M" \
  "/@vinculo-vehiculo/s/and s.vehiculo_id = new.vehiculo_id/and true/" R38 "R38h"
correr_marcada "el trigger del vínculo sin exigir un service como destino" services_validar_vinculo "$M" \
  "/@vinculo-tipo/s/and s.tipo = 'service'/and true/" R38 "R38h"

exit $fallas
