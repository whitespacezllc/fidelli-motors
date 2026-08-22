-- ============================================================
-- Fidelli Motors · Verificaciones que corren en cada db reset
--
-- Este archivo NO carga datos: es la red de seguridad del schema.
-- config.toml lo declara como segundo seed (db.seed.sql_paths), así que
-- se ejecuta DESPUÉS de todas las migraciones y del seed de demo — la
-- única posición desde la que se ve el estado FINAL del schema.
--
-- Por qué acá y no en una migración: una migración de verificación solo
-- ve lo que se aplicó ANTES de ella. Cualquier migración posterior que
-- rompa algo pasa sin que nadie se entere, y esa es exactamente la
-- migración que todavía no existe — la que va a abrir el próximo
-- agujero. Desde acá se ve todo, siempre.
--
-- Si algo falla, `supabase db reset` termina con exit code 1 y el
-- mensaje sale en la consola. No se pushea con el reset en rojo.
-- ============================================================

do $$
declare
  v_fallas text;
  v_cuantas integer;
begin
  select
    count(*),
    string_agg(format('  · %s — %s%s    arreglo: %s', vista, motivo, chr(10), arreglo), chr(10))
  into v_cuantas, v_fallas
  from verificar_seguridad_vistas();

  if v_cuantas > 0 then
    raise exception
      E'AISLAMIENTO MULTI-TENANT ROTO: % vista(s) de public saltean el RLS.\n%',
      v_cuantas, v_fallas
      using hint =
        'Casi siempre es un create or replace view que reseteó las reloptions: '
        'agregá el alter view ... set (security_invoker = on) al final de esa misma migración.';
  end if;
end $$;

-- ============================================================
-- Planes con control real (Bloque 1A)
--
-- Tres invariantes que, rotos, fallan hacia el lado caro:
--   1. Las funciones de resolución tienen que existir y ser SECURITY
--      DEFINER — sin definer, evaluarlas dentro de una policy recursa o
--      lee con el RLS del que llama y el gating queda a merced de lo que
--      ese rol pueda ver.
--   2. Ningún plan vigente puede tener features vacías: con la resolución
--      fail-closed, un vigente sin claves es un plan que no habilita NADA
--      y se le vendería a un cliente.
--   3. (Las vistas con security_invoker ya las vigila el bloque de arriba
--      para TODAS las vistas, incluidas las que toque 1B.)
-- ============================================================

do $$
declare
  v_nombre  text;
  v_definer boolean;
  v_hay     integer;
  v_fallas  text := '';
  v_planes  text;
begin
  -- 1 · resolución presente y security definer
  foreach v_nombre in array array[
    'plan_permite', 'plan_limite', 'sucursales_dentro_del_limite'
  ] loop
    select count(*), bool_and(p.prosecdef)
      into v_hay, v_definer
      from pg_proc p
     where p.proname = v_nombre
       and p.pronamespace = 'public'::regnamespace;

    if coalesce(v_hay, 0) = 0 then
      v_fallas := v_fallas || format(E'  · falta la función %s()\n', v_nombre);
    elsif not v_definer then
      v_fallas := v_fallas || format(
        E'  · %s() no es SECURITY DEFINER — dentro de una policy recursa o lee con el RLS del que llama\n',
        v_nombre);
    end if;
  end loop;

  -- 2 · ningún plan vigente con features vacías
  select string_agg(nombre, ', ')
    into v_planes
    from planes
   where not heredado
     and (features is null or features = '{}'::jsonb);

  if v_planes is not null then
    v_fallas := v_fallas || format(
      E'  · plan(es) vigente(s) sin features: %s — con resolución fail-closed no habilitan nada\n',
      v_planes);
  end if;

  if v_fallas <> '' then
    raise exception E'CONTROL POR PLAN ROTO:\n%', v_fallas
      using hint =
        'La resolución vive en 20260822150000_planes_con_control.sql; '
        'el catálogo en feature_plan_valida() y su espejo en lib/planes.ts.';
  end if;
end $$;
