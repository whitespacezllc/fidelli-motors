-- ════════════════════════════════════════════════════════════════════
-- EL CATÁLOGO DE COBRANZA · toda la plata es dato, y todo cambio deja rastro
--
-- Esta migración no cobra nada. Prepara el catálogo para que el reloj de
-- cobranza (la migración que viene) pueda calcular un monto leyendo la
-- base y no una constante de TypeScript.
--
-- Trae cuatro cosas:
--
--   1. `modulos` — el precio del módulo gomería deja de no existir.
--      Hasta hoy el derecho al módulo vivía en el override de plan y el
--      precio no vivía en ningún lado: `lib/modulos.ts` lo dice en su
--      encabezado ("Hasta que haya facturación de verdad..."). Esto es eso.
--
--   2. `cambios_precio_catalogo` — la auditoría que no había. Los
--      overrides tienen `cambios_override_plan` y las patentes tienen
--      `correcciones_patente`, pero `planes.precio_mensual` se editaba
--      desde /fidelli/precios sin dejar quién, cuándo ni por qué. Con el
--      plan anual congelando precio doce meses, "¿por qué este cliente
--      paga esto y desde cuándo?" es una pregunta que va a hacer un
--      cliente, y hoy no tiene respuesta. Es barata ahora y no se puede
--      reconstruir después.
--
--   3. El plan "Fidelli Motors" sale del catálogo, con `activo = false`.
--
--   4. La DRIFT entre el catálogo local y el de producción, corregida.
--
-- ⚠ LA REGLA DE LA QUE SALE TODO ESTO, y que está escrita en CLAUDE.md:
--   toda la plata es DATO y no constante, y todo cambio de plata deja
--   rastro con autor, fecha y motivo.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · `modulos` — el catálogo de lo que se vende aparte del plan
-- ════════════════════════════════════════════════════════════════════
--
-- Al lado de `planes` y con su misma forma, porque es lo mismo: cosas que
-- vendemos, con un precio que Santiago ajusta y que afecta a todos los
-- futuros. En la taxonomía de /fidelli esto es CATÁLOGO, no contrato del
-- tenant ni operación.
--
-- EL DERECHO AL MÓDULO NO SE TOCA. Sigue siendo el override de plan más
-- el motivo (`lib/modulos.ts`), que ya tiene auditoría propia con autor,
-- fecha y motivo obligatorio, y que funciona. Lo único que se suma acá es
-- DE DÓNDE SALE EL NÚMERO.
--
-- `codigo` es el mismo valor del tipo `ModuloPago` de TypeScript
-- ('neumaticos'), no un nombre nuevo: el día que se agregue un módulo,
-- la clave del override y la fila de esta tabla tienen que coincidir o el
-- monto sale mal en silencio. La FK no se puede declarar contra un tipo
-- de TS, así que lo vigila R20a.

create table modulos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  nombre         text not null,
  precio_mensual numeric(12,2) not null check (precio_mensual >= 0),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint codigo_con_forma check (codigo ~ '^[a-z][a-z0-9_]*$')
);

comment on table modulos is
  'Catálogo de módulos pagos. El DERECHO al módulo vive en el override de plan y su motivo; acá vive solo el PRECIO. codigo = el valor de ModuloPago en lib/planes.ts.';

comment on column modulos.precio_mensual is
  'Mensual, siempre. El período lo multiplica el cálculo del monto, y el descuento del período (planes.descuento_*_pct) también se le aplica al módulo. El descuento founding del tenant NO.';

alter table modulos enable row level security;

-- Mismo par de policies que `planes`: lo lee cualquier autenticado (el
-- panel del dueño necesita el precio para mostrar su abono), lo escribe
-- solo Fidelli.
create policy modulos_lectura on modulos for select to authenticated using (true);

create policy modulos_admin on modulos for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- El único módulo que existe hoy. $25.000 mensuales.
insert into modulos (codigo, nombre, precio_mensual) values
  ('neumaticos', 'Módulo Gomería', 25000);


-- ════════════════════════════════════════════════════════════════════
-- 2 · `cambios_precio_catalogo` — el rastro
-- ════════════════════════════════════════════════════════════════════
--
-- Mismo patrón que `cambios_override_plan` (20260822150000): qué cambió,
-- de cuánto a cuánto, quién, cuándo y motivo obligatorio. Una sola tabla
-- para planes y módulos, con `tabla` + `fila_id` en vez de dos FKs: son
-- el mismo hecho comercial —se movió un precio de lista— y la pregunta
-- que esto contesta ("qué cambió de precio en marzo") se hace sobre los
-- dos a la vez.
--
-- `antes` y `despues` son jsonb con la fila completa de precios, no tres
-- columnas sueltas: el día que se agregue un descuento trimestral, el
-- histórico viejo sigue queriendo decir lo que decía y no hay que migrar
-- nada. Mismo criterio que overrides_antes/overrides_despues.

create table cambios_precio_catalogo (
  id           uuid primary key default gen_random_uuid(),
  tabla        text not null check (tabla in ('planes', 'modulos')),
  fila_id      uuid not null,
  nombre       text not null,
  antes        jsonb not null,
  despues      jsonb not null,
  motivo       text not null,
  cambiado_por uuid not null references usuarios(id) on delete restrict,
  created_at   timestamptz not null default now(),

  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);

comment on table cambios_precio_catalogo is
  'Auditoría de precios de lista: planes.precio_mensual, los dos descuento_*_pct y modulos.precio_mensual. Se escribe solo desde fijar_precio_plan() / fijar_precio_modulo().';

comment on column cambios_precio_catalogo.nombre is
  'El nombre del plan o módulo AL MOMENTO del cambio, copiado. Si mañana se renombra, el histórico sigue diciendo a qué se le movió el precio.';

create index cambios_precio_catalogo_fila_idx
  on cambios_precio_catalogo(tabla, fila_id, created_at desc);

alter table cambios_precio_catalogo enable row level security;

-- Solo Fidelli: el precio de lista es una decisión comercial nuestra.
create policy cambios_precio_admin on cambios_precio_catalogo
  for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());


-- ════════════════════════════════════════════════════════════════════
-- 3 · El candado — mismo mecanismo que el de overrides
-- ════════════════════════════════════════════════════════════════════
--
-- Un GUC transaccional que solo la función oficial enciende. No importa
-- por qué puerta se intente —/fidelli/precios, la API con una clave, un
-- script suelto—: la base lo rechaza igual. Es lo que hace que la
-- auditoría no se pueda saltear por descuido.
--
-- ⚠ El candado mira SOLO las columnas de plata. Cambiar `activo`,
-- `heredado`, `features` o `limites` sigue siendo un UPDATE normal: esos
-- ya tienen sus propios caminos y su propia auditoría, y meterlos acá
-- rompería el alta de tenants y el ABM de planes sin agregar nada.

-- ⚠ Las dos ramas de `tg_table_name` van en un IF y NO en una sola
-- expresión booleana con el `and`: `modulos` no tiene las columnas de
-- descuento, y plpgsql resuelve `new.descuento_anual_pct` al evaluar la
-- expresión aunque la guarda de la tabla diera false — no hay
-- cortocircuito garantizado. Escrito de la otra forma, CUALQUIER update
-- sobre `modulos` explota con «record "new" has no field». Se vio en rojo.

-- >>> candado
create or replace function bloquear_precio_directo()
returns trigger
language plpgsql
as $$
declare
  v_toca_plata boolean;
begin
  -- En el INSERT no hay nada que auditar todavía: el precio de nacimiento
  -- de un plan es parte de la migración que lo crea, y ahí queda escrito.
  if tg_op = 'INSERT' then
    return new;
  end if;

  if tg_table_name = 'planes' then
    v_toca_plata :=
      new.precio_mensual          is distinct from old.precio_mensual
      or new.descuento_semestral_pct is distinct from old.descuento_semestral_pct
      or new.descuento_anual_pct     is distinct from old.descuento_anual_pct;
  else
    v_toca_plata := new.precio_mensual is distinct from old.precio_mensual;
  end if;

  if v_toca_plata                                                      -- @candado
     and coalesce(current_setting('fidelli.precio_de_catalogo', true), '') <> 'si'
  then
    raise exception 'precio_solo_por_funcion'
      using hint = 'Los precios de lista se cambian con fijar_precio_plan() o fijar_precio_modulo(), que exigen motivo y dejan registro. Ver cambios_precio_catalogo.';
  end if;

  return new;
end;
$$;

-- Dos triggers, una sola función: `tg_table_name` distingue, y las
-- columnas de descuento solo existen en `planes`.
-- <<< candado

create trigger candado_precio_plan
  before insert or update on planes
  for each row execute function bloquear_precio_directo();

create trigger candado_precio_modulo
  before insert or update on modulos
  for each row execute function bloquear_precio_directo();


-- ════════════════════════════════════════════════════════════════════
-- 4 · Las dos puertas
-- ════════════════════════════════════════════════════════════════════
--
-- SECURITY INVOKER a propósito, igual que fijar_override_plan(): el
-- UPDATE y el INSERT del registro se evalúan contra las policies del que
-- llama, así que solo un superadmin llega al final. El chequeo explícito
-- de arriba existe para que el error sea claro y no un rechazo mudo de RLS.

-- >>> fijar_precio_plan
create or replace function fijar_precio_plan(
  p_plan       uuid,
  p_precio     numeric,
  p_semestral  numeric,
  p_anual      numeric,
  p_motivo     text
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_nombre text;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede mover un precio de lista'
      using errcode = '42501';
  end if;

  if p_motivo is null or char_length(trim(p_motivo)) < 10 then       -- @motivo
    raise exception 'motivo_corto'
      using hint = 'Contá por qué se mueve el precio: mínimo 10 caracteres. Dentro de un año, con un cliente preguntando por qué paga lo que paga, esta línea es la única respuesta.';
  end if;

  select nombre,
         jsonb_build_object(
           'precio_mensual',          precio_mensual,
           'descuento_semestral_pct', descuento_semestral_pct,
           'descuento_anual_pct',     descuento_anual_pct
         )
    into v_nombre, v_antes
  from planes where id = p_plan
  for update;

  if not found then
    raise exception 'plan_no_existe';
  end if;

  -- El GUC es transaccional (is_local = true): se apaga solo al commit y
  -- nadie puede dejarlo prendido para el próximo UPDATE.
  perform set_config('fidelli.precio_de_catalogo', 'si', true);

  update planes
  set precio_mensual          = p_precio,
      descuento_semestral_pct = p_semestral,
      descuento_anual_pct     = p_anual
  where id = p_plan;

  -- Un "cambio" que no cambia nada no se registra: /fidelli/precios manda
  -- el formulario entero en cada guardado, y llenar la auditoría de filas
  -- idénticas la vuelve ilegible justo cuando hace falta leerla.
  if v_antes is distinct from jsonb_build_object(                     -- @registro
       'precio_mensual',          p_precio,
       'descuento_semestral_pct', p_semestral,
       'descuento_anual_pct',     p_anual
     )
  then
    insert into cambios_precio_catalogo
      (tabla, fila_id, nombre, antes, despues, motivo, cambiado_por)
    values
      ('planes', p_plan, v_nombre, v_antes,
       jsonb_build_object(
         'precio_mensual',          p_precio,
         'descuento_semestral_pct', p_semestral,
         'descuento_anual_pct',     p_anual
       ),
       trim(p_motivo), auth.uid());
  end if;
end;
$$;

-- <<< fijar_precio_plan

comment on function fijar_precio_plan is
  'La única puerta para mover el precio o los descuentos de un plan. Exige motivo (>=10) y deja rastro en cambios_precio_catalogo. Un guardado que no cambia nada no registra nada.';


create or replace function fijar_precio_modulo(
  p_modulo  uuid,
  p_precio  numeric,
  p_motivo  text
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_nombre text;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede mover un precio de lista'
      using errcode = '42501';
  end if;

  if p_motivo is null or char_length(trim(p_motivo)) < 10 then
    raise exception 'motivo_corto'
      using hint = 'Contá por qué se mueve el precio del módulo: mínimo 10 caracteres.';
  end if;

  select nombre, jsonb_build_object('precio_mensual', precio_mensual)
    into v_nombre, v_antes
  from modulos where id = p_modulo
  for update;

  if not found then
    raise exception 'modulo_no_existe';
  end if;

  perform set_config('fidelli.precio_de_catalogo', 'si', true);

  update modulos set precio_mensual = p_precio where id = p_modulo;

  if v_antes is distinct from jsonb_build_object('precio_mensual', p_precio) then
    insert into cambios_precio_catalogo
      (tabla, fila_id, nombre, antes, despues, motivo, cambiado_por)
    values
      ('modulos', p_modulo, v_nombre, v_antes,
       jsonb_build_object('precio_mensual', p_precio), trim(p_motivo), auth.uid());
  end if;
end;
$$;

comment on function fijar_precio_modulo is
  'La única puerta para mover el precio de un módulo. Mismo contrato que fijar_precio_plan().';


-- ════════════════════════════════════════════════════════════════════
-- 5 · El plan "Fidelli Motors" sale del catálogo
-- ════════════════════════════════════════════════════════════════════
--
-- Santiago quiere que el catálogo sea Basic, Pro y Ultra. Pero este plan
-- NO es un plan viejo de un cliente: es el plan de la cuenta demo, y lo
-- crean `20260723225403_seed_demo.sql:58` y
-- `20260724040841_auth_trigger_usuarios.sql:144`, los dos buscándolo POR
-- NOMBRE y, si no lo encuentran, insertándolo de nuevo.
--
-- Por eso las tres formas de "quitarlo" fallan distinto:
--
--   · delete        → lo bloquea `on delete restrict` (la demo tiene
--                     suscripción), y si alguien fuerza el camino, la
--                     próxima corrida del seed lo recrea con el precio
--                     viejo, pisando el real.
--   · renombrarlo   → los dos seeds dejan de encontrarlo y CREAN UN
--                     DUPLICADO.
--   · activo=false  → sale del catálogo, de los desplegables y de
--                     /fidelli/precios. La demo sigue andando porque el
--                     lookup por nombre no filtra por `activo`.
--                     Es el único que hace lo que se quiere.
--
-- ⚠ `heredado = true` NO sirve acá, aunque sea el mecanismo pensado para
-- "no se ofrece más pero se sigue cobrando": este plan YA está heredado
-- en producción (verificado el 15/09/2026), así que marcarlo otra vez no
-- cambiaría nada. Y el argumento que justifica `heredado` —que
-- /fidelli/precios tiene que seguir mostrándolo para el ajuste por IPC—
-- no aplica: el único tenant que lo tiene es la demo, con
-- descuento_pct = 100. No hay a quién ajustarle el precio.
--
-- Es la misma regla del sprint anterior con el enum: la historia sigue
-- queriendo decir lo que decía. Un plan desactivado deja intactos los
-- `pagos` viejos; uno borrado los convierte en filas que apuntan a nada.
--
-- ⚠ ESTE UPDATE TOCA CERO FILAS EN LOCAL, y está bien. En dev y producción
-- el plan es dato previo y esto lo marca solo; en el `db reset` local el
-- plan NO EXISTE TODAVÍA a esta altura —lo crea `seed_demo()` durante
-- `seed.sql`, después de todas las migraciones—, así que el entorno local
-- se arregla ahí, al lado de los otros cuatro backfills que tienen este
-- mismo problema y lo resuelven igual. Verificado: sin esa mitad, el reset
-- deja el plan activo y a $45.000. Lo vigila R20b, que corre después del seed.

update planes set activo = false
where nombre = 'Fidelli Motors';


-- ════════════════════════════════════════════════════════════════════
-- 6 · La DRIFT entre local y producción
-- ════════════════════════════════════════════════════════════════════
--
-- Medida el 15/09/2026, comparando `db reset` contra producción:
--
--   | plan            | campo                   | local | producción |
--   |-----------------|-------------------------|-------|------------|
--   | los cuatro      | descuento_semestral_pct |    10 |          0 |
--   | Fidelli Motors  | precio_mensual          | 45000 |      46750 |
--   | Fidelli Motors  | descuento_anual_pct     |    15 |         25 |
--
-- De dónde sale: `20260822150000` inserta los tres vigentes fijando el
-- anual en 25 y dejando "el semestral en su default", que es 10. Después
-- Santiago lo bajó a 0 desde /fidelli/precios, en producción y solo ahí.
--
-- POR QUÉ IMPORTA, y no es cosmético: la pantalla de pago del sprint
-- decide si ofrece el período semestral mirando el DATO —si
-- `descuento_semestral_pct > 0`, la opción aparece sola—. Con la drift,
-- en local la opción aparece y en producción no. Quien pruebe la pantalla
-- localmente vería semestral, concluiría que la regla anda, y mandaría a
-- producción algo que se comporta distinto. La drift muerde exactamente
-- donde se está trabajando.
--
-- Estos UPDATE son no-ops en producción (ya tiene estos valores) y
-- arreglan el reset local. Van por adentro del candado con el GUC, que es
-- el mismo camino que usa fijar_precio_plan(): una migración no tiene
-- auth.uid(), así que no puede llamar a la función —el insert de
-- auditoría fallaría por `cambiado_por not null`— y tampoco debe: el
-- rastro de un cambio de catálogo hecho por migración es la migración.

do $$
begin
  perform set_config('fidelli.precio_de_catalogo', 'si', true);

  -- El semestral, en los cuatro. Hoy vale 0 en producción: pagar seis
  -- meses por adelantado a precio de lista es estrictamente peor que
  -- mensual, así que la opción no se ofrece. El día que Santiago le ponga
  -- un descuento desde /fidelli/precios, la pantalla lo muestra sola.
  update planes set descuento_semestral_pct = 0;

  -- El plan de la demo, con los valores reales de producción.
  update planes
  set precio_mensual      = 46750,
      descuento_anual_pct = 25
  where nombre = 'Fidelli Motors';
end $$;


-- ════════════════════════════════════════════════════════════════════
-- 7 · La red de seguridad de la propia migración
-- ════════════════════════════════════════════════════════════════════
--
-- Mismo criterio que `20260823230000_precio_basic.sql`: si el catálogo no
-- quedó exactamente como se espera, es mejor que el push falle acá y no
-- que un precio equivocado llegue a una factura.

do $$
declare
  v_vigentes text;
  v_modulo   numeric;
  v_demo     record;
begin
  select string_agg(nombre || '=' || precio_mensual || '/' || descuento_anual_pct, ' ' order by nombre)
    into v_vigentes
  from planes where activo and not heredado;

  if v_vigentes is distinct from 'Basic=39000.00/25.00 Pro=49000.00/25.00 Ultra=99000.00/25.00' then
    raise exception 'El catálogo vigente quedó en «%» y tenía que quedar en Basic 39000 / Pro 49000 / Ultra 99000, los tres al 25%% anual.', v_vigentes;
  end if;

  if exists (select 1 from planes where descuento_semestral_pct <> 0) then
    raise exception 'Quedó algún plan con descuento semestral distinto de 0: la pantalla de pago ofrecería semestral en este entorno y no en producción.';
  end if;

  -- El plan de la demo se verifica SOLO SI YA EXISTE. En dev y producción
  -- existe y esto lo controla; en el reset local todavía no nació y el
  -- control equivalente es R20b, después del seed. Un `raise` acá dejaría
  -- el `db reset` en rojo para siempre, que es justo el modo de falla que
  -- este sprint viene evitando.
  select activo, heredado, precio_mensual, descuento_anual_pct into v_demo
  from planes where nombre = 'Fidelli Motors';

  if found then
    if v_demo.activo then
      raise exception 'El plan "Fidelli Motors" quedó activo y tenía que salir del catálogo.';
    end if;
    if v_demo.precio_mensual is distinct from 46750 or v_demo.descuento_anual_pct is distinct from 25 then
      raise exception 'El plan "Fidelli Motors" quedó en %/% y producción dice 46750/25.', v_demo.precio_mensual, v_demo.descuento_anual_pct;
    end if;
  end if;

  select precio_mensual into v_modulo from modulos where codigo = 'neumaticos';
  if v_modulo is distinct from 25000 then
    raise exception 'El módulo gomería quedó en % y tenía que quedar en 25000.', v_modulo;
  end if;
end $$;
