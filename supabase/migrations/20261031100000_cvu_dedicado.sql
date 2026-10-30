-- ============================================================
-- EL CVU DEDICADO POR TENANT · un alias fijo, una cuenta fija, y el
-- depósito se acredita por MONTO EXACTO
--
-- Lo que había (20260916200000 → hoy): cada renovación emitía un «Pago
-- Único» en Cresium —un CVU de un solo uso con un alias derivado de la
-- referencia (`fm.<taller>.<6 hex>`)— y el webhook acreditaba por el
-- `externalId` de esa orden. Funcionó hasta que Cresium empezó a RECICLAR
-- los CVUs del pago único: un pool de cuatro cuentas cuyo alias cambia con
-- cada orden. El dueño que dejó el alias cargado en su home banking
-- transfirió al mes siguiente a un alias que ya no era suyo (28/10/2026:
-- «alias inválido» en varios tenants, y al menos uno pagando a la cuenta
-- de otro). El informe está en ~/Desktop/verificacion-cresium-2026-10.
--
-- Lo que hay desde esta migración:
--
--   · Cada tenant tiene SU CVU dedicado (`POST /v3/deposit-address/cvu`
--     de Cresium): un alias que elige Fidelli (`fm.<nombre>`), un número
--     de CVU y el id interno de Cresium, los tres escritos JUNTOS por
--     `fijar_cvu_de_tenant()` y nunca de a uno (CHECK `alias_con_cvu`).
--     El CVU no vence, no tiene monto esperado y recibe todo lo que entra.
--   · La «orden» de una renovación pasa a ser NUESTRA (una fila en
--     `cresium_ordenes` con `deposit_address_id`): registra el período que
--     el dueño eligió y el monto que vio en pantalla, y no viaja a Cresium.
--   · El webhook de `DEPOSIT` de un CVU dedicado no trae `paymentOrder`:
--     trae el CVU en `depositAddress` / `to`. La rama nueva busca al
--     tenant por ese CVU y acredita SOLO si el monto es EXACTAMENTE el de
--     uno de los períodos que ese tenant puede elegir hoy (mensual, anual,
--     y semestral cuando el plan lo ofrece). Cualquier otro monto —o un
--     monto que coincide con dos períodos— queda en `depositos_cresium`
--     como «a confirmar», con el motivo escrito, y lo resuelve una persona
--     desde /fidelli (`resolver_deposito_cresium()`): lo acredita al
--     período que corresponda o lo descarta con una nota. Nada se infiere.
--   · Los pedidos de calcos SIGUEN por Pago Único (una orden por pedido,
--     alias derivado): un pedido es una compra puntual, no un abono.
--
-- Lo que NO cambia: la evidencia (`cresium_eventos`, candados en ALWAYS),
-- la idempotencia por `pagos.cresium_transaccion_id`, `ciclo_tras_el_pago`
-- (el pago tardío compra un período entero desde hoy), y la rama de
-- `paymentOrder` para los tenants que todavía no tienen CVU (durante la
-- transición siguen cobrando por pago único, con el alias derivado).
--
-- El interruptor `alias_confirmado_por_cresium()` se prende acá: Cresium
-- publicó el formato (`INVALID_ALIAS` / `EXISTING_ALIAS`) y el tope de
-- cambios (`TOO_MANY_ALIAS_UPDATES`), y como el alias es INMUTABLE de
-- nuestro lado, el tope no nos alcanza nunca.
--
-- Lo vigilan R25 (reescrito) y R51, con `scripts/regresion-cvu-dedicado.sh`
-- y `scripts/regresion-cresium-webhook.mjs` (sección 7).
-- ============================================================


-- ════════════════════════════════════════════════════════════════════
-- 1 · El interruptor, prendido
-- ════════════════════════════════════════════════════════════════════

-- >>> alias_confirmado_por_cresium
create or replace function alias_confirmado_por_cresium()
returns boolean
language sql
immutable
parallel safe
as $$ select true; $$;                                               -- @alias_confirmado
-- <<< alias_confirmado_por_cresium

comment on function alias_confirmado_por_cresium is
  'true desde 20261031100000: Cresium publicó el formato del alias (INVALID_ALIAS / EXISTING_ALIAS) y el tope de cambios (TOO_MANY_ALIAS_UPDATES) con la API de CVUs dedicados. El alias se asigna SOLO junto con su CVU (fijar_cvu_de_tenant) y no se cambia nunca, así que el tope no nos alcanza.';


-- ════════════════════════════════════════════════════════════════════
-- 2 · Las dos columnas nuevas, atadas al alias
-- ════════════════════════════════════════════════════════════════════

alter table lubricentros
  add column cresium_cvu text
    constraint cvu_formato check (cresium_cvu is null or cresium_cvu ~ '^[0-9]{22}$'),   -- @cvu_formato
  add column cresium_deposit_address_id bigint
    constraint deposit_address_positivo check (cresium_deposit_address_id is null or cresium_deposit_address_id > 0);

-- Los tres juntos o ninguno. Un alias sin CVU volvería al pago único con
-- ese alias (y el día que se emita el CVU, Cresium contestaría
-- EXISTING_ALIAS); un CVU sin alias es una cuenta que el dueño no puede
-- tipear.
alter table lubricentros
  add constraint alias_con_cvu check (                                                  -- @alias_con_cvu
    (cresium_alias is null) = (cresium_cvu is null)
    and (cresium_cvu is null) = (cresium_deposit_address_id is null)
  );

comment on column lubricentros.cresium_cvu is
  'El número del CVU dedicado del tenant en Cresium (22 dígitos). Se escribe junto con el alias y el id, por fijar_cvu_de_tenant(), y no se cambia: es la cuenta que el dueño deja agendada. Null = todavía no se emitió (cobra por pago único).';
comment on column lubricentros.cresium_deposit_address_id is
  'El id interno de esa cuenta en Cresium (depositAddress.id). El webhook la reconoce por el número de CVU y, de respaldo, por este id.';

create unique index lubricentros_cresium_cvu_key
  on lubricentros (cresium_cvu) where cresium_cvu is not null;                            -- @cvu_unico
create unique index lubricentros_cresium_deposit_address_key
  on lubricentros (cresium_deposit_address_id) where cresium_deposit_address_id is not null;

-- El CVU y el id son tan inmutables como el alias. Es OTRO trigger y no una
-- redefinición de bloquear_cambio_de_alias(): aquel lo muerde
-- scripts/regresion-cobranza-alias.sh desde 20260917120000.
-- >>> bloquear_cambio_de_cvu
create or replace function bloquear_cambio_de_cvu()
returns trigger
language plpgsql
as $$
begin
  if (old.cresium_cvu is not null and new.cresium_cvu is distinct from old.cresium_cvu)    -- @cvu_inmutable
     or (old.cresium_deposit_address_id is not null
         and new.cresium_deposit_address_id is distinct from old.cresium_deposit_address_id)
  then
    raise exception 'cvu_inmutable'
      using hint = 'El CVU dedicado de un tenant se emite una vez: es el número que su dueño ya dejó agendado en el home banking. Si hay que cambiarlo, es una conversación con Cresium (dar de baja y emitir otro), no un UPDATE.';
  end if;
  return new;
end;
$$;
-- <<< bloquear_cambio_de_cvu

create trigger candado_cvu_inmutable
  before update on lubricentros
  for each row execute function bloquear_cambio_de_cvu();


-- ════════════════════════════════════════════════════════════════════
-- 3 · Las puertas: la vieja se cierra, la nueva escribe los tres
-- ════════════════════════════════════════════════════════════════════

-- La puerta vieja (alias solo) queda con su firma —crear_lubricentro() la
-- llama cuando el alta trae p_alias— pero ya no escribe: un alias sin CVU
-- es exactamente lo que el CHECK de arriba prohíbe. El alta no manda alias
-- desde esta migración; el CVU se emite DESPUÉS de crear el tenant, como
-- la invitación (otra llamada HTTP, otra fase).
-- >>> fijar_alias_de_tenant
create or replace function fijar_alias_de_tenant(
  p_lubricentro uuid,
  p_alias       text
)
returns text
language plpgsql
volatile
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede asignar un alias'
      using errcode = '42501';
  end if;
  raise exception 'alias_sin_cvu'                                                       -- @alias_sin_cvu
    using hint = 'Desde 20261031100000 el alias de un tenant se asigna junto con su CVU dedicado, por fijar_cvu_de_tenant(): primero se emite la cuenta en Cresium y después se escriben los tres datos juntos. Un alias sin CVU volvería al pago único con ese alias, y el día que se emita el CVU Cresium lo rechazaría como EXISTING_ALIAS.';
end;
$$;
-- <<< fijar_alias_de_tenant

comment on function fijar_alias_de_tenant is
  'CERRADA desde 20261031100000: rechaza siempre con alias_sin_cvu. Queda con su firma porque crear_lubricentro() la llama si el alta trae p_alias (y el alta ya no lo trae). La puerta vigente es fijar_cvu_de_tenant().';


-- >>> fijar_cvu_de_tenant
create or replace function fijar_cvu_de_tenant(
  p_lubricentro        uuid,
  p_alias              text,
  p_cvu                text,
  p_deposit_address_id bigint
)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alias text := lower(trim(coalesce(p_alias, '')));
  v_cvu   text := regexp_replace(coalesce(p_cvu, ''), '\s', '', 'g');
begin
  if not soy_superadmin() then                                                          -- @cvu_guard
    raise exception 'Solo el equipo Fidelli puede asignar la cuenta de cobro de un tenant'
      using errcode = '42501';
  end if;

  if not alias_confirmado_por_cresium() then
    raise exception 'alias_sin_confirmar';
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
  if v_cvu !~ '^[0-9]{22}$' then                                                        -- @cvu_vacio
    raise exception 'cvu_formato'
      using detail = format('Un CVU son 22 dígitos; llegó «%s».', v_cvu);
  end if;
  if p_deposit_address_id is null or p_deposit_address_id <= 0 then
    raise exception 'deposit_address_invalido';
  end if;

  update lubricentros
     set cresium_alias              = v_alias,
         cresium_cvu                = v_cvu,
         cresium_deposit_address_id = p_deposit_address_id,
         cresium_alias_asignado_at  = now()
   where id = p_lubricentro
     -- Los tres en null: el que ya tiene cuenta no se reasigna (y el
     -- mensaje correcto es «ya tiene», no el del candado).
     and cresium_alias is null
     and cresium_cvu is null;

  if not found then
    if exists (select 1 from lubricentros where id = p_lubricentro and cresium_cvu is not null) then
      raise exception 'alias_ya_asignado';
    end if;
    raise exception 'sin_permiso_lubricentro';
  end if;

  return v_alias;
end;
$$;
-- <<< fijar_cvu_de_tenant

comment on function fijar_cvu_de_tenant is
  'La ÚNICA puerta para darle a un tenant su cuenta de cobro: el alias, el número de CVU y el id de Cresium, los tres juntos, DESPUÉS de que Cresium emitió la cuenta (POST /v3/deposit-address/cvu). Valida el alias como siempre (largo, formato, unicidad por índice) y el CVU (22 dígitos). Un tenant con cuenta no se reasigna.';

revoke all on function fijar_cvu_de_tenant(uuid, text, text, bigint) from public, anon;
grant execute on function fijar_cvu_de_tenant(uuid, text, text, bigint) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 4 · La orden interna
-- ════════════════════════════════════════════════════════════════════

alter table cresium_ordenes
  add column deposit_address_id bigint;

-- Una orden interna es siempre de una renovación: los pedidos de calcos
-- siguen por pago único.
alter table cresium_ordenes
  add constraint dedicada_de_renovacion
    check (deposit_address_id is null or suscripcion_id is not null);

comment on column cresium_ordenes.deposit_address_id is
  'Desde 20261031100000: si no es null, la orden es NUESTRA y no viajó a Cresium. Registra el período que el dueño eligió y el monto que vio, contra el CVU dedicado del tenant (su id en Cresium). El webhook la marca PAID cuando entra el monto exacto de ese período, y CERRADA a las demás vivas del tenant. Null = pago único de Cresium, como siempre.';

comment on column cresium_ordenes.estado is
  'El último estado conocido. NOT_PAID · PARTIAL · PAID · EXPIRED son de Cresium (los escribe el webhook). CERRADA es nuestra: la orden viva de un tenant suspendido a mano (20260926200000), o —desde 20261031100000— la orden interna de otro período que quedó superada cuando un depósito al CVU dedicado acreditó; el front no la reusa ni la pinta.';


-- ════════════════════════════════════════════════════════════════════
-- 5 · Los depósitos al CVU dedicado: todos, con su dictamen
-- ════════════════════════════════════════════════════════════════════

create table depositos_cresium (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  -- La transacción de Cresium. Unique: cinco reintentos, una fila.
  transaccion_id  bigint not null unique,
  -- La entrega del webhook que lo trajo. SIN FK a propósito: con la
  -- referencia, `truncate cresium_eventos` falla por la FK ANTES de que
  -- dispare el candado de purga, y R22g —que prueba ESE candado— deja de
  -- ver su error (es el mismo caso que encargos_calcos.pedido_calcos_id).
  -- La integridad la sostiene la puerta: solo el webhook escribe acá, con
  -- el id del evento que acaba de insertar.
  evento_id       uuid,
  monto           numeric(12,2) not null check (monto > 0),
  cvu             text,
  recibido_at     timestamptz not null default now(),
  -- acreditado         · el monto era exacto y el webhook lo acreditó solo
  -- a_confirmar        · ningún período (o más de uno): lo mira una persona
  -- acreditado_a_mano  · lo acreditó Fidelli, eligiendo el período
  -- descartado         · Fidelli lo dio por resuelto sin acreditar (con nota)
  estado          text not null check (estado in ('acreditado', 'a_confirmar', 'acreditado_a_mano', 'descartado')),
  periodo         periodo_suscripcion,
  motivo          text not null,
  pago_id         uuid references pagos(id) on delete restrict,
  resuelto_por    uuid references usuarios(id) on delete restrict,
  resuelto_at     timestamptz,
  nota            text,
  constraint deposito_resuelto_coherente check (
    (estado in ('acreditado', 'a_confirmar') and resuelto_por is null and resuelto_at is null)
    or (estado in ('acreditado_a_mano', 'descartado') and resuelto_por is not null and resuelto_at is not null)
  ),
  constraint deposito_acreditado_con_pago check (
    (estado in ('acreditado', 'acreditado_a_mano')) = (pago_id is not null)
  ),
  constraint deposito_descartado_con_nota check (
    estado <> 'descartado' or nullif(trim(coalesce(nota, '')), '') is not null
  )
);

comment on table depositos_cresium is
  'Cada depósito que entró a un CVU dedicado, con lo que se decidió: acreditado solo (monto exacto), a confirmar (lo mira Fidelli), acreditado a mano o descartado. Es el libro de la plata que llega por la cuenta fija; la evidencia cruda sigue en cresium_eventos.';

create index depositos_cresium_lubricentro_idx on depositos_cresium (lubricentro_id, recibido_at desc);
create index depositos_cresium_pendientes_idx on depositos_cresium (recibido_at) where estado = 'a_confirmar';

alter table depositos_cresium enable row level security;

-- El owner ve los suyos (la pantalla de pago le dice «recibimos $X y lo
-- estamos revisando»); el superadmin, todos. Nadie escribe por PostgREST:
-- el webhook con la clave de servicio, Fidelli por resolver_deposito_cresium().
create policy depositos_cresium_lectura on depositos_cresium
  for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));

grant select on depositos_cresium to authenticated;
revoke insert, update, delete, truncate, references, trigger on depositos_cresium from authenticated;

-- Los candados: un depósito no se borra ni cambia de identidad. Lo que sí
-- se escribe después es el dictamen (estado, período, pago, quién, cuándo,
-- nota), y solo por la puerta.
create or replace function bloquear_borrado_de_deposito()
returns trigger
language plpgsql
as $$
begin
  raise exception 'deposito_no_se_borra'
    using hint = 'depositos_cresium es el libro de la plata que entró por la cuenta fija de cada tenant. Un depósito que no corresponde se DESCARTA con nota (resolver_deposito_cresium), no se borra.';
end;
$$;

create or replace function bloquear_edicion_de_deposito()
returns trigger
language plpgsql
as $$
begin
  if new.lubricentro_id is distinct from old.lubricentro_id                               -- @deposito_identidad
     or new.transaccion_id is distinct from old.transaccion_id
     or new.evento_id      is distinct from old.evento_id
     or new.monto          is distinct from old.monto
     or new.cvu            is distinct from old.cvu
     or new.recibido_at    is distinct from old.recibido_at
  then
    raise exception 'deposito_no_se_edita'
      using hint = 'La identidad de un depósito (tenant, transacción, monto, CVU, hora) es lo que Cresium mandó. Lo que se escribe después es el dictamen.';
  end if;
  return new;
end;
$$;

create trigger candado_borrado_deposito
  before delete on depositos_cresium
  for each row execute function bloquear_borrado_de_deposito();
create trigger candado_purga_deposito
  before truncate on depositos_cresium
  for each statement execute function bloquear_borrado_de_deposito();
create trigger candado_edicion_deposito
  before update on depositos_cresium
  for each row execute function bloquear_edicion_de_deposito();

alter table depositos_cresium enable always trigger candado_borrado_deposito;
alter table depositos_cresium enable always trigger candado_purga_deposito;
alter table depositos_cresium enable always trigger candado_edicion_deposito;


-- ════════════════════════════════════════════════════════════════════
-- 6 · Los montos que un tenant puede transferir hoy
-- ════════════════════════════════════════════════════════════════════

-- Mensual y anual siempre; semestral SOLO si el plan lo ofrece (es la
-- misma regla con la que la pantalla de pago decide si muestra el
-- semestral: descuento_semestral_pct > 0). Sin esta regla, un tenant podría
-- «pagar» un semestre que nunca se le ofreció y la base lo acreditaría.
-- Solo los montos mayores que cero: el bonificado no transfiere nada.
-- >>> montos_ofrecidos
create or replace function montos_ofrecidos(p_lubricentro uuid)
returns table (periodo periodo_suscripcion, meses integer, total numeric)
language sql
stable
set search_path = public
as $$
  with sub as (
    select s.plan_id
    from suscripciones s
    where s.lubricentro_id = p_lubricentro
    order by s.inicio desc, s.created_at desc
    limit 1
  ),
  ofrecidos as (
    select 'mensual'::periodo_suscripcion as periodo
    union all
    select 'anual'::periodo_suscripcion
    union all
    select 'semestral'::periodo_suscripcion
    from sub join planes p on p.id = sub.plan_id
    where p.descuento_semestral_pct > 0                                                -- @semestral_ofrecido
  )
  select
    o.periodo,
    meses_del_periodo(o.periodo),
    round((monto_de_renovacion_en(p_lubricentro, o.periodo) ->> 'total')::numeric, 2)
  from ofrecidos o
  where (monto_de_renovacion_en(p_lubricentro, o.periodo) ->> 'total')::numeric > 0;
$$;
-- <<< montos_ofrecidos

comment on function montos_ofrecidos is
  'Los períodos que el tenant puede elegir HOY y cuánto cuesta cada uno (monto_de_renovacion_en): mensual, anual, y semestral solo si su plan lo ofrece. Es contra lo que el webhook compara un depósito al CVU dedicado.';

revoke all on function montos_ofrecidos(uuid) from public, anon;
grant execute on function montos_ofrecidos(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 7 · La rama del CVU dedicado
-- ════════════════════════════════════════════════════════════════════

-- Pesos como los lee una persona de acá: «$47.527» y, solo con centavos,
-- «$47.527,50». `to_char` con G y D usa el locale del servidor (coma de
-- miles y punto decimal), y el motivo de un depósito a confirmar lo lee
-- Fidelli en la pantalla.
create or replace function pesos_texto(p numeric)
returns text
language sql
immutable
parallel safe
as $$
  select '$' || replace(to_char(trunc(abs(p)), 'FM999G999G999G999'), ',', '.')
         || case when p <> trunc(p)
                 then ',' || lpad(round((abs(p) - trunc(abs(p))) * 100)::integer::text, 2, '0')
                 else '' end;
$$;

-- Lo que hace el webhook con un depósito que entró a un CVU dedicado. Es
-- una función aparte para que acreditar_deposito_cresium() siga leyéndose
-- entera; solo la llama ella. Devuelve lo que la ruta contesta.
-- >>> acreditar_deposito_dedicado
create or replace function acreditar_deposito_dedicado(
  p_evento      uuid,
  p_tx          bigint,
  p_lubricentro uuid,
  p_cvu         text,
  p_monto       numeric
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_sus       suscripciones%rowtype;
  v_n         integer;
  v_periodo   periodo_suscripcion;
  v_meses     integer;
  v_esperados text;
  v_motivo    text;
  v_dep       uuid;
  v_pago      uuid;
  v_primero   boolean;
  v_hasta     date;
  v_nuevo     date;
  v_nuevo_ini date;
  v_corre     boolean;
  v_orden     uuid;
begin
  -- La misma transacción ya registrada (un reintento de Cresium de un
  -- depósito que quedó a confirmar, o que se descartó): no se registra
  -- dos veces. El acreditado lo frena antes pagos.cresium_transaccion_id.
  if exists (select 1 from depositos_cresium d where d.transaccion_id = p_tx) then          -- @idem_dedicado
    update cresium_eventos set procesado_at = now(), motivo = 'ya registrado (reintento)'
    where id = p_evento;
    return jsonb_build_object('resultado', 'ya_registrado', 'concepto', 'suscripcion',
                              'transaccion', p_tx, 'lubricentro', p_lubricentro);
  end if;

  if p_monto is null or p_monto <= 0 then
    v_motivo := 'el depósito llegó sin monto (ni totalAmount ni amounts): no se puede comparar con ningún período';
  end if;

  select * into v_sus from suscripciones s
  where s.lubricentro_id = p_lubricentro
  order by s.inicio desc, s.created_at desc
  limit 1;
  if v_sus.id is null and v_motivo is null then
    v_motivo := 'el tenant no tiene suscripción a la que acreditar';
  end if;

  if v_motivo is null then
    -- ¿A cuántos de los períodos ofrecidos les corresponde EXACTAMENTE este
    -- monto? Uno: se acredita ése. Cero o más de uno: lo mira una persona.
    select count(*), min(m.periodo::text)::periodo_suscripcion, min(m.meses)
      into v_n, v_periodo, v_meses
    from montos_ofrecidos(p_lubricentro) m
    where m.total = round(p_monto, 2);                                                  -- @monto_exacto

    if v_n <> 1 then
      select string_agg(format('%s %s', m.periodo, pesos_texto(m.total)), ' · ' order by m.meses)
        into v_esperados
      from montos_ofrecidos(p_lubricentro) m;
      v_motivo := case
        when v_n = 0 then format('el monto %s no es el de ningún período: hoy se cobra %s',
                                 pesos_texto(p_monto), coalesce(v_esperados, 'nada (plan bonificado)'))
        else format('el monto %s coincide con más de un período (%s): hay que elegir',
                    pesos_texto(p_monto), v_esperados)
      end;
    end if;
  end if;

  if v_motivo is not null then
    insert into depositos_cresium (lubricentro_id, transaccion_id, evento_id, monto, cvu, estado, motivo)
    values (p_lubricentro, p_tx, p_evento, greatest(coalesce(p_monto, 0), 0.01), p_cvu, 'a_confirmar', v_motivo)
    returning id into v_dep;
    update cresium_eventos set procesado_at = now(), motivo = 'a confirmar: ' || v_motivo
    where id = p_evento;
    return jsonb_build_object(
      'resultado', 'sin_acreditar', 'concepto', 'suscripcion', 'motivo', 'a_confirmar',
      'detalle', v_motivo, 'deposito', v_dep, 'transaccion', p_tx, 'lubricentro', p_lubricentro);
  end if;

  -- ---------- Acreditar: la misma cuenta que la rama del pago único ----------
  v_primero := not exists (select 1 from pagos p where p.lubricentro_id = p_lubricentro);
  -- Hasta cuándo compra: greatest(vencimiento, hoy) + período, en fechas
  -- calendario (lo mismo que periodoHastaDeLaOrden en lib/cresium/orden.ts).
  v_hasta := (greatest(v_sus.vencimiento, current_date) + make_interval(months => v_meses))::date;

  select c.inicio, c.vencimiento into v_nuevo_ini, v_nuevo
  from ciclo_tras_el_pago(v_primero, v_sus.inicio, v_sus.vencimiento, current_date, v_hasta,
                          make_interval(months => v_meses)) c;
  v_corre := v_nuevo_ini is distinct from v_sus.inicio;

  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    p_lubricentro, v_sus.id, null, 'cresium', p_tx,
    case when v_corre then v_nuevo_ini else greatest(v_sus.vencimiento, current_date) end,
    case when v_corre then v_nuevo     else v_hasta end,
    p_monto, current_date
  )
  returning id into v_pago;

  update suscripciones
  set vencimiento = v_nuevo,
      inicio      = v_nuevo_ini,
      estado = case
                 when estado in ('trial', 'vencida') and v_nuevo >= current_date
                   then 'activa'::estado_suscripcion
                 else estado
               end
  where id = v_sus.id;

  -- La orden interna de ESE período, si la hay, queda pagada; las otras
  -- vivas del tenant (otro período que eligió y no pagó) quedan superadas.
  select o.id into v_orden
  from cresium_ordenes o
  where o.lubricentro_id = p_lubricentro
    and o.suscripcion_id is not null
    and o.deposit_address_id is not null
    and o.estado in ('NOT_PAID', 'PARTIAL')
    and o.periodo = v_periodo
  order by o.created_at desc
  limit 1;
  if v_orden is not null then
    update cresium_ordenes
       set estado = 'PAID', monto_pagado = p_monto, actualizado_at = now()
     where id = v_orden;
  end if;
  update cresium_ordenes                                                                 -- @cierra_otras
     set estado = 'CERRADA', actualizado_at = now()
   where lubricentro_id = p_lubricentro
     and suscripcion_id is not null
     and deposit_address_id is not null
     and estado in ('NOT_PAID', 'PARTIAL');

  insert into depositos_cresium (lubricentro_id, transaccion_id, evento_id, monto, cvu, estado, periodo, motivo, pago_id)
  values (p_lubricentro, p_tx, p_evento, p_monto, p_cvu, 'acreditado', v_periodo,
          format('monto exacto del período %s', v_periodo), v_pago)
  returning id into v_dep;

  update cresium_eventos set procesado_at = now(), motivo = format('acreditado (CVU dedicado, %s)', v_periodo)
  where id = p_evento;

  return jsonb_build_object(
    'resultado', 'acreditado', 'concepto', 'suscripcion', 'pago', v_pago, 'deposito', v_dep,
    'transaccion', p_tx, 'lubricentro', p_lubricentro, 'periodo', v_periodo, 'vencimiento', v_nuevo);
end;
$$;
-- <<< acreditar_deposito_dedicado

comment on function acreditar_deposito_dedicado is
  'La rama del CVU dedicado de acreditar_deposito_cresium(): acredita SOLO si el monto es exactamente el de UN período que el tenant puede elegir hoy (montos_ofrecidos); si no, deja el depósito a confirmar. Idempotente por depositos_cresium.transaccion_id. Nadie la llama más que la puerta.';

revoke all on function acreditar_deposito_dedicado(uuid, bigint, uuid, text, numeric) from public, anon, authenticated;


-- ---------- La puerta, con la rama nueva ----------
-- Copiada de 20261003200000 (la vigente, con la rama de calcos). Lo que
-- cambia: después de la idempotencia por pagos.cresium_transaccion_id y
-- ANTES de leer la referencia, un depósito SIN paymentOrder cuyo CVU es el
-- de un tenant entra por la rama dedicada. Con paymentOrder, nada cambia:
-- es un pago único (una renovación de un tenant sin CVU, o un pedido de
-- calcos) y manda la referencia, como siempre.
create or replace function acreditar_deposito_cresium(p_payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_t           jsonb;   -- la transacción, venga donde venga
  v_tx          bigint;
  v_external    text;
  v_estado      text;
  v_pagado      numeric;
  v_esperado    numeric;
  v_intento     integer;
  v_orden       jsonb;
  v_suscripcion uuid;
  v_hasta       date;
  v_lub         uuid;
  v_venc        date;
  v_inicio      date;
  v_primero     boolean;
  v_corre       boolean;
  v_meses       integer;
  v_nuevo       date;
  v_nuevo_ini   date;
  v_pago        uuid;
  v_evento      uuid;
  v_motivo      text;
  v_ref         text;              -- la segunda parte de una referencia `calcos:…`
  v_enc         encargos_calcos%rowtype;
  v_cvu         text;              -- el CVU que recibió el depósito (dedicado)
  v_monto       numeric;           -- lo que el pagador transfirió (bruto)
begin
  -- ---------- 1 · La forma del payload ----------
  -- Cresium manda la transacción en data.transaction (medido el 16/09/2026).
  -- Se aceptan también data y la raíz, por si la forma vuelve a la de la doc.
  v_t := coalesce(
    p_payload -> 'data' -> 'transaction',                              -- @forma
    p_payload -> 'data',
    p_payload
  );

  v_orden    := v_t -> 'paymentOrder';
  v_tx       := (v_t ->> 'id')::bigint;
  v_intento  := coalesce((p_payload ->> 'retry')::integer, 1);
  v_external := v_orden ->> 'externalId';
  v_estado   := v_orden ->> 'status';
  v_pagado   := (v_orden ->> 'amountPaid')::numeric;
  v_esperado := (v_orden ->> 'amount')::numeric;

  -- ---------- 2 · La evidencia, ANTES de decidir nada ----------
  insert into cresium_eventos (tipo, transaccion_id, external_id, intento, payload)
  values (coalesce(p_payload ->> 'type', v_t ->> 'type', 'DESCONOCIDO'), v_tx, v_external,
          least(greatest(v_intento, 1), 5), p_payload)
  returning id into v_evento;

  -- ---------- 3 · La orden, con lo último que Cresium dijo ----------
  if v_external is not null and v_orden is not null then
    perform cresium_actualizar_orden(v_external, v_orden);
  end if;

  if v_tx is null then
    update cresium_eventos
    set procesado_at = now(),
        motivo = 'el payload no trae el id de la transacción en ninguna de las tres formas (data.transaction.id, data.id, id): sin id no hay idempotencia, así que no se acredita. Guardado como evidencia.'
    where id = v_evento;
    return jsonb_build_object('resultado', 'sin_transaccion', 'evento', v_evento);
  end if;

  -- ---------- 4 · Un pedido de calcos: ANTES del cast a uuid ----------
  if v_external like 'calcos:%' then                                       -- @rama_calcos
    v_ref := split_part(v_external, ':', 2);
    if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then   -- @uuid_de_calcos
      select e.* into v_enc from encargos_calcos e where e.id = v_ref::uuid for update;
    end if;

    if v_enc.id is null then
      v_motivo := 'externalId de calcos no corresponde a ningún pedido: ' || v_external;
    elsif v_enc.cresium_transaccion_id = v_tx then                         -- @idempotencia_calcos
      update cresium_eventos set procesado_at = now(), motivo = 'ya acreditado (reintento)'
      where id = v_evento;
      return jsonb_build_object('resultado', 'ya_acreditado', 'concepto', 'calcos',
                                'encargo', v_enc.id, 'transaccion', v_tx);
    elsif v_estado is distinct from 'PAID' then                            -- @parcial_calcos
      v_motivo := format('orden de calcos en %s: pagó %s de %s — el pedido sigue sin pagar',
                         coalesce(v_estado, 'SIN ESTADO'), coalesce(v_pagado, 0), coalesce(v_esperado, 0));
    elsif v_enc.estado not in ('pendiente_pago', 'vencido') then           -- @estados_que_paga
      v_motivo := format('el pedido de calcos #%s está %s: el depósito no le cambia el estado',
                         lpad(v_enc.numero::text, 4, '0'), v_enc.estado);
    end if;

    if v_motivo is not null then
      update cresium_eventos set procesado_at = now(), motivo = v_motivo where id = v_evento;
      return jsonb_build_object(
        'resultado', 'sin_acreditar', 'concepto', 'calcos', 'motivo', v_motivo, 'transaccion', v_tx,
        'falta', case when v_esperado is not null and v_pagado is not null
                      then v_esperado - v_pagado else null end);
    end if;

    update encargos_calcos
       set estado = 'pagado', pagado_at = now(), cresium_transaccion_id = v_tx   -- @paga_calcos
     where id = v_enc.id;

    update cresium_eventos set procesado_at = now(), motivo = 'acreditado (pedido de calcos)'
    where id = v_evento;

    return jsonb_build_object(
      'resultado', 'acreditado', 'concepto', 'calcos', 'encargo', v_enc.id,
      'transaccion', v_tx, 'lubricentro', v_enc.lubricentro_id);
  end if;

  -- ---------- 5 · Una renovación: la idempotencia, primero ----------
  if exists (select 1 from pagos where cresium_transaccion_id = v_tx) then
    update cresium_eventos set procesado_at = now(), motivo = 'ya acreditado (reintento)'
    where id = v_evento;
    return jsonb_build_object('resultado', 'ya_acreditado', 'transaccion', v_tx);
  end if;

  -- ---------- 6 · El CVU dedicado (20261031100000) ----------
  -- Sin paymentOrder, el depósito entró a una cuenta fija. Cresium dice
  -- cuál en depositAddress (la doc de CVUs dedicados) o en `to` (la forma
  -- medida del DEPOSIT real). Se busca al tenant por el número de CVU y, de
  -- respaldo, por el id. Con paymentOrder no se entra acá aunque el CVU
  -- coincida: manda la referencia.
  if v_orden is null then                                                                -- @rama_dedicado
    -- Las dos formas en que viene la cuenta que recibió: `depositAddress`
    -- (la doc de CVUs dedicados) y `to` (el DEPOSIT real medido). Se busca
    -- al tenant por cualquiera de los dos números, y de respaldo por el id.
    -- ⚠ El DEPOSIT real del 16/09 trae `depositAddress` con el CVU del POOL
    -- del pago único y `to` con el mismo: no se elige uno, se prueban todos.
    select l.id, l.cresium_cvu into v_lub, v_cvu
    from lubricentros l
    where l.cresium_cvu in (v_t -> 'depositAddress' ->> 'value', v_t -> 'to' ->> 'value')
       or l.cresium_deposit_address_id in ((v_t -> 'depositAddress' ->> 'id')::bigint,
                                           (v_t -> 'to' ->> 'id')::bigint)
    order by (l.cresium_cvu in (v_t -> 'depositAddress' ->> 'value', v_t -> 'to' ->> 'value')) desc
    limit 1;
    if v_lub is not null then
      begin
        -- El bruto que transfirió el pagador: totalAmount, o la suma de los
        -- renglones (NET_BASE + comisiones) si no viene.
        v_monto := coalesce(
          (v_t ->> 'totalAmount')::numeric,
          (select sum((a ->> 'amount')::numeric) from jsonb_array_elements(coalesce(v_t -> 'amounts', '[]'::jsonb)) a),
          (v_t ->> 'amount')::numeric);
        return acreditar_deposito_dedicado(v_evento, v_tx, v_lub, v_cvu, v_monto);
      end;
    end if;
  end if;

  -- ---------- 7 · La referencia de un pago único ----------
  if v_external is null then
    v_motivo := 'depósito sin paymentOrder: no corresponde a una renovación';
  else
    v_suscripcion := nullif(split_part(v_external, ':', 1), '')::uuid;
    v_hasta       := nullif(split_part(v_external, ':', 2), '')::date;

    select s.lubricentro_id, s.vencimiento, s.inicio into v_lub, v_venc, v_inicio
    from suscripciones s where s.id = v_suscripcion;

    if v_lub is null then
      v_motivo := 'externalId no corresponde a ninguna suscripción: ' || v_external;
    end if;
  end if;

  if v_motivo is null and v_estado is distinct from 'PAID' then
    v_motivo := format('orden en %s: pagó %s de %s — no se extiende el vencimiento',
                       coalesce(v_estado, 'SIN ESTADO'), coalesce(v_pagado, 0), coalesce(v_esperado, 0));
  end if;

  if v_motivo is not null then
    update cresium_eventos set procesado_at = now(), motivo = v_motivo where id = v_evento;
    return jsonb_build_object(
      'resultado', 'sin_acreditar', 'motivo', v_motivo, 'transaccion', v_tx,
      'falta', case when v_esperado is not null and v_pagado is not null
                    then v_esperado - v_pagado else null end);
  end if;

  -- ---------- 8 · Acreditar un pago único ----------
  v_primero := not exists (select 1 from pagos p where p.lubricentro_id = v_lub);  -- @primer_pago

  select coalesce(meses_del_periodo(o.periodo), 1) into v_meses
  from cresium_ordenes o where o.external_id = v_external;

  select c.inicio, c.vencimiento into v_nuevo_ini, v_nuevo
  from ciclo_tras_el_pago(v_primero, v_inicio, v_venc, current_date, v_hasta,
                          coalesce(v_meses, 1) * interval '1 month') c;

  v_corre := v_nuevo_ini is distinct from v_inicio;

  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    v_lub, v_suscripcion, null, 'cresium', v_tx,
    case when v_corre then v_nuevo_ini else greatest(v_venc, current_date) end,
    case when v_corre then v_nuevo     else v_hasta end,
    v_pagado, current_date
  )
  returning id into v_pago;

  update suscripciones
  set vencimiento = v_nuevo,
      inicio      = v_nuevo_ini,
      estado = case
                 when estado in ('trial', 'vencida') and v_nuevo >= current_date
                   then 'activa'::estado_suscripcion
                 else estado
               end
  where id = v_suscripcion;

  update cresium_eventos set procesado_at = now(), motivo = 'acreditado' where id = v_evento;

  return jsonb_build_object(
    'resultado', 'acreditado', 'pago', v_pago, 'transaccion', v_tx,
    'lubricentro', v_lub, 'vencimiento', v_nuevo);
end;
$$;

comment on function acreditar_deposito_cresium is
  'La única puerta del webhook de Cresium. Guarda la evidencia antes de decidir nada, actualiza la orden, y acredita: una renovación por pago único (fila en pagos + vencimiento, idempotente por pagos.cresium_transaccion_id), un pedido de calcos (referencia `calcos:<uuid>`, antes del cast a uuid), o —desde 20261031100000— un depósito al CVU DEDICADO de un tenant (sin paymentOrder: se reconoce por el CVU y se acredita solo con el monto exacto de un período; si no, queda a confirmar). PARTIAL no acredita nada.';

revoke all on function acreditar_deposito_cresium(jsonb) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 8 · Resolver un depósito a confirmar, desde /fidelli
-- ════════════════════════════════════════════════════════════════════

-- >>> resolver_deposito_cresium
create or replace function resolver_deposito_cresium(
  p_deposito uuid,
  p_accion   text,
  p_periodo  periodo_suscripcion default null,
  p_nota     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_d         depositos_cresium%rowtype;
  v_sus       suscripciones%rowtype;
  v_meses     integer;
  v_primero   boolean;
  v_hasta     date;
  v_nuevo     date;
  v_nuevo_ini date;
  v_corre     boolean;
  v_pago      uuid;
  v_nota      text := nullif(trim(coalesce(p_nota, '')), '');
begin
  if not soy_superadmin() then                                                          -- @resolver_guard
    raise exception 'Solo el equipo Fidelli puede resolver un depósito'
      using errcode = '42501';
  end if;

  select * into v_d from depositos_cresium where id = p_deposito for update;
  if v_d.id is null then
    raise exception 'deposito_no_existe';
  end if;
  if v_d.estado <> 'a_confirmar' then                                                   -- @resolver_estado
    raise exception 'deposito_ya_resuelto'
      using detail = format('Está %s.', v_d.estado);
  end if;

  if p_accion = 'descartar' then
    if v_nota is null then                                                              -- @resolver_nota
      raise exception 'nota_vacia';
    end if;
    update depositos_cresium
       set estado = 'descartado', resuelto_por = auth.uid(), resuelto_at = now(), nota = v_nota
     where id = v_d.id;
    return jsonb_build_object('resultado', 'descartado', 'deposito', v_d.id);
  end if;

  if p_accion <> 'acreditar' then
    raise exception 'accion_invalida';
  end if;
  if p_periodo is null then
    raise exception 'periodo_vacio';
  end if;

  select * into v_sus from suscripciones s
  where s.lubricentro_id = v_d.lubricentro_id
  order by s.inicio desc, s.created_at desc
  limit 1;
  if v_sus.id is null then
    raise exception 'sin_suscripcion';
  end if;

  v_meses   := meses_del_periodo(p_periodo);
  v_primero := not exists (select 1 from pagos p where p.lubricentro_id = v_d.lubricentro_id);
  v_hasta   := (greatest(v_sus.vencimiento, current_date) + make_interval(months => v_meses))::date;

  select c.inicio, c.vencimiento into v_nuevo_ini, v_nuevo
  from ciclo_tras_el_pago(v_primero, v_sus.inicio, v_sus.vencimiento, current_date, v_hasta,
                          make_interval(months => v_meses)) c;
  v_corre := v_nuevo_ini is distinct from v_sus.inicio;

  -- El pago lleva las dos firmas: la transacción de Cresium (es plata que
  -- entró por el webhook, y el unique sigue siendo la idempotencia) y la
  -- persona que decidió a qué período va.
  insert into pagos (
    lubricentro_id, suscripcion_id, registrado_por, origen, cresium_transaccion_id,
    periodo_desde, periodo_hasta, monto, fecha_pago
  )
  values (
    v_d.lubricentro_id, v_sus.id, auth.uid(), 'cresium', v_d.transaccion_id,
    case when v_corre then v_nuevo_ini else greatest(v_sus.vencimiento, current_date) end,
    case when v_corre then v_nuevo     else v_hasta end,
    v_d.monto, (v_d.recibido_at at time zone 'America/Argentina/Buenos_Aires')::date
  )
  returning id into v_pago;

  update suscripciones
  set vencimiento = v_nuevo,
      inicio      = v_nuevo_ini,
      estado = case
                 when estado in ('trial', 'vencida') and v_nuevo >= current_date
                   then 'activa'::estado_suscripcion
                 else estado
               end
  where id = v_sus.id;

  update cresium_ordenes
     set estado = 'CERRADA', actualizado_at = now()
   where lubricentro_id = v_d.lubricentro_id
     and suscripcion_id is not null
     and deposit_address_id is not null
     and estado in ('NOT_PAID', 'PARTIAL');

  update depositos_cresium
     set estado = 'acreditado_a_mano', periodo = p_periodo, pago_id = v_pago,
         resuelto_por = auth.uid(), resuelto_at = now(), nota = v_nota
   where id = v_d.id;

  return jsonb_build_object('resultado', 'acreditado', 'deposito', v_d.id, 'pago', v_pago,
                            'vencimiento', v_nuevo, 'periodo', p_periodo);
end;
$$;
-- <<< resolver_deposito_cresium

comment on function resolver_deposito_cresium is
  'Fidelli decide qué hacer con un depósito a confirmar: «acreditar» con un período (una fila en pagos con la transacción de Cresium Y quién decidió, el vencimiento como cualquier pago) o «descartar» con nota. Una vez: un depósito resuelto no se vuelve a resolver.';

revoke all on function resolver_deposito_cresium(uuid, text, periodo_suscripcion, text) from public, anon;
grant execute on function resolver_deposito_cresium(uuid, text, periodo_suscripcion, text) to authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 9 · Lo que lee /fidelli: los depósitos que esperan una decisión
-- ════════════════════════════════════════════════════════════════════

-- >>> depositos_cresium_pendientes
create or replace function depositos_cresium_pendientes()
returns table (
  id             uuid,
  lubricentro_id uuid,
  nombre         text,
  slug           text,
  transaccion_id bigint,
  monto          numeric,
  cvu            text,
  recibido_at    timestamptz,
  motivo         text,
  periodo_actual periodo_suscripcion,
  vencimiento    date,
  montos         jsonb,
  telefono       text,
  owner_nombre   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli lee los depósitos a confirmar'
      using errcode = '42501';
  end if;

  return query
  select
    d.id, d.lubricentro_id, l.nombre, l.slug, d.transaccion_id, d.monto, d.cvu, d.recibido_at, d.motivo,
    v.periodo, v.vencimiento,
    (select coalesce(jsonb_agg(jsonb_build_object('periodo', m.periodo, 'meses', m.meses, 'total', m.total) order by m.meses), '[]'::jsonb)
       from montos_ofrecidos(d.lubricentro_id) m),
    telefono_de_contacto(d.lubricentro_id),
    (select u.nombre from usuarios u where u.lubricentro_id = l.id and u.rol = 'owner' limit 1)
  from depositos_cresium d
  join lubricentros l on l.id = d.lubricentro_id
  left join lateral (
    select s.periodo, s.vencimiento
    from suscripciones s
    where s.lubricentro_id = d.lubricentro_id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v on true
  where d.estado = 'a_confirmar'
  order by d.recibido_at;
end;
$$;
-- <<< depositos_cresium_pendientes

comment on function depositos_cresium_pendientes is
  'La lista de arriba de /fidelli/cobranzas y la alerta del hub: cada depósito al CVU dedicado que no se pudo acreditar solo, con el tenant, el motivo y los montos que hoy se le cobran (para elegir el período al acreditar).';

revoke all on function depositos_cresium_pendientes() from public, anon;
grant execute on function depositos_cresium_pendientes() to authenticated;
