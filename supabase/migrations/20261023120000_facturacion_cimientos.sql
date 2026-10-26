-- ============================================================
-- Fidelli Motors · Finanzas Nivel 3 — Facturación: CIMIENTOS (Rebanada 1)
--
-- El paso que cruza A PROPÓSITO la regla 6 de CLAUDE.md ("el presupuesto
-- NUNCA es comprobante; facturar es otro producto"). Facturación es un
-- sub-producto con peso legal/fiscal, y por eso entra en rebanadas.
--
-- QUÉ ES ESTA REBANADA, grabado acá para que nadie la "complete" de más:
--   · Son los CIMIENTOS, y NO piden un CAE a ARCA. Modelan el comprobante,
--     la configuración fiscal del tenant (punto de venta, modo de precios e
--     IVA), el IVA opcional por producto y el armado del comprobante en
--     estado `borrador` para previsualizarlo.
--   · La EMISIÓN REAL (pedir el CAE, numeración fiscal, estados emitido/
--     rechazado/anulado) es la REBANADA 2, detrás de la interfaz
--     EmisorFiscal (lib/facturacion/emisor.ts). Nada de acá llama a ARCA.
--   · EL MODELO DE CREDENCIALES FISCALES QUEDA 100% PARA LA REBANADA 2.
--     Fidelli no tiene CUIT propio hoy, así que la "delegación a nuestro
--     CUIT" no está decidida: la alternativa es certificado por tenant (el
--     taller con SU CUIT). Por eso config_facturacion NO guarda ni Clave
--     Fiscal, ni certificado, ni estado de delegación: esas columnas las
--     agrega la rebanada 2 cuando el modelo esté elegido.
--
-- MÓDULO PAGO, molde `neumaticos`/`finanzas`: 'facturacion' entra al
-- catálogo de features para que plan_permite() lo resuelva, NO figura en el
-- `features` de ningún plan, y se prende por tenant con el override de
-- /fidelli. Su precio vive en `modulos` y entra al monto de renovación.
-- Es INDEPENDIENTE de `finanzas`: un taller puede querer uno sin el otro.
-- Depende de `presupuestos` solo para el botón "facturar este presupuesto".
--
-- La purga (purgar_tenants_vencidos) NO se toca acá: sigue la convención de
-- los Niveles 1/2 de Finanzas (ingresos/egresos/deudas tampoco se sumaron).
-- Es un follow-up conocido, junto con esas tablas.
-- ============================================================


-- ---------- 1 · El catálogo de features: + 'facturacion' ----------
-- create or replace sobre la fuente de verdad ejecutable. El espejo tipado
-- va en lib/planes.ts, en el MISMO PR.
-- >>> catalogo_features_plan
create or replace function catalogo_features_plan()
returns text[] language sql immutable as $$
  select array[
    'mecanica', 'pendientes', 'premios',
    'presupuestos', 'personalizacion_pagina', 'pagina_premium',
    -- Módulo pago aparte del plan. No va en el features de ningún plan.
    'neumaticos',
    -- El service de caja automática: por tenant, con el override, SIN costo.
    'caja',
    -- Finanzas: MÓDULO PAGO, con fila en `modulos`.
    'finanzas',
    -- Facturación electrónica (Nivel 3): MÓDULO PAGO, como `finanzas`. Fila
    -- en `modulos` (entra al monto), se prende por tenant con el override, y
    -- no va en el features de ningún plan. -- @feature-facturacion
    'facturacion'
  ];
$$;
-- <<< catalogo_features_plan

comment on function catalogo_features_plan is
  'El catálogo canónico de features. Su espejo tipado está en lib/planes.ts. ''neumaticos'', ''finanzas'' y ''facturacion'' son MÓDULOS PAGOS y ''caja'' una feature sin costo: todas están acá para que plan_permite() las resuelva, pero no figuran en el features de ningún plan — se habilitan por tenant con el override.';


-- ---------- 2 · El precio del módulo ----------
-- $15.000 mensuales, valor semilla (igual que finanzas). Santiago/Gregorio
-- lo mueven desde /fidelli → Plan y precios con fijar_precio_modulo()
-- (motivo + auditoría). `codigo` = el valor de ModuloPago en lib/planes.ts.
-- Si no coinciden, el monto sale en cero y en silencio: lo vigila R20a.
insert into modulos (codigo, nombre, precio_mensual) values
  ('facturacion', 'Módulo Facturación', 15000);


-- ---------- 3 · El IVA opcional por producto ----------
-- Hoy productos.precio_venta es un solo número sin IVA (regla 6). Para
-- facturar hace falta la alícuota, PERO sin obligar a cargarla: null = usa
-- la alícuota default del tenant (config_facturacion.iva_alicuota_default).
-- Las tres que soporta esta rebanada: 21, 10.5 y 0 (exento). @alicuota-prod
alter table productos
  add column iva_alicuota numeric(4,2)
    constraint iva_alicuota_valida check (iva_alicuota is null or iva_alicuota in (0, 10.5, 21));

comment on column productos.iva_alicuota is
  'Alícuota de IVA de ESTE producto para facturación (0 / 10.5 / 21). NULL = usa la default del tenant. No discrimina IVA en el presupuesto: solo pesa al facturar.';


-- ---------- 4 · La configuración fiscal del tenant ----------
-- Una fila por tenant. Lo fiscal que NO va en datos_empresa (su migración
-- prohíbe explícitamente el punto de venta y todo lo de comprobante). La
-- identidad del emisor (CUIT, condición IVA, domicilio) sigue en
-- datos_empresa; acá va lo operativo de facturar.
create table config_facturacion (
  lubricentro_id        uuid primary key references lubricentros(id) on delete cascade,
  -- El punto de venta habilitado en ARCA para el web service. Null = todavía
  -- no configurado. En rebanada 2 se valida contra ARCA.
  punto_venta           integer check (punto_venta is null or (punto_venta between 1 and 99999)),
  -- Cómo se cargaron los precios del taller: finales (IVA incluido, lo que
  -- piensa el mostrador) o netos. Decide cómo se desglosa el IVA al armar el
  -- comprobante. Default: finales.
  precios_incluyen_iva  boolean not null default true,
  -- La alícuota por defecto para los productos sin alícuota propia.
  iva_alicuota_default  numeric(4,2) not null default 21
    constraint iva_default_valida check (iva_alicuota_default in (0, 10.5, 21)),
  updated_at            timestamptz not null default now(),
  actualizado_por       uuid references usuarios(id) on delete set null
);

comment on table config_facturacion is
  'Config fiscal del tenant para facturación (Nivel 3): punto de venta, modo de precios (finales/netos) y alícuota default. NO guarda Clave Fiscal, certificado ni estado de delegación: el modelo de credenciales se decide y se agrega en la rebanada 2. La identidad del emisor (CUIT, condición IVA) vive en datos_empresa.';

-- El sello lo pone la base, no el navegador (mismo criterio que datos_empresa).
-- >>> config_facturacion_sellar
create function config_facturacion_sellar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.actualizado_por := auth.uid(); -- @sello
  return new;
end;
$$;
-- <<< config_facturacion_sellar

create trigger config_facturacion_sello
  before insert or update on config_facturacion
  for each row execute function config_facturacion_sellar();

alter table config_facturacion enable row level security; -- @rls-config

create policy config_facturacion_lectura on config_facturacion for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin())); -- @rls-config-lectura

-- El gating del módulo en el WITH CHECK (regla 2: se apaga la escritura, no
-- la lectura). Un tenant que pierde el módulo sigue viendo su config.
create policy config_facturacion_alta on config_facturacion for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('facturacion'))
    or (select soy_superadmin())
  ); -- @rls-config-alta

create policy config_facturacion_edicion on config_facturacion for update to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()))
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('facturacion'))
    or (select soy_superadmin())
  ); -- @rls-config-edicion

-- Por columnas: el sello no se escribe desde afuera.
revoke all on config_facturacion from public, anon, authenticated;
grant select on config_facturacion to authenticated;
grant insert (lubricentro_id, punto_venta, precios_incluyen_iva, iva_alicuota_default)
  on config_facturacion to authenticated;
grant update (punto_venta, precios_incluyen_iva, iva_alicuota_default)
  on config_facturacion to authenticated;


-- ---------- 5 · La puerta de la config fiscal ----------
-- Invoker, molde guardar_datos_empresa: el RLS impone tenant y módulo. El
-- tenant es el de la sesión; solo Fidelli elige otro (p_lubricentro_id).
-- Upsert de los cinco campos editables.
-- >>> guardar_config_facturacion
create function guardar_config_facturacion(
  p_datos          jsonb,
  p_lubricentro_id uuid default null
)
returns config_facturacion
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lub    uuid;
  v_clave  text;
  v_pv     integer;
  v_mode   boolean;
  v_alic   numeric;
  v_fila   config_facturacion;
begin
  if soy_superadmin() then
    v_lub := p_lubricentro_id;
  else
    v_lub := mi_lubricentro_id();
    if p_lubricentro_id is not null and p_lubricentro_id is distinct from v_lub then
      raise exception 'otro_lubricentro' using errcode = '42501';
    end if;
  end if;
  if v_lub is null then
    raise exception 'falta_lubricentro';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'datos_invalidos';
  end if;
  -- Una clave que no es de la lista REVIENTA, no se ignora (regla 3). -- @claves
  select k into v_clave
    from jsonb_object_keys(p_datos) k
   where k not in ('punto_venta', 'precios_incluyen_iva', 'iva_alicuota_default')
   limit 1;
  if v_clave is not null then
    raise exception 'clave_desconocida' using detail = v_clave;
  end if;

  if p_datos ? 'punto_venta' and jsonb_typeof(p_datos -> 'punto_venta') <> 'null' then
    v_pv := (p_datos ->> 'punto_venta')::integer;
    if v_pv < 1 or v_pv > 99999 then
      raise exception 'punto_venta_invalido';
    end if;
  end if;

  v_mode := coalesce((p_datos ->> 'precios_incluyen_iva')::boolean, true);

  v_alic := coalesce((p_datos ->> 'iva_alicuota_default')::numeric, 21);
  if v_alic not in (0, 10.5, 21) then
    raise exception 'alicuota_invalida';
  end if;

  insert into config_facturacion (lubricentro_id, punto_venta, precios_incluyen_iva, iva_alicuota_default)
  values (v_lub, v_pv, v_mode, v_alic)
  on conflict (lubricentro_id) do update set
    punto_venta          = excluded.punto_venta,
    precios_incluyen_iva = excluded.precios_incluyen_iva,
    iva_alicuota_default = excluded.iva_alicuota_default
  returning * into v_fila;

  return v_fila;
end;
$$;
-- <<< guardar_config_facturacion

comment on function guardar_config_facturacion is
  'La única puerta de config_facturacion: valida y hace el upsert. Security invoker: rige la RLS (tenant + módulo). El tenant es el de la sesión; p_lubricentro_id es solo para el superadmin.';

revoke all on function guardar_config_facturacion(jsonb, uuid) from public, anon;
grant execute on function guardar_config_facturacion(jsonb, uuid) to authenticated;


-- ---------- 6 · Qué letra de comprobante corresponde ----------
-- Fuente única de la regla. El emisor es de datos_empresa (RI / monotributo
-- / exento); el receptor agrega 'consumidor_final'. Espejado en TS solo
-- para pintar (lib/facturacion/tipos.ts).
--   · Emisor RI → receptor RI = A; receptor otro = B.
--   · Emisor monotributo o exento → siempre C.
-- >>> tipo_comprobante_para
create function tipo_comprobante_para(p_emisor text, p_receptor text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_emisor = 'responsable_inscripto' then
      case when p_receptor = 'responsable_inscripto' then 'factura_a' -- @tipo-a
           else 'factura_b' end -- @tipo-b
    when p_emisor in ('monotributo', 'exento') then 'factura_c' -- @tipo-c
    else null
  end;
$$;
-- <<< tipo_comprobante_para

comment on function tipo_comprobante_para is
  'La letra del comprobante según la condición del emisor y del receptor. Fuente única; su espejo tipado está en lib/facturacion/tipos.ts. RI→RI=A, RI→otro=B, monotributo/exento=C.';


-- ---------- 7 · El comprobante (el documento fiscal) ----------
-- Modelado independiente del proveedor. En esta rebanada vive en estado
-- `borrador`: la numeración fiscal y el CAE son null hasta la rebanada 2.
create table comprobantes (
  id                   uuid primary key default gen_random_uuid(),
  lubricentro_id       uuid not null references lubricentros(id) on delete restrict,
  sucursal_id          uuid not null references sucursales(id) on delete restrict,
  usuario_id           uuid not null references usuarios(id) on delete restrict,
  -- La letra. text + CHECK (no enum: la regla 14 es un pozo que no hace
  -- falta pisar). Factura y notas de crédito/débito A/B/C. -- @tipo-check
  tipo                 text not null
    constraint tipo_valido check (tipo in (
      'factura_a', 'factura_b', 'factura_c',
      'nota_credito_a', 'nota_credito_b', 'nota_credito_c',
      'nota_debito_a', 'nota_debito_b', 'nota_debito_c'
    )),
  -- El punto de venta + número FISCAL. Null hasta emitir (rebanada 2). El
  -- borrador no tiene numeración fiscal: la asigna ARCA. -- @numero-null
  punto_venta          integer,
  numero               integer,
  fecha                date not null default current_date,
  -- El receptor. CUIT normalizado (11 dígitos) o null (consumidor final sin
  -- identificar). La condición agrega 'consumidor_final' a las tres.
  receptor_cuit        text constraint receptor_cuit_formato
                         check (receptor_cuit is null or receptor_cuit ~ '^\d{11}$'),
  receptor_nombre      text,
  receptor_condicion   text not null
    constraint receptor_condicion_valida check (receptor_condicion in (
      'responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'
    )),
  -- Importes. Todos numeric(12,2). El desglose lo calcula la base. El IVA de
  -- la Factura C es siempre 0 (monotributo/exento no discriminan).
  neto_gravado         numeric(12,2) not null default 0 check (neto_gravado >= 0),
  neto_no_gravado      numeric(12,2) not null default 0 check (neto_no_gravado >= 0),
  iva_105              numeric(12,2) not null default 0 check (iva_105 >= 0),
  iva_21               numeric(12,2) not null default 0 check (iva_21 >= 0),
  exento               numeric(12,2) not null default 0 check (exento >= 0),
  total                numeric(12,2) not null check (total >= 0),
  -- De qué presupuesto nació (opcional). set null: el comprobante sobrevive.
  presupuesto_id       uuid references presupuestos(id) on delete set null,
  cliente_id           uuid references clientes(id) on delete set null,
  -- El ciclo de vida. En rebanada 1 solo llega a `borrador`. -- @estado-check
  estado               text not null default 'borrador'
    constraint estado_valido check (estado in ('borrador', 'emitido', 'rechazado', 'anulado')),
  -- El CAE y su vencimiento: los pone la emisión real (rebanada 2).
  cae                  text,
  cae_vencimiento      date,
  -- El id del comprobante del lado del emisor fiscal (proveedor o AFIP).
  emisor_ref           text,
  created_at           timestamptz not null default now(),

  -- Coherencia del borrador: sin numeración fiscal ni CAE mientras es
  -- borrador; con ellos cuando está emitido. -- @coherencia-borrador
  constraint borrador_sin_cae check (
    estado <> 'borrador' or (numero is null and cae is null)
  ),
  -- Una numeración fiscal no se repite dentro de un punto de venta y tipo.
  -- Parcial: se activa recién cuando hay número (rebanada 2). -- @numero-unico
  constraint numero_fiscal check (numero is null or (punto_venta is not null and numero > 0))
);

create unique index comprobantes_numero_fiscal_idx
  on comprobantes (lubricentro_id, punto_venta, tipo, numero)
  where numero is not null;

create index comprobantes_lubricentro_fecha_idx
  on comprobantes (lubricentro_id, fecha desc);

comment on table comprobantes is
  'Comprobante fiscal (Finanzas Nivel 3). Modelado independiente del proveedor. En la rebanada 1 solo llega a estado borrador: numero fiscal y CAE son null hasta la emisión real (rebanada 2). El desglose de IVA lo calcula la base.';

create table comprobante_items (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references comprobantes(id) on delete cascade,
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  orden           integer not null,
  descripcion     text not null,
  cantidad        numeric(10,2) not null default 1 check (cantidad > 0),
  -- El precio unitario NETO (sin IVA) congelado: el comprobante no se
  -- recalcula si cambia el presupuesto o el producto.
  precio_unitario_neto numeric(12,2) not null check (precio_unitario_neto >= 0),
  iva_alicuota    numeric(4,2) not null check (iva_alicuota in (0, 10.5, 21)),
  importe_neto    numeric(12,2) not null check (importe_neto >= 0),

  constraint descripcion_no_vacia check (char_length(trim(descripcion)) >= 2)
);

create index comprobante_items_comprobante_idx on comprobante_items (comprobante_id, orden);

comment on table comprobante_items is
  'Renglones congelados de un comprobante: descripción, cantidad, precio unitario NETO y alícuota. Snapshot — no se recalcula si cambia el presupuesto de origen.';


-- ---------- 8 · RLS de los comprobantes ----------
alter table comprobantes enable row level security; -- @rls-comp
alter table comprobante_items enable row level security; -- @rls-item

create policy comprobantes_lectura on comprobantes for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin())); -- @rls-comp-lectura

-- Gating del módulo en el WITH CHECK (regla 2).
create policy comprobantes_alta on comprobantes for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('facturacion'))
    or (select soy_superadmin())
  ); -- @rls-comp-alta

create policy comprobantes_edicion on comprobantes for update to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin()))
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('facturacion'))
    or (select soy_superadmin())
  ); -- @rls-comp-edicion

-- Sin delete para el owner (molde presupuestos/ingresos): un comprobante
-- errado se anula, no se borra. Solo el superadmin.
create policy comprobantes_borrado on comprobantes for delete to authenticated
  using ((select soy_superadmin())); -- @rls-comp-borrado

create policy comprobante_items_lectura on comprobante_items for select to authenticated
  using (lubricentro_id = (select mi_lubricentro_id()) or (select soy_superadmin())); -- @rls-item-lectura

create policy comprobante_items_alta on comprobante_items for insert to authenticated
  with check (
    (lubricentro_id = (select mi_lubricentro_id()) and plan_permite('facturacion'))
    or (select soy_superadmin())
  ); -- @rls-item-alta

create policy comprobante_items_borrado on comprobante_items for delete to authenticated
  using ((select soy_superadmin())); -- @rls-item-borrado

-- anon no toca nada; authenticated tiene los cuatro privilegios y las
-- POLICIES los gatean (alta/edición por módulo, borrado solo superadmin).
revoke all on comprobantes from public, anon;
grant select, insert, update, delete on comprobantes to authenticated;
revoke all on comprobante_items from public, anon;
grant select, insert, delete on comprobante_items to authenticated;


-- ---------- 9 · Armar el comprobante desde un presupuesto ----------
-- Calcula el desglose de IVA según el modo de precios del tenant y la
-- alícuota de cada renglón, elige la letra, y crea el comprobante en estado
-- `borrador` con sus renglones congelados. NO llama a ARCA: la emisión real
-- es la rebanada 2 (EmisorFiscal). Invoker: el RLS impone tenant y módulo.
--
-- El desglose de IVA es LA fuente de verdad (lib/facturacion/iva.ts lo
-- espeja para el preview en vivo del navegador).
-- >>> armar_comprobante_desde_presupuesto
create function armar_comprobante_desde_presupuesto(
  p_presupuesto_id    uuid,
  p_receptor_condicion text,
  p_receptor_cuit     text default null,
  p_receptor_nombre   text default null
)
returns comprobantes
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lub        uuid := mi_lubricentro_id();
  v_pres       presupuestos;
  v_emisor     text;
  v_pv         integer;
  v_incluye    boolean;
  v_alic_def   numeric;
  v_cuit       text;
  v_tipo       text;
  v_comp       comprobantes;
  r            record;
  v_alic       numeric;
  v_neto_unit  numeric;
  v_importe    numeric;
  v_ord        integer := 0;
  v_neto_grav  numeric := 0;
  v_neto_ex    numeric := 0;
  v_iva105     numeric := 0;
  v_iva21      numeric := 0;
  v_total      numeric := 0;
begin
  if v_lub is null then
    raise exception 'falta_lubricentro';
  end if;

  select * into v_pres from presupuestos where id = p_presupuesto_id;
  if not found then
    raise exception 'presupuesto_no_encontrado';
  end if;

  -- La condición del emisor sale de datos_empresa; sin ella no se factura.
  select condicion_iva into v_emisor from datos_empresa where lubricentro_id = v_lub;
  if v_emisor is null or v_emisor not in ('responsable_inscripto', 'monotributo', 'exento') then
    raise exception 'emisor_sin_condicion_iva'; -- @emisor-sin-condicion
  end if;

  if p_receptor_condicion not in ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final') then
    raise exception 'receptor_condicion_invalida';
  end if;

  v_tipo := tipo_comprobante_para(v_emisor, p_receptor_condicion); -- @elige-tipo
  if v_tipo is null then
    raise exception 'tipo_comprobante_indeterminado';
  end if;

  -- La config del tenant (o los defaults si todavía no la tocó).
  select punto_venta, precios_incluyen_iva, iva_alicuota_default
    into v_pv, v_incluye, v_alic_def
    from config_facturacion where lubricentro_id = v_lub;
  v_incluye := coalesce(v_incluye, true);
  v_alic_def := coalesce(v_alic_def, 21);

  v_cuit := nullif(regexp_replace(coalesce(p_receptor_cuit, ''), '\D', '', 'g'), '');
  if v_cuit is not null and char_length(v_cuit) <> 11 then
    raise exception 'receptor_cuit_invalido';
  end if;

  -- El comprobante, en borrador. Sin punto de venta ni número fiscal (los
  -- pone la emisión real). total/importes se completan al final.
  insert into comprobantes (
    lubricentro_id, sucursal_id, usuario_id, tipo, fecha,
    receptor_cuit, receptor_nombre, receptor_condicion,
    presupuesto_id, cliente_id, estado, total
  ) values (
    v_lub, v_pres.sucursal_id, auth.uid(), v_tipo, current_date,
    v_cuit, nullif(trim(coalesce(p_receptor_nombre, '')), ''), p_receptor_condicion,
    v_pres.id, v_pres.cliente_id, 'borrador', 0
  ) returning * into v_comp;

  -- Renglón por renglón: la alícuota del producto no la sabemos desde el
  -- presupuesto (el renglón es texto + precio), así que en la rebanada 1 se
  -- usa la default del tenant. En una Factura C no hay IVA: alícuota 0.
  for r in
    select descripcion, cantidad, precio_unitario
      from presupuesto_items
     where presupuesto_id = v_pres.id
     order by orden
  loop
    v_ord := v_ord + 1;
    v_alic := case when v_tipo = 'factura_c' then 0 else v_alic_def end; -- @alic-por-renglon

    -- El precio unitario NETO según el modo de precios del tenant.
    if v_incluye and v_alic > 0 then
      v_neto_unit := round(r.precio_unitario / (1 + v_alic / 100), 2); -- @neto-desde-final
    else
      v_neto_unit := r.precio_unitario; -- neto directo, o C (sin IVA)
    end if;

    v_importe := round(v_neto_unit * r.cantidad, 2);

    insert into comprobante_items (
      comprobante_id, lubricentro_id, orden, descripcion, cantidad,
      precio_unitario_neto, iva_alicuota, importe_neto
    ) values (
      v_comp.id, v_lub, v_ord, r.descripcion, r.cantidad,
      v_neto_unit, v_alic, v_importe
    );

    -- Acumular el desglose. @desglose
    if v_alic = 0 then
      if v_tipo = 'factura_c' then
        v_neto_grav := v_neto_grav + v_importe; -- C: todo "neto", sin IVA
      else
        v_neto_ex := v_neto_ex + v_importe;      -- exento en A/B
      end if;
    else
      v_neto_grav := v_neto_grav + v_importe;
      if v_alic = 10.5 then
        v_iva105 := v_iva105 + round(v_importe * v_alic / 100, 2);
      else
        v_iva21 := v_iva21 + round(v_importe * v_alic / 100, 2);
      end if;
    end if;
  end loop;

  v_total := v_neto_grav + v_neto_ex + v_iva105 + v_iva21;

  update comprobantes set
    neto_gravado    = v_neto_grav,
    neto_no_gravado = 0,
    exento          = v_neto_ex,
    iva_105         = v_iva105,
    iva_21          = v_iva21,
    total           = v_total
  where id = v_comp.id
  returning * into v_comp;

  return v_comp;
end;
$$;
-- <<< armar_comprobante_desde_presupuesto

comment on function armar_comprobante_desde_presupuesto is
  'Arma un comprobante en estado borrador desde un presupuesto: elige la letra (tipo_comprobante_para), desglosa el IVA según el modo de precios del tenant y crea los renglones congelados. NO llama a ARCA (eso es la rebanada 2). Invoker: RLS impone tenant y módulo.';

revoke all on function armar_comprobante_desde_presupuesto(uuid, text, text, text) from public, anon;
grant execute on function armar_comprobante_desde_presupuesto(uuid, text, text, text) to authenticated;
