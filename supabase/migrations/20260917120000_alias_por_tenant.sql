-- ════════════════════════════════════════════════════════════════════
-- EL ALIAS FIJO POR TENANT · un dato guardado, no un cálculo
--
-- Hoy el alias es DERIVADO: `aliasDeOrden()` lo recalcula en cada orden a
-- partir del `externalId`, que lleva el período, así que **cambia todos los
-- meses**. Eso es incompatible con lo único que el alias fijo habilita: que
-- el dueño deje una transferencia programada en su home banking.
--
-- Pasa a ser un DATO DEL TENANT, escrito una vez y jamás recalculado.
--
--
-- ⚠ NO SE ASIGNA NI UN SOLO ALIAS TODAVÍA, Y EL CANDADO ESTÁ EN EL CÓDIGO
--
-- Cresium devuelve `TOO_MANY_ALIAS_UPDATES` —hay un tope de cambios por
-- CVU— y la doc no dice cuántos. Eso mata cualquier estrategia de "lo
-- generamos y lo corregimos después": si se asigna con el formato
-- equivocado, no hay vuelta atrás barata.
--
-- Por eso `alias_confirmado_por_cresium()` devuelve **false** y
-- `fijar_alias_de_tenant()` rechaza mientras lo sea. El camino está entero
-- y no escribe nada. Se prende con una migración de una línea el día que
-- Santiago tenga las respuestas.
--
--
-- ⚠ UN TENANT SIN ALIAS SIGUE COBRANDO POR EL CAMINO DE HOY
--
-- `cresium_alias` es **anulable y sin default**, con el mismo criterio que
-- `vehiculos.clase` (20260915130000): `null` no es un estado roto, es la
-- respuesta «todavía no se le asignó». `lib/cresium/orden.ts` lo lee y cae
-- al alias por orden sin un solo error. El corte es un DATO, no un deploy:
-- los 17 tenants de hoy siguen exactamente como están.
--
--
-- ⚠ EL ALIAS NO SALE DEL SLUG, Y NO ES UN DETALLE DE ESTILO
--
-- El estándar argentino de alias CBU/CVU es de 6 a 20 caracteres, y los
-- slugs reales no entran: `lubricentro-y-gomeria-el-colo` tiene 29 por sí
-- solo. Además el slug es único entre NUESTROS tenants; el alias es único
-- a nivel nacional y Cresium devuelve `EXISTING_ALIAS` cuando lo tiene
-- otra cuenta del país. Son dos espacios de nombres distintos, y por eso
-- el alias es una columna propia y no una función del slug.
--
-- (El formulario SUGIERE uno a partir del slug, recortado. Una sugerencia
-- no es una respuesta: eso vive en `lib/cresium/alias.ts`, que es ayuda de
-- UI, no regla de negocio — mismo corte que `clasePorMarca()`.)
--
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @alias_formato`, `-- @alias_min`,
-- `-- @alias_max`, `-- @alias_confirmado` y `-- @alias_inmutable` NO SE
-- REFORMATEAN NUNCA: las muerde el `sed` de
-- `scripts/regresion-cobranza-alias.sh`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Los tres números que Cresium todavía no contestó
-- ════════════════════════════════════════════════════════════════════
--
-- Viven en funciones de una línea, como `dias_de_aviso()` y
-- `dias_de_gracia()`, por el mismo motivo: se cambian con una migración
-- nueva y valen lo mismo en local y en producción por construcción.
--
-- Los dos largos NO están inventados: son el estándar argentino de alias
-- CBU/CVU, que es público. Lo que falta confirmar es si Cresium los
-- respeta tal cual.

-- >>> alias_largo_minimo
create or replace function alias_largo_minimo()
returns integer
language sql
immutable
parallel safe
as $$ select 6; $$;                                                  -- @alias_min
-- <<< alias_largo_minimo

-- >>> alias_largo_maximo
create or replace function alias_largo_maximo()
returns integer
language sql
immutable
parallel safe
as $$ select 20; $$;                                                 -- @alias_max
-- <<< alias_largo_maximo

comment on function alias_largo_minimo is
  'El piso del alias. 6 es el estándar argentino de alias CBU/CVU; falta que Cresium lo confirme.';
comment on function alias_largo_maximo is
  'El techo del alias. 20 es el estándar argentino de alias CBU/CVU; falta que Cresium lo confirme. Es el número que recorta la sugerencia del formulario.';


-- ---------- El formato ----------
--
-- FUENTE ÚNICA: `alias_formato_valido()`. La usan el CHECK de la columna y
-- `alias_estado()`; el front repite la expresión en `lib/cresium/alias.ts`
-- SOLO PARA AVISAR antes del rechazo del server. Mismo patrón que
-- `patente_formato_valido()` y `slug_reservado()`.
--
-- ⚠ POR QUÉ ESTA FORMA Y NO OTRA. Lo único MEDIDO es que Cresium aceptó
-- alias con la forma `fm.xxxxxxxx.yyyyyy` —minúsculas, dígitos y puntos
-- simples—: es lo que produce `aliasDeOrden()` y es lo que se usó en la
-- orden real del 16/09/2026. Todo lo demás que el estándar suele permitir
-- (mayúsculas, guiones, guiones bajos) NO está medido contra Cresium, así
-- que queda afuera. Es la regla 19 de CLAUDE.md aplicada antes de romperse:
-- un formato copiado de una documentación que no se pudo contrastar es un
-- formato inventado, y acá el error no se corrige barato.
--
-- El día que llegue la respuesta, esta función se redefine en una migración
-- nueva. Que sea más PERMISIVA no rompe ningún alias ya escrito; que sea
-- más estricta sí, y por eso arranca del lado estricto.

-- >>> alias_formato_valido
create or replace function alias_formato_valido(p_alias text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select p_alias ~ '^[a-z0-9]+(\.[a-z0-9]+)*$';                      -- @alias_formato
$$;
-- <<< alias_formato_valido

comment on function alias_formato_valido is
  'La forma de un alias de CVU: minúsculas, dígitos y puntos simples. Es lo ÚNICO medido contra Cresium (la orden real del 16/09/2026). El largo lo chequea aparte el CHECK de la columna, con alias_largo_minimo/maximo. Espejo en lib/cresium/alias.ts, que solo avisa.';


-- ---------- El interruptor ----------
--
-- Uno solo, global, y arranca APAGADO. No es por tenant: lo que falta no
-- es una decisión comercial sobre un cliente, son tres datos de Cresium
-- que valen para todos.
--
-- Lo que falta, escrito acá para que no haya que buscarlo:
--
--   1. EL LARGO MÁXIMO real que acepta Cresium.
--   2. EL FORMATO EXACTO: ¿mayúsculas? ¿guiones? ¿guiones bajos?
--      ¿cuántos puntos seguidos? ¿puede empezar o terminar con punto?
--   3. EL TOPE DE CAMBIOS por CVU (`TOO_MANY_ALIAS_UPDATES`).
--
-- Y una cuarta que apareció leyendo el código y que NO estaba en la lista:
--
--   4. ¿A QUÉ CUENTA SE PEGA UN ALIAS QUE NO CAMBIA? Hoy cada orden crea
--      un CVU dedicado que muere a los 7 días (`expiresIn`), y hay un tope
--      de 300 CVUs por company. Un alias que no cambia nunca necesita o
--      una cuenta de depósito que NO expire, o re-apuntarlo al CVU nuevo
--      en cada orden — y re-apuntarlo en cada orden es exactamente lo que
--      consume el cupo de la pregunta 3. Las dos respuestas están atadas.
--
-- ⚠ ES UNA FUNCIÓN Y NO UNA COLUMNA, al revés que los dos interruptores
-- del reloj (regla 17 de CLAUDE.md), y el motivo es justo el que esa regla
-- da: los interruptores del reloj tienen que poder estar prendidos en
-- producción y apagados en local, así que son DATOS. Éste no: mientras
-- Cresium no conteste está apagado EN TODAS PARTES, y el día que conteste
-- se prende en todas a la vez. Eso es exactamente lo que una migración
-- garantiza por construcción y un dato no.

-- >>> alias_confirmado_por_cresium
create or replace function alias_confirmado_por_cresium()
returns boolean
language sql
immutable
parallel safe
as $$ select false; $$;                                              -- @alias_confirmado
-- <<< alias_confirmado_por_cresium

comment on function alias_confirmado_por_cresium is
  'false = Cresium todavía no confirmó el largo máximo, el formato exacto ni el tope de cambios de alias, así que NO se asigna ninguno. fijar_alias_de_tenant() rechaza mientras esto sea false. Se prende con una migración de una línea, junto con los números confirmados.';


-- ════════════════════════════════════════════════════════════════════
-- 2 · La columna
-- ════════════════════════════════════════════════════════════════════

alter table lubricentros
  add column cresium_alias text
    constraint alias_formato check (cresium_alias is null or alias_formato_valido(cresium_alias))
    constraint alias_largo   check (
      cresium_alias is null
      or char_length(cresium_alias) between alias_largo_minimo() and alias_largo_maximo()
    ),
  add column cresium_alias_asignado_at timestamptz;

comment on column lubricentros.cresium_alias is
  'El alias fijo del tenant, escrito UNA vez y jamás recalculado. NULL = todavía no se le asignó, y entonces sigue cobrando por el alias derivado de cada orden (lib/cresium/orden.ts). No es el slug: el alias es único a nivel NACIONAL y entra en 6-20 caracteres.';

comment on column lubricentros.cresium_alias_asignado_at is
  'Cuándo se le asignó el alias. El día que alguien pregunte "¿desde cuándo tengo este alias?", la fila lo contesta — y es lo que va a permitir contar los cambios contra el tope de Cresium.';

-- La unicidad de nuestro lado, que es la única que podemos garantizar: la
-- nacional la decide Cresium y llega como `EXISTING_ALIAS`.
--
-- SOBRE `lower()` porque dos alias que difieren solo en mayúsculas son el
-- mismo alias para un banco. `fijar_alias_de_tenant()` ya normaliza lo que
-- entra, así que el `lower()` de acá es la defensa de lo que NO pasa por la
-- puerta: un INSERT o un UPDATE directo. Lo afirma R25d, y con un UPDATE
-- directo a propósito — probarlo por la puerta prueba la puerta, no el
-- índice.
--
-- PARCIAL por tamaño, no por corrección: dos NULL nunca colisionan en un
-- unique de Postgres, así que los 17 tenants en null conviven igual sin el
-- `where`. Está para no indexar 17 filas que no aportan nada. Molde:
-- `canjes_un_service`.
create unique index lubricentros_cresium_alias_key
  on lubricentros (lower(cresium_alias))
  where cresium_alias is not null;


-- ════════════════════════════════════════════════════════════════════
-- 3 · El candado: escrito una vez, nunca recalculado
-- ════════════════════════════════════════════════════════════════════
--
-- Es la promesa entera del bloque. Si mañana Cresium cambia algo, o alguien
-- vuelve a pedir el alias, el tenant NO puede terminar con uno distinto del
-- que ya dejó cargado en su home banking: eso rompe la transferencia
-- programada, que es justamente lo que el alias fijo habilita.
--
-- ⚠ ES INMUTABLE DE VERDAD, sin puerta de escape, y no por prolijidad: el
-- tope de cambios de Cresium es un número que todavía no conocemos. Un
-- candado que permite "solo unos pocos cambios" necesita saber cuántos son.
-- El día que se sepa, ESTE trigger se redefine para contar contra el tope;
-- hasta entonces la única respuesta honesta es cero.
--
-- El null → valor SÍ pasa: ésa es la asignación, y la gobierna
-- `fijar_alias_de_tenant()`.

-- >>> bloquear_cambio_de_alias
create or replace function bloquear_cambio_de_alias()
returns trigger
language plpgsql
as $$
begin
  if old.cresium_alias is not null                                   -- @alias_inmutable
     and new.cresium_alias is distinct from old.cresium_alias
  then
    raise exception 'alias_inmutable'
      using hint = 'El alias de un tenant se escribe una vez y no se toca: es el que el dueño ya dejó cargado en su home banking para la transferencia programada, y Cresium además tiene un tope de cambios por CVU (TOO_MANY_ALIAS_UPDATES) que todavía no sabemos cuál es. Si el alias quedó mal, es una conversación con Cresium, no un UPDATE.';
  end if;

  return new;
end;
$$;
-- <<< bloquear_cambio_de_alias

create trigger candado_alias_inmutable
  before update on lubricentros
  for each row execute function bloquear_cambio_de_alias();


-- ════════════════════════════════════════════════════════════════════
-- 4 · La única puerta
-- ════════════════════════════════════════════════════════════════════
--
-- SECURITY INVOKER, como `crear_lubricentro` y `fijar_override_plan`: el
-- RLS de `lubricentros` sigue decidiendo, y la guarda de superadmin va
-- explícita adentro.

create or replace function fijar_alias_de_tenant(
  p_lubricentro uuid,
  p_alias       text
)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alias text := lower(trim(coalesce(p_alias, '')));
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede asignar un alias'
      using errcode = '42501';
  end if;

  -- EL CANDADO DEL SPRINT. Va PRIMERO, antes de cualquier validación de
  -- forma: mientras no sepamos el formato exacto, ni siquiera un alias que
  -- pasa nuestras propias reglas se puede asignar.
  if not alias_confirmado_por_cresium() then
    raise exception 'alias_sin_confirmar'
      using hint = 'Todavía no se asigna ningún alias: falta que Cresium confirme el largo máximo, el formato exacto y el tope de cambios por CVU. Un alias asignado con el formato equivocado no se corrige barato — hay un tope de cambios. Mientras tanto el tenant cobra por el alias derivado de cada orden, que es lo que viene haciendo.';
  end if;

  if v_alias = '' then
    raise exception 'alias_vacio';
  end if;

  if char_length(v_alias) < alias_largo_minimo()
     or char_length(v_alias) > alias_largo_maximo() then
    raise exception 'alias_largo'
      using detail = format('El alias va de %s a %s caracteres y tiene %s.',
                            alias_largo_minimo(), alias_largo_maximo(), char_length(v_alias));
  end if;

  if not alias_formato_valido(v_alias) then
    raise exception 'alias_formato';
  end if;

  update lubricentros
     set cresium_alias             = v_alias,
         cresium_alias_asignado_at = now()
   where id = p_lubricentro
     -- El `is null` no es una optimización: es lo que hace que reasignar
     -- sea un no-op silencioso en vez de un UPDATE que el trigger rechaza
     -- con un mensaje sobre inmutabilidad. Acá el error correcto es
     -- «ya tiene», que es otra conversación.
     and cresium_alias is null;

  if not found then
    if exists (select 1 from lubricentros where id = p_lubricentro and cresium_alias is not null) then
      raise exception 'alias_ya_asignado';
    end if;
    raise exception 'sin_permiso_lubricentro';
  end if;

  return v_alias;
end;
$$;

comment on function fijar_alias_de_tenant is
  'La ÚNICA puerta para asignar el alias de un tenant. Rechaza mientras alias_confirmado_por_cresium() sea false. Un tenant que ya tiene alias no se reasigna: el alias es inmutable.';

revoke all on function fijar_alias_de_tenant(uuid, text) from public, anon;
grant execute on function fijar_alias_de_tenant(uuid, text) to authenticated;


-- ---------- La consulta de disponibilidad ----------
--
-- Molde literal de `slug_estado()`: entra un texto, sale una palabra.
--
-- ⚠ CONTESTA SOLO POR NUESTRA BASE, y eso hay que decirlo donde se lea.
-- La unicidad del alias es NACIONAL y no hay ningún endpoint conocido de
-- Cresium para consultarla antes de pedirla: lo único que devuelve
-- `EXISTING_ALIAS` es el intento de crear la cuenta. O sea que
-- `disponible` acá significa «libre entre nuestros tenants y con la forma
-- correcta», nunca «Cresium te lo va a dar».
--
-- Es la quinta pregunta para Cresium: si existe una consulta de
-- disponibilidad, o si el único camino es pedirlo y manejar el rechazo.

create or replace function alias_estado(p_alias text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_alias text := lower(trim(coalesce(p_alias, '')));
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede consultar un alias'
      using errcode = '42501';
  end if;

  if char_length(v_alias) < alias_largo_minimo() then return 'corto'; end if;
  if char_length(v_alias) > alias_largo_maximo() then return 'largo'; end if;
  if not alias_formato_valido(v_alias)           then return 'invalido'; end if;

  if exists (select 1 from lubricentros where lower(cresium_alias) = v_alias) then
    return 'ocupado';
  end if;

  -- No hay rama 'confirmado': que el interruptor esté apagado no cambia si
  -- el alias está libre. El formulario puede mostrar el veredicto igual; el
  -- que rechaza es `fijar_alias_de_tenant()`, y por un motivo distinto.
  return 'disponible';
end;
$$;

comment on function alias_estado is
  'corto | largo | invalido | ocupado | disponible. SOLO mira nuestra base: la unicidad del alias es NACIONAL y Cresium no expone ninguna consulta de disponibilidad, así que «disponible» nunca significa que Cresium lo vaya a dar.';

revoke all on function alias_estado(text) from public, anon;
revoke all on function alias_formato_valido(text) from public, anon;
revoke all on function alias_largo_minimo() from public, anon;
revoke all on function alias_largo_maximo() from public, anon;
revoke all on function alias_confirmado_por_cresium() from public, anon;
grant execute on function alias_estado(text)              to authenticated;
grant execute on function alias_formato_valido(text)      to authenticated;
grant execute on function alias_largo_minimo()            to authenticated;
grant execute on function alias_largo_maximo()            to authenticated;
grant execute on function alias_confirmado_por_cresium()  to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 5 · El alta, que ahora puede traer el alias elegido
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠ DROP + CREATE Y NO `create or replace`: el parámetro nuevo va al final
-- y con default, así que un replace dejaría DOS sobrecargas y PostgREST
-- contestaría 300 ambiguo. Es lo que ya se aprendió con
-- `crear_cliente_con_vehiculo` (20260915130000:92).
--
-- Es la versión de 20260822150000 con una sola cosa agregada: si viene un
-- alias, se asigna por la MISMA puerta que todo lo demás. Adentro de la
-- transacción del alta, así que un alias rechazado —hoy, siempre— aborta
-- el alta entera en vez de dejar un tenant a medias.
--
-- Hoy `p_alias` llega siempre null desde la aplicación, porque el
-- formulario no muestra el campo mientras el interruptor esté apagado. El
-- parámetro existe para que el día que se prenda no haya que tocar SQL.

drop function if exists crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, integer);

create or replace function crear_lubricentro(
  p_nombre         text,
  p_slug           text,
  p_sucursales     jsonb,
  p_plan_id        uuid,
  p_periodo        periodo_suscripcion,
  p_descuento_pct  numeric,
  p_dias_trial     integer,
  p_alias          text default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_id      uuid;
  v_suc     jsonb;
  v_nombre  text;
  v_cuantas integer := 0;
  v_limite  integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede dar de alta un lubricentro'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'nombre_vacio';
  end if;

  if p_plan_id is null then
    raise exception 'plan_vacio';
  end if;

  if p_descuento_pct is null or p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'descuento_invalido';
  end if;

  if p_dias_trial is null or p_dias_trial < 0 or p_dias_trial > 365 then
    raise exception 'trial_invalido';
  end if;

  insert into lubricentros (nombre, slug)
  values (trim(p_nombre), lower(trim(coalesce(p_slug, ''))))
  returning id into v_id;

  insert into config_experiencia (lubricentro_id) values (v_id);

  for v_suc in
    select * from jsonb_array_elements(coalesce(p_sucursales, '[]'::jsonb))
  loop
    v_nombre := nullif(trim(coalesce(v_suc->>'nombre', '')), '');
    if v_nombre is null then
      continue;
    end if;

    insert into sucursales (lubricentro_id, nombre, direccion, telefono, horarios)
    values (
      v_id,
      v_nombre,
      nullif(trim(coalesce(v_suc->>'direccion', '')), ''),
      nullif(trim(coalesce(v_suc->>'telefono', '')), ''),
      nullif(trim(coalesce(v_suc->>'horarios', '')), '')
    );

    v_cuantas := v_cuantas + 1;
  end loop;

  if v_cuantas = 0 then
    raise exception 'sin_sucursales';
  end if;

  -- El tope de sucursales del plan elegido. Se valida contra el PLAN y no
  -- contra plan_limite(): el tenant nuevo todavía no tiene suscripción.
  v_limite := limite_del_plan(p_plan_id, 'sucursales');
  if v_limite is not null and v_cuantas > v_limite then
    raise exception 'limite_sucursales'
      using
        detail = format('El plan elegido permite %s sucursal(es) y se cargaron %s.', v_limite, v_cuantas),
        hint = 'Sacá sucursales del alta o elegí un plan con más lugares.';
  end if;

  insert into suscripciones (
    lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento
  )
  values (
    v_id, p_plan_id, 'trial', p_periodo, p_descuento_pct,
    current_date, current_date + p_dias_trial
  );

  -- Los mensajes de WhatsApp, con el tono Cercano activo: el botón de
  -- contacto de /panel/proximos funciona desde el primer día.
  perform sembrar_templates(v_id, trim(p_nombre));

  -- El alias, si el alta lo trajo. Por la MISMA puerta que una asignación
  -- posterior: una segunda copia de las validaciones acá sería la forma
  -- exacta de que el alta acepte un alias que la puerta rechaza.
  if nullif(trim(coalesce(p_alias, '')), '') is not null then
    perform fijar_alias_de_tenant(v_id, p_alias);
  end if;

  return v_id;
end;
$$;

comment on function crear_lubricentro is
  'Fase 1 del alta: tenant + config + sucursales + suscripción en trial + templates, en una transacción. Exige soy_superadmin() y valida el tope de sucursales del plan elegido. Si viene p_alias, lo asigna por fijar_alias_de_tenant() —que hoy rechaza siempre—. La invitación del owner es la fase 2 y va por HTTP.';

revoke execute on function crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, integer, text) from public, anon;
grant execute on function crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, integer, text) to authenticated;
