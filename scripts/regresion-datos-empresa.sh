#!/bin/bash
# La rotura a mano de R45 (regla 13): los datos de la empresa en el
# presupuesto. Cada afirmación se corre con SU rotura —la regla exacta que
# dice cubrir— y tiene que ponerse en ROJO. Una prueba que nunca se vio
# fallar es una prueba que no existe.
#
#   R45j · la forma: la tabla sin RLS, `anon` con lectura, el owner que
#          puede borrar, el sello escribible (una columna y todas), el
#          tenant editable, el alta que no puede escribir el CUIT, una
#          policy de borrado, un CHECK borrado, el trigger del sello
#          borrado, la FK sin cascada, y la puerta como definer o
#          ejecutable por `anon`.
#   R45a · la puerta: el CUIT guardado como se escribió, los textos sin
#          recortar, el upsert que conserva lo que no viene (así no se
#          puede vaciar un dato) y el sello que no se pone.
#   R45b · los rechazos: la clave mal escrita que se ignora, el CUIT a
#          medias, la condición de IVA y los largos sin validar en la
#          puerta; y la tabla con cada CHECK aflojado (el CUIT con guiones,
#          la condición, la razón social vacía, el domicilio con espacios,
#          el teléfono con un salto de línea, el email sin tope).
#   R45c · el sello que respeta lo que le mandan.
#   R45d · el aislamiento: la lectura sin tenant, el alta sin tenant, y la
#          puerta que le cree a un owner el lubricentro que le pasa.
#   R45e · Fidelli: la puerta sin el «falta el lubricentro», y las
#          policies que se olvidan del superadmin.
#   R45f · la purga que no cuenta la tabla y la que no se la lleva.
#
# Dos roturas NO están, porque no rompen nada, y una rotura que no rompe
# nada es una prueba que miente sobre lo que cubre:
#   · la edición sin tenant (`using (true)` en datos_empresa_edicion): para
#     editar una fila hay que poder LEERLA, y la policy de lectura —que sí
#     se rompe acá— no deja ver la ajena;
#   · la puerta que toma el lubricentro del argumento Y ADEMÁS la RLS
#     abierta: es la suma de dos que ya están, y acusa el mismo renglón.
#
# Cuatro se prueban con el error crudo, porque las frena una segunda
# defensa con otro mensaje: el CUIT sin normalizar (lo rechaza la propia
# validación de la puerta), los textos sin recortar (el CHECK de la tabla),
# y las dos policies sin el superadmin (la RLS, adentro de la puerta).
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día
# (supabase db reset). Otro stack: DB_CONTAINER=supabase_db_<proyecto>.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i ${DB_CONTAINER:-supabase_db_fidelli-motors} psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql
M=supabase/migrations/20261004210000_datos_empresa.sql

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
# funciones que nacen con `create` se pasan a `create or replace` ANTES de
# comparar, así el guard mide solo la rotura.
correr_marcada() { # $1 = nombre · $2 = marcador · $3 = migración · $4 = sed · $5 = bloque · $6 = texto
  local orig roto
  orig=$(bloque "$2" "$3" | sed -e "s/^create function /create or replace function /")
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

# Un CHECK de la tabla, cambiado por otro más flojo con el mismo nombre
# (R45j lo busca por nombre: borrarlo a secas saltaría antes, en la forma).
aflojar() { # $1 = nombre del CHECK · $2 = la condición nueva
  echo "alter table datos_empresa drop constraint $1; alter table datos_empresa add constraint $1 check ($2);"
}

TENANT="lubricentro_id = mi_lubricentro_id()"

echo "── R45j · la forma ──"
correr "la tabla sin RLS" \
  "alter table datos_empresa disable row level security;" R45 "R45j AISLAMIENTO ROTO: datos_empresa no tiene RLS"
correr "anon con lectura de la tabla" \
  "grant select on datos_empresa to anon;" R45 "R45j \`anon\` tiene privilegios sobre datos_empresa"
correr "el owner que puede borrar" \
  "grant delete on datos_empresa to authenticated;" R45 "R45j authenticated puede BORRAR en datos_empresa"
correr "el sello escribible: actualizado_por" \
  "grant update (actualizado_por) on datos_empresa to authenticated;" R45 "R45j EL SELLO SE PUEDE ESCRIBIR DESDE AFUERA"
correr "el sello escribible: la edición de todas las columnas" \
  "grant update on datos_empresa to authenticated;" R45 "R45j EL SELLO SE PUEDE ESCRIBIR DESDE AFUERA"
correr "el sello escribible en el alta: todas las columnas" \
  "grant insert on datos_empresa to authenticated;" R45 "R45j EL SELLO SE PUEDE ESCRIBIR DESDE AFUERA"
correr "la fila que se puede mudar de tenant" \
  "grant update (lubricentro_id) on datos_empresa to authenticated;" R45 "R45j authenticated puede cambiar el lubricentro_id"
correr "el alta que no puede escribir el CUIT" \
  "revoke insert (cuit) on datos_empresa from authenticated;" R45 "R45j el alta no puede escribir «cuit»"
correr "la edición que no puede escribir el email" \
  "revoke update (email) on datos_empresa from authenticated;" R45 "R45j la edición no puede escribir «email»"
correr "una policy de borrado" \
  "create policy datos_empresa_borrado on datos_empresa for delete to authenticated using ($TENANT);" R45 "R45j datos_empresa tiene 4 policies (1 de borrado)"
correr "el CHECK del CUIT, borrado" \
  "alter table datos_empresa drop constraint cuit_formato;" R45 "R45j faltan CHECK en datos_empresa: cuit_formato"
correr "el CHECK de la condición de IVA, borrado" \
  "alter table datos_empresa drop constraint condicion_iva_valida;" R45 "R45j faltan CHECK en datos_empresa: condicion_iva_valida"
correr "el trigger del sello, borrado" \
  "drop trigger datos_empresa_sello on datos_empresa;" R45 "R45j falta el trigger datos_empresa_sello"
correr "el trigger del sello, deshabilitado" \
  "alter table datos_empresa disable trigger datos_empresa_sello;" R45 "R45j falta el trigger datos_empresa_sello"
correr "la FK a lubricentros sin cascada" \
  "alter table datos_empresa drop constraint datos_empresa_lubricentro_id_fkey; alter table datos_empresa add constraint datos_empresa_lubricentro_id_fkey foreign key (lubricentro_id) references lubricentros(id) on delete restrict;" R45 "R45j la FK de datos_empresa a lubricentros no es on delete cascade"
correr "la puerta como security definer" \
  "alter function guardar_datos_empresa(jsonb, uuid) security definer;" R45 "R45j guardar_datos_empresa es SECURITY DEFINER"
correr "la puerta ejecutable por anon" \
  "grant execute on function guardar_datos_empresa(jsonb, uuid) to anon;" R45 "R45j \`anon\` puede ejecutar guardar_datos_empresa()"
correr "la puerta que authenticated no ejecuta" \
  "revoke execute on function guardar_datos_empresa(jsonb, uuid) from authenticated;" R45 "R45j authenticated no puede ejecutar guardar_datos_empresa()"

echo "── R45a · la puerta ──"
# El CUIT sin normalizar: la propia validación de la puerta lo rechaza (con
# sus guiones mide trece), así que la prueba se pone en rojo con ese error.
correr_marcada "el CUIT guardado como se escribió, con sus guiones" guardar_datos_empresa "$M" \
  "/@cuit-normaliza/s/regexp_replace(coalesce(p_datos ->> 'cuit', ''), '\\\\D', '', 'g')/btrim(coalesce(p_datos ->> 'cuit', ''))/" R45 "cuit_invalido"
# Los textos sin recortar: los frena el CHECK de la tabla.
correr_marcada "la razón social sin recortar" guardar_datos_empresa "$M" \
  "/@recorta/s/btrim(coalesce(p_datos ->> 'razon_social', ''), E' \\\\t\\\\n\\\\r')/coalesce(p_datos ->> 'razon_social', '')/" R45 "razon_social_valida"
correr_marcada "el upsert que conserva lo que no viene (un dato no se puede vaciar)" guardar_datos_empresa "$M" \
  "s/razon_social  = excluded.razon_social,/razon_social  = coalesce(excluded.razon_social, datos_empresa.razon_social),/" R45 "R45a guardar sin la razón social, la condición y el domicilio los dejó como estaban"
correr_marcada "el teléfono de espacios guardado como texto" guardar_datos_empresa "$M" \
  "s/v_tel   := nullif(btrim(coalesce(p_datos ->> 'telefono', ''), E' \\\\t\\\\n\\\\r'), '');/v_tel := p_datos ->> 'telefono';/" R45 "telefono_valido"
correr_marcada "el sello que no se pone" datos_empresa_sellar "$M" \
  "/@sello/d" R45 "R45a EL SELLO NO QUEDÓ"

echo "── R45b · los rechazos ──"
correr_marcada "la clave mal escrita, ignorada" guardar_datos_empresa "$M" \
  "/@claves/s/where k not in (.*)/where false/" R45 "R45b UNA CLAVE MAL ESCRITA PASÓ"
correr_marcada "el CUIT a medias sin validar en la puerta" guardar_datos_empresa "$M" \
  "/@cuit-valida/s/char_length(v_cuit) <> 11/false/" R45 "R45b UN CUIT A MEDIAS"
correr_marcada "el CUIT validado con «al menos once»" guardar_datos_empresa "$M" \
  "/@cuit-valida/s/char_length(v_cuit) <> 11/char_length(v_cuit) < 11/" R45 "R45b con doce números la puerta contestó"
correr_marcada "la condición de IVA sin validar en la puerta" guardar_datos_empresa "$M" \
  "/@iva-valida/s/v_iva not in (.*) then/false then/" R45 "R45b una condición frente al IVA que no es de la lista contestó"
correr_marcada "los largos sin validar en la puerta" guardar_datos_empresa "$M" \
  "/@largos/s/if .* then/if false then/" R45 "R45b un domicilio de 161 caracteres contestó"
correr_marcada "el tope del domicilio corrido a 159" guardar_datos_empresa "$M" \
  "/@largos/s/char_length(v_dom) > 160/char_length(v_dom) > 159/" R45 "R45b los cuatro textos en su tope exacto"
correr_marcada "un jsonb que no es un objeto, sin mirar" guardar_datos_empresa "$M" \
  "s/if p_datos is null or jsonb_typeof(p_datos) <> 'object' then/if false then/" R45 "R45b un jsonb que no es un objeto contestó"
correr "el CHECK del CUIT que acepta guiones" \
  "$(aflojar cuit_formato "cuit is null or cuit ~ '^[0-9-]{11,13}\$'")" R45 "R45b UN CUIT CON GUIONES ENTRÓ POR LA TABLA"
correr "el CHECK del CUIT con «al menos diez»" \
  "$(aflojar cuit_formato "cuit is null or cuit ~ '^[0-9]{10,11}\$'")" R45 "R45b un CUIT de diez números entró por la tabla"
correr "el CHECK de la condición de IVA, abierto" \
  "$(aflojar condicion_iva_valida "true")" R45 "R45b una condición frente al IVA inventada entró por la tabla"
correr "la razón social vacía aceptada" \
  "$(aflojar razon_social_valida "razon_social is null or char_length(razon_social) <= 120")" R45 "R45b una razón social vacía"
correr "el domicilio con espacios a los costados" \
  "$(aflojar domicilio_valido "domicilio is null or (char_length(domicilio) between 1 and 160 and domicilio !~ '[[:cntrl:]]')")" R45 "R45b un domicilio con espacios a los costados entró por la tabla"
correr "el teléfono con un salto de línea" \
  "$(aflojar telefono_valido "telefono is null or (char_length(telefono) between 1 and 40 and telefono = btrim(telefono))")" R45 "R45b un teléfono con un salto de línea entró por la tabla"
correr "el email sin tope" \
  "$(aflojar email_valido "email is null or (char_length(email) >= 1 and email = btrim(email) and email !~ '[[:cntrl:]]')")" R45 "R45b un email de 121 caracteres entró por la tabla"

echo "── R45c · el sello ──"
correr_marcada "el sello que respeta el autor que le mandan" datos_empresa_sellar "$M" \
  "/@sello/s/new.actualizado_por := auth.uid();/new.actualizado_por := coalesce(new.actualizado_por, auth.uid());/" R45 "R45c EL SELLO SE DEJÓ ESCRIBIR"
correr_marcada "el sello que no pone la fecha" datos_empresa_sellar "$M" \
  "/new.updated_at := now();/d" R45 "R45c EL SELLO SE DEJÓ ESCRIBIR"

echo "── R45d · el aislamiento ──"
correr "la lectura sin tenant" \
  "alter policy datos_empresa_lectura on datos_empresa using (true);" R45 "R45d AISLAMIENTO ROTO: el owner del demo ve"
correr "el alta sin tenant" \
  "alter policy datos_empresa_alta on datos_empresa with check (true);" R45 "R45d EL OWNER DIO DE ALTA LA FILA DE OTRO TENANT"
correr_marcada "la puerta que le cree a un owner el lubricentro que le pasa" guardar_datos_empresa "$M" \
  "s/v_lub := mi_lubricentro_id();/v_lub := coalesce(p_lubricentro_id, mi_lubricentro_id());/; /@otro-tenant/s/if .* then/if false then/" R45 "R45d LA PUERTA NO FRENA A UN OWNER QUE LE PASA OTRO LUBRICENTRO"

echo "── R45e · Fidelli ──"
correr_marcada "la puerta sin el «falta el lubricentro»" guardar_datos_empresa "$M" \
  "/@falta-lubricentro/d" R45 "R45e al superadmin que no dice de qué lubricentro"
# Las dos que siguen las frena la RLS adentro de la puerta: el error crudo.
correr "el alta que se olvida del superadmin" \
  "alter policy datos_empresa_alta on datos_empresa with check ($TENANT);" R45 "new row violates row-level security policy for table \"datos_empresa\""
correr "la lectura que se olvida del superadmin" \
  "alter policy datos_empresa_lectura on datos_empresa using ($TENANT);" R45 "new row violates row-level security policy for table \"datos_empresa\""

echo "── R45f · la purga ──"
correr_marcada "la purga que no se lleva los datos de la empresa" purgar_tenants_vencidos "$M" \
  "/@purga-empresa/d" R45 "R45f LA PURGA DEJÓ LOS DATOS DE LA EMPRESA"
correr_marcada "la simulación que no los cuenta" purgar_tenants_vencidos "$M" \
  "/'datos_empresa',/d" R45 "R45f la simulación de la purga no cuenta datos_empresa"

echo
if [ "$fallas" -eq 0 ]; then
  echo "LA RED ATRAPÓ LAS $total ROTURAS"
else
  echo "ALGUNA ROTURA SE ESCAPÓ (de $total)"
fi
exit "$fallas"
