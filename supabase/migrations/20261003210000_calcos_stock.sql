-- ════════════════════════════════════════════════════════════════════
-- EL STOCK DE CALCOS Y EL AVISO · PR 3 del sprint de calcos
-- (docs/PROMPT-calcos.md, sección 4b)
--
-- Cuántas calcos le quedan a un lubricentro NO SE GUARDA: SE CALCULA. Mismo
-- criterio que `estado_cobranza`: un contador que alguien tiene que mantener
-- al día se desincroniza el primer día que nadie lo mira.
--
-- LA REGLA QUE MANDA: el calco se gasta por AUTO NUEVO, no por trabajo. Se
-- pega una vez en el parasol; el auto que vuelve ya lo tiene. Consumo =
-- vehículos cuyo PRIMER trabajo no importado y no anulado (por
-- `services.created_at`) es posterior a la primera entrega del libro
-- (`pedidos_calcos`). Para un tenant con historia importada, cada auto
-- importado que vuelve es «nuevo» para esta cuenta: no tiene calco.
--
-- LAS PIEZAS:
--
--   1 · `lubricentros.calcos_propias` — los que imprimen por su cuenta.
--       Lo mueve solo el superadmin, por `marcar_calcos_propias()`, con
--       nota y con evento. Con el switch prendido no hay estimación, ni
--       aviso, ni mail, ni lista.
--   2 · `recuentos_calcos` — «¿Cuántas te quedan? Contá y corregí.» El
--       dueño declara por `declarar_recuento_calcos()` y la cuenta parte
--       de ahí. Append-only, tres candados.
--   3 · `stock_calcos(lubricentro)` — LA CUENTA: entregadas, consumidas,
--       stock, ritmo (autos nuevos por semana, últimas 8 semanas),
--       cobertura en semanas y la fecha del recuento que hace de base.
--       Null en todo sin entregas o con `calcos_propias`.
--   4 · `aviso_calcos(lubricentro)` — ¿hay que avisarle hoy? Es la consulta
--       del Inicio del panel. Los umbrales viven en UNA función
--       (`nivel_de_aviso_calcos`) que también usa la decisión de los mails:
--       el mail es la voz del panel, entregada.
--   5 · `emails_calcos` + `avisos_calcos_pendientes()` — los dos mails, por
--       el cron de las 9:00 (el de los avisos de cobranza). Un mail por
--       escalón por CICLO DE ENTREGA: `entrega_ref` es la última fila del
--       libro, así una entrega nueva habilita los dos otra vez.
--   6 · `calcos_por_agotarse()` y `resumen_admin().calcos.sin_stock` — la
--       lista que Grego llama y su alerta en el hub.
--
-- CUÁNDO PASÓ UNA ENTREGA (`momento_de_entrega_calcos`). El libro tiene
-- `fecha` (el día de la entrega) y `created_at` (cuándo se cargó la fila),
-- y no siempre coinciden: el backfill de los tenants viejos tiene `fecha` =
-- el día del alta y `created_at` = el día de la migración, y una corrección
-- del libro se carga hoy con la fecha de hace un mes. Manda LA FECHA. Y
-- cuando la fila se cargó el mismo día de la entrega (lo que hace
-- «Entregado»), se usa la hora exacta: un recuento a las 10 y una entrega
-- a las 15 del mismo día no pueden dar la entrega por contada.
--
-- QUIÉN NO RECIBE NADA, NUNCA: el que imprime por su cuenta, el que no
-- tiene ninguna entrega en el libro, el que tiene un pedido abierto (ya
-- pidió), y —para los mails y la lista del hub— el suspendido (no puede
-- pedir) y el demo.
--
-- ⚠ SERVICE ROLE Y NADIE MÁS para `avisos_calcos_pendientes()`: cruza
-- usuarios, pedidos y trabajos de TODOS los tenants. La lista del hub es
-- del superadmin. El stock y el aviso los lee el dueño, pero solo los de
-- SU lubricentro: el argumento se compara con el tenant de la sesión.
--
-- ⚠ LAS LÍNEAS MARCADAS `-- @algo` Y LOS MARCADORES `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: los muerde el `sed` de
-- `scripts/regresion-calcos.sh`. Y `resumen_admin()` vive desde hoy EN
-- ESTE ARCHIVO: las roturas que la muerden (R32g, R39f, R40j, R41g) la
-- sacan de acá.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · Los que imprimen por su cuenta
-- ════════════════════════════════════════════════════════════════════

alter table lubricentros add column calcos_propias boolean not null default false;

comment on column lubricentros.calcos_propias is
  'El lubricentro imprime sus calcos con una gráfica propia (20261003210000). Lo prende solo el superadmin, por marcar_calcos_propias(), con nota. Con true: stock_calcos() da null, no hay aviso ni mail ni lista del hub, y Mi cuenta → Calcos ofrece descargar el archivo de impresión.';

-- No es una preferencia del tenant: se la prendemos nosotros cuando nos lo
-- dice. El owner no puede escribir `lubricentros` (no tiene policy de
-- update); el candado es para lo demás: que el switch no se mueva nunca
-- sin su nota y su evento, tampoco por un UPDATE suelto del superadmin.

-- >>> bloquear_calcos_propias_directo
create or replace function bloquear_calcos_propias_directo()
returns trigger
language plpgsql
as $$
begin
  if new.calcos_propias is distinct from old.calcos_propias              -- @candado_calcos_propias
     and coalesce(current_setting('fidelli.calcos_propias', true), '') <> 'si'
  then
    raise exception 'calcos_propias_solo_por_funcion'
      using hint = 'Quién imprime sus calcos por su cuenta se marca con marcar_calcos_propias(), que exige una nota y deja el evento en el historial del lubricentro.';
  end if;
  return new;
end;
$$;
-- <<< bloquear_calcos_propias_directo

create trigger candado_calcos_propias
  before update of calcos_propias on lubricentros
  for each row execute function bloquear_calcos_propias_directo();

alter table lubricentros enable always trigger candado_calcos_propias;

-- >>> marcar_calcos_propias
create or replace function marcar_calcos_propias(
  p_lubricentro_id uuid,
  p_propias        boolean,
  p_nota           text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_antes boolean;
begin
  if not soy_superadmin() then                                            -- @guarda_propias
    raise exception 'Solo el equipo Fidelli marca quién imprime sus calcos por su cuenta'
      using errcode = '42501';
  end if;
  if p_propias is null then
    raise exception 'valor_invalido' using hint = 'Decí si imprime por su cuenta o no.';
  end if;
  if p_nota is null or char_length(trim(p_nota)) < 10 then                -- @nota_propias
    raise exception 'nota_corta'
      using hint = 'Contá por qué: quién lo pidió, con qué gráfica imprime. Mínimo 10 caracteres.';
  end if;

  select l.calcos_propias into v_antes
  from lubricentros l where l.id = p_lubricentro_id
  for update;
  if not found then
    raise exception 'no_existe' using hint = 'Ese lubricentro no existe.';
  end if;

  -- Un guardado que no cambia nada no se registra.
  if v_antes = p_propias then                                             -- @propias_sin_cambio
    return;
  end if;

  -- La bandera se prende para ESTE update y se apaga enseguida: en una
  -- transacción larga, la escritura siguiente no hereda el permiso.
  perform set_config('fidelli.calcos_propias', 'si', true);
  update lubricentros set calcos_propias = p_propias where id = p_lubricentro_id;
  perform set_config('fidelli.calcos_propias', '', true);                 -- @apagar_bandera_propias

  -- El rastro, en el historial del tenant: antes, después, la nota y quién.
  perform emitir_evento_tenant(p_lubricentro_id, 'edicion',               -- @evento_propias
    jsonb_build_object('calcos_propias', v_antes),
    jsonb_build_object('calcos_propias', p_propias),
    trim(p_nota), 'admin', now(), auth.uid());
end;
$$;
-- <<< marcar_calcos_propias

comment on function marcar_calcos_propias is
  'Marca (o desmarca) que un lubricentro imprime sus calcos por su cuenta (20261003210000). Solo superadmin, con nota de 10 caracteres o más. Deja un evento `edicion` en tenant_eventos con el antes, el después, la nota y el autor. Marcar lo que ya estaba no hace nada.';


-- ════════════════════════════════════════════════════════════════════
-- 2 · El recuento: «¿Cuántas te quedan? Contá y corregí.»
-- ════════════════════════════════════════════════════════════════════

create table recuentos_calcos (
  id              uuid primary key default gen_random_uuid(),
  -- cascade + candado condicional, como pedidos_calcos: la fila no se
  -- borra mientras el tenant exista; solo se va con él.
  lubricentro_id  uuid not null references lubricentros(id) on delete cascade,
  cantidad        integer not null check (cantidad >= 0),
  -- El owner que contó. Null solo en una carga hecha por nosotros.
  declarado_por   uuid references usuarios(id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index recuentos_calcos_tenant on recuentos_calcos (lubricentro_id, created_at desc);

comment on table recuentos_calcos is
  'Lo que el dueño contó que le queda (20261003210000). Append-only con tres candados. El recuento más nuevo es la base de stock_calcos(): cantidad declarada, más lo entregado después, menos los autos nuevos de después.';

-- ---------- Los tres candados ----------

-- >>> bloquear_edicion_de_recuento
create or replace function bloquear_edicion_de_recuento()
returns trigger
language plpgsql
as $$
begin
  raise exception 'recuento_no_se_edita'                                  -- @candado_edicion_recuento
    using hint = 'Un recuento es lo que el dueño contó ese día. Si contó mal, declara otro: el más nuevo es el que vale.';
  return old;
end;
$$;
-- <<< bloquear_edicion_de_recuento

-- >>> bloquear_borrado_de_recuento
create or replace function bloquear_borrado_de_recuento()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from lubricentros where id = old.lubricentro_id) then   -- @candado_borrado_recuento
    raise exception 'recuento_no_se_borra'
      using hint = 'Los recuentos no se borran mientras el lubricentro exista: borrar el último le cambia el stock sin que nadie lo haya contado.';
  end if;
  return old;
end;
$$;
-- <<< bloquear_borrado_de_recuento

-- >>> bloquear_purga_de_recuentos
create or replace function bloquear_purga_de_recuentos()
returns trigger
language plpgsql
as $$
begin
  raise exception 'recuentos_no_se_vacian'                                -- @candado_purga_recuento
    using hint = 'Si necesitás una base limpia para probar, usá supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_recuentos

create trigger candado_edicion_recuento
  before update on recuentos_calcos
  for each row execute function bloquear_edicion_de_recuento();
create trigger candado_borrado_recuento
  before delete on recuentos_calcos
  for each row execute function bloquear_borrado_de_recuento();
create trigger candado_purga_recuentos
  before truncate on recuentos_calcos
  for each statement execute function bloquear_purga_de_recuentos();

alter table recuentos_calcos enable always trigger candado_edicion_recuento;
alter table recuentos_calcos enable always trigger candado_borrado_recuento;
alter table recuentos_calcos enable always trigger candado_purga_recuentos;

-- ---------- RLS: el dueño lee los suyos; escribe la puerta ----------
alter table recuentos_calcos enable row level security;

create policy recuentos_calcos_lectura on recuentos_calcos
  for select to authenticated
  using (soy_superadmin() or lubricentro_id = mi_lubricentro_id());

revoke all on recuentos_calcos from public, anon, authenticated;
grant select on recuentos_calcos to authenticated;
grant all on recuentos_calcos to service_role;

-- ---------- La puerta ----------
-- Sin argumento de tenant: el lubricentro es el de la sesión.

-- >>> declarar_recuento_calcos
create or replace function declarar_recuento_calcos(p_cantidad integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lub uuid := mi_lubricentro_id();                                      -- @tenant_de_la_sesion
  v_id  uuid;
begin
  if v_lub is null then                                                   -- @guarda_recuento
    raise exception 'Solo el lubricentro declara cuántas calcos le quedan'
      using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad < 0 or p_cantidad > 100000 then     -- @cantidad_recuento
    raise exception 'cantidad_invalida'
      using hint = 'Escribí cuántas calcos te quedan: un número de 0 para arriba.';
  end if;
  if not exists (select 1 from pedidos_calcos pc where pc.lubricentro_id = v_lub) then   -- @recuento_sin_entregas
    raise exception 'sin_entregas'
      using hint = 'Todavía no te entregamos calcos: no hay nada que contar.';
  end if;

  insert into recuentos_calcos (lubricentro_id, cantidad, declarado_por)
  values (v_lub, p_cantidad, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
-- <<< declarar_recuento_calcos

comment on function declarar_recuento_calcos is
  'El dueño declara cuántas calcos le quedan (20261003210000). El lubricentro sale de la sesión, nunca de un argumento. Desde ese momento stock_calcos() parte de esa cantidad.';


-- ════════════════════════════════════════════════════════════════════
-- 3 · La cuenta
-- ════════════════════════════════════════════════════════════════════

-- Cuándo pasó una entrega. Ver el encabezado.
-- >>> momento_de_entrega_calcos
create or replace function momento_de_entrega_calcos(p_fecha date, p_created_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_fecha >= (p_created_at at time zone 'America/Argentina/Buenos_Aires')::date   -- @entrega_del_dia
      then p_created_at
    else p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires'               -- @entrega_por_fecha
  end;
$$;
-- <<< momento_de_entrega_calcos

-- >>> stock_calcos
create or replace function stock_calcos(p_lubricentro_id uuid)
returns table (
  entregadas        integer,
  consumidas        integer,
  stock_estimado    integer,
  ritmo_semanal     numeric,
  semanas_cobertura numeric,
  base_recuento_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entregadas integer;
  v_propias    boolean;
  v_primera    timestamptz;   -- el momento de la primera entrega del libro
  v_rec_at     timestamptz;   -- el recuento más nuevo
  v_rec_cant   integer;
  v_consumidas integer;
  v_desde      timestamptz;   -- el primer trabajo no importado del tenant
  v_nuevos     integer;       -- autos nuevos en las últimas 8 semanas
  v_dias       numeric;
  v_ritmo      numeric;
  v_stock      integer;
begin
  -- El superadmin, la clave de servicio (sin usuario) o el propio tenant.
  -- El coalesce no es de adorno: un usuario sin tenant compara contra null,
  -- y `not (… or null)` es null, que un `if` deja pasar.
  if not (soy_superadmin()                                                -- @guarda_stock
          or auth.uid() is null
          or coalesce(p_lubricentro_id = mi_lubricentro_id(), false)) then   -- @sin_tenant_no_pasa
    raise exception 'Ese lubricentro no es el tuyo' using errcode = '42501';
  end if;

  select l.calcos_entregadas, l.calcos_propias into v_entregadas, v_propias
  from lubricentros l where l.id = p_lubricentro_id;

  select min(momento_de_entrega_calcos(pc.fecha, pc.created_at)) into v_primera
  from pedidos_calcos pc
  where pc.lubricentro_id = p_lubricentro_id;

  -- Sin ninguna entrega no hay nada que estimar; y al que imprime por su
  -- cuenta no le sabemos el stock. Null en todo.
  if v_primera is null                                                    -- @sin_entregas
     or coalesce(v_propias, false) then                                   -- @propias_sin_estimacion
    return query select null::integer, null::integer, null::integer,
                        null::numeric, null::numeric, null::timestamptz;
    return;
  end if;

  select rc.created_at, rc.cantidad into v_rec_at, v_rec_cant
  from recuentos_calcos rc
  where rc.lubricentro_id = p_lubricentro_id
  order by rc.created_at desc                                             -- @recuento_mas_nuevo
  limit 1;

  -- El primer trabajo de cada auto: el más viejo que NO es importado y NO
  -- está anulado, por created_at.
  with primeros as (
    select min(s.created_at) as primero
    from services s
    where s.lubricentro_id = p_lubricentro_id
      and s.importado_de is null                                          -- @sin_importados
      and not s.anulado                                                   -- @sin_anulados
    group by s.vehiculo_id                                                -- @por_auto
  )
  select
    count(*) filter (where case
      when v_rec_at is not null then p.primero > v_rec_at                 -- @desde_el_recuento
      else p.primero >= v_primera end),                                   -- @desde_la_entrega
    min(p.primero),
    count(*) filter (where p.primero >= now() - interval '56 days')       -- @ocho_semanas
    into v_consumidas, v_desde, v_nuevos
  from primeros p;

  -- El ritmo: autos nuevos por semana sobre las últimas 8 semanas, o sobre
  -- la historia que haya si es menos. Con menos de 2 semanas no se dice
  -- nada: diez días no alcanzan para prometerle a nadie cuántas le quedan.
  if v_desde is not null then
    v_dias := extract(epoch from (now() - v_desde)) / 86400.0;
    if v_dias >= 14 then                                                  -- @dos_semanas
      v_ritmo := v_nuevos / (least(v_dias, 56) / 7.0);                    -- @ventana_real
    end if;
  end if;

  if v_rec_at is not null then
    -- Con recuento, la cuenta parte de ahí: lo declarado, más lo que se
    -- entregó después, menos los autos nuevos de después.
    v_stock := v_rec_cant                                                 -- @base_recuento
      + coalesce((select sum(pc.cantidad)
                    from pedidos_calcos pc
                   where pc.lubricentro_id = p_lubricentro_id
                     and momento_de_entrega_calcos(pc.fecha, pc.created_at) > v_rec_at), 0)   -- @entregas_tras_recuento
      - v_consumidas;
  else
    v_stock := v_entregadas - v_consumidas;
  end if;
  v_stock := greatest(v_stock, 0);                                        -- @nunca_negativo

  return query select
    v_entregadas,
    v_consumidas,
    v_stock,
    round(v_ritmo, 1),
    case when v_ritmo > 0 then round(v_stock / v_ritmo, 1) end,           -- @cobertura
    v_rec_at;
end;
$$;
-- <<< stock_calcos

comment on function stock_calcos is
  'Cuántas calcos le quedan a un lubricentro, CALCULADO (20261003210000): entregadas (el contador del libro), consumidas (autos cuyo primer trabajo no importado y no anulado es posterior a la base), stock (nunca negativo), ritmo (autos nuevos por semana, últimas 8 semanas; null con menos de 2 de historia), cobertura en semanas (null sin ritmo) y la fecha del recuento que hace de base. Null en todo sin entregas o con calcos_propias. La lee el superadmin, la clave de servicio y el tenant, solo el suyo.';


-- ════════════════════════════════════════════════════════════════════
-- 4 · El aviso
-- ════════════════════════════════════════════════════════════════════

-- Un pedido abierto: el dueño ya pidió. Una sola lista de estados para el
-- aviso del Inicio, los mails y la lista del hub.
-- >>> tiene_encargo_calcos_abierto
create or replace function tiene_encargo_calcos_abierto(p_lubricentro_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from encargos_calcos e
    where e.lubricentro_id = p_lubricentro_id
      and e.estado in ('pendiente_pago', 'pagado', 'en_produccion', 'enviado', 'listo_retiro'));   -- @estados_abiertos
$$;
-- <<< tiene_encargo_calcos_abierto

-- Los umbrales, en un solo lugar. Los dos escalones del brief: «al cruzar
-- las 4 semanas» y «al cruzar 1 semana o 20 calcos».
-- >>> nivel_de_aviso_calcos
create or replace function nivel_de_aviso_calcos(p_stock integer, p_semanas numeric)
returns text
language sql
immutable
as $$
  select case
    when p_stock is null then null
    when p_semanas < 1                                                    -- @una_semana
      or p_stock <= 20 then 'calcos_1_semana'                             -- @veinte_calcos
    when p_semanas < 4 then 'calcos_4_semanas'                            -- @cuatro_semanas
  end;
$$;
-- <<< nivel_de_aviso_calcos

-- Cero o una fila. La guarda es la de stock_calcos(): el tenant lee el
-- suyo y ninguno más.
-- >>> aviso_calcos
create or replace function aviso_calcos(p_lubricentro_id uuid)
returns table (
  nivel             text,
  stock_estimado    integer,
  semanas_cobertura numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select n.nivel, s.stock_estimado, s.semanas_cobertura
  from stock_calcos(p_lubricentro_id) s
  cross join lateral (
    select nivel_de_aviso_calcos(s.stock_estimado, s.semanas_cobertura) as nivel
  ) n
  where n.nivel is not null
    and not tiene_encargo_calcos_abierto(p_lubricentro_id);               -- @aviso_sin_encargo
$$;
-- <<< aviso_calcos

comment on function aviso_calcos is
  '¿Hay que avisarle hoy a este lubricentro que se queda sin calcos? Cero o una fila: el nivel (calcos_4_semanas con menos de 4 semanas de cobertura; calcos_1_semana con menos de 1 semana o 20 calcos o menos), el stock y la cobertura. Nunca con un pedido abierto. Es la consulta del aviso del Inicio; los mails usan los mismos umbrales.';


-- ════════════════════════════════════════════════════════════════════
-- 5 · Los dos mails
-- ════════════════════════════════════════════════════════════════════

create table emails_calcos (
  id                uuid primary key default gen_random_uuid(),
  lubricentro_id    uuid not null references lubricentros(id) on delete restrict,
  tipo              text not null check (tipo in ('calcos_4_semanas', 'calcos_1_semana')),
  -- El ciclo: la última fila del libro al momento de mandarlo. Una entrega
  -- nueva habilita los dos escalones otra vez. SIN FK, a propósito: una
  -- referencia hacia pedidos_calcos rompe la prueba del candado de purga
  -- del libro (R33f), igual que en encargos_calcos.pedido_calcos_id.
  entrega_ref       uuid not null,
  destinatario      text not null,
  resend_id         text,
  -- Lo que se le dijo: la foto de la cuenta ese día.
  stock_estimado    integer,
  semanas_cobertura numeric,
  enviado_at        timestamptz not null default now(),
  unique (lubricentro_id, tipo, entrega_ref)
);

comment on table emails_calcos is
  'Los mails de «te quedás sin calcos» que SE MANDARON (20261003210000): uno por (tenant, escalón, ciclo de entrega). Se inserta después de que Resend confirma, con su id. Tres candados (borrado, edición, truncate): borrar una fila hace que el cron mande el mismo mail mañana.';

create index emails_calcos_lubricentro_idx on emails_calcos (lubricentro_id, enviado_at desc);

alter table emails_calcos enable row level security;

-- Lee el superadmin. Nadie escribe por PostgREST: escribe el cron con la
-- clave de servicio.
create policy emails_calcos_superadmin on emails_calcos
  for select to authenticated
  using (soy_superadmin());

revoke all on emails_calcos from public, anon, authenticated;
grant select on emails_calcos to authenticated;
grant all on emails_calcos to service_role;

-- ---------- Los tres candados, calcados de emails_cobranza ----------

-- >>> bloquear_borrado_de_email_calcos
create or replace function bloquear_borrado_de_email_calcos()
returns trigger
language plpgsql
as $$
begin
  raise exception 'email_calcos_no_se_borra'                              -- @candado_borrado_email_calcos
    using hint = 'emails_calcos es la constancia de que se avisó: uno por escalón por ciclo de entrega. Borrar la fila hace que el cron vuelva a mandar el mismo mail mañana. Para una base limpia, supabase db reset.';
  return old;
end;
$$;
-- <<< bloquear_borrado_de_email_calcos

-- >>> bloquear_edicion_de_email_calcos
create or replace function bloquear_edicion_de_email_calcos()
returns trigger
language plpgsql
as $$
begin
  if new is distinct from old then                                        -- @candado_edicion_email_calcos
    raise exception 'email_calcos_no_se_edita'
      using hint = 'Una fila de emails_calcos no se corrige: es lo que se mandó, a quién y cuándo.';
  end if;
  return new;
end;
$$;
-- <<< bloquear_edicion_de_email_calcos

-- >>> bloquear_purga_de_emails_calcos
create or replace function bloquear_purga_de_emails_calcos()
returns trigger
language plpgsql
as $$
begin
  raise exception 'emails_calcos_no_se_vacian'                            -- @candado_purga_email_calcos
    using hint = 'Un truncate sobre emails_calcos vuelve a mandar los dos mails de este ciclo a todos los tenants en la próxima corrida del cron. Para una base limpia, supabase db reset.';
  return null;
end;
$$;
-- <<< bloquear_purga_de_emails_calcos

create trigger candado_borrado_email_calcos
  before delete on emails_calcos
  for each row execute function bloquear_borrado_de_email_calcos();
create trigger candado_edicion_email_calcos
  before update on emails_calcos
  for each row execute function bloquear_edicion_de_email_calcos();
create trigger candado_purga_emails_calcos
  before truncate on emails_calcos
  for each statement execute function bloquear_purga_de_emails_calcos();

alter table emails_calcos enable always trigger candado_borrado_email_calcos;
alter table emails_calcos enable always trigger candado_edicion_email_calcos;
alter table emails_calcos enable always trigger candado_purga_emails_calcos;

-- ---------- La decisión ----------
-- Por tenant, el mail MÁS AVANZADO que corresponde hoy y no se mandó en
-- este ciclo de entrega. Umbrales, no igualdades: un día en que el cron no
-- corrió no pierde el aviso. Y si el de 1 semana ya se mandó, no se cae al
-- de 4: después del segundo no hay primero.

-- >>> avisos_calcos_pendientes
create or replace function avisos_calcos_pendientes()
returns table (
  lubricentro_id    uuid,
  slug              text,
  nombre            text,
  tipo              text,
  entrega_ref       uuid,
  destinatario      text,
  stock_estimado    integer,
  semanas_cobertura numeric,
  ritmo_semanal     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with candidatos as (
    select l.id, l.slug, l.nombre,
           s.stock_estimado, s.semanas_cobertura, s.ritmo_semanal,
           nivel_de_aviso_calcos(s.stock_estimado, s.semanas_cobertura) as tipo,
           -- El ciclo: la última entrega del libro, por su fecha.
           (select pc.id from pedidos_calcos pc
             where pc.lubricentro_id = l.id
             order by pc.fecha desc, pc.created_at desc, pc.id                -- @ultima_entrega
             limit 1) as entrega_ref
    from lubricentros l
    cross join lateral stock_calcos(l.id) s
    where es_activo(l)                                                    -- @mail_sin_suspendidos
      and l.slug <> 'demo'                                                -- @mail_sin_demo
  )
  select
    c.id, c.slug, c.nombre, c.tipo, c.entrega_ref,
    (select u.email from usuarios u
      where u.lubricentro_id = c.id and u.rol = 'owner'
      order by u.created_at limit 1),
    c.stock_estimado, c.semanas_cobertura, c.ritmo_semanal
  from candidatos c
  where c.tipo is not null
    and not tiene_encargo_calcos_abierto(c.id)                            -- @mail_sin_encargo
    and not exists (
      select 1 from emails_calcos e
       where e.lubricentro_id = c.id
         and e.entrega_ref = c.entrega_ref                                -- @mail_por_ciclo
         and (e.tipo = c.tipo                                             -- @mail_enviado
              or e.tipo = 'calcos_1_semana'))                             -- @no_cae_al_anterior
  order by c.slug;
$$;
-- <<< avisos_calcos_pendientes

comment on function avisos_calcos_pendientes is
  'Por tenant, el mail de calcos MÁS AVANZADO que corresponde hoy y no se mandó en este ciclo de entrega (calcos_4_semanas: menos de 4 semanas · calcos_1_semana: menos de 1 semana o 20 calcos o menos). Excluye al que imprime por su cuenta, al que no tiene entregas, al que tiene un pedido abierto, al suspendido y al demo. Solo service_role.';


-- ════════════════════════════════════════════════════════════════════
-- 6 · La lista del hub
-- ════════════════════════════════════════════════════════════════════

-- >>> calcos_por_agotarse
create or replace function calcos_por_agotarse()
returns table (
  lubricentro_id    uuid,
  nombre            text,
  slug              text,
  stock_estimado    integer,
  ritmo_semanal     numeric,
  semanas_cobertura numeric,
  base_recuento_at  timestamptz,
  telefono          text,
  owner_nombre      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not soy_superadmin() then                                            -- @guarda_lista
    raise exception 'Solo el equipo Fidelli ve quién se queda sin calcos'
      using errcode = '42501';
  end if;

  return query
  select l.id, l.nombre::text, l.slug::text,
         s.stock_estimado, s.ritmo_semanal, s.semanas_cobertura, s.base_recuento_at,
         telefono_de_contacto(l.id),
         (select u.nombre::text from usuarios u
           where u.lubricentro_id = l.id and u.rol = 'owner'
           order by u.created_at limit 1)
  from lubricentros l
  cross join lateral stock_calcos(l.id) s
  where es_activo(l)                                                      -- @lista_sin_suspendidos
    and l.slug <> 'demo'                                                  -- @lista_sin_demo
    and s.semanas_cobertura < 3                                           -- @tres_semanas
    and not tiene_encargo_calcos_abierto(l.id)                            -- @lista_sin_encargo
  order by s.semanas_cobertura, l.nombre;
end;
$$;
-- <<< calcos_por_agotarse

comment on function calcos_por_agotarse is
  'Los lubricentros que se quedan sin calcos en menos de 3 semanas y no tienen un pedido abierto (20261003210000), con el stock, el ritmo, la cobertura, el teléfono de contacto y el nombre del owner. Es la lista de arriba de /fidelli/calcos y lo que cuenta resumen_admin().calcos.sin_stock. Solo superadmin.';


-- ---------- resumen_admin() gana `calcos.sin_stock` ----------
-- Textual de 20261003200000, con una clave más adentro de `calcos`.

-- >>> resumen_admin
create or replace function resumen_admin()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_mes         date := date_trunc('month', current_date)::date;
  v_mes_ant     date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_fin_mes_ant date := date_trunc('month', current_date)::date - 1;
  v_mrr         numeric;
  v_tc          tipo_cambio;
  v_snap        snapshots_diarios;
  v_atencion    integer;
begin
  if not soy_superadmin() then
    raise exception 'Solo el equipo Fidelli puede ver el resumen'
      using errcode = '42501';
  end if;

  v_mrr := mrr_plataforma();
  v_tc  := tc_vigente(current_date);
  select * into v_snap from snapshots_diarios where fecha = v_fin_mes_ant;

  select count(*) into v_atencion
  from lubricentros l
  left join lateral (
    select s.estado, s.vencimiento, s.descuento_pct
    from suscripciones s
    where s.lubricentro_id = l.id
    order by s.inicio desc, s.created_at desc
    limit 1
  ) v on true
  where estado_atencion(v.estado, v.vencimiento, coalesce(v.descuento_pct, 0)) is not null;

  return jsonb_build_object(
    -- La plata
    'mrr_ars',                  v_mrr,
    'tc_venta',                 v_tc.venta,
    'tc_fecha',                 v_tc.fecha,
    'mrr_usd',                  case when v_tc.venta > 0 then round(v_mrr / v_tc.venta, 2) end,
    'fin_mes_anterior',         v_fin_mes_ant,
    'mrr_ars_fin_mes_anterior', v_snap.mrr_ars,
    'mrr_usd_fin_mes_anterior', v_snap.mrr_usd,

    -- Los tenants
    'activos',            (select count(*) from lubricentros l where es_activo(l)),
    'altas_mes',          (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes),
    'altas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo = 'alta' and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),
    'bajas_mes',          (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj') and ocurrido_at >= v_mes),
    'bajas_involuntarias_mes',
                          (select count(*) from tenant_eventos
                           where ocurrido_at >= v_mes
                             and (tipo = 'suspension_reloj'
                                  or (tipo = 'suspension' and motivo like 'falta_de_pago%'))),
    'bajas_mes_anterior', (select count(*) from tenant_eventos
                           where tipo in ('suspension', 'suspension_reloj')
                             and ocurrido_at >= v_mes_ant and ocurrido_at < v_mes),

    -- Los trabajos, de cualquier tipo y por tipo
    'trabajos_mes',          (select count(*) from services
                              where not anulado                          -- @resumen_trabajos
                                and importado_de is null                 -- @resumen_sin_importado
                                and fecha >= v_mes),
    'trabajos_service',      (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'service' and fecha >= v_mes),
    'trabajos_mecanica',     (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'mecanica' and fecha >= v_mes),
    'trabajos_neumaticos',   (select count(*) from services
                              where not anulado and importado_de is null and tipo = 'neumaticos' and fecha >= v_mes),
    'trabajos_mes_anterior', (select count(*) from services
                              where not anulado and importado_de is null and fecha >= v_mes_ant and fecha < v_mes),

    -- Las alertas
    'cierre_ayer',     exists (select 1 from snapshots_diarios where fecha = current_date - 1),
    'ultimo_snapshot', (select max(fecha) from snapshots_diarios),
    'ordenes_cresium', (select count(*) from (
                          select distinct on (o.lubricentro_id) o.estado
                          from cresium_ordenes o
                          where o.suscripcion_id is not null              -- @ordenes_de_suscripcion
                          order by o.lubricentro_id, o.created_at desc
                        ) u where u.estado in ('EXPIRED', 'PARTIAL')),
    'atencion',        v_atencion,
    'sin_origen',      (select count(*) from lubricentros where origen is null),
    -- Los pedidos de calcos (20261003120000): lo que cuenta la alerta del
    -- hub. Trabajo que entró, trabajo que se atrasó y plata que se enfría.
    'calcos',          jsonb_build_object(
                         'esperando_produccion',
                           (select count(*) from encargos_calcos where estado = 'pagado'),   -- @calcos_esperando
                         'atrasados',
                           (select count(*) from encargos_calcos
                            where estado = 'en_produccion'
                              and dias_habiles_entre(produccion_at::date, current_date) > 5),   -- @calcos_atrasados
                         'por_vencer',
                           (select count(*) from encargos_calcos
                            where estado = 'pendiente_pago'
                              and created_at <= now() - interval '6 days'),   -- @calcos_por_vencer
                         -- Los que se quedan sin calcos (20261003210000): lo
                         -- que cuenta es la lista de arriba de /fidelli/calcos.
                         'sin_stock',
                           (select count(*) from calcos_por_agotarse())),   -- @calcos_sin_stock
    'sin_trabajos',    (select coalesce(jsonb_agg(
                          jsonb_build_object('id', x.id, 'nombre', x.nombre, 'dias', x.dias)
                          order by x.dias desc nulls first, x.nombre), '[]'::jsonb)
                        from (
                          select l.id, l.nombre, (current_date - a.ultimo) as dias
                          from lubricentros l
                          left join lateral (
                            select max(sv.fecha) as ultimo from services sv
                            where sv.lubricentro_id = l.id and not sv.anulado
                              and sv.importado_de is null
                          ) a on true
                          where es_activo(l)
                            and (a.ultimo is null or a.ultimo < current_date - 7)
                        ) x),
    'owner_pendiente', (select coalesce(jsonb_agg(
                          jsonb_build_object('id', l.id, 'nombre', l.nombre,
                                             'dias', current_date - l.created_at::date)
                          order by l.created_at), '[]'::jsonb)
                        from lubricentros l
                        join estados_owner() o on o.lubricentro_id = l.id
                        where o.estado = 'pendiente'
                          and l.created_at < now() - interval '7 days')
  );
end;
$$;
-- <<< resumen_admin

-- ════════════════════════════════════════════════════════════════════
-- 7 · Permisos
-- ════════════════════════════════════════════════════════════════════
-- Las tres de adentro no son un /rpc/ para nadie: las llaman las definer.

revoke all on function momento_de_entrega_calcos(date, timestamptz) from public, anon, authenticated;
revoke all on function tiene_encargo_calcos_abierto(uuid) from public, anon, authenticated;
revoke all on function nivel_de_aviso_calcos(integer, numeric) from public, anon, authenticated;
revoke all on function avisos_calcos_pendientes() from public, anon, authenticated;

revoke all on function stock_calcos(uuid) from public, anon;
revoke all on function aviso_calcos(uuid) from public, anon;
revoke all on function calcos_por_agotarse() from public, anon;
revoke all on function declarar_recuento_calcos(integer) from public, anon;
revoke all on function marcar_calcos_propias(uuid, boolean, text) from public, anon;
revoke all on function resumen_admin() from public, anon;

grant execute on function avisos_calcos_pendientes() to service_role;
grant execute on function stock_calcos(uuid) to authenticated, service_role;
grant execute on function aviso_calcos(uuid) to authenticated, service_role;
grant execute on function calcos_por_agotarse() to authenticated, service_role;
grant execute on function declarar_recuento_calcos(integer) to authenticated, service_role;
grant execute on function marcar_calcos_propias(uuid, boolean, text) to authenticated, service_role;
grant execute on function resumen_admin() to authenticated, service_role;
