-- ════════════════════════════════════════════════════════════════════
-- EL ALTA PRENDE EL RELOJ · y el que nunca pagó no tiene gracia
--
-- `cobranza_desde` está hoy en 0 de 17 y no tiene UI: prenderlo es un
-- UPDATE a mano contra producción con un `where`, con 16 tenants sin
-- proteger. Eso es un arma cargada, y se desactiva sola con un cambio
-- chico: **el alta de un tenant nuevo escribe `cobranza_desde`**.
--
-- Los nuevos nacen con el reloj andando; los 16 viejos siguen apagados y se
-- prenden de a uno, a mano, cuando Santiago quiera. El rollout deja de ser
-- un script peligroso y pasa a ser el curso natural de las cosas — y el
-- primer lubricentro que se dé de alta es el piloto completo, sin tocar a
-- nadie más.
--
-- Vienen tres cosas más, y las tres son decisiones de Santiago del
-- 16/09/2026:
--
--   · EL TENANT NUEVO NACE PAGANDO, NO EN TRIAL, con
--     `vencimiento = fecha del alta + 1 día`.
--   · EL QUE NUNCA PAGÓ NO TIENE DÍAS DE GRACIA. Su escalera es de dos
--     escalones —`por_vencer` y bloqueado— y salta la ventana de gracia
--     entera. La gracia de siete días es para el que YA es cliente y se
--     atrasó, que es otra conversación.
--   · EL BLOQUEO DEL ALTA TIENE SU PROPIO INTERRUPTOR, separado de
--     `suspension_automatica`, global, y arranca APAGADO.
--
--
-- ⚠ EL PLAZO SE DICE "HASTA MAÑANA" Y SE BLOQUEA AL DÍA SIGUIENTE
--
-- El reloj trabaja en días de punta a punta. Un alta a las 23:50 con
-- `vencimiento = mañana` se bloquearía diez minutos después, y eso no es un
-- plazo de 24 horas: es una trampa. No se mete un timestamp por una
-- excepción —cambiar la granularidad del reloj toca todo el sistema—: se
-- resuelve con el redondeo A FAVOR DEL CLIENTE, que acá es un `>` y no un
-- `>=`. El copy dice "hasta mañana" y muestra la fecha de `vencimiento`; el
-- bloqueo ocurre al día SIGUIENTE de esa fecha, nunca el mismo día.
--
-- Un alta a las 23:50 tiene 24 horas largas; una a las 00:10 tiene casi 48.
-- Siempre a favor del cliente: nadie reclama por tiempo de más, todos
-- reclaman por un corte a medianoche.
--
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @bloqueo_alta`, `-- @sin_pagos` y
-- `-- @alta_reloj` NO SE REFORMATEAN NUNCA, ni los marcadores
-- `-- >>> nombre` / `-- <<< nombre`: los muerde el `sed` de
-- `scripts/regresion-cobranza-alta.sh`.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · El tercer interruptor
-- ════════════════════════════════════════════════════════════════════
--
-- `suspension_automatica` está apagada porque **el cálculo del monto
-- todavía no se verificó nunca contra un pago real correcto** — el único
-- cobro que entró fueron $390 de prueba al CVU del demo.
--
-- Si el bloqueo a las 24 horas saliera automático hoy, el primer cliente
-- que bloquee podría ser uno bloqueado POR UN MONTO MAL CALCULADO (Capuzzi
-- con gomería bonificada viendo $74.000 en vez de $49.000). Y no es
-- cualquier cliente: es uno que un vendedor acaba de cerrar, en su segundo
-- día de uso.
--
-- Por eso un TERCER interruptor, que gobierna solo el bloqueo del que nunca
-- pagó. Mientras esté apagado el sistema avisa con la voz `alta` y no
-- bloquea; Santiago bloquea a mano durante las primeras altas. Se prende en
-- cuanto entre UN SOLO pago real con el monto correcto — es un pago de
-- distancia, no un ciclo.
--
--
-- ⚠ ES UNA FUNCIÓN Y NO UNA COLUMNA, al revés que los dos interruptores del
-- reloj, y la regla 17 de CLAUDE.md no lo contradice: lo que esa regla dice
-- es que **prendido en prod y apagado en local tiene que ser un DATO**. Los
-- dos del reloj son exactamente ese caso —`cobranza_desde` se prende tenant
-- por tenant y `suspension_automatica` en el segundo ciclo, los dos solo en
-- producción—. Éste no: está apagado en TODAS PARTES y el día que se
-- prenda, se prende en todas a la vez, porque lo que lo destraba es un
-- hecho del mundo (un pago real con el monto correcto), no un rollout. Es
-- el mismo caso que `alias_confirmado_por_cresium()` (20260917120000).
--
-- El costo, dicho: prenderlo es una migración y un `db push`, no un UPDATE.
-- Se acepta a propósito — es UNO solo y global, así que no tiene el
-- problema que este bloque vino a resolver, que era un UPDATE a mano con un
-- `where` contra 17 filas.

-- >>> bloqueo_de_alta_activo
create or replace function bloqueo_de_alta_activo()
returns boolean
language sql
immutable
parallel safe
as $$ select false; $$;                                              -- @bloqueo_alta
-- <<< bloqueo_de_alta_activo

comment on function bloqueo_de_alta_activo is
  'false = el reloj AVISA al que nunca pagó pero nunca le cierra el panel. Es el TERCER interruptor, separado de suspension_automatica y global: gobierna solo el bloqueo del que no tiene ningún pago acreditado. Se prende en cuanto entre un pago real con el monto correcto.';

revoke all on function bloqueo_de_alta_activo() from public, anon;
grant execute on function bloqueo_de_alta_activo() to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 2 · El reloj, con la escalera de dos escalones del que nunca pagó
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠ DROP + CREATE Y NO `create or replace`: el parámetro nuevo deja DOS
-- sobrecargas y PostgREST contesta 300 ambiguo. Va al FINAL y con default
-- `false`, para que las catorce llamadas literales de `verificaciones.sql`
-- sigan valiendo tal cual — un tenant del que no se dice nada se comporta
-- como hasta hoy.
--
-- ⚠ Y AL DROPEAR SE ROMPEN SUS DOS CONSUMIDORES EN SILENCIO: los cuerpos
-- en `$$` no dejan dependencia registrada, así que `reloj_cobranza()` y
-- `cobranzas_pendientes()` siguen existiendo y fallan recién en runtime, o
-- sea en el primer request del panel. Los dos se recrean ACÁ ABAJO.

drop function if exists estado_cobranza(boolean, date, date, boolean, numeric);

-- >>> estado_cobranza
create or replace function estado_cobranza(
  p_activo        boolean,
  p_vencimiento   date,
  p_desde         date,      -- SIN default: un argumento olvidado tiene que gritar
  p_suspension    boolean,
  p_descuento_pct numeric,
  p_nunca_pago    boolean default false
)
returns text
language sql
stable                       -- current_date adentro: NUNCA immutable
set search_path = public
as $$
  select case
    -- El interruptor manual del superadmin gana siempre, incluso sobre
    -- estar afuera del reloj: si alguien apagó este tenant a mano, fue a
    -- propósito. Va PRIMERO y no se mueve.
    when not p_activo                                    then 'suspendido'  -- @activo

    -- Quien no paga nada no puede deber nada. Un tenant con el 100% de
    -- descuento queda fuera del circuito ENTERO —sin cuenta regresiva, sin
    -- barra, sin modal, sin orden de pago—, y sale del DATO y no de una
    -- lista de slugs: el día que Santiago le dé el 100% a alguien más,
    -- funciona solo. Hoy son dos (un trial bonificado y el demo).
    when p_descuento_pct >= 100                          then 'al_dia'      -- @exento

    -- Afuera del reloj, o todavía no le llegó el día.
    when p_desde is null or current_date < p_desde       then 'al_dia'      -- @desde

    -- Sin suscripción no se le reclama a quien no sabemos qué debe.
    when p_vencimiento is null                           then 'al_dia'

    -- ⚠ EL QUE NUNCA PAGÓ NO TIENE GRACIA, Y ESTA RAMA VA ACÁ.
    --
    -- Va DESPUÉS de @activo, @exento y @desde —que siguen ganando— y ANTES
    -- de la ventana de gracia, que es lo que la hace SALTAR esa ventana
    -- entera en vez de atravesarla. Puesta más abajo, el tenant nuevo
    -- pasaría por `gracia` igual y lo terminaría bloqueando el interruptor
    -- equivocado; y ninguna de las diez roturas del reloj lo atraparía,
    -- porque todas llaman con cinco argumentos.
    --
    -- El `>` y no `>=` ES EL REDONDEO A FAVOR DEL CLIENTE (D2): con el
    -- vencimiento al día siguiente del alta, el bloqueo cae recién al
    -- segundo día. Un alta a las 23:50 tiene 24 horas largas.
    --
    -- Y el escalón es 'suspendido', no un quinto estado: los cuatro de
    -- `ESTADOS_COBRANZA` son un contrato con el front. Lo que cambia es la
    -- VOZ con que se le habla, y eso lo decide el copy.
    when p_nunca_pago and current_date > p_vencimiento                       -- @sin_pagos
      then case when bloqueo_de_alta_activo() then 'suspendido' else 'por_vencer' end

    -- Pasada la ventana de gracia. EL SEGUNDO INTERRUPTOR VIVE ACÁ: con
    -- `suspension_automatica` en false el reloj AVISA pero no cierra el
    -- panel — el estado se queda en `gracia` y `activo` sigue en true.
    -- Es el "primer ciclo solo avisos".
    when current_date > p_vencimiento + dias_de_gracia()                     -- @borde
      then case when p_suspension then 'suspendido' else 'gracia' end       -- @corta

    when current_date > p_vencimiento                    then 'gracia'
    when p_vencimiento <= current_date + dias_de_aviso() then 'por_vencer'  -- @aviso
    else                                                      'al_dia'
  end;
$$;
-- <<< estado_cobranza

comment on function estado_cobranza is
  'El reloj. Pura salvo current_date: entran valores, sale una palabra. `not p_activo` gana siempre; descuento 100 queda exento; p_desde null = afuera del reloj; p_suspension false topa el estado en gracia. Y el que NUNCA PAGÓ (p_nunca_pago) salta la ventana de gracia entera: va de por_vencer a suspendido, y solo si bloqueo_de_alta_activo().';

revoke all on function estado_cobranza(boolean, date, date, boolean, numeric, boolean) from public, anon;
grant execute on function estado_cobranza(boolean, date, date, boolean, numeric, boolean) to authenticated;


-- ---------- El payload, con la décima clave ----------
--
-- ⚠ CRECE DE NUEVE CLAVES A DIEZ, y eso toca CUATRO lugares o no rompe nada
-- y miente: este `jsonb_build_object`, el array de claves de R21d, el par
-- `CobranzaCruda`/`aCobranza` de lib/auth/cobranza.ts y este comment. Los
-- campos calculados de PostgREST no aparecen en el `Row` de la tabla, así
-- que una clave mal escrita llega como `undefined` y TypeScript no dice
-- nada: la pantalla diría "te quedan undefined días".
--
-- ⚠ Y `dias_restantes` PASA A SER null PARA EL QUE NUNCA PAGÓ.
-- `dias_de_gracia_restantes()` es aritmética sobre el vencimiento y le
-- devolvería 8: ocho días de gracia que no existen. La clave sigue estando
-- —R21d las cuenta— y `numeroOnulo()` ya tolera el null.
--
-- ⚠ EL `exists` FALLA HACIA EL LADO CARO, y por eso se emite en positivo.
-- Esta función es INVOKER, así que la policy `pagos_lectura` recorta la
-- subconsulta. Un contexto sin permiso vería cero filas y concluiría "nunca
-- pagó" para alguien que pagó — y con el tercer interruptor prendido, eso
-- lo bloquea. Se emite `tiene_pago` (positivo) y el front deriva lo otro:
-- ante la duda, el default es "ya pagó". Es el mismo criterio que
-- `modulo_es_pago()` con "ante la duda, no cobrar", en la dirección que
-- corresponde acá. En el panel el owner SÍ lee sus propios pagos
-- (`lubricentro_id = mi_lubricentro_id()`), así que el caso normal es
-- correcto.

-- >>> reloj_cobranza
create or replace function reloj_cobranza(l lubricentros)
returns jsonb
language sql
stable                        -- @modo · invoker por omisión: NO poner definer
set search_path = public
as $$
  with sub as (
    -- La suscripción VIGENTE, con el mismo criterio que usa todo el resto
    -- del repo (listado_lubricentros, actualizar_lubricentro, registrar_pago,
    -- feature_de_tenant): no hay unique por lubricentro, un tenant acumula
    -- suscripciones históricas. Copiar ESTE criterio, no inventar otro.
    select s.vencimiento, s.periodo, s.descuento_pct, s.estado, s.plan_id
    from suscripciones s
    where s.lubricentro_id = l.id                                  -- @tenant
    order by s.inicio desc, s.created_at desc
    limit 1
  ),
  pago as (
    select exists (select 1 from pagos p where p.lubricentro_id = l.id) as hubo
  )
  select jsonb_build_object(
    'estado',            estado_cobranza(l.activo, sub.vencimiento, l.cobranza_desde,
                                         l.suspension_automatica, coalesce(sub.descuento_pct, 0),
                                         not pago.hubo),
    'vencimiento',       sub.vencimiento,
    'dias_restantes',    case when pago.hubo then dias_de_gracia_restantes(sub.vencimiento) end,
    'dias_para_vencer',  sub.vencimiento - current_date,
    'periodo',           sub.periodo,
    'es_trial',          sub.estado = 'trial',
    'exento',            coalesce(sub.descuento_pct, 0) >= 100,
    'en_el_reloj',       l.cobranza_desde is not null,
    'corta',             l.suspension_automatica,
    'tiene_pago',        pago.hubo
  )
  from sub, pago;
$$;
-- <<< reloj_cobranza

comment on function reloj_cobranza is
  'El payload del reloj para UN lubricentro, como campo calculado de PostgREST. INVOKER: el RLS recorta las subconsultas, así que un composite forjado devuelve null. Las DIEZ claves son el contrato con lib/auth/cobranza.ts — R21d las afirma una por una. `tiene_pago` se emite en positivo a propósito: ante la duda, "ya pagó".';

revoke all on function reloj_cobranza(lubricentros) from public, anon;
grant execute on function reloj_cobranza(lubricentros) to authenticated;


-- ---------- La pantalla de cobranzas, con las dos listas ----------
--
-- Con la voz de `alta` separada, la pantalla puede distinguir "nunca pagó"
-- de "se atrasó". Son dos llamados distintos: uno es cerrar una venta, el
-- otro es cobrar.
--
-- El corte de HOY es el signo de `dias`, y no es el mismo corte: el que
-- nunca pagó tiene `dias >= 0` el día del alta y `dias < 0` al siguiente,
-- o sea que queda repartido entre los dos grupos. El dato correcto es una
-- columna, y acá el `exists` no tiene el problema de RLS de arriba porque
-- la función es DEFINER.

-- Cambia el TABLE que devuelve (la columna `nunca_pago`), y eso un
-- `create or replace` no lo puede hacer: va drop + create.
drop function if exists cobranzas_pendientes(integer);

create or replace function cobranzas_pendientes(p_dias integer default 15)
returns table (
  lubricentro_id   uuid,
  nombre           text,
  slug             text,
  activo           boolean,
  estado_cobranza  text,
  en_el_reloj      boolean,
  sub_estado       estado_suscripcion,
  periodo          periodo_suscripcion,
  descuento_pct    numeric,
  vencimiento      date,
  dias             integer,
  plan_nombre      text,
  monto            numeric,
  monto_modulo     numeric,
  telefono         text,
  owner_nombre     text,
  avisado_at       timestamptz,
  orden_estado     text,
  orden_pagado     numeric,
  cortaria         boolean,
  -- LA COLUMNA NUEVA: ¿este tenant no pagó NUNCA? Es lo que parte la
  -- pantalla en dos listas. No es lo mismo que "está vencido": el que nunca
  -- pagó puede estar todavía en plazo.
  nunca_pago       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  orden as (
    select distinct on (o.lubricentro_id)
      o.lubricentro_id, o.estado, o.monto_pagado
    from cresium_ordenes o
    order by o.lubricentro_id, o.created_at desc
  ),
  aviso as (
    select distinct on (c.lubricentro_id) c.lubricentro_id, c.created_at
    from contactos_fidelli c
    order by c.lubricentro_id, c.created_at desc
  )
  select
    l.id,
    l.nombre,
    l.slug,
    l.activo,
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    l.suspension_automatica, coalesce(v.descuento_pct, 0),
                    not exists (select 1 from pagos p where p.lubricentro_id = l.id)),
    l.cobranza_desde is not null,
    v.estado,
    v.periodo,
    v.descuento_pct,
    v.vencimiento,
    (v.vencimiento - current_date)::integer,
    p.nombre,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'total')::numeric,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'modulo')::numeric,
    telefono_de_contacto(l.id),
    (select u.nombre from usuarios u
      where u.lubricentro_id = l.id and u.rol = 'owner' limit 1),
    (select a.created_at from aviso a
      where a.lubricentro_id = l.id and a.created_at::date > v.vencimiento - p_dias),
    o.estado,
    o.monto_pagado,
    -- El mismo reloj, preguntándole qué haría con LOS DOS interruptores de
    -- bloqueo prendidos. Se calcula, no se adivina.
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    true, coalesce(v.descuento_pct, 0),
                    not exists (select 1 from pagos p where p.lubricentro_id = l.id)) = 'suspendido'
      and estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                          l.suspension_automatica, coalesce(v.descuento_pct, 0),
                          not exists (select 1 from pagos p where p.lubricentro_id = l.id)) <> 'suspendido',
    not exists (select 1 from pagos p where p.lubricentro_id = l.id)
  from lubricentros l
  join vigente v on v.lubricentro_id = l.id
  join planes p  on p.id = v.plan_id
  left join orden o on o.lubricentro_id = l.id
  where
    soy_superadmin()
    and coalesce(v.descuento_pct, 0) < 100
    and v.vencimiento <= current_date + p_dias
  order by v.vencimiento;
$$;

comment on function cobranzas_pendientes is
  'La pantalla de operación de /fidelli, ahora con `nunca_pago` para partirla en dos listas: cerrar una venta no es lo mismo que cobrar. El monto sale de la misma función que la pantalla de pago del cliente. Solo superadmin. No edita nada.';

revoke all on function cobranzas_pendientes(integer) from public, anon;
grant execute on function cobranzas_pendientes(integer) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 3 · El alta
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠ DROP + CREATE OTRA VEZ, y por lo mismo de siempre: se va `p_dias_trial`,
-- así que la firma cambia. Un `create or replace` dejaría la de ocho
-- parámetros viva y PostgREST contestaría 300 ambiguo.
--
-- ⚠ SE VA `p_dias_trial` Y NO ES UN EFECTO COLATERAL: el tenant nuevo nace
-- PAGANDO, con el vencimiento al día siguiente, así que un "trial de 30
-- días" no tiene nada que hacer. Dejarlo como parámetro muerto sería peor
-- que sacarlo: el wizard lo seguiría mandando y la primera alta piloto
-- nacería con 30 escritos en algún lado.
--
-- ⚠ EL CANDADO DEL DEMO SIGUE EN PIE. `candado_demo_reloj` es BEFORE INSERT
-- OR UPDATE, así que desde acá un alta con slug 'demo' falla con
-- `demo_fuera_del_reloj`. No es alcanzable en la práctica —`lubricentros.slug`
-- es unique y el demo ya existe— pero si alguien borrara el demo y lo
-- recreara por el wizard, el candado lo frena. Está bien que lo frene: el
-- demo no entra al reloj nunca.

drop function if exists crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, integer, text);

-- >>> crear_lubricentro
create or replace function crear_lubricentro(
  p_nombre         text,
  p_slug           text,
  p_sucursales     jsonb,
  p_plan_id        uuid,
  p_periodo        periodo_suscripcion,
  p_descuento_pct  numeric,
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

  -- EL RELOJ SE PRENDE ACÁ, EN EL INSERT DEL TENANT. Es todo el bloque D:
  -- los nuevos nacen adentro, los 16 viejos siguen en null y se prenden de
  -- a uno cuando Santiago quiera. El UPDATE peligroso contra producción
  -- deja de existir porque deja de hacer falta.
  insert into lubricentros (nombre, slug, cobranza_desde)
  values (trim(p_nombre), lower(trim(coalesce(p_slug, ''))), current_date)  -- @alta_reloj
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

  -- NACE PAGANDO, NO EN TRIAL, y con un día de plazo. El `+ 1` se DICE
  -- "hasta mañana" y el bloqueo cae al día siguiente de esa fecha: el
  -- redondeo a favor del cliente vive en `estado_cobranza`, no acá.
  insert into suscripciones (
    lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento
  )
  values (
    v_id, p_plan_id, 'activa', p_periodo, p_descuento_pct,
    current_date, current_date + 1                                          -- @alta_reloj
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
-- <<< crear_lubricentro

comment on function crear_lubricentro is
  'Fase 1 del alta: tenant + config + sucursales + suscripción + templates, en una transacción. El tenant nace PAGANDO (no en trial), con cobranza_desde escrito y vencimiento al día siguiente: el reloj arranca con él. Exige soy_superadmin(). La invitación del owner es la fase 2 y va por HTTP.';

revoke execute on function crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, text) from public, anon;
grant execute on function crear_lubricentro(
  text, text, jsonb, uuid, periodo_suscripcion, numeric, text) to authenticated;
