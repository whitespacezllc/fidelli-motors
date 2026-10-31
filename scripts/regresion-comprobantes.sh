#!/bin/bash
# La rotura a mano de R52 (regla 13): comprobantes por foto/IA, el egreso
# nace de una lectura REVISADA (20261101120000). Cada afirmación se corre
# con SU rotura y tiene que ponerse en ROJO.
#
#   R52a · el gate del módulo movido al USING (edición) o sacado del WITH
#          CHECK (alta); un CHECK borrado; una puerta de mutación como
#          DEFINER; comprobantes_huerfanos como INVOKER; registrar grantada
#          a anon.
#   R52b · confirmar que toma lo que leyó la IA en vez de lo revisado (el
#          corazón del «nunca auto-guarda»); y confirmar que acepta una
#          venta (la rama del ingreso es R2, no existe todavía).
#
# Todo corre en transacciones con rollback: no deja rastro. Requiere el
# stack local levantado (supabase start) con el schema al día.
#
# Sale con 0 si la red atrapó todos los casos; 1 si alguno se le escapó.
set -u
cd "$(dirname "$0")/.."
DB="docker exec -i supabase_db_fidelli-motors psql -U postgres -d postgres -X"
V=supabase/verificaciones.sql

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

# confirmar_comprobante que toma el MONTO y el CONCEPTO de lo que leyó la IA
# (`extraido`) en vez de lo que revisó la persona: el egreso sale en 121000
# y no en 99999. Es el «simplificar» que rompe «nunca auto-guarda».
ROTO_CORREGIDO=$(cat <<'SQL'
create or replace function confirmar_comprobante(
  p_id uuid, p_sucursal_id uuid, p_monto numeric, p_concepto text,
  p_medio text default 'efectivo', p_fecha date default current_date)
returns uuid language plpgsql volatile set search_path = public as $f$
declare v_lub uuid; v_dir text; v_est text; v_eg uuid; v_ex jsonb;
begin
  v_lub := mi_lubricentro_id();
  if v_lub is null then raise exception 'La sesión no pertenece a ningún lubricentro'; end if;
  select direccion, estado, extraido into v_dir, v_est, v_ex
    from comprobantes_recibidos where id = p_id and lubricentro_id = v_lub for update;
  if not found then raise exception 'comprobante_inexistente'; end if;
  if v_est <> 'sin_revisar' then raise exception 'comprobante_no_pendiente'; end if;
  if v_dir <> 'compra' then raise exception 'comprobante_direccion_no_soportada'; end if;
  v_eg := guardar_egreso(p_sucursal_id, (v_ex->>'total')::numeric, v_ex->>'razon_social', p_medio, p_fecha);
  update comprobantes_recibidos set estado='confirmado', egreso_id=v_eg, confirmado_at=now() where id = p_id;
  return v_eg;
end; $f$;
SQL
)

# confirmar_comprobante SIN la guarda de la dirección: una venta se confirma
# aunque la rama del ingreso (R2) no exista.
ROTO_VENTA=$(cat <<'SQL'
create or replace function confirmar_comprobante(
  p_id uuid, p_sucursal_id uuid, p_monto numeric, p_concepto text,
  p_medio text default 'efectivo', p_fecha date default current_date)
returns uuid language plpgsql volatile set search_path = public as $f$
declare v_lub uuid; v_dir text; v_est text; v_eg uuid;
begin
  v_lub := mi_lubricentro_id();
  if v_lub is null then raise exception 'La sesión no pertenece a ningún lubricentro'; end if;
  select direccion, estado into v_dir, v_est
    from comprobantes_recibidos where id = p_id and lubricentro_id = v_lub for update;
  if not found then raise exception 'comprobante_inexistente'; end if;
  if v_est <> 'sin_revisar' then raise exception 'comprobante_no_pendiente'; end if;
  v_eg := guardar_egreso(p_sucursal_id, p_monto, p_concepto, p_medio, p_fecha);
  update comprobantes_recibidos set estado='confirmado', egreso_id=v_eg, confirmado_at=now() where id = p_id;
  return v_eg;
end; $f$;
SQL
)

ROTO_EDICION_USING=$(cat <<'SQL'
drop policy comprobantes_edicion on comprobantes_recibidos;
create policy comprobantes_edicion on comprobantes_recibidos for update to authenticated
  using ((lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas')) or (select soy_superadmin()))
  with check (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));
SQL
)

ROTO_ALTA_SIN_GATE=$(cat <<'SQL'
drop policy comprobantes_alta on comprobantes_recibidos;
create policy comprobantes_alta on comprobantes_recibidos for insert to authenticated
  with check (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));
SQL
)

echo "── R52 · comprobantes por foto/IA ──"
correr "el gate de edición movido al USING (apagaría la lectura)" \
  "$ROTO_EDICION_USING" R52 "R52a el gate de edición está en el USING"
correr "el gate de alta sacado del WITH CHECK" \
  "$ROTO_ALTA_SIN_GATE" R52 "R52a el gate de alta no está en el WITH CHECK"
correr "el CHECK de coherencia borrado" \
  "alter table comprobantes_recibidos drop constraint comprobante_movimiento_coherente;" \
  R52 "R52a falta el CHECK comprobante_movimiento_coherente"
correr "confirmar_comprobante como SECURITY DEFINER (se saltea el RLS)" \
  "alter function confirmar_comprobante(uuid,uuid,numeric,text,text,date) security definer;" \
  R52 "R52a una puerta de mutación es SECURITY DEFINER"
correr "comprobantes_huerfanos como SECURITY INVOKER" \
  "alter function comprobantes_huerfanos() security invoker;" \
  R52 "R52a comprobantes_huerfanos no es DEFINER"
correr "registrar_comprobante grantada a anon" \
  "grant execute on function registrar_comprobante(text,text,text,integer,text) to anon;" \
  R52 "R52a anon ejecuta"
correr "confirmar toma lo que leyó la IA, no lo revisado (nunca auto-guarda)" \
  "$ROTO_CORREGIDO" R52 "R52b el egreso no tomó los valores revisados"
correr "confirmar acepta una venta (la rama del ingreso es R2)" \
  "$ROTO_VENTA" R52 "R52b una venta se confirmó"

exit $fallas
