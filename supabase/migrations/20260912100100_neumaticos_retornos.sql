-- ============================================================
-- Fidelli Motors · Módulo Gomería (bloque 2): retornos, avisos y el
-- beneficio de la compra
--
-- El par de 20260912100000, que agregó 'neumaticos' a estado_contacto.
-- Este es el bloque que justifica el módulo: el bloque 1 le dio al gomero
-- un lugar donde anotar; este le devuelve clientes. Un juego de cubiertas
-- vendido hoy genera por sí solo tres vueltas al local —rotación y
-- balanceo, alineación, reajuste de tuercas— y dos avisos de recambio
-- —antigüedad del DOT y desgaste— que ningún sistema del rubro tiene.
--
-- ────────────────────────────────────────────────────────────
-- LO QUE NO SE TOCA, Y POR QUÉ ESTÁ ESCRITO ACÁ ARRIBA
--
-- vista_proximos_service es la pantalla que renueva las suscripciones y
-- su modo de falla es silencioso. Este bloque NO la redefine, NO la
-- consulta distinto y NO le suma columnas: la vista nueva corre AL LADO,
-- con el mismo contrato de columnas, y la página las une en el servidor
-- exactamente como ya hace con vista_pendientes. R16a en
-- verificaciones.sql compara las filas de la vista vieja antes y después
-- de cargar trabajos de gomería en los mismos autos: tienen que ser
-- idénticas, campo por campo.
--
-- ────────────────────────────────────────────────────────────
-- LAS DOS TRAMPAS DEL BLOQUE 1, RESUELTAS DE ENTRADA
--
-- 1 · La vista nueva filtra por el módulo con plan_permite('neumaticos'),
--     que es la puerta PÚBLICA del gating (grantada a authenticated y
--     atada a mi_lubricentro_id()), y NO con feature_de_tenant(), que es
--     definer sin guarda de llamador, no está grantada, y desde una vista
--     invoker explota con "permission denied" —o peor, deja la pantalla
--     vacía sin error a la vista, como pasó con el listado de /fidelli—.
--     Para un superadmin (sin tenant) la vista devuelve cero filas, y
--     está bien: "A quién llamar" es del owner. R16c lo prueba como un
--     owner común, con y sin el módulo.
--
-- 2 · Cada regla de esta migración tiene una prueba en R16 que se vio en
--     ROJO rompiendo a mano exactamente lo que dice cubrir
--     (scripts/regresion-neumaticos.sh lo repite). Las líneas marcadas
--     con -- @algo son los puntos que ese script rompe: no las reformateen.
--
-- ────────────────────────────────────────────────────────────
-- EL MODELO
--
-- · config_neumaticos: los intervalos son POR TENANT y con defaults, no
--   clavados en el código. No hay datos reales para calibrarlos todavía;
--   si en una zona los autos vuelven antes, el taller los cambia desde
--   Configuración y "A quién llamar" se mueve solo, sin migración.
-- · vista_proximos_neumaticos: UNA fila por vehículo, no una por motivo.
--   La fecha estimada es la más cercana de los motivos que aplican y
--   `motivos text[]` dice cuáles. Un gomero que le escribe dos veces en
--   la misma semana al mismo cliente es spam.
-- · El ritmo de kilómetros sale de TODOS los trabajos del vehículo que
--   tengan kilómetros, de cualquier tipo. Un auto que hace services en el
--   mismo local ya tiene su ritmo medido. (vista_proximos_service solo
--   mira services para esto: inconsistencia heredada, anotada, no tocada.)
-- · El beneficio de la compra no es un contador: con dos o más cubiertas
--   colocadas se guardan beneficio_hasta_km y beneficio_hasta_fecha en la
--   cabecera, desde la configuración. beneficio_km = 0 lo apaga en todos
--   lados, incluidos los trabajos que ya lo tenían.
-- ============================================================


-- ---------- 1 · La configuración por tenant ----------
-- Una fila por lubricentro, con defaults. Los CHECK acotan a rangos
-- sensatos del rubro: no son reglas de negocio, son la red contra un
-- cero de más. meses_rotacion no estaba en el pedido: la rotación es
-- "8.000–10.000 km o cada seis meses", y sin la columna el vencimiento
-- por tiempo quedaba clavado en el código, que es justo lo que este
-- bloque no quiere.
create table config_neumaticos (
  lubricentro_id     uuid primary key references lubricentros(id) on delete cascade,
  km_rotacion        integer      not null default 10000,
  meses_rotacion     integer      not null default 6,
  km_alineacion      integer      not null default 10000,
  meses_alineacion   integer      not null default 12,
  anios_antiguedad   integer      not null default 6,
  mm_alerta          numeric(3,1) not null default 3.0,
  km_reajuste        integer      not null default 100,
  beneficio_km       integer      not null default 10000,
  beneficio_meses    integer      not null default 6,
  updated_at         timestamptz  not null default now(),

  constraint km_rotacion_rango      check (km_rotacion between 3000 and 20000),
  constraint meses_rotacion_rango   check (meses_rotacion between 1 and 24),
  constraint km_alineacion_rango    check (km_alineacion between 3000 and 30000),
  constraint meses_alineacion_rango check (meses_alineacion between 3 and 36),
  constraint anios_antiguedad_rango check (anios_antiguedad between 3 and 10),
  -- 1,6 mm es el mínimo legal (Ley 24.449): avisar por debajo de eso es
  -- avisar tarde.
  constraint mm_alerta_rango        check (mm_alerta between 1.6 and 5.0),
  constraint km_reajuste_rango      check (km_reajuste between 50 and 500),
  -- 0 = el taller no da el beneficio. Es el interruptor.
  constraint beneficio_km_rango     check (beneficio_km = 0 or beneficio_km between 3000 and 30000),
  constraint beneficio_meses_rango  check (beneficio_meses between 1 and 24)
);

comment on table config_neumaticos is
  'Los intervalos con los que el módulo de gomería avisa, por tenant. Con defaults del rubro; el taller los ajusta desde Configuración y la vista de retornos los lee en vivo. beneficio_km = 0 apaga el beneficio de la compra.';
comment on column config_neumaticos.mm_alerta is
  'Profundidad de dibujo (mm) a la que se avisa por desgaste. Umbral, no proyección: con una sola medición no se puede proyectar y no se inventa.';

-- RLS por tenant. Lectura del propio; escritura del propio Y con el
-- módulo (WITH CHECK, nunca USING: apagar el módulo no borra la
-- configuración, solo la deja de mano). Sin insert ni delete para el
-- owner: la fila nace con el tenant y muere con él.
alter table config_neumaticos enable row level security;

create policy config_neumaticos_lectura on config_neumaticos
  for select
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin());

create policy config_neumaticos_escritura on config_neumaticos
  for update
  using (lubricentro_id = mi_lubricentro_id() or soy_superadmin())
  with check (
    (lubricentro_id = mi_lubricentro_id() and plan_permite('neumaticos'))
    or soy_superadmin()
  );

grant select, update on config_neumaticos to authenticated;

-- La fila nace con el tenant, por cualquier puerta: crear_lubricentro(),
-- el seed, un insert a mano. Definer para no depender de las policies de
-- quien inserta el lubricentro — una fila de defaults no es un dato
-- sensible, y un tenant sin ella dejaría la vista de retornos sin JOIN.
create function config_neumaticos_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into config_neumaticos (lubricentro_id) values (new.id)
  on conflict (lubricentro_id) do nothing;
  return new;
end;
$$;

revoke all on function config_neumaticos_alta() from public, anon, authenticated;

create trigger config_neumaticos_alta
  after insert on lubricentros
  for each row execute function config_neumaticos_alta();

-- Y los que ya existen, con los mismos defaults.
insert into config_neumaticos (lubricentro_id)
select id from lubricentros
on conflict (lubricentro_id) do nothing;


-- ---------- 2 · El beneficio de la compra, en la cabecera ----------
alter table services
  add column beneficio_hasta_km    integer,
  add column beneficio_hasta_fecha date;

-- Los dos van juntos o ninguno, y solo en un trabajo de gomería.
alter table services add constraint beneficio_coherente check (
  (beneficio_hasta_km is null) = (beneficio_hasta_fecha is null)
  and (beneficio_hasta_km is null or tipo = 'neumaticos')
);

comment on column services.beneficio_hasta_km is
  'Rotación y balanceo sin cargo hasta estos km. Lo calcula calcular_beneficio_neumaticos() con dos o más cubiertas colocadas, desde config_neumaticos. NULL = sin beneficio.';
comment on column services.beneficio_hasta_fecha is
  'Rotación y balanceo sin cargo hasta esta fecha, lo que pase primero con los km.';

-- El cálculo, en un solo lugar para el alta y la edición. Invoker: el
-- UPDATE pasa por services_edicion como cualquier otro toque a la fila.
-- >>> calcular_beneficio_neumaticos
create function calcular_beneficio_neumaticos(p_service_id uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_s         services%rowtype;
  v_cfg       config_neumaticos%rowtype;
  v_colocadas integer;
begin
  select * into v_s from services where id = p_service_id;
  if v_s.id is null or v_s.tipo <> 'neumaticos' then
    return;
  end if;

  select count(*) into v_colocadas
  from service_ruedas where service_id = p_service_id and colocada;

  select * into v_cfg from config_neumaticos where lubricentro_id = v_s.lubricentro_id;

  -- Dos o más cubiertas colocadas —un par o el juego— y el beneficio
  -- prendido. Con una sola cubierta no hay beneficio: una rotación no
  -- tiene sentido con una goma nueva y tres viejas.
  if v_colocadas >= 2 and coalesce(v_cfg.beneficio_km, 0) > 0 then -- @beneficio
    update services set
      beneficio_hasta_km    = v_s.kilometros + v_cfg.beneficio_km,
      beneficio_hasta_fecha = (v_s.fecha + make_interval(months => v_cfg.beneficio_meses))::date
    where id = p_service_id;
  else
    update services set beneficio_hasta_km = null, beneficio_hasta_fecha = null
    where id = p_service_id;
  end if;
end;
$$;
-- <<< calcular_beneficio_neumaticos

comment on function calcular_beneficio_neumaticos is
  'Escribe (o limpia) beneficio_hasta_km/fecha de un trabajo de gomería según sus ruedas colocadas y config_neumaticos. La llaman guardar_service y actualizar_service. Security invoker.';

revoke all on function calcular_beneficio_neumaticos(uuid) from public, anon;
grant execute on function calcular_beneficio_neumaticos(uuid) to authenticated;


-- ---------- 3 · El DOT como fecha ----------
-- 'WWYY' → el lunes de esa semana. 2325 = semana 23 de 2025. Inmutable:
-- se usa dentro de la vista.
create function dot_a_fecha(p_dot text)
returns date
language sql
immutable
as $$
  select case
    when p_dot ~ '^[0-9]{4}$'
    then make_date(2000 + substr(p_dot, 3, 2)::integer, 1, 1)
         + (substr(p_dot, 1, 2)::integer - 1) * 7
  end;
$$;

comment on function dot_a_fecha is
  'Semana y año del DOT (WWYY) como fecha. NULL si el texto no es un DOT.';


-- ---------- 4 · La vista de retornos ----------
-- Mismo contrato de columnas que vista_proximos_service, más `motivos`,
-- `km_objetivo`, `anio_dot` y `mm_minimo` para el copy de la fila y del
-- WhatsApp. La página une las tres vistas en el servidor.
--
-- Cada motivo tiene su base y su regla:
--   rotacion   · km del último trabajo con ruedas colocadas o rotadas
--                + km_rotacion, o esa fecha + meses_rotacion: lo primero.
--   alineacion · desde la última alineación (o la última colocación si
--                nunca hubo) + km_alineacion / meses_alineacion.
--   reajuste   · km_reajuste (100) desde la colocación. El único que se
--                mide en días: a los 15 días se da por hecho y
--                desaparece — avisar el reajuste de tuercas a los dos
--                meses es ridículo.
--   antiguedad · el DOT más viejo de las cubiertas montadas +
--                anios_antiguedad. Solo con al menos un DOT cargado.
--   desgaste   · la profundidad más baja de las montadas ≤ mm_alerta.
--                Umbral, no proyección; la fecha es la de la medición.
--
-- "Cubiertas montadas" = la última fila cargada para cada una de las
-- cuatro posiciones (sin el auxilio: una goma de auxilio vieja no vende
-- cuatro cubiertas ni pone en riesgo a nadie). Si la última fila de una
-- posición no trae DOT o profundidad, esa posición no aporta: no se
-- hereda una medición vieja que puede ser de otra goma.
--
-- La proyección a fecha usa el ÚLTIMO odómetro conocido del vehículo
-- (de cualquier tipo de trabajo) y el ritmo de TODOS los trabajos con
-- kilómetros: km objetivo menos último odómetro, dividido por km/día,
-- desde la fecha de esa lectura. Default de 40 km/día con una sola
-- lectura, igual que la vista de services.
-- >>> vista_proximos_neumaticos
create view vista_proximos_neumaticos as
with
trabajos as (
  select s.id, s.vehiculo_id, s.lubricentro_id, s.sucursal_id,
         s.fecha, s.created_at, s.kilometros, s.alineacion,
         exists (select 1 from service_ruedas r
                 where r.service_id = s.id and r.colocada) as con_colocada,
         exists (select 1 from service_ruedas r
                 where r.service_id = s.id and (r.colocada or r.rotada)) as con_movimiento
  from services s
  where not s.anulado and s.tipo = 'neumaticos'
),
ultimo as (
  select distinct on (t.vehiculo_id) t.*
  from trabajos t
  order by t.vehiculo_id, t.fecha desc, t.created_at desc
),
-- El ritmo, de TODOS los trabajos con kilómetros, de cualquier tipo.
ritmo as (
  select s.vehiculo_id,
         count(*) as cantidad,
         max(s.kilometros) - min(s.kilometros) as km_recorridos,
         greatest(max(s.fecha) - min(s.fecha), 1) as dias_transcurridos
  from services s
  where not s.anulado and s.kilometros is not null -- @ritmo
  group by s.vehiculo_id
),
-- El último odómetro conocido, de cualquier tipo de trabajo.
odometro as (
  select distinct on (s.vehiculo_id) s.vehiculo_id, s.fecha, s.kilometros
  from services s
  where not s.anulado and s.kilometros is not null
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
base_movimiento as (
  select distinct on (t.vehiculo_id) t.vehiculo_id, t.fecha, t.kilometros
  from trabajos t where t.con_movimiento
  order by t.vehiculo_id, t.fecha desc, t.created_at desc
),
base_colocacion as (
  select distinct on (t.vehiculo_id) t.vehiculo_id, t.fecha, t.kilometros
  from trabajos t where t.con_colocada
  order by t.vehiculo_id, t.fecha desc, t.created_at desc
),
base_alineacion as (
  select distinct on (t.vehiculo_id) t.vehiculo_id, t.fecha, t.kilometros
  from trabajos t where t.alineacion
  order by t.vehiculo_id, t.fecha desc, t.created_at desc
),
montadas as (
  select distinct on (t.vehiculo_id, r.posicion)
         t.vehiculo_id, r.posicion, r.dot, r.profundidad_mm, t.fecha
  from service_ruedas r
  join trabajos t on t.id = r.service_id
  where r.posicion <> 'auxilio'
  order by t.vehiculo_id, r.posicion, t.fecha desc, t.created_at desc
),
cubiertas as (
  select m.vehiculo_id,
         min(dot_a_fecha(m.dot)) filter (where m.dot is not null) as dot_mas_viejo,
         min(m.profundidad_mm) as mm_minimo,
         max(m.fecha) filter (where m.profundidad_mm is not null) as mm_fecha
  from montadas m
  group by m.vehiculo_id
),
calculo as (
  select
    u.lubricentro_id, u.vehiculo_id,
    u.id as ultimo_id, u.fecha as ultima_fecha, u.kilometros as ultimo_km,
    u.sucursal_id, u.created_at as ultimo_creado,
    r.cantidad as cantidad_services,
    case
      when r.cantidad >= 2 and r.km_recorridos > 0
        then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad < 2 or r.km_recorridos = 0) as estimacion_inicial,
    o.fecha as odo_fecha, o.kilometros as odo_km,
    cfg.km_rotacion, cfg.meses_rotacion, cfg.km_alineacion, cfg.meses_alineacion,
    cfg.km_reajuste, cfg.anios_antiguedad, cfg.mm_alerta,
    bm.fecha as mov_fecha, bm.kilometros as mov_km,
    bc.fecha as col_fecha, bc.kilometros as col_km,
    ba.fecha as ali_fecha, ba.kilometros as ali_km,
    cu.dot_mas_viejo, cu.mm_minimo, cu.mm_fecha
  from ultimo u
  join ritmo r on r.vehiculo_id = u.vehiculo_id
  join odometro o on o.vehiculo_id = u.vehiculo_id
  join config_neumaticos cfg on cfg.lubricentro_id = u.lubricentro_id
  left join base_movimiento bm on bm.vehiculo_id = u.vehiculo_id
  left join base_colocacion bc on bc.vehiculo_id = u.vehiculo_id
  left join base_alineacion ba on ba.vehiculo_id = u.vehiculo_id
  left join cubiertas cu on cu.vehiculo_id = u.vehiculo_id
),
fechas as (
  select c.*,
    case when c.mov_fecha is not null then least( -- @rotacion
      c.odo_fecha + (greatest(c.mov_km + c.km_rotacion - c.odo_km, 0)::numeric / c.km_por_dia)::integer,
      (c.mov_fecha + make_interval(months => c.meses_rotacion))::date
    ) end as f_rotacion,
    case when coalesce(c.ali_fecha, c.col_fecha) is not null then least( -- @alineacion
      c.odo_fecha + (greatest(coalesce(c.ali_km, c.col_km) + c.km_alineacion - c.odo_km, 0)::numeric / c.km_por_dia)::integer,
      (coalesce(c.ali_fecha, c.col_fecha) + make_interval(months => c.meses_alineacion))::date
    ) end as f_alineacion,
    case when c.col_fecha is not null and current_date - c.col_fecha <= 15 -- @reajuste
      then c.odo_fecha + (greatest(c.col_km + c.km_reajuste - c.odo_km, 0)::numeric / c.km_por_dia)::integer
    end as f_reajuste,
    case when c.dot_mas_viejo is not null -- @antiguedad
      then (c.dot_mas_viejo + make_interval(years => c.anios_antiguedad))::date
    end as f_antiguedad,
    case when c.mm_minimo is not null and c.mm_minimo <= c.mm_alerta -- @desgaste
      then c.mm_fecha
    end as f_desgaste,
    c.mov_km + c.km_rotacion as km_objetivo_rotacion
  from calculo c
),
-- Los motivos DADOS: los que caen en la ventana de 30 días (los vencidos
-- incluidos, sin piso, como en la vista de services). Una fila por
-- vehículo, con la fecha más cercana.
dados as (
  select f.vehiculo_id,
         array_agg(x.motivo order by x.fecha, x.orden) as motivos,
         min(x.fecha) as fecha_estimada
  from fechas f
  cross join lateral (values
    ('rotacion',   f.f_rotacion,   1),
    ('alineacion', f.f_alineacion, 2),
    ('reajuste',   f.f_reajuste,   3),
    ('antiguedad', f.f_antiguedad, 4),
    ('desgaste',   f.f_desgaste,   5)
  ) as x(motivo, fecha, orden)
  where x.fecha is not null and x.fecha <= current_date + 30 -- @ventana
  group by f.vehiculo_id
),
clasificado as (
  select f.*, d.motivos, d.fecha_estimada,
    case
      when d.fecha_estimada < current_date - 15 then 'vencido'::estado_contacto
      when d.fecha_estimada <= current_date + 7 then 'urgente'::estado_contacto
      else 'proximo'::estado_contacto
    end as estado
  from fechas f
  join dados d on d.vehiculo_id = f.vehiculo_id
)
select
  c.lubricentro_id,
  c.vehiculo_id,
  v.patente,
  v.patente_normalizada,
  v.marca,
  v.modelo,
  cl.id                 as cliente_id,
  cl.nombre             as cliente_nombre,
  cl.telefono           as cliente_telefono,
  c.ultimo_id           as ultimo_service_id,
  c.ultima_fecha        as ultimo_service_fecha,
  c.ultimo_km           as ultimo_service_km,
  null::integer         as prox_service_km,
  case when 'rotacion' = any(c.motivos)
       then greatest(c.km_objetivo_rotacion - c.odo_km, 0) end as km_faltantes,
  c.sucursal_id,
  suc.nombre            as sucursal_nombre,
  c.cantidad_services,
  c.km_por_dia,
  c.estimacion_inicial,
  c.fecha_estimada,
  (c.fecha_estimada - current_date) as dias_hasta,
  c.estado,
  -- El anti-spam: UN aviso por vehículo por ciclo, posterior al último
  -- trabajo de gomería. Si la rotación y la alineación vencen juntas es
  -- un solo WhatsApp que nombra las dos.
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = 'neumaticos' -- @antispam
      and co.created_at > c.ultimo_creado
  ) as contactado,
  c.motivos,
  case when 'rotacion' = any(c.motivos) then c.km_objetivo_rotacion end as km_objetivo,
  extract(year from c.dot_mas_viejo)::integer as anio_dot,
  c.mm_minimo
from clasificado c
join vehiculos v   on v.id  = c.vehiculo_id
join clientes cl   on cl.id = v.cliente_id
join sucursales suc on suc.id = c.sucursal_id
-- Solo los tenants con el módulo. plan_permite y no feature_de_tenant:
-- ver la cabecera. Para un superadmin (sin tenant) da false y la vista
-- queda vacía, que es lo esperado.
where plan_permite('neumaticos'); -- @gate

-- El replace resetea esta opción; sin ella un owner ve los retornos de
-- todos los lubricentros. Se repone SIEMPRE.
alter view vista_proximos_neumaticos set (security_invoker = on);

grant select on vista_proximos_neumaticos to authenticated;
-- <<< vista_proximos_neumaticos

comment on view vista_proximos_neumaticos is
  'Los retornos de gomería accionables, una fila por vehículo con sus motivos, con el contrato de columnas de vista_proximos_service para unirse en la página. Intervalos de config_neumaticos; ritmo de todos los trabajos con km; solo tenants con el módulo.';


-- ---------- 5 · El badge: la tercera fuente ----------
-- Misma forma que la segunda: solo si el plan trae la feature, para que
-- el número del badge sea el de las filas que la pantalla muestra.
-- >>> contactos_por_hacer
create or replace function contactos_por_hacer()
returns integer
language sql
stable
set search_path = public
as $$
  select (
    (select count(*) from vista_proximos_service where not contactado)
    +
    (case when plan_permite('pendientes')
      then (select count(*) from vista_pendientes where not contactado)
      else 0
    end)
    +
    (case when plan_permite('neumaticos') -- @badge
      then (select count(*) from vista_proximos_neumaticos where not contactado)
      else 0
    end)
  )::integer
$$;
-- <<< contactos_por_hacer

comment on function contactos_por_hacer is
  'El número del badge de "A quién llamar": filas sin contactar en el estado actual, sobre las mismas vistas que la pantalla (services siempre; pendientes y neumáticos solo si el plan trae la feature). Invoker: RLS recorta al tenant.';


-- ---------- 6 · El mensaje del retorno de gomería ----------
-- La tercera plantilla de cada tono, igual que en su momento se sumó la
-- del pendiente. {motivo} = los motivos dados, en castellano natural:
-- "la rotación y el balanceo", "la rotación y la alineación", "el cambio
-- de cubiertas por antigüedad". Lo arma el front desde la vista.
alter table mensaje_templates add column contenido_neumaticos text;

-- El backfill, en una función para poder probarlo: los tenants que ya
-- existen reciben el contenido nuevo SIN que se les pise nada de lo que
-- personalizaron en las otras dos columnas. Solo donde está en null, y
-- solo esa columna. Con el nombre del lubricentro, no con "el taller".
-- >>> completar_templates_neumaticos
create function completar_templates_neumaticos()
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_n integer;
begin
  update mensaje_templates t
  set contenido_neumaticos = case t.tono -- @completar
    when 'Cercano' then
      'Hola {nombre}! Te escribimos de ' || l.nombre ||
      '. A tu {vehiculo} ({patente}) le toca {motivo}. ¿Coordinamos un turno?'
    when 'Formal' then
      'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, requiere {motivo}. Quedamos a disposición para agendar.'
    when 'Directo' then
      '{nombre}, a tu {vehiculo} le toca {motivo}. Escribinos y te damos turno.'
    else
      'Hola {nombre}! Te escribimos de ' || l.nombre ||
      '. A tu {vehiculo} ({patente}) le toca {motivo}. ¿Coordinamos un turno?'
  end
  from lubricentros l
  where l.id = t.lubricentro_id
    and t.contenido_neumaticos is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
-- <<< completar_templates_neumaticos

comment on function completar_templates_neumaticos is
  'Carga contenido_neumaticos en los templates que no lo tienen, sin tocar contenido ni contenido_pendiente. Idempotente. La corre la migración una vez; R16g la vuelve a correr para probar que no pisa nada.';

revoke all on function completar_templates_neumaticos() from public, anon, authenticated;

do $$ begin perform completar_templates_neumaticos(); end $$;

-- Y la siembra de tenants nuevos trae las tres plantillas por tono. Mismo
-- cuerpo que 20260823101000 + la tercera columna. Postura de seguridad
-- intacta: invoker, ejecutable por authenticated a propósito (ver la
-- nota de 20260728050000).
-- >>> sembrar_templates
create or replace function sembrar_templates(p_lubricentro_id uuid, p_nombre text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if exists (
    select 1 from mensaje_templates where lubricentro_id = p_lubricentro_id
  ) then
    return;
  end if;

  insert into mensaje_templates
    (lubricentro_id, tono, contenido, contenido_pendiente, contenido_neumaticos, activo)
  values
    (p_lubricentro_id, 'Cercano',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Tu {vehiculo} ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un turno?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. Cuando trajiste tu {vehiculo} ({patente}) quedó pendiente: {pendiente}. ¿Coordinamos un turno para resolverlo?',
     'Hola {nombre}! Te escribimos de ' || p_nombre ||
     '. A tu {vehiculo} ({patente}) le toca {motivo}. ¿Coordinamos un turno?',
     true),
    (p_lubricentro_id, 'Formal',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición para agendar el turno.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, tiene un trabajo pendiente: {pendiente}. Quedamos a disposición para agendar el turno.',
     'Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente {patente}, requiere {motivo}. Quedamos a disposición para agendar.',
     false),
    (p_lubricentro_id, 'Directo',
     '{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y te damos turno.',
     '{nombre}, tu {vehiculo} tiene un trabajo pendiente: {pendiente}. Escribinos y te damos turno.',
     '{nombre}, a tu {vehiculo} le toca {motivo}. Escribinos y te damos turno.',
     false);
end;
$$;
-- <<< sembrar_templates

comment on function sembrar_templates is
  'Los tres tonos por defecto (Cercano activo) para un tenant sin templates, cada uno con sus tres plantillas: service, pendiente y retorno de gomería. Idempotente.';


-- ---------- 7 · guardar_service y actualizar_service: el beneficio ----------
-- Misma firma que el bloque 1 (create or replace conserva los grants).
-- Cuerpos textuales de 20260911120100 más UNA línea cada uno: el cálculo
-- del beneficio después de escribir las ruedas.
create or replace function guardar_service(
  p_vehiculo_id          uuid,
  p_sucursal_id          uuid,
  p_fecha                date,
  p_kilometros           integer,
  p_aceite_tipo          text,
  p_prox_service_km      integer,
  p_items                jsonb default '[]'::jsonb,
  p_aceite_producto_id   uuid default null,
  p_aceite_nombre        text default null,
  p_observaciones        text default null,
  p_canjear_premio       boolean default false,
  p_tipo                 tipo_trabajo default 'service',
  p_trabajo_descripcion  text default null,
  p_pendientes           jsonb default '[]'::jsonb,
  p_resolver_pendientes  uuid[] default '{}'::uuid[],
  p_aceite_litros        numeric default null,
  p_ruedas               jsonb default '[]'::jsonb,
  p_alineacion           boolean default null
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lubricentro uuid;
  v_service     uuid;
  v_item        jsonb;
  v_premio      record;
  v_detalle     text;
  v_pend        jsonb;
  v_desc        text;
  v_cantidad    numeric;
  v_producto    uuid;
  v_rueda       jsonb;
  v_ruedas      jsonb;
  v_colocada    boolean;
begin
  v_lubricentro := mi_lubricentro_id();
  if v_lubricentro is null then
    raise exception 'La sesión no pertenece a ningún lubricentro';
  end if;

  if p_canjear_premio then
    select * into v_premio from premio_disponible(p_vehiculo_id);
    if not coalesce(v_premio.disponible, false) then
      raise exception 'premio_no_disponible';
    end if;
    -- El premio con alcance 'services' cuenta cambios de aceite y nada
    -- más: ni mecánica ni neumáticos avanzan el ciclo. Es la misma regla
    -- de 20260822210000, ahora nombrando a los dos tipos que no son
    -- service en vez de solo a la mecánica.
    if p_tipo <> 'service' and v_premio.alcance is distinct from 'todos' then
      raise exception 'canje_solo_en_service';
    end if;
  end if;

  if p_tipo = 'neumaticos' then
    -- Las ruedas con sustancia, ya filtradas: una fila vale si se le hizo
    -- algo o si se la midió (el mismo criterio del CHECK).
    v_ruedas := coalesce((
      select jsonb_agg(r)
      from jsonb_array_elements(coalesce(p_ruedas, '[]'::jsonb)) r
      where coalesce((r->>'colocada')::boolean, false)
         or coalesce((r->>'rotada')::boolean, false)
         or coalesce((r->>'balanceada')::boolean, false)
         or coalesce((r->>'reparada')::boolean, false)
         or nullif(r->>'profundidad_mm', '') is not null
    ), '[]'::jsonb);

    -- Un trabajo vacío no se guarda: o hay alguna rueda, o se alineó.
    if jsonb_array_length(v_ruedas) = 0 and not coalesce(p_alineacion, false) then
      raise exception 'neumaticos_sin_trabajo';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, fecha, kilometros, observaciones, alineacion
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'neumaticos', p_fecha, p_kilometros,
      nullif(trim(p_observaciones), ''),
      coalesce(p_alineacion, false)
    )
    returning id into v_service;

    perform guardar_ruedas(v_service, v_ruedas);
    -- El beneficio de la compra: con dos o más cubiertas colocadas, y solo
    -- si el taller lo tiene prendido (beneficio_km > 0). Lo calcula la
    -- base desde config_neumaticos; el front nunca lo inventa.
    perform calcular_beneficio_neumaticos(v_service);

    -- EL STOCK de las cubiertas: una por rueda COLOCADA con producto del
    -- catálogo. Mismo patrón que el renglón de 20260902120000:154 y misma
    -- condición de siempre —solo los productos que llevan stock—. Una
    -- rueda MEDIDA que referencia un producto no descuenta: no salió nada
    -- del estante.
    for v_rueda in select * from jsonb_array_elements(v_ruedas)
    loop
      v_producto := nullif(v_rueda->>'producto_id', '')::uuid;
      v_colocada := coalesce((v_rueda->>'colocada')::boolean, false);
      if v_producto is not null and v_colocada then
        update productos set stock = stock - 1
        where id = v_producto
          and lubricentro_id = v_lubricentro
          and stock is not null;
      end if;
    end loop;

  elsif p_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then
      raise exception 'descripcion_requerida';
    end if;

    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      tipo, trabajo_descripcion, fecha, kilometros, observaciones
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      'mecanica', trim(p_trabajo_descripcion), p_fecha, p_kilometros,
      nullif(trim(p_observaciones), '')
    )
    returning id into v_service;
  else
    insert into services (
      lubricentro_id, sucursal_id, vehiculo_id, usuario_id,
      fecha, kilometros, aceite_tipo, prox_service_km,
      aceite_producto_id, aceite_nombre, observaciones, aceite_litros
    ) values (
      v_lubricentro, p_sucursal_id, p_vehiculo_id, auth.uid(),
      p_fecha, p_kilometros, trim(p_aceite_tipo), p_prox_service_km,
      p_aceite_producto_id,
      nullif(trim(p_aceite_nombre), ''),
      nullif(trim(p_observaciones), ''),
      p_aceite_litros
    )
    returning id into v_service;

    -- EL ACEITE baja según la UNIDAD del producto, no según lo que tipeó
    -- el mecánico. Solo si el producto lleva stock:
    --   · 'litro'  → los litros del service, y solo si vinieron. Sin dato,
    --                el stock no se mueve — el stock es opcional; la
    --                velocidad no.
    --   · 'unidad' → UNA unidad por service, con o sin litros. El stock
    --                cuenta bidones y un cambio de aceite abre uno; restar
    --                litros acá era vaciar cuatro bidones por service.
    if p_aceite_producto_id is not null then
      update productos p
      set stock = p.stock - case p.unidad
                              when 'litro' then p_aceite_litros
                              else 1
                            end
      where p.id = p_aceite_producto_id
        and p.lubricentro_id = v_lubricentro
        and p.stock is not null
        and (p.unidad <> 'litro' or p_aceite_litros is not null);
    end if;
  end if;

  -- Los renglones, con su cantidad (default 1: el caso normal no pide
  -- ni un toque más). El descuento va adentro del mismo loop.
  -- Neumáticos no tiene renglones: su detalle son las ruedas.
  if p_tipo <> 'neumaticos' then
    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      if p_tipo = 'mecanica' then
        v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
        if v_detalle is null then
          continue;
        end if;
      else
        v_detalle := nullif(trim(v_item->>'detalle'), '');
      end if;

      v_cantidad := coalesce((v_item->>'cantidad')::numeric, 1);
      v_producto := nullif(v_item->>'producto_id', '')::uuid;

      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        v_service,
        case when p_tipo = 'mecanica' then null else (v_item->>'tipo')::item_tipo end,
        v_producto,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true),
        v_cantidad
      );

      if v_producto is not null then
        update productos set stock = stock - v_cantidad
        where id = v_producto
          and lubricentro_id = v_lubricentro
          and stock is not null;
      end if;
    end loop;
  end if;

  -- Pendientes nuevos y tildados: idéntico al bloque 3.
  for v_pend in select * from jsonb_array_elements(coalesce(p_pendientes, '[]'::jsonb))
  loop
    v_desc := nullif(trim(coalesce(v_pend->>'descripcion', '')), '');
    if v_desc is null then
      continue;
    end if;
    if char_length(v_desc) < 5 then
      raise exception 'pendiente_invalido';
    end if;
    if nullif(v_pend->>'objetivo_fecha', '') is null
       and nullif(v_pend->>'objetivo_km', '') is null then
      raise exception 'pendiente_sin_objetivo';
    end if;

    insert into trabajos_pendientes (
      lubricentro_id, vehiculo_id, origen_service_id, usuario_id,
      descripcion, objetivo_fecha, objetivo_km, visible_cliente
    ) values (
      v_lubricentro, p_vehiculo_id, v_service, auth.uid(),
      v_desc,
      nullif(v_pend->>'objetivo_fecha', '')::date,
      nullif(v_pend->>'objetivo_km', '')::integer,
      coalesce((v_pend->>'visible_cliente')::boolean, false)
    );
  end loop;

  if array_length(p_resolver_pendientes, 1) > 0 then
    update trabajos_pendientes set
      estado = 'resuelto',
      resuelto_en = now(),
      resuelto_service_id = v_service
    where id = any(p_resolver_pendientes)
      and vehiculo_id = p_vehiculo_id
      and estado = 'pendiente';
  end if;

  if p_canjear_premio then
    insert into canjes (lubricentro_id, vehiculo_id, premio_id, service_id)
    values (v_lubricentro, p_vehiculo_id, v_premio.premio_id, v_service);
  end if;

  return v_service;
end;
$$;


create or replace function actualizar_service(
  p_service_id          uuid,
  p_sucursal_id         uuid,
  p_fecha               date,
  p_kilometros          integer,
  p_aceite_tipo         text,
  p_prox_service_km     integer,
  p_items               jsonb default '[]'::jsonb,
  p_aceite_producto_id  uuid default null,
  p_aceite_nombre       text default null,
  p_observaciones       text default null,
  p_trabajo_descripcion text default null,
  p_aceite_litros       numeric default null,
  p_ruedas              jsonb default '[]'::jsonb,
  p_alineacion          boolean default null
)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_item    jsonb;
  v_tipo    tipo_trabajo;
  v_detalle text;
  v_ruedas  jsonb;
begin
  select tipo into v_tipo from services where id = p_service_id and not anulado;
  if v_tipo is null then
    raise exception 'service_no_editable';
  end if;

  if v_tipo = 'neumaticos' then
    v_ruedas := coalesce((
      select jsonb_agg(r)
      from jsonb_array_elements(coalesce(p_ruedas, '[]'::jsonb)) r
      where coalesce((r->>'colocada')::boolean, false)
         or coalesce((r->>'rotada')::boolean, false)
         or coalesce((r->>'balanceada')::boolean, false)
         or coalesce((r->>'reparada')::boolean, false)
         or nullif(r->>'profundidad_mm', '') is not null
    ), '[]'::jsonb);

    if jsonb_array_length(v_ruedas) = 0 and not coalesce(p_alineacion, false) then
      raise exception 'neumaticos_sin_trabajo';
    end if;

    update services set
      sucursal_id   = p_sucursal_id,
      fecha         = p_fecha,
      kilometros    = p_kilometros,
      alineacion    = coalesce(p_alineacion, false),
      observaciones = nullif(trim(p_observaciones), '')
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_ruedas where service_id = p_service_id;
    perform guardar_ruedas(p_service_id, v_ruedas);
    -- Las ruedas cambiaron: el beneficio se recalcula con las nuevas y con
    -- la configuración de HOY. Nunca se congela un beneficio que ya no
    -- corresponde ni se pierde uno que ahora sí.
    perform calcular_beneficio_neumaticos(p_service_id);

    return;
  end if;

  if v_tipo = 'mecanica' then
    if p_trabajo_descripcion is null
       or char_length(trim(p_trabajo_descripcion)) < 5 then
      raise exception 'descripcion_requerida';
    end if;

    update services set
      sucursal_id         = p_sucursal_id,
      fecha               = p_fecha,
      kilometros          = p_kilometros,
      trabajo_descripcion = trim(p_trabajo_descripcion),
      observaciones       = nullif(trim(p_observaciones), '')
    where id = p_service_id
      and not anulado;

    if not found then
      raise exception 'service_no_editable';
    end if;

    delete from service_items where service_id = p_service_id;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      v_detalle := nullif(trim(coalesce(v_item->>'detalle', '')), '');
      if v_detalle is null then
        continue;
      end if;
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        null,
        nullif(v_item->>'producto_id', '')::uuid,
        v_detalle,
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end loop;

    return;
  end if;

  update services set
    sucursal_id        = p_sucursal_id,
    fecha              = p_fecha,
    kilometros         = p_kilometros,
    aceite_tipo        = trim(p_aceite_tipo),
    prox_service_km    = p_prox_service_km,
    aceite_producto_id = p_aceite_producto_id,
    aceite_nombre      = nullif(trim(p_aceite_nombre), ''),
    observaciones      = nullif(trim(p_observaciones), ''),
    aceite_litros      = p_aceite_litros
  where id = p_service_id
    and not anulado;

  if not found then
    raise exception 'service_no_editable';
  end if;

  delete from service_items si
  where si.service_id = p_service_id
    and si.item_tipo is not null
    and si.item_tipo not in (
      select (i->>'tipo')::item_tipo
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
      where i->>'tipo' is not null
    );

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    update service_items set
      producto_id = nullif(v_item->>'producto_id', '')::uuid,
      detalle     = nullif(trim(v_item->>'detalle'), ''),
      cambiado    = coalesce((v_item->>'cambiado')::boolean, true),
      cantidad    = coalesce((v_item->>'cantidad')::numeric, 1)
    where service_id = p_service_id
      and item_tipo = (v_item->>'tipo')::item_tipo;

    if not found then
      insert into service_items (service_id, item_tipo, producto_id, detalle, cambiado, cantidad)
      values (
        p_service_id,
        (v_item->>'tipo')::item_tipo,
        nullif(v_item->>'producto_id', '')::uuid,
        nullif(trim(v_item->>'detalle'), ''),
        coalesce((v_item->>'cambiado')::boolean, true),
        coalesce((v_item->>'cantidad')::numeric, 1)
      );
    end if;
  end loop;
end;
$$;


-- ---------- 8 · get_carton: el beneficio en el papel del cliente ----------
-- Textual del bloque 1 más dos claves por trabajo, gateadas por la
-- configuración del tenant. SECURITY DEFINER y search_path se repiten:
-- sin definer, anon no lee nada y la superficie del cliente se apaga.
-- >>> get_carton
create or replace function get_carton(p_slug text, p_patente text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lubricentro   lubricentros%rowtype;
  v_config        config_experiencia%rowtype;
  v_vehiculo      vehiculos%rowtype;
  v_patente_norm  text;
  v_encontrada    boolean;
  v_premio        record;
  v_sucursales    jsonb;
  v_premium       boolean;
  v_wa_taller     text;
  v_resultado     jsonb;
  v_beneficio_km  integer;
begin
  v_patente_norm := normalizar_patente(p_patente);

  -- Sin filtro por activo, a propósito (2B): la página del cliente
  -- sobrevive a la suspensión. Ver el comentario en 20260822210000.
  select * into v_lubricentro from lubricentros where slug = p_slug;
  if not found then
    return jsonb_build_object('error', 'lubricentro_no_encontrado');
  end if;

  select * into v_config from config_experiencia where lubricentro_id = v_lubricentro.id;

  -- El interruptor del beneficio de la compra: con beneficio_km = 0 el
  -- taller lo apagó y la línea desaparece del papel, también en los
  -- trabajos que ya lo tenían guardado. Es una promesa que el taller
  -- decide sostener o no; el papel dice lo que el taller sostiene hoy.
  select coalesce(beneficio_km, 0) into v_beneficio_km
  from config_neumaticos where lubricentro_id = v_lubricentro.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', su.nombre,
    'direccion', su.direccion,
    'telefono', su.telefono,
    'horarios', su.horarios
  ) order by su.created_at), '[]'::jsonb)
  into v_sucursales
  from sucursales su
  where su.lubricentro_id = v_lubricentro.id and su.activa;

  select * into v_vehiculo from vehiculos
  where lubricentro_id = v_lubricentro.id and patente_normalizada = v_patente_norm;

  v_encontrada := found;

  insert into landing_busquedas (lubricentro_id, patente, encontrada)
  values (v_lubricentro.id, v_patente_norm, v_encontrada);

  if not v_encontrada then
    return jsonb_build_object(
      'error', 'patente_no_encontrada',
      'lubricentro', jsonb_build_object(
        'nombre', v_lubricentro.nombre,
        'logo_url', v_config.logo_url,
        'color_primario', v_config.color_primario,
        'color_fondo', v_config.color_fondo,
        'color_carton', v_config.color_carton,
        'tema', coalesce(v_config.tema, 'claro'),
        'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
        'datos_contacto', v_config.datos_contacto,
        'sucursales', v_sucursales
      )
    );
  end if;

  select * into v_premio from premio_disponible(v_vehiculo.id);

  v_premium := feature_de_tenant(v_lubricentro.id, 'pagina_premium');

  -- El WhatsApp del taller, solo premium. La sucursal del ÚLTIMO trabajo
  -- del auto —el local que tiene su historial— si sigue activa y tiene
  -- teléfono; si no, la primera activa con teléfono; si no, el WhatsApp
  -- de marca de datos_contacto. La caída es por dato faltante, nunca por
  -- adivinar: el orden lo fija el bloque.
  if v_premium then
    select su.telefono into v_wa_taller
    from services s
    join sucursales su on su.id = s.sucursal_id
    where s.vehiculo_id = v_vehiculo.id
      and not s.anulado
      and su.activa
      and su.telefono is not null
    order by s.fecha desc, s.created_at desc
    limit 1;

    if v_wa_taller is null then
      select su.telefono into v_wa_taller
      from sucursales su
      where su.lubricentro_id = v_lubricentro.id
        and su.activa
        and su.telefono is not null
      order by su.created_at
      limit 1;
    end if;

    if v_wa_taller is null then
      v_wa_taller := v_config.datos_contacto->>'whatsapp';
    end if;
  end if;

  select jsonb_build_object(
    'lubricentro', jsonb_build_object(
      'nombre', v_lubricentro.nombre,
      'logo_url', v_config.logo_url,
      'color_primario', v_config.color_primario,
      'color_fondo', v_config.color_fondo,
      'color_carton', v_config.color_carton,
      'tema', coalesce(v_config.tema, 'claro'),
      'logo_tamano', coalesce(v_config.logo_tamano, 'normal'),
      'datos_contacto', v_config.datos_contacto,
      'sucursales', v_sucursales,
      'campos_visibles', v_config.campos_visibles
    ),
    -- El mensaje del taller: el momento de mayor intención del mes. Solo
    -- premium, solo con la vigencia viva (un "traé el auto en septiembre"
    -- puesto en marzo es una vergüenza — con fecha se apaga solo), y solo
    -- con el tenant activo: mismo criterio que el premio.
    'mensaje_taller', case
      when v_premium
       and v_lubricentro.activo
       and v_config.mensaje_escaneo is not null
       and (v_config.mensaje_vigencia is null or v_config.mensaje_vigencia >= current_date)
      then v_config.mensaje_escaneo
      else null
    end,
    'whatsapp_taller', v_wa_taller,
    'vehiculo', jsonb_build_object(
      'patente', v_vehiculo.patente,
      'marca', v_vehiculo.marca,
      'modelo', v_vehiculo.modelo,
      'anio', v_vehiculo.anio
    ),
    'notas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fecha', n.created_at,
          'contenido', n.contenido
        ) order by n.created_at desc
      )
      from notas_vehiculo n
      where n.vehiculo_id = v_vehiculo.id and n.visible_cliente
    ), '[]'::jsonb),
    -- "Recomendado por el taller": SOLO los abiertos marcados visibles.
    'pendientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'descripcion', tp.descripcion,
          'objetivo_fecha', tp.objetivo_fecha,
          'objetivo_km', tp.objetivo_km,
          'creado', tp.created_at
        ) order by tp.created_at desc
      )
      from trabajos_pendientes tp
      where tp.vehiculo_id = v_vehiculo.id
        and tp.estado = 'pendiente'
        and tp.visible_cliente
    ), '[]'::jsonb),
    'fidelizacion', case
      when v_lubricentro.activo
       and coalesce((v_config.campos_visibles->>'mostrar_fidelizacion')::boolean, true)
      then jsonb_build_object(
        'disponible', v_premio.disponible,
        'services_ciclo', v_premio.services_ciclo,
        'meta_services', v_premio.meta_services,
        'descripcion', v_premio.descripcion,
        -- Qué avanza el ciclo: 'services' (default) o 'todos'. El cartel
        -- del cliente nombra lo que de verdad suma.
        'alcance', coalesce(v_premio.alcance, 'services')
      )
      else null
    end,
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tipo', s.tipo,
          'trabajo_descripcion', s.trabajo_descripcion,
          'fecha', s.fecha,
          'kilometros', s.kilometros,
          'aceite_tipo', s.aceite_tipo,
          'aceite_nombre', case
            when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
            then s.aceite_nombre else null end,
          'prox_service_km', s.prox_service_km,
          -- La alineación es del vehículo entero, no de una rueda: viaja
          -- en la cabecera del trabajo.
          'alineacion', s.alineacion,
          -- El beneficio de la compra (bloque 2): rotación y balanceo sin
          -- cargo hasta X km o hasta tal fecha. Solo si el taller lo tiene
          -- prendido; con beneficio_km = 0 viaja null y no se dibuja.
          'beneficio_hasta_km', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_km end,
          'beneficio_hasta_fecha', case when coalesce(v_beneficio_km, 0) > 0
            then s.beneficio_hasta_fecha end,
          'sucursal', case
            when coalesce((v_config.campos_visibles->>'mostrar_sucursal')::boolean, true)
            then suc.nombre else null end,
          'observaciones', case
            when coalesce((v_config.campos_visibles->>'mostrar_observaciones')::boolean, false)
            then s.observaciones else null end,
          'fijado', (now() - s.created_at >= interval '24 hours'),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'tipo', si.item_tipo,
                'cambiado', si.cambiado,
                -- La cantidad viaja desde el bloque 5. Si el auto llevó dos
                -- filtros, el papel del cliente tiene que decirlo.
                'cantidad', si.cantidad,
                'detalle', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(si.detalle, p.nombre) else null end
              ) order by si.item_tipo, si.created_at
            )
            from service_items si
            left join productos p on p.id = si.producto_id
            where si.service_id = s.id
          ), '[]'::jsonb),
          -- Las ruedas del trabajo de gomería. La MARCA respeta
          -- mostrar_productos, igual que aceite_nombre y que el detalle
          -- de cada renglón: es el producto que se vendió. La MEDIDA no
          -- se apaga — es la especificación del auto, y el dueño la
          -- necesita para saber qué comprar. La profundidad va cruda: es
          -- un dato, no un diagnóstico, y el cartón la muestra sin
          -- semáforo.
          'ruedas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'posicion', sr.posicion,
                'posicion_anterior', sr.posicion_anterior,
                'colocada', sr.colocada,
                'rotada', sr.rotada,
                'balanceada', sr.balanceada,
                'reparada', sr.reparada,
                'marca', case
                  when coalesce((v_config.campos_visibles->>'mostrar_productos')::boolean, true)
                  then coalesce(sr.marca, pr.nombre) else null end,
                'medida', sr.medida,
                'indice_carga_vel', sr.indice_carga_vel,
                'dot', sr.dot,
                'profundidad_mm', sr.profundidad_mm,
                'presion_psi', sr.presion_psi
              ) order by sr.posicion
            )
            from service_ruedas sr
            left join productos pr on pr.id = sr.producto_id
            where sr.service_id = s.id
          ), '[]'::jsonb)
        ) order by s.fecha desc, s.created_at desc
      )
      from services s
      join sucursales suc on suc.id = s.sucursal_id
      where s.vehiculo_id = v_vehiculo.id and not s.anulado
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;
-- <<< get_carton

revoke all on function get_carton(text, text) from public;
grant execute on function get_carton(text, text) to anon, authenticated;


-- ---------- 9 · resumen_inicio: el tipo de cada trabajo ----------
-- Textual de la versión vigente (20260823210000) más cuatro claves en
-- `ultimos`. Las métricas NO se filtran por tipo, a propósito: el panel
-- habla de trabajos, no de services (decisión de 6ffb0f3, sostenida).
-- >>> resumen_inicio
CREATE OR REPLACE FUNCTION public.resumen_inicio(p_sucursal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  -- El primer service de cada cliente: define "cliente nuevo" y de qué
  -- sucursal es. Se calcula una vez y se usa dos veces.
  primer_service as (
    select distinct on (v.cliente_id)
      v.cliente_id,
      s.fecha,
      s.sucursal_id
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
    order by v.cliente_id, s.fecha, s.created_at
  ),
  -- La flota que pasó por el taller en el último año. Es el universo del
  -- % de escaneo: son los autos que tienen calco en el parasol.
  flota_anual as (
    select distinct v.id, v.patente_normalizada
    from services s
    join vehiculos v on v.id = s.vehiculo_id
    where not s.anulado
      and s.fecha >= current_date - interval '12 months'
  ),
  -- El arranque de las series: el primer service bajo el filtro vigente.
  -- Con el filtro de sucursal puesto, cada sucursal arranca donde
  -- realmente arrancó — no donde arrancó el tenant.
  primer_de_serie as (
    select min(s.fecha) as fecha
    from services s
    where not s.anulado
      and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
  )
  select jsonb_build_object(

    -- El checklist no se filtra: es el estado de configuración del
    -- lubricentro entero.
    'checklist', jsonb_build_object(
      'sucursales', (select count(*) from sucursales where activa),
      'productos',  (select count(*) from productos where activo),
      'premio_meta',(select meta_services from premios where activo limit 1),
      'services',   (select count(*) from services where not anulado)
    ),

    'metricas', jsonb_build_object(
      'services_mes', (
        select count(*) from services
        where not anulado
          and fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'clientes_nuevos', (
        select count(*) from primer_service ps
        where ps.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or ps.sucursal_id = p_sucursal_id)),
      'recuperados', coalesce(
        recuperados_del_mes(mi_lubricentro_id(), null, p_sucursal_id), 0),
      'canjes_mes', (
        select count(*) from canjes c
        left join services s on s.id = c.service_id
        where c.created_at >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id))
    ),

    -- La landing es de la marca: estos dos NUNCA se filtran por sucursal.
    'landing', jsonb_build_object(
      'flota', (select count(*) from flota_anual),
      'escaneados', (
        select count(*) from flota_anual f
        where exists (
          select 1 from landing_busquedas lb
          where lb.patente = f.patente_normalizada
            and lb.created_at >= now() - interval '12 months')),
      'leads', (
        select count(*) from landing_busquedas
        where not encontrada
          and created_at >= now() - interval '12 months')
    ),

    'services_por_sucursal', coalesce((
      select jsonb_agg(
        jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
        order by x.cantidad desc)
      from (
        select suc.nombre, count(*)::integer as cantidad
        from services s
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and s.fecha >= date_trunc('month', current_date)
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        group by suc.nombre
      ) x
    ), '[]'::jsonb),

    -- Las cuatro series del gráfico nuevo. Ventanas: 12 semanas, 12
    -- meses, 8 trimestres (dos años de estacionalidad) y todos los años.
    -- El punto es {inicio: date, cantidad} — 'inicio' como fecha real y
    -- no 'YYYY-MM', para que las cuatro compartan el mismo formateador
    -- de etiquetas en el front.
    'series', (
      select jsonb_object_agg(g.clave, serie.datos)
      from (values
        ('semana',    'week',    interval '1 week',   12),
        ('mes',       'month',   interval '1 month',  12),
        ('trimestre', 'quarter', interval '3 months',  8),
        -- CINCO años, con tope duro. Antes eran 1000 pasos ("sin tope"),
        -- confiando en que el greatest() de abajo recortara al primer
        -- service. Recorta — pero recorta a lo que diga el dato, y basta
        -- UN service con el año mal tipeado (un 1031 en vez de un 2031)
        -- para que la ventana se abra a novecientos y pico de años de
        -- ceros. Con un tope fijo, un dato sucio deja de ser un problema
        -- de layout: la vista muestra los últimos 5 años y listo.
        ('anio',      'year',    interval '1 year',    5)
      ) as g(clave, unidad, paso, pasos)
      cross join lateral (
        select case
          when (select fecha from primer_de_serie) is null then '[]'::jsonb
          else coalesce((
            select jsonb_agg(
              jsonb_build_object('inicio', p.inicio, 'cantidad', (
                select count(*)::integer from services s
                where not s.anulado
                  and s.fecha >= p.inicio
                  and s.fecha < (p.inicio + g.paso)::date
                  and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
              ))
              order by p.inicio)
            from (
              select generate_series(
                greatest(
                  (date_trunc(g.unidad, current_date) - (g.pasos - 1) * g.paso)::date,
                  date_trunc(g.unidad, (select fecha from primer_de_serie))::date
                ),
                date_trunc(g.unidad, current_date)::date,
                g.paso)::date as inicio
            ) p
          ), '[]'::jsonb)
        end as datos
      ) serie
    ),

    -- La vista ya trae el estado calculado por el ritmo real del vehículo.
    -- Se filtra por la sucursal del último service, que es la que la
    -- vista expone.
    'retencion', jsonb_build_object(
      'vencido', (select count(*) from vista_proximos_service
                  where estado = 'vencido'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'urgente', (select count(*) from vista_proximos_service
                  where estado = 'urgente'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id)),
      'proximo', (select count(*) from vista_proximos_service
                  where estado = 'proximo'
                    and (p_sucursal_id is null or sucursal_id = p_sucursal_id))
    ),

    'ultimos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'fecha', u.fecha,
          'creado', u.created_at,
          'patente', u.patente,
          'vehiculo', u.vehiculo,
          'sucursal', u.sucursal,
          'km', u.kilometros,
          -- El TIPO de cada trabajo (bloque 2 de gomería). Sin esto,
          -- "Últimos trabajos" mostraba kilómetros para los tres tipos:
          -- para una gomería, la primera pantalla del día listaba
          -- trabajos de cubiertas como si fueran services. Las ruedas
          -- viajan como booleanos y el front arma el resumen con la misma
          -- función que usa en todas las otras pantallas.
          'tipo', u.tipo,
          'descripcion', u.trabajo_descripcion,
          'alineacion', u.alineacion,
          'ruedas', u.ruedas)
        order by u.fecha desc, u.created_at desc)
      from (
        select s.id, s.fecha, s.created_at, s.kilometros,
               s.tipo, s.trabajo_descripcion, s.alineacion,
               (select coalesce(jsonb_agg(jsonb_build_object(
                  'colocada', r.colocada, 'rotada', r.rotada,
                  'balanceada', r.balanceada, 'reparada', r.reparada)), '[]'::jsonb)
                from service_ruedas r where r.service_id = s.id) as ruedas,
               v.patente,
               nullif(trim(concat_ws(' ', v.marca, v.modelo)), '') as vehiculo,
               suc.nombre as sucursal
        from services s
        join vehiculos v on v.id = s.vehiculo_id
        join sucursales suc on suc.id = s.sucursal_id
        where not s.anulado
          and (p_sucursal_id is null or s.sucursal_id = p_sucursal_id)
        order by s.fecha desc, s.created_at desc
        limit 5
      ) u
    ), '[]'::jsonb)
  );
$function$;
-- <<< resumen_inicio
