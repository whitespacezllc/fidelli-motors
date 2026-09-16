#!/bin/bash
# La rotura a mano de R25 (regla 13): cada afirmación se corre con SU rotura
# —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
# Este bloque es distinto de los otros seis y conviene decirlo: la mitad de
# lo que R25 vigila es que NADA PASE mientras Cresium no conteste. Una
# conducta que consiste en no hacer nada es exactamente la que se rompe sin
# que nadie se entere, así que la primera rotura es la más importante de
# todas: prender el interruptor.
#
#   R25a · EL INTERRUPTOR PRENDIDO. Es el invariante del sprint: mientras no
#          sepamos el largo máximo, el formato exacto y el tope de cambios
#          por CVU, ningún tenant recibe alias. Un alias asignado con el
#          formato equivocado no se corrige barato.
#   R25a · Y la puerta que escribe igual aunque el interruptor esté apagado
#          (el chequeo movido al final, después de validar la forma).
#   R25c · El candado del alias vaciado, y el candado pasado de rosca, que
#          se come el ABM entero de /fidelli.
#   R25d · El índice único borrado: la puerta normaliza, pero lo que no pasa
#          por la puerta —un UPDATE directo— solo lo frena el índice.
#   R25e · El formato abierto a mayúsculas y guiones (que NO están medidos
#          contra Cresium), y los dos largos corridos.
#   R25f · El alta que se guarda el tenant aunque el alias falle.
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
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = sed · $4 = bloque · $5 = patrón
  local orig roto
  orig=$(bloque "$2" "$M")
  roto=$(printf '%s\n' "$orig" | sed "$3")
  if [ -z "$orig" ]; then
    echo "  ✗ $1 — no encontré el bloque «$2» en $M"; fallas=1; return
  fi
  if [ "$orig" = "$roto" ]; then
    echo "  ✗ $1 — EL SED NO MORDIÓ: la rotura no se aplicó, así que el verde no significa nada."
    fallas=1; return
  fi
  correr "$1" "$roto" "$4" "$5"
}

echo "── R25a · el interruptor, que es TODO el sprint ──"
correr_marcada "el interruptor prendido antes de que Cresium conteste" alias_confirmado_por_cresium \
  "/@alias_confirmado/s/select false/select true/" R25 "R25a"
# La otra forma de romperlo, y la más verosímil: el chequeo sigue estando
# pero se corre DESPUÉS de validar la forma. Un alias mal formado se
# rechazaría igual, así que la mitad de las pruebas seguiría en verde — y
# uno bien formado entraría.
correr "el chequeo del interruptor movido al final de la puerta" \
  "create or replace function fijar_alias_de_tenant(p_lubricentro uuid, p_alias text)
   returns text language plpgsql volatile set search_path = public as \$f\$
   declare v_alias text := lower(trim(coalesce(p_alias, '')));
   begin
     if not soy_superadmin() then raise exception 'sin_permiso' using errcode = '42501'; end if;
     if v_alias = '' then raise exception 'alias_vacio'; end if;
     if char_length(v_alias) < alias_largo_minimo() or char_length(v_alias) > alias_largo_maximo()
       then raise exception 'alias_largo'; end if;
     if not alias_formato_valido(v_alias) then raise exception 'alias_formato'; end if;
     update lubricentros set cresium_alias = v_alias, cresium_alias_asignado_at = now()
      where id = p_lubricentro and cresium_alias is null;
     if not found then raise exception 'alias_ya_asignado'; end if;
     return v_alias;
   end \$f\$;" \
  R25 "R25a"

echo "── R25c · el alias inmutable ──"
correr_marcada "el candado del alias vaciado" bloquear_cambio_de_alias \
  "/@alias_inmutable/s/old.cresium_alias is not null/false/" R25 "R25c"
# Con `true` el candado bloquea CUALQUIER update, incluido el de la propia
# puerta, así que R25b revienta antes de llegar al contra-chequeo: el rojo
# llega igual y llega antes, pero con el nombre del error y no con una letra.
correr_marcada "el candado que bloquea todo update (se lleva puesta la puerta)" bloquear_cambio_de_alias \
  "/@alias_inmutable/s/old.cresium_alias is not null/true/" R25 "alias_inmutable"
# Y la versión que SÍ llega al contra-chequeo: mira la columna equivocada.
# Deja pasar la asignación (que no toca el nombre) y se come el ABM de
# /fidelli — editar el nombre de un tenant deja de andar, y nadie lo
# relaciona con el alias.
correr_marcada "el candado mirando la columna equivocada (se come el ABM)" bloquear_cambio_de_alias \
  "/@alias_inmutable/s/old.cresium_alias is not null/old.cresium_alias is not null or new.nombre is distinct from old.nombre/" R25 "R25c"

echo "── R25d · la unicidad ──"
# ⚠ NO HAY ROTURA DEL `where` DEL ÍNDICE, y es a propósito: sacarlo NO rompe
# nada. Dos NULL nunca colisionan en un unique de Postgres, así que los 17
# tenants sin alias conviven igual. El `where` está por tamaño. Escribir una
# rotura para eso sería una rotura que no rompe nada — o sea, una prueba que
# miente sobre lo que cubre.
# ⚠ TAMPOCO HAY ROTURA DEL `lower()`, y por la misma razón que arriba: el
# CHECK `alias_formato` rechaza las mayúsculas antes de que el índice llegue
# a opinar, así que sacarle el `lower()` no cambia nada HOY. Queda puesto
# porque el formato exacto es una de las tres preguntas abiertas: el día que
# Cresium conteste que acepta mayúsculas, ese `lower()` pasa a ser lo único
# que evita dos alias que el banco lee igual. Cuando ese día llegue, la
# rotura entra acá.
correr "el índice único borrado del todo" \
  "drop index lubricentros_cresium_alias_key;" R25 "R25d"

echo "── R25e · el formato y los largos ──"
correr_marcada "el formato abierto a mayúsculas y guiones" alias_formato_valido \
  "/@alias_formato/s|'\^\[a-z0-9\]+(\\\\\\.\[a-z0-9\]+)\*\$'|'^[A-Za-z0-9.-]+$'|" R25 "R25e"
correr_marcada "el mínimo bajado a 1" alias_largo_minimo \
  "/@alias_min/s/select 6/select 1/" R25 "R25e"
correr_marcada "el máximo subido a 40 (el banco del dueño lo rechaza)" alias_largo_maximo \
  "/@alias_max/s/select 20/select 40/" R25 "R25e"

echo "── R25f · el alta ──"
# ⚠ LA ROTURA TIENE QUE TOCAR SOLO EL ALTA. Vaciar `fijar_alias_de_tenant()`
# también rompe R25a, que levanta mucho antes: el rojo sería correcto pero
# por otra letra, y la afirmación de R25f seguiría sin verse nunca en rojo.
# Por eso acá se envuelve la llamada del alta en un `exception when others`,
# que es el modo de falla clásico — el alta "termina bien" con un tenant sin
# el alias que le pidieron.
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
  correr "el alta que se traga el error del alias" "$roto" R25 "R25f"
}
correr_funcion_alta

exit $fallas
