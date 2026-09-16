-- ════════════════════════════════════════════════════════════════════
-- EL RELOJ DE COBRANZA · el estado se DERIVA, no se guarda
--
-- Mismo patrón que `vista_proximos_service` y `estado_atencion()`: una
-- función que calcula el estado a partir de la fecha, no una columna que
-- alguien tiene que mantener al día.
--
--   al_dia      vencimiento >= hoy + dias_de_aviso()
--   por_vencer  hoy <= vencimiento < hoy + dias_de_aviso()
--   gracia      vencimiento < hoy <= vencimiento + dias_de_gracia()
--   suspendido  hoy > vencimiento + dias_de_gracia()  ·  o  activo = false
--
-- NADA DE UN CRON DANDO VUELTA BOOLEANOS: el día que no corre, todos
-- quedan gratis; el día que corre dos veces, suspendés a alguien que pagó.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @gracia_n`, `-- @dias`, `-- @activo`,
-- `-- @exento`, `-- @desde`, `-- @corta`, `-- @borde`, `-- @aviso`,
-- `-- @modo`, `-- @tenant` NO SE REFORMATEAN NUNCA.
-- `scripts/regresion-cobranza-reloj.sh` las muerde con `sed`; si cambian
-- de forma el script lo dice con «EL SED NO MORDIÓ» en vez de dejar pasar
-- un falso verde.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · LOS DOS INTERRUPTORES
-- ════════════════════════════════════════════════════════════════════
--
-- La auditoría de producción del 15/09/2026 probó que los datos están
-- limpios: `vencimiento = max(pagos.periodo_hasta)` en las 15 filas con
-- pagos, cero apagados a mano, ninguno se suspende solo. Así que el
-- interruptor NO es una red contra datos sucios —no los hay—: es un
-- control de rollout. Y por eso son DOS y no uno.
--
--   · `cobranza_desde`         — el reloj corre y AVISA. Por tenant.
--   · `suspension_automatica`  — el reloj puede llegar a `suspendido`.
--                                Arranca apagado, para todos.
--
-- EL PRIMER CICLO ES SOLO AVISOS. La primera vez que esto corre es la
-- primera vez que el cálculo de plata se encuentra con tenants reales, y
-- un monto mal calculado que ADEMÁS suspende a alguien no se arregla con
-- una disculpa. La suspensión automática se prende en el segundo ciclo.
-- Con un solo interruptor esto no se puede expresar.
--
-- ⚠ POR QUÉ UNA FECHA Y NO UN BOOLEANO en el primero: `cobranza_desde`
-- dice ADEMÁS desde cuándo. El día que un cliente pregunte "¿por qué me
-- avisaron recién ahora?", la fila lo contesta. Y permite programar el
-- encendido sin estar mirando.
--
-- ⚠ POR QUÉ SON COLUMNAS Y NO UNA FUNCIÓN: una función vive en una
-- migración, y una migración vale lo mismo en local y en producción por
-- construcción. Prendido en prod y apagado en local es una diferencia de
-- DATOS, que es donde ya difieren el demo, los planes y los 17 tenants.
-- Escrito como función, la migración de encendido dejaría el `db reset`
-- en rojo para siempre.

alter table lubricentros
  add column cobranza_desde date,
  add column suspension_automatica boolean not null default false;

comment on column lubricentros.cobranza_desde is
  'NULL = este tenant está AFUERA del reloj de cobranza: no ve barra, ni modal, ni cuenta regresiva. Con fecha, el reloj corre desde ese día. Se prende tenant por tenant, con un UPDATE, nunca por migración.';

comment on column lubricentros.suspension_automatica is
  'false = el reloj avisa pero NUNCA pasa el panel a solo lectura: el estado se queda en gracia. El interruptor manual (lubricentros.activo) sigue funcionando igual. Se prende en el SEGUNDO ciclo, después de ver el cálculo de plata contra tenants reales.';


-- ---------- El candado del demo ----------
--
-- La spec es taxativa: *"El tenant demo queda exento, siempre. Que la
-- cuenta demo aparezca suspendida en medio de una venta es el peor bug
-- posible de este sprint."*
--
-- El default NULL ya lo deja afuera, pero el UPDATE de encendido es una
-- sola línea escrita a mano contra producción y un `where` olvidado la
-- mete. Este trigger hace que ese olvido FALLE ENTERO y ruidosamente, en
-- vez de dejar la demo adentro en silencio. Nada queda a medias: el
-- UPDATE es una sentencia, o entra todo o no entra nada.
--
-- El escape hatch existe para las verificaciones, que necesitan meter el
-- demo al reloj para poder probarlo. Es transaccional: se apaga solo.

create or replace function bloquear_demo_en_el_reloj()
returns trigger
language plpgsql
as $$
begin
  if new.cobranza_desde is not null
     and new.slug = 'demo'
     and coalesce(current_setting('fidelli.reloj_demo', true), '') <> 'si'
  then
    raise exception 'demo_fuera_del_reloj'
      using hint = 'El tenant demo no entra al reloj de cobranza: verlo suspendido en medio de una demo comercial es el peor bug de este sprint. Si estás escribiendo una verificación, corré primero: select set_config(''fidelli.reloj_demo'', ''si'', true);';
  end if;
  return new;
end;
$$;

create trigger candado_demo_reloj
  before insert or update on lubricentros
  for each row execute function bloquear_demo_en_el_reloj();


-- ════════════════════════════════════════════════════════════════════
-- 2 · LOS UMBRALES Y EL CONTADOR
-- ════════════════════════════════════════════════════════════════════
--
-- `dias_de_gracia()` es hermana de `dias_de_aviso()` (20260726230000) y
-- está DELIBERADAMENTE separada: una mueve cuándo se avisa, la otra
-- cuánto se perdona. La ventana de gracia es configurable y no un 7
-- hardcodeado en diez lugares — se cambia con una migración nueva.

-- >>> dias_de_gracia
create or replace function dias_de_gracia()
returns integer
language sql
immutable
parallel safe
as $$ select 7; $$;                                              -- @gracia_n
-- <<< dias_de_gracia

comment on function dias_de_gracia is
  'Cuántos días después del vencimiento el tenant sigue trabajando normal.';

-- >>> dias_de_gracia_restantes
create or replace function dias_de_gracia_restantes(p_vencimiento date)
returns integer
language sql
stable
set search_path = public
as $$
  -- Días de trabajo que le quedan CONTANDO HOY. La suspensión cae el día
  -- `vencimiento + dias_de_gracia() + 1`, así que el ÚLTIMO día de gracia
  -- esto vale 1 y nunca 0: "hoy es el último día", con el panel abierto y
  -- escribiendo. Un "te quedan 0 días" con el panel funcionando es la
  -- clase de detalle que hace que el dueño deje de creerle al aviso.
  --
  -- Puede dar CERO O MENOS: con `suspension_automatica` en false el estado
  -- se queda en `gracia` pasada la ventana, y ahí el copy cambia de "te
  -- quedan N días" a "venció hace N días". El front lo decide mirando el
  -- signo; acá no se recorta, porque el número real es información.
  select (p_vencimiento + dias_de_gracia()) - current_date + 1;   -- @dias
$$;
-- <<< dias_de_gracia_restantes


-- ════════════════════════════════════════════════════════════════════
-- 3 · EL RELOJ
-- ════════════════════════════════════════════════════════════════════
--
-- Molde de `estado_atencion()`: entran valores, sale una palabra. PURA a
-- propósito —no lee ninguna tabla— para que las verificaciones la prueben
-- con literales, sin tener que crear un tenant para cada borde.
--
-- `text` y no un enum: un enum obliga a un `alter type` en la Fase 2 y
-- los valores nuevos no se pueden usar en la transacción que los crea
-- (la regla 14 de CLAUDE.md, que ya costó un sprint).

-- >>> estado_cobranza
create or replace function estado_cobranza(
  p_activo        boolean,
  p_vencimiento   date,
  p_desde         date,      -- SIN default: un argumento olvidado tiene que gritar
  p_suspension    boolean,
  p_descuento_pct numeric
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
  'El reloj. Pura: entran valores, sale una palabra. `not p_activo` gana siempre; descuento 100 queda exento; p_desde null = afuera del reloj; p_suspension false topa el estado en gracia.';

-- Sobre `null` en p_activo, dicho con precisión porque la versión cómoda
-- de esta frase es falsa: `not null` es null, así que la rama `@activo`
-- NO se toma y la evaluación SIGUE con las de fecha. No cae a 'al_dia':
-- cae a lo que digan las fechas. Con un vencimiento sano da 'al_dia'; con
-- uno vencido hace un mes da 'suspendido'.
--
-- En la práctica no pasa —`lubricentros.activo` es `not null default
-- true`—, y el caso solo existe si alguien llama a la función a mano. Se
-- deja escrito igual: un comentario que promete fail-open donde no lo hay
-- es peor que no tener comentario. Lo fija R21b.


-- ════════════════════════════════════════════════════════════════════
-- 4 · EL PAYLOAD QUE CONSUME EL PANEL
-- ════════════════════════════════════════════════════════════════════
--
-- Campo calculado sobre `lubricentros`: viaja en el MISMO select que
-- `obtenerSesion()` ya hace (`lubricentros(nombre, activo, …)`), así que
-- la carga de un service no hace ni una consulta HTTP nueva.
--
-- ⚠ SECURITY INVOKER, Y ESTO NO ES UN DETALLE. Un campo calculado de
-- PostgREST es TAMBIÉN un endpoint `/rpc/`, y el composite lo elige quien
-- llama. La versión `security definer` de este mismo payload —filtrando
-- por un `lubricentro_id` que venía adentro del argumento— se verificó
-- EXPLOTABLE EN VIVO durante el diseño: con un JWT de rol `authenticated`
-- se leían el vencimiento, el período, el descuento negociado y el precio
-- del tenant de al lado, y el uuid de la víctima no es secreto (viaja en
-- el `logo_url` público de su propia vidriera).
--
-- Como invoker, el composite forjado no sirve de nada: el RLS de
-- `suscripciones` recorta la subconsulta y devuelve cero filas. Y además
-- el tenant NO sale del argumento (`@tenant`): sale de la fila real.

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
  )
  select jsonb_build_object(
    'estado',            estado_cobranza(l.activo, sub.vencimiento, l.cobranza_desde,
                                         l.suspension_automatica, coalesce(sub.descuento_pct, 0)),
    'vencimiento',       sub.vencimiento,
    'dias_restantes',    dias_de_gracia_restantes(sub.vencimiento),
    'dias_para_vencer',  sub.vencimiento - current_date,
    'periodo',           sub.periodo,
    'es_trial',          sub.estado = 'trial',
    'exento',            coalesce(sub.descuento_pct, 0) >= 100,
    'en_el_reloj',       l.cobranza_desde is not null,
    'corta',             l.suspension_automatica
  )
  from sub;
$$;
-- <<< reloj_cobranza

comment on function reloj_cobranza is
  'El payload del reloj para UN lubricentro, como campo calculado de PostgREST. INVOKER: el RLS recorta la subconsulta, así que un composite forjado devuelve null. Las nueve claves son el contrato con lib/auth/cobranza.ts — R21d las afirma una por una.';

revoke all on function estado_cobranza(boolean, date, date, boolean, numeric) from public, anon;
revoke all on function dias_de_gracia()                                       from public, anon;
revoke all on function dias_de_gracia_restantes(date)                         from public, anon;
revoke all on function reloj_cobranza(lubricentros)                           from public, anon;

grant execute on function estado_cobranza(boolean, date, date, boolean, numeric) to authenticated;
grant execute on function dias_de_gracia()                                       to authenticated;
grant execute on function dias_de_gracia_restantes(date)                         to authenticated;
grant execute on function reloj_cobranza(lubricentros)                           to authenticated;

-- `service_role` NO recibe grant y es a propósito: con esa clave
-- `auth.uid()` es null y el RLS no recorta, así que el payload dejaría de
-- tener dueño. El webhook de la Fase 2 va a usar `estado_cobranza()` con
-- valores explícitos, que es la puerta pensada para eso.


-- ════════════════════════════════════════════════════════════════════
-- 5 · EL MONTO
-- ════════════════════════════════════════════════════════════════════
--
--   plan   = precio_mensual × meses × (1 − off_periodo) × (1 − descuento_pct/100)
--   modulo = modulos.precio_mensual × meses × (1 − off_periodo)
--   total  = plan + modulo
--
-- Las tres cosas que decidió Santiago y que no se adivinan leyendo el código:
--
--   · El módulo lleva el MISMO descuento del período que el plan.
--   · El módulo NO lleva el descuento propio del tenant (el founding se
--     negoció sobre el plan, antes de que el módulo existiera).
--   · El módulo se cobra SOLO si el motivo del override dice `pago`.
--     Capuzzi y el demo lo tienen BONIFICADO DE POR VIDA, y son los dos
--     únicos con el módulo prendido: hoy nadie paga los $25.000.
--     Cobrar "siempre que esté prendido" le facturaría de más a Capuzzi.
--
-- ⚠ EL DESCUENTO DEL PERÍODO SALE DE `planes`, NUNCA DE UNA CONSTANTE.
-- Vale 25 en producción y 15 en el default de la migración que creó la
-- columna: un 25 hardcodeado se rompe en silencio el día que Santiago lo
-- ajuste desde /fidelli/precios. Es la regla 16 de CLAUDE.md.

-- >>> meses_del_periodo
create or replace function meses_del_periodo(p_periodo periodo_suscripcion)
returns integer
language sql
immutable
parallel safe
as $$
  select case p_periodo when 'mensual' then 1 when 'semestral' then 6 else 12 end;
$$;
-- <<< meses_del_periodo

-- El parser del motivo del módulo, en SQL y como fuente única.
--
-- Sigue el precedente de `patente_formato_valido()`: la regla vive acá y
-- `lib/modulos.ts` conserva su copia SOLO para avisar antes del rechazo
-- del server. Dos fuentes de verdad peleando por si un cliente paga o no
-- paga $25.000 es exactamente lo que no queremos.
--
-- ⚠ ANTE LA DUDA, BONIFICADO. Un motivo viejo, ilegible, de otro módulo o
-- ausente devuelve `false` y el módulo NO se cobra. Cobrarle de más a
-- alguien es peor que no cobrarle: lo segundo se arregla con una
-- conversación, lo primero con una devolución y una disculpa.

-- >>> modulo_es_pago
create or replace function modulo_es_pago(p_lubricentro uuid, p_codigo text)
returns boolean
language sql
stable
set search_path = public
as $$
  -- El motivo MÁS RECIENTE que hable de ESTE módulo, no el cambio más
  -- reciente a secas: un superadmin que toca el tope de sucursales de un
  -- tenant que ya tiene gomería escribe el motivo de las sucursales, y ese
  -- no dice nada del módulo.
  --
  -- ⚠ DOS CAMBIOS EN LA MISMA TRANSACCIÓN SON INDISTINGUIBLES, y es por
  -- construcción: `cambios_override_plan.created_at` usa `now()`, que es
  -- la hora del INICIO de la transacción, así que dos filas escritas
  -- juntas comparten timestamp y el `order by` no tiene con qué
  -- desempatar. En la vida real no pasa —`fijar_override_plan()` se llama
  -- una vez por request— y tampoco importa: dos cambios simultáneos no
  -- tienen un "último". Pero una verificación que los escriba juntos
  -- tiene que separar los timestamps a mano, o va a leer cualquiera de
  -- los dos. Lo aprendimos con R21f en rojo.
  select coalesce(
    (select c.motivo ~ ('^Módulo ' || '[^·]+ · pago · ')
     from cambios_override_plan c
     where c.lubricentro_id = p_lubricentro
       and c.motivo ~ ('^Módulo ' || '[^·]+ · (pago|bonificado) · ')
     order by c.created_at desc
     limit 1),
    false)
  and coalesce((select (plan_overrides #>> ('{' || p_codigo || '}')::text[])::boolean
                from lubricentros where id = p_lubricentro), false);
$$;
-- <<< modulo_es_pago

comment on function modulo_es_pago is
  'true solo si el tenant TIENE el módulo (override) Y su motivo más reciente sobre un módulo dice `pago`. Ante cualquier duda devuelve false: no cobrar de más. Espejo en lib/modulos.ts, que solo avisa.';

-- >>> monto_de_renovacion
create or replace function monto_de_renovacion(p_lubricentro uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with sub as (
    select s.periodo, s.descuento_pct, s.plan_id
    from suscripciones s
    where s.lubricentro_id = p_lubricentro
    order by s.inicio desc, s.created_at desc
    limit 1
  ),
  base as (
    select
      sub.periodo,
      sub.descuento_pct,
      meses_del_periodo(sub.periodo) as meses,
      p.precio_mensual,
      -- EL DESCUENTO DEL PERÍODO, LEÍDO DE LA BASE.
      case sub.periodo
        when 'semestral' then p.descuento_semestral_pct
        when 'anual'     then p.descuento_anual_pct
        else                  0
      end as off_periodo,
      (select m.precio_mensual from modulos m
        where m.codigo = 'neumaticos' and m.activo
          and modulo_es_pago(p_lubricentro, 'neumaticos')) as modulo_mensual
    from sub join planes p on p.id = sub.plan_id
  )
  select jsonb_build_object(
    'periodo',        periodo,
    'meses',          meses,
    'precio_mensual', precio_mensual,
    'off_periodo',    off_periodo,
    'descuento_pct',  descuento_pct,
    'plan',           round(precio_mensual * meses * (1 - off_periodo / 100.0)
                                                   * (1 - descuento_pct / 100.0), 2),
    'modulo',         round(coalesce(modulo_mensual, 0) * meses * (1 - off_periodo / 100.0), 2),
    'total',          round(precio_mensual * meses * (1 - off_periodo / 100.0)
                                                   * (1 - descuento_pct / 100.0)
                            + coalesce(modulo_mensual, 0) * meses * (1 - off_periodo / 100.0), 2)
  )
  from base;
$$;
-- <<< monto_de_renovacion

comment on function monto_de_renovacion is
  'El monto de la próxima renovación, desglosado. El descuento del período sale de planes; el módulo lleva ese descuento pero NO el del tenant, y solo se cobra si su motivo dice `pago`.';

revoke all on function monto_de_renovacion(uuid) from public, anon;
revoke all on function modulo_es_pago(uuid, text) from public, anon;
revoke all on function meses_del_periodo(periodo_suscripcion) from public, anon;
grant execute on function monto_de_renovacion(uuid) to authenticated;
grant execute on function modulo_es_pago(uuid, text) to authenticated;
grant execute on function meses_del_periodo(periodo_suscripcion) to authenticated;
