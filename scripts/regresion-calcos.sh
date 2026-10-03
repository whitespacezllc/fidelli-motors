#!/bin/bash
# La rotura a mano de R39, R40 y R41 (regla 13): los pedidos de calcos. Cada afirmación
# se corre con SU rotura —la regla exacta que dice cubrir— y tiene que
# ponerse en ROJO. Una prueba que nunca se vio fallar es una prueba que no
# existe.
#
#   R39a · la tabla de transiciones: `pagado → entregado` agregado (se
#          saltea la producción); `entregado` que deja de ser terminal; el
#          filtro de «solo incluidos» sacado (se cancela un pagado que se
#          cobró); el pago a mano y la cancelación de un pagado sin nota;
#          enviado sin seguimiento —lo frena la segunda defensa, el CHECK,
#          y el bloque lo acusa por el error que el front no traduce—;
#          enviado con retiro y listo para retirar con envío; y el diseño
#          que no se actualiza al entrar a producción.
#   R39b · «Entregado» sin escribir en el libro (un id inventado), con la
#          cantidad equivocada, con el monto en cero.
#   R39c · el índice de «un pendiente por tenant» borrado; el mismo índice
#          sin el `where` (un tenant no puede volver a pedir nunca); y la
#          puerta que no traduce el choque.
#   R39d · INSERT/UPDATE por tabla abiertos al owner; el costo grantado (del
#          encargo y del catálogo); las policies de lectura sin el tenant
#          (encargos, diseños, auditoría de precios, bucket); la subida al
#          bucket abierta; y la guarda de cada puerta de Fidelli sacada.
#   R39e · el candado de precios apagado por tres lados (el `if`, solo el
#          precio y no el costo, el trigger deshabilitado) y pasado de
#          rosca; el motivo —las DOS defensas a la vez, porque sacando una
#          el CHECK de la auditoría frena igual—; la auditoría que no se
#          escribe y la que se escribe siempre; la bandera que queda
#          prendida; y un trigger que «sincroniza» los pedidos abiertos con
#          el catálogo (los montos dejan de estar congelados).
#   R39f · resumen_admin().calcos: esperando que cuenta también lo que ya
#          se está produciendo; atrasados en días corridos y con el corte
#          corrido; por vencer con la ventana corrida para los dos lados; la
#          cola con los pagados al fondo, sin el filtro del tenant y con la
#          ganancia sin la comisión.
#   R39g · los montos: la comisión en cero, el costo en cero, el incluido
#          que nace sin pagar o sin costo; un extra aceptado como pack y el
#          envío sin dirección (las dos las frena además una segunda
#          defensa: el bloque las acusa por el error sin traducir).
#   R39h · los días hábiles contando el sábado, todos los días, y el día de
#          partida.
#   R39i · los diseños: dos actuales y versiones repetidas (cada una con SUS
#          dos defensas afuera: la puerta y el índice); la ruta en la
#          carpeta de otro tenant; el bucket público.
#   R39j · un precio del catálogo movido; la comisión con otro número.
#   R39k · los cuatro CHECK del encargo, borrados de a uno.
#   R39l · la puerta del owner sin mirar si el tenant está suspendido.
#
# Y LA ROTURA DE R40 (el pago, PR 2):
#
#   R40a · los tres CHECK de `cresium_ordenes`, borrados de a uno.
#   R40b · el pago que no guarda la transacción; y la rama de calcos
#          «unificada» con la renovación, escribiendo una fila en `pagos`.
#   R40c · la idempotencia de calcos sacada.
#   R40d · un PARTIAL que paga.
#   R40e · LA TRAMPA: la rama de calcos sacada —el cast a uuid de la
#          suscripción explota con «calcos»— y el uuid del encargo casteado
#          sin mirarle la forma.
#   R40g · el pedido que no vence nunca, el que vence un día antes, el
#          vencimiento que se lleva lo que no está sin pagar, el de un
#          tenant que vence el de todos; el webhook que no acredita un
#          vencido; y `vencido → pagado` agregado a la tabla de
#          avanzar_encargo_calcos (existe SOLO por el webhook).
#   R40h · el webhook reviviendo cualquier estado.
#   R40i · el mail que se reclama siempre y el soltar que no suelta.
#   R40j · cobranzas_pendientes() y resumen_admin() mirando cualquier orden.
#   R40k · la guarda del mail y la del catálogo sacadas, y la orden
#          escribible por el owner.
#
# Y las de R41 (PR 3: el stock de calcos y el aviso):
#
#   R41a · la cuenta: trabajos en vez de autos; los importados y los
#          anulados contando; los autos de antes de la entrega; la entrega
#          contada por cuándo se cargó y no por su fecha; el stock negativo.
#   R41b · el recuento que no pisa la base; los autos de antes del recuento
#          que siguen descontando; la entrega posterior que no suma y la
#          corrección del libro con fecha vieja que sí; el recuento más
#          viejo ganando; y la puerta: sin validar la cantidad (frena el
#          CHECK, con otro error), sin exigir entregas, escribiendo en el
#          tenant de otro.
#   R41c · null en todo: sin entregas devolviendo ceros, y `calcos_propias`
#          ignorado.
#   R41d · el ritmo sobre toda la historia; con menos de 2 semanas; siempre
#          dividido por 8; y la cobertura con ritmo cero.
#   R41e · los umbrales del aviso corridos de a uno y en las dos direcciones
#          (4 semanas, 1 semana, 20 calcos); el aviso con un pedido abierto;
#          un estado abierto que se cae de la lista y uno cerrado que entra.
#   R41f · los mails: el que se repite al día siguiente; el que cae al
#          escalón anterior; el ciclo que no mira la entrega; «la última
#          entrega» que es la primera; con un pedido abierto; al suspendido;
#          al demo; y la entrega del día contada desde la medianoche.
#   R41g · la lista del hub con el umbral corrido en las dos direcciones,
#          con un pedido abierto, con el suspendido y con el demo; y
#          `sin_stock` que no cuenta la lista.
#   R41h · `calcos_propias`: el candado apagado, deshabilitado y bajado a
#          ORIGIN; la bandera que queda prendida; la puerta sin nota, sin
#          guarda, sin evento y registrando lo que no cambió.
#   R41i · los seis candados de los dos libros bajados a `notice` de a uno y
#          a ORIGIN de a tres; y el unique de emails_calcos borrado.
#   R41k · la guarda del stock sacada, y la misma guarda sin el coalesce (un
#          usuario sin lubricentro la pasa); la decisión de los mails
#          grantada a `authenticated`; las dos funciones de adentro
#          grantadas; la guarda del recuento; y los dos libros con INSERT o
#          con la lectura abiertos al owner.
#
# DOS DE R41 QUE NO ESTÁN, y por qué. Sacarle SOLO la guarda a
# calcos_por_agotarse() no rompe nada: adentro llama a stock_calcos() por
# cada tenant, y esa rechaza al owner en el primero que no es suyo. Y
# abrirle SOLO el UPDATE de `lubricentros` al owner tampoco: el candado de
# `calcos_propias` lo frena igual. Las dos reglas tienen dos defensas; la
# rotura que saca la otra sí está (la guarda del stock, el candado).
#
# DOS QUE NO ESTÁN: grantarle acreditar_deposito_cresium() o
# vencer_encargos_calcos() a `authenticated` no rompe nada. Las dos son
# invoker, y una sesión no puede escribir ni `cresium_eventos` ni
# `encargos_calcos`: el 42501 sale igual, de la tabla en vez de la función.
# Se probó (la segunda se escapaba) y por eso no se escriben.
#
# DOS ROTURAS QUE NO ESTÁN, y por qué: borrar SOLO el índice de «una actual»
# o SOLO el unique de la versión no rompe nada —la puerta ya desmarca la
# anterior y calcula la siguiente—, así que no se escriben: una rotura que
# no rompe nada es una prueba que miente sobre lo que cubre.
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día (supabase db
# reset). No hace falta que la base esté limpia: la única rotura que
# chocaría con pedidos ya cargados (el índice sin `where`) vacía la tabla
# adentro de su propia transacción. DB_CONTAINER cambia el contenedor.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i ${DB_CONTAINER:-supabase_db_fidelli-motors} psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261003120000_encargos_calcos.sql
# El pago (PR 2).
M_PAGO=supabase/migrations/20261003200000_calcos_pago.sql
# El stock (PR 3). `resumen_admin()` se redefinió ahí para ganar
# `calcos.sin_stock`: TODAS las roturas que la muerden (R39f, R40j, R41g) la
# sacan de este archivo. Sacada del anterior, reinstalaría una versión sin
# la clave nueva.
M_STOCK=supabase/migrations/20261003210000_calcos_stock.sql

bloque() { awk "/^-- >>> $1\$/,/^-- <<< $1\$/" "$2"; }

fallas=0
total=0

correr() { # $1 = nombre · $2 = SQL de la rotura · $3 = bloque · $4 = patrón esperado
  local salida
  total=$((total + 1))
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
# $7 (opcional) = SQL extra que va ANTES de la función rota: la segunda
# defensa que hay que sacar para que la primera se vea.
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = patrón · $7 = SQL extra
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
  correr "$1" "${7:-}
$roto" "$5" "$6"
}

echo "── El bloque sano, antes de romper nada ──"
sano=$( { echo "begin;"; bloque R39 "$V"; echo "rollback;"; } | $DB -v ON_ERROR_STOP=1 -f - 2>&1 )
if echo "$sano" | grep -q "ERROR"; then
  echo "  ✗ R39 está en ROJO sin ninguna rotura: lo que sigue no prueba nada."
  echo "$sano" | grep -E "ERROR" | tail -2 | sed 's/^/      /'
  exit 1
fi
echo "  ✓ R39 pasa en verde sobre la base actual"

echo "── R39a · las transiciones ──"
correr_marcada "pagado → entregado agregado a la tabla de transiciones" avanzar_encargo_calcos "$M" \
  "/@t_pagado/s/('pagado',         'en_produccion', false),/('pagado', 'en_produccion', false), ('pagado', 'entregado', false),/" R39 "R39a"
correr_marcada "entregado deja de ser terminal (entregado → cancelado)" avanzar_encargo_calcos "$M" \
  "/@t_ultima/s/('listo_retiro',   'entregado',     false)/('listo_retiro', 'entregado', false), ('entregado', 'cancelado', false)/" R39 "R39a"
correr_marcada "el filtro de «solo incluidos» sacado: se cancela un pagado que se cobró" avanzar_encargo_calcos "$M" \
  "/@t_solo_incluido/s/and (not t.solo_incluido or v.incluido)/and true/" R39 "R39a"
correr_marcada "pagar a mano sin nota" avanzar_encargo_calcos "$M" \
  "/@nota_pago/s/if v_nota is null or char_length(v_nota) < 10 then/if false then/" R39 "R39a"
correr_marcada "cancelar un incluido pagado sin nota" avanzar_encargo_calcos "$M" \
  "/@nota_cancelar/s/if v.estado = 'pagado' and (v_nota is null or char_length(v_nota) < 10) then/if false then/" R39 "R39a"
# La segunda defensa (el CHECK enviado_con_seguimiento) frena igual: el
# bloque se pone en rojo por el error que el front no traduce.
correr_marcada "enviado sin exigir el seguimiento" avanzar_encargo_calcos "$M" \
  "/@seguimiento/s/if v_transportista is null or v_seguimiento is null then/if false then/" R39 "R39a"
correr_marcada "un pedido con retiro marcado enviado" avanzar_encargo_calcos "$M" \
  "/@enviado_solo_envio/s/if v.entrega <> 'envio' then/if false then/" R39 "R39a"
correr_marcada "un pedido con envío marcado listo para retirar" avanzar_encargo_calcos "$M" \
  "/@listo_solo_retiro/s/if v.entrega <> 'retiro' then/if false then/" R39 "R39a"
correr_marcada "el diseño que no se actualiza al entrar a producción" avanzar_encargo_calcos "$M" \
  "/@diseno_al_producir/s/diseno_id = coalesce(/diseno_id = coalesce(diseno_id,/" R39 "R39a"

echo "── R39b · entregado escribe en el libro ──"
correr_marcada "entregado sin escribir en el libro (un id inventado)" avanzar_encargo_calcos "$M" \
  "/@libro\$/s/v_pedido := registrar_pedido_calcos(/v_pedido := gen_random_uuid(); perform concat(/" R39 "R39b"
correr_marcada "la entrega registrada con otra cantidad" avanzar_encargo_calcos "$M" \
  "/@libro_cantidad/s/v.cantidad, v.incluido,/1, v.incluido,/" R39 "R39b"
correr_marcada "la entrega cobrada registrada con monto cero" avanzar_encargo_calcos "$M" \
  "/@libro_monto/s/else v.monto_total end,/else 0 end,/" R39 "R39b"

echo "── R39c · un pedido sin pagar por tenant ──"
correr "el índice único de «un pendiente» borrado" \
  "drop index encargos_calcos_un_pendiente;" R39 "R39c"
correr "el índice sin el where: el tenant no puede volver a pedir nunca" \
  "delete from encargos_calcos; drop index encargos_calcos_un_pendiente; create unique index encargos_calcos_un_pendiente on encargos_calcos (lubricentro_id);" R39 "R39c"
correr_marcada "la puerta que no traduce el choque" crear_encargo_calcos "$M" \
  "/@traduce_pendiente/s/if v_restriccion = 'encargos_calcos_un_pendiente' then/if false then/" R39 "R39c"

echo "── R39d · el owner: ni escribe, ni lee de más ──"
correr "INSERT, UPDATE y DELETE de encargos abiertos al owner" \
  "grant insert, update, delete on encargos_calcos to authenticated; grant usage on sequence encargos_calcos_numero_seq to authenticated; create policy rota on encargos_calcos for all to authenticated using (true) with check (true);" R39 "R39d"
correr "solo el UPDATE de sus propios encargos abierto al owner" \
  "grant update on encargos_calcos to authenticated; create policy rota on encargos_calcos for update to authenticated using (lubricentro_id = mi_lubricentro_id()) with check (true);" R39 "R39d EL OWNER MOVIÓ"
correr "el costo del encargo grantado a authenticated" \
  "grant select on encargos_calcos to authenticated;" R39 "R39d"
correr "el costo del catálogo grantado a authenticated" \
  "grant select on catalogo_calcos to authenticated;" R39 "R39d"
correr "el catálogo editable por tabla" \
  "grant update on catalogo_calcos to authenticated; create policy rota on catalogo_calcos for update to authenticated using (true) with check (true);" R39 "R39d EL OWNER EDITÓ"
correr "la lectura de encargos sin el filtro del tenant" \
  "drop policy encargos_calcos_lectura on encargos_calcos; create policy encargos_calcos_lectura on encargos_calcos for select to authenticated using (true);" R39 "R39d EL OWNER LEE"
correr "la lectura de diseños sin el filtro del tenant" \
  "drop policy disenos_calco_lectura on disenos_calco; create policy disenos_calco_lectura on disenos_calco for select to authenticated using (true);" R39 "R39d EL OWNER LEE"
correr "la auditoría de precios legible por cualquiera" \
  "drop policy cambios_precio_calcos_lectura on cambios_precio_calcos; create policy cambios_precio_calcos_lectura on cambios_precio_calcos for select to authenticated using (true);" R39 "R39d UN OWNER LEE"
correr "la subida al bucket abierta a cualquiera con sesión" \
  "drop policy \"calcos subida fidelli\" on storage.objects; create policy \"calcos subida fidelli\" on storage.objects for insert to authenticated with check (bucket_id = 'calcos');" R39 "R39d"
correr_marcada "avanzar_encargo_calcos sin la guarda" avanzar_encargo_calcos "$M" \
  "/@guarda_avanzar/s/if not soy_superadmin() then/if false then/" R39 "R39d"
correr_marcada "crear_encargo_calcos_incluido sin la guarda" crear_encargo_calcos_incluido "$M" \
  "/@guarda_incluido/s/if not soy_superadmin() then/if false then/" R39 "R39d"
correr_marcada "fijar_precio_calcos sin la guarda" fijar_precio_calcos "$M" \
  "/@guarda_precio/s/if not soy_superadmin() then/if false then/" R39 "R39d"
correr_marcada "registrar_diseno_calco sin la guarda" registrar_diseno_calco "$M" \
  "/@guarda_diseno/s/if not soy_superadmin() then/if false then/" R39 "R39d"
correr_marcada "encargos_calcos_admin sin la guarda" encargos_calcos_admin "$M" \
  "/@guarda_cola/s/if not soy_superadmin() then/if false then/" R39 "R39d"

echo "── R39e · el precio de lista ──"
correr_marcada "el candado de precios que deja pasar todo" bloquear_precio_calcos_directo "$M" \
  "/@candado_precio_calcos/s/if (new.precio_ars/if false and (new.precio_ars/" R39 "R39e UN UPDATE DIRECTO"
correr "el candado que mira el precio y se olvida del costo" \
  "create or replace function bloquear_precio_calcos_directo() returns trigger language plpgsql as \$f\$
   begin
     if new.precio_ars is distinct from old.precio_ars
        and coalesce(current_setting('fidelli.precio_de_calcos', true), '') <> 'si' then
       raise exception 'precio_solo_por_funcion';
     end if;
     return new;
   end \$f\$;" R39 "R39e UN UPDATE DIRECTO MOVIÓ costo_ars"
correr "el trigger del candado deshabilitado" \
  "alter table catalogo_calcos disable trigger candado_precio_calcos;" R39 "R39e UN UPDATE DIRECTO"
correr "el candado pasado de rosca: rechaza cualquier update" \
  "create or replace function bloquear_precio_calcos_directo() returns trigger language plpgsql as \$f\$
   begin
     if coalesce(current_setting('fidelli.precio_de_calcos', true), '') <> 'si' then
       raise exception 'precio_solo_por_funcion';
     end if;
     return new;
   end \$f\$;" R39 "R39e EL CANDADO DE PRECIOS SE PASÓ DE ROSCA"
# El motivo tiene DOS defensas (el chequeo de la puerta y el CHECK de la
# auditoría): sacando una sola el invariante queda en pie.
correr_marcada "el precio movido sin motivo (las dos defensas afuera)" fijar_precio_calcos "$M" \
  "/@motivo_precio/s/if p_motivo is null or char_length(trim(p_motivo)) < 10 then/if false then/" R39 "R39e UN PRECIO DE CALCOS SE MOVIÓ SIN MOTIVO" \
  "alter table cambios_precio_calcos drop constraint motivo_con_sustancia;"
correr_marcada "la puerta que no audita" fijar_precio_calcos "$M" \
  "/@registro_precio/s/if v_antes is distinct from v_despues then/if false then/" R39 "R39e LA PUERTA NO AUDITÓ"
correr_marcada "la puerta que audita también lo que no cambió" fijar_precio_calcos "$M" \
  "/@registro_precio/s/if v_antes is distinct from v_despues then/if true then/" R39 "R39e un guardado que no cambia"
correr_marcada "la puerta que deja la bandera prendida" fijar_precio_calcos "$M" \
  "/@apagar_bandera_precio/s/perform set_config('fidelli.precio_de_calcos', '', true);/null;/" R39 "R39e LA PUERTA DEJÓ EL CANDADO ABIERTO"
correr "un trigger que «sincroniza» los pedidos abiertos con el catálogo" \
  "create function r39_sincronizar() returns trigger language plpgsql as \$f\$
   begin
     update encargos_calcos
        set monto_pack = new.precio_ars,
            monto_total = new.precio_ars + monto_rediseno + monto_envio
      where pack_codigo = new.codigo and not incluido and estado in ('pendiente_pago', 'pagado');
     return new;
   end \$f\$;
   create trigger r39_sincronizar after update on catalogo_calcos
     for each row when (new.precio_ars is distinct from old.precio_ars)
     execute function r39_sincronizar();" R39 "R39e MOVER EL CATÁLOGO MOVIÓ"

echo "── R39f · lo que cuenta la alerta y lo que ordena la cola ──"
correr_marcada "esperando producción cuenta también lo que ya se produce" resumen_admin "$M_STOCK" \
  "/@calcos_esperando/s/estado = 'pagado'/estado in ('pagado', 'en_produccion')/" R39 "R39f"
correr_marcada "atrasados en días corridos en vez de hábiles" resumen_admin "$M_STOCK" \
  "/@calcos_atrasados/s/dias_habiles_entre(produccion_at::date, current_date) > 5/(current_date - produccion_at::date) > 5/" R39 "R39f"
correr_marcada "atrasados con el corte corrido a 50 días hábiles" resumen_admin "$M_STOCK" \
  "/@calcos_atrasados/s/> 5)/> 50)/" R39 "R39f"
correr_marcada "por vencer que recién avisa el día que vence" resumen_admin "$M_STOCK" \
  "/@calcos_por_vencer/s/interval '6 days'/interval '7 days'/" R39 "R39f un pendiente de pago de hace 6 días"
correr_marcada "por vencer que cuenta cualquier pendiente" resumen_admin "$M_STOCK" \
  "/@calcos_por_vencer/s/interval '6 days'/interval '0 days'/" R39 "R39f resumen_admin().calcos CUENTA MAL"
correr_marcada "la cola con los pagados al fondo" encargos_calcos_admin "$M" \
  "/@cola_pagados_primero/s/then 1/then 4/" R39 "R39f LA COLA"
correr_marcada "la cola de un tenant sin el filtro del tenant" encargos_calcos_admin "$M" \
  "/@cola_filtro_tenant/s/where p_lubricentro_id is null or e.lubricentro_id = p_lubricentro_id/where true/" R39 "R39f encargos_calcos_admin(tenant)"
correr_marcada "la ganancia sin descontar la comisión" encargos_calcos_admin "$M" \
  "/@ganancia/s/b.monto_total - b.costo_estimado - b.comision_estimada,/b.monto_total - b.costo_estimado,/" R39 "R39f la ganancia"

echo "── R39g · los montos al crear ──"
correr_marcada "la comisión del pedido en cero" crear_encargo_calcos "$M" \
  "/@comision_del_total/s/round(v_total \* comision_cresium(), 2),/0,/" R39 "R39g LOS MONTOS"
correr_marcada "el costo del pedido sin el del pack" crear_encargo_calcos "$M" \
  "/@costo_del_catalogo/s/v_costo := v_pack.costo_ars/v_costo := 0/" R39 "R39g LOS MONTOS"
correr_marcada "el incluido que nace sin pagar" crear_encargo_calcos_incluido "$M" \
  "/@incluido_nace_pagado/s/'pagado', now(), auth.uid(),/'pendiente_pago', null, auth.uid(),/" R39 "R39g EL PEDIDO INCLUIDO"
correr_marcada "el incluido sin costo de impresión" crear_encargo_calcos_incluido "$M" \
  "/@costo_unitario/s/select c.costo_ars \/ c.cantidad into v_unitario/select 0::numeric into v_unitario/" R39 "R39g EL PEDIDO INCLUIDO"
# Las dos que siguen las frena además una segunda defensa (el not null de
# `cantidad` y el CHECK envio_con_direccion): el bloque las acusa por el
# error que el front no traduce.
correr_marcada "un extra aceptado como pack" crear_encargo_calcos "$M" \
  "/@pack_es_pack/s/and c.tipo = 'pack' and c.activo;/and c.activo;/" R39 "R39g «rediseno» como pack falló con otro error"
correr_marcada "el envío sin exigir la dirección" crear_encargo_calcos "$M" \
  "/@envio_con_datos/s/if v_envio and (v_direccion is null or v_telefono is null) then/if false then/" R39 "R39g el envío con la dirección en blanco falló con otro error"

echo "── R39h · los días hábiles ──"
correr_marcada "el sábado contado como hábil" dias_habiles_entre "$M" \
  "/@lunes_a_viernes/s/< 6/< 7/" R39 "R39h"
correr_marcada "días corridos en vez de hábiles" dias_habiles_entre "$M" \
  "/@lunes_a_viernes/s/< 6/< 8/" R39 "R39h"
correr_marcada "el día de partida contado" dias_habiles_entre "$M" \
  "/@sin_el_dia_de_partida/s/p_desde + 1/p_desde/" R39 "R39h"

echo "── R39i · los diseños y el bucket ──"
correr_marcada "dos versiones actuales (la puerta no desmarca y el índice no está)" registrar_diseno_calco "$M" \
  "/@una_actual/s/set actual = false/set actual = actual/" R39 "R39i tras subir dos versiones" \
  "drop index disenos_calco_una_actual;"
correr_marcada "la versión siempre 1 (la puerta no cuenta y el unique no está)" registrar_diseno_calco "$M" \
  "/@version_siguiente/s/coalesce(max(d.version), 0) + 1/coalesce(min(1), 1)/" R39 "R39i las versiones quedaron" \
  "alter table disenos_calco drop constraint disenos_calco_version;"
correr_marcada "un diseño registrado en la carpeta de otro tenant" registrar_diseno_calco "$M" \
  "/@ruta_del_tenant/s/if p_ruta is null or p_ruta not like p_lubricentro_id::text || '\/_%' then/if false then/" R39 "R39i UN DISEÑO QUEDÓ REGISTRADO"
correr "el bucket calcos público" \
  "update storage.buckets set public = true where id = 'calcos';" R39 "R39i EL BUCKET"
correr "el bucket: cada owner lee todas las carpetas" \
  "drop policy \"calcos lectura\" on storage.objects; create policy \"calcos lectura\" on storage.objects for select to authenticated using (bucket_id = 'calcos');" R39 "R39i EN EL BUCKET"

echo "── R39j · el catálogo y la comisión ──"
correr "un precio del catálogo que no es el de la decisión 2" \
  "select set_config('fidelli.precio_de_calcos', 'si', true); update catalogo_calcos set precio_ars = 46000 where codigo = 'pack_200'; select set_config('fidelli.precio_de_calcos', '', true);" R39 "R39j EL CATÁLOGO"
correr "un pack dado de baja" \
  "update catalogo_calcos set activo = false where codigo = 'pack_2000';" R39 "R39j EL CATÁLOGO"
correr_marcada "la comisión de Cresium con otro número" comision_cresium "$M" \
  "/@comision/s/0.00968/0.008/" R39 "R39j la comisión"

echo "── R39k · los cuatro CHECK del encargo ──"
for restriccion in incluido_sin_monto envio_con_direccion enviado_con_seguimiento entregado_con_pedido; do
  correr "el CHECK $restriccion borrado" \
    "alter table encargos_calcos drop constraint $restriccion;" R39 "R39k EL CHECK $restriccion"
done

echo "── R39l · quién puede pedir ──"
correr_marcada "un tenant suspendido pide calcos" crear_encargo_calcos "$M" \
  "/@solo_activos/s/if not es_activo(v_l) then/if false then/" R39 "R39l UN TENANT SUSPENDIDO"

echo "── El bloque R40 sano, antes de romper nada ──"
sano=$( { echo "begin;"; bloque R40 "$V"; echo "rollback;"; } | $DB -v ON_ERROR_STOP=1 -f - 2>&1 )
if echo "$sano" | grep -q "ERROR"; then
  echo "  ✗ R40 está en ROJO sin ninguna rotura: lo que sigue no prueba nada."
  echo "$sano" | grep -E "ERROR" | tail -2 | sed 's/^/      /'
  exit 1
fi
echo "  ✓ R40 pasa en verde sobre la base actual"

echo "── R40a · la orden es de una sola cosa ──"
for restriccion in orden_de_una_sola_cosa renovacion_con_periodo calcos_sin_periodo; do
  correr "el CHECK $restriccion borrado" \
    "alter table cresium_ordenes drop constraint $restriccion;" R40 "R40a"
done

echo "── R40e · la trampa: la rama de calcos antes del cast ──"
# Sin la rama, la referencia `calcos:<uuid>` llega al cast de la renovación:
# el error es el de Postgres, crudo, que es exactamente el 500 del webhook.
correr_marcada "la rama de calcos sacada: el cast a uuid explota con «calcos»" acreditar_deposito_cresium "$M_PAGO" \
  "/@rama_calcos/s/if v_external like 'calcos:%' then/if false then/" R40 "invalid input syntax for type uuid"
correr_marcada "el uuid del encargo casteado sin mirarle la forma" acreditar_deposito_cresium "$M_PAGO" \
  "/@uuid_de_calcos/s/if v_ref ~\* '[^']*' then/if true then/" R40 "R40e EL WEBHOOK EXPLOTA"

echo "── R40b · c · d · h · lo que el webhook hace con un pedido ──"
correr_marcada "el pago que no guarda la transacción" acreditar_deposito_cresium "$M_PAGO" \
  "/@paga_calcos/s/, cresium_transaccion_id = v_tx//" R40 "R40b EL PAGO NO DEJÓ"
correr_marcada "la rama de calcos «unificada»: escribe una fila en pagos" acreditar_deposito_cresium "$M_PAGO" \
  "s/update cresium_eventos set procesado_at = now(), motivo = 'acreditado (pedido de calcos)'/insert into pagos (lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id, periodo_desde, periodo_hasta, monto, fecha_pago) select v_enc.lubricentro_id, su.id, null, 'cresium', v_tx, current_date, current_date + 30, v_pagado, current_date from suscripciones su where su.lubricentro_id = v_enc.lubricentro_id limit 1; update cresium_eventos set procesado_at = now(), motivo = 'acreditado (pedido de calcos)'/" R40 "R40b EL PAGO DE UN PEDIDO DE CALCOS ESCRIBIÓ"
correr_marcada "la idempotencia de calcos sacada" acreditar_deposito_cresium "$M_PAGO" \
  "/@idempotencia_calcos/s/elsif v_enc.cresium_transaccion_id = v_tx then/elsif false then/" R40 "R40c"
correr_marcada "un PARTIAL paga el pedido" acreditar_deposito_cresium "$M_PAGO" \
  "/@parcial_calcos/s/elsif v_estado is distinct from 'PAID' then/elsif false then/" R40 "R40d"
correr_marcada "el webhook revive cualquier estado" acreditar_deposito_cresium "$M_PAGO" \
  "/@estados_que_paga/s/elsif v_enc.estado not in ('pendiente_pago', 'vencido') then/elsif false then/" R40 "R40h"

echo "── R40g · el vencimiento ──"
correr_marcada "el pedido sin pagar que no vence nunca" vencer_encargos_calcos "$M_PAGO" \
  "/@vence_a_los_7/s/interval '7 days'/interval '700 days'/" R40 "R40g EL PEDIDO SIN PAGAR NO VENCE"
correr_marcada "el pedido que vence un día antes" vencer_encargos_calcos "$M_PAGO" \
  "/@vence_a_los_7/s/interval '7 days'/interval '6 days'/" R40 "R40g VENCIÓ UN PEDIDO QUE TODAVÍA TENÍA PLAZO"
correr_marcada "el vencimiento que se lleva lo que no está sin pagar" vencer_encargos_calcos "$M_PAGO" \
  "/@vence_solo_sin_pagar/s/where estado = 'pendiente_pago'/where estado <> 'entregado'/" R40 "R40g VENCIÓ UN PEDIDO QUE NO ESTABA SIN PAGAR"
correr_marcada "el vencimiento de un tenant que vence el de todos" vencer_encargos_calcos "$M_PAGO" \
  "/@vence_del_tenant/s/and (p_lubricentro_id is null or lubricentro_id = p_lubricentro_id);/;/" R40 "R40g vencer_encargos_calcos(tenant)"
correr_marcada "el webhook que no acredita un pedido vencido" acreditar_deposito_cresium "$M_PAGO" \
  "/@estados_que_paga/s/not in ('pendiente_pago', 'vencido')/not in ('pendiente_pago')/" R40 "R40g EL WEBHOOK NO ACREDITÓ"
correr_marcada "vencido → pagado agregado a la tabla de avanzar_encargo_calcos" avanzar_encargo_calcos "$M" \
  "/@t_pagado/s/('pagado',         'en_produccion', false),/('pagado', 'en_produccion', false), ('vencido', 'pagado', false),/" R40 "R40g UN PEDIDO VENCIDO PASÓ"

echo "── R40i · el mail no se duplica ──"
correr_marcada "el mail de pago que se reclama siempre" reclamar_mail_encargo_calcos "$M_PAGO" \
  "/@reclamo_pago/s/ and mail_pago_at is null;/;/" R40 "R40i EL MAIL DE PAGO SE MANDA DOS VECES"
correr_marcada "soltar que no suelta" soltar_mail_encargo_calcos "$M_PAGO" \
  "/@suelta_pago/s/set mail_pago_at = null where id = p_id;/set mail_pago_at = mail_pago_at where id = p_id;/" R40 "R40i soltar"

echo "── R40j · los lectores de la última orden del tenant ──"
correr_marcada "cobranzas_pendientes() mirando cualquier orden" cobranzas_pendientes "$M_PAGO" \
  "/@orden_de_la_suscripcion/s/where o.suscripcion_id is not null/where true/" R40 "R40j cobranzas_pendientes"
correr_marcada "resumen_admin() contando las órdenes de calcos" resumen_admin "$M_STOCK" \
  "/@ordenes_de_suscripcion/s/where o.suscripcion_id is not null/where true/" R40 "R40j"

echo "── R40k · quién ejecuta qué ──"
correr_marcada "la guarda del mail sacada" reclamar_mail_encargo_calcos "$M_PAGO" \
  "/@guarda_mail/s/if not (soy_superadmin() or auth.uid() is null) then/if false then/" R40 "R40k"
correr_marcada "catalogo_calcos_admin sin la guarda" catalogo_calcos_admin "$M_PAGO" \
  "/@guarda_catalogo/s/if not soy_superadmin() then/if false then/" R40 "R40k"
correr "la orden de Cresium escribible por el owner" \
  "grant insert on cresium_ordenes to authenticated; create policy rota on cresium_ordenes for insert to authenticated with check (true);" R40 "R40k"

echo "── El bloque R41 sano, antes de romper nada ──"
sano=$( { echo "begin;"; bloque R41 "$V"; echo "rollback;"; } | $DB -v ON_ERROR_STOP=1 -f - 2>&1 )
if echo "$sano" | grep -q "ERROR"; then
  echo "  ✗ R41 está en ROJO sin ninguna rotura: lo que sigue no prueba nada."
  echo "$sano" | grep -E "ERROR" | tail -2 | sed 's/^/      /'
  exit 1
fi
echo "  ✓ R41 pasa en verde sobre la base actual"

echo "── R41a · la cuenta ──"
correr_marcada "cuenta trabajos en vez de autos" stock_calcos "$M_STOCK" \
  "/@por_auto/s/group by s.vehiculo_id/group by s.id/" R41 "R41a LA CUENTA NO DA"
correr_marcada "los trabajos importados cuentan como consumo" stock_calcos "$M_STOCK" \
  "/@sin_importados/s/and s.importado_de is null/and true/" R41 "R41a LA CUENTA NO DA"
correr_marcada "los trabajos anulados cuentan" stock_calcos "$M_STOCK" \
  "/@sin_anulados/s/and not s.anulado/and true/" R41 "R41a LA CUENTA NO DA"
correr_marcada "cuentan también los autos de antes de la primera entrega" stock_calcos "$M_STOCK" \
  "/@desde_la_entrega/s/else p.primero >= v_primera end/else true end/" R41 "R41a LA CUENTA NO DA"
correr_marcada "la entrega cuenta por cuándo se cargó la fila, no por su fecha" momento_de_entrega_calcos "$M_STOCK" \
  "/@entrega_por_fecha/s/else p_fecha::timestamp at time zone 'America\/Argentina\/Buenos_Aires'/else p_created_at/" R41 "R41a con 10 entregadas"
correr_marcada "el stock negativo" stock_calcos "$M_STOCK" \
  "/@nunca_negativo/s/greatest(v_stock, 0)/v_stock/" R41 "R41a con 10 entregadas"

echo "── R41c · null en todo ──"
correr_marcada "sin entregas devuelve ceros en vez de null" stock_calcos "$M_STOCK" \
  "/@sin_entregas/s/if v_primera is null/if false/" R41 "R41c SIN NINGUNA ENTREGA"
correr_marcada "calcos_propias ignorado en la cuenta" stock_calcos "$M_STOCK" \
  "/@propias_sin_estimacion/s/or coalesce(v_propias, false) then/or false then/" R41 "PRENDIDO stock_calcos"

echo "── R41d · el ritmo ──"
correr_marcada "el ritmo sobre toda la historia en vez de 8 semanas" stock_calcos "$M_STOCK" \
  "/@ocho_semanas/s/interval '56 days'/interval '5600 days'/" R41 "R41d EL RITMO DE 8 SEMANAS"
correr_marcada "el ritmo con menos de 2 semanas de historia" stock_calcos "$M_STOCK" \
  "/@dos_semanas/s/if v_dias >= 14 then/if v_dias >= 0 then/" R41 "R41d CON MENOS DE 2 SEMANAS"
correr_marcada "el ritmo siempre dividido por 8, aunque haya un mes de historia" stock_calcos "$M_STOCK" \
  "/@ventana_real/s/least(v_dias, 56) \/ 7.0/8.0/" R41 "R41d con 4 semanas de historia"
correr_marcada "la cobertura con ritmo cero" stock_calcos "$M_STOCK" \
  "/@cobertura/s/case when v_ritmo > 0 then round(v_stock \/ v_ritmo, 1) end/case when v_ritmo >= 0 then round(v_stock \/ greatest(v_ritmo, 0.1), 1) end/" R41 "R41d CON RITMO CERO"

echo "── R41b · el recuento ──"
correr_marcada "el recuento que no pisa la base" stock_calcos "$M_STOCK" \
  "/@base_recuento/s/v_stock := v_rec_cant/v_stock := v_entregadas/" R41 "R41b EL RECUENTO NO PISA LA BASE"
correr_marcada "los autos de antes del recuento siguen descontando" stock_calcos "$M_STOCK" \
  "/@desde_el_recuento/s/then p.primero > v_rec_at/then p.primero >= v_primera/" R41 "R41b EL RECUENTO NO PISA LA BASE"
correr_marcada "una entrega posterior al recuento no suma" stock_calcos "$M_STOCK" \
  "/@entregas_tras_recuento/s/> v_rec_at), 0)/> v_rec_at and false), 0)/" R41 "R41b UNA ENTREGA POSTERIOR AL RECUENTO NO SUMA"
correr_marcada "una corrección del libro con fecha vieja suma al stock" stock_calcos "$M_STOCK" \
  "/@entregas_tras_recuento/s/momento_de_entrega_calcos(pc.fecha, pc.created_at) > v_rec_at/pc.created_at > v_rec_at/" R41 "R41b UNA CORRECCIÓN DEL LIBRO"
correr_marcada "con dos recuentos gana el más viejo" stock_calcos "$M_STOCK" \
  "/@recuento_mas_nuevo/s/order by rc.created_at desc/order by rc.created_at asc/" R41 "R41b con dos recuentos manda"
# La segunda defensa (el CHECK de la tabla) frena igual, con otro error.
correr_marcada "la puerta del recuento sin validar la cantidad" declarar_recuento_calcos "$M_STOCK" \
  "/@cantidad_recuento/s/if p_cantidad is null or p_cantidad < 0 or p_cantidad > 100000 then/if false then/" R41 "cantidad_invalida"
correr_marcada "un recuento sin ninguna entrega" declarar_recuento_calcos "$M_STOCK" \
  "/@recuento_sin_entregas/s/if not exists (select 1 from pedidos_calcos pc where pc.lubricentro_id = v_lub) then/if false then/" R41 "sin_entregas"
correr_marcada "el recuento escrito en el tenant de otro" declarar_recuento_calcos "$M_STOCK" \
  "/@tenant_de_la_sesion/s/v_lub uuid := mi_lubricentro_id();/v_lub uuid := (select id from lubricentros where slug = 'r41-aviso');/" R41 "R41b declarar_recuento_calcos() no dejó la fila"

echo "── R41h · calcos_propias ──"
correr_marcada "el candado de calcos_propias apagado" bloquear_calcos_propias_directo "$M_STOCK" \
  "/@candado_calcos_propias/s/if new.calcos_propias is distinct from old.calcos_propias/if false and new.calcos_propias is distinct from old.calcos_propias/" R41 "R41h UN UPDATE DIRECTO"
correr "el candado de calcos_propias deshabilitado" \
  "alter table lubricentros disable trigger candado_calcos_propias;" R41 "R41h UN UPDATE DIRECTO"
correr "el candado de calcos_propias bajado de ALWAYS a ORIGIN" \
  "alter table lubricentros enable trigger candado_calcos_propias;" R41 "R41h el candado de"
correr_marcada "la puerta deja la bandera prendida" marcar_calcos_propias "$M_STOCK" \
  "/@apagar_bandera_propias/s/perform set_config('fidelli.calcos_propias', '', true);/null;/" R41 "R41h UN UPDATE DIRECTO"
correr_marcada "calcos_propias se prende sin nota" marcar_calcos_propias "$M_STOCK" \
  "/@nota_propias/s/if p_nota is null or char_length(trim(p_nota)) < 10 then/if false then/" R41 "R41h marcar_calcos_propias() SIN NOTA"
correr_marcada "la guarda de calcos_propias sacada: un owner se lo prende" marcar_calcos_propias "$M_STOCK" \
  "/@guarda_propias/s/if not soy_superadmin() then/if false then/" R41 "R41h UN OWNER SE PRENDI"
correr_marcada "prender calcos_propias no deja el evento" marcar_calcos_propias "$M_STOCK" \
  "/@evento_propias/s/perform emitir_evento_tenant(/perform concat(/" R41 "R41h PRENDER"
correr_marcada "marcar lo que ya estaba deja otro evento" marcar_calcos_propias "$M_STOCK" \
  "/@propias_sin_cambio/s/if v_antes = p_propias then/if false then/" R41 "R41h marcar dos veces"

echo "── R41e · el aviso ──"
correr_marcada "el aviso recién a las 3 semanas" nivel_de_aviso_calcos "$M_STOCK" \
  "/@cuatro_semanas/s/p_semanas < 4/p_semanas < 3/" R41 "R41e CON MENOS DE 4 SEMANAS"
correr_marcada "el aviso con 4 semanas justas" nivel_de_aviso_calcos "$M_STOCK" \
  "/@cuatro_semanas/s/p_semanas < 4/p_semanas <= 4/" R41 "R41e con 40 calcos"
correr_marcada "el segundo escalón que no llega nunca por semanas" nivel_de_aviso_calcos "$M_STOCK" \
  "/@una_semana/s/p_semanas < 1/p_semanas < 0/" R41 "R41e con 25 calcos"
correr_marcada "el segundo escalón sin la cláusula de las 20 calcos" nivel_de_aviso_calcos "$M_STOCK" \
  "/@veinte_calcos/s/p_stock <= 20/p_stock <= 2/" R41 "R41e CON 20 CALCOS O MENOS"
correr_marcada "el segundo escalón con 21 calcos" nivel_de_aviso_calcos "$M_STOCK" \
  "/@veinte_calcos/s/p_stock <= 20/p_stock <= 21/" R41 "R41e con 21 calcos"
correr_marcada "el aviso con un pedido abierto" aviso_calcos "$M_STOCK" \
  "/@aviso_sin_encargo/s/and not tiene_encargo_calcos_abierto(p_lubricentro_id)/and true/" R41 "R41e EL AVISO CON UN PEDIDO ABIERTO"
correr_marcada "«enviado» se cae de los estados abiertos" tiene_encargo_calcos_abierto "$M_STOCK" \
  "/@estados_abiertos/s/'enviado', //" R41 "R41e EL AVISO CON UN PEDIDO ABIERTO"
correr_marcada "«entregado» cuenta como pedido abierto" tiene_encargo_calcos_abierto "$M_STOCK" \
  "/@estados_abiertos/s/'listo_retiro')/'listo_retiro', 'entregado')/" R41 "R41e EL AVISO CON UN PEDIDO CERRADO"

echo "── R41g · la lista del hub ──"
correr_marcada "la lista del hub recién a las 2 semanas" calcos_por_agotarse "$M_STOCK" \
  "/@tres_semanas/s/s.semanas_cobertura < 3/s.semanas_cobertura < 2/" R41 "R41g CON MENOS DE 3 SEMANAS"
correr_marcada "la lista del hub con el umbral del aviso (4 semanas)" calcos_por_agotarse "$M_STOCK" \
  "/@tres_semanas/s/s.semanas_cobertura < 3/s.semanas_cobertura < 4/" R41 "R41g con 3,5 semanas"
correr_marcada "sin_stock que no cuenta la lista" resumen_admin "$M_STOCK" \
  "/@calcos_sin_stock/s/(select count(\*) from calcos_por_agotarse())/0/" R41 "R41g resumen_admin().calcos.sin_stock"
correr_marcada "la lista del hub con un pedido abierto" calcos_por_agotarse "$M_STOCK" \
  "/@lista_sin_encargo/s/and not tiene_encargo_calcos_abierto(l.id)/and true/" R41 "R41g LA LISTA DEL HUB CON UN PEDIDO ABIERTO"
correr_marcada "la lista del hub con el suspendido" calcos_por_agotarse "$M_STOCK" \
  "/@lista_sin_suspendidos/s/where es_activo(l)/where true/" R41 "R41f A UN SUSPENDIDO"
correr_marcada "la lista del hub con el demo" calcos_por_agotarse "$M_STOCK" \
  "/@lista_sin_demo/s/and l.slug <> 'demo'/and true/" R41 "R41f EL DEMO ENTRA"

echo "── R41f · los mails ──"
correr_marcada "el mail con un pedido abierto" avisos_calcos_pendientes "$M_STOCK" \
  "/@mail_sin_encargo/s/and not tiene_encargo_calcos_abierto(c.id)/and true/" R41 "R41f EL MAIL CON UN PEDIDO ABIERTO"
correr_marcada "el mail al suspendido" avisos_calcos_pendientes "$M_STOCK" \
  "/@mail_sin_suspendidos/s/where es_activo(l)/where true/" R41 "R41f A UN SUSPENDIDO"
correr_marcada "el mail al demo" avisos_calcos_pendientes "$M_STOCK" \
  "/@mail_sin_demo/s/and l.slug <> 'demo'/and true/" R41 "R41f EL DEMO ENTRA"
correr_marcada "después del de 1 semana se cae al de 4" avisos_calcos_pendientes "$M_STOCK" \
  "/@no_cae_al_anterior/s/or e.tipo = 'calcos_1_semana'))/or false))/" R41 "TE QUEDAN CUATRO"
correr_marcada "el ciclo que no mira la entrega: una entrega nueva no habilita nada" avisos_calcos_pendientes "$M_STOCK" \
  "/@mail_por_ciclo/s/and e.entrega_ref = c.entrega_ref/and true/" R41 "R41f DESPUÉS DE UNA ENTREGA NUEVA"
correr_marcada "«la última entrega» es la primera" avisos_calcos_pendientes "$M_STOCK" \
  "/@ultima_entrega/s/order by pc.fecha desc, pc.created_at desc, pc.id/order by pc.fecha asc, pc.created_at asc, pc.id/" R41 "R41f DESPUÉS DE UNA ENTREGA NUEVA"
correr_marcada "el mail de 4 semanas que se repite al día siguiente" avisos_calcos_pendientes "$M_STOCK" \
  "/@mail_enviado/s/and (e.tipo = c.tipo/and (false/" R41 "R41f el mail de 4 semanas se repite"
# La entrega cargada el mismo día cuenta por su hora. Rota, cuenta desde la
# medianoche: queda ANTES del recuento de hace un minuto y no suma. (A la
# noche el que la acusa es el piso del demo; por eso el patrón es R41f.)
correr_marcada "la entrega del día contada desde la medianoche" momento_de_entrega_calcos "$M_STOCK" \
  "/@entrega_del_dia/s/when p_fecha >= (p_created_at at time zone 'America\/Argentina\/Buenos_Aires')::date/when false/" R41 "R41f"

echo "── R41i · los dos libros ──"
correr "el unique de emails_calcos borrado" \
  "alter table emails_calcos drop constraint emails_calcos_lubricentro_id_tipo_entrega_ref_key;" R41 "R41i emails_calcos ACEPT"
correr_marcada "el candado de borrado de emails_calcos" bloquear_borrado_de_email_calcos "$M_STOCK" \
  "/@candado_borrado_email_calcos/s/raise exception/raise notice/" R41 "R41i"
correr_marcada "el candado de edición de emails_calcos" bloquear_edicion_de_email_calcos "$M_STOCK" \
  "/@candado_edicion_email_calcos/s/if new is distinct from old then/if false then/" R41 "R41i"
correr_marcada "el candado de purga de emails_calcos" bloquear_purga_de_emails_calcos "$M_STOCK" \
  "/@candado_purga_email_calcos/s/raise exception/raise notice/" R41 "R41i"
correr "los tres candados de emails_calcos bajados de ALWAYS a ORIGIN" \
  "alter table emails_calcos enable trigger candado_borrado_email_calcos;
   alter table emails_calcos enable trigger candado_edicion_email_calcos;
   alter table emails_calcos enable trigger candado_purga_emails_calcos;" R41 "R41i los seis candados"
correr_marcada "el candado de edición de recuentos_calcos" bloquear_edicion_de_recuento "$M_STOCK" \
  "/@candado_edicion_recuento/s/raise exception/raise notice/" R41 "R41i"
correr_marcada "el candado de borrado de recuentos_calcos" bloquear_borrado_de_recuento "$M_STOCK" \
  "/@candado_borrado_recuento/s/if exists (select 1 from lubricentros where id = old.lubricentro_id) then/if false then/" R41 "R41i"
correr_marcada "el candado de purga de recuentos_calcos" bloquear_purga_de_recuentos "$M_STOCK" \
  "/@candado_purga_recuento/s/raise exception/raise notice/" R41 "R41i"
correr "los tres candados de recuentos_calcos bajados de ALWAYS a ORIGIN" \
  "alter table recuentos_calcos enable trigger candado_edicion_recuento;
   alter table recuentos_calcos enable trigger candado_borrado_recuento;
   alter table recuentos_calcos enable trigger candado_purga_recuentos;" R41 "R41i los seis candados"

echo "── R41k · quién ejecuta qué ──"
correr_marcada "la guarda del stock sacada: un owner lee el del vecino" stock_calcos "$M_STOCK" \
  "/@guarda_stock/s/if not (soy_superadmin()/if false and not (soy_superadmin()/" R41 "R41k"
correr_marcada "la guarda del stock sin el coalesce: un usuario sin lubricentro la pasa" stock_calcos "$M_STOCK" \
  "/@sin_tenant_no_pasa/s/coalesce(p_lubricentro_id = mi_lubricentro_id(), false)/p_lubricentro_id = mi_lubricentro_id()/" R41 "UN USUARIO SIN LUBRICENTRO"
correr "la decisión de los mails grantada a authenticated" \
  "grant execute on function avisos_calcos_pendientes() to authenticated;" R41 "R41k"
correr "tiene_encargo_calcos_abierto() como /rpc/ de cualquiera" \
  "grant execute on function tiene_encargo_calcos_abierto(uuid) to authenticated;" R41 "R41k"
correr "nivel_de_aviso_calcos() como /rpc/ de cualquiera" \
  "grant execute on function nivel_de_aviso_calcos(integer, numeric) to authenticated;" R41 "R41k"
correr_marcada "la guarda del recuento sacada" declarar_recuento_calcos "$M_STOCK" \
  "/@guarda_recuento/s/if v_lub is null then/if false then/" R41 "R41k"
correr "recuentos_calcos escribible por el owner" \
  "grant insert on recuentos_calcos to authenticated; create policy rota on recuentos_calcos for insert to authenticated with check (true);" R41 "R41k"
correr "los recuentos de todos, a la vista de cualquier owner" \
  "drop policy recuentos_calcos_lectura on recuentos_calcos; create policy recuentos_calcos_lectura on recuentos_calcos for select to authenticated using (true);" R41 "R41k el owner ve"
correr "emails_calcos escribible por una sesión" \
  "grant insert on emails_calcos to authenticated; create policy rota on emails_calcos for insert to authenticated with check (true);" R41 "R41k"
correr "emails_calcos a la vista de cualquier owner" \
  "drop policy emails_calcos_superadmin on emails_calcos; create policy emails_calcos_superadmin on emails_calcos for select to authenticated using (true);" R41 "R41k el owner ve"

echo
if [ "$fallas" -eq 0 ]; then
  echo "La red atrapó las $total roturas (R39, R40 y R41)."
else
  echo "ALGUNA ROTURA SE ESCAPÓ: la prueba que dice cubrirla no la cubre."
fi
exit $fallas
