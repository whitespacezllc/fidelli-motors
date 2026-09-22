-- ════════════════════════════════════════════════════════════════════
-- TENANT_EVENTOS · el libro de novedades de cada lubricentro
-- (bloque MÉTRICAS 1 · docs/METRICAS.md § 3 "Los eventos")
--
-- Hasta hoy el admin no sabía cuándo se suspendió un tenant, cuándo cambió
-- de plan ni cuándo se le prendió el reloj: `lubricentros` y `suscripciones`
-- no tienen `updated_at`, y `activo` se escribía con un UPDATE suelto sin
-- motivo (docs/ADMIN-INVENTARIO.md § 8.4). Sin esa memoria no hay bajas por
-- mes, ni churn, ni "desde cuándo": las métricas de crecimiento del bloque
-- 2 no tienen de dónde salir.
--
-- Esta tabla es esa memoria. TRES REGLAS:
--
--   1 · UN FALLO DE INSTRUMENTACIÓN NUNCA BLOQUEA LA ESCRITURA ORIGINAL.
--       (Y por eso mismo tapa bugs: en el primer reset el `case … end` sin
--       cast a tipo_evento_tenant no resolvía la función y el reset pasó en
--       verde con cero eventos. R31 cuenta los eventos, no las warnings.)
--       Cada trigger envuelve su cuerpo en `begin … exception when others
--       then raise warning … end;` y devuelve null. Es lo que permite
--       cubrir `pagos` sin tocar registrar_pago() ni
--       acreditar_deposito_cresium(): las cobranzas no se tocan.
--
--   2 · NADIE EDITA NI BORRA UNA FILA. Tres candados con el molde de
--       cresium_eventos (20260917110000): edición, borrado y purga, los
--       tres en `enable always`.
--
--   3 · ESCRIBEN SOLO LOS TRIGGERS Y LAS FUNCIONES DEFINER. La tabla no
--       tiene policy de insert/update/delete para clientes; el único
--       insert vive en emitir_evento_tenant(), que es definer y no está
--       grantada a nadie. `authenticated` la lee, y solo si es superadmin.
--
-- ⚠ LA ÚNICA SALIDA DEL CANDADO DE BORRADO es que el TENANT ENTERO ya no
-- exista. La FK es `on delete cascade` y el candado deja pasar una fila
-- solo cuando su lubricentro se fue (o sea, solo dentro del cascade). El
-- brief pedía `restrict`; con `restrict`, las pruebas de
-- verificaciones.sql que crean y borran tenants de prueba (R23, R25, R26 y
-- otras) fallaban al limpiar, y esas pruebas no se reescriben. En
-- producción ningún tenant se borra —todo lo demás es `on delete restrict`—
-- así que una fila de evento sigue sin poder borrarse mientras su tenant
-- exista. Lo prueba R31a.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @candado_edicion_evento`, `-- @candado_borrado_evento`,
-- `-- @candado_purga_evento` y `-- @defensivo` y los marcadores
-- `-- >>> nombre` / `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-metricas.sh
-- los muerde con sed y awk.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Los tipos
-- ════════════════════════════════════════════════════════════════════

create type tipo_evento_tenant as enum (
  'alta',
  'suspension',
  'reactivacion',
  'suspension_reloj',
  'reactivacion_reloj',
  'cambio_plan',
  'pago',
  'modulo_activado',
  'modulo_desactivado',
  'reloj_encendido',
  'reloj_apagado',
  'calcos',
  'edicion',
  'origen'
);

-- El motivo de una suspensión manual. `falta_de_pago` es churn
-- involuntario; los otros tres, voluntario (docs/METRICAS.md § 1 "Churn").
create type motivo_suspension as enum (
  'falta_de_pago', 'pedido_del_cliente', 'cierre_del_negocio', 'otro'
);


-- ════════════════════════════════════════════════════════════════════
-- 2 · La tabla
-- ════════════════════════════════════════════════════════════════════

create table tenant_eventos (
  id             uuid primary key default gen_random_uuid(),
  lubricentro_id uuid not null references lubricentros(id) on delete cascade,
  tipo           tipo_evento_tenant not null,
  ocurrido_at    timestamptz not null default now(),
  antes          jsonb,
  despues        jsonb,
  motivo         text,
  -- Quién. auth.uid() si había sesión; null en el webhook, en el backfill
  -- y en el cierre diario. FK a usuarios para que el bloque 2 pueda
  -- embeber el nombre (`usuarios!actor(nombre)`).
  actor          uuid references usuarios(id) on delete restrict,
  origen_evento  text not null check (origen_evento in ('admin', 'sistema', 'webhook', 'backfill')),
  created_at     timestamptz not null default now()
);

create index tenant_eventos_lubricentro_idx on tenant_eventos (lubricentro_id, ocurrido_at);
create index tenant_eventos_tipo_idx        on tenant_eventos (tipo, ocurrido_at);

comment on table tenant_eventos is
  'El libro de novedades de cada tenant (docs/METRICAS.md § 3): alta, suspensión y reactivación (manual y por reloj), cambio de plan, pago, módulos, reloj, calcos, edición, origen. Append-only e inmutable: tres candados. Escriben solo los triggers y las funciones definer.';
comment on column tenant_eventos.ocurrido_at is
  'Cuándo pasó. now() del trigger; la fecha original en el backfill y el instante del cierre en las transiciones de reloj.';
comment on column tenant_eventos.origen_evento is
  'admin = sesión de superadmin · sistema = sin sesión (seed, cierre diario) o un owner escribiendo lo suyo · webhook = pago de Cresium · backfill = 20260922205000.';

alter table tenant_eventos enable row level security;

-- Solo Fidelli lee. Sin policies de escritura: la puerta es la función.
create policy tenant_eventos_lectura on tenant_eventos
  for select to authenticated using (soy_superadmin());

-- El default ACL del schema le da ALL a authenticated sobre las tablas
-- nuevas; el RLS ya lo frena, y el revoke es la segunda capa que este
-- repo escribe siempre (20260917110000 § 5).
revoke all on table tenant_eventos from anon;
revoke insert, update, delete, truncate, references, trigger on table tenant_eventos from authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 3 · Los candados
-- ════════════════════════════════════════════════════════════════════

-- >>> bloquear_edicion_de_evento_tenant
create or replace function bloquear_edicion_de_evento_tenant()
returns trigger
language plpgsql
as $$
begin
  raise exception 'evento_no_se_edita'                                 -- @candado_edicion_evento
    using hint = 'tenant_eventos es append-only: un evento cuenta lo que pasó y no se corrige. '
                 'Si algo quedó mal registrado, el arreglo es un evento nuevo, no editar el viejo.';
  return new;
end;
$$;
-- <<< bloquear_edicion_de_evento_tenant

create trigger candado_edicion_evento_tenant
  before update on tenant_eventos
  for each row execute function bloquear_edicion_de_evento_tenant();

-- >>> bloquear_borrado_de_evento_tenant
create or replace function bloquear_borrado_de_evento_tenant()
returns trigger
language plpgsql
as $$
begin
  -- La única salida: el tenant entero se fue (cascade). Mientras el
  -- lubricentro exista, la fila no se borra, venga de donde venga.
  if exists (select 1 from lubricentros where id = old.lubricentro_id) then    -- @candado_borrado_evento
    raise exception 'evento_no_se_borra'
      using hint = 'tenant_eventos es append-only: es la memoria de cuándo se suspendió, pagó o cambió de '
                   'plan cada tenant, y de ahí salen las bajas y el churn. Si necesitás una base limpia '
                   'para probar, usá supabase db reset.';
  end if;
  return old;
end;
$$;
-- <<< bloquear_borrado_de_evento_tenant

create trigger candado_borrado_evento_tenant
  before delete on tenant_eventos
  for each row execute function bloquear_borrado_de_evento_tenant();

-- >>> bloquear_purga_de_eventos_tenant
create or replace function bloquear_purga_de_eventos_tenant()
returns trigger
language plpgsql
as $$
begin
  raise exception 'eventos_no_se_vacian'                               -- @candado_purga_evento
    using hint = 'Un truncate sobre tenant_eventos borra la historia de todos los tenants en una línea. '
                 'La única forma legítima de que esta tabla quede vacía es supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_eventos_tenant

create trigger candado_purga_eventos_tenant
  before truncate on tenant_eventos
  for each statement execute function bloquear_purga_de_eventos_tenant();

-- Sin perilla de apagado al lado (20260917110000 § 4).
alter table tenant_eventos enable always trigger candado_edicion_evento_tenant;
alter table tenant_eventos enable always trigger candado_borrado_evento_tenant;
alter table tenant_eventos enable always trigger candado_purga_eventos_tenant;


-- ════════════════════════════════════════════════════════════════════
-- 4 · La única puerta de escritura
-- ════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER a propósito: los triggers corren con el rol del que
-- escribe (un owner cargando un service no tiene insert sobre esta
-- tabla, y no tiene por qué tenerlo). El que escribe es uno solo, y no
-- está grantado a nadie: solo lo llaman los triggers y cerrar_dia().

-- >>> emitir_evento_tenant
create or replace function emitir_evento_tenant(
  p_lubricentro   uuid,
  p_tipo          tipo_evento_tenant,
  p_antes         jsonb,
  p_despues       jsonb,
  p_motivo        text,
  p_origen_evento text,
  p_ocurrido_at   timestamptz default now(),
  p_actor         uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into tenant_eventos
    (lubricentro_id, tipo, ocurrido_at, antes, despues, motivo, actor, origen_evento)
  values
    (p_lubricentro, p_tipo, coalesce(p_ocurrido_at, now()), p_antes, p_despues,
     nullif(trim(coalesce(p_motivo, '')), ''), p_actor, p_origen_evento)
  returning id into v_id;
  return v_id;
end;
$$;
-- <<< emitir_evento_tenant

revoke all on function emitir_evento_tenant(uuid, tipo_evento_tenant, jsonb, jsonb, text, text, timestamptz, uuid)
  from public, anon, authenticated;

-- De qué lado vino la escritura. `admin` es una sesión de superadmin;
-- todo lo demás sin sesión de Fidelli —el seed, el cierre diario, un
-- owner escribiendo lo suyo— es `sistema`. El actor queda igual.
create or replace function origen_evento_de_sesion()
returns text
language sql
stable
set search_path = public
as $$
  select case when soy_superadmin() then 'admin' else 'sistema' end;
$$;

revoke all on function origen_evento_de_sesion() from public, anon;


-- ════════════════════════════════════════════════════════════════════
-- 5 · La instrumentación: todos AFTER, todos defensivos
-- ════════════════════════════════════════════════════════════════════
--
-- Cada función devuelve null y envuelve su cuerpo en un bloque que baja
-- cualquier error a WARNING (`-- @defensivo`). La escritura original —el
-- alta, el pago, la suspensión— sigue igual pase lo que pase acá adentro.
-- R31b lo prueba saboteando el insert del evento.

-- ⚠ LOS CINCO SON SECURITY DEFINER, y no por comodidad: un trigger corre con
-- el rol del que escribe, y el que escribe es `authenticated` (el
-- superadmin desde PostgREST, el owner desde su panel). Ese rol NO tiene
-- EXECUTE sobre emitir_evento_tenant() —ni debe tenerlo: sería un /rpc/
-- para escribir eventos a mano—. Como invoker, el trigger fallaba con
-- «permission denied for function emitir_evento_tenant», el envoltorio lo
-- bajaba a WARNING y la tabla quedaba vacía con el reset en verde. Lo vio
-- el segundo reset del bloque, en las pruebas que impersonan
-- `authenticated`. Mismo precedente que onboarding_tras_cambio()
-- (20260909180000): definer para que una escritura de cualquier rol pueda
-- dejar su rastro.

-- ---------- 5.a · El alta (trigger DIFERIDO) ----------
--
-- Es un CONSTRAINT TRIGGER `deferrable initially deferred`: se dispara al
-- COMMIT y no al final del insert. crear_lubricentro() inserta el tenant y
-- recién después su suscripción, en la misma transacción; un trigger
-- inmediato la vería vacía. Diferido, el evento nace con el plan y el
-- período. Dentro de una transacción larga (una prueba en un `do $$`) el
-- evento aparece al commit o al ejecutar `set constraints all immediate`.
--
-- Si el tenant ya no existe al commit (las pruebas crean y borran en la
-- misma transacción), no hay nada que registrar.

-- >>> tenant_evento_alta
create or replace function tenant_evento_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub     record;
  v_despues jsonb;
begin
  begin                                                                -- @defensivo
    if not exists (select 1 from lubricentros where id = new.id) then
      return null;
    end if;

    select s.plan_id, p.nombre as plan, s.periodo, s.descuento_pct
      into v_sub
      from suscripciones s
      left join planes p on p.id = s.plan_id
     where s.lubricentro_id = new.id
     order by s.inicio desc, s.created_at desc
     limit 1;

    v_despues := jsonb_build_object(
      'nombre', new.nombre, 'slug', new.slug, 'cobranza_desde', new.cobranza_desde);

    if found then
      v_despues := v_despues || jsonb_build_object(
        'plan_id', v_sub.plan_id, 'plan', v_sub.plan,
        'periodo', v_sub.periodo, 'descuento_pct', v_sub.descuento_pct);
    end if;

    perform emitir_evento_tenant(new.id, 'alta', null, v_despues, null,
                                 origen_evento_de_sesion(), now(), auth.uid());
  exception when others then
    raise warning 'tenant_eventos: alta de % no se registró: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_alta

create constraint trigger tenant_evento_alta
  after insert on lubricentros
  deferrable initially deferred
  for each row execute function tenant_evento_alta();


-- ---------- 5.b · Los cambios del tenant ----------

-- >>> tenant_evento_tras_update_lubricentro
create or replace function tenant_evento_tras_update_lubricentro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text;
begin
  begin                                                                -- @defensivo
    v_origen := origen_evento_de_sesion();

    -- El interruptor manual. El motivo lo deja cambiar_estado_lubricentro()
    -- en un GUC transaccional, justo antes del UPDATE.
    if new.activo is distinct from old.activo then
      perform emitir_evento_tenant(new.id,
        (case when new.activo then 'reactivacion' else 'suspension' end)::tipo_evento_tenant,
        jsonb_build_object('activo', old.activo),
        jsonb_build_object('activo', new.activo),
        current_setting('app.motivo_evento', true),
        v_origen, now(), auth.uid());
    end if;

    -- El primer interruptor del reloj (regla 17 de CLAUDE.md).
    if new.cobranza_desde is distinct from old.cobranza_desde then
      perform emitir_evento_tenant(new.id,
        (case when new.cobranza_desde is null then 'reloj_apagado' else 'reloj_encendido' end)::tipo_evento_tenant,
        jsonb_build_object('cobranza_desde', old.cobranza_desde),
        jsonb_build_object('cobranza_desde', new.cobranza_desde),
        null, v_origen, now(), auth.uid());
    end if;

    if new.calcos_entregadas is distinct from old.calcos_entregadas then
      perform emitir_evento_tenant(new.id, 'calcos',
        jsonb_build_object('calcos_entregadas', old.calcos_entregadas),
        jsonb_build_object('calcos_entregadas', new.calcos_entregadas),
        null, v_origen, now(), auth.uid());
    end if;

    if new.nombre is distinct from old.nombre or new.slug is distinct from old.slug then
      perform emitir_evento_tenant(new.id, 'edicion',
        jsonb_build_object('nombre', old.nombre, 'slug', old.slug),
        jsonb_build_object('nombre', new.nombre, 'slug', new.slug),
        null, v_origen, now(), auth.uid());
    end if;

    if new.origen is distinct from old.origen
       or new.origen_detalle is distinct from old.origen_detalle then
      perform emitir_evento_tenant(new.id, 'origen',
        jsonb_build_object('origen', old.origen, 'origen_detalle', old.origen_detalle),
        jsonb_build_object('origen', new.origen, 'origen_detalle', new.origen_detalle),
        null, v_origen, now(), auth.uid());
    end if;

    -- plan_overrides NO se mira acá: el evento de módulo sale del insert de
    -- cambios_override_plan (5.c), que es donde está el motivo y la única
    -- puerta por la que ese jsonb puede cambiar.
  exception when others then
    raise warning 'tenant_eventos: cambio de % no se registró: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_tras_update_lubricentro

create trigger tenant_evento_tras_update_lubricentro
  after update on lubricentros
  for each row execute function tenant_evento_tras_update_lubricentro();


-- ---------- 5.c · Los módulos, desde la auditoría del override ----------
--
-- `lubricentros.plan_overrides` solo cambia por fijar_override_plan(): el
-- candado `candado_override_plan` rechaza cualquier otro UPDATE. Y esa
-- función escribe siempre una fila en cambios_override_plan con el motivo
-- —«Módulo gomería · pago · fecha»—, que es la única constancia comercial
-- de si el módulo se cobra o se regala (lib/modulos.ts, modulo_es_pago()).
-- Emitir desde acá es lo que deja el motivo en el evento.

-- >>> tenant_evento_tras_override
create or replace function tenant_evento_tras_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m       record;
  v_antes   boolean;
  v_despues boolean;
begin
  begin                                                                -- @defensivo
    for v_m in select codigo from modulos loop
      v_antes   := coalesce((new.overrides_antes   ->> v_m.codigo)::boolean, false);
      v_despues := coalesce((new.overrides_despues ->> v_m.codigo)::boolean, false);

      if v_antes <> v_despues then
        perform emitir_evento_tenant(new.lubricentro_id,
          (case when v_despues then 'modulo_activado' else 'modulo_desactivado' end)::tipo_evento_tenant,
          jsonb_build_object('modulo', v_m.codigo, 'activo', v_antes,   'overrides', new.overrides_antes),
          jsonb_build_object('modulo', v_m.codigo, 'activo', v_despues, 'overrides', new.overrides_despues,
                             'cambio_id', new.id),
          new.motivo, origen_evento_de_sesion(), new.created_at, new.cambiado_por);
      end if;
    end loop;
  exception when others then
    raise warning 'tenant_eventos: override % no se registró: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_tras_override

create trigger tenant_evento_tras_override
  after insert on cambios_override_plan
  for each row execute function tenant_evento_tras_override();


-- ---------- 5.d · El cambio de plan ----------
--
-- Solo plan, período o descuento. Un cambio de vencimiento, inicio o estado
-- es el ciclo moviéndose por un pago, y eso lo cuenta el evento `pago`.

-- >>> tenant_evento_tras_update_suscripcion
create or replace function tenant_evento_tras_update_suscripcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_antes   text;
  v_plan_despues text;
begin
  begin                                                                -- @defensivo
    if new.plan_id is distinct from old.plan_id
       or new.periodo is distinct from old.periodo
       or new.descuento_pct is distinct from old.descuento_pct then

      select nombre into v_plan_antes   from planes where id = old.plan_id;
      select nombre into v_plan_despues from planes where id = new.plan_id;

      perform emitir_evento_tenant(new.lubricentro_id, 'cambio_plan',
        jsonb_build_object('plan_id', old.plan_id, 'plan', v_plan_antes,
                           'periodo', old.periodo, 'descuento_pct', old.descuento_pct),
        jsonb_build_object('plan_id', new.plan_id, 'plan', v_plan_despues,
                           'periodo', new.periodo, 'descuento_pct', new.descuento_pct,
                           'suscripcion_id', new.id),
        null, origen_evento_de_sesion(), now(), auth.uid());
    end if;
  exception when others then
    raise warning 'tenant_eventos: cambio de plan de % no se registró: %', new.lubricentro_id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_tras_update_suscripcion

create trigger tenant_evento_tras_update_suscripcion
  after update on suscripciones
  for each row execute function tenant_evento_tras_update_suscripcion();


-- ---------- 5.e · El pago ----------
--
-- Cubre las dos puertas —registrar_pago() y acreditar_deposito_cresium()—
-- sin tocar ninguna: las dos terminan en un INSERT sobre pagos. `webhook`
-- si vino de Cresium; si no, el origen de la sesión (`admin` para el
-- cobro manual del superadmin).

-- >>> tenant_evento_tras_pago
create or replace function tenant_evento_tras_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin                                                                -- @defensivo
    perform emitir_evento_tenant(new.lubricentro_id, 'pago', null,
      jsonb_build_object(
        'pago_id', new.id, 'monto', new.monto,
        'periodo_desde', new.periodo_desde, 'periodo_hasta', new.periodo_hasta,
        'fecha_pago', new.fecha_pago, 'origen', new.origen,
        'cresium_transaccion_id', new.cresium_transaccion_id,
        'suscripcion_id', new.suscripcion_id, 'registrado_por', new.registrado_por),
      null,
      case when new.origen = 'cresium' then 'webhook' else origen_evento_de_sesion() end,
      new.created_at, auth.uid());
  exception when others then
    raise warning 'tenant_eventos: pago % no se registró: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_tras_pago

create trigger tenant_evento_tras_pago
  after insert on pagos
  for each row execute function tenant_evento_tras_pago();


-- ════════════════════════════════════════════════════════════════════
-- 6 · Suspender con motivo — el único cambio de comportamiento del bloque
-- ════════════════════════════════════════════════════════════════════
--
-- Antes: `update lubricentros set activo = false` directo desde la Server
-- Action, sin quién, sin cuándo, sin por qué. Ahora la única puerta es esta
-- función: deja el motivo en un GUC transaccional que el trigger de arriba
-- lee y guarda en el evento `suspension`. Al reactivar, el motivo puede ir
-- vacío.
--
-- SECURITY DEFINER con guarda explícita (42501 como las demás). El GUC es
-- `set_config(…, true)`: muere con la transacción, nadie puede dejarlo
-- prendido para el próximo UPDATE.

-- >>> cambiar_estado_lubricentro
create or replace function cambiar_estado_lubricentro(
  p_id      uuid,
  p_activo  boolean,
  p_motivo  motivo_suspension default null,
  p_detalle text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede suspender o reactivar un lubricentro'
      using errcode = '42501';
  end if;

  if p_activo is null then
    raise exception 'estado_vacio';
  end if;

  if not p_activo then
    if p_motivo is null then
      raise exception 'motivo_vacio';
    end if;
    if p_motivo = 'otro' and v_detalle is null then
      raise exception 'detalle_vacio';
    end if;
  end if;

  perform set_config('app.motivo_evento',
    case when p_activo then coalesce(v_detalle, '')
         else p_motivo::text || coalesce(' · ' || v_detalle, '') end,
    true);

  update lubricentros set activo = p_activo where id = p_id;

  if not found then
    raise exception 'no_existe';
  end if;
end;
$$;
-- <<< cambiar_estado_lubricentro

comment on function cambiar_estado_lubricentro is
  'La única puerta para lubricentros.activo desde /fidelli (docs/METRICAS.md § 1 "Baja"). Suspender exige motivo (motivo_suspension) y, si es `otro`, un detalle; el trigger de lubricentros lo guarda en el evento `suspension`. Reactivar no exige nada. Exige superadmin.';

revoke all on function cambiar_estado_lubricentro(uuid, boolean, motivo_suspension, text) from public, anon;
grant execute on function cambiar_estado_lubricentro(uuid, boolean, motivo_suspension, text) to authenticated;
