#!/bin/bash
# La rotura a mano de R25 (regla 13): cada afirmación se corre con SU rotura
# —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
# Hasta 20261031100000 este bloque vigilaba que NADA pasara (el interruptor
# apagado). Desde el CVU dedicado vigila la CUENTA DE COBRO del tenant: el
# alias, el número de CVU y el id de Cresium, escritos juntos por
# fijar_cvu_de_tenant() y nunca de a uno.
#
#   R25a · El interruptor APAGADO (ningún tenant recibe su cuenta); la
#          puerta vieja (alias solo) que vuelve a escribir —la frena el
#          CHECK, segunda defensa— y la misma con el CHECK borrado; y el
#          CHECK alias_con_cvu borrado solo.
#   R25b · fijar_cvu_de_tenant sin la guarda de superadmin.
#   R25c · El candado del alias vaciado, el del CVU vaciado, el candado
#          pasado de rosca (bloquea todo) y el que mira la columna
#          equivocada (se come el ABM).
#   R25d · Los tres índices únicos borrados, de a uno.
#   R25e · El formato abierto a mayúsculas y guiones, los dos largos
#          corridos, y el CVU de 21 dígitos: la puerta que no lo mira
#          (lo frena el CHECK cvu_formato, con OTRO error) y la puerta Y
#          el CHECK.
#   R25f · El alta que se traga el error del alias y crea el tenant igual.
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
M=supabase/migrations/20260917120000_alias_por_tenant.sql
# La cuenta de cobro (el interruptor prendido, fijar_cvu_de_tenant, el
# candado del CVU) vive en 20261031100000.
M_CVU=supabase/migrations/20261031100000_cvu_dedicado.sql
# ⚠ `crear_lubricentro` SE REDEFINIÓ OTRA VEZ en 20260917140000 (el alta que
# prende el reloj, sin p_dias_trial). Extraerla del archivo viejo reinstala
# la firma de ocho parámetros y deja una sobrecarga.
M_ALTA=supabase/migrations/20260917140000_alta_prende_el_reloj.sql

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
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = archivo · $4 = sed · $5 = bloque · $6 = patrón
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

# La puerta vieja volviendo a escribir el alias solo: es la forma en que
# estaba hasta 20261031100000, y la más fácil de «restaurar» por error.
PUERTA_VIEJA="create or replace function fijar_alias_de_tenant(p_lubricentro uuid, p_alias text)
   returns text language plpgsql volatile set search_path = public as \$f\$
   declare v_alias text := lower(trim(coalesce(p_alias, '')));
   begin
     if not soy_superadmin() then raise exception 'sin_permiso' using errcode = '42501'; end if;
     if v_alias = '' then raise exception 'alias_vacio'; end if;
     update lubricentros set cresium_alias = v_alias, cresium_alias_asignado_at = now()
      where id = p_lubricentro and cresium_alias is null;
     if not found then raise exception 'alias_ya_asignado'; end if;
     return v_alias;
   end \$f\$;"

echo "── R25a · el interruptor y los tres juntos ──"
correr_marcada "el interruptor apagado (ningún tenant recibe su cuenta)" alias_confirmado_por_cresium "$M_CVU" \
  "/@alias_confirmado/s/select true/select false/" R25 "R25a"
# Con el CHECK en pie, la puerta vieja escribe el alias solo y el CHECK la
# frena: el bloque se pone en rojo con el error de la SEGUNDA defensa.
correr "la puerta vieja que vuelve a escribir el alias solo (la frena el CHECK)" \
  "$PUERTA_VIEJA" R25 "alias_con_cvu"
correr "la puerta vieja que escribe + el CHECK borrado" \
  "alter table lubricentros drop constraint alias_con_cvu; $PUERTA_VIEJA" R25 "R25a LA PUERTA VIEJA ESCRIBIÓ"
correr "el CHECK alias_con_cvu borrado" \
  "alter table lubricentros drop constraint alias_con_cvu;" R25 "R25a UN ALIAS SIN CVU ENTRÓ"

echo "── R25b · la puerta nueva ──"
correr_marcada "fijar_cvu_de_tenant sin la guarda de superadmin" fijar_cvu_de_tenant "$M_CVU" \
  "/@cvu_guard/s/if not soy_superadmin() then/if false then/" R25 "R25b UN OWNER"

echo "── R25c · inmutables ──"
correr_marcada "el candado del alias vaciado" bloquear_cambio_de_alias "$M" \
  "/@alias_inmutable/s/old.cresium_alias is not null/false/" R25 "R25c EL ALIAS"
correr_marcada "el candado del CVU vaciado" bloquear_cambio_de_cvu "$M_CVU" \
  "/@cvu_inmutable/s/(old.cresium_cvu is not null and new.cresium_cvu is distinct from old.cresium_cvu)/false/" R25 "R25c EL CVU"
# Con `true` el candado bloquea CUALQUIER update, incluido el de la propia
# puerta, así que R25b revienta antes de llegar al contra-chequeo: el rojo
# llega igual y llega antes, pero con el nombre del error y no con una letra.
correr_marcada "el candado que bloquea todo update (se lleva puesta la puerta)" bloquear_cambio_de_alias "$M" \
  "/@alias_inmutable/s/old.cresium_alias is not null/true/" R25 "alias_inmutable"
# Y la versión que SÍ llega al contra-chequeo: mira la columna equivocada.
# (En la segunda línea de la condición y no en la marcada: `A or B and C`
# bloquea todo update del tenant con alias, y eso lo atrapa el caso de
# arriba; `A and C or B` es el que deja pasar la cuenta y frena el nombre.)
correr_marcada "el candado mirando la columna equivocada (se come el ABM)" bloquear_cambio_de_alias "$M" \
  "s/and new.cresium_alias is distinct from old.cresium_alias/and new.cresium_alias is distinct from old.cresium_alias or new.nombre is distinct from old.nombre/" R25 "R25c EL CANDADO SE COMIÓ"

echo "── R25d · la unicidad ──"
# ⚠ NO HAY ROTURA DEL `where` DE LOS ÍNDICES, y es a propósito: sacarlo NO
# rompe nada. Dos NULL nunca colisionan en un unique de Postgres. Escribir
# una rotura para eso sería una rotura que no rompe nada — o sea, una prueba
# que miente sobre lo que cubre. ⚠ TAMPOCO DEL `lower()` del índice del
# alias: el CHECK alias_formato rechaza las mayúsculas antes.
correr "el índice único del alias borrado" \
  "drop index lubricentros_cresium_alias_key;" R25 "R25d: dos tenants se quedaron con el mismo alias"
correr "el índice único del CVU borrado" \
  "drop index lubricentros_cresium_cvu_key;" R25 "R25d: dos tenants se quedaron con el mismo CVU"
correr "el índice único del id de Cresium borrado" \
  "drop index lubricentros_cresium_deposit_address_key;" R25 "R25d: dos tenants se quedaron con el mismo id"

echo "── R25e · el formato y los largos ──"
correr_marcada "el formato abierto a mayúsculas y guiones" alias_formato_valido "$M" \
  "/@alias_formato/s|'\^\[a-z0-9\]+(\\\\\\.\[a-z0-9\]+)\*\$'|'^[A-Za-z0-9.-]+$'|" R25 "R25e"
correr_marcada "el mínimo bajado a 1" alias_largo_minimo "$M" \
  "/@alias_min/s/select 6/select 1/" R25 "R25e"
correr_marcada "el máximo subido a 40 (el banco del dueño lo rechaza)" alias_largo_maximo "$M" \
  "/@alias_max/s/select 20/select 40/" R25 "R25e"
# La puerta que no mira el CVU: lo frena el CHECK de la tabla, con OTRO
# error (check_violation, no el P0001 que el bloque traduce). El bloque se
# pone en rojo igual, por la segunda defensa.
correr_marcada "la puerta que no mira el largo del CVU (la frena el CHECK)" fijar_cvu_de_tenant "$M_CVU" \
  "/@cvu_vacio/s/if v_cvu !~ '\^\[0-9\]{22}\$' then/if false then/" R25 'check constraint "cvu_formato"'
PUERTA_SIN_CVU=$(bloque fijar_cvu_de_tenant "$M_CVU" | sed "/@cvu_vacio/s/if v_cvu !~ '\^\[0-9\]{22}\$' then/if false then/")
correr "la puerta que no mira el CVU + el CHECK cvu_formato borrado" \
  "alter table lubricentros drop constraint cvu_formato; $PUERTA_SIN_CVU" R25 "R25e SE ACEPTÓ UN CVU DE 21"

echo "── R25f · el alta ──"
# El alta que se traga el error del alias: el tenant se crea igual, «sin el
# alias que le pidieron», que es el modo de falla clásico.
correr_funcion_alta() {
  local orig roto
  orig=$(awk '/^create or replace function crear_lubricentro\(/,/^\$\$;$/' "$M_ALTA")
  roto=$(printf '%s\n' "$orig" | sed \
    "s/    perform fijar_alias_de_tenant(v_id, p_alias);/    begin perform fijar_alias_de_tenant(v_id, p_alias); exception when others then null; end;/")
  if [ -z "$orig" ]; then
    echo "  ✗ el alta que se traga el error del alias — no encontré crear_lubricentro en $M_ALTA"; fallas=1; return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ el alta que se traga el error del alias — EL SED NO MORDIÓ."; fallas=1; return
  fi
  correr "el alta que se traga el error del alias" "$roto" R25 "R25f EL ALTA CON ALIAS PASÓ"
}
correr_funcion_alta

exit $fallas
