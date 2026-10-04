#!/bin/bash
# La rotura a mano de R42 (regla 13): el service de caja automática, el
# cuarto tipo de trabajo. Cada afirmación se corre con SU rotura —la regla
# exacta que dice cubrir— y tiene que ponerse en ROJO. Una prueba que nunca
# se vio fallar es una prueba que no existe.
#
#   R42j · el catálogo: la feature mal escrita, la feature metida en el
#          `features` de un plan (deja de ser «por tenant»), la categoría
#          de los ATF apagada o corrida al final, los dos CHECK borrados,
#          la vista sin security_invoker y la firma vieja de
#          actualizar_service conviviendo con la nueva.
#   R42a · el gating: services_insercion sin la condición de la caja
#          (entra por la RPC y por la tabla), services_edicion sin ella (un
#          service se convierte en caja por UPDATE) y guardar_service como
#          SECURITY DEFINER (la policy deja de regir adentro).
#   R42b · caja_coherente con cada una de sus seis condiciones sacada de a
#          una, y el espejo abierto a cada uno de los otros tres tipos.
#   R42c · la rama de guardar_service: `cambiado` leído del jsonb, el aceite
#          que no baja del stock, el salto con cada borde corrido para los
#          dos lados, y las tres validaciones sin su error nombrado (las
#          frena la tabla, con otro error que el front no traduce).
#   R42d · la edición: `cambiado` leído del jsonb al actualizar y al
#          insertar, el salto sin validar, el próximo que no se escribe, los
#          renglones que no se sincronizan, la caja editada por la rama del
#          service (la frena el CHECK), y el plazo: a 7 días y sin plazo.
#   R42e · la vista: `ultimo` sin el filtro de tipo y con las anuladas; el
#          ritmo y el odómetro medidos solo con cajas; los tres umbrales
#          corridos; el horizonte sacado, achicado y —la lectura literal
#          del pedido— puesto sobre la fecha de la última caja; el
#          anti-spam por estado y sin ciclo; y la vista sin la feature.
#   R42f · vista_proximos_service y vista_vehiculos sin el filtro de tipo:
#          la caja se cuela como «último service».
#   R42g · el premio contando la caja con alcance 'services', en cada una
#          de las dos funciones del ciclo.
#   R42h · get_carton sin prox_caja_km; resumen_inicio contando todos los
#          tipos, las anuladas y los otros meses; metricas_plataforma sin
#          contar cajas, contándolas como service y sin el corte del mes.
#   R42i · el badge sin la cuarta fuente, la siembra sin la cuarta
#          plantilla, y el backfill que pisa o que no corrió.
#
# Tres roturas NO están, porque no rompen nada, y una rotura que no rompe
# nada es una prueba que miente sobre lo que cubre:
#   · el badge con `true` en vez de plan_permite('caja'): la vista ya se
#     gatea sola y devuelve cero filas sin la feature;
#   · sacarle a items_escritura un gate por feature: no lo tiene (tampoco
#     para la mecánica); la caja se gatea en la cabecera, como todo;
#   · un renglón del cartón de aceite adentro de una caja (o al revés): la
#     base castea genérico a propósito (regla 14) y quien no los mezcla es
#     el front, con dos listas.
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
M=supabase/migrations/20261004120100_service_caja.sql
# premio_disponible y ciclos_fidelizacion viven acá desde la importación.
M_IM=supabase/migrations/20261002120000_importado_de.sql
# La firma VIEJA de actualizar_service, para probar que no puede convivir.
M_VIEJA=supabase/migrations/20260929100000_service_con_mecanica.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

fallas=0
total=0

correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque · $4 = texto esperado
  local salida
  total=$((total + 1))
  salida=$( { echo "begin;"; echo "$2"; bloque "$3" "$V"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -qF "$4"; then
    echo "  ✓ $1 — atrapado ($4)"
  else
    echo "  ✗ $1 — SE ESCAPÓ (esperaba «$4»)"
    echo "$salida" | grep -E "ERROR|NOTICE" | tail -3 | sed 's/^/      /'
    fallas=1
  fi
}

# El guard del sed: si el patrón no muerde, la «rotura» es un no-op y el
# bloque pasa en verde. Un falso VERDE es peor que un falso rojo. Las
# funciones y la vista que nacen con `create` se pasan a `create or
# replace` ANTES de comparar, así el guard mide solo la rotura.
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = texto
  local orig roto
  orig=$(bloque "$2" "$3" | sed -e "s/^create function /create or replace function /" \
                                -e "s/^create view /create or replace view /")
  roto=$(printf '%s\n' "$orig" | sed "$4")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré el bloque «$2» en $3"; fallas=1; total=$((total + 1)); return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; total=$((total + 1)); return
  fi
  correr "$1" "$roto" "$5" "$6"
}

# Una vista que este sprint NO redefine (vista_proximos_service,
# vista_vehiculos), rota desde su definición viva, como regresion-retencion.sh.
correr_vista() { # $1 = nombre · $2 = vista · $3 = sed · $4 = bloque · $5 = texto
  local def roto
  def=$($DB -qtA -c "select pg_get_viewdef('$2'::regclass)")
  roto=$(printf '%s\n' "$def" | sed "$3")
  if [ -z "$def" ] || [ "$def" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ la definición de $2."; fallas=1; total=$((total + 1)); return
  fi
  correr "$1" "create or replace view $2 as ${roto%;}; alter view $2 set (security_invoker = on);" "$4" "$5"
}

# caja_coherente con UNA condición menos.
CONDICIONES="kilometros is not null and aceite_tipo is not null and prox_caja_km is not null and prox_caja_km > kilometros and prox_service_km is null and trabajo_descripcion is null"
caja_sin() { # $1 = la condición a sacar, tal cual está escrita
  local sin
  sin=${CONDICIONES/"$1 and "/}
  [ "$sin" = "$CONDICIONES" ] && sin=${CONDICIONES/" and $1"/}
  if [ "$sin" = "$CONDICIONES" ]; then echo "select 1/0; -- no encontré «$1» en caja_coherente"; return; fi
  echo "alter table services drop constraint caja_coherente; alter table services add constraint caja_coherente check (tipo <> 'caja' or ($sin));"
}
espejo_abierto_a() { # $1 = el tipo que además puede llevar próximo de caja
  echo "alter table services drop constraint prox_caja_solo_caja; alter table services add constraint prox_caja_solo_caja check (prox_caja_km is null or tipo in ('caja', '$1'));"
}

echo "── R42j · el catálogo y la forma ──"
correr_marcada "la feature mal escrita en el catálogo" catalogo_features_plan "$M" \
  "/@feature-caja/s/'caja'/'cajas'/" R42 "R42j la feature «caja» no está"
correr "la feature metida en el features de un plan (deja de ser por tenant)" \
  "update planes set features = features || '{\"caja\": false}'::jsonb where nombre = 'Ultra';" R42 "R42j 1 plan(es) traen la clave «caja»"
correr "la categoría de los ATF apagada" \
  "update categorias_producto set activa = false where clave = 'transmision';" R42 "R42j falta la categoría de producto «transmision»"
correr "la categoría de los ATF al final del catálogo" \
  "update categorias_producto set orden = 99 where clave = 'transmision';" R42 "R42j la categoría «transmision» no quedó entre"
correr "el CHECK del cuarto tipo borrado" \
  "alter table services drop constraint caja_coherente;" R42 "R42j faltan los CHECK del cuarto tipo"
correr "el espejo del próximo de caja borrado" \
  "alter table services drop constraint prox_caja_solo_caja;" R42 "R42j faltan los CHECK del cuarto tipo"
correr "la vista sin security_invoker" \
  "alter view vista_proximos_caja set (security_invoker = off);" R42 "R42j AISLAMIENTO ROTO"
correr "la firma vieja de actualizar_service conviviendo con la nueva" \
  "$(bloque actualizar_service "$M_VIEJA")" R42 "R42j hay 1 firmas de guardar_service y 2 de actualizar_service"

echo "── R42a · el gating, en las dos capas de la base ──"
correr "services_insercion sin la condición de la caja" \
  "alter policy services_insercion on services with check ((lubricentro_id = mi_lubricentro_id() and (tipo <> 'mecanica' or plan_permite('mecanica')) and (tipo <> 'neumaticos' or plan_permite('neumaticos'))) or soy_superadmin());" \
  R42 "R42a un tenant SIN la feature cargó un service de caja por la RPC"
correr "services_edicion sin la condición de la caja" \
  "alter policy services_edicion on services with check ((lubricentro_id = mi_lubricentro_id() and (tipo <> 'mecanica' or plan_permite('mecanica')) and (tipo <> 'neumaticos' or plan_permite('neumaticos'))) or soy_superadmin());" \
  R42 "R42a un tenant SIN la feature convirtió un service en caja por UPDATE"
correr_marcada "guardar_service como security definer" guardar_service "$M" \
  "/@invoker/s/set search_path = public/security definer set search_path = public/" R42 "R42a un tenant SIN la feature cargó un service de caja por la RPC"

echo "── R42b · los CHECK, de a una condición ──"
correr "caja_coherente sin exigir los kilómetros" "$(caja_sin "kilometros is not null")" R42 "R42b entró sin kilómetros"
correr "caja_coherente sin exigir el aceite" "$(caja_sin "aceite_tipo is not null")" R42 "R42b entró sin aceite de caja"
correr "caja_coherente sin exigir el próximo de caja" "$(caja_sin "prox_caja_km is not null")" R42 "R42b entró sin próximo de caja"
correr "caja_coherente sin exigir el próximo mayor que los km" "$(caja_sin "prox_caja_km > kilometros")" R42 "R42b entró con el próximo de caja igual a los kilómetros"
correr "caja_coherente aceptando un próximo service de aceite" "$(caja_sin "prox_service_km is null")" R42 "R42b entró con próximo service de aceite"
correr "caja_coherente aceptando una descripción de mecánica" "$(caja_sin "trabajo_descripcion is null")" R42 "R42b entró con descripción de mecánica"
correr "el espejo abierto al service" "$(espejo_abierto_a service)" R42 "R42b entró un SERVICE con próximo de caja"
correr "el espejo abierto a la mecánica" "$(espejo_abierto_a mecanica)" R42 "R42b entró una MECÁNICA con próximo de caja"
correr "el espejo abierto a los neumáticos" "$(espejo_abierto_a neumaticos)" R42 "R42b entró un trabajo de NEUMÁTICOS con próximo de caja"
correr "el CHECK del vínculo abierto a la caja" \
  "alter table services drop constraint cargado_con_solo_mecanica; alter table services add constraint cargado_con_solo_mecanica check (cargado_con_id is null or tipo in ('mecanica', 'caja'));" \
  R42 "R42b una caja quedó «cargada con» un service"

echo "── R42c · la rama de guardar_service ──"
correr_marcada "los renglones de la caja con el «cambiado» del jsonb" guardar_service "$M" \
  "/@caja-hecho/s/jsonb_build_object('cambiado', true)/jsonb_build_object()/" R42 "de los 4 renglones quedaron como HECHOS"
correr_marcada "el aceite de caja que no baja del stock" guardar_service "$M" \
  "/@caja-stock-aceite/s/where p.id = p_aceite_producto_id/where p.id is null/" R42 "R42c el stock del ATF a granel quedó en 20"
correr_marcada "el salto sin piso (entra un 19.999)" guardar_service "$M" \
  "/@caja-salto/s/between 20000 and/between 1 and/" R42 "R42c un salto de 19.999 km no se rechazó"
correr_marcada "el salto sin techo (entra un 200.001)" guardar_service "$M" \
  "/@caja-salto/s/and 200000 then/and 9000000 then/" R42 "R42c un salto de 200.001 km no se rechazó"
correr_marcada "el piso del salto pasado de rosca (20.000 ya no entra)" guardar_service "$M" \
  "/@caja-salto/s/between 20000 and/between 20001 and/" R42 "R42c un salto de 20.000 km clavados fue rechazado"
correr_marcada "el techo del salto pasado de rosca (200.000 ya no entra)" guardar_service "$M" \
  "/@caja-salto/s/and 200000 then/and 199999 then/" R42 "R42c un salto de 200.000 km clavados fue rechazado"
# Las dos que siguen las frena la TABLA (caja_coherente y
# aceite_tipo_no_vacio), pero con un error que el front no traduce: el
# bloque las acusa porque el error que llega no es el nombrado.
correr_marcada "la caja sin kilómetros sin su error nombrado" guardar_service "$M" \
  "/@caja-km/s/p_kilometros is null or p_kilometros < 0/false/" R42 "R42c una caja SIN kilómetros no se rechazó con caja_sin_kilometros"
correr_marcada "el aceite de una letra sin su error nombrado" guardar_service "$M" \
  "/@caja-aceite/s/< 2 then/< 0 then/" R42 "R42c una caja con el aceite «x» no se rechazó con aceite_caja_requerido"
# Sin la rama, la caja cae en la del service y nace como un service sin
# próximo: la frena service_completo, con el error crudo.
correr_marcada "guardar_service sin la rama de la caja" guardar_service "$M" \
  "s/elsif p_tipo = 'caja' then/elsif p_tipo = 'caja' and false then/" R42 "R42a sin la feature, la caja se rechazó con OTRO error"

echo "── R42d · la edición y el plazo ──"
correr_marcada "al editar, el «cambiado» del jsonb en un renglón que ya estaba" actualizar_service "$M" \
  "/@caja-edita-hecho\$/s/cambiado    = true,/cambiado    = coalesce((v_item->>'cambiado')::boolean, true),/" R42 "R42d al editar, 0 de los 2 renglones quedaron como HECHOS"
correr_marcada "al editar, el «cambiado» del jsonb en un renglón nuevo" actualizar_service "$M" \
  "/@caja-edita-hecho-nuevo/s/true,/coalesce((v_item->>'cambiado')::boolean, true),/" R42 "R42d un renglón prendido AL EDITAR no quedó como hecho"
correr_marcada "la edición sin validar el salto" actualizar_service "$M" \
  "/@caja-edita-salto/s/between 20000 and/between 1 and/" R42 "R42d la edición aceptó un salto de 10.000 km"
correr_marcada "la edición que no escribe el próximo de caja" actualizar_service "$M" \
  "/@caja-edita-proximo/s/= p_prox_caja_km,/= prox_caja_km,/" R42 "R42d actualizar_service no editó la caja"
correr_marcada "la edición que no sincroniza los renglones" actualizar_service "$M" \
  "/@caja-edita-sincroniza/s/and si.item_tipo not in (/and false and si.item_tipo not in (/" R42 "R42d la edición no sincronizó los renglones por tipo"
# Las dos que siguen las frena la tabla, con el error crudo.
correr_marcada "la edición con el aceite de una letra sin su error nombrado" actualizar_service "$M" \
  "/@caja-edita-aceite/s/< 2 then/< 0 then/" R42 "aceite_tipo_no_vacio"
correr_marcada "la caja editada por la rama del service" actualizar_service "$M" \
  "s/if v_tipo = 'caja' then/if v_tipo = 'caja' and false then/" R42 "caja_coherente"
correr_marcada "la caja a 7 días (el plazo de la mecánica que se contagia)" plazo_edicion "$M" \
  "/@plazo-caja/s/interval '24 hours'/interval '7 days'/" R42 "R42d plazo_edicion('caja') es 7 days"
# Sin plazo (el case no tiene else): los renglones no entran —la ventana de
# items_escritura da null— y la caja no se puede ni cargar. R35a también lo ve.
correr_marcada "la caja afuera del case de plazo_edicion" plazo_edicion "$M" \
  "/@plazo-caja/d" R42 "R42c con la feature prendida, un service de caja NO se pudo cargar"

echo "── R42e · vista_proximos_caja ──"
correr_marcada "la última «caja» sin filtrar por tipo" vista_proximos_caja "$M" \
  "/@ultimo-caja/s/where s.tipo = 'caja' and not s.anulado/where not s.anulado/" R42 "R42e la proyección del auto A"
correr_marcada "una caja anulada como la última" vista_proximos_caja "$M" \
  "/@ultimo-caja/s/where s.tipo = 'caja' and not s.anulado/where s.tipo = 'caja'/" R42 "R42e una caja ANULADA sigue contando"
correr_marcada "el km/día medido solo con las cajas" vista_proximos_caja "$M" \
  "/@ritmo-todos/s/and s.kilometros is not null/and s.kilometros is not null and s.tipo = 'caja'/" R42 "R42e el auto con dos services y una caja"
correr_marcada "el último odómetro leído solo de las cajas" vista_proximos_caja "$M" \
  "/@odometro-todos/s/and s.kilometros is not null/and s.kilometros is not null and s.tipo = 'caja'/" R42 "R42e el auto con dos services y una caja"
correr_marcada "el vencido corrido a 30 días" vista_proximos_caja "$M" \
  "/@vencido/s/current_date - 15/current_date - 30/" R42 "R42e la proyección del auto A"
correr_marcada "el urgente achicado a 3 días" vista_proximos_caja "$M" \
  "/@urgente/s/current_date + 7/current_date + 3/" R42 "R42e con el próximo de caja a 7 días la vista dice «proximo»"
correr_marcada "la ventana agrandada a 60 días" vista_proximos_caja "$M" \
  "/@ventana/s/current_date + 30/current_date + 60/" R42 "R42e un próximo de caja estimado para dentro de 31 días aparece"
correr_marcada "la ventana achicada a 20 días" vista_proximos_caja "$M" \
  "/@ventana/s/current_date + 30/current_date + 20/" R42 "R42e con el próximo de caja a 30 días"
correr_marcada "sin horizonte (el vencido hace 600 días sigue)" vista_proximos_caja "$M" \
  "/@horizonte/d" R42 "R42e una caja vencida hace 600 días sigue en la lista"
correr_marcada "el horizonte achicado a 12 meses" vista_proximos_caja "$M" \
  "/@horizonte/s/18 months/12 months/" R42 "R42e una caja vencida hace 500 días no aparece"
# La lectura literal del pedido («horizonte de 18 meses igual que la de
# services»): el corte sobre la fecha de la ÚLTIMA CAJA. Con un ciclo de
# 80.000 km el auto sale de la lista años antes de que le toque volver.
correr_marcada "el horizonte sobre la fecha de la última caja (como en services)" vista_proximos_caja "$M" \
  "/@horizonte/s/c.fecha_estimada >=/c.ultimo_service_fecha >=/" R42 "R42e el auto con UNA sola caja, de hace cinco años y medio"
correr_marcada "el anti-spam por estado (el contacto de un service tilda la caja)" vista_proximos_caja "$M" \
  "/@antispam-caja/s/co.estado = 'caja'/co.estado = c.estado/" R42 "R42e el contacto de un SERVICE (estado vencido) tildó la fila de caja"
correr_marcada "el anti-spam sin ciclo (el aviso viejo tilda la caja nueva)" vista_proximos_caja "$M" \
  "s/and co.created_at > c.ultimo_creado/and true/" R42 "R42e una caja NUEVA no reabrió el contacto"
correr_marcada "la vista sin la feature como puerta" vista_proximos_caja "$M" \
  "/@gate-caja/s/and plan_permite('caja');/and true;/" R42 "R42e un superadmin ve"

echo "── R42f · el cambio de aceite no se entera ──"
correr_vista "vista_proximos_service sin el filtro de tipo" vista_proximos_service \
  "s/ AND (s.tipo = 'service'::tipo_trabajo)//g" R42 "R42f · RETENCIÓN ROTA"
correr_vista "vista_vehiculos contando la caja como service" vista_vehiculos \
  "s/ AND (s.tipo = 'service'::tipo_trabajo)//g" R42 "R42f vista_vehiculos cuenta la caja como service"

echo "── R42g · el premio ──"
correr_marcada "premio_disponible contando la caja con alcance services" premio_disponible "$M_IM" \
  "s/(pv.alcance = 'todos' or s.tipo = 'service')/(pv.alcance = 'todos' or s.tipo in ('service', 'caja'))/" R42 "R42g con alcance «services» una caja sumó"
correr_marcada "ciclos_fidelizacion contando la caja con alcance services (la copia que se olvida)" ciclos_fidelizacion "$M_IM" \
  "s/(pa.alcance = 'todos' or s.tipo = 'service')/(pa.alcance = 'todos' or s.tipo in ('service', 'caja'))/" R42 "R42g con alcance «services» una caja sumó"

echo "── R42h · el cartón y los contadores ──"
correr_marcada "get_carton sin el próximo de caja" get_carton "$M" \
  "/@prox-caja/d" R42 "R42h get_carton devuelve 3 trabajo(s) del auto A y 0 traen la clave"
correr_marcada "cajas_mes del Inicio contando todos los tipos" resumen_inicio "$M" \
  "/@cajas-mes\$/s/where tipo = 'caja' and not anulado/where not anulado/" R42 "R42h resumen_inicio().cajas_mes subió"
correr_marcada "cajas_mes del Inicio contando las anuladas" resumen_inicio "$M" \
  "/@cajas-mes\$/s/where tipo = 'caja' and not anulado/where tipo = 'caja'/" R42 "R42h resumen_inicio().cajas_mes subió"
correr_marcada "cajas_mes del Inicio sin el corte del mes" resumen_inicio "$M" \
  "/@cajas-mes-corte/s/and fecha >= date_trunc('month', current_date)/and true/" R42 "R42h resumen_inicio().cajas_mes subió"
correr_marcada "la plataforma sin contar las cajas" metricas_plataforma "$M" \
  "/@serie_caja/s/where s.tipo = 'caja'/where false/" R42 "R42h metricas_plataforma() contó 0 caja(s) del mes"
correr_marcada "la plataforma contando todos los trabajos como cajas" metricas_plataforma "$M" \
  "/@serie_caja/s/where s.tipo = 'caja'/where true/" R42 "R42h metricas_plataforma() contó"
correr_marcada "la plataforma contando la caja como service" metricas_plataforma "$M" \
  "/as svc,/s/where s.tipo = 'service'/where s.tipo in ('service', 'caja')/" R42 "R42h en"
correr_marcada "cajas_mes de la plataforma sin el corte del mes" metricas_plataforma "$M" \
  "/where d.fecha >= date_trunc/s/where d.fecha >= date_trunc('month', current_date)::date/where true/" R42 "R42h metricas_plataforma() contó"

echo "── R42i · el badge y las plantillas ──"
correr_marcada "el badge sin la cuarta fuente" contactos_por_hacer "$M" \
  "/@badge-caja/s/plan_permite('caja')/false/" R42 "R42i el badge no suma la cuarta fuente"
correr_marcada "la siembra sin la cuarta plantilla" sembrar_templates "$M" \
  "s/'{nombre}, tu {vehiculo} necesita el service de caja en {proximo_km} km. Escribinos y te damos turno.',/null,/" R42 "R42i la siembra dejó 3 tonos: 2 con el texto de caja"
correr_marcada "el backfill que pisa lo personalizado" completar_templates_caja "$M" \
  "/@completar-solo-null/s/and t.contenido_caja is null;/and true;/" R42 "R42i completar_templates_caja() completó"
correr "el backfill que no corrió" \
  "update mensaje_templates set contenido_caja = null;" R42 "plantilla(s) sin contenido_caja"

echo
if [ "$fallas" -eq 0 ]; then
  echo "La red atrapó las $total roturas."
else
  echo "ALGUNA ROTURA SE ESCAPÓ (de $total). La red no cubre lo que dice cubrir."
fi
exit $fallas
