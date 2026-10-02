#!/usr/bin/env node
// Importar el historial de un taller desde su planilla ya limpia.
//
//   node scripts/importar-planilla.mjs importaciones/falco/falco-limpio.json \
//     --slug falco-lubricantes-y-servicios \
//     --salida importaciones/falco/falco-importar.sql
//
// GENERA SQL; NO SE CONECTA A NINGUNA BASE. Producción la toca Santiago, con
// el archivo en la mano. Escribe dos archivos, los dos fuera del repo
// (/importaciones está en .gitignore: llevan nombres y teléfonos):
//
//   <salida>            la importación: un archivo, UNA transacción.
//   <…>-deshacer.sql    borra lo importado de ese tenant y de ese origen.
//
// Lo que hace el SQL, en orden:
//   1. Resuelve el tenant por slug, la sucursal (la única activa, o la de
//      --sucursal) y el owner. Si falta algo, excepción y no entra nada.
//   2. Idempotencia: si el tenant ya tiene una fila con ese `importado_de`,
//      `ya_importado`. Correrlo dos veces no duplica nada.
//   3. Carga la planilla en tablas temporales, de a 500 filas por sentencia.
//   4. Productos por nombre: el que ya existe se reusa.
//   5. Vehículos por patente normalizada: el que ya existe se reusa CON SU
//      CLIENTE, y el cliente de la planilla para ese auto no se crea.
//   6. Services con sus renglones y 7. mecánicas, con `created_at` a las
//      12:00 (Córdoba) de la fecha de la planilla: el plazo de edición nace
//      vencido y el papel dice «fijado».
//   8. `raise notice` con los conteos, y commit.
//
// Este script NO limpia ni corrige datos. La fila que no cierra con un CHECK
// de la base no se «arregla»: no entra, se lista con su n_planilla en un
// notice («RECHAZADA · …») y la importación sigue. El juez es la base.
//
// Nada de stock (queda null y no se descuenta), nada de `tenant_eventos`,
// nada de contactos, nada de mails: son INSERT directos, no `guardar_service`.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const LOTE = 500;

// ── Argumentos ──────────────────────────────────────────────────────────────
function uso(mensaje) {
  if (mensaje) console.error(`✗ ${mensaje}\n`);
  console.error(
    "Uso: node scripts/importar-planilla.mjs <planilla-limpia.json> --slug <slug> --salida <archivo.sql> [--sucursal <uuid>]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const opciones = {};
let entrada = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--slug" || a === "--salida" || a === "--sucursal") {
    if (args[i + 1] === undefined) uso(`A ${a} le falta el valor.`);
    opciones[a.slice(2)] = args[++i];
  } else if (a.startsWith("--")) {
    uso(`No conozco la opción ${a}.`);
  } else if (entrada === null) {
    entrada = a;
  } else {
    uso(`Sobra un argumento: ${a}.`);
  }
}
if (!entrada) uso("Falta el JSON de la planilla limpia.");
if (!opciones.slug) uso("Falta --slug: el slug del tenant que recibe la importación.");
if (!opciones.salida) uso("Falta --salida: dónde escribir el SQL.");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(opciones.slug)) {
  uso(`«${opciones.slug}» no tiene forma de slug.`);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (opciones.sucursal && !UUID.test(opciones.sucursal)) {
  uso("--sucursal espera el id (uuid) de la sucursal, no su nombre.");
}

// ── La planilla ─────────────────────────────────────────────────────────────
let planilla;
try {
  planilla = JSON.parse(readFileSync(entrada, "utf8"));
} catch (e) {
  uso(`No pude leer ${entrada}: ${e.message}`);
}

const HOJAS = ["clientes", "vehiculos", "productos", "services", "renglones", "mecanicas"];
for (const hoja of HOJAS) {
  if (!Array.isArray(planilla[hoja])) uso(`Al JSON le falta la hoja «${hoja}».`);
}
const origen = planilla.meta?.origen;
if (typeof origen !== "string" || origen.trim().length < 3) {
  uso("Al JSON le falta meta.origen: es el valor de importado_de.");
}

// Vacío es null, venga como "" o como null.
const vacio = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// Lo ESTRUCTURAL sí frena acá: una referencia que no resuelve no es un dato
// feo, es un archivo con el que no se puede armar un SQL coherente. Lo
// arregla limpiar.py, no este script.
const problemas = [];
function indexar(hoja, campo) {
  const vistos = new Map();
  for (const fila of planilla[hoja]) {
    const clave = fila[campo];
    if (vacio(clave)) problemas.push(`${hoja}: una fila sin ${campo}`);
    else if (vistos.has(clave)) problemas.push(`${hoja}: ${campo} repetido (${clave})`);
    else vistos.set(clave, fila);
  }
  return vistos;
}
const clientes = indexar("clientes", "cliente_key");
const vehiculos = indexar("vehiculos", "vehiculo_key");
const productos = indexar("productos", "producto_key");
const services = indexar("services", "n_planilla");
indexar("mecanicas", "n_planilla"); // solo por el chequeo de repetidos

for (const v of planilla.vehiculos) {
  if (!clientes.has(v.cliente_key)) {
    problemas.push(`vehiculos ${v.vehiculo_key}: su cliente_key (${v.cliente_key}) no está en clientes`);
  }
}
for (const s of planilla.services) {
  if (!vehiculos.has(s.vehiculo_key)) {
    problemas.push(`services n_planilla ${s.n_planilla}: su vehiculo_key (${s.vehiculo_key}) no está en vehiculos`);
  }
  if (!vacio(s.producto_key) && !productos.has(s.producto_key)) {
    problemas.push(`services n_planilla ${s.n_planilla}: su producto_key (${s.producto_key}) no está en productos`);
  }
}
for (const m of planilla.mecanicas) {
  if (!vehiculos.has(m.vehiculo_key)) {
    problemas.push(`mecanicas n_planilla ${m.n_planilla}: su vehiculo_key (${m.vehiculo_key}) no está en vehiculos`);
  }
  if (services.has(m.n_planilla)) {
    problemas.push(`n_planilla ${m.n_planilla}: está en services Y en mecanicas`);
  }
}
for (const r of planilla.renglones) {
  if (!services.has(r.n_planilla)) {
    problemas.push(`renglones n_planilla ${r.n_planilla}: no hay un service con ese número`);
  }
}

// ── Literales SQL ───────────────────────────────────────────────────────────
// standard_conforming_strings está prendido desde Postgres 9.1: la única
// escapada es la comilla simple. Un byte nulo no entra en un text.
const texto = (v) => (vacio(v) ? "null" : `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'`);
function numero(v, donde) {
  if (vacio(v)) return "null";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    problemas.push(`${donde}: «${v}» no es un número`);
    return "null";
  }
  return String(n);
}
function fecha(v, donde) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    problemas.push(`${donde}: «${v}» no es una fecha ISO`);
    return "null";
  }
  return `'${v}'`;
}
const booleano = (v) => (v === true ? "true" : v === false ? "false" : "null");

function lotes(tabla, columnas, filas) {
  const sentencias = [];
  for (let i = 0; i < filas.length; i += LOTE) {
    const valores = filas.slice(i, i + LOTE).map((f) => `  (${f.join(", ")})`);
    sentencias.push(`insert into ${tabla} (${columnas.join(", ")}) values\n${valores.join(",\n")};`);
  }
  return sentencias.join("\n\n");
}

const datos = [
  lotes(
    "imp_clientes",
    ["key", "nombre", "telefono"],
    planilla.clientes.map((c) => [texto(c.cliente_key), texto(c.nombre), texto(c.telefono)]),
  ),
  lotes(
    "imp_vehiculos",
    ["key", "cliente_key", "patente", "marca", "modelo", "clase"],
    planilla.vehiculos.map((v) => [
      texto(v.vehiculo_key),
      texto(v.cliente_key),
      texto(v.patente),
      texto(v.marca),
      texto(v.modelo),
      texto(v.clase),
    ]),
  ),
  lotes(
    "imp_productos",
    ["key", "nombre", "marca", "categoria", "unidad", "litros_sugeridos"],
    planilla.productos.map((p) => [
      texto(p.producto_key),
      texto(p.nombre),
      texto(p.marca),
      texto(p.categoria),
      texto(p.unidad),
      numero(p.litros_sugeridos, `productos ${p.producto_key}.litros_sugeridos`),
    ]),
  ),
  lotes(
    "imp_services",
    [
      "n_planilla",
      "vehiculo_key",
      "fecha",
      "kilometros",
      "aceite_tipo",
      "aceite_nombre",
      "producto_key",
      "aceite_litros",
      "prox_service_km",
      "observaciones",
    ],
    planilla.services.map((s) => {
      const d = `services n_planilla ${s.n_planilla}`;
      return [
        numero(s.n_planilla, `${d}.n_planilla`),
        texto(s.vehiculo_key),
        fecha(s.fecha, `${d}.fecha`),
        numero(s.kilometros, `${d}.kilometros`),
        texto(s.aceite_tipo),
        texto(s.aceite_nombre),
        texto(s.producto_key),
        numero(s.aceite_litros, `${d}.aceite_litros`),
        numero(s.prox_service_km, `${d}.prox_service_km`),
        texto(s.observaciones),
      ];
    }),
  ),
  lotes(
    "imp_renglones",
    ["n_planilla", "item_tipo", "cambiado", "detalle", "cantidad"],
    planilla.renglones.map((r) => {
      const d = `renglones n_planilla ${r.n_planilla}`;
      return [
        numero(r.n_planilla, `${d}.n_planilla`),
        texto(r.item_tipo),
        booleano(r.cambiado),
        texto(r.detalle),
        numero(r.cantidad, `${d}.cantidad`),
      ];
    }),
  ),
  lotes(
    "imp_mecanicas",
    ["n_planilla", "vehiculo_key", "fecha", "kilometros", "descripcion", "observaciones"],
    planilla.mecanicas.map((m) => {
      const d = `mecanicas n_planilla ${m.n_planilla}`;
      return [
        numero(m.n_planilla, `${d}.n_planilla`),
        texto(m.vehiculo_key),
        fecha(m.fecha, `${d}.fecha`),
        numero(m.kilometros, `${d}.kilometros`),
        texto(m.descripcion),
        texto(m.observaciones),
      ];
    }),
  ),
]
  .filter(Boolean)
  .join("\n\n");

if (problemas.length > 0) {
  console.error(`✗ El JSON no cierra (${problemas.length}). Lo arregla el script de limpieza, no este:`);
  for (const p of problemas.slice(0, 40)) console.error(`  · ${p}`);
  if (problemas.length > 40) console.error(`  … y ${problemas.length - 40} más.`);
  process.exit(1);
}

// ── El SQL de la importación ────────────────────────────────────────────────
const slug = opciones.slug;
const generado = new Date().toISOString();
const sucursalPedida = opciones.sucursal ? `'${opciones.sucursal}'` : "null";

const importar = `-- Importación de planilla · origen «${origen}» · tenant «${slug}»
-- Generado por scripts/importar-planilla.mjs el ${generado}.
-- NO editar a mano. NO commitear: tiene nombres y teléfonos de clientes.
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f ${basename(opciones.salida)}
--
-- Una sola transacción. Correrlo dos veces no duplica nada: la segunda vez
-- falla con «ya_importado» antes de escribir una fila.

begin;

-- ---------- 1 y 2 · El tenant, la sucursal, el owner y la idempotencia ----------
create temp table imp_contexto (
  lubricentro_id uuid not null,
  sucursal_id    uuid not null,
  owner_id       uuid not null,
  slug           text not null,
  origen         text not null
) on commit drop;

do $importar$
declare
  v_slug     constant text := ${texto(slug)};
  v_origen   constant text := ${texto(origen)};
  v_pedida   constant uuid := ${sucursalPedida};
  v_lubricentro uuid;
  v_sucursal    uuid;
  v_owner       uuid;
  v_n           integer;
begin
  select id into v_lubricentro from lubricentros where slug = v_slug;
  if v_lubricentro is null then
    raise exception 'tenant_no_encontrado'
      using hint = format('No hay ningún lubricentro con el slug «%s» en esta base.', v_slug);
  end if;

  -- Cualquier fila del tenant con este origen, en cualquiera de las cuatro
  -- tablas: ya se importó. Para volver a importar, primero el SQL de deshacer.
  if exists (select 1 from services  where lubricentro_id = v_lubricentro and importado_de = v_origen)
     or exists (select 1 from vehiculos where lubricentro_id = v_lubricentro and importado_de = v_origen)
     or exists (select 1 from clientes  where lubricentro_id = v_lubricentro and importado_de = v_origen)
     or exists (select 1 from productos where lubricentro_id = v_lubricentro and importado_de = v_origen)
  then
    raise exception 'ya_importado'
      using hint = format('«%s» ya tiene filas con importado_de = «%s». No se escribió nada. Para volver a importar, corré antes el SQL de deshacer.', v_slug, v_origen);
  end if;

  if v_pedida is not null then
    select id into v_sucursal from sucursales
    where id = v_pedida and lubricentro_id = v_lubricentro;
    if v_sucursal is null then
      raise exception 'sucursal_ajena'
        using hint = format('La sucursal %s no es de «%s».', v_pedida, v_slug);
    end if;
  else
    select count(*) into v_n from sucursales
    where lubricentro_id = v_lubricentro and activa;
    if v_n = 0 then
      raise exception 'sin_sucursal'
        using hint = format('«%s» no tiene ninguna sucursal activa.', v_slug);
    elsif v_n > 1 then
      raise exception 'varias_sucursales'
        using hint = format('«%s» tiene %s sucursales activas. Generá el SQL de nuevo con --sucursal <id>: %s', v_slug, v_n,
          (select string_agg(format('%s (%s)', id, nombre), ', ' order by created_at)
           from sucursales where lubricentro_id = v_lubricentro and activa));
    end if;
    select id into v_sucursal from sucursales
    where lubricentro_id = v_lubricentro and activa;
  end if;

  -- El owner firma los trabajos importados (services.usuario_id es NOT NULL).
  -- Con más de uno, el más viejo: el mismo criterio que el listado de /fidelli.
  select id into v_owner from usuarios
  where lubricentro_id = v_lubricentro and rol = 'owner'
  order by created_at
  limit 1;
  if v_owner is null then
    raise exception 'sin_owner'
      using hint = format('«%s» no tiene un usuario owner. Invitalo desde /fidelli antes de importar.', v_slug);
  end if;

  insert into imp_contexto values (v_lubricentro, v_sucursal, v_owner, v_slug, v_origen);
end
$importar$;

-- ---------- 3 · La planilla, en tablas temporales ----------
-- Sin CHECKs a propósito: acá entra todo tal cual, y el que juzga cada fila
-- es el CHECK de la tabla de verdad, más abajo.
create temp table imp_clientes (
  key       text primary key,
  id        uuid not null default gen_random_uuid(),
  nombre    text,
  telefono  text,
  crear     boolean not null default false,
  rechazado boolean not null default false
) on commit drop;

create temp table imp_vehiculos (
  key         text primary key,
  id          uuid not null default gen_random_uuid(),
  cliente_key text,
  patente     text,
  marca       text,
  modelo      text,
  clase       text,
  reusado     boolean not null default false,
  rechazado   boolean not null default false
) on commit drop;

create temp table imp_productos (
  key              text primary key,
  id               uuid not null default gen_random_uuid(),
  nombre           text,
  marca            text,
  categoria        text,
  unidad           text,
  litros_sugeridos numeric,
  reusado          boolean not null default false,
  rechazado        boolean not null default false
) on commit drop;

create temp table imp_services (
  n_planilla      integer primary key,
  id              uuid not null default gen_random_uuid(),
  vehiculo_key    text,
  fecha           date,
  kilometros      integer,
  aceite_tipo     text,
  aceite_nombre   text,
  producto_key    text,
  aceite_litros   numeric,
  prox_service_km integer,
  observaciones   text,
  rechazado       boolean not null default false
) on commit drop;

create temp table imp_renglones (
  n_planilla integer,
  item_tipo  text,
  cambiado   boolean,
  detalle    text,
  cantidad   numeric
) on commit drop;

create temp table imp_mecanicas (
  n_planilla    integer primary key,
  id            uuid not null default gen_random_uuid(),
  vehiculo_key  text,
  fecha         date,
  kilometros    integer,
  descripcion   text,
  observaciones text
) on commit drop;

-- Lo que la base no aceptó. No se arregla: se lista.
create temp table imp_rechazadas (
  hoja       text not null,
  clave      text,
  n_planilla integer,
  motivo     text not null
) on commit drop;

create temp table imp_resultado (
  dato     text not null,
  cantidad integer not null
) on commit drop;

${datos}

-- ---------- 4 a 8 · De las temporales a las tablas ----------
-- Cada hoja entra de una sola sentencia. Si la base rechaza la sentencia
-- (un CHECK, un índice único, un trigger), esa hoja se reintenta fila por
-- fila: la que no entra se anota en imp_rechazadas con su motivo y la
-- importación sigue. Con la planilla limpia, el reintento no corre nunca.
do $importar$
declare
  c   imp_contexto;
  r   record;
  n_clientes   integer := 0;
  n_veh        integer := 0;
  n_veh_reuso  integer := 0;
  n_prod       integer := 0;
  n_prod_reuso integer := 0;
  n_services   integer := 0;
  n_renglones  integer := 0;
  n_mecanicas  integer := 0;
  n_rechazadas integer := 0;
begin
  select * into strict c from imp_contexto;

  -- ---- 4 · Productos: por nombre, dentro del tenant ----
  update imp_productos ip
  set id = e.id, reusado = true
  from (
    select distinct on (lower(trim(p.nombre))) p.id, lower(trim(p.nombre)) as clave
    from productos p
    where p.lubricentro_id = c.lubricentro_id
    order by lower(trim(p.nombre)), p.activo desc, p.created_at
  ) e
  where e.clave = lower(trim(ip.nombre));

  begin
    insert into productos (id, lubricentro_id, categoria, nombre, marca, unidad, stock, litros_sugeridos, importado_de)
    select ip.id, c.lubricentro_id, ip.categoria, ip.nombre, ip.marca, ip.unidad, null, ip.litros_sugeridos, c.origen
    from imp_productos ip
    where not ip.reusado;
  exception when others then
    for r in select * from imp_productos where not reusado order by key loop
      begin
        insert into productos (id, lubricentro_id, categoria, nombre, marca, unidad, stock, litros_sugeridos, importado_de)
        values (r.id, c.lubricentro_id, r.categoria, r.nombre, r.marca, r.unidad, null, r.litros_sugeridos, c.origen);
      exception when others then
        update imp_productos set rechazado = true where key = r.key;
        insert into imp_rechazadas values ('productos', r.key, null, sqlerrm);
      end;
    end loop;
  end;

  -- ---- 5 · Vehículos: por patente normalizada, dentro del tenant ----
  -- El que ya existe se reusa con SU cliente. normalizar_patente() es la
  -- de la base: la misma que usa el trigger al guardar.
  update imp_vehiculos iv
  set id = v.id, reusado = true
  from vehiculos v
  where v.lubricentro_id = c.lubricentro_id
    and v.patente_normalizada = normalizar_patente(iv.patente);

  -- Un cliente de la planilla se crea solo si le queda algún auto por crear.
  update imp_clientes ic
  set crear = true
  where exists (
    select 1 from imp_vehiculos iv where iv.cliente_key = ic.key and not iv.reusado
  );

  begin
    insert into clientes (id, lubricentro_id, nombre, telefono, importado_de)
    select ic.id, c.lubricentro_id, ic.nombre, ic.telefono, c.origen
    from imp_clientes ic
    where ic.crear;
  exception when others then
    for r in select * from imp_clientes where crear order by key loop
      begin
        insert into clientes (id, lubricentro_id, nombre, telefono, importado_de)
        values (r.id, c.lubricentro_id, r.nombre, r.telefono, c.origen);
      exception when others then
        update imp_clientes set rechazado = true where key = r.key;
        insert into imp_rechazadas values ('clientes', r.key, null, sqlerrm);
      end;
    end loop;
  end;

  -- El auto de un cliente que no entró tampoco entra.
  update imp_vehiculos iv
  set rechazado = true
  from imp_clientes ic
  where ic.key = iv.cliente_key and ic.rechazado and not iv.reusado;

  insert into imp_rechazadas
  select 'vehiculos', iv.key, null, 'su cliente (' || iv.cliente_key || ') fue rechazado'
  from imp_vehiculos iv where iv.rechazado;

  begin
    insert into vehiculos (id, lubricentro_id, cliente_id, patente, marca, modelo, clase, importado_de)
    select iv.id, c.lubricentro_id, ic.id, iv.patente, iv.marca, iv.modelo, iv.clase::clase_vehiculo, c.origen
    from imp_vehiculos iv
    join imp_clientes ic on ic.key = iv.cliente_key
    where not iv.reusado and not iv.rechazado;
  exception when others then
    for r in
      select iv.*, ic.id as cliente_id
      from imp_vehiculos iv
      join imp_clientes ic on ic.key = iv.cliente_key
      where not iv.reusado and not iv.rechazado
      order by iv.key
    loop
      begin
        insert into vehiculos (id, lubricentro_id, cliente_id, patente, marca, modelo, clase, importado_de)
        values (r.id, c.lubricentro_id, r.cliente_id, r.patente, r.marca, r.modelo, r.clase::clase_vehiculo, c.origen);
      exception when others then
        update imp_vehiculos set rechazado = true where key = r.key;
        insert into imp_rechazadas values ('vehiculos', r.key, null, r.patente || ': ' || sqlerrm);
      end;
    end loop;
  end;

  -- ---- 6 · Services ----
  -- created_at = las 12:00 de Córdoba del día de la planilla: el plazo de
  -- edición nace vencido y get_carton dice «fijado». updated_at, igual.
  insert into imp_rechazadas
  select 'services', s.vehiculo_key, s.n_planilla, 'su vehículo (' || s.vehiculo_key || ') fue rechazado'
  from imp_services s
  join imp_vehiculos iv on iv.key = s.vehiculo_key
  where iv.rechazado;

  update imp_services s
  set rechazado = true
  from imp_vehiculos iv
  where iv.key = s.vehiculo_key and iv.rechazado;

  begin
    insert into services (
      id, lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, kilometros,
      aceite_tipo, aceite_nombre, aceite_producto_id, aceite_litros, prox_service_km,
      observaciones, importado_de, created_at, updated_at)
    select
      s.id, c.lubricentro_id, c.sucursal_id, iv.id, c.owner_id, 'service', s.fecha, s.kilometros,
      s.aceite_tipo, s.aceite_nombre, ip.id, s.aceite_litros, s.prox_service_km,
      s.observaciones, c.origen,
      (s.fecha + time '12:00') at time zone 'America/Argentina/Cordoba',
      (s.fecha + time '12:00') at time zone 'America/Argentina/Cordoba'
    from imp_services s
    join imp_vehiculos iv on iv.key = s.vehiculo_key
    left join imp_productos ip on ip.key = s.producto_key and not ip.rechazado
    where not s.rechazado;
  exception when others then
    for r in
      select s.*, iv.id as vehiculo_id, ip.id as producto_id
      from imp_services s
      join imp_vehiculos iv on iv.key = s.vehiculo_key
      left join imp_productos ip on ip.key = s.producto_key and not ip.rechazado
      where not s.rechazado
      order by s.n_planilla
    loop
      begin
        insert into services (
          id, lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, kilometros,
          aceite_tipo, aceite_nombre, aceite_producto_id, aceite_litros, prox_service_km,
          observaciones, importado_de, created_at, updated_at)
        values (
          r.id, c.lubricentro_id, c.sucursal_id, r.vehiculo_id, c.owner_id, 'service', r.fecha, r.kilometros,
          r.aceite_tipo, r.aceite_nombre, r.producto_id, r.aceite_litros, r.prox_service_km,
          r.observaciones, c.origen,
          (r.fecha + time '12:00') at time zone 'America/Argentina/Cordoba',
          (r.fecha + time '12:00') at time zone 'America/Argentina/Cordoba');
      exception when others then
        update imp_services set rechazado = true where n_planilla = r.n_planilla;
        insert into imp_rechazadas values ('services', r.vehiculo_key, r.n_planilla, sqlerrm);
      end;
    end loop;
  end;

  -- ---- Renglones ----
  -- El lubricentro_id lo pone el trigger service_items_heredar_tenant.
  insert into imp_rechazadas
  select 'renglones', rg.item_tipo, rg.n_planilla, 'su service fue rechazado'
  from imp_renglones rg
  join imp_services s on s.n_planilla = rg.n_planilla
  where s.rechazado;

  begin
    insert into service_items (service_id, item_tipo, detalle, cambiado, cantidad)
    select s.id, rg.item_tipo::item_tipo, rg.detalle, rg.cambiado, rg.cantidad
    from imp_renglones rg
    join imp_services s on s.n_planilla = rg.n_planilla
    where not s.rechazado;
    get diagnostics n_renglones = row_count;
  exception when others then
    n_renglones := 0;
    for r in
      select rg.*, s.id as service_id
      from imp_renglones rg
      join imp_services s on s.n_planilla = rg.n_planilla
      where not s.rechazado
      order by rg.n_planilla, rg.item_tipo
    loop
      begin
        insert into service_items (service_id, item_tipo, detalle, cambiado, cantidad)
        values (r.service_id, r.item_tipo::item_tipo, r.detalle, r.cambiado, r.cantidad);
        n_renglones := n_renglones + 1;
      exception when others then
        insert into imp_rechazadas values ('renglones', r.item_tipo, r.n_planilla, sqlerrm);
      end;
    end loop;
  end;

  -- ---- 7 · Mecánicas ----
  -- Sin ningún campo de aceite (mecanica_coherente). Mismo created_at.
  insert into imp_rechazadas
  select 'mecanicas', m.vehiculo_key, m.n_planilla, 'su vehículo (' || m.vehiculo_key || ') fue rechazado'
  from imp_mecanicas m
  join imp_vehiculos iv on iv.key = m.vehiculo_key
  where iv.rechazado;

  begin
    insert into services (
      id, lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, kilometros,
      trabajo_descripcion, observaciones, importado_de, created_at, updated_at)
    select
      m.id, c.lubricentro_id, c.sucursal_id, iv.id, c.owner_id, 'mecanica', m.fecha, m.kilometros,
      m.descripcion, m.observaciones, c.origen,
      (m.fecha + time '12:00') at time zone 'America/Argentina/Cordoba',
      (m.fecha + time '12:00') at time zone 'America/Argentina/Cordoba'
    from imp_mecanicas m
    join imp_vehiculos iv on iv.key = m.vehiculo_key
    where not iv.rechazado;
  exception when others then
    for r in
      select m.*, iv.id as vehiculo_id
      from imp_mecanicas m
      join imp_vehiculos iv on iv.key = m.vehiculo_key
      where not iv.rechazado
      order by m.n_planilla
    loop
      begin
        insert into services (
          id, lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, kilometros,
          trabajo_descripcion, observaciones, importado_de, created_at, updated_at)
        values (
          r.id, c.lubricentro_id, c.sucursal_id, r.vehiculo_id, c.owner_id, 'mecanica', r.fecha, r.kilometros,
          r.descripcion, r.observaciones, c.origen,
          (r.fecha + time '12:00') at time zone 'America/Argentina/Cordoba',
          (r.fecha + time '12:00') at time zone 'America/Argentina/Cordoba');
      exception when others then
        insert into imp_rechazadas values ('mecanicas', r.vehiculo_key, r.n_planilla, sqlerrm);
      end;
    end loop;
  end;

  -- ---- 8 · Los conteos: lo que QUEDÓ en las tablas, no lo que se mandó ----
  select count(*) into n_clientes  from clientes  where lubricentro_id = c.lubricentro_id and importado_de = c.origen;
  select count(*) into n_veh       from vehiculos where lubricentro_id = c.lubricentro_id and importado_de = c.origen;
  select count(*) into n_prod      from productos where lubricentro_id = c.lubricentro_id and importado_de = c.origen;
  select count(*) into n_services  from services  where lubricentro_id = c.lubricentro_id and importado_de = c.origen and tipo = 'service';
  select count(*) into n_mecanicas from services  where lubricentro_id = c.lubricentro_id and importado_de = c.origen and tipo = 'mecanica';
  select count(*) into n_veh_reuso  from imp_vehiculos where reusado;
  select count(*) into n_prod_reuso from imp_productos where reusado;
  select count(*) into n_rechazadas from imp_rechazadas;

  insert into imp_resultado values
    ('clientes creados', n_clientes),
    ('vehículos creados', n_veh),
    ('vehículos reusados', n_veh_reuso),
    ('productos creados', n_prod),
    ('productos reusados', n_prod_reuso),
    ('services', n_services),
    ('renglones', n_renglones),
    ('mecánicas', n_mecanicas),
    ('filas rechazadas', n_rechazadas);

  raise notice 'IMPORTACIÓN «%» en «%»', c.origen, c.slug;
  raise notice '  clientes creados: %', n_clientes;
  raise notice '  vehículos creados: % · reusados: %', n_veh, n_veh_reuso;
  raise notice '  productos creados: % · reusados: %', n_prod, n_prod_reuso;
  raise notice '  services: %', n_services;
  raise notice '  renglones: %', n_renglones;
  raise notice '  mecánicas: %', n_mecanicas;
  raise notice '  filas rechazadas: %', n_rechazadas;

  for r in select * from imp_rechazadas order by hoja, n_planilla, clave loop
    raise notice 'RECHAZADA · % · n_planilla % · % · %',
      r.hoja, coalesce(r.n_planilla::text, '—'), coalesce(r.clave, '—'), r.motivo;
  end loop;
end
$importar$;

-- Lo mismo que los notice, como filas: el SQL Editor no muestra los notice.
select dato, cantidad from imp_resultado;

commit;
`;

// ── El SQL de deshacer ──────────────────────────────────────────────────────
// La única excepción a «los datos históricos no se borran»: lo importado no
// es historia de Fidelli hasta que Santiago lo acepte.
const deshacer = `-- Deshacer la importación · origen «${origen}» · tenant «${slug}»
-- Generado por scripts/importar-planilla.mjs el ${generado}.
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f ${basename(rutaDeshacer(opciones.salida))}
--
-- Borra, en orden, service_items → services → vehiculos → clientes →
-- productos del tenant CON ESE importado_de, y nada más.
--
-- Lo que el taller ya usó se queda: un auto importado al que después se le
-- cargó un trabajo en el panel (o un contacto, un pendiente, una nota, un
-- canje), su cliente, y un producto importado que algún trabajo del panel
-- usa. Esas filas no se pueden borrar sin llevarse historia de verdad, así
-- que se quedan y PIERDEN la marca: pasan a ser del taller. Una
-- re-importación las encuentra por patente o por nombre y las reusa.

begin;

do $deshacer$
declare
  v_slug   constant text := ${texto(slug)};
  v_origen constant text := ${texto(origen)};
  v_lub    uuid;
  n_renglones integer; n_services integer;
  n_veh integer; n_veh_quedan integer;
  n_cli integer; n_cli_quedan integer;
  n_prod integer; n_prod_quedan integer;
begin
  select id into v_lub from lubricentros where slug = v_slug;
  if v_lub is null then
    raise exception 'tenant_no_encontrado'
      using hint = format('No hay ningún lubricentro con el slug «%s» en esta base.', v_slug);
  end if;

  delete from service_items si
  using services s
  where si.service_id = s.id
    and s.lubricentro_id = v_lub and s.importado_de = v_origen;
  get diagnostics n_renglones = row_count;

  delete from services
  where lubricentro_id = v_lub and importado_de = v_origen;
  get diagnostics n_services = row_count;

  delete from vehiculos v
  where v.lubricentro_id = v_lub and v.importado_de = v_origen
    and not exists (select 1 from services s             where s.vehiculo_id = v.id)
    and not exists (select 1 from canjes x               where x.vehiculo_id = v.id)
    and not exists (select 1 from contactos x            where x.vehiculo_id = v.id)
    and not exists (select 1 from correcciones_patente x where x.vehiculo_id = v.id)
    and not exists (select 1 from notas_vehiculo x       where x.vehiculo_id = v.id)
    and not exists (select 1 from trabajos_pendientes x  where x.vehiculo_id = v.id);
  get diagnostics n_veh = row_count;

  update vehiculos set importado_de = null
  where lubricentro_id = v_lub and importado_de = v_origen;
  get diagnostics n_veh_quedan = row_count;

  delete from clientes c
  where c.lubricentro_id = v_lub and c.importado_de = v_origen
    and not exists (select 1 from vehiculos v           where v.cliente_id = c.id)
    and not exists (select 1 from supresiones_cliente x where x.cliente_id = c.id);
  get diagnostics n_cli = row_count;

  update clientes set importado_de = null
  where lubricentro_id = v_lub and importado_de = v_origen;
  get diagnostics n_cli_quedan = row_count;

  delete from productos p
  where p.lubricentro_id = v_lub and p.importado_de = v_origen
    and not exists (select 1 from services s       where s.aceite_producto_id = p.id)
    and not exists (select 1 from service_items x  where x.producto_id = p.id)
    and not exists (select 1 from service_ruedas x where x.producto_id = p.id);
  get diagnostics n_prod = row_count;

  update productos set importado_de = null
  where lubricentro_id = v_lub and importado_de = v_origen;
  get diagnostics n_prod_quedan = row_count;

  raise notice 'DESHECHA «%» en «%»', v_origen, v_slug;
  raise notice '  renglones borrados: %', n_renglones;
  raise notice '  services y mecánicas borrados: %', n_services;
  raise notice '  vehículos borrados: % · se quedan (ya tienen historia en el panel): %', n_veh, n_veh_quedan;
  raise notice '  clientes borrados: % · se quedan: %', n_cli, n_cli_quedan;
  raise notice '  productos borrados: % · se quedan (los usa un trabajo del panel): %', n_prod, n_prod_quedan;
end
$deshacer$;

commit;
`;

function rutaDeshacer(salida) {
  const archivo = basename(salida);
  const nombre = archivo.includes("-importar")
    ? archivo.replace("-importar", "-deshacer")
    : archivo.replace(/(\.sql)?$/, "-deshacer.sql");
  return join(dirname(salida), nombre);
}

writeFileSync(opciones.salida, importar);
writeFileSync(rutaDeshacer(opciones.salida), deshacer);

const mb = (Buffer.byteLength(importar) / 1024 / 1024).toFixed(1);
console.log(`Origen «${origen}» → tenant «${slug}»`);
if (planilla.meta?.slug && planilla.meta.slug !== slug) {
  console.log(`  (el JSON dice meta.slug = «${planilla.meta.slug}»; se usa el de --slug)`);
}
console.log(`  clientes ${planilla.clientes.length} · vehículos ${planilla.vehiculos.length} · productos ${planilla.productos.length}`);
console.log(`  services ${planilla.services.length} · renglones ${planilla.renglones.length} · mecánicas ${planilla.mecanicas.length}`);
console.log(`Escribí ${opciones.salida} (${mb} MB) y ${rutaDeshacer(opciones.salida)}.`);
console.log("No se conectó a ninguna base. Los dos archivos tienen datos personales: no se commitean.");
