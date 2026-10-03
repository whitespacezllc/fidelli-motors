-- ════════════════════════════════════════════════════════════════════
-- PEDIDOS DE CALCOS · PR 1 — la base (docs/PROMPT-calcos.md § 2 y § 3.1)
--
-- Hasta acá un tenant que quería más calcos escribía por WhatsApp, se le
-- cotizaba, transfería, y la entrega se anotaba a mano en el libro
-- (`pedidos_calcos`, 20260924103000). Los 200/400 incluidos del alta iban
-- por el mismo WhatsApp. Este archivo trae lo que hace falta para que el
-- pedido sea una entidad con ciclo de vida y lo movamos desde /fidelli:
--
--   · `catalogo_calcos`   — packs y extras con precio y costo, editables
--                           por UNA puerta que audita (regla 16).
--   · `disenos_calco`     — las versiones del diseño de cada tenant, una
--                           sola marcada actual, en el bucket PRIVADO
--                           `calcos`.
--   · `encargos_calcos`   — el pedido: qué, a dónde, cuánto (congelado al
--                           crear) y en qué estado está.
--   · `resumen_admin()`   — gana la clave aditiva `calcos`, que es lo que
--                           cuenta la alerta del hub.
--
-- `pedidos_calcos` NO SE TOCA: sigue siendo el libro de entregas,
-- append-only, y `lubricentros.calcos_entregadas` sigue siendo su suma.
-- «Entregado» es el único estado del encargo que escribe en el libro, y lo
-- hace por la puerta de siempre, `registrar_pedido_calcos()`.
--
-- LA PLATA DE CALCOS NO ES MRR: nada de esto escribe en `pagos` ni en los
-- snapshots. Queda en el encargo (monto, costo, comisión).
--
-- TODAS LAS PUERTAS SON SECURITY DEFINER, Y LAS TABLAS NO SE ESCRIBEN POR
-- API. `authenticated` no tiene INSERT, UPDATE ni DELETE sobre ninguna de
-- las cuatro tablas (ni policy que lo permita: son dos capas), así que ni
-- un owner se marca pagado solo ni un superadmin saltea la tabla de
-- transiciones con un PATCH. Cada puerta resuelve quién llama desde la
-- sesión: `crear_encargo_calcos()` toma el tenant de `mi_lubricentro_id()`,
-- NUNCA de un argumento (regla 18), y las de Fidelli exigen
-- `soy_superadmin()`.
--
-- Y EL COSTO NO LO LEE EL TENANT. `catalogo_calcos.costo_ars` y
-- `encargos_calcos.costo_estimado` / `comision_estimada` quedan fuera del
-- GRANT de columnas de `authenticated`: el owner lee su pedido y el precio
-- de lista, no lo que nos cuesta imprimirlo (es el dato con el que iría a
-- cotizar a una gráfica). Como el superadmin es el mismo rol de Postgres,
-- /fidelli los lee por `encargos_calcos_admin()`, que es definer con
-- guarda. Consecuencia para el front: sobre estas tablas `select *` da
-- 42501; las columnas van explícitas, que es la regla del repo.
--
-- ⚠ Las líneas marcadas `-- @algo` y los marcadores `-- >>> nombre` /
-- `-- <<< nombre` NO SE REFORMATEAN: scripts/regresion-calcos.sh los
-- muerde con sed para romper cada regla a propósito (regla 13). Y
-- `resumen_admin()` vive ahora ACÁ: scripts/regresion-metricas.sh (R32g)
-- la muerde de este archivo.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- 1 · La comisión de Cresium
-- ════════════════════════════════════════════════════════════════════
--
-- 0,8 % + IVA (21 %) = 0,968 % sobre lo acreditado. Es lo que el encargo
-- congela en `comision_estimada` al crearse. No es un precio nuestro —es
-- la tarifa de un tercero— y por eso es una constante y no una fila del
-- catálogo: si cambia, es un commit. `lib/calcos.ts` (COMISION_CRESIUM)
-- repite el número para mostrarlo; los dos cambian juntos y lo compara
-- scripts/regresion-calcos.mjs.

-- >>> comision_cresium
create or replace function comision_cresium()
returns numeric
language sql
immutable
set search_path = public
as $$
  select 0.00968::numeric;                                              -- @comision
$$;
-- <<< comision_cresium

comment on function comision_cresium is
  'La comisión de Cresium sobre lo acreditado: 0,8 % + IVA = 0,968 %. La congela cada encargo de calcos en comision_estimada. lib/calcos.ts repite el número (COMISION_CRESIUM).';


-- ════════════════════════════════════════════════════════════════════
-- 2 · `catalogo_calcos` — packs y extras
-- ════════════════════════════════════════════════════════════════════
--
-- Lo que compra el tenant son packs cerrados; el m² no aparece en ninguna
-- pantalla suya. El costo es interno: $30.000 cada 200 calcos (1 m²), sin
-- baja por volumen; el rediseño no tiene costo de terceros y el envío se
-- estima en lo que se cobra.

create table catalogo_calcos (
  codigo     text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  tipo       text not null check (tipo in ('pack', 'extra')),
  -- Cuántos calcos trae el pack. Null en los extras.
  cantidad   integer,
  precio_ars numeric(12,2) not null check (precio_ars >= 0),
  costo_ars  numeric(12,2) not null check (costo_ars >= 0),
  activo     boolean not null default true,
  orden      integer not null,

  constraint pack_con_cantidad check ((tipo = 'pack') = (cantidad is not null)),
  constraint cantidad_positiva check (cantidad is null or cantidad > 0)
);

comment on table catalogo_calcos is
  'Packs y extras de calcos con precio de lista y costo interno (PR 1 de pedidos de calcos). El precio y el costo se mueven SOLO por fijar_precio_calcos(), que audita en cambios_precio_calcos. El tenant lee todo menos costo_ars.';

insert into catalogo_calcos (codigo, tipo, cantidad, precio_ars, costo_ars, orden) values
  ('pack_200',  'pack',  200,   45000,  30000, 1),
  ('pack_400',  'pack',  400,   84000,  60000, 2),
  ('pack_800',  'pack',  800,  160000, 120000, 3),
  ('pack_1000', 'pack',  1000, 190000, 150000, 4),
  ('pack_2000', 'pack',  2000, 360000, 300000, 5),
  ('rediseno',  'extra', null,  30000,      0, 6),
  ('envio',     'extra', null,  10000,  10000, 7);

alter table catalogo_calcos enable row level security;

-- El precio de lista lo lee cualquiera con sesión: es lo que se le cobra.
create policy catalogo_calcos_lectura on catalogo_calcos
  for select to authenticated using (true);

revoke all on catalogo_calcos from public, anon, authenticated;
grant select (codigo, tipo, cantidad, precio_ars, activo, orden)        -- @columnas_catalogo
  on catalogo_calcos to authenticated;
grant all on catalogo_calcos to service_role;


-- ---------- La auditoría ----------
-- `cambios_precio_catalogo` (20260916100000) es de planes y módulos: su
-- `fila_id` es uuid y su CHECK de `tabla` no admite otra cosa. El catálogo
-- de calcos tiene clave de texto, así que va una tabla propia con la misma
-- forma: qué fila, antes y después en jsonb, motivo obligatorio y autor.

create table cambios_precio_calcos (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null references catalogo_calcos(codigo) on delete restrict,
  antes        jsonb not null,
  despues      jsonb not null,
  motivo       text not null,
  cambiado_por uuid not null references usuarios(id) on delete restrict,
  created_at   timestamptz not null default now(),

  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);

comment on table cambios_precio_calcos is
  'Auditoría del catálogo de calcos: precio_ars y costo_ars antes y después, con motivo y autor. Se escribe solo desde fijar_precio_calcos(). Misma forma que cambios_precio_catalogo.';

create index cambios_precio_calcos_codigo_idx
  on cambios_precio_calcos (codigo, created_at desc);

alter table cambios_precio_calcos enable row level security;

-- Solo Fidelli: acá está el costo.
create policy cambios_precio_calcos_lectura on cambios_precio_calcos
  for select to authenticated using (soy_superadmin());

revoke all on cambios_precio_calcos from public, anon, authenticated;
grant select on cambios_precio_calcos to authenticated;
grant all on cambios_precio_calcos to service_role;


-- ---------- El candado ----------
-- Mismo mecanismo que bloquear_precio_directo(): un GUC transaccional que
-- solo la puerta prende. No importa quién ni por dónde: un UPDATE de
-- precio o de costo sin la bandera se rechaza, también como postgres.
-- Mira SOLO las dos columnas de plata: `activo` y `orden` se mueven.

-- >>> bloquear_precio_calcos_directo
create or replace function bloquear_precio_calcos_directo()
returns trigger
language plpgsql
as $$
begin
  if (new.precio_ars is distinct from old.precio_ars                    -- @candado_precio_calcos
      or new.costo_ars is distinct from old.costo_ars)
     and coalesce(current_setting('fidelli.precio_de_calcos', true), '') <> 'si'
  then
    raise exception 'precio_solo_por_funcion'
      using hint = 'El precio y el costo de los calcos se cambian con fijar_precio_calcos(), que exige motivo y deja registro. Ver cambios_precio_calcos.';
  end if;
  return new;
end;
$$;
-- <<< bloquear_precio_calcos_directo

create trigger candado_precio_calcos
  before update on catalogo_calcos
  for each row execute function bloquear_precio_calcos_directo();

alter table catalogo_calcos enable always trigger candado_precio_calcos;


-- ---------- La puerta ----------
-- El documento del sprint la firma (codigo, precio, costo). Lleva además
-- el motivo: la regla 16 dice que todo cambio de plata deja rastro con
-- autor, fecha Y MOTIVO, y la auditoría «con la misma forma» lo exige.

-- >>> fijar_precio_calcos
create or replace function fijar_precio_calcos(
  p_codigo text,
  p_precio numeric,
  p_costo  numeric,
  p_motivo text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
begin
  if not soy_superadmin() then                                          -- @guarda_precio
    raise exception 'Solo el equipo Fidelli puede mover un precio de calcos'
      using errcode = '42501';
  end if;

  if p_motivo is null or char_length(trim(p_motivo)) < 10 then          -- @motivo_precio
    raise exception 'motivo_corto'
      using hint = 'Contá por qué se mueve el precio: mínimo 10 caracteres.';
  end if;
  if p_precio is null or p_precio < 0 or p_costo is null or p_costo < 0 then
    raise exception 'precio_invalido'
      using hint = 'El precio y el costo son números de 0 para arriba.';
  end if;

  select jsonb_build_object('precio_ars', precio_ars, 'costo_ars', costo_ars)
    into v_antes
  from catalogo_calcos where codigo = p_codigo
  for update;

  if not found then
    raise exception 'codigo_no_existe'
      using hint = 'Ese pack o extra no está en el catálogo de calcos.';
  end if;

  v_despues := jsonb_build_object('precio_ars', round(p_precio, 2), 'costo_ars', round(p_costo, 2));

  -- La bandera se prende para ESTE update y se apaga enseguida: en una
  -- transacción larga, la escritura siguiente no hereda el permiso.
  perform set_config('fidelli.precio_de_calcos', 'si', true);
  update catalogo_calcos
     set precio_ars = round(p_precio, 2),
         costo_ars  = round(p_costo, 2)
   where codigo = p_codigo;
  perform set_config('fidelli.precio_de_calcos', '', true);             -- @apagar_bandera_precio

  -- Un guardado que no cambia nada no se registra.
  if v_antes is distinct from v_despues then                            -- @registro_precio
    insert into cambios_precio_calcos (codigo, antes, despues, motivo, cambiado_por)
    values (p_codigo, v_antes, v_despues, trim(p_motivo), auth.uid());
  end if;
end;
$$;
-- <<< fijar_precio_calcos

comment on function fijar_precio_calcos is
  'La única puerta para mover el precio o el costo de un pack o extra de calcos. Exige motivo (>= 10) y deja antes/después con autor en cambios_precio_calcos; un guardado que no cambia nada no registra. Solo superadmin (42501 si no). Los encargos ya creados no se mueven: congelaron sus montos.';


-- ════════════════════════════════════════════════════════════════════
-- 3 · Los días hábiles
-- ════════════════════════════════════════════════════════════════════
--
-- Lunes a viernes, sin feriados (no hay calendario y no se inventa uno).
-- Cuenta los días hábiles DESPUÉS de p_desde y hasta p_hasta inclusive:
-- de viernes a lunes hay 1.

-- >>> dias_habiles_entre
create or replace function dias_habiles_entre(p_desde date, p_hasta date)
returns integer
language sql
immutable
set search_path = public
as $$
  select count(*)::integer
  from generate_series(p_desde + 1, p_hasta, interval '1 day') d        -- @sin_el_dia_de_partida
  where extract(isodow from d) < 6;                                     -- @lunes_a_viernes
$$;
-- <<< dias_habiles_entre

comment on function dias_habiles_entre is
  'Días hábiles (lunes a viernes, sin feriados) después de p_desde y hasta p_hasta inclusive. Es la vara de «en producción hace más de 5 días hábiles» de los encargos de calcos.';


-- ════════════════════════════════════════════════════════════════════
-- 4 · `disenos_calco` y el bucket privado
-- ════════════════════════════════════════════════════════════════════
--
-- Cada versión del diseño del calco de un tenant. Subir una nueva la marca
-- actual y no borra las anteriores. El archivo vive en el bucket `calcos`,
-- en <lubricentro_id>/<lo que sea>: la carpeta ES el tenant, igual que en
-- `logos`.

create table disenos_calco (
  id             uuid primary key default gen_random_uuid(),
  lubricentro_id uuid not null references lubricentros(id) on delete restrict,
  version        integer not null check (version > 0),
  -- El objeto en el bucket `calcos`.
  ruta           text not null unique,
  actual         boolean not null default true,
  subido_por     uuid references usuarios(id) on delete restrict,
  nota           text,
  created_at     timestamptz not null default now(),

  constraint disenos_calco_version unique (lubricentro_id, version)
);

-- Una sola actual por tenant.
create unique index disenos_calco_una_actual
  on disenos_calco (lubricentro_id) where actual;

comment on table disenos_calco is
  'Versiones del diseño del calco de cada tenant (1, 2, …), con UNA marcada actual: la que ve el tenant y la que se imprime. El archivo (PNG o PDF, hasta 10 MB) vive en el bucket privado calcos. Se escribe solo desde registrar_diseno_calco().';

alter table disenos_calco enable row level security;

create policy disenos_calco_lectura on disenos_calco
  for select to authenticated
  using (soy_superadmin() or lubricentro_id = mi_lubricentro_id());

revoke all on disenos_calco from public, anon, authenticated;
grant select on disenos_calco to authenticated;
grant all on disenos_calco to service_role;


-- ---------- El bucket ----------
-- POSTURA DE SEGURIDAD, explícita (y al revés que `logos`):
--
--   QUIÉN LEE: el superadmin todo, y cada owner SU carpeta. El bucket es
--   PRIVADO: no hay URL pública. La página arma una URL firmada de una
--   hora con la sesión del que mira, y para firmar hay que poder leer.
--
--   QUIÉN ESCRIBE: solo el superadmin. El diseño lo subimos nosotros.
--   Borrar, solo un archivo que no llegó a registrarse como diseño (la
--   subida que falló la validación): una versión registrada no se borra.
--
--   LÍMITES, en el servidor: 10 MB, PNG o PDF.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'calcos',
  'calcos',
  false,
  10485760, -- 10 MB
  array['image/png', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "calcos lectura"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'calcos'
    and (
      public.soy_superadmin()
      or (storage.foldername(name))[1] = public.mi_lubricentro_id()::text
    )
  );

create policy "calcos subida fidelli"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'calcos' and public.soy_superadmin());

create policy "calcos borrado fidelli"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'calcos'
    and public.soy_superadmin()
    and not exists (select 1 from public.disenos_calco d where d.ruta = name)
  );


-- ---------- La puerta ----------

-- >>> registrar_diseno_calco
create or replace function registrar_diseno_calco(
  p_lubricentro_id uuid,
  p_ruta           text,
  p_nota           text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_version integer;
begin
  if not soy_superadmin() then                                          -- @guarda_diseno
    raise exception 'Solo el equipo Fidelli sube el diseño de un calco'
      using errcode = '42501';
  end if;

  -- El lock de la fila del tenant pone en fila dos subidas simultáneas:
  -- sin él, las dos calculan la misma versión.
  perform 1 from lubricentros where id = p_lubricentro_id for update;
  if not found then
    raise exception 'no_existe' using hint = 'Ese lubricentro no existe.';
  end if;

  -- La carpeta es el tenant: es lo que la policy del bucket le deja leer.
  if p_ruta is null or p_ruta not like p_lubricentro_id::text || '/_%' then   -- @ruta_del_tenant
    raise exception 'ruta_invalida'
      using hint = 'El archivo del diseño tiene que estar en la carpeta del lubricentro.';
  end if;

  select coalesce(max(d.version), 0) + 1 into v_version                 -- @version_siguiente
  from disenos_calco d where d.lubricentro_id = p_lubricentro_id;

  update disenos_calco set actual = false                               -- @una_actual
   where lubricentro_id = p_lubricentro_id and actual;

  insert into disenos_calco (lubricentro_id, version, ruta, actual, subido_por, nota)
  values (p_lubricentro_id, v_version, p_ruta, true, auth.uid(),
          nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< registrar_diseno_calco

comment on function registrar_diseno_calco is
  'Registra una versión nueva del diseño del calco de un tenant (la siguiente: 1, 2, …), la marca actual y desmarca la anterior, que no se borra. La ruta tiene que estar en la carpeta del tenant dentro del bucket calcos. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 5 · `encargos_calcos` — el pedido
-- ════════════════════════════════════════════════════════════════════

create type estado_encargo_calcos as enum (
  'pendiente_pago',
  'pagado',
  'en_produccion',
  'enviado',
  'listo_retiro',
  'entregado',
  'vencido',
  'cancelado'
);

create table encargos_calcos (
  id                uuid primary key default gen_random_uuid(),
  lubricentro_id    uuid not null references lubricentros(id) on delete restrict,
  -- El #0012 de las pantallas. Correlativo de la plataforma, no del tenant.
  numero            serial not null unique,
  -- Del alta: sin pago, lo crea Fidelli y arranca en `pagado`.
  incluido          boolean not null default false,

  -- Qué
  pack_codigo       text references catalogo_calcos(codigo) on delete restrict,
  cantidad          integer not null check (cantidad > 0),
  rediseno          boolean not null default false,
  rediseno_pedido   text,
  -- La versión que se imprime. Se fija al crear y otra vez al entrar a
  -- producción (la vigente en ese momento); después no cambia.
  diseno_id         uuid references disenos_calco(id) on delete restrict,

  -- Entrega
  entrega           text not null,
  direccion         text,
  localidad         text,
  codigo_postal     text,
  telefono_contacto text,

  -- Plata, CONGELADA al crear: si el catálogo cambia después, el pedido no.
  monto_pack        numeric(12,2) not null check (monto_pack >= 0),
  monto_rediseno    numeric(12,2) not null check (monto_rediseno >= 0),
  monto_envio       numeric(12,2) not null check (monto_envio >= 0),
  monto_total       numeric(12,2) not null,
  costo_estimado    numeric(12,2) not null check (costo_estimado >= 0),
  comision_estimada numeric(12,2) not null check (comision_estimada >= 0),

  -- Estado
  estado            estado_encargo_calcos not null,
  pagado_at         timestamptz,
  produccion_at     timestamptz,
  -- Cuándo salió de la gráfica: despachado, o listo para retirar.
  enviado_at        timestamptz,
  entregado_at      timestamptz,
  transportista     text,
  seguimiento       text,
  -- La idempotencia del webhook (PR 2).
  cresium_transaccion_id bigint unique,
  -- La fila del libro que escribió «Entregado». SIN FK, a propósito: una
  -- referencia hacia pedidos_calcos hace que `truncate pedidos_calcos`
  -- falle por la FK antes de que dispare su candado de purga, y R33f —que
  -- prueba ESE candado— deja de ver su error (se vio en rojo). La
  -- integridad la da la puerta: el id sale de registrar_pedido_calcos() en
  -- la misma transacción, y una fila del libro no se borra mientras el
  -- tenant exista. Lo comprueba R39b.
  pedido_calcos_id  uuid,
  mail_pago_at      timestamptz,
  mail_envio_at     timestamptz,
  creado_por        uuid references usuarios(id) on delete restrict,
  nota              text,
  created_at        timestamptz not null default now(),

  constraint entrega_valida          check (entrega in ('retiro', 'envio')),
  constraint comprado_con_pack       check (incluido or pack_codigo is not null),
  constraint total_es_la_suma        check (monto_total = monto_pack + monto_rediseno + monto_envio),
  constraint incluido_sin_monto      check (not incluido or monto_total = 0),
  constraint envio_con_direccion     check (entrega <> 'envio' or (direccion is not null and telefono_contacto is not null)),
  constraint enviado_con_seguimiento check (estado <> 'enviado' or seguimiento is not null),
  constraint entregado_con_pedido    check (estado <> 'entregado' or pedido_calcos_id is not null)
);

-- Un pedido sin pagar por tenant a la vez.
create unique index encargos_calcos_un_pendiente
  on encargos_calcos (lubricentro_id) where estado = 'pendiente_pago';

create index encargos_calcos_tenant on encargos_calcos (lubricentro_id, created_at desc);
create index encargos_calcos_estado on encargos_calcos (estado);

comment on table encargos_calcos is
  'El pedido de calcos con ciclo de vida (pendiente_pago · pagado · en_produccion · enviado / listo_retiro · entregado · vencido · cancelado). Distinto de pedidos_calcos, que es el libro de entregas: «entregado» es el único estado que escribe ahí. La plata se congela al crear y no es MRR. Nace por crear_encargo_calcos() (owner) o crear_encargo_calcos_incluido() (Fidelli) y se mueve solo por avanzar_encargo_calcos().';

alter table encargos_calcos enable row level security;

-- El owner LEE los de su tenant. No hay policy de escritura para nadie.
create policy encargos_calcos_lectura on encargos_calcos
  for select to authenticated
  using (soy_superadmin() or lubricentro_id = mi_lubricentro_id());

revoke all on encargos_calcos from public, anon, authenticated;
-- Todo menos el costo, la comisión, la nota interna y la plomería.
grant select (
  id, lubricentro_id, numero, incluido,
  pack_codigo, cantidad, rediseno, rediseno_pedido, diseno_id,
  entrega, direccion, localidad, codigo_postal, telefono_contacto,
  monto_pack, monto_rediseno, monto_envio, monto_total,                 -- @columnas_encargo
  estado, pagado_at, produccion_at, enviado_at, entregado_at,
  transportista, seguimiento, created_at
) on encargos_calcos to authenticated;
grant all on encargos_calcos to service_role;
revoke all on sequence encargos_calcos_numero_seq from public, anon, authenticated;


-- ---------- La puerta del owner ----------
-- Crea el pedido del tenant DE LA SESIÓN, en `pendiente_pago`, con los
-- montos del catálogo de ese momento. Los tres planes pueden comprar. El
-- tenant tiene que estar activo —suspendido lee, no escribe; la acción lo
-- frena con sesionParaEscribir() y acá se repite, porque la suspensión no
-- vive en el RLS—. Un segundo pedido sin pagar lo frena el índice único;
-- la función solo traduce el error.

-- >>> crear_encargo_calcos
create or replace function crear_encargo_calcos(
  p_pack            text,
  p_rediseno        boolean default false,
  p_rediseno_pedido text    default null,
  p_entrega         text    default 'retiro',
  p_direccion       text    default null,
  p_localidad       text    default null,
  p_codigo_postal   text    default null,
  p_telefono        text    default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lub        uuid := mi_lubricentro_id();                             -- @tenant_de_la_sesion
  v_l          lubricentros%rowtype;
  v_pack       catalogo_calcos%rowtype;
  v_red        catalogo_calcos%rowtype;
  v_env        catalogo_calcos%rowtype;
  v_envio      boolean;
  v_rediseno   boolean := coalesce(p_rediseno, false);
  v_direccion  text := nullif(trim(coalesce(p_direccion, '')), '');
  v_telefono   text := nullif(trim(coalesce(p_telefono, '')), '');
  v_total      numeric;
  v_costo      numeric;
  v_restriccion text;
  v_id         uuid;
begin
  if v_lub is null then
    raise exception 'Solo el owner de un lubricentro puede pedir calcos'
      using errcode = '42501';
  end if;

  select l.* into v_l from lubricentros l where l.id = v_lub;
  if not es_activo(v_l) then                                            -- @solo_activos
    raise exception 'tenant_suspendido'
      using hint = 'Un lubricentro suspendido no puede pedir calcos.';
  end if;

  select c.* into v_pack from catalogo_calcos c
   where c.codigo = p_pack and c.tipo = 'pack' and c.activo;            -- @pack_es_pack
  if not found then
    raise exception 'pack_invalido'
      using hint = 'Ese pack no está en el catálogo de calcos.';
  end if;

  if p_entrega is null or p_entrega not in ('retiro', 'envio') then
    raise exception 'entrega_invalida'
      using hint = 'La entrega es retiro o envio.';
  end if;
  v_envio := p_entrega = 'envio';
  if v_envio and (v_direccion is null or v_telefono is null) then       -- @envio_con_datos
    raise exception 'envio_sin_direccion'
      using hint = 'Para el envío a domicilio hacen falta la dirección y un teléfono de contacto.';
  end if;

  select c.* into v_red from catalogo_calcos c where c.codigo = 'rediseno' and c.activo;
  if v_rediseno and not found then
    raise exception 'extra_no_disponible' using hint = 'El rediseño no está disponible.';
  end if;
  select c.* into v_env from catalogo_calcos c where c.codigo = 'envio' and c.activo;
  if v_envio and not found then
    raise exception 'extra_no_disponible' using hint = 'El envío a domicilio no está disponible.';
  end if;

  v_total := v_pack.precio_ars                                          -- @total_del_catalogo
           + case when v_rediseno then v_red.precio_ars else 0 end
           + case when v_envio    then v_env.precio_ars else 0 end;
  v_costo := v_pack.costo_ars                                           -- @costo_del_catalogo
           + case when v_rediseno then v_red.costo_ars else 0 end
           + case when v_envio    then v_env.costo_ars else 0 end;

  begin
    insert into encargos_calcos (
      lubricentro_id, incluido, pack_codigo, cantidad, rediseno, rediseno_pedido, diseno_id,
      entrega, direccion, localidad, codigo_postal, telefono_contacto,
      monto_pack, monto_rediseno, monto_envio, monto_total, costo_estimado, comision_estimada,
      estado, creado_por
    ) values (
      v_lub, false, v_pack.codigo, v_pack.cantidad, v_rediseno,
      case when v_rediseno then nullif(trim(coalesce(p_rediseno_pedido, '')), '') end,
      (select d.id from disenos_calco d where d.lubricentro_id = v_lub and d.actual),
      p_entrega,
      -- Los datos de envío se guardan solo con envío: el retiro se coordina
      -- por WhatsApp y una dirección precargada no es una respuesta.
      case when v_envio then v_direccion end,
      case when v_envio then nullif(trim(coalesce(p_localidad, '')), '') end,
      case when v_envio then nullif(trim(coalesce(p_codigo_postal, '')), '') end,
      case when v_envio then v_telefono end,
      v_pack.precio_ars,
      case when v_rediseno then v_red.precio_ars else 0 end,
      case when v_envio    then v_env.precio_ars else 0 end,
      v_total, v_costo,
      round(v_total * comision_cresium(), 2),                           -- @comision_del_total
      'pendiente_pago', auth.uid()
    )
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'encargos_calcos_un_pendiente' then              -- @traduce_pendiente
      raise exception 'ya_hay_pendiente'
        using hint = 'Este lubricentro ya tiene un pedido de calcos sin pagar. Se paga o vence ese antes de pedir otro.';
    end if;
    raise;
  end;

  return v_id;
end;
$$;
-- <<< crear_encargo_calcos

comment on function crear_encargo_calcos is
  'El owner pide calcos: crea el encargo de SU tenant (mi_lubricentro_id(), nunca un argumento) en pendiente_pago, con los montos, el costo y la comisión congelados del catálogo del momento. Exige el tenant activo (tenant_suspendido), un pack vigente (pack_invalido) y, con envío, dirección y teléfono (envio_sin_direccion). Un pedido sin pagar por tenant (ya_hay_pendiente). Definer: la tabla no se escribe por API.';


-- ---------- La puerta del incluido ----------
-- Los 200/400 del alta: los crea Fidelli desde la ficha, sin pago, y
-- arrancan en `pagado`. Valen 0; el costo es el de imprimirlos (el costo
-- por calco del pack más chico, que es lineal: el proveedor no baja por
-- volumen) más el del envío si lo hay.

-- >>> crear_encargo_calcos_incluido
create or replace function crear_encargo_calcos_incluido(
  p_lubricentro_id uuid,
  p_cantidad       integer,
  p_entrega        text,
  p_direccion      text default null,
  p_localidad      text default null,
  p_codigo_postal  text default null,
  p_telefono       text default null,
  p_nota           text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_envio     boolean;
  v_direccion text := nullif(trim(coalesce(p_direccion, '')), '');
  v_telefono  text := nullif(trim(coalesce(p_telefono, '')), '');
  v_unitario  numeric;
  v_costo     numeric;
  v_id        uuid;
begin
  if not soy_superadmin() then                                          -- @guarda_incluido
    raise exception 'Solo el equipo Fidelli carga un pedido incluido en el plan'
      using errcode = '42501';
  end if;
  if not exists (select 1 from lubricentros where id = p_lubricentro_id) then
    raise exception 'no_existe' using hint = 'Ese lubricentro no existe.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad > 20000 then
    raise exception 'cantidad_invalida'
      using hint = 'La cantidad de calcos tiene que ser mayor que cero.';
  end if;
  if p_entrega is null or p_entrega not in ('retiro', 'envio') then
    raise exception 'entrega_invalida' using hint = 'La entrega es retiro o envio.';
  end if;
  v_envio := p_entrega = 'envio';
  if v_envio and (v_direccion is null or v_telefono is null) then
    raise exception 'envio_sin_direccion'
      using hint = 'Para el envío a domicilio hacen falta la dirección y un teléfono de contacto.';
  end if;

  select c.costo_ars / c.cantidad into v_unitario                       -- @costo_unitario
  from catalogo_calcos c where c.tipo = 'pack' and c.activo
  order by c.cantidad limit 1;
  v_costo := round(coalesce(v_unitario, 0) * p_cantidad, 2)
           + case when v_envio
                  then coalesce((select c.costo_ars from catalogo_calcos c where c.codigo = 'envio'), 0)
                  else 0 end;

  insert into encargos_calcos (
    lubricentro_id, incluido, pack_codigo, cantidad, diseno_id,
    entrega, direccion, localidad, codigo_postal, telefono_contacto,
    monto_pack, monto_rediseno, monto_envio, monto_total, costo_estimado, comision_estimada,
    estado, pagado_at, creado_por, nota
  ) values (
    p_lubricentro_id, true,
    -- Si la cantidad es la de un pack, queda dicho cuál; si no, null.
    (select c.codigo from catalogo_calcos c where c.tipo = 'pack' and c.cantidad = p_cantidad),
    p_cantidad,
    (select d.id from disenos_calco d where d.lubricentro_id = p_lubricentro_id and d.actual),
    p_entrega,
    case when v_envio then v_direccion end,
    case when v_envio then nullif(trim(coalesce(p_localidad, '')), '') end,
    case when v_envio then nullif(trim(coalesce(p_codigo_postal, '')), '') end,
    case when v_envio then v_telefono end,
    0, 0, 0, 0, v_costo, 0,                                             -- @incluido_vale_cero
    'pagado', now(), auth.uid(),                                        -- @incluido_nace_pagado
    nullif(trim(coalesce(p_nota, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< crear_encargo_calcos_incluido

comment on function crear_encargo_calcos_incluido is
  'Fidelli carga los calcos incluidos del alta: un encargo incluido = true, monto 0, que arranca en pagado y sigue el mismo camino que uno comprado. La cantidad es libre (200 Pro / 400 Ultra por defecto, en la pantalla). Solo superadmin (42501 si no).';


-- ---------- La puerta de los estados ----------
-- LA TABLA DE TRANSICIONES ES ESTA y no hay otra: lo que no está en la
-- lista no pasa. `vencido` no tiene salida ni entrada desde acá: vence el
-- cierre diario y revive el webhook (PR 2), no una persona.

-- >>> avanzar_encargo_calcos
create or replace function avanzar_encargo_calcos(
  p_id     uuid,
  p_estado estado_encargo_calcos,
  p_datos  jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v               encargos_calcos%rowtype;
  v_nota          text := nullif(trim(coalesce(p_datos ->> 'nota', '')), '');
  v_transportista text := nullif(trim(coalesce(p_datos ->> 'transportista', '')), '');
  v_seguimiento   text := nullif(trim(coalesce(p_datos ->> 'seguimiento', '')), '');
  v_pedido        uuid;
  -- El día de la entrega es el día calendario en Argentina, no el de UTC:
  -- un «Entregado» de las 22:00 no puede quedar en el libro —que no se
  -- edita— con la fecha de mañana.
  v_hoy           date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not soy_superadmin() then                                          -- @guarda_avanzar
    raise exception 'Solo el equipo Fidelli mueve un pedido de calcos de estado'
      using errcode = '42501';
  end if;

  select e.* into v from encargos_calcos e where e.id = p_id for update;
  if not found then
    raise exception 'encargo_no_existe'
      using hint = 'Ese pedido de calcos ya no existe.';
  end if;

  if not exists (
    select 1
    from (values
      ('pendiente_pago'::estado_encargo_calcos, 'pagado'::estado_encargo_calcos, false),
      ('pendiente_pago', 'cancelado',     false),
      ('pagado',         'en_produccion', false),                       -- @t_pagado
      -- Solo los incluidos: uno cargado por error no tiene plata que
      -- devolver. Cancelar un pagado que se cobró es una devolución, y eso
      -- no se resuelve con un botón.
      ('pagado',         'cancelado',     true),                        -- @t_cancelar_incluido
      ('en_produccion',  'enviado',       false),                       -- @t_en_produccion
      ('en_produccion',  'listo_retiro',  false),
      ('enviado',        'entregado',     false),
      ('listo_retiro',   'entregado',     false)                        -- @t_ultima
    ) as t(de, a, solo_incluido)
    where t.de = v.estado and t.a = p_estado
      and (not t.solo_incluido or v.incluido)                           -- @t_solo_incluido
  ) then
    raise exception 'transicion_invalida'
      using hint = format('Un pedido de calcos %s no pasa a %s.', v.estado, p_estado);
  end if;

  if p_estado = 'pagado' then
    -- A mano: la excepción, no la regla. Queda dicho por qué.
    if v_nota is null or char_length(v_nota) < 10 then                  -- @nota_pago
      raise exception 'nota_obligatoria'
        using hint = 'Marcar pagado a mano es la excepción: contá cómo pagó, en 10 caracteres o más.';
    end if;
    update encargos_calcos
       set estado = 'pagado', pagado_at = now(), nota = concat_ws(' · ', nota, v_nota)
     where id = p_id;

  elsif p_estado = 'cancelado' then
    if v.estado = 'pagado' and (v_nota is null or char_length(v_nota) < 10) then   -- @nota_cancelar
      raise exception 'nota_obligatoria'
        using hint = 'Contá por qué se cancela un pedido que ya estaba en camino: 10 caracteres o más.';
    end if;
    update encargos_calcos
       set estado = 'cancelado', nota = concat_ws(' · ', nota, v_nota)
     where id = p_id;

  elsif p_estado = 'en_produccion' then
    -- La versión que se imprime es la vigente AHORA; si no hay ninguna
    -- subida, queda la que tenía (o null).
    update encargos_calcos
       set estado = 'en_produccion', produccion_at = now(),
           diseno_id = coalesce(                                        -- @diseno_al_producir
             (select d.id from disenos_calco d where d.lubricentro_id = v.lubricentro_id and d.actual),
             diseno_id)
     where id = p_id;

  elsif p_estado = 'enviado' then
    if v.entrega <> 'envio' then                                        -- @enviado_solo_envio
      raise exception 'entrega_no_es_envio'
        using hint = 'Este pedido es con retiro: cuando esté, va a «Listo para retirar».';
    end if;
    if v_transportista is null or v_seguimiento is null then            -- @seguimiento
      raise exception 'seguimiento_obligatorio'
        using hint = 'Para marcarlo enviado hacen falta el transportista y el número de seguimiento.';
    end if;
    update encargos_calcos
       set estado = 'enviado', enviado_at = now(),
           transportista = v_transportista, seguimiento = v_seguimiento
     where id = p_id;

  elsif p_estado = 'listo_retiro' then
    if v.entrega <> 'retiro' then                                       -- @listo_solo_retiro
      raise exception 'entrega_no_es_retiro'
        using hint = 'Este pedido es con envío a domicilio: va a «Enviado», con su seguimiento.';
    end if;
    update encargos_calcos
       set estado = 'listo_retiro', enviado_at = now()
     where id = p_id;

  elsif p_estado = 'entregado' then
    -- El ÚNICO estado que escribe en el libro. La puerta del libro inserta
    -- la fila y deja el contador del tenant igual a la suma.
    v_pedido := registrar_pedido_calcos(                                -- @libro
      v.lubricentro_id, v_hoy, v.cantidad, v.incluido,                  -- @libro_cantidad
      case when v.incluido then null else v.monto_total end,            -- @libro_monto
      'Encargo #' || lpad(v.numero::text, 4, '0'));
    update encargos_calcos
       set estado = 'entregado', entregado_at = now(), pedido_calcos_id = v_pedido
     where id = p_id;
  end if;
end;
$$;
-- <<< avanzar_encargo_calcos

comment on function avanzar_encargo_calcos is
  'Mueve un encargo de calcos de estado validando contra la tabla de transiciones (transicion_invalida) y escribe el *_at que corresponda. pagado a mano exige nota; enviado exige entrega a domicilio, transportista y seguimiento; listo_retiro exige retiro; cancelar un pagado es solo para incluidos y con nota; entregado llama a registrar_pedido_calcos() y guarda el id de la fila del libro. Solo superadmin (42501 si no).';


-- ---------- Lo que lee /fidelli ----------
-- La ficha (con p_lubricentro_id) y la cola (sin él). Trae el costo y la
-- ganancia, que `authenticated` no puede leer de la tabla, y el orden de
-- trabajo: pagados sin producir primero, después en producción, después
-- despachados sin entregar, después sin pagar, y al final lo cerrado; en
-- cada grupo lo más viejo arriba (lo cerrado, al revés).

-- >>> encargos_calcos_admin
create or replace function encargos_calcos_admin(p_lubricentro_id uuid default null)
returns table (
  orden              integer,
  id                 uuid,
  lubricentro_id     uuid,
  lubricentro_nombre text,
  numero             integer,
  incluido           boolean,
  pack_codigo        text,
  cantidad           integer,
  rediseno           boolean,
  rediseno_pedido    text,
  diseno_version     integer,
  entrega            text,
  direccion          text,
  localidad          text,
  codigo_postal      text,
  telefono_contacto  text,
  monto_total        numeric,
  costo_estimado     numeric,
  comision_estimada  numeric,
  ganancia           numeric,
  estado             estado_encargo_calcos,
  created_at         timestamptz,
  pagado_at          timestamptz,
  produccion_at      timestamptz,
  enviado_at         timestamptz,
  entregado_at       timestamptz,
  transportista      text,
  seguimiento        text,
  nota               text,
  dias_habiles       integer,
  atrasado           boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not soy_superadmin() then                                          -- @guarda_cola
    raise exception 'Solo el equipo Fidelli puede ver los pedidos de calcos'
      using errcode = '42501';
  end if;

  return query
  with base as (
    select
      e.*,
      l.nombre as l_nombre,
      d.version as d_version,
      case e.estado
        when 'pagado'         then 1                                    -- @cola_pagados_primero
        when 'en_produccion'  then 2
        when 'enviado'        then 3
        when 'listo_retiro'   then 3
        when 'pendiente_pago' then 4
        else 5
      end as grupo,
      -- Desde cuándo está en el estado en que está.
      case e.estado
        when 'pagado'        then e.pagado_at
        when 'en_produccion' then e.produccion_at
        when 'enviado'       then e.enviado_at
        when 'listo_retiro'  then e.enviado_at
        when 'entregado'     then e.entregado_at
        else e.created_at
      end as desde
    from encargos_calcos e
    join lubricentros l on l.id = e.lubricentro_id
    left join disenos_calco d on d.id = e.diseno_id
    where p_lubricentro_id is null or e.lubricentro_id = p_lubricentro_id   -- @cola_filtro_tenant
  )
  select
    row_number() over (
      order by b.grupo,
               case when b.grupo < 5 then extract(epoch from coalesce(b.desde, b.created_at)) end asc,
               case when b.grupo = 5 then extract(epoch from coalesce(b.desde, b.created_at)) end desc,
               b.numero
    )::integer,
    b.id, b.lubricentro_id, b.l_nombre, b.numero, b.incluido, b.pack_codigo, b.cantidad,
    b.rediseno, b.rediseno_pedido, b.d_version,
    b.entrega, b.direccion, b.localidad, b.codigo_postal, b.telefono_contacto,
    b.monto_total, b.costo_estimado, b.comision_estimada,
    b.monto_total - b.costo_estimado - b.comision_estimada,              -- @ganancia
    b.estado, b.created_at, b.pagado_at, b.produccion_at, b.enviado_at, b.entregado_at,
    b.transportista, b.seguimiento, b.nota,
    case when b.estado = 'en_produccion'
         then dias_habiles_entre(b.produccion_at::date, current_date) end,
    coalesce(b.estado = 'en_produccion'
             and dias_habiles_entre(b.produccion_at::date, current_date) > 5, false)
  from base b
  order by 1;
end;
$$;
-- <<< encargos_calcos_admin

comment on function encargos_calcos_admin is
  'Los encargos de calcos para /fidelli: de un tenant (la ficha) o de todos (la cola), con el nombre del tenant, la versión del diseño, el costo, la comisión y la ganancia (monto − costo − comisión), los días hábiles en producción y el orden de trabajo en `orden`. Solo superadmin (42501 si no). Es la única lectura del costo: authenticated no lo tiene en el GRANT de la tabla.';


-- ════════════════════════════════════════════════════════════════════
-- 6 · resumen_admin() — gana la clave `calcos`
-- ════════════════════════════════════════════════════════════════════
--
-- Cuerpo TEXTUAL de 20261002120000_importado_de.sql, con sus marcadores;
-- lo único nuevo es la clave aditiva `calcos` al final: pagados sin
-- producir, en producción hace más de 5 días hábiles, y pendientes de pago
-- que vencen en las próximas 24 horas (el pedido vence a los 7 días).
-- Desde acá, scripts/regresion-metricas.sh (R32g) la muerde de ESTE archivo.

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
                              and created_at <= now() - interval '6 days')),   -- @calcos_por_vencer
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

comment on function resumen_admin is
  'Los cinco números del Resumen de /fidelli con su comparación (MRR ARS/USD contra el snapshot del último día del mes anterior; activos; altas; bajas e involuntarias; trabajos por tipo, sin lo importado) y los conteos de las alertas (cierre de ayer, última orden de Cresium vencida o parcial por tenant, atención, activos sin trabajos en 7 días, owners sin activar, sin origen, y `calcos`: pagados que esperan producción, en producción hace más de 5 días hábiles y sin pagar que vencen en 24 horas). Solo lee. Solo superadmin (42501 si no).';


-- ════════════════════════════════════════════════════════════════════
-- 7 · Permisos
-- ════════════════════════════════════════════════════════════════════
-- Cada función se granta a mano. `anon` no llega a ninguna.

revoke all on function comision_cresium() from public, anon, authenticated;
revoke all on function bloquear_precio_calcos_directo() from public, anon, authenticated;
revoke all on function fijar_precio_calcos(text, numeric, numeric, text) from public, anon;
revoke all on function dias_habiles_entre(date, date) from public, anon;
revoke all on function registrar_diseno_calco(uuid, text, text) from public, anon;
revoke all on function crear_encargo_calcos(text, boolean, text, text, text, text, text, text) from public, anon;
revoke all on function crear_encargo_calcos_incluido(uuid, integer, text, text, text, text, text, text) from public, anon;
revoke all on function avanzar_encargo_calcos(uuid, estado_encargo_calcos, jsonb) from public, anon;
revoke all on function encargos_calcos_admin(uuid) from public, anon;
revoke all on function resumen_admin() from public, anon;

grant execute on function comision_cresium() to service_role;
grant execute on function fijar_precio_calcos(text, numeric, numeric, text) to authenticated, service_role;
grant execute on function dias_habiles_entre(date, date) to authenticated, service_role;
grant execute on function registrar_diseno_calco(uuid, text, text) to authenticated, service_role;
grant execute on function crear_encargo_calcos(text, boolean, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function crear_encargo_calcos_incluido(uuid, integer, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function avanzar_encargo_calcos(uuid, estado_encargo_calcos, jsonb) to authenticated, service_role;
grant execute on function encargos_calcos_admin(uuid) to authenticated, service_role;
grant execute on function resumen_admin() to authenticated, service_role;
