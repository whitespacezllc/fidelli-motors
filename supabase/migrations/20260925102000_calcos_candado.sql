-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 4 · el candado del contador de calcos
--
-- docs/METRICAS.md § 1 «Pedido de calcos»: `lubricentros.calcos_entregadas`
-- ES LA SUMA de `pedidos_calcos`. El bloque 3 hizo que la puerta
-- (`registrar_pedido_calcos()`) recalcule el contador en cada pedido, pero
-- dejó dos caminos por los que un número suelto podía pisarlo:
--
--   · `actualizar_lubricentro()` (ABM original, lista prohibida) hace
--     `set calcos_entregadas = p_calcos` sin mirar los pedidos. El dialog
--     Editar manda el valor actual en solo lectura, así que desde la
--     pantalla no pasa nada; una llamada directa a la RPC con otro número
--     desincronizaba el contador (quedó anotado en § 6 del bloque 3).
--   · El superadmin tiene política `ALL` sobre `lubricentros`: un
--     `update` directo por PostgREST también lo pisaba.
--
-- Desde acá, cualquier UPDATE del contador que no venga de la puerta
-- queda forzado a la suma de los pedidos del tenant. La puerta se
-- identifica con una bandera transaccional (`app.calcos_desde_pedido`)
-- que prende justo antes de su update y apaga justo después: en una
-- transacción larga, la escritura siguiente no hereda el permiso.
--
-- El candado corrige en silencio (con un NOTICE que deja rastro en el log
-- de Postgres) en vez de rechazar: rechazar rompería `actualizar_lubricentro()`
-- entera —nombre, slug, plan, vencimiento— por un campo que la pantalla
-- ya no edita. Una corrección real de calcos se hace registrando otro
-- pedido, como dice el hint de los candados de `pedidos_calcos`.
--
-- Cómo se ve desde tenant_eventos: el trigger AFTER de siempre recibe la
-- fila YA corregida. Si el update directo quería otro número y quedó en
-- la suma (= old), new no es distinto de old y NO sale evento `calcos`:
-- no hubo cambio real. Si el contador estaba desincronizado de antes y el
-- candado lo trae a la suma, sí sale el evento (old → suma), que es la
-- verdad de lo que pasó.
--
-- ¿Y el alta? `crear_lubricentro()` inserta (nombre, slug, cobranza_desde)
-- y el contador nace en su default 0; el wizard no manda calcos. Un
-- trigger AFTER INSERT que registre «el pedido inicial» no tendría nada
-- que registrar en producción, y en local competiría con
-- `backfill_pedidos_calcos()` (que corre en seed.sql porque el demo nace
-- con 50 por INSERT directo en seed_demo()). No se agrega.
-- ════════════════════════════════════════════════════════════════════

-- ---------- El candado ----------

-- >>> forzar_calcos_desde_pedidos
create or replace function forzar_calcos_desde_pedidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suma integer;
begin
  -- Sin la bandera de la puerta, y solo si el update de verdad quiso
  -- mover el contador (un `set calcos_entregadas = calcos_entregadas`,
  -- que es lo que hace el dialog Editar, no cuenta).
  if current_setting('app.calcos_desde_pedido', true) is distinct from 'true'          -- @candado_calcos
     and new.calcos_entregadas is distinct from old.calcos_entregadas then
    -- SECURITY DEFINER para leer pedidos_calcos por encima de su RLS:
    -- la tabla solo la lee el superadmin, y el trigger corre con el rol
    -- del que escribe.
    select coalesce(sum(pc.cantidad), 0) into v_suma
      from pedidos_calcos pc
     where pc.lubricentro_id = new.id;
    if new.calcos_entregadas is distinct from v_suma then
      raise notice 'calcos_entregadas de % pedía % y queda en la suma de sus pedidos (%). El contador se mueve registrando pedidos.',
        new.id, new.calcos_entregadas, v_suma;
    end if;
    new.calcos_entregadas := v_suma;                                                    -- @forzar_calcos
  end if;
  return new;
end;
$$;
-- <<< forzar_calcos_desde_pedidos

comment on function forzar_calcos_desde_pedidos is
  'Candado de lubricentros.calcos_entregadas (bloque MÉTRICAS 4): todo UPDATE del contador que no venga de registrar_pedido_calcos() (bandera app.calcos_desde_pedido) queda en la suma de pedidos_calcos del tenant. docs/METRICAS.md § 1 «Pedido de calcos».';

create trigger candado_calcos_desde_pedidos
  before update of calcos_entregadas on lubricentros
  for each row execute function forzar_calcos_desde_pedidos();

-- ALWAYS, como los demás candados: ni en modo réplica se apaga.
alter table lubricentros enable always trigger candado_calcos_desde_pedidos;

-- ---------- La puerta, ahora con su bandera ----------
-- Misma firma y mismo cuerpo que en 20260924103000_pedidos_calcos.sql; lo
-- único nuevo son las dos líneas alrededor del update. El marcador
-- @suma_calcos sigue acá: scripts/regresion-metricas.sh lo muerde y desde
-- este bloque tiene que morderlo en ESTE archivo (el cuerpo viejo no prende
-- la bandera, así que su rotura la corrige el candado y el verde miente).

-- >>> registrar_pedido_calcos
create or replace function registrar_pedido_calcos(
  p_lubricentro_id uuid,
  p_fecha          date,
  p_cantidad       integer,
  p_incluidas      boolean,
  p_monto          numeric default null,
  p_nota           text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli registra pedidos de calcos' using errcode = '42501';
  end if;
  if not exists (select 1 from lubricentros where id = p_lubricentro_id) then
    raise exception 'no_existe' using hint = 'Ese lubricentro no existe.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'cantidad_invalida' using hint = 'La cantidad tiene que ser mayor que cero.';
  end if;
  if p_fecha is null or p_fecha > current_date then
    raise exception 'fecha_futura' using hint = 'La fecha del pedido no puede ser posterior a hoy.';
  end if;
  if not p_incluidas and p_monto is null then
    raise exception 'monto_obligatorio' using hint = 'Si las calcos se cobraron, hay que decir cuánto.';
  end if;

  insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, monto_ars, nota, registrado_por)
  values (p_lubricentro_id, p_fecha, p_cantidad, p_incluidas,
          case when p_incluidas then null else round(p_monto, 2) end,
          nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;

  -- La bandera que le dice al candado que ESTE update viene de la puerta.
  -- Transaccional (is_local = true): si el update revienta, la transacción
  -- la deshace sola. Y se apaga a mano justo después, porque una
  -- transacción larga (una prueba, un lote) seguiría con el permiso puesto
  -- para cualquier update posterior del contador.
  perform set_config('app.calcos_desde_pedido', 'true', true);                  -- @bandera_calcos

  -- El contador es la suma. Este update dispara el evento `calcos`.
  update lubricentros l
     set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0)              -- @suma_calcos
                                from pedidos_calcos pc
                               where pc.lubricentro_id = p_lubricentro_id)
   where l.id = p_lubricentro_id;

  perform set_config('app.calcos_desde_pedido', '', true);                      -- @apagar_bandera

  return v_id;
end;
$$;
-- <<< registrar_pedido_calcos

comment on function registrar_pedido_calcos is
  'Registra una entrega de calcos y deja lubricentros.calcos_entregadas igual a la suma de los pedidos del tenant (docs/METRICAS.md § 1 «Pedido de calcos»). Es la única escritura del contador que el candado candado_calcos_desde_pedidos deja pasar (bandera app.calcos_desde_pedido, prendida solo durante su update). Con cobradas, el monto es obligatorio. Solo superadmin.';

-- `create or replace` conserva los permisos; se repiten para que este
-- archivo se lea solo.
revoke all on function registrar_pedido_calcos(uuid, date, integer, boolean, numeric, text) from public, anon;
grant execute on function registrar_pedido_calcos(uuid, date, integer, boolean, numeric, text) to authenticated, service_role;

-- ---------- Aviso al aplicar (no cambia datos) ----------
-- Después del backfill de 20260924103000 todos los contadores eran la suma
-- (R33h). Si desde entonces alguien llamó actualizar_lubricentro() con
-- otro número, acá se cuenta y se avisa. No se corrige a mano: un contador
-- mayor que la suma son calcos entregadas sin pedido, y eso se arregla
-- registrando el pedido que falta (fecha, cantidad, si se cobró), no
-- pisando el número. El candado lo trae a la suma en el próximo update.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from lubricentros l
   where l.calcos_entregadas <> coalesce((select sum(pc.cantidad) from pedidos_calcos pc where pc.lubricentro_id = l.id), 0);
  raise notice 'candado de calcos · tenants con el contador distinto de la suma de sus pedidos: %', v_n;
end $$;
