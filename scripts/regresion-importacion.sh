#!/bin/bash
# La importación de una planilla, de punta a punta, contra el Postgres LOCAL.
#
#   ./scripts/regresion-importacion.sh                  # la prueba entera
#   ./scripts/regresion-importacion.sh --dejar          # importa y deja el tenant, para mirar la app
#   ./scripts/regresion-importacion.sh --limpiar        # solo borra el tenant de prueba
#   ./scripts/regresion-importacion.sh otro-limpio.json # con otra planilla
#
# No toca dev ni producción: habla con el contenedor supabase_db_fidelli-motors
# y con nadie más. Requiere el stack local (supabase start) con el schema al
# día (supabase db reset) y la planilla limpia en importaciones/ (que NO está
# en el repo: tiene datos personales).
#
# Qué prueba, en este orden:
#   1 · Un tenant zz-prueba-falco creado por crear_lubricentro(), con su
#       sucursal y su owner.
#   2 · El SQL que genera scripts/importar-planilla.mjs entra, y los conteos
#       del raise notice son los del JSON. Cero filas rechazadas (y si hay,
#       se listan con su n_planilla: la prueba las reporta, no las esconde).
#   2b· Una planilla sintética con filas que la base rechaza: salen listadas
#       con su n_planilla y las demás entran igual.
#   3 · Corrido otra vez: ya_importado, y los conteos no cambian.
#   4 · get_carton devuelve el historial del auto, todo fijado, con sus
#       renglones y el nombre del aceite.
#   5 · El premio no cuenta lo importado (services_ciclo = 0, en las DOS
#       funciones), y un service cargado por guardar_service lo pasa a 1.
#   6 · vista_proximos_service: ninguna fila con el último service de hace
#       más de 18 meses, y hay filas.
#   7 · Las métricas de la plataforma no cambian con la importación —las
#       catorce lecturas, no solo el acumulado—, y resumen_inicio() del
#       owner SÍ la muestra.
#   9 · El SQL de deshacer deja el tenant exactamente como antes.
#   8 · Con un vehículo y un producto que ya existían, la re-importación los
#       reusa: el auto conserva su cliente y la planilla no le crea uno.
#   9b· Deshacer con historia propia: el auto importado al que se le cargó
#       un trabajo en el panel se queda, sin la marca, y la re-importación
#       lo reusa.
#  10 · Borra zz-prueba-falco entero.
#
# Sale con 0 si todo pasó; 1 si algo falló; 2 si no se pudo ni empezar.
set -u
cd "$(dirname "$0")/.."

DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
SLUG=zz-prueba-falco
EMAIL=zz-prueba-falco@fidellimotors.app
CLAVE=falco-local-1234   # solo existe en la base local, y se borra con el tenant
PATENTE=AA044DV          # el auto del paso 4

JSON=importaciones/falco/falco-limpio.json
MODO=prueba
for a in "$@"; do
  case "$a" in
    --dejar) MODO=dejar ;;
    --limpiar) MODO=limpiar ;;
    --*) echo "No conozco $a"; exit 2 ;;
    *) JSON=$a ;;
  esac
done

fallas=0
ok()  { echo "  ✓ $1"; }
mal() { echo "  ✗ $1"; fallas=1; }
igual() { # $1 = qué · $2 = obtenido · $3 = esperado
  if [ "$2" = "$3" ]; then ok "$1: $2"; else mal "$1: obtuve «$2», esperaba «$3»"; fi
}
q() { $DB -qtA -c "$1" 2>&1; }

# Una consulta como el superadmin del seed (las métricas de plataforma
# tienen guarda) o como el owner del tenant de prueba. Con rollback.
como() { # $1 = super | owner · $2 = SQL
  local sub rol=""
  if [ "$1" = super ]; then
    sub="(select id from usuarios where rol = 'superadmin' order by created_at limit 1)"
  else
    sub="(select u.id from usuarios u join lubricentros l on l.id = u.lubricentro_id where l.slug = '$SLUG' and u.rol = 'owner')"
    # El owner, con SU rol: lo que ve lo recorta el RLS, como en el panel.
    rol="set local role authenticated;"
  fi
  $DB -qtA -v ON_ERROR_STOP=1 2>&1 <<SQL
begin;
do \$\$ begin perform set_config('request.jwt.claims', json_build_object('sub', $sub, 'role', 'authenticated')::text, true); end \$\$;
$rol
$2
rollback;
SQL
}

borrar_tenant() {
  $DB -q -v ON_ERROR_STOP=1 2>&1 <<SQL
do \$\$
declare v_lub uuid;
begin
  select id into v_lub from lubricentros where slug = '$SLUG';
  if v_lub is null then return; end if;
  delete from landing_busquedas   where lubricentro_id = v_lub;
  delete from service_items       where lubricentro_id = v_lub;
  delete from services            where lubricentro_id = v_lub;
  delete from vehiculos           where lubricentro_id = v_lub;
  delete from clientes            where lubricentro_id = v_lub;
  delete from productos           where lubricentro_id = v_lub;
  delete from mensaje_templates   where lubricentro_id = v_lub;
  delete from config_experiencia  where lubricentro_id = v_lub;
  delete from premios             where lubricentro_id = v_lub;
  delete from suscripciones       where lubricentro_id = v_lub;
  delete from sucursales          where lubricentro_id = v_lub;
  delete from usuarios            where lubricentro_id = v_lub;
  delete from auth.users          where email = '$EMAIL';
  delete from lubricentros        where id = v_lub;
end \$\$;
SQL
}

# ── 0 · Preparación ─────────────────────────────────────────────────────────
if ! docker exec supabase_db_fidelli-motors true 2>/dev/null; then
  echo "✗ El stack local no está levantado (supabase start)."; exit 2
fi
if [ "$MODO" = limpiar ]; then
  borrar_tenant; igual "tenants $SLUG en la base" "$(q "select count(*) from lubricentros where slug = '$SLUG'")" 0
  exit $fallas
fi
if [ ! -f "$JSON" ]; then
  echo "✗ No está $JSON. La planilla limpia no viaja con el repo (datos personales)."; exit 2
fi

SALIDA="$(dirname "$JSON")/$SLUG-importar.sql"
DESHACER="$(dirname "$JSON")/$SLUG-deshacer.sql"

echo "── 0 · El SQL, generado sin conectarse a nada ──"
if ! node scripts/importar-planilla.mjs "$JSON" --slug "$SLUG" --salida "$SALIDA" | sed 's/^/  /'; then
  echo "✗ El script no generó el SQL."; exit 2
fi
[ -s "$SALIDA" ] && [ -s "$DESHACER" ] && ok "escribió la importación y el deshacer" || mal "falta alguno de los dos archivos"
if grep -E "^import " scripts/importar-planilla.mjs | grep -qvE 'from "node:(fs|path)";$' \
   || grep -qE "fetch\(|require\(|import\(" scripts/importar-planilla.mjs; then
  mal "el script importa algo más que node:fs y node:path, o llama a la red"
else
  ok "el script solo importa node:fs y node:path: no tiene con qué conectarse a una base"
fi

# Lo que la planilla dice que tiene que entrar. PRE es un auto cuyo cliente
# tiene ese solo auto (el que «ya existía» del paso 8); V5 es otro, con 5 o
# más services (el del premio y el de la historia propia); P1 un producto.
# Sus patentes no se imprimen: la salida de esta prueba se pega en un PR.
eval "$(node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const patente = process.argv[2];
const vacio = (v) => v === null || v === undefined || v === "";
const autosDe = {}; for (const v of j.vehiculos) autosDe[v.cliente_key] = (autosDe[v.cliente_key] || 0) + 1;
const svc = {}; for (const s of j.services) (svc[s.vehiculo_key] ||= []).push(s);
const mec = {}; for (const m of j.mecanicas) (mec[m.vehiculo_key] ||= []).push(m);
const conRenglon = new Set(j.renglones.map((r) => r.n_planilla));
const solo = j.vehiculos.filter((v) => autosDe[v.cliente_key] === 1);
const v5 = solo.find((v) => (svc[v.vehiculo_key] || []).length >= 5);
const pre = solo.find((v) => v !== v5 && (svc[v.vehiculo_key] || []).length >= 2);
const carton = j.vehiculos.find((v) => v.patente_normalizada === patente);
const sc = carton ? svc[carton.vehiculo_key] || [] : [];
const p1 = j.productos[0];
const porDia = {}; for (const s of [...j.services, ...j.mecanicas]) porDia[s.fecha] = (porDia[s.fecha] || 0) + 1;
const dia = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0][0];
const C = String.fromCharCode(39);
const sh = (k, v) => console.log(k + "=" + C + String(v ?? "").split(C).join(C + "\\" + C + C) + C);
sh("ORIGEN", j.meta.origen);
sh("E_CLIENTES", j.clientes.length); sh("E_VEHICULOS", j.vehiculos.length); sh("E_PRODUCTOS", j.productos.length);
sh("E_SERVICES", j.services.length); sh("E_RENGLONES", j.renglones.length); sh("E_MECANICAS", j.mecanicas.length);
sh("E_CARTON", carton ? sc.length + (mec[carton.vehiculo_key] || []).length : "");
sh("E_CARTON_RENGLONES", sc.filter((s) => conRenglon.has(s.n_planilla)).length);
sh("E_CARTON_ACEITE", sc.filter((s) => !vacio(s.aceite_nombre)).length);
sh("PRE", pre ? pre.patente : ""); sh("PRE_NORM", pre ? pre.patente_normalizada : "");
sh("E_PRE_TRABAJOS", pre ? svc[pre.vehiculo_key].length + (mec[pre.vehiculo_key] || []).length : "");
sh("V5_NORM", v5 ? v5.patente_normalizada : "");
sh("P1_NOMBRE_SQL", p1.nombre.split(C).join(C + C)); sh("E_P1_USOS", j.services.filter((s) => s.producto_key === p1.producto_key).length);
sh("DIA", dia);
' "$JSON" "$PATENTE")"
E_TRABAJOS=$((E_SERVICES + E_MECANICAS))
if [ -z "$E_CARTON" ] || [ -z "$PRE" ] || [ -z "$V5_NORM" ]; then
  echo "✗ La planilla no trae lo que la prueba necesita ($PATENTE, un auto con 5+ services, otro con 2+)."; exit 2
fi

# Los conteos que deja el tenant, de una: los cuatro con la marca, y el total.
conteos() {
  q "select format('clientes %s/%s · vehículos %s/%s · productos %s/%s · trabajos %s/%s · renglones %s',
       (select count(*) from clientes  where lubricentro_id = l.id and importado_de = '$ORIGEN'), (select count(*) from clientes  where lubricentro_id = l.id),
       (select count(*) from vehiculos where lubricentro_id = l.id and importado_de = '$ORIGEN'), (select count(*) from vehiculos where lubricentro_id = l.id),
       (select count(*) from productos where lubricentro_id = l.id and importado_de = '$ORIGEN'), (select count(*) from productos where lubricentro_id = l.id),
       (select count(*) from services  where lubricentro_id = l.id and importado_de = '$ORIGEN'), (select count(*) from services  where lubricentro_id = l.id),
       (select count(*) from service_items where lubricentro_id = l.id))
     from lubricentros l where l.slug = '$SLUG'"
}

# Todo lo que mide a la plataforma, en un jsonb: tiene que dar lo mismo
# antes y después de importar. Las dos fotos del cierre diario se sacan
# adentro de la transacción y se deshacen: los snapshots tienen candado.
#
# Con «sonda», antes de medir se agregan (y se deshacen con el rollback) 25
# trabajos importados DE HOY, con un contacto previo en uno de los autos. La
# planilla de Falco termina antes de su alta, así que sola no puede poner en
# rojo las lecturas que miran lo reciente: la ventana de activación (7 días
# desde el alta, por created_at), el mes en curso y los autos que volvieron
# después de un recordatorio. Otra planilla sí puede traer trabajos
# posteriores al alta, y esas lecturas tampoco los tienen que contar.
foto_plataforma() { # $1 = sonda (opcional)
  local sonda=""
  if [ "${1:-}" = sonda ]; then sonda="
do \$\$
declare v_lub uuid; v_suc uuid; v_owner uuid;
begin
  select id into v_lub from lubricentros where slug = '$SLUG';
  select id into v_suc from sucursales where lubricentro_id = v_lub;
  select id into v_owner from usuarios where lubricentro_id = v_lub and rol = 'owner';
  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, created_at)
  select v_lub, v.id, v_owner, 'vencido', now() - interval '1 hour'
  from vehiculos v where v.lubricentro_id = v_lub order by v.id limit 1;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, kilometros, aceite_tipo, prox_service_km, importado_de, created_at)
  select v_lub, v_suc, v.id, v_owner, 'service', current_date, 2000000, '10W40', 2010000, '$ORIGEN', now()
  from (select id from vehiculos where lubricentro_id = v_lub order by id limit 25) v;
end \$\$;"
  fi
  como super "$sonda
do \$\$ begin
  perform foto_tenant_del_dia(date '$DIA', l) from lubricentros l where l.slug = '$SLUG';
  perform foto_plataforma_del_dia(date '$DIA', 1000, 'cierre');
end \$\$;
select jsonb_build_object(
  'metricas_plataforma · acumulado',    m -> 'acumulado',
  'metricas_plataforma · trabajos_mes', m -> 'trabajos_mes',
  'metricas_plataforma · series',       md5((m -> 'series')::text),
  'metricas_plataforma · primer_trabajo', m -> 'primer_trabajo',
  'resumen_admin · trabajos', jsonb_build_object('mes', r -> 'trabajos_mes', 'service', r -> 'trabajos_service',
     'mecanica', r -> 'trabajos_mecanica', 'neumaticos', r -> 'trabajos_neumaticos', 'mes_anterior', r -> 'trabajos_mes_anterior'),
  'resumen_admin · el tenant en sin_trabajos',
     (select x from jsonb_array_elements(r -> 'sin_trabajos') x where x ->> 'id' = t.id::text),
  'indicadores_tenants', (select jsonb_build_object('trabajos_30', i.trabajos_30, 'ultimo', i.ultimo_trabajo, 'activado', i.activado)
     from indicadores_tenants() i where i.lubricentro_id = t.id),
  'trabajos_semanales · 104 semanas', (select sum(w.cantidad) from trabajos_semanales(t.id, 104) w),
  'salud_tenants', (select jsonb_build_object('salud', s.salud, 'motivo', s.motivo, 'ultimo', s.ultimo_trabajo)
     from salud_tenants() s where s.lubricentro_id = t.id),
  'activacion_tenant · trabajos_7d', (select a.trabajos_7d from activacion_tenant(t.id) a),
  'activacion_por_mes', (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.mes), '[]')::text) from activacion_por_mes(date '2023-01-01', current_date) a),
  'uso_tenant · 10 años', (select jsonb_build_object('trabajos', u -> 'trabajos', 'service', u -> 'service', 'mecanica', u -> 'mecanica',
     'autos_volvieron', u -> 'autos_volvieron') from uso_tenant(t.id, 3650) u),
  'autos_que_volvieron_plataforma', autos_que_volvieron_plataforma(date '2023-01-01', current_date),
  'listado_lubricentros', (select jsonb_build_object('services_mes', ll.services_mes, 'ultimo_service', ll.ultimo_service)
     from listado_lubricentros() ll where ll.id = t.id),
  'metricas_tenant', (select jsonb_build_object('services_mes', mt -> 'services_mes', 'flota', mt -> 'flota', 'ultimo_service', mt -> 'ultimo_service')
     from metricas_tenant(t.id) mt),
  'foto_tenant_del_dia · $DIA', (select st.trabajos_dia from snapshots_tenant_diarios st where st.fecha = date '$DIA' and st.lubricentro_id = t.id),
  'foto_plataforma_del_dia · $DIA', (select jsonb_build_object('total', sd.trabajos_dia, 'service', sd.trabajos_service, 'mecanica', sd.trabajos_mecanica)
     from snapshots_diarios sd where sd.fecha = date '$DIA')
)
from metricas_plataforma() m, resumen_admin() r, (select id from lubricentros where slug = '$SLUG') t;"
}

comparar_fotos() { # $1 = antes · $2 = después · imprime las claves que cambiaron
  $DB -qtA -v antes="$1" -v despues="$2" 2>&1 <<'SQL'
select format('%s: antes %s, después %s', coalesce(a.key, b.key), coalesce(a.value::text, '—'), coalesce(b.value::text, '—'))
from jsonb_each(:'antes'::jsonb) a
full join jsonb_each(:'despues'::jsonb) b using (key)
where a.value is distinct from b.value
order by 1;
SQL
}

importar() { # corre el SQL tal cual lo va a correr Santiago; deja la salida en $SALIDA_IMPORT
  SALIDA_IMPORT=$($DB -v ON_ERROR_STOP=1 -f - < "$SALIDA" 2>&1)
}
dato() { echo "$SALIDA_IMPORT" | grep -o "$1: [0-9]*" | head -1 | grep -o "[0-9]*$"; }
conteos_de_la_importacion() { # $1..$8 = lo esperado
  igual "clientes creados"   "$(dato 'clientes creados')"  "$1"
  igual "vehículos creados"  "$(dato 'vehículos creados')" "$2"
  igual "vehículos reusados" "$(echo "$SALIDA_IMPORT" | grep 'vehículos creados' | grep -o 'reusados: [0-9]*' | grep -o '[0-9]*$')" "$3"
  igual "productos creados"  "$(dato 'productos creados')" "$4"
  igual "productos reusados" "$(echo "$SALIDA_IMPORT" | grep 'productos creados' | grep -o 'reusados: [0-9]*' | grep -o '[0-9]*$')" "$5"
  igual "services"           "$(dato 'services')"          "$6"
  igual "renglones"          "$(dato 'renglones')"         "$7"
  igual "mecánicas"          "$(dato 'mecánicas')"         "$8"
  local rechazadas; rechazadas=$(dato 'filas rechazadas')
  if [ "$rechazadas" = 0 ]; then ok "filas rechazadas por la base: 0"
  else
    mal "filas rechazadas por la base: «$rechazadas» (van con su n_planilla)"
    echo "$SALIDA_IMPORT" | grep -E "RECHAZADA|ERROR|HINT" | head -40 | sed 's/^/      /'
  fi
}

# ── 1 · El tenant ───────────────────────────────────────────────────────────
echo "── 1 · El tenant $SLUG, por crear_lubricentro() ──"
borrar_tenant
ALTA=$($DB -q -v ON_ERROR_STOP=1 2>&1 <<SQL
begin;
do \$\$
declare
  v_super uuid; v_plan uuid; v_lub uuid;
begin
  select id into v_super from usuarios where rol = 'superadmin' order by created_at limit 1;
  select id into v_plan  from planes where nombre = 'Pro' and not heredado;
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  select crear_lubricentro('ZZ Prueba Falco', '$SLUG', '[{"nombre":"Casa Central"}]'::jsonb, v_plan, 'mensual', 0) into v_lub;

  -- '' y no NULL en los cuatro tokens: GoTrue los escanea como string.
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    '$EMAIL', extensions.crypt('$CLAVE', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Owner de prueba', 'lubricentro_id', v_lub),
    '', '', '', ''
  );
end \$\$;
commit;
SQL
)
[ -n "$ALTA" ] && echo "$ALTA" | sed 's/^/      /'
igual "tenant / sucursales activas / owners" \
  "$(q "select format('%s/%s/%s',
        (select count(*) from lubricentros where slug = '$SLUG'),
        (select count(*) from sucursales s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG' and s.activa),
        (select count(*) from usuarios u join lubricentros l on l.id = u.lubricentro_id where l.slug = '$SLUG' and u.rol = 'owner'))")" "1/1/1"

ANTES=$(foto_plataforma)
EVENTOS_ANTES=$(q "select count(*) from tenant_eventos")
case "$ANTES" in
  \{*) ok "la foto de la plataforma antes de importar" ;;
  *) mal "no pude sacar la foto de la plataforma"; echo "$ANTES" | head -5 | sed 's/^/      /' ;;
esac

# ── 2 · La importación ──────────────────────────────────────────────────────
echo "── 2 · La importación: los conteos del notice contra el JSON ──"
importar
if ! echo "$SALIDA_IMPORT" | grep -q "IMPORTACIÓN «$ORIGEN»"; then
  mal "la importación no entró"
  echo "$SALIDA_IMPORT" | grep -E "ERROR|HINT|DETAIL" | head -6 | sed 's/^/      /'
fi
conteos_de_la_importacion "$E_CLIENTES" "$E_VEHICULOS" 0 "$E_PRODUCTOS" 0 "$E_SERVICES" "$E_RENGLONES" "$E_MECANICAS"
igual "lo que quedó en las tablas (con la marca/total)" "$(conteos)" \
  "clientes $E_CLIENTES/$E_CLIENTES · vehículos $E_VEHICULOS/$E_VEHICULOS · productos $E_PRODUCTOS/$E_PRODUCTOS · trabajos $E_TRABAJOS/$E_TRABAJOS · renglones $E_RENGLONES"
igual "trabajos con created_at distinto de las 12:00 (Córdoba) de su fecha" \
  "$(q "select count(*) from services s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG' and (s.created_at <> (s.fecha + time '12:00') at time zone 'America/Argentina/Cordoba' or s.updated_at <> s.created_at)")" 0
igual "trabajos firmados por alguien que no es el owner" \
  "$(q "select count(*) from services s join lubricentros l on l.id = s.lubricentro_id join usuarios u on u.id = s.usuario_id where l.slug = '$SLUG' and u.rol <> 'owner'")" 0
igual "mecánicas con algún campo de aceite" \
  "$(q "select count(*) from services s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG' and s.tipo = 'mecanica' and (s.aceite_tipo is not null or s.aceite_nombre is not null or s.aceite_producto_id is not null or s.prox_service_km is not null or s.aceite_litros is not null)")" 0
igual "productos importados con stock" \
  "$(q "select count(*) from productos p join lubricentros l on l.id = p.lubricentro_id where l.slug = '$SLUG' and p.stock is not null")" 0
igual "eventos nuevos en tenant_eventos, contactos y canjes del tenant" \
  "$(q "select format('%s/%s/%s', (select count(*) from tenant_eventos) - $EVENTOS_ANTES, (select count(*) from contactos c join lubricentros l on l.id = c.lubricentro_id where l.slug = '$SLUG'), (select count(*) from canjes c join lubricentros l on l.id = c.lubricentro_id where l.slug = '$SLUG'))")" "0/0/0"

# ── 3 · Otra vez ────────────────────────────────────────────────────────────
echo "── 3 · Corrido otra vez: ya_importado, y nada cambia ──"
importar
if echo "$SALIDA_IMPORT" | grep -q "ya_importado"; then ok "la segunda corrida falla con ya_importado"
else mal "la segunda corrida no dijo ya_importado"; echo "$SALIDA_IMPORT" | grep -E "ERROR|NOTICE" | head -4 | sed 's/^/      /'; fi
igual "los conteos después de la segunda corrida" "$(conteos)" \
  "clientes $E_CLIENTES/$E_CLIENTES · vehículos $E_VEHICULOS/$E_VEHICULOS · productos $E_PRODUCTOS/$E_PRODUCTOS · trabajos $E_TRABAJOS/$E_TRABAJOS · renglones $E_RENGLONES"

if [ "$MODO" = dejar ]; then
  echo "── El tenant queda importado, para mirar la app ──"
  echo "  $EMAIL (la clave está en este script, en CLAVE) · /$SLUG/$PATENTE"
  echo "  Para borrarlo: ./scripts/regresion-importacion.sh --limpiar"
  rm -f "$SALIDA" "$DESHACER"
  exit $fallas
fi

# ── 4 · El cartón ───────────────────────────────────────────────────────────
echo "── 4 · get_carton('$SLUG', '$PATENTE') ──"
igual "entradas / fijadas / services con renglones / services con el nombre del aceite" \
  "$(q "select format('%s/%s/%s/%s', jsonb_array_length(c -> 'services'),
        (select count(*) from jsonb_array_elements(c -> 'services') e where (e ->> 'fijado')::boolean),
        (select count(*) from jsonb_array_elements(c -> 'services') e where e ->> 'tipo' = 'service' and jsonb_array_length(e -> 'items') > 0),
        (select count(*) from jsonb_array_elements(c -> 'services') e where e ->> 'tipo' = 'service' and e ->> 'aceite_nombre' is not null))
      from get_carton('$SLUG', '$PATENTE') c")" \
  "$E_CARTON/$E_CARTON/$E_CARTON_RENGLONES/$E_CARTON_ACEITE"

# ── 5 · El premio ───────────────────────────────────────────────────────────
echo "── 5 · El premio no cuenta lo importado ──"
V5=$(q "select v.id from vehiculos v join lubricentros l on l.id = v.lubricentro_id where l.slug = '$SLUG' and v.patente_normalizada = '$V5_NORM'")
igual "el auto elegido tiene 5 o más services importados" \
  "$(q "select count(*) >= 5 from services where vehiculo_id = '$V5' and tipo = 'service' and importado_de = '$ORIGEN'")" t
igual "premio_disponible · services_ciclo" "$(q "select services_ciclo from premio_disponible('$V5')")" 0
igual "ciclos_fidelizacion · services_ciclo (tiene que decir lo mismo)" \
  "$(como owner "select services_ciclo from ciclos_fidelizacion() where vehiculo_id = '$V5';")" 0
igual "después de un service por guardar_service: premio_disponible / ciclos_fidelizacion" \
  "$(como owner "
do \$\$ begin
  perform guardar_service('$V5', (select s.id from sucursales s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG'),
    current_date, (select max(kilometros) + 1000 from services where vehiculo_id = '$V5'), '10W40',
    (select max(kilometros) + 11000 from services where vehiculo_id = '$V5'));
end \$\$;
select format('%s/%s', (select services_ciclo from premio_disponible('$V5')),
  (select services_ciclo from ciclos_fidelizacion() where vehiculo_id = '$V5'));")" "1/1"

# ── 6 · A quién llamar ──────────────────────────────────────────────────────
echo "── 6 · vista_proximos_service: el horizonte de 18 meses ──"
igual "autos del tenant con el último service de hace más de 18 meses (los hay)" \
  "$(q "select count(*) > 0 from (select vehiculo_id from services s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG' and s.tipo = 'service' and not s.anulado group by 1 having max(s.fecha) < current_date - interval '18 months') x")" t
igual "filas de la vista con ultimo_service_fecha anterior a 18 meses" \
  "$(q "select count(*) from vista_proximos_service p join lubricentros l on l.id = p.lubricentro_id where l.slug = '$SLUG' and p.ultimo_service_fecha < current_date - interval '18 months'")" 0
FILAS=$(q "select count(*) from vista_proximos_service p join lubricentros l on l.id = p.lubricentro_id where l.slug = '$SLUG'")
if [ "$FILAS" -gt 0 ] 2>/dev/null; then ok "la vista tiene filas para el tenant: $FILAS"; else mal "la vista quedó vacía para el tenant («$FILAS»)"; fi

# ── 7 · Las métricas ────────────────────────────────────────────────────────
echo "── 7 · La plataforma no cuenta lo importado; el tenant sí ──"
DESPUES=$(foto_plataforma)
CAMBIOS=$(comparar_fotos "$ANTES" "$DESPUES")
if [ -z "$CAMBIOS" ]; then ok "las métricas de la plataforma, iguales antes y después de importar"
else mal "la importación movió las métricas de la plataforma:"; echo "$CAMBIOS" | sed 's/^/      /'; fi
CAMBIOS=$(comparar_fotos "$ANTES" "$(foto_plataforma sonda)")
if [ -z "$CAMBIOS" ]; then ok "y con 25 trabajos importados de hoy (la sonda), tampoco se mueven"
else mal "con trabajos importados de hoy, las métricas de la plataforma se mueven:"; echo "$CAMBIOS" | sed 's/^/      /'; fi
igual "resumen_inicio() del owner · checklist.services" \
  "$(como owner "select resumen_inicio() -> 'checklist' ->> 'services';")" "$E_TRABAJOS"
MES=$(como owner "select coalesce(sum((p ->> 'cantidad')::integer), 0) from jsonb_array_elements(resumen_inicio() -> 'series' -> 'mes') p;")
if [ "$MES" -gt 0 ] 2>/dev/null; then ok "resumen_inicio() del owner · series.mes suma $MES trabajos"; else mal "resumen_inicio() no muestra lo importado en series.mes («$MES»)"; fi

# ── 9 · Deshacer ────────────────────────────────────────────────────────────
echo "── 9 · El deshacer deja el tenant exactamente como antes ──"
$DB -q -v ON_ERROR_STOP=1 -f - < "$DESHACER" 2>&1 | grep -E "ERROR|HINT|DESHECHA|borrad" | sed 's/^/      /'
igual "lo que quedó en las tablas" "$(conteos)" "clientes 0/0 · vehículos 0/0 · productos 0/0 · trabajos 0/0 · renglones 0"
CAMBIOS=$(comparar_fotos "$ANTES" "$(foto_plataforma)")
[ -z "$CAMBIOS" ] && ok "las métricas de la plataforma, iguales que antes de importar" || { mal "el deshacer dejó las métricas distintas:"; echo "$CAMBIOS" | sed 's/^/      /'; }

# ── 8 · Lo que ya existía ───────────────────────────────────────────────────
echo "── 8 · Un vehículo y un producto que ya existían ──"
$DB -q -v ON_ERROR_STOP=1 2>&1 <<SQL | sed 's/^/      /'
do \$\$
declare v_lub uuid; v_cli uuid;
begin
  select id into v_lub from lubricentros where slug = '$SLUG';
  insert into clientes (lubricentro_id, nombre, telefono) values (v_lub, 'Dueño Cargado A Mano', '351 555 0100') returning id into v_cli;
  insert into vehiculos (lubricentro_id, cliente_id, patente) values (v_lub, v_cli, '$PRE');
  -- El mismo nombre que en la planilla, escrito como lo escribiría alguien apurado.
  insert into productos (lubricentro_id, categoria, nombre, unidad) values (v_lub, 'aceite', upper('  $P1_NOMBRE_SQL '), 'litro');
end \$\$;
SQL
PRE_ID=$(q "select v.id from vehiculos v join lubricentros l on l.id = v.lubricentro_id where l.slug = '$SLUG' and v.patente_normalizada = '$PRE_NORM'")
importar
conteos_de_la_importacion "$((E_CLIENTES - 1))" "$((E_VEHICULOS - 1))" 1 "$((E_PRODUCTOS - 1))" 1 "$E_SERVICES" "$E_RENGLONES" "$E_MECANICAS"
igual "el auto que ya existía: mismo id, su cliente de siempre, sin la marca, con los trabajos de la planilla" \
  "$(q "select format('%s/%s/%s/%s', v.id = '$PRE_ID', c.nombre, coalesce(v.importado_de, 'null'), (select count(*) from services s where s.vehiculo_id = v.id and s.importado_de = '$ORIGEN')) from vehiculos v join clientes c on c.id = v.cliente_id join lubricentros l on l.id = v.lubricentro_id where l.slug = '$SLUG' and v.patente_normalizada = '$PRE_NORM'")" \
  "t/Dueño Cargado A Mano/null/$E_PRE_TRABAJOS"
igual "clientes del tenant (el de la planilla para ese auto no se creó)" \
  "$(q "select count(*) from clientes c join lubricentros l on l.id = c.lubricentro_id where l.slug = '$SLUG'")" "$E_CLIENTES"
igual "services atados al producto que ya existía / productos con ese nombre" \
  "$(q "select format('%s/%s', (select count(*) from services s where s.aceite_producto_id = p.id), (select count(*) from productos x where x.lubricentro_id = p.lubricentro_id and lower(trim(x.nombre)) = lower(trim(p.nombre)))) from productos p join lubricentros l on l.id = p.lubricentro_id where l.slug = '$SLUG' and p.importado_de is null")" \
  "$E_P1_USOS/1"

# ── 9b · Deshacer con historia propia ───────────────────────────────────────
echo "── 9b · Deshacer cuando el taller ya trabajó sobre lo importado ──"
V5=$(q "select v.id from vehiculos v join lubricentros l on l.id = v.lubricentro_id where l.slug = '$SLUG' and v.patente_normalizada = '$V5_NORM'")
$DB -q -v ON_ERROR_STOP=1 2>&1 <<SQL | sed 's/^/      /'
begin;
do \$\$ begin perform set_config('request.jwt.claims', json_build_object('sub', (select u.id from usuarios u join lubricentros l on l.id = u.lubricentro_id where l.slug = '$SLUG' and u.rol = 'owner'), 'role', 'authenticated')::text, true); end \$\$;
set local role authenticated;
do \$\$ begin
  perform guardar_service('$V5', (select s.id from sucursales s join lubricentros l on l.id = s.lubricentro_id where l.slug = '$SLUG'),
    current_date, (select max(kilometros) + 1000 from services where vehiculo_id = '$V5'), '10W40',
    (select max(kilometros) + 11000 from services where vehiculo_id = '$V5'));
end \$\$;
commit;
SQL
$DB -q -v ON_ERROR_STOP=1 -f - < "$DESHACER" 2>&1 | grep -E "ERROR|HINT|DESHECHA|borrad" | sed 's/^/      /'
igual "lo que quedó: el auto que ya existía, el del service nuevo, sus dos clientes y el producto de antes" "$(conteos)" \
  "clientes 0/2 · vehículos 0/2 · productos 0/1 · trabajos 0/1 · renglones 0"
igual "el auto que ya existía: intacto, con su cliente y sin trabajos" \
  "$(q "select format('%s/%s/%s', v.id = '$PRE_ID', c.nombre, (select count(*) from services s where s.vehiculo_id = v.id)) from vehiculos v join clientes c on c.id = v.cliente_id join lubricentros l on l.id = v.lubricentro_id where l.slug = '$SLUG' and v.patente_normalizada = '$PRE_NORM'")" \
  "t/Dueño Cargado A Mano/0"
igual "el auto con el service nuevo: se queda, sin la marca, con el service del panel" \
  "$(q "select format('%s/%s/%s', v.id = '$V5', coalesce(v.importado_de, 'null'), (select count(*) from services s where s.vehiculo_id = v.id and s.importado_de is null)) from vehiculos v where v.id = '$V5'")" \
  "t/null/1"
importar
conteos_de_la_importacion "$((E_CLIENTES - 2))" "$((E_VEHICULOS - 2))" 2 "$((E_PRODUCTOS - 1))" 1 "$E_SERVICES" "$E_RENGLONES" "$E_MECANICAS"

# ── 2b · Las filas que la base rechaza ──────────────────────────────────────
# La planilla de verdad no tiene ninguna, así que el camino «se anota y se
# sigue» no corrió nunca. Acá corre: una planilla sintética (sin datos de
# nadie) con cinco filas que no cierran con un CHECK, un índice o un enum, y
# dos que sí. Las cinco tienen que salir listadas con su n_planilla y las dos
# buenas tienen que entrar igual.
echo "── 2b · Una planilla con filas que la base rechaza: se listan y se sigue ──"
RECHAZOS="$(dirname "$JSON")/$SLUG-rechazos.json"
cat > "$RECHAZOS" <<'JSON'
{
  "meta": { "origen": "zz-prueba-rechazos", "slug": "zz-prueba-falco" },
  "clientes": [
    { "cliente_key": "C1", "nombre": "Sin nombre", "telefono": "-" },
    { "cliente_key": "C2", "nombre": "X", "telefono": "-" },
    { "cliente_key": "C3", "nombre": "Sin nombre", "telefono": "-" }
  ],
  "vehiculos": [
    { "vehiculo_key": "V1", "cliente_key": "C1", "patente": "ZZ 900 ZZ", "marca": null, "modelo": null, "clase": null },
    { "vehiculo_key": "V2", "cliente_key": "C2", "patente": "ZZ 901 ZZ", "marca": null, "modelo": null, "clase": null },
    { "vehiculo_key": "V3", "cliente_key": "C3", "patente": "NO ES PATENTE", "marca": null, "modelo": null, "clase": null }
  ],
  "productos": [],
  "services": [
    { "n_planilla": 9000, "vehiculo_key": "V1", "fecha": "2025-03-10", "kilometros": 50000, "aceite_tipo": "10W40", "aceite_nombre": null, "producto_key": null, "aceite_litros": 4, "prox_service_km": 60000, "observaciones": null },
    { "n_planilla": 9001, "vehiculo_key": "V1", "fecha": "2025-06-10", "kilometros": 60000, "aceite_tipo": "10W40", "aceite_nombre": null, "producto_key": null, "aceite_litros": 4, "prox_service_km": 60000, "observaciones": null },
    { "n_planilla": 9002, "vehiculo_key": "V2", "fecha": "2025-03-10", "kilometros": 50000, "aceite_tipo": "10W40", "aceite_nombre": null, "producto_key": null, "aceite_litros": 4, "prox_service_km": 60000, "observaciones": null },
    { "n_planilla": 9003, "vehiculo_key": "V3", "fecha": "2025-03-10", "kilometros": 50000, "aceite_tipo": "10W40", "aceite_nombre": null, "producto_key": null, "aceite_litros": 4, "prox_service_km": 60000, "observaciones": null }
  ],
  "renglones": [
    { "n_planilla": 9000, "item_tipo": "filtro_aceite", "cambiado": true, "detalle": "W-712", "cantidad": 1 },
    { "n_planilla": 9000, "item_tipo": "filtro_de_nada", "cambiado": true, "detalle": "no existe", "cantidad": 1 }
  ],
  "mecanicas": [
    { "n_planilla": 9004, "vehiculo_key": "V1", "fecha": "2025-04-01", "kilometros": null, "descripcion": "Frenos delanteros", "observaciones": null },
    { "n_planilla": 9005, "vehiculo_key": "V1", "fecha": "2025-04-02", "kilometros": null, "descripcion": "abc", "observaciones": null }
  ]
}
JSON
node scripts/importar-planilla.mjs "$RECHAZOS" --slug "$SLUG" --salida "${RECHAZOS%.json}-importar.sql" > /dev/null
SALIDA_IMPORT=$($DB -v ON_ERROR_STOP=1 -f - < "${RECHAZOS%.json}-importar.sql" 2>&1)
# 9000 y la mecánica 9004 entran, con un renglón de los dos. No entran: 9001
# (próximo service = km), 9002 (su cliente tiene un nombre de una letra),
# 9003 (su patente no es una patente), 9005 (descripción de 3 letras) y el
# renglón de 9000 con un item_tipo que no existe.
igual "services / renglones / mecánicas que entraron" \
  "$(dato 'services')/$(dato 'renglones')/$(dato 'mecánicas')" "1/1/1"
for n in 9001 9002 9003 9005; do
  if echo "$SALIDA_IMPORT" | grep "RECHAZADA" | grep -q "n_planilla $n "; then ok "la fila $n sale listada como RECHAZADA, con su motivo"
  else mal "la fila $n no aparece entre las rechazadas"; fi
done
if echo "$SALIDA_IMPORT" | grep "RECHAZADA · renglones" | grep -q "n_planilla 9000 "; then ok "el renglón malo de la fila 9000 sale listado, y el service entra igual"
else mal "el renglón malo de la fila 9000 no aparece entre las rechazadas"; fi
igual "filas rechazadas (cliente C2, autos V2 y V3, services 9001/9002/9003, un renglón, mecánica 9005)" "$(dato 'filas rechazadas')" 8
$DB -q -v ON_ERROR_STOP=1 -f - < "${RECHAZOS%.json}-deshacer.sql" > /dev/null 2>&1
igual "filas de la planilla sintética después de deshacerla" \
  "$(q "select (select count(*) from services where importado_de = 'zz-prueba-rechazos') + (select count(*) from vehiculos where importado_de = 'zz-prueba-rechazos') + (select count(*) from clientes where importado_de = 'zz-prueba-rechazos')")" 0
rm -f "$RECHAZOS" "${RECHAZOS%.json}-importar.sql" "${RECHAZOS%.json}-deshacer.sql"

# ── 10 · Limpieza ───────────────────────────────────────────────────────────
echo "── 10 · Borrar $SLUG entero ──"
borrar_tenant | sed 's/^/      /'
igual "tenants $SLUG en la base" "$(q "select count(*) from lubricentros where slug = '$SLUG'")" 0
igual "usuarios de prueba en auth.users" "$(q "select count(*) from auth.users where email = '$EMAIL'")" 0
rm -f "$SALIDA" "$DESHACER"

echo
if [ "$fallas" = 0 ]; then echo "VERDE: la importación entra, no cuenta donde no tiene que contar y se deshace."
else echo "ROJO: algo de lo de arriba falló."; fi
exit $fallas
