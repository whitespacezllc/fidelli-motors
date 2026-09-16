#!/bin/bash
# La rotura a mano de R21g y R26 (regla 13): cada afirmación se corre con SU
# rotura —la regla exacta que dice cubrir— y tiene que ponerse en ROJO.
# Una prueba que nunca se vio fallar es una prueba que no existe.
#
#   R21g · LA RAMA DEL QUE NUNCA PAGÓ, movida de lugar. Es la rotura más
#          importante del bloque y la que ninguna otra red podía atrapar:
#          la rama está guardada por `p_nunca_pago` y las catorce llamadas
#          de R21a/b/c pasan cinco argumentos, así que se la puede poner en
#          CUALQUIER lado y las diez roturas del reloj siguen en verde.
#          Se prueba movida abajo del borde de la gracia (con lo que el
#          tenant nuevo la atraviesa igual) y borrada del todo.
#   R21g · El `>` cambiado por `>=`: el plazo se corta a medianoche y un
#          alta a las 23:50 tiene diez minutos. Es D2 entero.
#   R21g · El tercer interruptor prendido antes de tiempo, y el tercer
#          interruptor comiéndose la gracia de TODOS (no solo del que nunca
#          pagó), que es el pasado de rosca.
#   R26a · El alta que no escribe `cobranza_desde`, la que nace en trial, y
#          la que le prende el reloj a TODOS —que es la forma en que este
#          cambio haría daño de verdad: 16 tenants adentro de golpe.
#   R26b · El ciclo del primer pago: sin la condición de "y tarde" (con lo
#          que un cliente viejo pierde días en su renovación) y sin correr
#          nada (con lo que el tenant nuevo pierde los días que tardó).
#   R26c · La puerta manual que se olvidó del cambio.
#   R26d · La función de la cuarta pantalla como invoker.
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
M_CICLO=supabase/migrations/20260917130000_primer_pago_define_el_ciclo.sql
M_ALTA=supabase/migrations/20260917140000_alta_prende_el_reloj.sql
M_PAGO=supabase/migrations/20260917150000_pago_en_el_onboarding.sql

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

echo "── R21g · la rama del que nunca pagó ──"
# ⚠ LA ROTURA CENTRAL DEL BLOQUE. La rama se mueve DEBAJO del borde de la
# gracia. No desaparece —el tenant termina bloqueado igual, tarde— pero
# atraviesa la ventana de gracia entera por el camino, que es exactamente lo
# que D1 prohíbe: siete días diciéndole "tu plan venció, te quedan 5 días" a
# alguien que es cliente hace 48 horas. Ninguna otra rotura del repo la ve.
correr_marcada "la rama movida abajo del borde de la gracia" estado_cobranza "$M_ALTA" \
  "/@sin_pagos/s/p_nunca_pago and current_date > p_vencimiento/p_nunca_pago and current_date > p_vencimiento + dias_de_gracia()/" R21g "R21g"
correr_marcada "la rama borrada (el que nunca pagó vuelve a tener gracia)" estado_cobranza "$M_ALTA" \
  "/@sin_pagos/s/p_nunca_pago and/false and/" R21g "R21g"

echo "── R21g · el plazo y el redondeo a favor del cliente ──"
correr_marcada "el plazo cortado a medianoche (>= en vez de >)" estado_cobranza "$M_ALTA" \
  "/@sin_pagos/s/current_date > p_vencimiento/current_date >= p_vencimiento/" R21g "R21g"

echo "── R21g · el tercer interruptor ──"
correr_marcada "prendido antes de que entre un pago real" bloqueo_de_alta_activo "$M_ALTA" \
  "/@bloqueo_alta/s/select false/select true/" R21g "R21g"
# Pasado de rosca: el interruptor del alta gobernando TAMBIÉN la gracia del
# que sí pagó. No rompe al tenant nuevo —lo bloquea igual— pero le saca los
# siete días de gracia a los 17 clientes de verdad.
correr "el interruptor del alta comiéndose la gracia de todos" \
  "create or replace function bloqueo_de_alta_activo() returns boolean language sql immutable parallel safe as \$f\$ select true; \$f\$;
   create or replace function estado_cobranza(p_activo boolean, p_vencimiento date, p_desde date,
     p_suspension boolean, p_descuento_pct numeric, p_nunca_pago boolean default false)
   returns text language sql stable set search_path = public as \$f\$
     select case
       when not p_activo then 'suspendido'
       when p_descuento_pct >= 100 then 'al_dia'
       when p_desde is null or current_date < p_desde then 'al_dia'
       when p_vencimiento is null then 'al_dia'
       when current_date > p_vencimiento
         then case when bloqueo_de_alta_activo() then 'suspendido' else 'por_vencer' end
       when p_vencimiento <= current_date + dias_de_aviso() then 'por_vencer'
       else 'al_dia' end;
   \$f\$;" \
  R21g "R21g"

echo "── R26a · el alta ──"
correr_marcada "el alta sin cobranza_desde" crear_lubricentro "$M_ALTA" \
  "/@alta_reloj/s/current_date)/null)/" R26 "R26a"
correr_marcada "el alta que vuelve a nacer en trial" crear_lubricentro "$M_ALTA" \
  "s/v_id, p_plan_id, 'activa', p_periodo/v_id, p_plan_id, 'trial', p_periodo/" R26 "R26a"
correr_marcada "el alta con el vencimiento a 30 días en vez de a uno" crear_lubricentro "$M_ALTA" \
  "/@alta_reloj/s/current_date + 1 /current_date + 30/" R26 "R26a"
# El daño de verdad: el alta prendiéndole el reloj a TODOS. Es el UPDATE
# peligroso que este bloque vino a hacer innecesario, escrito adentro del
# alta.
correr "el alta que le prende el reloj a todos" \
  "create or replace function alta_prende_todo() returns trigger language plpgsql as \$f\$
   begin update lubricentros set cobranza_desde = current_date where cobranza_desde is null and slug <> 'demo'; return new; end \$f\$;
   create trigger alta_prende_todo_tg after insert on suscripciones for each row execute function alta_prende_todo();" \
  R26 "R26a"

echo "── R26b · el ciclo del primer pago ──"
correr_marcada "el primer pago que no corre nada" ciclo_tras_el_pago "$M_CICLO" \
  "/@primer_pago/,\$s/p_es_el_primero and p_fecha_pago > p_venc_actual/false/" R26 "R26b"
# Sin la condición "y tarde": le recorta el ciclo a un cliente viejo del que
# nunca registramos un pago, en su próxima renovación. Es el caso que se vio
# en rojo escribiendo esto.
correr_marcada "sin la condición «y tarde» (recorta al que paga en plazo)" ciclo_tras_el_pago "$M_CICLO" \
  "/@primer_pago/,\$s/p_es_el_primero and p_fecha_pago > p_venc_actual/p_es_el_primero/" R26 "R26b"

echo "── R26c · las dos puertas ──"
# La puerta manual llamando a `ciclo_tras_el_pago` con `false` en el primer
# argumento: el cálculo sigue existiendo, la función sigue siendo correcta, y
# el ciclo no se corre nunca. Es la forma silenciosa de romperlo — la que
# ningún `sed` sobre la regla podría atrapar, porque la regla no cambia.
correr "la puerta manual que llama con «no es el primero»" \
  "$(awk '/^create or replace function registrar_pago\(/,/^\$\$;$/' "$M_CICLO" \
     | sed 's/from ciclo_tras_el_pago(v_primero, v_inicio, v_vencimiento, p_fecha_pago,/from ciclo_tras_el_pago(false, v_inicio, v_vencimiento, p_fecha_pago,/')" \
  R26 "R26c"

echo "── R26d · la cuarta pantalla ──"
correr_marcada "la función de la marca como invoker" marcar_pago_presentado "$M_PAGO" \
  "s/^security definer$//" R26 "R26d"

exit $fallas
