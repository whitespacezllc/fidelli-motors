-- ============================================================
-- Fidelli Motors · Planes con control real — Bloque 1A
--
-- Hasta acá `planes` era solo comercial: decía cuánto se cobra, no qué se
-- puede hacer. Este cambio le da al plan un contrato ejecutable:
--
--   · `features` (jsonb booleano) y `limites` (jsonb numérico) en `planes`.
--   · Un override POR TENANT en `lubricentros.plan_overrides`, con tres
--     estados por clave: true habilita, false deshabilita, y la clave
--     AUSENTE cae al plan. El tercer estado es lo que hace al override
--     parcial: habilitarle una función a alguien no lo saca de su plan
--     para todo lo demás.
--   · UNA función de resolución por tipo: plan_permite(feature) y
--     plan_limite(nombre). Las usan las policies de RLS acá, y la capa de
--     aplicación en 1B. Si alguna vez hay dos lugares decidiendo lo mismo,
--     uno de los dos está de más.
--
-- LA REGLA DE ORO DEL GATING: se apaga la ESCRITURA, nunca la lectura.
-- Igual que la suspensión. Por eso todos los chequeos van en WITH CHECK y
-- ninguno en USING: un tenant que baja de plan sigue viendo todo lo que
-- cargó — lo que pierde es el botón de cargar más.
--
-- EL CATÁLOGO DE NOMBRES vive dos veces a propósito y con jerarquía:
-- acá en SQL (feature_plan_valida / limite_plan_valido — la fuente de
-- verdad ejecutable, porque RLS no puede leer TypeScript) y espejado en
-- lib/planes.ts (para que un `plan_permite("mecanika")` no compile).
-- plan_permite REVIENTA con una feature desconocida en vez de devolver
-- false: este proyecto ya vivió el modo de falla del nombre inventado que
-- no falla en build, y un false silencioso es exactamente eso.
--
-- DEFAULT ABIERTO: las columnas nacen con default permisivo, así los
-- planes que ya existen quedan con TODO habilitado y sin tope de
-- sucursales. Ningún tenant existente cambia de plan ni pierde nada.
-- ============================================================


-- ---------- 1 · El catálogo de nombres — la lista canónica ----------
-- Mismo criterio que slug_reservado(): la lista vive en UNA función que
-- evalúan los CHECK y las validaciones. No se copia a otra migración ni a
-- documentación; el espejo de TypeScript es de tipos, no de datos.

create or replace function feature_plan_valida(p_feature text)
returns boolean
language sql
immutable
as $$
  select p_feature = any (array[
    'mecanica',
    'pendientes',
    'premios',
    'presupuestos',
    'personalizacion_pagina',
    'pagina_premium'
  ]);
$$;

create or replace function limite_plan_valido(p_limite text)
returns boolean
language sql
immutable
as $$
  select p_limite = any (array['sucursales']);
$$;

comment on function feature_plan_valida is
  'La lista canónica de features de plan. Espejo tipado en lib/planes.ts: si divergen, gana esta.';
comment on function limite_plan_valido is
  'La lista canónica de límites numéricos de plan. Espejo tipado en lib/planes.ts.';


-- ---------- 2 · Validadores de forma ----------
-- Un CHECK no admite subconsultas, así que el recorrido de claves vive en
-- funciones. Atrapan en el INSERT el typo que el espejo de TypeScript
-- atrapa en el build: dos redes para el mismo error.

create or replace function features_plan_bien_formadas(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is not null
     and jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where not feature_plan_valida(e.key)
          or jsonb_typeof(e.value) <> 'boolean'
     );
$$;

-- En los límites el valor es un entero >= 0, o el null de JSON — que
-- significa "sin límite" y es distinto de la clave ausente solo en que
-- quedó dicho a propósito.
create or replace function limites_plan_bien_formados(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is not null
     and jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where not limite_plan_valido(e.key)
          or (jsonb_typeof(e.value) <> 'null' and e.value::text !~ '^[0-9]+$')
     );
$$;

-- El override mezcla los dos mundos: claves de feature con valor booleano
-- y claves de límite con entero o null. Cualquier otra cosa es un typo.
create or replace function overrides_plan_bien_formados(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is not null
     and jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where not (
         (feature_plan_valida(e.key) and jsonb_typeof(e.value) = 'boolean')
         or
         (limite_plan_valido(e.key)
           and (jsonb_typeof(e.value) = 'null' or e.value::text ~ '^[0-9]+$'))
       )
     );
$$;


-- ---------- 3 · Las columnas ----------
-- El default de `features` es TODO EN TRUE a propósito: es lo que hace que
-- los planes ya existentes queden con todo habilitado sin un update, y que
-- un insert distraído de mañana falle hacia lo permisivo y no hacia dejar
-- a un cliente sin una función que pagó.

alter table planes
  add column features jsonb not null default '{
    "mecanica": true,
    "pendientes": true,
    "premios": true,
    "presupuestos": true,
    "personalizacion_pagina": true,
    "pagina_premium": true
  }'::jsonb,
  add column limites jsonb not null default '{}'::jsonb,
  -- `heredado` y no un reuso de `activo`: activo=false esconde el plan del
  -- wizard PERO TAMBIÉN de /fidelli/precios, y ahí es donde se le ajusta
  -- el precio por IPC a los tenants que lo siguen pagando. Un plan
  -- heredado no se ofrece más, pero se sigue cobrando y editando.
  add column heredado boolean not null default false;

alter table planes
  add constraint features_bien_formadas check (features_plan_bien_formadas(features)),
  add constraint limites_bien_formados  check (limites_plan_bien_formados(limites));

alter table lubricentros
  add column plan_overrides jsonb not null default '{}'::jsonb;

alter table lubricentros
  add constraint plan_overrides_bien_formados
    check (overrides_plan_bien_formados(plan_overrides));


-- ---------- 4 · La auditoría del override ----------
-- Mismo criterio que correcciones_patente: el cambio queda registrado con
-- motivo obligatorio de al menos 10 caracteres, quién y cuándo. Un
-- override sin motivo, seis meses después, es un misterio que nadie se
-- anima a apagar.

create table cambios_override_plan (
  id                uuid primary key default gen_random_uuid(),
  lubricentro_id    uuid not null references lubricentros(id) on delete restrict,
  overrides_antes   jsonb not null,
  overrides_despues jsonb not null,
  motivo            text not null,
  cambiado_por      uuid not null references usuarios(id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);

alter table cambios_override_plan enable row level security;

-- Solo Fidelli: el override es una decisión comercial nuestra, no del owner.
create policy cambios_override_admin on cambios_override_plan
  for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());


-- ---------- 5 · El candado ----------
-- plan_overrides no se toca con un UPDATE suelto: se cambia SOLO por
-- fijar_override_plan(), que valida, registra el motivo y deja el rastro.
-- Mismo patrón que el candado de patente: un GUC transaccional que solo la
-- función oficial enciende. No importa por qué puerta se intente — panel,
-- API con la clave del tenant, un script—, la base lo rechaza igual.

create or replace function bloquear_override_directo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.plan_overrides <> '{}'::jsonb
       and coalesce(current_setting('fidelli.override_de_plan', true), '') <> 'si' then
      raise exception 'override_solo_por_funcion'
        using hint = 'Los overrides de plan se fijan con fijar_override_plan(), que exige motivo y deja registro.';
    end if;
  elsif new.plan_overrides is distinct from old.plan_overrides
     and coalesce(current_setting('fidelli.override_de_plan', true), '') <> 'si' then
    raise exception 'override_solo_por_funcion'
      using hint = 'Los overrides de plan se fijan con fijar_override_plan(), que exige motivo y deja registro.';
  end if;
  return new;
end;
$$;

create trigger candado_override_plan
  before insert or update on lubricentros
  for each row execute function bloquear_override_directo();


-- ---------- 6 · fijar_override_plan — la única puerta ----------
-- SECURITY INVOKER a propósito: el UPDATE de lubricentros y el INSERT del
-- registro se evalúan contra las policies del que llama, así que solo un
-- superadmin puede llegar al final. El chequeo explícito de arriba existe
-- para que el error sea claro y no un rechazo silencioso de RLS.
--
-- Recibe el objeto COMPLETO de overrides y lo reemplaza: pasar '{}' limpia
-- todos. La semántica de "agregame esta clave" es de la UI (1B), no de la
-- base — acá el estado final queda explícito en el registro de auditoría.

create or replace function fijar_override_plan(
  p_lubricentro uuid,
  p_overrides   jsonb,
  p_motivo      text
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede fijar overrides de plan'
      using errcode = '42501';
  end if;

  if p_motivo is null or char_length(trim(p_motivo)) < 10 then
    raise exception 'motivo_corto'
      using hint = 'Contá por qué este tenant sale de su plan: mínimo 10 caracteres. Sin motivo, en seis meses nadie se anima a apagarlo.';
  end if;

  if not overrides_plan_bien_formados(p_overrides) then
    raise exception 'override_invalido'
      using hint = 'Claves válidas: las features del catálogo con true/false, y "sucursales" con un entero o null. Una clave ausente cae al plan.';
  end if;

  select plan_overrides into v_antes
  from lubricentros where id = p_lubricentro
  for update;

  if not found then
    raise exception 'lubricentro_no_existe';
  end if;

  -- El GUC es transaccional (is_local = true): se apaga solo al commit y
  -- nadie puede dejarlo prendido para el próximo UPDATE.
  perform set_config('fidelli.override_de_plan', 'si', true);

  update lubricentros set plan_overrides = p_overrides where id = p_lubricentro;

  insert into cambios_override_plan
    (lubricentro_id, overrides_antes, overrides_despues, motivo, cambiado_por)
  values
    (p_lubricentro, v_antes, p_overrides, trim(p_motivo), auth.uid());
end;
$$;

comment on function fijar_override_plan is
  'La única puerta para cambiar lubricentros.plan_overrides. Reemplaza el objeto completo, exige motivo (>=10) y registra en cambios_override_plan. Security invoker: RLS limita a superadmin.';


-- ---------- 7 · La resolución — una definición, dos capas ----------
-- SECURITY DEFINER por lo mismo que mi_lubricentro_id(): estas funciones
-- se evalúan DENTRO de policies y necesitan leer lubricentros,
-- suscripciones y planes sin recursión de políticas.
--
-- La suscripción vigente es la última por (inicio, created_at) — el mismo
-- criterio que ya usa /panel/cuenta para mostrarla. El ESTADO de la
-- suscripción no apaga features a propósito: cortarle la escritura a un
-- moroso es trabajo de la suspensión (lubricentros.activo), no del plan.

create or replace function plan_permite(p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_valor  jsonb;
begin
  -- Ruidoso a propósito: un false silencioso ante un typo es el mismo
  -- modo de falla que el token inventado de Tailwind.
  if not feature_plan_valida(p_feature) then
    raise exception 'feature_desconocida: %', p_feature
      using hint = 'El catálogo vive en feature_plan_valida() y su espejo en lib/planes.ts.';
  end if;

  v_tenant := mi_lubricentro_id();
  if v_tenant is null then
    -- Sin tenant no hay plan (superadmin entra por su propio bypass en
    -- cada policy; esta rama solo decide fail-closed).
    return false;
  end if;

  -- 1 · el override del tenant, si la clave está
  select plan_overrides -> p_feature into v_valor
  from lubricentros where id = v_tenant;

  if jsonb_typeof(v_valor) = 'boolean' then
    return v_valor = 'true'::jsonb;
  end if;

  -- 2 · el plan de la suscripción vigente
  select p.features -> p_feature into v_valor
  from suscripciones s
  join planes p on p.id = s.plan_id
  where s.lubricentro_id = v_tenant
  order by s.inicio desc, s.created_at desc
  limit 1;

  if jsonb_typeof(v_valor) = 'boolean' then
    return v_valor = 'true'::jsonb;
  end if;

  -- 3 · sin dato — tenant sin suscripción o plan sin la clave — cerrado.
  return false;
end;
$$;

create or replace function plan_limite(p_limite text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_json   jsonb;
begin
  if not limite_plan_valido(p_limite) then
    raise exception 'limite_desconocido: %', p_limite
      using hint = 'El catálogo vive en limite_plan_valido() y su espejo en lib/planes.ts.';
  end if;

  v_tenant := mi_lubricentro_id();
  if v_tenant is null then
    return null; -- sin tenant no hay tope que aplicar
  end if;

  -- 1 · el override: número → ese tope; null de JSON → sin límite
  select plan_overrides into v_json from lubricentros where id = v_tenant;
  if v_json ? p_limite then
    if jsonb_typeof(v_json -> p_limite) = 'number' then
      return (v_json ->> p_limite)::integer;
    end if;
    return null;
  end if;

  -- 2 · el plan vigente, con la misma lectura de tres estados
  select p.limites into v_json
  from suscripciones s
  join planes p on p.id = s.plan_id
  where s.lubricentro_id = v_tenant
  order by s.inicio desc, s.created_at desc
  limit 1;

  if v_json ? p_limite then
    if jsonb_typeof(v_json -> p_limite) = 'number' then
      return (v_json ->> p_limite)::integer;
    end if;
    return null;
  end if;

  -- 3 · clave ausente en todos lados: sin límite (default abierto)
  return null;
end;
$$;

comment on function plan_permite is
  'Resuelve una feature para el tenant del que llama: override del tenant → plan de la suscripción vigente → false. Revienta con feature desconocida. La usan las policies y, en 1B, sesionParaEscribir().';
comment on function plan_limite is
  'Resuelve un límite numérico igual que plan_permite. NULL significa sin límite, en el plan y en el override.';

-- El conteo para el límite de sucursales. SECURITY DEFINER porque se
-- evalúa dentro de la policy de sucursales y contar sucursales desde su
-- propia policy con el RLS del que llama sería recursión infinita.
create or replace function sucursales_dentro_del_limite(
  p_lubricentro uuid,
  p_sucursal    uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Se excluye a la propia fila para que editar una sucursal ACTIVA
  -- estando justo en el tope no cuente como agregar una. count < null da
  -- null, y el coalesce lo vuelve true: sin límite.
  select coalesce(
    (select count(*)
       from sucursales
      where lubricentro_id = p_lubricentro
        and activa
        and id is distinct from p_sucursal)
    < plan_limite('sucursales'),
    true
  );
$$;


-- ---------- 8 · Permisos de las funciones nuevas ----------
-- El default del schema ya les da EXECUTE a authenticated y nada a public
-- (revocado en 20260724221336). Los revokes explícitos de anon son
-- cinturón: ninguna de estas tiene sentido sin sesión.

revoke all on function plan_permite(text)                          from public, anon;
revoke all on function plan_limite(text)                           from public, anon;
revoke all on function sucursales_dentro_del_limite(uuid, uuid)    from public, anon;
revoke all on function fijar_override_plan(uuid, jsonb, text)      from public, anon;

grant execute on function plan_permite(text)                       to authenticated, service_role;
grant execute on function plan_limite(text)                        to authenticated, service_role;
grant execute on function sucursales_dentro_del_limite(uuid, uuid) to authenticated, service_role;
grant execute on function fijar_override_plan(uuid, jsonb, text)   to authenticated, service_role;


-- ---------- 9 · Las policies — el gating de verdad ----------
-- Solo WITH CHECK: la lectura no se toca (regla de oro). El precedente es
-- la regla de 24 horas, que ya mete lógica de negocio en una policy.
-- guardar_service y actualizar_service son SECURITY INVOKER declarado, así
-- que estos chequeos también rigen adentro de ellas — el canje de un
-- premio con la feature apagada muere acá, sin tocar la función.
--
-- Sobre las tablas que hoy existen: premios y canjes ← 'premios';
-- config_experiencia ← 'personalizacion_pagina'; sucursales ← el límite.
-- mecanica / pendientes / presupuestos / pagina_premium no tienen tabla
-- todavía: sus policies nacen EN la migración que cree esas tablas,
-- llamando a esta misma función.

alter policy premios_tenant on premios
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('premios'))
    or soy_superadmin()
  );

alter policy canjes_tenant on canjes
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('premios'))
    or soy_superadmin()
  );

alter policy config_tenant on config_experiencia
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('personalizacion_pagina'))
    or soy_superadmin()
  );

-- Desactivar (activa = false) queda siempre libre: reduce el uso, nunca lo
-- aumenta. Lo que el límite gobierna es sumar capacidad: crear una activa
-- o reactivar una que estaba de baja.
alter policy sucursales_tenant on sucursales
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (not activa or sucursales_dentro_del_limite(lubricentro_id, id)))
    or soy_superadmin()
  );


-- ---------- 10 · Los datos ----------
-- Primero: todo lo que existía pasa a heredado. Sus features ya quedaron
-- en todo-true por el default de la columna y sus límites en {} (sin
-- tope), así que ningún tenant existente pierde nada ni cambia de plan.
-- Siguen activos a propósito: /fidelli/precios los tiene que seguir
-- mostrando para el ajuste por IPC.

update planes set heredado = true;

-- Después, los tres vigentes. PRECIO EN 0 A PROPÓSITO: el prompt del
-- bloque definió features y límites, no precios, e inventar una cifra acá
-- sería peor que un 0 evidente. Se cargan desde /fidelli/precios antes de
-- asignar el primer tenant — el 0 es la señal de "falta decidir".
insert into planes (nombre, precio_mensual, heredado, features, limites) values
  (
    'Basic', 0, false,
    '{"mecanica": false, "pendientes": false, "premios": false,
      "presupuestos": false, "personalizacion_pagina": false,
      "pagina_premium": false}'::jsonb,
    '{"sucursales": 1}'::jsonb
  ),
  (
    'Pro', 0, false,
    '{"mecanica": true, "pendientes": true, "premios": true,
      "presupuestos": true, "personalizacion_pagina": true,
      "pagina_premium": false}'::jsonb,
    '{"sucursales": 3}'::jsonb
  ),
  (
    'Ultra', 0, false,
    '{"mecanica": true, "pendientes": true, "premios": true,
      "presupuestos": true, "personalizacion_pagina": true,
      "pagina_premium": true}'::jsonb,
    '{"sucursales": null}'::jsonb
  );

comment on column planes.features is
  'Qué habilita el plan. Claves = feature_plan_valida(). Ausente = false. Se resuelve SOLO vía plan_permite().';
comment on column planes.limites is
  'Topes numéricos. Claves = limite_plan_valido(). null o ausente = sin límite. Se resuelve SOLO vía plan_limite().';
comment on column planes.heredado is
  'true = plan viejo: se sigue cobrando y editando en /fidelli/precios, pero el wizard de alta no lo ofrece más.';
comment on column lubricentros.plan_overrides is
  'Excepciones por tenant que pisan al plan. Tres estados por clave: true / false / ausente (cae al plan). Se cambia SOLO con fijar_override_plan().';
