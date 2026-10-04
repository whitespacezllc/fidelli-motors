// Los datos de la empresa en el presupuesto —razón social, CUIT, condición
// frente al IVA, domicilio, teléfono y email del que lo emite—, de punta a
// punta, contra el stack local (regla 13: una prueba que nunca se vio en
// rojo no existe — esta se vio en rojo sobre el front sin la tarjeta, y
// cada regla de los helpers se rompe sola acá abajo).
//
// Lo que cubre:
//   A · Los helpers, sin navegador: lib/datos-empresa.ts (las líneas del
//       encabezado, la máscara del CUIT). Y LAS ROTURAS: cada regla se
//       rompe sobre una copia, se recompila y su comprobación tiene que
//       fallar.
//   B · EL ENCABEZADO DE HOY. Con el lubricentro sin ningún dato cargado, el
//       presupuesto tiene que salir IDÉNTICO al de antes de este cambio: el
//       contenido del PDF (el stream de la página, byte a byte) y el HTML de
//       la cabecera del documento se comparan contra
//       scripts/fixtures-presupuesto-sin-datos-empresa.json, que se generó
//       con el front de develop ANTES de tocar una línea (GUARDAR_BASE=1).
//   C · La API directa: `anon` no lee la tabla ni ejecuta la puerta, y un
//       CUIT a medias se rechaza.
//   D · Mi cuenta → «Datos de tu empresa», en 390 táctil: la tarjeta, su
//       línea de ayuda, la máscara del CUIT mientras se escribe, el CUIT a
//       medias rechazado con el MISMO mensaje que en clientes, el aviso del
//       dígito verificador (que no bloquea), guardar los datos de prueba y
//       verlos al volver; y lo que quedó en la base (normalizado, a nombre
//       de quien guardó).
//   E · El presupuesto con los datos: las cinco líneas en el documento y en
//       el PDF (TEXTO EXTRAÍDO del PDF, no una captura), en su orden, antes
//       de la sucursal y empujando la grilla hacia abajo; la razón social
//       igual al nombre no se repite; con un solo dato sale una sola línea;
//       un domicilio larguísimo envuelve y no pisa el bloque «PRESUPUESTO
//       N°»; y nada que lo acerque a una factura.
//   F · Vaciar los datos desde Mi cuenta: el encabezado vuelve al de hoy
//       (otra vez contra la base, PDF y HTML).
//   G · La ficha de /fidelli → Datos → Empresa: el mismo formulario, la
//       misma puerta, a nombre de Fidelli; y se ve en el panel del tenant.
//   H · Un plan sin Presupuestos no ve la tarjeta.
//   I · Todos los dispositivos (360, 390, 820, 1280): sin scroll horizontal
//       y con todo lo que se toca de 44 px.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-datos-empresa.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-datos-empresa.mjs
//     (además deja las capturas y el PDF en docs/capturas/datos-empresa/)
//   BASE_URL=http://localhost:3900 DB_CONTAINER=supabase_db_<proyecto> …
//     (otro servidor y otro stack; las claves salen de .env.local)
//   GUARDAR_BASE=1 …
//     (REESCRIBE la base de la sección B con lo que dibuje el front que
//     esté corriendo. Solo tiene sentido sobre un front cuyo encabezado sin
//     datos sea el que se quiere fijar: la base de este archivo salió de
//     develop, y regenerarla sobre un cambio del encabezado es firmar ese
//     cambio.)
//
// TOCA DATOS DEL DEMO LOCAL —le carga y le vacía los datos de la empresa, le
// crea un presupuesto (N° 9001) y le apaga Presupuestos un momento— y LOS
// RESTAURA AL FINAL, pase lo que pase.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTENEDOR = process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/datos-empresa") : null;
const GUARDAR_BASE = process.env.GUARDAR_BASE === "1";
const ARCHIVO_BASE = path.join(RAIZ, "scripts/fixtures-presupuesto-sin-datos-empresa.json");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-datos-empresa-"));

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Los datos de prueba: INVENTADOS, con la forma del pedido (un encabezado
// de cinco renglones). El repo es público: acá no va la razón social ni el
// CUIT de ningún cliente. El CUIT cierra su dígito verificador.
const PRUEBA = {
  razonSocial: "EL CRUCE SERVICIOS SAS",
  cuit: "30712345671",
  cuitConGuiones: "30-71234567-1",
  condicionIva: "responsable_inscripto",
  domicilio: "Av. San Martín 1450 · 5000 Córdoba",
  telefono: "351 555 0142",
  email: "ventas@example.com",
};
const LINEAS_DE_PRUEBA = [
  "EL CRUCE SERVICIOS SAS",
  "CUIT 30-71234567-1 · IVA Responsable Inscripto",
  "Av. San Martín 1450 · 5000 Córdoba",
  "Tel. 351 555 0142 · ventas@example.com",
];
// El mismo texto que devuelve la acción de clientes con un CUIT a medias.
const CUIT_FORMATO = "El CUIL/CUIT lleva 11 números, como 20-12345678-3. Con o sin guiones, da igual.";
const AYUDA =
  "Salen en el encabezado de tus presupuestos. Si los dejás vacíos, el presupuesto lleva solo tu nombre y tu logo.";

// ============================================================
// A · Los helpers
// ============================================================

// lib/datos-empresa.ts importa de lib/texto.ts y de lib/cuit.ts (que no
// importan nada): se compilan los tres al mismo directorio y el import con
// alias pasa a ser relativo. Sin chequeo de tipos.
function cargar(archivo, reemplazos = []) {
  const ts = require(path.join(RAIZ, "node_modules/typescript"));
  const dir = fs.mkdtempSync(path.join(TMP, "lib-"));
  const compilar = (ruta, cambios = []) => {
    let fuente = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    for (const [de, a] of cambios) {
      if (!fuente.includes(de)) throw new Error(`EL REEMPLAZO NO MORDIÓ: «${de}» no está en ${ruta}`);
      fuente = fuente.replace(de, a);
    }
    const { outputText } = ts.transpileModule(fuente, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const salida = path.join(dir, path.basename(ruta).replace(/\.ts$/, ".js"));
    fs.writeFileSync(salida, outputText.replaceAll('require("@/lib/', 'require("./'));
    return salida;
  };
  compilar("lib/texto.ts");
  compilar("lib/cuit.ts");
  return require(compilar(archivo, reemplazos));
}

const TODO = {
  razonSocial: PRUEBA.razonSocial,
  cuit: PRUEBA.cuit,
  condicionIva: PRUEBA.condicionIva,
  domicilio: PRUEBA.domicilio,
  telefono: PRUEBA.telefono,
  email: PRUEBA.email,
};
const NADA = { razonSocial: null, cuit: null, condicionIva: null, domicilio: null, telefono: null, email: null };

function revisarEmpresa(m) {
  if (typeof m.lineasDeEmpresa !== "function") {
    return [["lib/datos-empresa.ts tiene las líneas del encabezado", false, "no está: el presupuesto no lleva los datos de la empresa en esta rama"]];
  }
  const l = (e, nombre = "Lubricentro El Cruce") => m.lineasDeEmpresa(e, nombre);
  return [
    ["con los seis datos salen las cuatro líneas, en su orden y con sus etiquetas",
      igual(l(TODO), LINEAS_DE_PRUEBA), JSON.stringify(l(TODO))],
    ["sin ningún dato no sale ninguna línea (ni con null, ni vacío, ni con espacios)",
      igual(l(null), []) && igual(l(undefined), []) && igual(l(NADA), [])
        && igual(l({ ...NADA, razonSocial: "   ", telefono: "", domicilio: " " }), []),
      JSON.stringify([l(null), l(NADA), l({ ...NADA, razonSocial: "   ", telefono: "" })])],
    ["cada línea sale solo si tiene dato: el CUIT solo, el IVA solo, el teléfono solo, el email solo",
      igual(l({ ...NADA, cuit: PRUEBA.cuit }), ["CUIT 30-71234567-1"])
        && igual(l({ ...NADA, condicionIva: "monotributo" }), ["IVA Monotributo"])
        && igual(l({ ...NADA, telefono: " 351 555 0142 " }), ["Tel. 351 555 0142"])
        && igual(l({ ...NADA, email: PRUEBA.email }), [PRUEBA.email])
        && igual(l({ ...NADA, domicilio: PRUEBA.domicilio }), [PRUEBA.domicilio]),
      JSON.stringify([l({ ...NADA, cuit: PRUEBA.cuit }), l({ ...NADA, condicionIva: "monotributo" }),
        l({ ...NADA, telefono: " 351 555 0142 " }), l({ ...NADA, email: PRUEBA.email })])],
    ["la condición de IVA se escribe completa, las tres",
      igual(["responsable_inscripto", "monotributo", "exento"].map((c) => l({ ...NADA, condicionIva: c })[0]),
        ["IVA Responsable Inscripto", "IVA Monotributo", "IVA Exento"])],
    ["una condición que no es de la lista no se imprime",
      igual(l({ ...NADA, condicionIva: "consumidor_final" }), [])],
    ["el CUIT se imprime con sus guiones aunque esté guardado pelado",
      l({ ...NADA, cuit: "30712345671" })[0] === "CUIT 30-71234567-1"],
    ["la razón social igual al nombre no se repite (ni con otras mayúsculas ni con tildes)",
      igual(l({ ...NADA, razonSocial: "LUBRICENTRO EL CRUCE" }), [])
        && igual(m.lineasDeEmpresa({ ...NADA, razonSocial: "lubricentro san martin " }, "Lubricentro San Martín"), [])
        && igual(l({ ...TODO, razonSocial: "Lubricentro El Cruce" }), LINEAS_DE_PRUEBA.slice(1)),
      JSON.stringify(l({ ...NADA, razonSocial: "LUBRICENTRO EL CRUCE" }))],
    ["y la que es distinta, sí",
      igual(l({ ...NADA, razonSocial: " El Cruce Servicios SAS " }), ["El Cruce Servicios SAS"])],
    ["los valores van tal cual se cargaron, sin espacios a los costados",
      igual(l({ ...NADA, domicilio: "  Av. Colón 1200, B° Alberdi  " }), ["Av. Colón 1200, B° Alberdi"])],
    ["hayDatosDeEmpresa dice si hay algo que imprimir",
      m.hayDatosDeEmpresa(TODO) === true && m.hayDatosDeEmpresa(NADA) === false && m.hayDatosDeEmpresa(null) === false
        && m.hayDatosDeEmpresa({ ...NADA, email: " " }) === false],
    ["la máscara del CUIT pone los guiones mientras se escribe",
      igual(["3", "30", "307", "3071234567", "30712345671"].map(m.mascaraCuit),
        ["3", "30", "30-7", "30-71234567", "30-71234567-1"]),
      JSON.stringify(["3", "30", "307", "3071234567", "30712345671"].map(m.mascaraCuit))],
    ["la máscara ignora lo que no es número y corta en los once",
      m.mascaraCuit("30-71234567-1") === "30-71234567-1" && m.mascaraCuit("30.712.345/671") === "30-71234567-1"
        && m.mascaraCuit("307123456711") === "30-71234567-1" && m.mascaraCuit("cuit") === ""],
    ["las tres condiciones de IVA, con su nombre, para el select",
      igual(m.CONDICIONES_IVA, [
        { clave: "responsable_inscripto", nombre: "Responsable Inscripto" },
        { clave: "monotributo", nombre: "Monotributo" },
        { clave: "exento", nombre: "Exento" },
      ])],
  ];
}

titulo("A · Los helpers");
{
  let filas;
  try {
    filas = revisarEmpresa(fs.existsSync(path.join(RAIZ, "lib/datos-empresa.ts")) ? cargar("lib/datos-empresa.ts") : {});
  } catch (e) {
    filas = [["lib/datos-empresa.ts compila", false, String(e.message).split("\n")[0]]];
  }
  for (const [nombre, ok, detalle] of filas) check(nombre, ok, detalle ?? "");
}

if (fs.existsSync(path.join(RAIZ, "lib/datos-empresa.ts"))) {
  titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
  const A = "lib/datos-empresa.ts";
  const ROTURAS = [
    ["la razón social que se repite aunque sea el nombre",
      [["normalizar(razonSocial) !== normalizar(nombreLubricentro)", "true"]],
      "la razón social igual al nombre no se repite (ni con otras mayúsculas ni con tildes)"],
    ["la razón social comparada sin normalizar",
      [["normalizar(razonSocial) !== normalizar(nombreLubricentro)", "razonSocial !== nombreLubricentro"]],
      "la razón social igual al nombre no se repite (ni con otras mayúsculas ni con tildes)"],
    ["la condición de IVA abreviada",
      [['responsable_inscripto: "Responsable Inscripto"', 'responsable_inscripto: "Resp. Inscripto"']],
      "la condición de IVA se escribe completa, las tres"],
    ["la etiqueta del CUIT con punto, como en el sistema viejo",
      [["`CUIT ${formatearCuit(cuit)}`", "`CUIT. ${formatearCuit(cuit)}`"]],
      "cada línea sale solo si tiene dato: el CUIT solo, el IVA solo, el teléfono solo, el email solo"],
    ["el CUIT impreso sin guiones",
      [["`CUIT ${formatearCuit(cuit)}`", "`CUIT ${cuit}`"]],
      "el CUIT se imprime con sus guiones aunque esté guardado pelado"],
    ["el teléfono sin su etiqueta",
      [["`Tel. ${telefono}`", "telefono"]],
      "cada línea sale solo si tiene dato: el CUIT solo, el IVA solo, el teléfono solo, el email solo"],
    ["las líneas vacías que se imprimen igual",
      [[".filter((linea) => linea.length > 0)", ""]],
      "sin ningún dato no sale ninguna línea (ni con null, ni vacío, ni con espacios)"],
    ["los valores sin recortar",
      [["return typeof valor === \"string\" && valor.trim() ? valor.trim() : null;", "return typeof valor === \"string\" && valor ? valor : null;"]],
      "los valores van tal cual se cargaron, sin espacios a los costados"],
    ["el domicilio antes que el CUIT",
      [["[cuitEIva, domicilio ?? \"\", contacto]", "[domicilio ?? \"\", cuitEIva, contacto]"]],
      "con los seis datos salen las cuatro líneas, en su orden y con sus etiquetas"],
    ["la máscara sin el segundo guion",
      [["if (d.length > 10) return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;", ""]],
      "la máscara del CUIT pone los guiones mientras se escribe"],
    ["la máscara que deja pasar más de once números",
      [["normalizarCuit(texto).slice(0, 11)", "normalizarCuit(texto)"]],
      "la máscara ignora lo que no es número y corta en los once"],
    ["una cuarta condición de IVA en el select",
      [['  { clave: "exento", nombre: "Exento" },\n', '  { clave: "exento", nombre: "Exento" },\n  { clave: "consumidor_final" as CondicionIva, nombre: "Consumidor final" },\n']],
      "las tres condiciones de IVA, con su nombre, para el select"],
  ];
  for (const [nombre, reemplazos, esperada] of ROTURAS) {
    let rojas;
    try {
      rojas = revisarEmpresa(cargar(A, reemplazos)).filter(([, ok]) => !ok).map(([n]) => n);
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
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}
const hayTabla = sql("select to_regclass('public.datos_empresa') is not null") === "t";

const ENV = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const LUB = sql("select id from lubricentros where slug = 'demo'");
const NOMBRE = sql(`select nombre from lubricentros where id = '${LUB}'`);
const OWNER = sql("select id from usuarios where email = 'demo@fidellimotors.app'");
const SUPER = sql("select id from usuarios where email = 'santi@fidellimotors.app'");
const [SUCURSAL, SUCURSAL_NOMBRE] = sql(
  `select id || '|' || nombre from sucursales where lubricentro_id = '${LUB}' and activa order by nombre limit 1`).split("|");

// El presupuesto de la prueba: fijo en todo (número, fecha, renglones), para
// que su PDF sea el mismo en cada corrida y se pueda comparar byte a byte.
const PRESUPUESTO = "d0e5d0e5-0000-4000-8000-000000009001";
const sqlPresupuesto = `
  delete from presupuestos where id = '${PRESUPUESTO}';
  insert into presupuestos (id, lubricentro_id, sucursal_id, usuario_id, numero, fecha, validez_dias,
    observaciones, destinatario_nombre, destinatario_telefono, destinatario_vehiculo, created_at, updated_at)
  values ('${PRESUPUESTO}', '${LUB}', '${SUCURSAL}', '${OWNER}', 9001, date '2026-10-01', 15,
    'Incluye mano de obra. Repuestos originales.', 'Transportes del Centro SRL', '351 555 0101',
    'Toyota Hilux · AB 123 CD', timestamptz '2026-10-01 10:00:00-03', timestamptz '2026-10-01 10:00:00-03');
  insert into presupuesto_items (presupuesto_id, lubricentro_id, orden, descripcion, cantidad, precio_unitario) values
    ('${PRESUPUESTO}', '${LUB}', 1, 'Cambio de aceite y filtro', 1, 48500),
    ('${PRESUPUESTO}', '${LUB}', 2, 'Pastillas de freno delanteras', 2, 31200),
    ('${PRESUPUESTO}', '${LUB}', 3, 'Mano de obra', 1, 25000);`;

const sinDatos = () => { if (hayTabla) sql(`delete from datos_empresa where lubricentro_id = '${LUB}';`); };
const filaEmpresa = () => (hayTabla
  ? JSON.parse(sql(`select coalesce((select to_jsonb(d) from datos_empresa d where lubricentro_id = '${LUB}'), 'null'::jsonb)`))
  : null);
// Escribe la fila directo, como postgres (la prueba de la puerta es otra).
const ponerEmpresa = (e) => sql(`
  insert into datos_empresa (lubricentro_id, razon_social, cuit, condicion_iva, domicilio, telefono, email)
  values ('${LUB}', ${lit(e.razonSocial)}, ${lit(e.cuit)}, ${lit(e.condicionIva)}, ${lit(e.domicilio)}, ${lit(e.telefono)}, ${lit(e.email)})
  on conflict (lubricentro_id) do update set razon_social = excluded.razon_social, cuit = excluded.cuit,
    condicion_iva = excluded.condicion_iva, domicilio = excluded.domicilio, telefono = excluded.telefono, email = excluded.email;`);
const lit = (v) => (v == null ? "null" : `'${String(v).replaceAll("'", "''")}'`);

// Presupuestos apagado para el demo, por la puerta real (un UPDATE suelto de
// plan_overrides lo rechaza el candado), y de vuelta a como estaba.
const OVERRIDES_ANTES = sql(`select plan_overrides::text from lubricentros where id = '${LUB}'`);
const sqlOverrides = (json, motivo) => `
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fijar_override_plan('${LUB}', '${json}'::jsonb, 'regresion-datos-empresa.mjs · ${motivo}');
  commit;`;

let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
  try {
    sql(`delete from presupuestos where id = '${PRESUPUESTO}';`);
    sinDatos();
    if (sql(`select plan_overrides::text from lubricentros where id = '${LUB}'`) !== OVERRIDES_ANTES) {
      sql(sqlOverrides(OVERRIDES_ANTES, "restaurar"));
    }
  } catch (e) {
    console.log(`  ⚠ no se pudo restaurar el demo: ${String(e.message).split("\n")[0]}`);
  }
}
process.on("SIGINT", () => { restaurar(); process.exit(130); });

sql(sqlPresupuesto);
sinDatos();

// ---------- El PDF, leído ----------
// jsPDF escribe la página sin comprimir: el stream es texto. De ahí salen
// las dos cosas que mira la prueba: el stream entero (para comparar byte a
// byte) y cada texto con su posición y su tamaño (para leer el encabezado).
function leerPdf(buf) {
  const crudo = buf.toString("latin1");
  const streams = [...crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((m) => m[1]).filter((s) => /(^|\n)BT\n/.test(s));
  const contenido = streams.join("\n%% página\n");
  const textos = [];
  for (const bloque of contenido.matchAll(/(^|\n)BT\n([\s\S]*?)\nET(?=\n|$)/g)) {
    let x = 0, y = 0, interlinea = 0, cuerpo = 0;
    for (const linea of bloque[2].split("\n")) {
      let m;
      if ((m = linea.match(/^\/F\d+ ([\d.]+) Tf$/))) cuerpo = Number(m[1]);
      else if ((m = linea.match(/^([\d.-]+) TL$/))) interlinea = Number(m[1]);
      else if ((m = linea.match(/^([\d.-]+) ([\d.-]+) Td$/))) { x += Number(m[1]); y += Number(m[2]); }
      else if (linea === "T*") y -= interlinea;
      else if ((m = linea.match(/^\((.*)\) Tj$/))) {
        const texto = m[1]
          .replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
          .replace(/\\([()\\])/g, "$1");
        textos.push({ texto, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, cuerpo });
      }
    }
  }
  return { contenido, textos, bytes: buf.length };
}

// ============================================================
// B a I · Las pantallas
// ============================================================

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
  async function entrar(email) {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', "demo1234");
    await p.click('button[type="submit"]');
    // Generoso: en frío, `next dev` compila el panel entero en el primer pedido.
    await p.waitForURL(/\/(panel|fidelli)/, { timeout: 90_000 });
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
      storageState: estado ?? undefined,
    });
    ctx.setDefaultTimeout(30_000);
    ctx.setDefaultNavigationTimeout(90_000);
    const page = await ctx.newPage();
    const tocar = (locator) => (tactil ? locator.tap() : locator.click());
    return { ctx, page, tocar };
  }

  // La ventana se estira al alto del documento: así las barras fijas no
  // quedan estampadas en el medio de la captura.
  async function capturar(page, nombre, de = null) {
    if (!DIR_CAPTURAS) return;
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const vista = page.viewportSize();
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vista.width, height: alto });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const destino = path.join(DIR_CAPTURAS, `${nombre}.png`);
    if (de) await de.screenshot({ path: destino });
    else await page.screenshot({ path: destino });
    await page.setViewportSize(vista);
    console.log(`  ◦ captura ${nombre}.png`);
  }

  // El presupuesto de la prueba, abierto: la cabecera del documento (su
  // HTML y sus líneas) y el PDF que baja el botón.
  const RUTA_PRESUPUESTO = `/panel/presupuestos/${PRESUPUESTO}`;
  async function presupuesto({ vista = { width: 1280, height: 900 }, estado = sesion, guardarComo = null } = {}) {
    const { ctx, page } = await abrir(vista, estado);
    await page.goto(`${BASE}${RUTA_PRESUPUESTO}`, { waitUntil: "networkidle" });
    // La columna izquierda de la cabecera: el logo, el nombre y lo que va debajo.
    const cabecera = page.locator("#documento-presupuesto > div > div:first-child > div:first-child");
    await cabecera.waitFor();
    const html = await cabecera.evaluate((n) => n.outerHTML);
    const lineas = await cabecera.locator("p").allInnerTexts();
    const deEmpresa = await page.locator("#documento-presupuesto [data-linea-empresa]").allInnerTexts();
    const documento = await page.locator("#documento-presupuesto").innerText();
    const [bajada] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar en PDF" }).click(),
    ]);
    const archivo = path.join(TMP, `presupuesto-${Date.now()}.pdf`);
    await bajada.saveAs(archivo);
    if (guardarComo && DIR_CAPTURAS) {
      fs.copyFileSync(archivo, path.join(DIR_CAPTURAS, `${guardarComo}.pdf`));
      console.log(`  ◦ ${guardarComo}.pdf`);
    }
    return { ctx, page, html, lineas, deEmpresa, documento, pdf: leerPdf(fs.readFileSync(archivo)), nombreArchivo: bajada.suggestedFilename() };
  }
  // Las líneas de la columna izquierda de la cabecera del PDF: lo que está
  // sobre el margen izquierdo y arriba de la grilla (la etiqueta FECHA).
  const izquierda = (pdf) => {
    const fecha = pdf.textos.find((t) => t.texto === "FECHA");
    const margen = Math.min(...pdf.textos.map((t) => t.x));
    return pdf.textos.filter((t) => Math.abs(t.x - margen) < 0.5 && fecha && t.y > fecha.y + 10);
  };

  // ---------- B · El encabezado de hoy ----------
  titulo("B · Sin datos cargados, el presupuesto es el de hoy");
  let base = fs.existsSync(ARCHIVO_BASE) ? JSON.parse(fs.readFileSync(ARCHIVO_BASE, "utf8")) : null;
  let yDeLaGrillaSinDatos = null;
  await paso("el presupuesto sin datos", async () => {
    sinDatos();
    const p = await presupuesto();
    await p.ctx.close();
    yDeLaGrillaSinDatos = p.pdf.textos.find((t) => t.texto === "FECHA")?.y ?? null;
    check("el PDF se baja con su nombre y se lee (texto, no imagen)",
      p.nombreArchivo === "presupuesto-9001.pdf" && p.pdf.textos.some((t) => t.texto === NOMBRE) && yDeLaGrillaSinDatos != null,
      `${p.nombreArchivo} · ${p.pdf.textos.length} textos`);
    if (GUARDAR_BASE) {
      base = {
        como: "GUARDAR_BASE=1 node --no-warnings scripts/regresion-datos-empresa.mjs, sobre el front SIN los datos de la empresa",
        presupuesto: "el N° 9001 del demo local que arma este script (sin logo, dos sucursales)",
        pdf: p.pdf.contenido,
        html: p.html,
      };
      fs.writeFileSync(ARCHIVO_BASE, JSON.stringify(base, null, 2) + "\n");
      console.log(`  ◦ base GUARDADA en ${path.relative(RAIZ, ARCHIVO_BASE)} (${p.pdf.contenido.length} bytes de PDF)`);
    }
    check("hay una base contra la que comparar (generada con el front de develop)", base != null,
      "falta scripts/fixtures-presupuesto-sin-datos-empresa.json");
    if (!base) return;
    check("el PDF sin datos es IDÉNTICO al de hoy (el stream de la página, byte a byte)",
      p.pdf.contenido === base.pdf, primeraDiferencia(base.pdf, p.pdf.contenido));
    check("la cabecera del documento sin datos es IDÉNTICA a la de hoy (su HTML)",
      p.html === base.html, primeraDiferencia(base.html, p.html));
    check("y sus líneas son el nombre y la sucursal, nada más",
      igual(p.lineas, [NOMBRE, SUCURSAL_NOMBRE]) && p.deEmpresa.length === 0
        && igual(izquierda(p.pdf).map((t) => t.texto), [NOMBRE, SUCURSAL_NOMBRE]),
      JSON.stringify([p.lineas, izquierda(p.pdf).map((t) => t.texto)]));
  });

  // ---------- C · La API directa ----------
  titulo("C · La API directa");
  await paso("la API", async () => {
    const pedir = async (ruta, { metodo = "GET", token = ANON, cuerpo } = {}) => {
      const r = await fetch(`${SUPA}${ruta}`, {
        method: metodo,
        headers: { apikey: ANON, authorization: `Bearer ${token}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      const texto = await r.text();
      let json = null;
      try { json = JSON.parse(texto); } catch { /* no es JSON */ }
      return { status: r.status, json, texto };
    };
    const anonTabla = await pedir("/rest/v1/datos_empresa?select=lubricentro_id");
    check("`anon` no lee la tabla", anonTabla.status === 401 || anonTabla.json?.code === "42501",
      `${anonTabla.status} ${anonTabla.texto.slice(0, 120)}`);
    const anonPuerta = await pedir("/rest/v1/rpc/guardar_datos_empresa", { metodo: "POST", cuerpo: { p_datos: { razon_social: "Anon SA" } } });
    check("`anon` no ejecuta la puerta", anonPuerta.status === 401 || anonPuerta.json?.code === "42501",
      `${anonPuerta.status} ${anonPuerta.texto.slice(0, 120)}`);
    const login = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email: "demo@fidellimotors.app", password: "demo1234" }),
    }).then((r) => r.json());
    const token = login.access_token;
    const medias = await pedir("/rest/v1/rpc/guardar_datos_empresa", { metodo: "POST", token, cuerpo: { p_datos: { cuit: "30-7123456" } } });
    check("el owner, con un CUIT a medias, recibe `cuit_invalido` y no queda nada",
      medias.status === 400 && /cuit_invalido/.test(medias.texto) && filaEmpresa() == null,
      `${medias.status} ${medias.texto.slice(0, 120)}`);
    const borrar = await pedir(`/rest/v1/datos_empresa?lubricentro_id=eq.${LUB}`, { metodo: "DELETE", token });
    check("y no puede borrar la fila: se vacían los campos", borrar.status === 401 || borrar.status === 403 || borrar.json?.code === "42501",
      `${borrar.status} ${borrar.texto.slice(0, 120)}`);
  });

  // ---------- D · Mi cuenta ----------
  titulo("D · Mi cuenta → «Datos de tu empresa», en 390 táctil");
  await paso("Mi cuenta", async () => {
    sinDatos();
    const { ctx, page, tocar } = await abrir({ width: 390, height: 844 });
    await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    const tarjeta = page.locator("section#datos-empresa");
    check("la tarjeta «Datos de tu empresa» está", (await tarjeta.count()) === 1
      && (await tarjeta.getByRole("heading", { name: "Datos de tu empresa" }).count()) === 1);
    if ((await tarjeta.count()) === 0) { await ctx.close(); return; }
    check("con su línea de ayuda", (await tarjeta.innerText()).includes(AYUDA));
    const campo = (nombre) => tarjeta.locator(`[name="${nombre}"]`);
    const nombres = ["razon_social", "cuit", "condicion_iva", "domicilio", "telefono", "email"];
    const hay = [];
    for (const n of nombres) hay.push((await campo(n).count()) === 1);
    check("los seis campos, y la condición de IVA es un select con «Sin especificar» y las tres",
      hay.every(Boolean) && igual(await campo("condicion_iva").locator("option").allInnerTexts(),
        ["Sin especificar", "Responsable Inscripto", "Monotributo", "Exento"]),
      JSON.stringify(hay));
    check("vacía: sin datos no hay nada escrito",
      (await campo("razon_social").inputValue()) === "" && (await campo("cuit").inputValue()) === ""
        && (await campo("condicion_iva").inputValue()) === "");

    // La máscara, mientras se escribe.
    await campo("cuit").pressSequentially("307");
    const tres = await campo("cuit").inputValue();
    await campo("cuit").pressSequentially("1234567");
    const diez = await campo("cuit").inputValue();
    check("el CUIT gana sus guiones mientras se escribe", tres === "30-7" && diez === "30-71234567", `${tres} · ${diez}`);

    // A medias: el mismo mensaje que en clientes, y no se guarda.
    await tocar(tarjeta.getByRole("button", { name: "Guardar" }));
    await tarjeta.getByRole("alert").waitFor();
    check("un CUIT a medias se rechaza con el mismo mensaje que en clientes",
      (await tarjeta.getByRole("alert").innerText()).trim() === CUIT_FORMATO && filaEmpresa() == null,
      await tarjeta.getByRole("alert").innerText());

    // Once números con el verificador mal: avisa, no bloquea. (El cursor se
    // pone al final a mano: al volver al campo por código, después de tocar
    // Guardar, queda al principio, y la tecla Fin en macOS no lo mueve.)
    await campo("cuit").focus();
    await campo("cuit").evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    await campo("cuit").pressSequentially("0");
    check("con el dígito verificador mal, avisa",
      (await campo("cuit").inputValue()) === "30-71234567-0" && /dígito verificador no\s+cierra/.test(await tarjeta.innerText()),
      await campo("cuit").inputValue());
    await campo("cuit").press("Backspace");
    await campo("cuit").pressSequentially("1");
    check("y con el bueno, no", (await campo("cuit").inputValue()) === PRUEBA.cuitConGuiones
      && !/dígito verificador/.test(await tarjeta.innerText()));

    await campo("razon_social").fill(`  ${PRUEBA.razonSocial}  `);
    await campo("condicion_iva").selectOption(PRUEBA.condicionIva);
    await campo("domicilio").fill(PRUEBA.domicilio);
    await campo("telefono").fill(PRUEBA.telefono);
    await campo("email").fill(PRUEBA.email);
    await tocar(tarjeta.getByRole("button", { name: "Guardar" }));
    await tarjeta.getByText("Listo, los datos de tu empresa quedaron guardados.").waitFor();
    const fila = filaEmpresa();
    check("guardar deja la fila normalizada: el CUIT en once números y los textos sin espacios a los costados",
      fila && fila.razon_social === PRUEBA.razonSocial && fila.cuit === PRUEBA.cuit && fila.condicion_iva === PRUEBA.condicionIva
        && fila.domicilio === PRUEBA.domicilio && fila.telefono === PRUEBA.telefono && fila.email === PRUEBA.email,
      JSON.stringify(fila));
    check("a nombre de quien guardó", fila?.actualizado_por === OWNER, String(fila?.actualizado_por));

    await page.reload({ waitUntil: "networkidle" });
    check("al volver están cargados, el CUIT con sus guiones",
      (await campo("razon_social").inputValue()) === PRUEBA.razonSocial
        && (await campo("cuit").inputValue()) === PRUEBA.cuitConGuiones
        && (await campo("condicion_iva").inputValue()) === PRUEBA.condicionIva
        && (await campo("email").inputValue()) === PRUEBA.email);
    // Dos capturas por ancho: Mi cuenta entera y la tarjeta sola, de cerca.
    await capturar(page, "mi-cuenta-390");
    await capturar(page, "mi-cuenta-390-tarjeta", tarjeta);
    await ctx.close();

    const ancha = await abrir({ width: 1280, height: 900 });
    await ancha.page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    await capturar(ancha.page, "mi-cuenta-1280");
    await capturar(ancha.page, "mi-cuenta-1280-tarjeta", ancha.page.locator("section#datos-empresa"));
    await ancha.ctx.close();
  });

  // ---------- E · El presupuesto con los datos ----------
  titulo("E · El presupuesto con los datos de la empresa");
  await paso("el presupuesto con datos", async () => {
    if (!hayTabla) { check("la tabla datos_empresa existe", false, "no está en esta base"); return; }
    ponerEmpresa(TODO);
    const p = await presupuesto({ guardarComo: "presupuesto" });
    check("el documento lleva las cinco líneas, y después la sucursal",
      igual(p.lineas, [NOMBRE, ...LINEAS_DE_PRUEBA, SUCURSAL_NOMBRE]) && igual(p.deEmpresa, LINEAS_DE_PRUEBA),
      JSON.stringify(p.lineas));
    await capturar(p.page, "presupuesto-documento", p.page.locator("#documento-presupuesto"));
    await p.ctx.close();
    const izq = izquierda(p.pdf);
    check("el PDF lleva las mismas cinco líneas, en ese orden, y después la sucursal (texto extraído del PDF)",
      igual(izq.map((t) => t.texto), [NOMBRE, ...LINEAS_DE_PRUEBA, SUCURSAL_NOMBRE]), JSON.stringify(izq.map((t) => t.texto)));
    check("de arriba hacia abajo, sin encimarse",
      izq.every((t, i) => i === 0 || izq[i - 1].y - t.y >= 10), JSON.stringify(izq.map((t) => t.y)));
    const sucursal = izq.at(-1);
    check("las cuatro de la empresa van en el cuerpo que hoy tiene la sucursal, y el nombre sigue en el suyo",
      izq.slice(1, -1).every((t) => t.cuerpo === sucursal?.cuerpo) && izq[0].cuerpo > (sucursal?.cuerpo ?? 99),
      JSON.stringify(izq.map((t) => t.cuerpo)));
    const yGrilla = p.pdf.textos.find((t) => t.texto === "FECHA")?.y;
    check("el bloque crece hacia abajo y empuja la grilla", yGrilla != null && yDeLaGrillaSinDatos != null && yGrilla < yDeLaGrillaSinDatos - 30,
      `${yDeLaGrillaSinDatos} → ${yGrilla}`);
    const numero = p.pdf.textos.find((t) => t.texto === "N° 9001");
    const rotulo = p.pdf.textos.find((t) => t.texto === "PRESUPUESTO");
    check("el bloque «PRESUPUESTO N°» sigue arriba a la derecha, donde estaba",
      numero != null && rotulo != null && numero.x > 400 && rotulo.x > 400 && rotulo.y >= izq[0].y, JSON.stringify([rotulo, numero]));
    const todo = `${p.documento}\n${p.pdf.textos.map((t) => t.texto).join("\n")}`;
    check("y nada que lo acerque a una factura: ni «Factura» como título, ni CAE, ni punto de venta",
      !/\bCAE\b|punto de venta|ingresos brutos|inicio de actividades/i.test(todo)
        && (todo.match(/factura/gi) ?? []).length === 2 && /no válido como\s+factura/i.test(todo),
      (todo.match(/.{0,30}(factura|CAE|punto de venta).{0,30}/gi) ?? []).join(" | "));

    // La razón social igual al nombre no se repite.
    ponerEmpresa({ ...TODO, razonSocial: NOMBRE.toUpperCase() });
    const igualAlNombre = await presupuesto();
    await igualAlNombre.ctx.close();
    check("la razón social igual al nombre no se repite, en el documento ni en el PDF",
      igual(igualAlNombre.deEmpresa, LINEAS_DE_PRUEBA.slice(1))
        && igual(izquierda(igualAlNombre.pdf).map((t) => t.texto), [NOMBRE, ...LINEAS_DE_PRUEBA.slice(1), SUCURSAL_NOMBRE]),
      JSON.stringify(igualAlNombre.deEmpresa));

    // Con un solo dato, una sola línea.
    ponerEmpresa({ ...NADA, cuit: PRUEBA.cuit });
    const solo = await presupuesto();
    await solo.ctx.close();
    check("con solo el CUIT sale una sola línea",
      igual(solo.deEmpresa, ["CUIT 30-71234567-1"])
        && igual(izquierda(solo.pdf).map((t) => t.texto), [NOMBRE, "CUIT 30-71234567-1", SUCURSAL_NOMBRE]),
      JSON.stringify(solo.deEmpresa));

    // Un domicilio larguísimo envuelve y no llega al bloque de la derecha.
    const largo = "Avenida Circunvalación Agustín Tosco 12450, colectora norte, entre Ruta Nacional 9 y Camino a Monte Cristo, Barrio Los Boulevares, Córdoba Capital";
    ponerEmpresa({ ...NADA, domicilio: largo });
    const envuelto = await presupuesto();
    await envuelto.ctx.close();
    const partes = izquierda(envuelto.pdf).slice(1, -1);
    const numeroLargo = envuelto.pdf.textos.find((t) => t.texto === "N° 9001");
    // El ancho de verdad de cada renglón, con la misma métrica que usó el
    // PDF (jsPDF, Helvetica). El tope es el del nombre: 140 mm desde el margen.
    const { jsPDF } = require(path.join(RAIZ, "node_modules/jspdf"));
    const regla = new jsPDF({ unit: "pt" });
    regla.setFont("helvetica", "normal");
    const derecha = Math.max(...partes.map((t) => { regla.setFontSize(t.cuerpo); return t.x + regla.getTextWidth(t.texto); }));
    const tope = partes[0].x + (140 * 72) / 25.4;
    check("un domicilio larguísimo envuelve en renglones, dentro del ancho del nombre, y no llega al bloque «PRESUPUESTO N°»",
      partes.length >= 2 && partes.map((t) => t.texto).join(" ") === largo && numeroLargo != null
        && derecha <= tope + 0.5 && derecha < numeroLargo.x - 20,
      JSON.stringify({ renglones: partes.map((t) => t.texto), derecha: Math.round(derecha), tope: Math.round(tope), numero: numeroLargo?.x }));
  });

  // ---------- F · Vaciar ----------
  titulo("F · Vaciar los datos: el encabezado vuelve al de hoy");
  await paso("vaciar", async () => {
    if (!hayTabla) { check("la tabla datos_empresa existe", false, "no está en esta base"); return; }
    ponerEmpresa(TODO);
    const { ctx, page } = await abrir({ width: 1280, height: 900 });
    await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    const tarjeta = page.locator("section#datos-empresa");
    for (const n of ["razon_social", "cuit", "domicilio", "telefono", "email"]) await tarjeta.locator(`[name="${n}"]`).fill("");
    await tarjeta.locator('[name="condicion_iva"]').selectOption("");
    await tarjeta.getByRole("button", { name: "Guardar" }).click();
    await tarjeta.getByText("Listo, los datos de tu empresa quedaron guardados.").waitFor();
    await ctx.close();
    const fila = filaEmpresa();
    check("vaciar deja los seis campos en null (la fila no se borra)",
      fila != null && ["razon_social", "cuit", "condicion_iva", "domicilio", "telefono", "email"].every((c) => fila[c] === null),
      JSON.stringify(fila));
    const p = await presupuesto();
    await p.ctx.close();
    check("y el PDF vuelve a ser IDÉNTICO al de hoy", base != null && p.pdf.contenido === base.pdf,
      base ? primeraDiferencia(base.pdf, p.pdf.contenido) : "sin base");
    check("y la cabecera del documento también", base != null && p.html === base.html,
      base ? primeraDiferencia(base.html, p.html) : "sin base");
  });

  // ---------- G · La ficha de /fidelli ----------
  titulo("G · La ficha de /fidelli → Datos → Empresa");
  await paso("la ficha", async () => {
    sinDatos();
    const { ctx, page } = await abrir({ width: 1280, height: 900 }, sesionFidelli);
    await page.goto(`${BASE}/fidelli/${LUB}?tab=datos`, { waitUntil: "networkidle" });
    const vista = page.getByRole("link", { name: "Empresa", exact: true });
    check("la solapa Datos tiene la vista «Empresa»", (await vista.count()) === 1);
    if ((await vista.count()) === 0) { await ctx.close(); return; }
    await vista.click();
    await page.waitForURL(/ver=empresa/);
    const tarjeta = page.locator("section#datos-empresa");
    await tarjeta.waitFor();
    check("con el mismo formulario: los seis campos", (await tarjeta.locator("[name]").evaluateAll(
      (ns) => ns.map((n) => n.getAttribute("name")).filter((n) => !n.startsWith("$")).join(","))).includes("razon_social,cuit,condicion_iva,domicilio,telefono,email"));
    await tarjeta.locator('[name="razon_social"]').fill(PRUEBA.razonSocial);
    await tarjeta.locator('[name="cuit"]').pressSequentially(PRUEBA.cuit);
    await tarjeta.locator('[name="condicion_iva"]').selectOption("monotributo");
    await tarjeta.locator('[name="telefono"]').fill(PRUEBA.telefono);
    await tarjeta.getByRole("button", { name: "Guardar" }).click();
    await tarjeta.getByText(/quedaron guardados/).waitFor();
    const fila = filaEmpresa();
    check("guarda por la misma puerta, en ESTE lubricentro y a nombre de Fidelli",
      fila && fila.razon_social === PRUEBA.razonSocial && fila.cuit === PRUEBA.cuit && fila.condicion_iva === "monotributo"
        && fila.domicilio === null && fila.actualizado_por === SUPER,
      JSON.stringify(fila));
    check("y no tocó la de ningún otro", sql("select count(*) from datos_empresa") === "1", sql("select count(*) from datos_empresa"));
    await page.reload({ waitUntil: "networkidle" });
    check("la ficha dice quién los cargó", /cargados? por Fidelli/i.test(await page.locator("section#datos-empresa").innerText()),
      (await page.locator("section#datos-empresa").innerText()).slice(-160));
    await capturar(page, "ficha-fidelli-1280");
    await ctx.close();

    const panel = await abrir({ width: 390, height: 844 });
    await panel.page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    const suya = panel.page.locator("section#datos-empresa");
    check("el dueño los ve en su Mi cuenta",
      (await suya.locator('[name="razon_social"]').inputValue()) === PRUEBA.razonSocial
        && (await suya.locator('[name="cuit"]').inputValue()) === PRUEBA.cuitConGuiones
        && (await suya.locator('[name="condicion_iva"]').inputValue()) === "monotributo");
    await panel.ctx.close();
    const p = await presupuesto();
    await p.ctx.close();
    check("y salen en su presupuesto",
      igual(p.deEmpresa, [PRUEBA.razonSocial, "CUIT 30-71234567-1 · IVA Monotributo", "Tel. 351 555 0142"]), JSON.stringify(p.deEmpresa));
  });

  // ---------- H · Sin Presupuestos en el plan ----------
  titulo("H · Un plan sin Presupuestos no ve la tarjeta");
  await paso("sin la feature", async () => {
    const apagado = JSON.stringify({ ...JSON.parse(OVERRIDES_ANTES || "{}"), presupuestos: false });
    sql(sqlOverrides(apagado, "Presupuestos apagado para la prueba"));
    const { ctx, page } = await abrir({ width: 390, height: 844 });
    await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    check("sin Presupuestos, Mi cuenta no muestra «Datos de tu empresa» (y el resto sigue)",
      (await page.locator("section#datos-empresa").count()) === 0 && (await page.getByText("Tu marca").count()) > 0);
    await ctx.close();
    sql(sqlOverrides(OVERRIDES_ANTES, "restaurar"));
    const otra = await abrir({ width: 390, height: 844 });
    await otra.page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    check("y con Presupuestos de vuelta, sí", (await otra.page.locator("section#datos-empresa").count()) === 1);
    await otra.ctx.close();
  });

  // ---------- I · Todos los dispositivos ----------
  titulo("I · Todos los dispositivos");
  if (hayTabla) ponerEmpresa(TODO);
  for (const vista of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 900 }]) {
    await paso(`${vista.width}`, async () => {
      const { ctx, page } = await abrir(vista);
      await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const s = document.querySelector("section#datos-empresa");
        const controles = s ? [...s.querySelectorAll("input:not([type=hidden]), select, button")] : [];
        const altos = controles.map((n) => Math.round(n.getBoundingClientRect().height));
        const derecha = controles.length ? Math.max(...controles.map((n) => n.getBoundingClientRect().right)) : 0;
        return {
          scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          controles: altos.length,
          minimo: altos.length ? Math.min(...altos) : 0,
          entra: derecha <= document.documentElement.clientWidth,
        };
      });
      check(`${vista.width}: la tarjeta entra, sin scroll horizontal y con todo lo que se toca de 44 px o más`,
        m.scroll && m.controles === 7 && m.minimo >= 44 && m.entra, JSON.stringify(m));
      await ctx.close();
      const doc = await abrir(vista);
      await doc.page.goto(`${BASE}${RUTA_PRESUPUESTO}`, { waitUntil: "networkidle" });
      const d = await doc.page.evaluate(() => {
        const hoja = document.querySelector("#documento-presupuesto");
        const lineas = [...document.querySelectorAll("#documento-presupuesto [data-linea-empresa]")];
        const numero = [...document.querySelectorAll("#documento-presupuesto p")].find((p) => /^N°/.test(p.textContent ?? ""));
        const r = numero?.getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          lineas: lineas.length,
          adentro: hoja ? lineas.every((l) => l.getBoundingClientRect().right <= hoja.getBoundingClientRect().right) : false,
          sinPisar: r ? lineas.every((l) => l.getBoundingClientRect().right <= r.left || l.getBoundingClientRect().top >= r.bottom) : false,
          letra: Math.min(...lineas.map((l) => parseFloat(getComputedStyle(l).fontSize))),
        };
      });
      check(`${vista.width}: en el documento las cuatro líneas entran, no pisan el número y no bajan de 12 px`,
        d.scroll && d.lineas === 4 && d.adentro && d.sinPisar && d.letra >= 12, JSON.stringify(d));
      await doc.ctx.close();
    });
  }
} catch (e) {
  check("la corrida", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close();
  restaurar();
  fs.rmSync(TMP, { recursive: true, force: true });
}

// Dónde empiezan a diferir dos textos, para leer la falla sin un diff entero.
function primeraDiferencia(a, b) {
  if (a === b) return "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const recorte = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 80));
  return `difieren desde el carácter ${i} (${a.length} vs ${b.length}): la base ${recorte(a)} · ahora ${recorte(b)}`;
}

console.log(fallas === 0 ? "\nTODO EN VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);
