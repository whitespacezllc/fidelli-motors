#!/bin/bash
# R47, repetible (regla 13: una prueba que nunca se vio en rojo no existe):
# la red tiene que ATRAPAR una policy que vuelva a llamar a las funciones
# de sesión a pelo, una vez por fila. Se rompe a mano, en una transacción
# con rollback, cada forma de volver atrás —el USING de una tabla del
# tenant, un WITH CHECK, auth.uid(), una policy nueva escrita como antes,
# una del bucket— y se espera el bloque R47 de verificaciones.sql en rojo
# con el renglón que nombra la policy. Y el piso: con la red vacía (las
# policies de public que miran a la sesión, borradas) el bloque tampoco
# pasa. No deja rastro.
#
# Requiere el stack local levantado (supabase start), con la base migrada.
# Sale con 0 si la red atrapó todas; 1 si alguna se le escapó.
set -u
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
CHEQUEO=$(sed -n '/^-- >>> R47$/,/^-- <<< R47$/p' "$(dirname "$0")/../supabase/verificaciones.sql")
if [ -z "$CHEQUEO" ]; then echo "no encontré el bloque R47 en supabase/verificaciones.sql"; exit 1; fi

correr() { # $1 = nombre · $2 = la rotura (SQL) · $3 = patrón esperado en el error
  local salida
  salida=$( { echo "begin;"; echo "$2"; echo "$CHEQUEO"; echo "rollback;"; } | $DB -f - 2>&1 )
  if echo "$salida" | grep -q "$3"; then echo "  ✓ atrapado: $1"; return 0
  else echo "  ✗ SE ESCAPÓ: $1"; echo "$salida" | tail -3; return 1; fi
}

fallas=0
echo "── sin rotura: el bloque pasa ──"
salida=$( { echo "begin;"; echo "$CHEQUEO"; echo "rollback;"; } | $DB -f - 2>&1 )
if echo "$salida" | grep -q "ERROR"; then echo "  ✗ el bloque falla sin rotura:"; echo "$salida" | tail -3; fallas=1
else echo "  ✓ en verde"; fi

echo "── mi_lubricentro_id() a pelo en el USING de una tabla del tenant ──"
correr "clientes_tenant con mi_lubricentro_id() por fila" \
  "alter policy clientes_tenant on clientes using (lubricentro_id = mi_lubricentro_id() or (select soy_superadmin()));" \
  "public.clientes «clientes_tenant», en el USING: mi_lubricentro_id()" || fallas=1

echo "── soy_superadmin() a pelo en un WITH CHECK ──"
correr "services_insercion con soy_superadmin() por fila" \
  "alter policy services_insercion on services with check ((lubricentro_id = (select mi_lubricentro_id())) or soy_superadmin());" \
  "public.services «services_insercion», en el WITH CHECK: soy_superadmin()" || fallas=1

echo "── auth.uid() a pelo ──"
correr "usuarios_propio con auth.uid() por fila" \
  "alter policy usuarios_propio on usuarios using (id = auth.uid() or (select soy_superadmin()));" \
  "public.usuarios «usuarios_propio», en el USING: auth.uid()" || fallas=1

echo "── una policy NUEVA escrita como antes ──"
correr "una policy nueva con la forma vieja" \
  "create policy r47_vieja on vehiculos for select using (lubricentro_id = mi_lubricentro_id());" \
  "public.vehiculos «r47_vieja», en el USING: mi_lubricentro_id()" || fallas=1

echo "── el bucket: mi_lubricentro_id() a pelo en storage.objects ──"
correr "«adjuntos lectura» con mi_lubricentro_id() por objeto" \
  "alter policy \"adjuntos lectura\" on storage.objects using (bucket_id = 'adjuntos' and ((select soy_superadmin()) or (storage.foldername(name))[1] = mi_lubricentro_id()::text));" \
  "storage.objects «adjuntos lectura», en el USING: mi_lubricentro_id()" || fallas=1

echo "── el piso: con la red vacía el bloque no pasa en verde ──"
correr "las policies de public que miran a la sesión, borradas" \
  "$(cat <<'SQL'
do $x$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(mi_lubricentro_id|soy_superadmin|auth\.uid)\(\)'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $x$;
SQL
)" "R47 SIN PISO" || fallas=1

exit $fallas
