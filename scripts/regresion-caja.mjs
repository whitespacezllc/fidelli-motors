// El service de caja automática —el cuarto tipo de trabajo— de punta a
// punta, contra el stack local (regla 13: una prueba que nunca se vio en
// rojo no existe — esta se vio en rojo sobre el front de `develop`, y cada
// regla de los helpers se rompe sola acá abajo).
//
// Lo que cubre:
//   A · Los helpers, sin navegador: lib/renglones.ts (los ATF, los saltos
//       y su rango, los cuatro renglones, validarCaja, errorDeCaja) y
//       lib/cliente/proximos.ts (qué tarjetas ve el cliente). Y LAS
//       ROTURAS: cada regla se rompe sobre una copia, se recompila y la
//       comprobación que la cubre tiene que fallar.
//   B · Sin la feature: no hay botón «Caja», no hay fuente Caja, no hay
//       tarjeta en el Inicio, y la RPC rechaza por la API directa.
//   C · La feature se prende desde la ficha de /fidelli, por su nombre y
//       sin precio.
//   D · La carga en 390 táctil: el selector 2 × 2, el aceite de caja con
//       sus chips, filtro y lavado prendidos, 80.000 por default, la
//       previsualización, confirmar y el guardado.
//   E · El detalle con el papel (PRÓX. SERVICE CAJA) y la edición dentro
//       de las 24 horas, que cambia el ATF.
//   F · La página del cliente: las dos tarjetas en un auto con service y
//       caja, y la de caja sola —con su papel— en uno que solo tiene caja
//       (cargada a 1280, con «Otro» en el aceite y en el salto).
//   G · «A quién llamar»: la fuente Caja lista el auto cuando su próximo
//       vence, y su contacto se registra con el motivo `caja` sin tildar
//       el del cambio de aceite.
//   H · El Inicio, el listado y la exportación: el .xlsx se abre y se
//       leen sus celdas (el tipo, el ATF en la columna del aceite, «Próx.
//       caja», los renglones sin estado, la hoja de productos).
//   I · Todos los dispositivos (360, 390, 820, 1280): cero scroll
//       horizontal, el selector 2 × 2 con los cuatro nombres enteros, los
//       chips de 44 px y los cuatro saltos en una fila sin cortarse.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-caja.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-caja.mjs
//     (además deja las capturas en docs/capturas/caja/)
//   DEJAR=1 …   no restaura: deja la feature prendida y las cajas cargadas
//               en el demo, para mirarlas a mano.
//
// TOCA DATOS DEL DEMO LOCAL —prende la feature, carga dos cajas, un auto y
// un aceite de prueba, acerca un próximo por psql— y LOS RESTAURA AL
// FINAL, pase lo que pase: el SQL de restauración se escribe en un archivo
// temporal apenas se sabe qué se tocó, corre en el `finally`, ante Ctrl-C,
// y al arrancar si quedó de una corrida que murió.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/caja") : null;
const DEJAR = Boolean(process.env.DEJAR);
const ARCHIVO_RESTAURAR = path.join(os.tmpdir(), "fm-regresion-caja-restaurar.sql");

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Un .xlsx es un zip de XML. Se lee con lo que trae Node —el directorio
// central del zip y un inflate por entrada—, sin sumar una dependencia
// para mirar tres celdas. Devuelve el texto de las celdas de cada hoja,
// fila por fila, con las cadenas compartidas ya resueltas.
function hojasDelXlsx(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const archivos = {};
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamano = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(inicio, inicio + tamano);
    archivos[nombre] = (metodo === 0 ? datos : zlib.inflateRawSync(datos)).toString("utf8");
    p += 46 + largoNombre + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  const limpio = (t) => t.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const compartidas = [...(archivos["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => limpio(m[1]));
  // Cada celda va a SU columna (la letra de `r="C7"`): una celda vacía
  // puede no estar escrita, y contarlas en orden las correría de lugar.
  const columna = (ref) => [...ref].reduce((n, letra) => n * 26 + letra.charCodeAt(0) - 64, 0) - 1;
  return Object.keys(archivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort().map((n) =>
    [...archivos[n].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((fila) => {
      const celdas = [];
      for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(c[1]);
        const valor = limpio(c[2] ?? "");
        celdas[ref ? columna(ref[1]) : celdas.length] = /t="s"/.test(c[1]) ? (compartidas[Number(valor)] ?? "") : valor;
      }
      return Array.from(celdas, (v) => v ?? "");
    }));
}

// ============================================================
// A · Los helpers
// ============================================================

// Sin chequeo de tipos ni resolución de imports: lib/renglones.ts importa
// solo un tipo (se borra) y lib/cliente/proximos.ts no importa nada.
function cargar(archivo, reemplazos = []) {
  const ts = require(path.join(RAIZ, "node_modules/typescript"));
  let fuente = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  for (const [de, a] of reemplazos) {
    if (!fuente.includes(de)) throw new Error(`EL REEMPLAZO NO MORDIÓ: «${de}» no está en ${archivo}`);
    fuente = fuente.replace(de, a);
  }
  const { outputText } = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-caja-"));
  const salida = path.join(dir, path.basename(archivo).replace(/\.ts$/, ".js"));
  fs.writeFileSync(salida, outputText);
  return require(salida);
}

function revisarCaja(m) {
  if (typeof m.esSaltoCajaValido !== "function") {
    return [["lib/renglones.ts tiene lo del service de caja", false, "no está: el cuarto tipo no existe en esta rama"]];
  }
  const tipos = (m.RENGLONES_CAJA ?? []).map((r) => r.tipo);
  const lleva = Object.fromEntries((m.RENGLONES_CAJA ?? []).map((r) => [r.tipo, r.lleva]));
  const v = m.validarCaja;
  return [
    ["los ATF son los siete de la lista, en su orden",
      igual(m.ATF_COMUNES, ["Dexron III", "Dexron VI", "Mercon V", "ATF+4", "Multi ATF", "CVT", "DCT"])],
    ["el ATF se guarda como se escribió, sin espacios de más (no como una viscosidad)",
      m.normalizarAtf("  Dexron   VI ") === "Dexron VI" && m.normalizarAtf("Toyota WS") === "Toyota WS"],
    ["el chip se reconoce sin importar mayúsculas; lo que no es de la lista, no",
      m.atfComun("dexron vi") === "Dexron VI" && m.atfComun(" CVT ") === "CVT" && m.atfComun("Toyota WS") === null],
    ["los saltos son 60, 70 y 80 mil, y 80.000 viene elegido",
      igual(m.SALTOS_CAJA, [60000, 70000, 80000]) && m.SALTO_CAJA_POR_DEFECTO === 80000],
    ["el salto entra de 20.000 a 200.000, con los dos bordes",
      m.esSaltoCajaValido(20000) && m.esSaltoCajaValido(200000) && !m.esSaltoCajaValido(19999) &&
        !m.esSaltoCajaValido(200001) && !m.esSaltoCajaValido(80000.5)],
    ["los renglones son los cuatro de la caja, en el orden de su papel",
      igual(tipos, ["caja_filtro", "caja_aditivo", "caja_limpieza_carter", "caja_lavado"])],
    ["filtro y aditivo llevan producto; limpieza y lavado, una nota",
      lleva.caja_filtro === "producto" && lleva.caja_aditivo === "producto" &&
        lleva.caja_limpieza_carter === "nota" && lleva.caja_lavado === "nota"],
    ["los renglones de la caja no están en el cartón de aceite",
      (m.RENGLONES ?? []).length === 21 && m.RENGLONES.every((r) => !r.tipo.startsWith("caja_"))],
    ["validarCaja: sin kilómetros no pasa",
      typeof v({ kilometros: null, aceiteTipo: "Dexron VI", proxCajaKm: 164300 }) === "string"],
    ["validarCaja: con el aceite de una letra no pasa",
      typeof v({ kilometros: 84300, aceiteTipo: " x ", proxCajaKm: 164300 }) === "string"],
    ["validarCaja: con el salto fuera de rango, o sin próximo, no pasa",
      typeof v({ kilometros: 84300, aceiteTipo: "CVT", proxCajaKm: 84300 + 10000 }) === "string" &&
        typeof v({ kilometros: 84300, aceiteTipo: "CVT", proxCajaKm: null }) === "string" &&
        typeof v({ kilometros: 84300, aceiteTipo: "CVT" }) === "string"],
    ["validarCaja: la caja bien cargada pasa",
      v({ kilometros: 84300, aceiteTipo: "Dexron VI", proxCajaKm: 164300 }) === null],
    ["errorDeCaja traduce los tres errores de la base y deja pasar los demás",
      typeof m.errorDeCaja("caja_sin_kilometros") === "string" &&
        typeof m.errorDeCaja("ERROR: aceite_caja_requerido") === "string" &&
        typeof m.errorDeCaja("salto_caja_invalido") === "string" &&
        m.errorDeCaja("descripcion_requerida") === null],
  ];
}

function revisarProximos(m) {
  const p = m.proximosDelCliente;
  if (typeof p !== "function") return [["proximosDelCliente existe", false, "no está en lib/cliente/proximos.ts"]];
  const caja = { tipo: "caja", kilometros: 84300, proxServiceKm: null, proxCajaKm: 164300 };
  const cajaVieja = { tipo: "caja", kilometros: 4300, proxServiceKm: null, proxCajaKm: 84300 };
  const service = { tipo: "service", kilometros: 80000, proxServiceKm: 90000, proxCajaKm: null };
  const serviceViejo = { tipo: "service", kilometros: 70000, proxServiceKm: 80000, proxCajaKm: null };
  const mecanica = { tipo: "mecanica", kilometros: 99000, proxServiceKm: null, proxCajaKm: null };
  return [
    ["con service y con caja, las dos tarjetas, cada una con lo suyo",
      igual(p([caja, service]), { service: { proxKm: 90000, km: 80000 }, caja: { proxKm: 164300, km: 84300 } })],
    ["solo con cajas, la de caja sola", igual(p([caja]), { service: null, caja: { proxKm: 164300, km: 84300 } })],
    ["solo con services, la de siempre", igual(p([service]), { service: { proxKm: 90000, km: 80000 }, caja: null })],
    ["manda el más nuevo de cada tipo (el primero de la lista)",
      igual(p([mecanica, caja, service, cajaVieja, serviceViejo]),
        { service: { proxKm: 90000, km: 80000 }, caja: { proxKm: 164300, km: 84300 } })],
    ["una mecánica sola no da ningún próximo", igual(p([mecanica]), { service: null, caja: null })],
    ["sin trabajos, nada", igual(p([]), { service: null, caja: null })],
  ];
}

titulo("A · Los helpers");
let hayHelpers = true;
for (const [nombre, ok, detalle] of revisarCaja(cargar("lib/renglones.ts"))) {
  check(nombre, ok, detalle);
  if (nombre === "lib/renglones.ts tiene lo del service de caja") hayHelpers = false;
}
if (!fs.existsSync(path.join(RAIZ, "lib/cliente/proximos.ts"))) {
  hayHelpers = false;
  check("lib/cliente/proximos.ts existe", false, "no está: el cliente no tiene su tarjeta de caja en esta rama");
} else {
  for (const [nombre, ok, detalle] of revisarProximos(cargar("lib/cliente/proximos.ts"))) check(nombre, ok, detalle);
}

if (hayHelpers) {
  titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
  const ROTURAS = [
    ["lib/renglones.ts", revisarCaja, "el salto sin piso",
      [["salto >= SALTO_CAJA_MINIMO &&", ""]], "el salto entra de 20.000 a 200.000, con los dos bordes"],
    ["lib/renglones.ts", revisarCaja, "el salto sin techo",
      [["salto <= SALTO_CAJA_MAXIMO", "true"]], "el salto entra de 20.000 a 200.000, con los dos bordes"],
    ["lib/renglones.ts", revisarCaja, "el default bajado a 70.000",
      [["export const SALTO_CAJA_POR_DEFECTO = 80_000;", "export const SALTO_CAJA_POR_DEFECTO = 70_000;"]],
      "los saltos son 60, 70 y 80 mil, y 80.000 viene elegido"],
    ["lib/renglones.ts", revisarCaja, "el ATF normalizado como una viscosidad",
      [['return texto.trim().replace(/\\s+/g, " ");', 'return texto.toUpperCase().replace(/[\\s-]/g, "");']],
      "el ATF se guarda como se escribió, sin espacios de más (no como una viscosidad)"],
    ["lib/renglones.ts", revisarCaja, "el chip que solo se reconoce escrito igual",
      [["ATF_COMUNES.find((a) => a.toLowerCase() === buscado)", "ATF_COMUNES.find((a) => a === normalizarAtf(texto))"]],
      "el chip se reconoce sin importar mayúsculas; lo que no es de la lista, no"],
    ["lib/renglones.ts", revisarCaja, "validarCaja sin mirar el aceite",
      [["if (normalizarAtf(payload.aceiteTipo).length < 2) {", "if (false) {"]],
      "validarCaja: con el aceite de una letra no pasa"],
    ["lib/renglones.ts", revisarCaja, "validarCaja sin mirar el salto",
      [["!esSaltoCajaValido(payload.proxCajaKm - payload.kilometros)", "false"]],
      "validarCaja: con el salto fuera de rango, o sin próximo, no pasa"],
    ["lib/renglones.ts", revisarCaja, "errorDeCaja sin el error del salto",
      [["if (/salto_caja_invalido/.test(mensaje)) return SALTO_CAJA_RANGO_ERROR;", ""]],
      "errorDeCaja traduce los tres errores de la base y deja pasar los demás"],
    ["lib/renglones.ts", revisarCaja, "el lavado con producto en vez de nota",
      [['papel: "Lavado circuito", lleva: "nota"', 'papel: "Lavado circuito", lleva: "producto"']],
      "filtro y aditivo llevan producto; limpieza y lavado, una nota"],
    ["lib/cliente/proximos.ts", revisarProximos, "la tarjeta de caja leída del service",
      [['services.find((s) => s.tipo === "caja")', 'services.find((s) => s.tipo === "service")']],
      "con service y con caja, las dos tarjetas, cada una con lo suyo"],
    ["lib/cliente/proximos.ts", revisarProximos, "el próximo de caja leído del próximo de aceite",
      [["{ proxKm: ultimaCaja.proxCajaKm, km: ultimaCaja.kilometros }", "{ proxKm: ultimaCaja.proxServiceKm ?? 0, km: ultimaCaja.kilometros }"]],
      "solo con cajas, la de caja sola"],
    ["lib/cliente/proximos.ts", revisarProximos, "la tarjeta del service tomando cualquier trabajo",
      [['services.find((s) => s.tipo === "service")', "services[0]"]],
      "manda el más nuevo de cada tipo (el primero de la lista)"],
  ];
  for (const [archivo, revisar, nombre, reemplazos, esperada] of ROTURAS) {
    let rojas;
    try {
      rojas = revisar(cargar(archivo, reemplazos)).filter(([, ok]) => !ok).map(([n]) => n);
    } catch (e) {
      check(`rota: ${nombre}`, false, String(e.message).split("\n")[0]);
      continue;
    }
    check(`rota: ${nombre}`, rojas.includes(esperada),
      rojas.length ? `se pusieron en rojo otras: ${rojas.join(" | ")}` : "SE ESCAPÓ: ninguna comprobación la vio");
  }
}

// ============================================================
// Los datos del demo: preparar y restaurar
// ============================================================

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}
const lista = (ids) => (ids.length ? ids.map((id) => `'${id}'`).join(", ") : "null");

const LUB = sql("select id from lubricentros where slug = 'demo'");
const SUPER = sql("select id from usuarios where rol = 'superadmin' limit 1");
// Todo lo que la prueba crea lleva esta marca, para encontrarlo aunque no
// se haya llegado a anotar su id.
const MARCA_DE_PRUEBA = "Zzcaja";
const PATENTE_SOLA = "AZ142ZZ"; // el auto que solo tiene caja
const tocado = { services: [] };

// Un override del demo, por la puerta real (fijar_override_plan como el
// superadmin): un UPDATE suelto lo rechaza el candado. Conserva las otras
// claves, y no hace nada si la clave ya está como se pide.
const sqlOverride = (clave, prendida) => `
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fijar_override_plan('${LUB}',
    (select ${prendida ? `plan_overrides || '{"${clave}": true}'::jsonb` : `plan_overrides - '${clave}'`} from lubricentros where id = '${LUB}'),
    'regresion-caja.mjs · ${clave} ${prendida ? "prendida" : "apagada"} para la prueba')
  where ${prendida ? "not" : ""} coalesce((select (plan_overrides ->> '${clave}')::boolean from lubricentros where id = '${LUB}'), false);
  commit;`;
const sqlFeature = (prendida) => sqlOverride("caja", prendida);
// El demo no tiene gomería (R15a se apoya en eso). Para ver el selector
// con CUATRO tipos la sección I la prende, y la restauración la apaga.
let gomeriaPrendida = false;

function sqlDeRestauracion() {
  return [
    `delete from contactos where estado = 'caja' and lubricentro_id = '${LUB}';`,
    `delete from services where id in (${lista(tocado.services)});`,
    `delete from services where lubricentro_id = '${LUB}' and tipo = 'caja' and observaciones like '${MARCA_DE_PRUEBA}%';`,
    `delete from services where vehiculo_id in (select id from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada = '${PATENTE_SOLA}');`,
    `delete from landing_busquedas where lubricentro_id = '${LUB}' and patente = '${PATENTE_SOLA}';`,
    `delete from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada = '${PATENTE_SOLA}';`,
    `delete from clientes where lubricentro_id = '${LUB}' and nombre = 'Persona ${MARCA_DE_PRUEBA}';`,
    `delete from productos where lubricentro_id = '${LUB}' and marca = '${MARCA_DE_PRUEBA}';`,
    sqlFeature(false),
    ...(gomeriaPrendida ? [sqlOverride("neumaticos", false)] : []),
  ].join("\n");
}
const anotar = () => fs.writeFileSync(ARCHIVO_RESTAURAR, sqlDeRestauracion());
let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
  if (DEJAR) {
    console.log(`\n  ◦ DEJAR=1: el demo queda con la feature prendida y las cajas cargadas. Para limpiar: psql < ${ARCHIVO_RESTAURAR}, o supabase db reset`);
    return;
  }
  try {
    sql(sqlDeRestauracion());
    fs.rmSync(ARCHIVO_RESTAURAR, { force: true });
    console.log("\n  ◦ datos del demo restaurados");
  } catch (e) {
    console.log(`\n  ✗ NO SE PUDO RESTAURAR el demo: ${String(e.message).split("\n")[0]}`);
    console.log(`    El SQL quedó en ${ARCHIVO_RESTAURAR}; la próxima corrida lo aplica. O: supabase db reset`);
    fallas++;
  }
}
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    restaurar();
    process.exit(1);
  });
}

// Una corrida anterior que murió sin restaurar (o que se dejó a propósito).
if (fs.existsSync(ARCHIVO_RESTAURAR)) {
  sql(fs.readFileSync(ARCHIVO_RESTAURAR, "utf8"));
  fs.rmSync(ARCHIVO_RESTAURAR);
  console.log("\n  ◦ se restauró lo que dejó una corrida anterior");
}
anotar();

// El auto con historia: uno del seed con services y kilómetros.
const AUTO = JSON.parse(sql(`
  select json_build_object('id', v.id, 'patente', v.patente_normalizada, 'km', max(s.kilometros),
                           'prox', (array_agg(s.prox_service_km order by s.fecha desc, s.created_at desc))[1])
  from vehiculos v join services s on s.vehiculo_id = v.id
  where v.lubricentro_id = '${LUB}' and v.patente_normalizada = 'ABC123'
    and s.tipo = 'service' and not s.anulado
  group by v.id;`) || "null");
// Y el que solo va a tener una caja.
const CLIENTE_SOLO = sql(`insert into clientes (lubricentro_id, nombre, telefono)
  values ('${LUB}', 'Persona ${MARCA_DE_PRUEBA}', '351 555 0142') returning id;`);
sql(`insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo)
  values ('${LUB}', '${CLIENTE_SOLO}', 'AZ 142 ZZ', 'Honda', 'Fit');`);
// Un aceite de caja en el catálogo, a granel y con stock, para elegirlo.
const ATF = sql(`insert into productos (lubricentro_id, categoria, nombre, marca, unidad, stock)
  values ('${LUB}', 'transmision', 'ATF Dexron VI', '${MARCA_DE_PRUEBA}', 'litro', 40) returning id;`);
anotar();

const KM = (AUTO?.km ?? 98450) + 550; // los kilómetros de la caja del auto con historia
const fmt = (n) => n.toLocaleString("es-AR");

// La API directa, con el token del owner del demo: lo que haría alguien
// que arma el payload a mano.
const ENV = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
async function rpcComoOwner(funcion, cuerpo) {
  const login = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: "demo@fidellimotors.app", password: "demo1234" }),
  }).then((r) => r.json());
  const r = await fetch(`${SUPA}/rest/v1/rpc/${funcion}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${login.access_token}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
}
const cajaPorApi = (vehiculo) => ({
  p_vehiculo_id: vehiculo,
  p_sucursal_id: sql(`select id from sucursales where lubricentro_id = '${LUB}' and activa order by created_at limit 1`),
  p_fecha: sql("select current_date"),
  p_kilometros: 50000,
  p_aceite_tipo: "Dexron VI",
  p_prox_service_km: null,
  p_tipo: "caja",
  p_prox_caja_km: 130000,
  p_observaciones: `${MARCA_DE_PRUEBA} por la API`,
});

// ============================================================
// B a I · Las pantallas
// ============================================================

// --lang: el <input type="date"> se dibuja con el idioma del NAVEGADOR.
const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

try {
  if (!AUTO) throw new Error("el seed no tiene el ABC 123 con services: supabase db reset");

  async function entrar(email) {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', "demo1234");
    await p.click('button[type="submit"]');
    await p.waitForURL(/\/(panel|fidelli)/, { timeout: 30_000 });
    const estado = await ctx.storageState();
    await ctx.close();
    return estado;
  }
  const sesion = await entrar("demo@fidellimotors.app");
  const sesionFidelli = await entrar("santi@fidellimotors.app");

  async function abrir(vista, estado = sesion) {
    const tactil = vista.width < 768;
    const ctx = await navegador.newContext({
      viewport: vista,
      deviceScaleFactor: 2,
      locale: "es-AR",
      hasTouch: tactil,
      isMobile: tactil,
      storageState: estado,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const tocar = (locator) => (tactil ? locator.tap() : locator.click());
    return { ctx, page, tocar };
  }

  // La ventana se estira al alto del documento: con fullPage (o con el
  // scroll de una captura de elemento) las barras fijas quedan estampadas
  // encima. `de` recorta a un elemento; sin él, la página entera.
  async function capturar(page, nombre, de = null) {
    if (!DIR_CAPTURAS) return;
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    // Sin el foco puesto en ningún campo: el anillo de foco no es parte de
    // lo que se quiere mostrar.
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const vista = page.viewportSize();
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vista.width, height: alto });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const destino = path.join(DIR_CAPTURAS, `${nombre}.png`);
    if (de) await de.screenshot({ path: destino });
    else await page.screenshot({ path: destino });
    await page.setViewportSize(vista);
    console.log(`  ◦ captura ${nombre}.png`);
  }

  async function irAlCarton(page, patente) {
    await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
    await page.fill("#patente", patente);
    await page.click('a[href^="/panel/services/nuevo/"]', { timeout: 20_000 });
    await page.waitForSelector("#fecha", { timeout: 20_000 });
  }
  const botonTipo = (page, nombre) => page.getByRole("button", { name: nombre, exact: true });
  const renglon = (page, nombre) => page.locator("[data-renglones-caja]").getByRole("switch", { name: nombre });

  // ------------------------------------------------------------
  titulo("B · Sin la feature, la caja no existe");
  await paso("sin la feature", async () => {
    const { ctx, page } = await abrir({ width: 390, height: 844 });
    await irAlCarton(page, "ABC 123");
    check("el cartón no ofrece el segmento «Caja»", (await botonTipo(page, "Caja").count()) === 0);
    await page.goto(`${BASE}/panel/proximos`, { waitUntil: "networkidle" });
    check("«A quién llamar» no ofrece la fuente Caja", (await page.locator('a[href*="fuente=caja"]').count()) === 0);
    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    check("el Inicio no tiene la tarjeta de cajas", (await page.getByText("Services de caja del mes").count()) === 0);
    // Y el Excel de un lubricentro sin cajas no gana una columna vacía.
    const excel = await page.request.get(`${BASE}/panel/services/exportar`);
    const cabecera = excel.ok() ? (hojasDelXlsx(Buffer.from(await excel.body()))[0]?.[0] ?? []) : [];
    check("la exportación no trae la columna «Próx. caja»",
      cabecera.includes("Próximo service (km)") && !cabecera.includes("Próx. caja"), JSON.stringify(cabecera));
    await ctx.close();

    const r = await rpcComoOwner("guardar_service", cajaPorApi(AUTO.id));
    check("la RPC rechaza una caja armada a mano (42501)", r.status === 403 && r.cuerpo?.code === "42501",
      `status ${r.status}, ${JSON.stringify(r.cuerpo)?.slice(0, 160)}`);
    check("y no quedó nada guardado",
      sql(`select count(*) from services where lubricentro_id = '${LUB}' and tipo = 'caja'`) === "0");
  });

  // ------------------------------------------------------------
  titulo("C · La feature se prende desde la ficha de /fidelli");
  await paso("prender la feature", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 }, sesionFidelli);
    await page.goto(`${BASE}/fidelli/${LUB}?tab=suscripcion`, { waitUntil: "networkidle" });
    const fila = page.locator("tr", { has: page.locator("#ov-caja") });
    check("la ficha lista la feature como «Service de caja automática»",
      (await fila.count()) === 1 && /Service de caja automática/.test(await fila.innerText()),
      (await fila.count()) ? await fila.innerText() : "no hay fila con #ov-caja");
    check("y el plan no la trae (plan: no)", /plan: no/.test((await fila.innerText().catch(() => ""))));
    await page.selectOption("#ov-caja", "si");
    check("no pide precio ni motivo con formato: no es un módulo pago",
      (await page.getByText(/tiene que empezar con la forma de cobro/).count()) === 0);
    // Único por corrida: el historial de overrides no se borra (es
    // auditoría), y con un texto fijo la espera de más abajo se daba por
    // cumplida con la fila que dejó la corrida ANTERIOR, antes de que
    // esta terminara de guardar.
    const motivo = `Taller de cajas automáticas: se le prende el service de caja (regresión ${Date.now()}).`;
    await page.fill("#ov-motivo", motivo);
    await page.getByRole("button", { name: "Guardar overrides" }).click();
    // LA SEÑAL DE QUE TERMINÓ ES LA BASE, no un texto de la pantalla. El
    // motivo «está» en la página apenas se escribe —React copia el valor
    // de un <textarea> controlado a su contenido—, así que esperarlo daba
    // la espera por cumplida ANTES de guardar, y con la máquina cargada la
    // comprobación de abajo llegaba primero que el guardado.
    const enLaBase = () => sql(`select plan_overrides ->> 'caja' from lubricentros where id = '${LUB}'`) === "true";
    for (let i = 0; i < 60 && !enLaBase(); i++) await page.waitForTimeout(500);
    check("el override quedó en la base, por la puerta real", enLaBase());
    // Y el formulario se monta de cero con lo guardado (lleva `key`): el
    // motivo ya no está en el campo y sí en el historial de la ficha.
    await page.waitForFunction((texto) => {
      const campo = document.querySelector("#ov-motivo");
      return campo && campo.value === "" && document.body.innerText.includes(texto);
    }, motivo, { timeout: 30_000 }).catch(() => {});
    check("la ficha queda con el override elegido y el motivo en su historial",
      (await page.inputValue("#ov-caja")) === "si" && (await page.inputValue("#ov-motivo")) === "" &&
        (await page.locator("body").innerText()).includes(motivo));
    check("y no generó un evento de módulo ni cambió el MRR (no tiene precio)",
      sql(`select count(*) from tenant_eventos where lubricentro_id = '${LUB}' and tipo::text like 'modulo%' and antes ->> 'modulo' = 'caja'`) === "0");
    await ctx.close();
  });
  if (sql(`select coalesce(plan_overrides ->> 'caja', 'false') from lubricentros where id = '${LUB}'`) !== "true") {
    // Sin la pantalla de /fidelli la prueba sigue igual: se prende por SQL.
    sql(sqlFeature(true));
    console.log("  ◦ la feature se prendió por SQL para poder seguir");
  }

  // ------------------------------------------------------------
  titulo("D · La carga, en 390 táctil");
  let cajaId = null;
  await paso("la carga", async () => {
    const { ctx, page, tocar } = await abrir({ width: 390, height: 844 });
    await irAlCarton(page, "ABC 123");

    const nombres = ["Service", "Mecánica", "Caja"];
    for (const n of nombres) {
      check(`el selector ofrece «${n}»`, (await botonTipo(page, n).count()) === 1);
    }
    await tocar(botonTipo(page, "Caja"));
    check("al elegir Caja aparece el bloque «Aceite de caja»",
      (await page.locator("[data-bloque-aceite-caja]").getByText("Aceite de caja", { exact: true }).count()) === 1);
    check("y desaparece el de aceite de motor", (await page.locator("[data-bloque-aceite]").count()) === 0);
    check("ningún chip de ATF viene marcado",
      (await page.locator('[data-bloque-aceite-caja] button[aria-pressed="true"]').count()) === 0);
    const chips = await page.locator("[data-bloque-aceite-caja] [role=group] button").allInnerTexts();
    check("los chips son los siete ATF y «Otro»",
      igual(chips, ["Dexron III", "Dexron VI", "Mercon V", "ATF+4", "Multi ATF", "CVT", "DCT", "Otro"]), chips.join(" · "));
    check("los litros vienen vacíos (sin litros sugeridos)", (await page.inputValue("#atf-litros")) === "");
    check("80.000 viene elegido",
      (await page.locator('[data-proximo-caja] button[aria-pressed="true"]').innerText()) === "80.000");

    const revisar = page.getByRole("button", { name: "Revisar y confirmar" });
    check("sin kilómetros no se puede revisar", await revisar.isDisabled());
    check("y dice qué falta", (await page.getByText("Faltan los kilómetros.").count()) === 1);
    await page.fill("#km", String(KM));
    check("con kilómetros, falta el aceite", (await page.getByText("Falta el tipo de aceite de caja.").count()) === 1);

    await tocar(page.locator("[data-bloque-aceite-caja]").getByRole("button", { name: "Dexron VI", exact: true }));
    check("con el aceite elegido ya se puede revisar", await revisar.isEnabled());
    check(`el próximo dice ${fmt(KM + 80000)} km`,
      /Próximo service de caja:/.test(await page.locator("[data-proximo-caja]").innerText()) &&
        (await page.locator("[data-proximo-caja]").innerText()).includes(`${fmt(KM + 80000)} km`));

    // El producto, del catálogo de aceites de caja; y los litros.
    await page.fill("#atf-producto", "dexron");
    check("el buscador ofrece el ATF del catálogo y ningún aceite de motor",
      (await page.locator(`#atf-producto-lista [data-producto="${ATF}"]`).count()) === 1 &&
        (await page.locator("#atf-producto-lista [data-producto]").count()) === 1);
    await tocar(page.locator(`#atf-producto-lista [data-producto="${ATF}"]`));
    await page.fill("#atf-litros", "6,5");

    // Filtro y lavado: prendido = hecho, sin el segundo interruptor.
    await tocar(renglon(page, "Filtro de caja"));
    check("un renglón prendido NO ofrece «¿se cambió?»",
      (await page.locator("[data-renglones-caja]").getByText(/se cambió/i).count()) === 0);
    await tocar(page.locator("[data-renglones-caja]").getByRole("button", { name: "+ producto" }).first());
    await page.getByLabel("Producto de Filtro de caja").fill("Filtro Wega WFC 930");
    await page.keyboard.press("Escape");
    await tocar(renglon(page, "Lavado del circuito (máquina)"));
    await tocar(page.locator("[data-renglones-caja]").getByRole("button", { name: "+ nota" }));
    await page.getByLabel("Nota de Lavado del circuito (máquina)").fill("Con máquina, 12 litros");
    check("quedan dos renglones prendidos",
      (await page.locator('[data-renglones-caja] [role=switch][aria-checked="true"]').count()) === 2);
    await capturar(page, "carga-390");

    // «Otro» en el salto: el rango, y vuelta a 80.000.
    await tocar(page.locator("[data-proximo-caja]").getByRole("button", { name: "Otro" }));
    await page.fill("#otro-salto-caja", "10000");
    check("un salto de 10.000 se avisa y no deja revisar",
      (await page.locator("[data-proximo-caja]").getByText("Entre 20.000 y 200.000 km.").count()) === 1 &&
        (await revisar.isDisabled()));
    await tocar(page.locator("[data-proximo-caja]").getByRole("button", { name: "80.000" }));

    await page.getByRole("button", { name: /Observaciones/ }).click();
    await page.fill("#obs", `${MARCA_DE_PRUEBA} cargada desde el celular`);

    await tocar(revisar);
    await page.getByRole("heading", { name: "Revisá el service de caja" }).waitFor();
    const papel = page.locator('[data-papel="caja"]');
    const textoPapel = (await papel.innerText()).replace(/\s+/g, " ");
    check("la previsualización es el papel de la caja", (await papel.count()) === 1, textoPapel);
    check("con la bajada SERVICE DE CAJA", /service de caja/i.test(textoPapel));
    check("el aceite de caja y su marca", /Aceite de caja\s*Dexron VI/i.test(textoPapel) && textoPapel.includes(`ATF Dexron VI · ${MARCA_DE_PRUEBA}`), textoPapel);
    check("los cuatro renglones bajo CAJA, con dos tildes", /CAJA/.test(textoPapel) && (textoPapel.match(/✓/g) ?? []).length === 2, textoPapel);
    check("el detalle de los dos hechos", textoPapel.includes("Filtro Wega WFC 930") && textoPapel.includes("Con máquina, 12 litros"));
    check("y PRÓX. SERVICE CAJA al pie", new RegExp(`Próx\\. service caja\\s*${fmt(KM + 80000).replace(".", "\\.")} km`, "i").test(textoPapel), textoPapel);
    check("el papel no dice «Prox. serv. kmts.» ni explica el OK", !/Prox\. serv\. kmts/i.test(textoPapel) && (await page.getByText("se revisó y estaba bien").count()) === 0);
    check("el plazo que avisa es de 24 horas", (await page.getByText("Editable por 24 horas").count()) === 1);
    await capturar(page, "previsualizacion-390");

    await tocar(page.getByRole("button", { name: "Confirmar service de caja" }));
    await page.waitForURL("**/guardado", { timeout: 30_000 });
    cajaId = page.url().match(/services\/([0-9a-f-]{36})\/guardado/)?.[1] ?? null;
    if (cajaId) {
      tocado.services.push(cajaId);
      anotar();
    }
    check("el guardado dice «Service de caja guardado»", (await page.getByText("Service de caja guardado").count()) === 1);
    check("y cuándo le toca volver", (await page.getByText(`próximo service de caja a los ${fmt(KM + 80000)} km`).count()) === 1);
    await ctx.close();

    // Lo que quedó en la base.
    const fila = JSON.parse(sql(`select row_to_json(x) from (
      select s.tipo, s.kilometros, s.aceite_tipo, s.aceite_producto_id, s.aceite_litros, s.prox_caja_km, s.prox_service_km,
             (select json_agg(json_build_object('t', i.item_tipo, 'c', i.cambiado, 'd', i.detalle) order by i.item_tipo)
              from service_items i where i.service_id = s.id) as items
      from services s where s.id = '${cajaId}') x`) || "null");
    check("en la base es una caja, con su próximo en prox_caja_km y sin próximo de aceite",
      fila?.tipo === "caja" && fila.kilometros === KM && fila.aceite_tipo === "Dexron VI" &&
        fila.prox_caja_km === KM + 80000 && fila.prox_service_km === null, JSON.stringify(fila));
    check("con el producto y los litros", fila?.aceite_producto_id === ATF && Number(fila?.aceite_litros) === 6.5);
    check("y los dos renglones, hechos",
      igual((fila?.items ?? []).map((i) => [i.t, i.c]), [["caja_filtro", true], ["caja_lavado", true]]), JSON.stringify(fila?.items));
    check("el stock del ATF bajó los 6,5 litros", sql(`select stock from productos where id = '${ATF}'`) === "33.50");
  });

  // ------------------------------------------------------------
  titulo("E · El detalle y la edición dentro de las 24 horas");
  await paso("el detalle y la edición", async () => {
    if (!cajaId) throw new Error("la caja no se cargó");
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await page.goto(`${BASE}/panel/services/${cajaId}`, { waitUntil: "networkidle" });
    const papel = page.locator('[data-papel="caja"]');
    const texto = (await papel.innerText().catch(() => "")).replace(/\s+/g, " ");
    check("el detalle muestra el papel de la caja", (await papel.count()) === 1);
    check("con PRÓX. SERVICE CAJA", /Próx\. service caja/i.test(texto) && texto.includes(`${fmt(KM + 80000)} km`), texto);
    check("y el sello del tipo dice Caja", (await page.locator("h1").innerText()).toUpperCase().includes("CAJA"));
    check("es editable", (await page.getByRole("link", { name: "Editar" }).count()) === 1);

    await page.getByRole("link", { name: "Editar" }).click();
    await page.waitForSelector("#fecha");
    check("la edición no deja cambiar el tipo", (await botonTipo(page, "Service").count()) === 0 &&
      (await page.getByText("Service de caja — el tipo no se cambia al editar.").count()) === 1);
    check("abre con el ATF guardado marcado",
      (await page.locator('[data-bloque-aceite-caja] [role=group] button[aria-pressed="true"]').innerText()) === "Dexron VI");
    check("con 80.000 elegido y los dos renglones prendidos",
      (await page.locator('[data-proximo-caja] button[aria-pressed="true"]').innerText()) === "80.000" &&
        (await page.locator('[data-renglones-caja] [role=switch][aria-checked="true"]').count()) === 2);
    check("y los litros que se guardaron", (await page.inputValue("#atf-litros")).replace(",", ".") === "6.5");
    await page.locator("[data-bloque-aceite-caja]").getByRole("button", { name: "Mercon V", exact: true }).click();
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.waitForURL(new RegExp(`/panel/services/${cajaId}$`), { timeout: 30_000 });
    await page.locator('[data-papel="caja"]').waitFor();
    check("editar dentro de las 24 horas cambia el ATF",
      sql(`select aceite_tipo from services where id = '${cajaId}'`) === "Mercon V" &&
        (await page.locator('[data-papel="caja"]').innerText()).includes("Mercon V"));
    check("y no vuelve a tocar el stock", sql(`select stock from productos where id = '${ATF}'`) === "33.50");
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("F · La página del cliente");
  let cajaSolaId = null;
  await paso("la caja sola, cargada a 1280 con «Otro»", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await irAlCarton(page, "AZ 142 ZZ");
    await botonTipo(page, "Caja").click();
    await page.fill("#km", "61000");
    await page.locator("[data-atf-otro]").click();
    await page.fill("#atf-otro", "Toyota WS");
    await page.locator("[data-proximo-caja]").getByRole("button", { name: "Otro" }).click();
    await page.fill("#otro-salto-caja", "100000");
    await renglon(page, "Aditivo").click();
    await renglon(page, "Limpieza de cárter e imanes").click();
    check("a 1280, el próximo con «Otro» dice 161.000 km",
      (await page.locator("[data-proximo-caja]").innerText()).includes("161.000 km"));
    await page.getByRole("button", { name: /Observaciones/ }).click();
    await page.fill("#obs", `${MARCA_DE_PRUEBA} a 1280`);
    await capturar(page, "carga-1280");
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await page.getByRole("button", { name: "Confirmar service de caja" }).click();
    await page.waitForURL("**/guardado", { timeout: 30_000 });
    cajaSolaId = page.url().match(/services\/([0-9a-f-]{36})\/guardado/)?.[1] ?? null;
    if (cajaSolaId) {
      tocado.services.push(cajaSolaId);
      anotar();
    }
    check("un aceite que no es de la lista se guarda como se escribió",
      sql(`select aceite_tipo || '|' || prox_caja_km from services where id = '${cajaSolaId}'`) === "Toyota WS|161000");
    // La edición lo reabre con «Otro» en los dos.
    await page.goto(`${BASE}/panel/services/${cajaSolaId}/editar`, { waitUntil: "networkidle" });
    check("y al editar reabre con «Otro» en el aceite y en el salto",
      (await page.inputValue("#atf-otro")) === "Toyota WS" &&
        (await page.inputValue("#otro-salto-caja")).replace(/\D/g, "") === "100000");
    await ctx.close();
  });
  await paso("el cliente", async () => {
    const { ctx, page } = await abrir({ width: 390, height: 844 }, undefined);
    await page.goto(`${BASE}/demo/ABC123`, { waitUntil: "networkidle" });
    const tarjetas = await page.locator("section", { has: page.locator("h2", { hasText: /^Tu próximo service/ }) }).allInnerTexts();
    const limpio = tarjetas.map((t) => t.replace(/\s+/g, " "));
    check("el auto con service y caja ve DOS tarjetas", limpio.length === 2, limpio.join(" || "));
    check("la primera es la del service, con su próximo de siempre",
      /^Tu próximo service /i.test(limpio[0] ?? "") && (limpio[0] ?? "").includes(`${fmt(AUTO.prox)} km`), limpio[0]);
    check("la segunda es la de caja, con su próximo y el último km de caja",
      /^Tu próximo service de caja/i.test(limpio[1] ?? "") && (limpio[1] ?? "").includes(`${fmt(KM + 80000)} km`) &&
        (limpio[1] ?? "").includes(`Hiciste el service de caja a los ${fmt(KM)} km`), limpio[1]);
    // El cartón destacado sigue siendo el del cambio de aceite: su pie
    // aparece antes que el de cualquier papel de caja del historial.
    const todo = await page.locator("main").innerText();
    const pieAceite = todo.search(/Prox\. serv\. kmts/i);
    const pieCaja = todo.search(/Próx\. service caja/i);
    check("el cartón destacado sigue siendo el del cambio de aceite",
      pieAceite >= 0 && (pieCaja < 0 || pieAceite < pieCaja), `aceite en ${pieAceite}, caja en ${pieCaja}`);
    check("y la caja está en el historial, con su sello",
      (await page.getByText("Caja", { exact: true }).count()) >= 1 || /\bCAJA\b/.test(todo));
    check("sin scroll horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await capturar(page, "cliente-dos-tarjetas-390", page.locator("main"));

    await page.goto(`${BASE}/demo/${PATENTE_SOLA}`, { waitUntil: "networkidle" });
    const solas = await page.locator("section", { has: page.locator("h2", { hasText: /^Tu próximo service/ }) }).allInnerTexts();
    check("el auto que solo tiene caja ve UNA tarjeta, la de caja",
      solas.length === 1 && /Tu próximo service de caja/i.test(solas[0]) && solas[0].includes("161.000 km"), solas.join(" || "));
    const papel = page.locator('[data-papel="caja"]').first();
    const texto = (await papel.innerText().catch(() => "")).replace(/\s+/g, " ");
    check("y su cartón destacado es el papel de la caja", (await papel.count()) >= 1 && /service de caja/i.test(texto), texto);
    check("con el aceite, los renglones hechos y el próximo de caja",
      texto.includes("Toyota WS") && (texto.match(/✓/g) ?? []).length === 2 && /Próx\. service caja\s*161\.000 km/i.test(texto), texto);
    check("y nada del cartón de aceite", !/Prox\. serv\. kmts/i.test(await page.locator("main").innerText()));
    check("sin scroll horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await capturar(page, "cliente-papel-390", page.locator("main"));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("G · «A quién llamar», con la fuente Caja");
  await paso("a quién llamar", async () => {
    if (!cajaId) throw new Error("la caja no se cargó");
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await page.goto(`${BASE}/panel/proximos?fuente=caja`, { waitUntil: "networkidle" });
    check("la fuente Caja está en el filtro", (await page.locator('a[href*="fuente=caja"]').count()) === 1);
    check("con el próximo a 80.000 km, el auto todavía no está en la lista",
      (await page.locator("li", { hasText: "ABC 123" }).count()) === 0);

    // El próximo vence: se acerca a 100 km del odómetro, como postgres.
    const antes = sql(`select contactado::text || '|' || estado from vista_proximos_service where vehiculo_id = '${AUTO.id}'`);
    sql(`update services set prox_caja_km = kilometros + 100 where id = '${cajaId}';`);
    await page.reload({ waitUntil: "networkidle" });
    const fila = page.locator("li", { hasText: "ABC 123" });
    const texto = (await fila.innerText().catch(() => "")).replace(/\s+/g, " ");
    check("cuando su próximo vence, la fuente Caja lista el auto", (await fila.count()) === 1, texto);
    check("la fila dice «Último service de caja» y su próximo",
      /Último service de caja/i.test(texto) && texto.includes(fmt(KM + 100)), texto);
    check("y no habla del próximo de aceite", !texto.includes(fmt(AUTO.prox)), texto);
    const wa = await fila.locator('a[href^="https://wa.me/"]').first().getAttribute("href").catch(() => null);
    check("el WhatsApp lleva el mensaje de caja, con el próximo de caja",
      Boolean(wa) && decodeURIComponent(wa).includes("service de caja") && decodeURIComponent(wa).includes(fmt(KM + 100)),
      wa ? decodeURIComponent(wa).slice(0, 200) : "sin enlace de WhatsApp");
    await capturar(page, "a-quien-llamar-caja-1280");
    // A 1440 la fila entra entera en su tarjeta; a 1280 el botón de
    // WhatsApp queda sobre el borde, igual que en las otras tres fuentes
    // (es de la grilla de la fila, anterior a la caja).
    await page.setViewportSize({ width: 1440, height: 800 });
    await capturar(page, "a-quien-llamar-caja-1440");
    await page.setViewportSize({ width: 1280, height: 800 });

    // El contacto, a mano (el tilde): se registra con el motivo `caja`.
    await fila.getByRole("checkbox").first().click();
    await page.waitForTimeout(1500);
    check("el contacto se registra con el motivo «caja»",
      sql(`select count(*) from contactos where vehiculo_id = '${AUTO.id}' and estado = 'caja'`) === "1");
    check("y no tilda el aviso del cambio de aceite del mismo auto",
      sql(`select contactado::text || '|' || estado from vista_proximos_service where vehiculo_id = '${AUTO.id}'`) === antes, antes);
    await page.reload({ waitUntil: "networkidle" });
    check("la fila de caja queda tildada como contactada",
      await page.locator("li", { hasText: "ABC 123" }).getByRole("checkbox").first().isChecked());
    // Destildar borra el contacto de ESE motivo, posterior a la última caja.
    await page.locator("li", { hasText: "ABC 123" }).getByRole("checkbox").first().click();
    await page.waitForTimeout(1500);
    check("y destildarla borra el contacto por caja",
      sql(`select count(*) from contactos where vehiculo_id = '${AUTO.id}' and estado = 'caja'`) === "0");
    await page.goto(`${BASE}/panel/proximos`, { waitUntil: "networkidle" });
    check("en «Todo» conviven las fuentes, y la de caja sigue ahí",
      (await page.locator("li", { hasText: "ABC 123" }).filter({ hasText: /Último service de caja/i }).count()) === 1);
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("H · El Inicio, el listado y la exportación");
  await paso("inicio, listado y exportación", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    const tarjeta = page.locator("*", { hasText: /^Services de caja del mes/ }).last();
    check("el Inicio tiene la tarjeta «Services de caja del mes»",
      (await page.getByText("Services de caja del mes").count()) >= 1);
    const numero = (await page.getByText("Services de caja del mes").first().locator("xpath=..").innerText()).replace(/\s+/g, " ");
    check("y cuenta las dos cajas del mes", /\b2\b/.test(numero), numero);
    void tarjeta;

    await page.goto(`${BASE}/panel/services?tipo=caja`, { waitUntil: "networkidle" });
    const filas = page.locator("main li, main tr").filter({ hasText: "ABC 123" });
    check("el listado filtra por Caja y trae la del ABC 123", (await filas.count()) >= 1);
    check("con el sello CAJA", /caja/i.test((await filas.first().innerText().catch(() => ""))));
    check("el filtro de tipo ofrece «Caja»", (await page.locator('option[value="caja"]').count()) === 1);

    const r = await page.request.get(`${BASE}/panel/services/exportar?tipo=caja`);
    check("la exportación responde", r.ok(), `status ${r.status()}`);
    // Y se lee el archivo: el tipo, el aceite en la columna del aceite y
    // el próximo de caja en SU columna, con la del cambio de aceite vacía.
    const [trabajos, productos] = hojasDelXlsx(Buffer.from(await r.body()));
    const cabecera = trabajos?.[0] ?? [];
    const col = (nombre) => cabecera.indexOf(nombre);
    check("la hoja de trabajos tiene la columna «Próx. caja», al lado de la del próximo service",
      col("Próx. caja") > 0 && col("Próx. caja") === col("Próximo service (km)") + 1, JSON.stringify(cabecera));
    const filaAbc = (trabajos ?? []).find((f) => f.includes("ABC 123") || f.includes("ABC123"));
    check("la caja del ABC 123 sale con el tipo «Caja»", Boolean(filaAbc) && filaAbc.includes("Caja"), JSON.stringify(filaAbc));
    check("con su próximo en «Próx. caja» y la del próximo service vacía",
      Boolean(filaAbc) && filaAbc[col("Próx. caja")] === String(KM + 100) && !filaAbc[col("Próximo service (km)")],
      JSON.stringify(filaAbc));
    check("y el aceite de caja en las columnas del aceite (el ATF editado y su producto)",
      Boolean(filaAbc) && filaAbc[col("Viscosidad")] === "Mercon V" && (filaAbc[col("Aceite")] ?? "").includes("ATF Dexron VI")
        && filaAbc[col("Litros de aceite")] === "6.5",
      JSON.stringify(filaAbc));
    check("los renglones de la caja van por su nombre y sin «(cambiado)»",
      Boolean(filaAbc) && filaAbc.some((c) => /Filtro de caja/.test(c) && /Lavado del circuito/.test(c) && !/\((cambiado|OK)\)/.test(c)),
      JSON.stringify(filaAbc));
    check("la hoja de productos anota el ATF como «Aceite de caja», no como aceite de motor",
      (productos ?? []).some((f) => f.includes("Aceite de caja") && f.includes("ATF Dexron VI"))
        && !(productos ?? []).some((f) => f.includes("Aceite de motor")),
      JSON.stringify((productos ?? []).slice(0, 4)));
    // La columna es del taller que hace cajas: con la feature está siempre
    // —aunque el archivo no traiga ninguna—, y si la feature se apaga, las
    // cajas ya cargadas la conservan (los datos son suyos).
    const cabeceraDe = async (query) => {
      const resp = await page.request.get(`${BASE}/panel/services/exportar${query}`);
      return resp.ok() ? (hojasDelXlsx(Buffer.from(await resp.body()))[0]?.[0] ?? []) : [`status ${resp.status()}`];
    };
    const soloServices = await cabeceraDe("?tipo=service");
    check("con la feature, la columna está aunque el archivo no traiga cajas",
      soloServices.includes("Próx. caja"), JSON.stringify(soloServices));
    sql(sqlOverride("caja", false));
    const apagada = await cabeceraDe("?tipo=caja");
    const apagadaSinCajas = await cabeceraDe("?tipo=service");
    sql(sqlOverride("caja", true));
    check("con la feature apagada, un archivo con cajas conserva la columna",
      apagada.includes("Próx. caja"), JSON.stringify(apagada));
    check("y uno sin cajas no la trae",
      apagadaSinCajas.includes("Próximo service (km)") && !apagadaSinCajas.includes("Próx. caja"), JSON.stringify(apagadaSinCajas));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("I · Todos los dispositivos");
  // Con gomería prendida el demo tiene los CUATRO tipos: es el caso que
  // pide el 2 × 2.
  gomeriaPrendida = true;
  anotar();
  sql(sqlOverride("neumaticos", true));
  for (const vista of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1280, height: 800 },
  ]) {
    await paso(`${vista.width} px`, async () => {
      const { ctx, page, tocar } = await abrir(vista);
      await irAlCarton(page, "ABC 123");
      const botones = page.locator("fieldset button");
      const cajas = await botones.evaluateAll((bs) => bs.map((b) => {
        const r = b.getBoundingClientRect();
        return { texto: b.textContent, x: Math.round(r.left), y: Math.round(r.top), alto: r.height, entra: b.scrollWidth <= b.clientWidth };
      }));
      const filas = new Set(cajas.map((c) => c.y)).size;
      const columnas = new Set(cajas.map((c) => c.x)).size;
      check(`${vista.width}: el selector tiene los cuatro tipos, en 2 × 2`,
        igual(cajas.map((c) => c.texto), ["Service", "Mecánica", "Neumáticos", "Caja"]) && filas === 2 && columnas === 2,
        JSON.stringify(cajas.map((c) => [c.texto, c.x, c.y])));
      check(`${vista.width}: cada nombre entra entero y mide 44 px o más`,
        cajas.every((c) => c.entra && c.alto >= 44), JSON.stringify(cajas));
      await tocar(botonTipo(page, "Caja"));
      await page.fill("#km", String(KM + 10));
      const atf = await page.locator("[data-bloque-aceite-caja] [role=group] button").evaluateAll((bs) => bs.map((b) => {
        const r = b.getBoundingClientRect();
        return { alto: r.height, derecha: r.right, entra: b.scrollWidth <= b.clientWidth };
      }));
      const ancho = await page.evaluate(() => document.documentElement.clientWidth);
      check(`${vista.width}: los chips de ATF miden 44 px, envuelven y ninguno se corta`,
        atf.length === 8 && atf.every((c) => c.alto >= 44 && c.entra && c.derecha <= ancho), JSON.stringify(atf));
      const saltos = await page.locator("[data-proximo-caja] button").evaluateAll((bs) => bs.map((b) => {
        const r = b.getBoundingClientRect();
        return { y: Math.round(r.top), alto: r.height, entra: b.scrollWidth <= b.clientWidth, texto: b.textContent };
      }));
      check(`${vista.width}: los cuatro saltos van en una fila, enteros y de 44 px`,
        saltos.length === 4 && new Set(saltos.map((s) => s.y)).size === 1 && saltos.every((s) => s.entra && s.alto >= 44),
        JSON.stringify(saltos));
      check(`${vista.width}: sin scroll horizontal`,
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      if (vista.width === 360) await capturar(page, "carga-cuatro-tipos-360");
      await ctx.close();
    });
  }
} catch (e) {
  check("la corrida", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close();
  restaurar();
}

console.log(fallas === 0 ? "\nTODO EN VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);
