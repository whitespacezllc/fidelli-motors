-- ============================================================
-- Fidelli Motors · Las métricas de la plataforma
--
-- Lo único de todo /fidelli que NO se filtra por tenant: acá los números
-- son de la plataforma entera y sumar todos los lubricentros es el punto.
--
-- POSTURA DE SEGURIDAD — y acá el guard no es una red de seguridad
-- redundante como en el resto del ABM, es lo que evita que la función
-- MIENTA:
--
--   · SECURITY INVOKER (el default) y STABLE. Si la llamara un owner, sus
--     policies recortarían services a los suyos: no habría fuga: habría
--     algo peor. La función devolvería los services de UN lubricentro
--     etiquetados como "toda la plataforma", y una pantalla que dice
--     "1.240 services en Fidelli Motors" mostrando 39 es un dato falso
--     que nadie puede detectar mirándolo.
--   · Por eso exige soy_superadmin() y falla ruidosamente. Un número
--     equivocado con cara de correcto es peor que un error.
--   · search_path fijo. No escribe.
-- ============================================================

create or replace function metricas_plataforma(p_granularidad text default 'semana')
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  -- La unidad de date_trunc y el paso de la serie. Una sola función para
  -- las tres granularidades: lo único que cambia son estas tres variables.
  v_unidad text;
  v_paso   interval;
  v_pasos  integer;

  v_desde   date;
  v_ventana date;
  v_primero date;
  v_serie   jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver las métricas de la plataforma'
      using errcode = '42501';
  end if;

  if p_granularidad = 'dia' then
    v_unidad := 'day';   v_paso := interval '1 day';   v_pasos := 30;
  elsif p_granularidad = 'mes' then
    v_unidad := 'month'; v_paso := interval '1 month'; v_pasos := 12;
  else
    -- Semanal es el default: con pocos datos es el que mejor se lee.
    v_unidad := 'week';  v_paso := interval '1 week';  v_pasos := 12;
  end if;

  -- El primer service de la historia. Es lo que hace que el gráfico
  -- degrade con dignidad: la serie NO arranca en la ventana completa sino
  -- en el día que la plataforma empezó a existir. Con tres días de datos
  -- se ven tres puntos, no veintisiete ceros de antes del lanzamiento
  -- fingiendo un eje lleno.
  select min(fecha) into v_primero from services where not anulado;

  v_ventana := (date_trunc(v_unidad, current_date) - (v_pasos - 1) * v_paso)::date;
  v_desde := greatest(v_ventana, date_trunc(v_unidad, v_primero)::date);

  if v_primero is null then
    v_serie := '[]'::jsonb;
  else
    select jsonb_agg(
             jsonb_build_object(
               'inicio', p.inicio,
               'cantidad', (
                 select count(*)::integer from services s
                 where not s.anulado
                   and s.fecha >= p.inicio
                   and s.fecha < (p.inicio + v_paso)::date
               )
             )
             order by p.inicio)
      into v_serie
      from (
        -- generate_series garantiza que un período sin services aparezca
        -- en cero y no se saltee: un hueco miente sobre la tendencia, y un
        -- cero es información —el domingo cerrado también es un dato—.
        select generate_series(
                 v_desde,
                 date_trunc(v_unidad, current_date)::date,
                 v_paso)::date as inicio
      ) p;
  end if;

  return jsonb_build_object(
    'granularidad', coalesce(p_granularidad, 'semana'),

    -- Services de toda la plataforma en el mes en curso.
    'services_mes', (
      select count(*) from services
      where not anulado
        and fecha >= date_trunc('month', current_date)),

    -- El acumulado desde el día uno: el número que solo sube.
    'acumulado', (select count(*) from services where not anulado),

    'primer_service', v_primero,
    'serie', coalesce(v_serie, '[]'::jsonb)
  );
end;
$$;

comment on function metricas_plataforma is
  'Services del mes, acumulado histórico y la serie del pulso según granularidad (dia | semana | mes). La serie arranca en el primer service, no en la ventana completa. Exige soy_superadmin().';

revoke execute on function metricas_plataforma(text) from public;
grant execute on function metricas_plataforma(text) to authenticated;
