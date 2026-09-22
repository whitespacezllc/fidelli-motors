-- ════════════════════════════════════════════════════════════════════
-- EL ORIGEN DEL TENANT · de dónde vino cada lubricentro
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 1 "Origen del tenant")
--
-- No había ninguna columna que dijera de dónde salió un cliente: el
-- `fm_origin` del visitante vive en el localStorage del navegador y nunca
-- llega a la base (docs/ADMIN-INVENTARIO.md § 7). Sin el dato, "cuántos
-- vinieron de Meta y cuántos referidos" es una pregunta sin respuesta.
--
-- Es un enum cerrado y no texto libre, porque la pregunta que responde es
-- un conteo por categoría, y el detalle libre va aparte (`origen_detalle`:
-- quién lo refirió, qué distribuidor, qué campaña).
--
-- La única puerta para escribirlo es `fijar_origen_tenant()`: se llama
-- después de `crear_lubricentro()` y desde la edición del tenant. NO se
-- toca la firma de `crear_lubricentro()`: el alta sigue siendo la misma
-- transacción de siempre, y el origen entra en una segunda llamada, como
-- la invitación. Si esa segunda falla, el tenant queda creado y la
-- pantalla del alta lo dice.
-- ════════════════════════════════════════════════════════════════════

create type origen_tenant as enum (
  'meta', 'referido', 'directo', 'distribuidor', 'calco', 'organico', 'otro'
);

alter table lubricentros
  add column origen         origen_tenant,
  add column origen_detalle text;

comment on column lubricentros.origen is
  'De dónde vino el tenant (docs/METRICAS.md § 1): meta, referido, directo, distribuidor, calco, organico, otro. NULL = todavía no se cargó (los tenants anteriores al 22/09/2026 se completan a mano desde la edición).';
comment on column lubricentros.origen_detalle is
  'El detalle libre del origen: quién lo refirió, qué distribuidor, qué campaña. Opcional.';


-- ---------- La única puerta ----------
-- SECURITY DEFINER con guarda explícita, como `cambiar_estado_lubricentro`
-- y el resto del ABM de /fidelli. El error de rol es el mismo 42501 que
-- levantan las demás para que el front lo traduzca igual.

-- >>> fijar_origen_tenant
create or replace function fijar_origen_tenant(
  p_id      uuid,
  p_origen  origen_tenant,
  p_detalle text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede fijar el origen de un lubricentro'
      using errcode = '42501';
  end if;

  if p_origen is null then
    raise exception 'origen_vacio';
  end if;

  update lubricentros
     set origen         = p_origen,
         origen_detalle = nullif(trim(coalesce(p_detalle, '')), '')
   where id = p_id;

  if not found then
    raise exception 'no_existe';
  end if;
end;
$$;
-- <<< fijar_origen_tenant

comment on function fijar_origen_tenant is
  'La única puerta para lubricentros.origen / origen_detalle (docs/METRICAS.md § 1). Exige superadmin. Cada cambio deja un evento `origen` en tenant_eventos por el trigger de lubricentros (20260922201000).';

revoke all on function fijar_origen_tenant(uuid, origen_tenant, text) from public, anon;
grant execute on function fijar_origen_tenant(uuid, origen_tenant, text) to authenticated;
