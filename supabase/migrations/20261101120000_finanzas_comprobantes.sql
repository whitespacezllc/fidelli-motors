-- ============================================================
-- Fidelli Motors · Finanzas — Comprobantes por foto/IA (Rebanada 1)
--
-- Lo que más piden los talleres: sacarle una foto (o subir el PDF) a una
-- factura y que la IA recupere los datos, sin tipear. Esta rebanada hace
-- SOLO el caso de más valor y menos riesgo: la factura de COMPRA que el
-- taller recibe de un proveedor → se carga como EGRESO de la caja.
--
-- ────────────────────────────────────────────────────────────
-- SIGUE SIENDO FINANZAS, NO FACTURACIÓN
--
-- Un comprobante RECIBIDO se lee para registrar la plata que salió; no se
-- EMITE nada (eso es el Nivel 3, otro producto, detrás de EmisorFiscal).
-- No hay IVA, ni CAE, ni numeración fiscal: la regla 6 sigue en pie. El
-- egreso que nace es el mismo renglón de monto + concepto + medio de
-- siempre; los datos fiscales del proveedor (razón social, CUIT, nº) viven
-- SOLO acá, en `comprobantes_recibidos`, y NO se agregan a `egresos`.
--
-- ────────────────────────────────────────────────────────────
-- NUNCA AUTO-GUARDA
--
-- La IA PROPONE (`extraido`), el dueño CORRIGE y recién al CONFIRMAR nace
-- el egreso, con los valores que la persona tenía a la vista — no con lo
-- que leyó la IA. El estado lo dice la fila: `sin_revisar` → `confirmado`
-- (o `descartado`). Un comprobante confirmado produjo EXACTAMENTE un
-- movimiento, en la MISMA transacción (confirmar_comprobante): o nacen los
-- dos, o ninguno.
--
-- ────────────────────────────────────────────────────────────
-- POSTURA DE SEGURIDAD, igual que los adjuntos (20261004200000)
--
--   El archivo vive en el bucket PRIVADO `comprobantes`, carpeta = tenant
--   (<lubricentro_id>/<uuid>.<ext>, y un CHECK lo exige). `anon` NO LEE
--   NADA: ni la tabla ni el bucket. Un comprobante es interno del taller
--   —NO se le muestra nunca al cliente final—, así que a diferencia de los
--   adjuntos no hay puerta pública ni cambio en get_carton.
--
--   GATING: capacidad del módulo `finanzas` (no un módulo nuevo). Dos
--   capas, como la regla 1: el gate va en el WITH CHECK de la tabla (NUNCA
--   en el USING: un downgrade apaga la escritura, no la lectura) Y el front
--   lo repite para avisar. Mismo molde que ingresos/egresos.
--
--   El archivo sin fila útil —la subida que no validó, el de un comprobante
--   descartado, la purga de un tenant— lo barre el cierre diario
--   (comprobantes_huerfanos, solo service_role), como los adjuntos.
-- ============================================================


-- ---------- 1 · La tabla ----------
create table comprobantes_recibidos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  -- compra → egreso (R1). venta → ingreso (R2, todavía no). La columna
  -- existe desde ya para no migrar cuando entre la venta.
  direccion       text not null default 'compra'
    constraint comprobante_direccion_valida check (direccion in ('compra', 'venta')),
  -- El objeto en el bucket `comprobantes`: <lubricentro_id>/<uuid>.<ext>.
  -- La elige el servidor; el navegador no decide ni la carpeta ni el nombre.
  ruta            text not null,
  -- El nombre del archivo como lo eligió quien lo subió, ya limpio.
  nombre          text not null,
  mime            text not null,
  bytes           integer not null,
  -- Lo que la IA LEYÓ de la imagen/PDF (razón social, CUIT, nº, fecha,
  -- neto, IVA, total, ítems, advertencias). Es una PROPUESTA; el dueño la
  -- corrige antes de confirmar. Nace vacío y lo completa
  -- guardar_extraccion_comprobante(). Acá vive el único dato fiscal del
  -- proveedor; `egresos` no lo toca.
  extraido        jsonb not null default '{}'::jsonb,
  estado          text not null default 'sin_revisar'
    constraint comprobante_estado_valido check (estado in ('sin_revisar', 'confirmado', 'descartado')),
  -- El movimiento de caja que nació al confirmar. set null: el comprobante
  -- sobrevive a lo que le pase al movimiento (es la evidencia de que se
  -- cargó). Exactamente uno, y solo si confirmado (CHECK de abajo).
  egreso_id       uuid references egresos(id) on delete set null,
  ingreso_id      uuid references ingresos(id) on delete set null,
  motivo_descarte text,
  confirmado_at   timestamptz,
  created_at      timestamptz not null default now(),

  constraint comprobante_ruta_unica unique (ruta),
  constraint comprobante_nombre_valido check (
    char_length(btrim(nombre)) between 1 and 160
    and nombre !~ '[[:cntrl:]]'
  ),
  constraint comprobante_mime_valido check (
    mime in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint comprobante_bytes_validos check (bytes between 1 and 2097152), -- 2 MB
  -- El archivo vive en la carpeta de SU tenant, y su extensión es la de su
  -- formato. Dos partes: <lubricentro_id>/<uuid>.<ext>. Con esto una fila
  -- no puede apuntar al archivo de otro lubricentro.
  constraint comprobante_ruta_valida check (
    ruta = lubricentro_id::text || '/' || split_part(ruta, '/', 2)
    and split_part(ruta, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
    and right(ruta, 3) = case mime
      when 'application/pdf' then 'pdf'
      when 'image/jpeg'      then 'jpg'
      when 'image/png'       then 'png'
    end
  ),
  -- A lo sumo UN movimiento, y SOLO si está confirmado: un confirmado
  -- produjo exactamente un egreso o un ingreso; un sin_revisar o descartado,
  -- ninguno. Es la coherencia que hace que "confirmado" signifique algo.
  constraint comprobante_movimiento_coherente check (
    case estado
      when 'confirmado' then (egreso_id is not null) <> (ingreso_id is not null)
      else egreso_id is null and ingreso_id is null
    end
  ),
  -- confirmado ⇔ tiene fecha de confirmación.
  constraint comprobante_confirmado_fecha check (
    (estado = 'confirmado') = (confirmado_at is not null)
  )
);

create index comprobantes_recibidos_lubri_estado_idx
  on comprobantes_recibidos (lubricentro_id, estado, created_at desc);

-- Un comprobante produce UN movimiento, y un movimiento nace de UN
-- comprobante: índices únicos parciales (los null no entran).
create unique index comprobantes_egreso_unico_idx
  on comprobantes_recibidos (egreso_id) where egreso_id is not null;
create unique index comprobantes_ingreso_unico_idx
  on comprobantes_recibidos (ingreso_id) where ingreso_id is not null;

comment on table comprobantes_recibidos is
  'Las facturas/tickets que el taller RECIBE y carga por foto o PDF (módulo Finanzas). La IA propone los datos en `extraido`; al confirmar nace un egreso (compra) en la misma transacción. Interno del taller: NO se le muestra al cliente final (no hay puerta pública ni cambio en get_carton). El archivo vive en el bucket privado `comprobantes`. NO es facturación: sin IVA, sin comprobante emitido, sin CAE.';
comment on column comprobantes_recibidos.extraido is
  'Lo que la IA leyó de la imagen/PDF. Es una PROPUESTA que el dueño corrige antes de confirmar; el movimiento se crea con los valores revisados, no con estos. Único lugar con los datos fiscales del proveedor.';
comment on column comprobantes_recibidos.ruta is
  'El objeto en el bucket `comprobantes`: <lubricentro_id>/<uuid>.<ext>. No sale del servidor del tenant.';


-- ---------- 2 · RLS: patrón de tenant + gating por módulo ----------
-- Idéntico a ingresos/egresos. El gate del módulo va en el WITH CHECK
-- (nunca en el USING) y se repite en el front para avisar. Sub-select en
-- cada llamada de sesión (patrón R47, 20261021230000); plan_permite() no
-- se envuelve (ya está atada a mi_lubricentro_id por dentro).
alter table comprobantes_recibidos enable row level security;

create policy comprobantes_lectura on comprobantes_recibidos for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()));

create policy comprobantes_alta on comprobantes_recibidos for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

create policy comprobantes_edicion on comprobantes_recibidos for update to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()))
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('finanzas'))
    or (select soy_superadmin())
  );

-- Un comprobante no se borra: se descarta (estado). El borrado queda para
-- el superadmin, como en ingresos/egresos. El ARCHIVO del descartado lo
-- barre el cierre diario.
create policy comprobantes_borrado on comprobantes_recibidos for delete to authenticated
  using ((select soy_superadmin()));


-- ---------- 3 · Registrar el comprobante subido ----------
-- Lo llama la acción DESPUÉS de que el navegador subió el archivo al bucket
-- y el servidor validó sus bytes (molde del adjunto). Invoker: el RLS
-- impone tenant y módulo. El lubricentro y el autor salen de la sesión; la
-- ruta la construyó el servidor con el tenant de la sesión, y el CHECK
-- `comprobante_ruta_valida` confirma que apunta a su carpeta.
create or replace function registrar_comprobante(
  p_ruta      text,
  p_nombre    text,
  p_mime      text,
  p_bytes     integer,
  p_direccion text default 'compra'
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_nombre      text;
  v_id          uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    raise exception 'comprobante_sin_nombre';
  end if;
  if coalesce(p_direccion, 'compra') not in ('compra', 'venta') then
    raise exception 'comprobante_direccion_invalida';
  end if;

  insert into comprobantes_recibidos (
    lubricentro_id, usuario_id, direccion, ruta, nombre, mime, bytes
  ) values (
    v_lubricentro, auth.uid(), coalesce(p_direccion, 'compra'),
    p_ruta, v_nombre, p_mime, p_bytes
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function registrar_comprobante is
  'Crea el comprobante en estado sin_revisar tras la subida validada. Invoker: el RLS impone tenant y módulo. El lubricentro y el autor salen de la sesión.';

revoke all on function registrar_comprobante(text, text, text, integer, text) from public, anon;
grant execute on function registrar_comprobante(text, text, text, integer, text) to authenticated;


-- ---------- 4 · Guardar lo que leyó la IA ----------
-- Solo sobre un comprobante sin revisar: una vez confirmado o descartado,
-- lo leído queda congelado. Invoker: el RLS impone tenant y módulo.
create or replace function guardar_extraccion_comprobante(
  p_id       uuid,
  p_extraido jsonb
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_n integer;
begin
  update comprobantes_recibidos
     set extraido = coalesce(p_extraido, '{}'::jsonb)
   where id = p_id
     and estado = 'sin_revisar';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'comprobante_no_editable';
  end if;
end;
$$;

comment on function guardar_extraccion_comprobante is
  'Guarda la propuesta de la IA en un comprobante sin revisar. Invoker: el RLS recorta al tenant y exige el módulo.';

revoke all on function guardar_extraccion_comprobante(uuid, jsonb) from public, anon;
grant execute on function guardar_extraccion_comprobante(uuid, jsonb) to authenticated;


-- ---------- 5 · Confirmar: nace el egreso, en UNA transacción ----------
-- El corazón de "nunca auto-guarda": el dueño ya corrigió, y acá el
-- comprobante y su movimiento nacen juntos o no nacen. El egreso se crea
-- con guardar_egreso (invoker → pasa por la policy egresos_alta, que gatea
-- tenant y módulo), con los valores REVISADOS por la persona. Idempotente:
-- si ya no está sin_revisar, se rechaza, y el índice único de egreso_id
-- frena cualquier doble.
--
-- R1 solo hace la COMPRA (→ egreso). La venta (→ ingreso) es R2 y por eso
-- se rechaza explícitamente: un tipo nuevo no se cuela sin su rama.
create or replace function confirmar_comprobante(
  p_id          uuid,
  p_sucursal_id uuid,
  p_monto       numeric,
  p_concepto    text,
  p_medio       text default 'efectivo',
  p_fecha       date default current_date
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_direccion   text;
  v_estado      text;
  v_egreso      uuid;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  select direccion, estado into v_direccion, v_estado
  from comprobantes_recibidos
  where id = p_id and lubricentro_id = v_lubricentro
  for update;

  if not found then
    raise exception 'comprobante_inexistente';
  end if;
  if v_estado <> 'sin_revisar' then
    raise exception 'comprobante_no_pendiente';
  end if;
  if v_direccion <> 'compra' then
    -- La venta (→ ingreso) llega en R2; sin su rama no se confirma.
    raise exception 'comprobante_direccion_no_soportada';
  end if;

  -- El egreso, con lo que la persona revisó. guardar_egreso valida el monto
  -- y el concepto y, por su policy, el tenant y el módulo.
  v_egreso := guardar_egreso(p_sucursal_id, p_monto, p_concepto, p_medio, p_fecha);

  update comprobantes_recibidos
     set estado        = 'confirmado',
         egreso_id     = v_egreso,
         confirmado_at = now()
   where id = p_id;

  return v_egreso;
end;
$$;

comment on function confirmar_comprobante is
  'Confirma un comprobante de compra: crea el egreso (con los valores revisados) y marca confirmado, en la MISMA transacción. Invoker: el egreso pasa por la policy de egresos (tenant + módulo). Idempotente por estado y por el único de egreso_id.';

revoke all on function confirmar_comprobante(uuid, uuid, numeric, text, text, date) from public, anon;
grant execute on function confirmar_comprobante(uuid, uuid, numeric, text, text, date) to authenticated;


-- ---------- 6 · Descartar ----------
-- No se borra la fila (evidencia de que se subió algo que no iba): se marca
-- descartado con motivo. El archivo lo barre el cierre diario.
create or replace function descartar_comprobante(
  p_id     uuid,
  p_motivo text
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_motivo text;
  v_n      integer;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'comprobante_sin_motivo';
  end if;

  update comprobantes_recibidos
     set estado = 'descartado', motivo_descarte = v_motivo
   where id = p_id
     and estado = 'sin_revisar';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'comprobante_no_pendiente';
  end if;
end;
$$;

comment on function descartar_comprobante is
  'Descarta un comprobante sin revisar, con motivo (no se borra la fila). Invoker: el RLS recorta al tenant y exige el módulo.';

revoke all on function descartar_comprobante(uuid, text) from public, anon;
grant execute on function descartar_comprobante(uuid, text) to authenticated;


-- ---------- 7 · El bucket ----------
-- PRIVADO. 2 MB, PDF / JPEG / PNG. Mismo molde que `adjuntos`:
--   LEE: el superadmin todo; cada owner SU carpeta (para firmar la URL con
--   la que el panel muestra el archivo). `anon`, nada.
--   SUBE: cada owner a SU carpeta (URL firmada de subida, directo del
--   navegador al bucket).
--   BORRA: cada owner, de SU carpeta, y solo un archivo SIN fila (la subida
--   que no validó). El archivo registrado lo barre el cierre diario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  2097152, -- 2 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "comprobantes lectura"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (
      (select public.soy_superadmin())
      or (storage.foldername(name))[1] = (select public.mi_lubricentro_id())::text
    )
  );

create policy "comprobantes subida propia"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select public.mi_lubricentro_id())::text
  );

create policy "comprobantes borrado propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select public.mi_lubricentro_id())::text
    and not exists (select 1 from public.comprobantes_recibidos c where c.ruta = objects.name)
  );


-- ---------- 8 · Los archivos sin fila útil ----------
-- Un archivo queda para barrer cuando se subió y no se registró (la
-- validación falló), cuando su comprobante se descartó, o cuando el tenant
-- se purga. Se conservan los de un comprobante sin_revisar o confirmado.
-- NO lista lo subido en el último día: entre la subida y el registro pasan
-- segundos, y barrer ahí le borraría el archivo a quien está cargando.
create or replace function comprobantes_huerfanos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'comprobantes'
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from comprobantes_recibidos c
      where c.ruta = o.name and c.estado in ('sin_revisar', 'confirmado')
    )
  order by o.created_at
  limit 500;
$$;

comment on function comprobantes_huerfanos is
  'Los archivos del bucket `comprobantes` que no respaldan un comprobante vivo (sin fila, o de uno descartado) y se subieron hace más de un día. Solo service_role: la usa el cierre diario para borrarlos por la API de Storage.';

revoke all on function comprobantes_huerfanos() from public, anon, authenticated;
grant execute on function comprobantes_huerfanos() to service_role;
