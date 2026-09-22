-- ════════════════════════════════════════════════════════════════════
-- UNA SOLA DEFINICIÓN DE "ACTIVO" Y DE LA PLATA
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 1)
--
-- El inventario encontró cuatro definiciones de "tenant activo" y dos
-- cuentas distintas del abono —una en TypeScript que no suma el módulo y
-- otra en SQL que sí— (docs/ADMIN-INVENTARIO.md § 3.3 y § 8.1). Acá queda
-- una sola de cada una, en SQL, y de acá leen el cierre diario y, desde el
-- bloque 2, la franja de /fidelli.
--
--   · es_activo(l)       — lubricentros.activo = true Y el reloj no lo
--                          tiene en 'suspendido'. Es LA definición.
--   · mrr_de_tenant(id)  — monto_de_renovacion_en(id, periodo)->>'total'
--                          dividido por los meses del período; 0 si no
--                          está activo; 0 si es exento.
--   · mrr_plataforma()   — la suma.
--
-- SOLO SE LEE monto_de_renovacion_en(): no se modifica ni se duplica su
-- cuenta. Regla 16 de CLAUDE.md: toda la plata es dato y una sola función
-- la calcula.
--
-- ⚠ Las tres son SECURITY INVOKER. es_activo(l lubricentros) es también un
-- campo calculado de PostgREST (regla 18): como invoker, reloj_cobranza()
-- devuelve null para un composite forjado y no se lee nada ajeno.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @activo_reloj`, `-- @exento_mrr` y `-- @mrr_meses`
-- NO SE REFORMATEAN: scripts/regresion-metricas.sh las muerde con sed.
-- ════════════════════════════════════════════════════════════════════

-- >>> es_activo
create or replace function es_activo(l lubricentros)
returns boolean
language sql
stable
set search_path = public
as $$
  select l.activo
     and coalesce(reloj_cobranza(l) ->> 'estado', 'al_dia') <> 'suspendido';   -- @activo_reloj
$$;
-- <<< es_activo

comment on function es_activo is
  'Tenant activo (docs/METRICAS.md § 1): lubricentros.activo = true y el reloj de cobranza no lo tiene en suspendido. Los exentos son activos. Cargar trabajos no define activo: define salud. Invoker.';

revoke all on function es_activo(lubricentros) from public, anon;
grant execute on function es_activo(lubricentros) to authenticated, service_role;


-- >>> mrr_de_tenant
create or replace function mrr_de_tenant(p_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  with sub as (
    select s.periodo, s.descuento_pct
      from suscripciones s
     where s.lubricentro_id = p_id
     order by s.inicio desc, s.created_at desc
     limit 1
  )
  select coalesce((
    select case
      when not es_activo(l)                        then 0
      when coalesce(sub.descuento_pct, 0) >= 100   then 0                        -- @exento_mrr
      else round(
             (monto_de_renovacion_en(l.id, sub.periodo) ->> 'total')::numeric
             / meses_del_periodo(sub.periodo), 2)                                -- @mrr_meses
    end
    from lubricentros l
    left join sub on true
    where l.id = p_id
  ), 0)::numeric(12,2);
$$;
-- <<< mrr_de_tenant

comment on function mrr_de_tenant is
  'El MRR de un tenant en ARS (docs/METRICAS.md § 1): el total de monto_de_renovacion_en() —con módulo pago y descuentos— mensualizado por meses_del_periodo(). 0 si no está activo; 0 si es exento (descuento_pct >= 100). Invoker: para otro tenant, el RLS lo deja en 0.';

revoke all on function mrr_de_tenant(uuid) from public, anon;
grant execute on function mrr_de_tenant(uuid) to authenticated, service_role;


-- >>> mrr_plataforma
create or replace function mrr_plataforma()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(mrr_de_tenant(l.id)), 0)::numeric(12,2)
    from lubricentros l;
$$;
-- <<< mrr_plataforma

comment on function mrr_plataforma is
  'La suma de mrr_de_tenant() sobre todos los tenants que ve quien llama (docs/METRICAS.md § 1). Para un superadmin, la plataforma entera.';

revoke all on function mrr_plataforma() from public, anon;
grant execute on function mrr_plataforma() to authenticated, service_role;
