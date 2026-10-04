-- ============================================================
-- Fidelli Motors · Los datos de la empresa en el presupuesto
--
-- Pedido de un lubricentro grande: el presupuesto tiene que decir QUIÉN lo
-- emite. Uno que el cliente lleva a su empresa, a una aseguradora o a una
-- flota se aprueba con razón social y CUIT, y sin eso no. Hasta hoy la
-- base no tenía ni una cosa ni la otra del tenant (solo el CUIT del cliente
-- final, clientes.cuit).
--
-- LO QUE ES, Y LO QUE NO. Es la identificación del emisor de un
-- presupuesto, OPCIONAL: sin ningún dato, el presupuesto sale como siempre.
-- NO es un comprobante: acá no hay —ni va a haber— punto de venta,
-- numeración fiscal, CAE, ingresos brutos ni inicio de actividades. Un
-- presupuesto no es un documento fiscal y no se lo disfraza de uno (regla
-- 6: el día que esto se parezca a una factura hay que sostener IVA, notas
-- de crédito y numeración).
--
-- Una tabla aparte y no seis columnas en `lubricentros`: así el owner la
-- edita con SU propia RLS y no se toca la lista de lo que el ABM de
-- /fidelli deja o no deja cambiar. Una fila por tenant; el nombre de
-- fantasía sigue siendo lubricentros.nombre y no se duplica acá.
--
--   · Se usa SOLO en el presupuesto (el documento en pantalla y su PDF).
--     No en la página del cliente, ni en los mails, ni en el cartón:
--     get_carton y get_landing no la leen, y `anon` no tiene nada sobre
--     ella.
--   · Sin snapshot: el presupuesto se arma con los datos vigentes al
--     abrirlo, como hoy con el nombre y el logo.
--   · No se borra: se vacían los campos. Nadie tiene DELETE; la única que
--     la borra es la purga de un tenant cancelado.
-- ============================================================


-- ---------- 1 · La tabla ----------
create table datos_empresa (
  lubricentro_id  uuid primary key references lubricentros(id) on delete cascade,
  razon_social    text,
  -- El MISMO criterio que clientes.cuit (20260728120000): once números
  -- pelados. Los guiones son presentación y los pone el front; el dígito
  -- verificador advierte en el formulario y no bloquea.
  cuit            text,
  condicion_iva   text,
  domicilio       text,
  telefono        text,
  email           text,
  updated_at      timestamptz not null default now(),
  actualizado_por uuid references usuarios(id) on delete set null,

  constraint cuit_formato
    check (cuit is null or cuit ~ '^\d{11}$'), -- @check-cuit
  constraint condicion_iva_valida
    check (condicion_iva is null or condicion_iva in ('responsable_inscripto', 'monotributo', 'exento')), -- @check-iva
  -- Los cuatro textos: o null, o un renglón de verdad —sin espacios a los
  -- costados, sin saltos ni tabulaciones, y de un largo que entra en el
  -- encabezado—. «Vacío» es null, nunca ''. El email no lleva formato: el
  -- proyecto no valida el de nadie (ver clientes).
  constraint razon_social_valida
    check (razon_social is null or (char_length(razon_social) between 1 and 120 and razon_social = btrim(razon_social) and razon_social !~ '[[:cntrl:]]')), -- @check-razon
  constraint domicilio_valido
    check (domicilio is null or (char_length(domicilio) between 1 and 160 and domicilio = btrim(domicilio) and domicilio !~ '[[:cntrl:]]')), -- @check-domicilio
  constraint telefono_valido
    check (telefono is null or (char_length(telefono) between 1 and 40 and telefono = btrim(telefono) and telefono !~ '[[:cntrl:]]')), -- @check-telefono
  constraint email_valido
    check (email is null or (char_length(email) between 1 and 120 and email = btrim(email) and email !~ '[[:cntrl:]]')) -- @check-email
);

comment on table datos_empresa is
  'Identificación del emisor del presupuesto (razón social, CUIT, condición frente al IVA, domicilio, teléfono, email). Opcional, una fila por tenant, sin snapshot. Nunca un comprobante. Se escribe por guardar_datos_empresa(); no se borra, se vacía.';
comment on column datos_empresa.cuit is
  'CUIT normalizado: 11 dígitos sin guiones, el mismo criterio que clientes.cuit. Solo en el presupuesto.';
comment on column datos_empresa.actualizado_por is
  'Quién guardó por última vez: el owner, o el superadmin que los cargó desde la ficha de /fidelli. Lo pone el trigger, no el que escribe.';


-- ---------- 2 · El sello: cuándo y quién ----------
-- Lo pone la base, no el navegador: con el sello en manos de quien
-- escribe, un update por la API directa firmaría con el usuario que
-- quisiera. Sin sesión (psql, la purga) queda en null.
-- >>> datos_empresa_sellar
create function datos_empresa_sellar()
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
-- <<< datos_empresa_sellar

create trigger datos_empresa_sello
  before insert or update on datos_empresa
  for each row execute function datos_empresa_sellar();


-- ---------- 3 · RLS y privilegios ----------
-- El owner lee y escribe LA fila de su tenant; Fidelli, la de cualquiera
-- (los carga por el lubricentro desde la ficha). No hay policy de borrado
-- ni grant de DELETE: se vacían los campos.
alter table datos_empresa enable row level security; -- @rls

create policy datos_empresa_lectura on datos_empresa for select to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin()); -- @rls-lectura

create policy datos_empresa_alta on datos_empresa for insert to authenticated
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin()); -- @rls-alta

create policy datos_empresa_edicion on datos_empresa for update to authenticated
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin()) -- @rls-edicion
  with check (lubricentro_id = mi_lubricentro_id() or soy_superadmin()); -- @rls-edicion-check

-- Por columnas: el sello (updated_at, actualizado_por) no se escribe desde
-- afuera, y una fila no cambia de tenant.
revoke all on datos_empresa from public, anon, authenticated;
grant select on datos_empresa to authenticated;
grant insert (lubricentro_id, razon_social, cuit, condicion_iva, domicilio, telefono, email)
  on datos_empresa to authenticated; -- @grant-alta
grant update (razon_social, cuit, condicion_iva, domicilio, telefono, email)
  on datos_empresa to authenticated; -- @grant-edicion


-- ---------- 4 · La puerta ----------
-- Mi cuenta y la ficha de /fidelli llaman lo mismo. Recorta, normaliza el
-- CUIT, valida y hace el upsert. ESCRIBE LOS SEIS CAMPOS: lo que no viene
-- (o viene vacío) queda en null — es un formulario entero, no un parche.
--
-- security INVOKER: el upsert pasa por las policies de arriba, así que la
-- función no abre nada que la tabla no abra. El tenant es el de la sesión;
-- solo Fidelli elige otro (p_lubricentro_id), y un owner que lo intenta
-- recibe 42501 antes de llegar a la tabla.
--
-- Una clave que no es de la lista REVIENTA en vez de ignorarse (el mismo
-- criterio que plan_permite, regla 3): como lo que no viene se vacía, un
-- `razonSocial` mal escrito borraría la razón social sin avisar.
-- >>> guardar_datos_empresa
create function guardar_datos_empresa(
  p_datos          jsonb,
  p_lubricentro_id uuid default null
)
returns datos_empresa
language plpgsql
volatile
set search_path = public -- @invoker
as $$
declare
  v_lub   uuid;
  v_clave text;
  v_cuit  text;
  v_iva   text;
  v_razon text;
  v_dom   text;
  v_tel   text;
  v_email text;
  v_fila  datos_empresa;
begin
  if soy_superadmin() then
    v_lub := p_lubricentro_id;
  else
    v_lub := mi_lubricentro_id();
    if p_lubricentro_id is not null and p_lubricentro_id is distinct from v_lub then -- @otro-tenant
      raise exception 'otro_lubricentro' using errcode = '42501';
    end if;
  end if;
  if v_lub is null then
    raise exception 'falta_lubricentro'; -- @falta-lubricentro
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'datos_invalidos';
  end if;
  select k into v_clave
    from jsonb_object_keys(p_datos) k
   where k not in ('razon_social', 'cuit', 'condicion_iva', 'domicilio', 'telefono', 'email') -- @claves
   limit 1;
  if v_clave is not null then
    raise exception 'clave_desconocida' using detail = v_clave;
  end if;

  -- El CUIT, como en clientes: se le sacan guiones, puntos y espacios, y
  -- tienen que quedar los once números. A medias no sirve para nada.
  v_cuit := nullif(regexp_replace(coalesce(p_datos ->> 'cuit', ''), '\D', '', 'g'), ''); -- @cuit-normaliza
  if v_cuit is not null and char_length(v_cuit) <> 11 then -- @cuit-valida
    raise exception 'cuit_invalido';
  end if;

  v_iva := nullif(btrim(coalesce(p_datos ->> 'condicion_iva', ''), E' \t\n\r'), '');
  if v_iva is not null and v_iva not in ('responsable_inscripto', 'monotributo', 'exento') then -- @iva-valida
    raise exception 'condicion_iva_invalida';
  end if;

  v_razon := nullif(btrim(coalesce(p_datos ->> 'razon_social', ''), E' \t\n\r'), ''); -- @recorta
  v_dom   := nullif(btrim(coalesce(p_datos ->> 'domicilio', ''), E' \t\n\r'), '');
  v_tel   := nullif(btrim(coalesce(p_datos ->> 'telefono', ''), E' \t\n\r'), '');
  v_email := nullif(btrim(coalesce(p_datos ->> 'email', ''), E' \t\n\r'), '');
  if char_length(v_razon) > 120 or char_length(v_dom) > 160 or char_length(v_tel) > 40 or char_length(v_email) > 120 then -- @largos
    raise exception 'dato_demasiado_largo';
  end if;

  insert into datos_empresa (lubricentro_id, razon_social, cuit, condicion_iva, domicilio, telefono, email)
  values (v_lub, v_razon, v_cuit, v_iva, v_dom, v_tel, v_email)
  on conflict (lubricentro_id) do update set
    razon_social  = excluded.razon_social,
    cuit          = excluded.cuit,
    condicion_iva = excluded.condicion_iva,
    domicilio     = excluded.domicilio,
    telefono      = excluded.telefono,
    email         = excluded.email
  returning * into v_fila;

  return v_fila;
end;
$$;
-- <<< guardar_datos_empresa

comment on function guardar_datos_empresa is
  'La única puerta de datos_empresa: recorta, normaliza el CUIT a once números, valida y hace el upsert de los seis campos (lo que no viene queda en null). Security invoker: rige la RLS de la tabla. El tenant es el de la sesión; p_lubricentro_id es solo para el superadmin.';

revoke all on function guardar_datos_empresa(jsonb, uuid) from public, anon;
grant execute on function guardar_datos_empresa(jsonb, uuid) to authenticated; -- @grant-puerta


-- ---------- 5 · La purga se la lleva ----------
-- datos_empresa es operativo del tenant: a los 12 meses de cancelar se va
-- con el resto. La fila de `lubricentros` NO se borra en la purga (queda
-- con purgado_at), así que la cascada de la FK no alcanza: hay que
-- nombrarla. Textual de 20260922140000 más DOS líneas —el conteo y el
-- delete—; ni una más.
-- >>> purgar_tenants_vencidos
create or replace function purgar_tenants_vencidos(
  p_simular        boolean default true,
  p_lubricentro_id uuid    default null,
  p_motivo         text    default null
)
returns setof purgas
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_lub     record;
  v_logo    text;
  v_conteos jsonb;
  v_purga   purgas;
  v_hechas  integer := 0;
begin
  -- Con sesión, solo Fidelli. Sin sesión (pg_cron, psql) es una llamada de
  -- la base. anon no tiene execute sobre esta función.
  if v_uid is not null and not soy_superadmin() then                   -- @guard
    raise exception 'solo_fidelli' using errcode = '42501';
  end if;

  if p_lubricentro_id is not null and (v_motivo is null or char_length(v_motivo) < 10) then
    raise exception 'motivo_insuficiente';
  end if;

  for v_lub in
    select l.id, l.slug, s.cancelada_at
      from lubricentros l
      -- La suscripción VIGENTE: la última que arrancó, el mismo criterio
      -- que el listado y la ficha de /fidelli.
      join lateral (
        select su.estado, su.cancelada_at
          from suscripciones su
         where su.lubricentro_id = l.id
         order by su.inicio desc, su.created_at desc
         limit 1
      ) s on true
     where l.purgado_at is null
       and l.slug <> 'demo'                                            -- @demo
       and s.estado = 'cancelada'
       and s.cancelada_at is not null
       and (
         (p_lubricentro_id is null
          and s.cancelada_at <= now() - interval '12 months')          -- @plazo
         or p_lubricentro_id = l.id
       )
     order by s.cancelada_at
  loop
    select logo_url into v_logo from config_experiencia where lubricentro_id = v_lub.id;

    v_conteos := jsonb_strip_nulls(jsonb_build_object(
      'clientes',             (select count(*) from clientes             where lubricentro_id = v_lub.id),
      'vehiculos',            (select count(*) from vehiculos            where lubricentro_id = v_lub.id),
      'services',             (select count(*) from services             where lubricentro_id = v_lub.id),
      'service_items',        (select count(*) from service_items        where lubricentro_id = v_lub.id),
      'service_ruedas',       (select count(*) from service_ruedas       where lubricentro_id = v_lub.id),
      'canjes',               (select count(*) from canjes               where lubricentro_id = v_lub.id),
      'contactos',            (select count(*) from contactos            where lubricentro_id = v_lub.id),
      'notas_vehiculo',       (select count(*) from notas_vehiculo       where lubricentro_id = v_lub.id),
      'trabajos_pendientes',  (select count(*) from trabajos_pendientes  where lubricentro_id = v_lub.id),
      'presupuestos',         (select count(*) from presupuestos         where lubricentro_id = v_lub.id),
      'presupuesto_items',    (select count(*) from presupuesto_items    where lubricentro_id = v_lub.id),
      'correcciones_patente', (select count(*) from correcciones_patente where lubricentro_id = v_lub.id),
      'supresiones_cliente',  (select count(*) from supresiones_cliente  where lubricentro_id = v_lub.id),
      'productos',            (select count(*) from productos            where lubricentro_id = v_lub.id),
      'premios',              (select count(*) from premios              where lubricentro_id = v_lub.id),
      'mensaje_templates',    (select count(*) from mensaje_templates    where lubricentro_id = v_lub.id),
      'config_neumaticos',    (select count(*) from config_neumaticos    where lubricentro_id = v_lub.id),
      'config_experiencia',   (select count(*) from config_experiencia   where lubricentro_id = v_lub.id),
      'datos_empresa',        (select count(*) from datos_empresa        where lubricentro_id = v_lub.id),
      'landing_busquedas',    (select count(*) from landing_busquedas    where lubricentro_id = v_lub.id),
      'logo_pendiente',       v_logo
    ));

    -- EVIDENCIA PRIMERO, en la misma transacción que el borrado.
    insert into purgas (lubricentro_id, simulacion, a_pedido, motivo, ejecutada_por, cancelada_at, conteos)
    values (v_lub.id, p_simular, p_lubricentro_id is not null, v_motivo, v_uid, v_lub.cancelada_at, v_conteos)
    returning * into v_purga;                                          -- @evidencia

    if not p_simular then                                              -- @simular
      -- En orden de dependencias: primero lo que cuelga, después de qué cuelga.
      delete from canjes               where lubricentro_id = v_lub.id;
      delete from contactos            where lubricentro_id = v_lub.id;
      delete from notas_vehiculo       where lubricentro_id = v_lub.id;
      delete from trabajos_pendientes  where lubricentro_id = v_lub.id;
      delete from presupuesto_items    where lubricentro_id = v_lub.id;
      delete from presupuestos         where lubricentro_id = v_lub.id;
      delete from correcciones_patente where lubricentro_id = v_lub.id;
      delete from supresiones_cliente  where lubricentro_id = v_lub.id;
      delete from service_ruedas       where lubricentro_id = v_lub.id;
      delete from service_items        where lubricentro_id = v_lub.id;
      delete from services             where lubricentro_id = v_lub.id;
      delete from vehiculos            where lubricentro_id = v_lub.id;
      delete from clientes             where lubricentro_id = v_lub.id;
      delete from productos            where lubricentro_id = v_lub.id;
      delete from premios              where lubricentro_id = v_lub.id;
      delete from mensaje_templates    where lubricentro_id = v_lub.id;
      delete from config_neumaticos    where lubricentro_id = v_lub.id;
      delete from config_experiencia   where lubricentro_id = v_lub.id;
      delete from datos_empresa        where lubricentro_id = v_lub.id; -- @purga-empresa
      delete from landing_busquedas    where lubricentro_id = v_lub.id;
      -- NO: pagos, suscripciones, cresium_*, contactos_fidelli,
      -- cambios_override_plan, aceptaciones_terminos, sucursales, usuarios.

      update lubricentros
         set activo = false, purgado_at = now()
       where id = v_lub.id;
    end if;

    v_hechas := v_hechas + 1;
    return next v_purga;
  end loop;

  -- A pedido y no calificó: se dice por qué, no se calla.
  if p_lubricentro_id is not null and v_hechas = 0 then
    if not exists (select 1 from lubricentros where id = p_lubricentro_id) then
      raise exception 'lubricentro_no_existe';
    elsif exists (select 1 from lubricentros where id = p_lubricentro_id and slug = 'demo') then
      raise exception 'demo_no_se_purga';
    elsif exists (select 1 from lubricentros where id = p_lubricentro_id and purgado_at is not null) then
      raise exception 'ya_purgado';
    else
      raise exception 'suscripcion_no_cancelada'
        using hint = 'La purga a pedido exige la suscripción vigente en estado cancelada con su fecha: primero se cancela desde /fidelli, después se purga.';
    end if;
  end if;

  return;
end;
$$;
-- <<< purgar_tenants_vencidos
