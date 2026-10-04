#!/bin/bash
# La rotura a mano de R43 y R44 (regla 13): los adjuntos de un trabajo y el
# tope del slug. Cada afirmación se corre con SU rotura —la regla exacta
# que dice cubrir— y tiene que ponerse en ROJO. Una prueba que nunca se vio
# fallar es una prueba que no existe.
#
#   R43j · la forma: la tabla sin RLS, `anon` con lectura, el alta que deja
#          mandar «Mostrar al cliente» (o todas las columnas), la edición
#          de todas las columnas, el trigger del tope borrado, la FK sin
#          cascada, el bucket público, con otro tope o con otro formato,
#          una policy del bucket para `anon`, el bucket sin su policy de
#          subida, adjunto_publico() ejecutable por `anon` o sin definer, y
#          adjuntos_huerfanos() ejecutable por un owner.
#   R43a · el alta: el adjunto que nace visible, el que no queda a nombre
#          de quien lo subió, el tenant del insert creído en vez de pisado,
#          el alta atada al plazo de edición (la copia
#          tentadora de la policy de las ruedas: adjuntar NO edita el
#          cartón), la ruta sin su CHECK o mirando solo la carpeta del
#          tenant, el peso sin CHECK, a 10 MB y con el borde corrido, el
#          formato sin CHECK y el nombre sin CHECK.
#   R43b · el tope: en 4, en 2, con otro error que el que la pantalla
#          traduce, contado por tenant en vez de por trabajo, salteado
#          fuera de la sesión del owner, y el borrado atado al plazo.
#   R43c · «Mostrar al cliente» atado al plazo de edición.
#   R43d · el aislamiento: la lectura sin tenant; el bucket sin carpeta en
#          la lectura y en la subida; el borrado del bucket que no mira si
#          el archivo está registrado, y el que no deja borrar lo que no se
#          registró.
#   R43e · la puerta del cliente sin cada una de sus condiciones: visible,
#          no anulado, la patente, el slug, y la patente sin normalizar.
#   R43f · get_carton: listando los ocultos, con la ruta del archivo, sin
#          la clave (la definición del service de caja, restaurada), sin
#          `prox_caja_km` (redefinida desde una versión vieja) y en el
#          orden inverso.
#   R43g · los huérfanos: sin el margen de la subida en vuelo, sin mirar
#          la fila, sin filtrar el bucket y con el margen de un mes.
#   R44  · el slug: sin el CHECK, con el tope en 33 y en 31, y
#          slug_estado() con el tope viejo y con uno de menos.
#
# Cinco roturas NO están, porque no rompen nada, y una rotura que no rompe
# nada es una prueba que miente sobre lo que cubre:
#   · la policy de alta abierta (`with check (true)`): al owner lo frena
#     igual el tenant heredado, que con su sesión no encuentra el trabajo
#     ajeno y queda en null (23502);
#   · la edición y el borrado de la tabla sin tenant, y el borrado del
#     bucket sin carpeta: para tocar una fila hay que poder leerla, y la
#     policy de LECTURA —que sí se rompe acá— no deja ver la ajena;
#   · el alta por columnas probada fila por fila: la misma lista de
#     privilegios la comprueba antes R43j, por catálogo, y es la que salta.
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
M=supabase/migrations/20261004200000_adjuntos_trabajo.sql
# get_carton SIN los adjuntos: la definición del service de caja.
M_CAJA=supabase/migrations/20261004120100_service_caja.sql

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

# Una policy de adjuntos_trabajo atada al plazo de edición del trabajo: la
# copia tentadora de `ruedas_escritura`, que es justo lo que NO va acá.
EN_PLAZO="lubricentro_id = mi_lubricentro_id() and exists (select 1 from services s where s.id = adjuntos_trabajo.service_id and now() - s.created_at < plazo_edicion(s.tipo))"
TENANT="lubricentro_id = mi_lubricentro_id() or soy_superadmin()"
# La carpeta del propio tenant en el bucket.
CARPETA="(storage.foldername(name))[1] = public.mi_lubricentro_id()::text"

echo "── R43j · la forma ──"
correr "la tabla sin RLS" \
  "alter table adjuntos_trabajo disable row level security;" R43 "R43j AISLAMIENTO ROTO: adjuntos_trabajo no tiene RLS"
correr "anon con lectura de la tabla" \
  "grant select on adjuntos_trabajo to anon;" R43 "R43j \`anon\` tiene privilegios sobre adjuntos_trabajo"
correr "el alta que deja mandar «Mostrar al cliente»" \
  "grant insert (visible_cliente) on adjuntos_trabajo to authenticated;" R43 "R43j authenticated puede insertar las columnas «service_id, lubricentro_id, nombre, ruta, mime, bytes, visible_cliente»"
correr "el alta de todas las columnas" \
  "grant insert on adjuntos_trabajo to authenticated;" R43 "R43j authenticated puede insertar las columnas"
correr "la edición de todas las columnas" \
  "grant update on adjuntos_trabajo to authenticated;" R43 "R43j authenticated puede actualizar las columnas"
correr "la edición del nombre" \
  "grant update (nombre) on adjuntos_trabajo to authenticated;" R43 "R43j authenticated puede actualizar las columnas «nombre, visible_cliente»"
correr "el trigger del tope, borrado" \
  "drop trigger adjuntos_trabajo_tope on adjuntos_trabajo;" R43 "R43j faltan triggers de adjuntos_trabajo"
correr "la FK a services sin cascada" \
  "alter table adjuntos_trabajo drop constraint adjuntos_trabajo_service_id_fkey; alter table adjuntos_trabajo add constraint adjuntos_trabajo_service_id_fkey foreign key (service_id) references services(id);" R43 "R43j la FK de adjuntos_trabajo a services no es ON DELETE CASCADE"
correr "el bucket público" \
  "update storage.buckets set public = true where id = 'adjuntos';" R43 "R43j EL BUCKET «adjuntos» ES PÚBLICO"
correr "el bucket con tope de 10 MB" \
  "update storage.buckets set file_size_limit = 10485760 where id = 'adjuntos';" R43 "R43j el bucket «adjuntos» tiene un tope de 10485760"
correr "el bucket que también acepta HTML" \
  "update storage.buckets set allowed_mime_types = allowed_mime_types || array['text/html'] where id = 'adjuntos';" R43 "R43j el bucket «adjuntos» acepta"
correr "una policy del bucket para anon (los visibles, «total están marcados»)" \
  "create policy \"adjuntos visibles\" on storage.objects for select to anon using (bucket_id = 'adjuntos' and exists (select 1 from public.adjuntos_trabajo a where a.ruta = objects.name and a.visible_cliente));" R43 "R43j 1 policy(s) del bucket «adjuntos» alcanzan a \`anon\`"
correr "el bucket sin su policy de subida" \
  "drop policy \"adjuntos subida propia\" on storage.objects;" R43 "R43j el bucket «adjuntos» tiene 2 policy(s)"
correr "adjunto_publico() ejecutable por anon" \
  "grant execute on function adjunto_publico(uuid, text, text) to anon;" R43 "R43j adjunto_publico() la ejecutan"
correr "adjunto_publico() sin security definer" \
  "alter function adjunto_publico(uuid, text, text) security invoker;" R43 "R43j adjunto_publico() no es SECURITY DEFINER"
correr "adjuntos_huerfanos() ejecutable por un owner" \
  "grant execute on function adjuntos_huerfanos() to authenticated;" R43 "R43j adjuntos_huerfanos() es del cierre diario"

echo "── R43a · el alta ──"
correr "el adjunto que nace visible" \
  "alter table adjuntos_trabajo alter column visible_cliente set default true;" R43 "R43a UN ADJUNTO NACIÓ VISIBLE PARA EL CLIENTE"
correr_marcada "el adjunto que no queda a nombre de quien lo subió" adjuntos_trabajo_heredar_tenant "$M" \
  "/@subido-por/d" R43 "R43a el adjunto no quedó a nombre de quien lo subió"
correr_marcada "el tenant del insert, creído (el trigger solo completa si viene vacío)" adjuntos_trabajo_heredar_tenant "$M" \
  "s/from services where id = new.service_id;/from services where id = new.service_id and new.lubricentro_id is null;/" R43 "R43a con el tenant de al lado escrito a mano, el adjunto no entró"
correr "el alta atada al plazo de edición" \
  "drop policy adjuntos_alta on adjuntos_trabajo; create policy adjuntos_alta on adjuntos_trabajo for insert to authenticated with check (($EN_PLAZO) or soy_superadmin());" R43 "R43a NO SE PUDO ADJUNTAR A UN TRABAJO FIJADO"
correr "la ruta sin su CHECK" \
  "alter table adjuntos_trabajo drop constraint adjunto_ruta_valida;" R43 "R43a ENTRÓ un adjunto con el archivo en la carpeta de OTRO trabajo"
correr "la ruta que solo mira la carpeta del tenant" \
  "alter table adjuntos_trabajo drop constraint adjunto_ruta_valida; alter table adjuntos_trabajo add constraint adjunto_ruta_valida check (ruta like lubricentro_id::text || '/%');" R43 "R43a ENTRÓ un adjunto con el archivo en la carpeta de OTRO trabajo"
correr "el peso sin CHECK" \
  "alter table adjuntos_trabajo drop constraint adjunto_bytes_validos;" R43 "R43a ENTRÓ un adjunto con un archivo vacío"
correr "el peso con tope de 10 MB" \
  "alter table adjuntos_trabajo drop constraint adjunto_bytes_validos; alter table adjuntos_trabajo add constraint adjunto_bytes_validos check (bytes between 1 and 10485760);" R43 "R43a ENTRÓ un adjunto con un archivo de 2 MB y un byte"
correr "el peso con el borde corrido (menos de 2 MB)" \
  "alter table adjuntos_trabajo drop constraint adjunto_bytes_validos; alter table adjuntos_trabajo add constraint adjunto_bytes_validos check (bytes between 1 and 2097151);" R43 "R43a un archivo de exactamente 2 MB no entró"
correr "el formato sin CHECK" \
  "alter table adjuntos_trabajo drop constraint adjunto_mime_valido;" R43 "R43a ENTRÓ un adjunto con un formato que no es PDF, JPEG ni PNG"
correr "el nombre sin CHECK" \
  "alter table adjuntos_trabajo drop constraint adjunto_nombre_valido;" R43 "R43a ENTRÓ un adjunto con un nombre en blanco"

echo "── R43b · el tope ──"
correr_marcada "el tope en cuatro" adjuntos_trabajo_tope "$M" \
  "/@tope/s/>= 3/>= 4/" R43 "R43b EL CUARTO ADJUNTO ENTRÓ"
correr_marcada "el tope en dos" adjuntos_trabajo_tope "$M" \
  "/@tope/s/>= 3/>= 2/" R43 "R43b el tercer adjunto no entró"
correr_marcada "el tope con otro error que el que la pantalla traduce" adjuntos_trabajo_tope "$M" \
  "s/'tope_adjuntos'/'demasiados_adjuntos'/" R43 "R43b el cuarto adjunto lo frenó"
correr_marcada "el tope contado por tenant, no por trabajo" adjuntos_trabajo_tope "$M" \
  "s/from adjuntos_trabajo where service_id = new.service_id;/from adjuntos_trabajo;/" R43 "falló con «P0001 tope_adjuntos»"
correr_marcada "el tope salteado fuera de la sesión del owner" adjuntos_trabajo_tope "$M" \
  "s/if v_cuantos >= 3 then -- @tope/if v_cuantos >= 3 and auth.uid() is not null then/" R43 "R43b el cuarto adjunto entró (o falló con otra cosa) fuera de la sesión del owner"
correr "el borrado atado al plazo de edición" \
  "drop policy adjuntos_borrado on adjuntos_trabajo; create policy adjuntos_borrado on adjuntos_trabajo for delete to authenticated using (($EN_PLAZO) or soy_superadmin());" R43 "R43b el owner no pudo quitar un adjunto de un trabajo fijado"

echo "── R43c · lo único que se edita ──"
correr "«Mostrar al cliente» atado al plazo de edición" \
  "drop policy adjuntos_visibilidad on adjuntos_trabajo; create policy adjuntos_visibilidad on adjuntos_trabajo for update to authenticated using (($EN_PLAZO) or soy_superadmin()) with check ($TENANT);" R43 "R43c el owner no pudo prender «Mostrar al cliente»"

echo "── R43d · el aislamiento ──"
correr "la lectura sin tenant" \
  "drop policy adjuntos_lectura on adjuntos_trabajo; create policy adjuntos_lectura on adjuntos_trabajo for select to authenticated using (true);" R43 "R43d AISLAMIENTO ROTO: el owner lee"
correr "el bucket: la lectura sin carpeta" \
  "drop policy \"adjuntos lectura\" on storage.objects; create policy \"adjuntos lectura\" on storage.objects for select to authenticated using (bucket_id = 'adjuntos');" R43 "R43d EN EL BUCKET adjuntos EL OWNER VE 1 ARCHIVO(S) DE SU CARPETA Y 1 DE LA AJENA"
correr "el bucket: la subida sin carpeta" \
  "drop policy \"adjuntos subida propia\" on storage.objects; create policy \"adjuntos subida propia\" on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos');" R43 "R43d AISLAMIENTO ROTO: el owner subió"
correr "el bucket: el borrado que no mira si el archivo está registrado" \
  "drop policy \"adjuntos borrado propio\" on storage.objects; create policy \"adjuntos borrado propio\" on storage.objects for delete to authenticated using (bucket_id = 'adjuntos' and $CARPETA);" R43 "R43d el owner borró del bucket un archivo REGISTRADO (1)"
correr "el bucket: el owner que no puede borrar lo que no se registró" \
  "drop policy \"adjuntos borrado propio\" on storage.objects; create policy \"adjuntos borrado propio\" on storage.objects for delete to authenticated using (bucket_id = 'adjuntos' and public.soy_superadmin());" R43 "R43d el owner no pudo borrar de su carpeta un archivo sin registrar"

echo "── R43e · la puerta del cliente ──"
correr_marcada "sin mirar «Mostrar al cliente»" adjunto_publico "$M" \
  "/@publico-visible/d" R43 "R43e adjunto_publico() ENTREGÓ UN ADJUNTO OCULTO"
correr_marcada "sin mirar la patente" adjunto_publico "$M" \
  "/@publico-patente/d" R43 "R43e adjunto_publico() entregó un adjunto pedido con la patente de OTRO vehículo"
correr_marcada "sin mirar el slug" adjunto_publico "$M" \
  "/@publico-slug/d" R43 "R43e adjunto_publico() entregó un adjunto del demo pedido con el slug de OTRO tenant"
correr_marcada "sin mirar si el trabajo está anulado" adjunto_publico "$M" \
  "/@publico-anulado/d" R43 "R43e adjunto_publico() entregó el adjunto de un trabajo ANULADO"
correr_marcada "la patente sin normalizar" adjunto_publico "$M" \
  "/@publico-patente/s/normalizar_patente(p_patente)/p_patente/" R43 "R43e adjunto_publico() no devolvió la ruta de un adjunto visible"

echo "── R43f · get_carton ──"
correr_marcada "listando los ocultos" get_carton "$M" \
  "/@adjuntos-visibles/d" R43 "R43f get_carton lista"
correr_marcada "con la ruta del archivo" get_carton "$M" \
  "s/'mime', aj.mime,/'mime', aj.mime, 'ruta', aj.ruta,/" R43 "R43f cada adjunto de get_carton trae «creado, id, mime, nombre, ruta»"
correr "sin la clave (la definición del service de caja, restaurada)" \
  "$(bloque get_carton "$M_CAJA")" R43 "R43f get_carton no trae la clave «adjuntos»"
correr_marcada "sin prox_caja_km (redefinida desde una versión vieja)" get_carton "$M" \
  "/@prox-caja/d" R43 "R43f get_carton PERDIÓ «prox_caja_km»"
correr_marcada "en el orden inverso" get_carton "$M" \
  "s/order by aj.created_at, aj.id/order by aj.created_at desc, aj.id/" R43 "R43f con dos adjuntos visibles get_carton lista"

echo "── R43g · los huérfanos ──"
correr_marcada "sin el margen de la subida en vuelo" adjuntos_huerfanos "$M" \
  "/@huerfanos-en-vuelo/d" R43 "R43g adjuntos_huerfanos() lista un archivo recién subido"
correr_marcada "sin mirar la fila" adjuntos_huerfanos "$M" \
  "/@huerfanos-sin-fila/d" R43 "R43g adjuntos_huerfanos() LISTA UN ARCHIVO QUE TIENE SU FILA"
correr_marcada "sin filtrar el bucket" adjuntos_huerfanos "$M" \
  "/@huerfanos-bucket/s/o.bucket_id = 'adjuntos'/true/" R43 "R43g adjuntos_huerfanos() lista archivos de OTRO bucket"
correr_marcada "con el margen de un mes" adjuntos_huerfanos "$M" \
  "/@huerfanos-en-vuelo/s/interval '1 day'/interval '30 days'/" R43 "R43g adjuntos_huerfanos() no lista un archivo sin fila de hace dos días"

echo "── R44 · el slug entra en el QR ──"
correr "sin el CHECK" \
  "alter table lubricentros drop constraint slug_largo_qr;" R44 "R44 falta el CHECK slug_largo_qr"
correr "el tope en 33" \
  "alter table lubricentros drop constraint slug_largo_qr; alter table lubricentros add constraint slug_largo_qr check (char_length(slug) <= 33);" R44 "R44 ENTRÓ UN SLUG DE 33 CARACTERES por INSERT"
correr "el tope en 31" \
  "alter table lubricentros drop constraint slug_largo_qr; alter table lubricentros add constraint slug_largo_qr check (char_length(slug) <= 31);" R44 "violates check constraint \"slug_largo_qr\""
correr_marcada "slug_estado() con el tope viejo" slug_estado "$M" \
  "/@slug-tope/s/> 32/> 60/" R44 "R44 slug_estado() contesta «disponible» para un slug de 33 caracteres"
correr_marcada "slug_estado() con uno de menos" slug_estado "$M" \
  "/@slug-tope/s/> 32/> 31/" R44 "R44 slug_estado() contesta «invalido» para un slug libre de 32 caracteres"

echo
if [ "$fallas" -eq 0 ]; then
  echo "La red atrapó las $total roturas."
else
  echo "LA RED DEJÓ PASAR ROTURAS. No se pushea."
fi
exit "$fallas"
