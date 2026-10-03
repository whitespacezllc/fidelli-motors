// Pedidos de calcos, PR 2: Mi cuenta → Calcos de punta a punta —pedir,
// pagar con la cuenta de Cresium, ver el tick— contra el stack local y los
// dos dobles (regla 13: una prueba que nunca se vio en rojo no existe).
// Esta se vio en rojo con la base y el webhook ya en su lugar y la pantalla
// todavía sin existir.
//
// Lo que cubre:
//   A · Sin navegador.
//       1 · EL M² NO LLEGA AL TENANT: se recorren los imports de Mi cuenta →
//           Calcos, de sus acciones, de la pantalla de pago y de los mails,
//           y ningún módulo que arrastren puede contener «m²» ni importar
//           lib/fidelli/calcos.ts.
//       2 · Los dos mails, compilados con tsc: dicen lo que dice el sprint,
//           el botón va a /panel/cuenta/calcos, y no dicen «m²».
//   B · El pedido, con Playwright en 390×844 táctil:
//       el link desde Mi cuenta y desde «Más»; tu calco a 5 × 8 cm por URL
//       firmada; los packs y sus precios SALEN DEL CATÁLOGO; el total se
//       arma solo; «Confirmar y pagar» → la pantalla de pago con alias (≤ 20
//       caracteres) y CVU, y «Copiar» copia; la pantalla de la SUSCRIPCIÓN
//       no se confunde con la orden de calcos; un depósito parcial dice
//       cuánto falta; el depósito completo cambia la pantalla SOLA al éxito
//       en menos de 10 s; el mail de pago sale una vez aunque Cresium
//       reintente; el historial dice Pagado.
//   C · /fidelli lo despacha: en producción → enviado con seguimiento (y su
//       mail) → el tenant ve «En camino · …» → entregado → el contador sube.
//   D · «Plan y precios»: se edita un pack con motivo, el tenant ve el
//       precio nuevo y el pedido viejo no se movió.
//   E · El vencimiento: un pedido de más de 7 días deja de ofrecer su
//       cuenta, el tenant vuelve a pedir, y si igual paga el viejo el
//       webhook lo acredita.
//   F · «Reintentar»: un pedido sin cuenta la genera, y como la referencia
//       ya existe en Cresium sale con el sufijo del intento.
//   G · El cierre diario: la ruta del cron, llamada de verdad, vence el
//       pedido que nadie volvió a mirar; sin el secreto no toca nada, y
//       corrida otra vez no vence nada más.
//   H · 360 / 390 / 820 / 1280: sin scroll horizontal, tres packs por fila
//       en 360 y cinco en escritorio, 44px en todo lo que se toca.
//
// Requiere el stack local RECIÉN RESETEADO y el servidor de Next:
//   supabase db reset && npm run dev
// con CRESIUM_BASE_URL=http://localhost:4010 y RESEND_BASE_URL=http://localhost:4020
// en .env.local (si no, se niega a correr: movería plata o mandaría mails de
// verdad). Los dos dobles los levanta —y los apaga— este script: no tienen
// que estar corriendo.
//
// Correr:
//   node --no-warnings scripts/regresion-calcos-tenant.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-calcos-tenant.mjs
//     (además deja las capturas en docs/capturas/calcos/)
//
// Deja en el demo local un diseño, cuatro pedidos (uno entregado, dos
// pagados y uno vencido), una entrega en el libro, el pack de 200 a $47.000
// y el día de ayer cerrado: `supabase db reset` es la limpieza.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const TSC = path.join(RAIZ, "node_modules", ".bin", "tsc");
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WEBHOOK = `${BASE}/api/cresium/webhook`;
const RUTA = `${BASE}/panel/cuenta/calcos`;
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/calcos") : null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);

// Un paso que falla no corta la corrida: cuenta su falla y sigue.
async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

function sql(consulta) {
  return execFileSync(
    "docker",
    ["exec", "-i", process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: consulta, encoding: "utf8" },
  ).trim();
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));
if (env.CRESIUM_BASE_URL !== "http://localhost:4010") {
  console.error("En .env.local tiene que estar CRESIUM_BASE_URL=http://localhost:4010 (el doble): esta prueba NO puede correr contra Cresium de verdad.");
  process.exit(1);
}
if (env.RESEND_BASE_URL !== "http://localhost:4020" || !env.RESEND_API_KEY) {
  console.error("En .env.local tiene que estar RESEND_BASE_URL=http://localhost:4020 (el doble) y una RESEND_API_KEY cualquiera: esta prueba NO puede mandar mails de verdad.");
  process.exit(1);
}

// ============================================================
// A1 · El m² no llega al tenant
// ============================================================
titulo("A · Sin navegador");

// Los puntos de entrada del lado del tenant: su pantalla, sus acciones, la
// pantalla de pago compartida, la navegación y lo que arma sus mails.
const ENTRADAS = [
  "app/panel/(tras-onboarding)/cuenta/calcos/page.tsx",
  "app/panel/(tras-onboarding)/cuenta/calcos/actions.ts",
  "app/panel/(tras-onboarding)/cuenta/page.tsx",
  "components/suscripcion/pantalla-pago.tsx",
  "components/panel/barra-mobile.tsx",
  "lib/email/calcos.ts",
  "lib/pedidos-calcos/avisos.ts",
  "lib/pedidos-calcos/orden.ts",
];

function resolver(desde, especificador) {
  let base;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(desde), especificador);
  else return null; // un paquete: no es código nuestro
  for (const sufijo of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidato = base + sufijo;
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
  }
  return null;
}

function arrastrados(entradas) {
  const vistos = new Set();
  const cola = entradas.map((e) => path.join(RAIZ, e));
  while (cola.length) {
    const archivo = cola.pop();
    if (vistos.has(archivo) || !fs.existsSync(archivo)) continue;
    vistos.add(archivo);
    const fuente = fs.readFileSync(archivo, "utf8");
    for (const m of fuente.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const destino = resolver(archivo, m[1]);
      if (destino) cola.push(destino);
    }
  }
  return [...vistos];
}

{
  const faltan = ENTRADAS.filter((e) => !fs.existsSync(path.join(RAIZ, e)));
  check("existen los ocho puntos de entrada del lado del tenant", faltan.length === 0, `faltan: ${faltan.join(", ")}`);

  const modulos = arrastrados(ENTRADAS.filter((e) => fs.existsSync(path.join(RAIZ, e))));
  const relativo = (a) => path.relative(RAIZ, a);
  check("el recorrido de imports llega lejos (más de 15 módulos)", modulos.length > 15, `${modulos.length}`);

  // La unidad escrita («m²», «metros cuadrados») y los dos nombres que la
  // cargan. No el token `m2` a secas: es una variable de fechas y un path
  // de SVG en módulos que no tienen nada que ver.
  const conM2 = modulos.filter((a) =>
    /m²|metros? cuadrados?|metrosCuadrados|CALCOS_POR_M2/i.test(fs.readFileSync(a, "utf8")));
  check("ningún módulo que importa una pantalla del tenant contiene el m²", conM2.length === 0, conM2.map(relativo).join(", "));

  const prohibidos = modulos.filter((a) => relativo(a) === "lib/fidelli/calcos.ts");
  check("ninguno importa lib/fidelli/calcos.ts (el costo, la ganancia y el m²)", prohibidos.length === 0);

  const fidelli = fs.existsSync(path.join(RAIZ, "lib/fidelli/calcos.ts"))
    ? fs.readFileSync(path.join(RAIZ, "lib/fidelli/calcos.ts"), "utf8")
    : "";
  check("metrosCuadrados y CALCOS_POR_M2 viven en lib/fidelli/calcos.ts",
    /export function metrosCuadrados/.test(fidelli) && /export const CALCOS_POR_M2/.test(fidelli));
  const compartido = fs.readFileSync(path.join(RAIZ, "lib/calcos.ts"), "utf8");
  check("y ya no en lib/calcos.ts", !/metrosCuadrados|CALCOS_POR_M2|m²/.test(compartido));
}

// ============================================================
// A2 · Los dos mails
// ============================================================
function compilarMails() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-mail-calcos-"));
  for (const f of ["marco.ts", "calcos.ts"]) {
    fs.copyFileSync(path.join(RAIZ, "lib/email", f), path.join(dir, f));
  }
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"),
    path.join(dir, "marco.ts"), path.join(dir, "calcos.ts"),
  ], { stdio: "pipe" });
  return require(path.join(dir, "out", "calcos.js"));
}

await paso("los mails compilan solos", async () => {
  const m = compilarMails();
  const base = { nombre: "Aimar <Mecánica>", numero: 12, cantidad: 1000, enlace: "https://fidellimotors.app/panel/cuenta/calcos" };

  const pago = m.emailPagoAcreditado({ ...base, tiempoDeProduccion: "3 a 5 días hábiles" });
  check("el de pago: asunto con el número del pedido", pago.asunto === "Recibimos tu pago del pedido #0012", pago.asunto);
  check("dice lo que dice el sprint",
    pago.text.includes("Recibimos tu pago del pedido #0012: 1.000 calcos.") &&
    pago.text.includes("Arrancamos la producción, 3 a 5 días hábiles. Después te avisamos cómo sigue."), pago.text);
  check("el botón va a Mi cuenta → Calcos", pago.html.includes('href="https://fidellimotors.app/panel/cuenta/calcos"'));
  check("el nombre del lubricentro va escapado", pago.html.includes("Aimar &lt;Mecánica&gt;") && !pago.html.includes("<Mecánica>"));

  const envio = m.emailPedidoDespachado({ ...base, entrega: "envio", transportista: "Andreani", seguimiento: "1234 5678", tiempoDeEnvio: "2 a 5 días hábiles" });
  check("el de envío dice el transportista, el seguimiento y el plazo",
    envio.text.includes("Salió tu pedido #0012 por Andreani, seguimiento 1234 5678, 2 a 5 días hábiles."), envio.text);

  const retiro = m.emailPedidoDespachado({ ...base, entrega: "retiro", transportista: null, seguimiento: null, tiempoDeEnvio: "2 a 5 días hábiles" });
  check("el de retiro manda a coordinar por WhatsApp",
    retiro.text.includes("Tu pedido está listo. Te escribimos por WhatsApp para coordinar la entrega."), retiro.text);

  const todo = [pago, envio, retiro].map((e) => e.asunto + e.html + e.text).join("\n");
  check("ninguno dice «m²»", !/m²|\bm2\b/i.test(todo));
});

// ============================================================
// Los dobles y el estado de partida
// ============================================================
process.env.PUERTO = "4010";
const cresium = await import("./doble-cresium.mjs");
process.env.PUERTO = "4020";
// El doble acepta UNA key: la que tenga la app en .env.local, sea cual sea.
// Lo que importa es que RESEND_BASE_URL apunte acá (chequeado arriba).
process.env.DOBLE_RESEND_KEY = env.RESEND_API_KEY;
const resend = await import("./doble-resend.mjs");
await cresium.arrancar();
await resend.arrancar();
const enviados = async () => (await fetch("http://localhost:4020/_enviados")).json();

const DEMO = sql("select id from lubricentros where slug = 'demo';");
const tabla = (nombre) => sql(`select to_regclass('public.${nombre}') is not null;`) === "t";
const entregadas = () => Number(sql(`select calcos_entregadas from lubricentros where id = '${DEMO}';`));
const precio = (codigo) => Number(sql(`select precio_ars from catalogo_calcos where codigo = '${codigo}';`));
const pedidosDelDemo = () => Number(sql(`select count(*) from encargos_calcos where lubricentro_id = '${DEMO}';`));
const ultimo = () => sql(`select id || '|' || numero || '|' || estado from encargos_calcos where lubricentro_id = '${DEMO}' order by numero desc limit 1;`).split("|");
const ENTREGADAS_INICIAL = entregadas();
const numeroBonito = (n) => `#${String(n).padStart(4, "0")}`;
const ars = (n) => `ARS ${new Intl.NumberFormat("es-AR").format(n)}`;

// Pedidos, un diseño o un precio movido: son los rastros de una corrida
// anterior (también de una que terminó en rojo).
const usada =
  tabla("encargos_calcos") &&
  (pedidosDelDemo() > 0 ||
    Number(sql(`select count(*) from disenos_calco where lubricentro_id = '${DEMO}';`)) > 0 ||
    precio("pack_200") !== 45000);
if (usada) {
  console.log("\nEl demo ya tiene pedidos o un diseño, o el catálogo se movió: esta prueba necesita la base recién reseteada (supabase db reset).");
  cresium.parar(); resend.parar();
  process.exit(1);
}

// Un PNG de verdad, de 5 × 8, para el diseño.
function pngLiso(ancho, alto, [r, g, b]) {
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: alto }, () => fila)))),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-calcos-tenant-"));
const ARCHIVO_PNG = path.join(TMP, "calco.png");
fs.writeFileSync(ARCHIVO_PNG, pngLiso(250, 400, [0x1f, 0x4e, 0x79]));

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function sesionDe(email, destino) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(45_000);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "demo1234");
  await p.click('button[type="submit"]');
  await p.waitForURL(destino, { timeout: 20_000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}
const SESION_OWNER = await sesionDe("demo@fidellimotors.app", "**/panel**");
const SESION_FIDELLI = await sesionDe("santi@fidellimotors.app", "**/fidelli**");

async function abrir(vista, sesion) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({
    viewport: vista,
    deviceScaleFactor: 2,
    locale: "es-AR",
    hasTouch: tactil,
    isMobile: tactil,
    storageState: sesion,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  // La primera visita a una ruta en `next dev` la compila: puede tardar.
  page.setDefaultNavigationTimeout(45_000);
  const tocar = (locator) => (tactil ? locator.tap() : locator.click());
  return { ctx, page, tocar };
}

async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const vista = page.viewportSize();
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vista.width, height: Math.max(vista.height, alto) });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`) });
  await page.setViewportSize(vista);
}

const sinM2 = async (page) => !/m²|\bm2\b/i.test(await page.locator("body").innerText());

const { page, tocar, ctx } = await abrir({ width: 390, height: 844 }, SESION_OWNER);
const fidelli = await abrir({ width: 1280, height: 900 }, SESION_FIDELLI);
const filaFidelli = (numero) => fidelli.page.locator(`[data-encargo="${numero}"]`);

// ============================================================
// B · El pedido
// ============================================================
titulo("B · Mi cuenta → Calcos: pedir y pagar");

await paso("se llega desde Mi cuenta y desde «Más»", async () => {
  await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Ver y pedir calcos" });
  check("Mi cuenta tiene el link a Calcos", (await link.getAttribute("href").catch(() => null)) === "/panel/cuenta/calcos");
  await tocar(page.getByRole("button", { name: "Más" }));
  const enMas = page.getByRole("dialog", { name: "Más secciones" }).getByRole("link", { name: "Calcos" });
  check("la hoja «Más» de la barra mobile también", (await enMas.getAttribute("href").catch(() => null)) === "/panel/cuenta/calcos");
  await page.keyboard.press("Escape");
});

await paso("sin diseño todavía, lo dice y deja pedir igual", async () => {
  const r = await page.goto(RUTA, { waitUntil: "networkidle" });
  check("la página responde", r?.status() === 200, `status ${r?.status()}`);
  const calco = await page.locator("[data-calco]").innerText();
  check("sin diseño: «Estamos diseñando tu calco»", calco.includes("Estamos diseñando tu calco"), calco.slice(0, 120));
  check("los calcos entregados hasta hoy son el contador",
    (await page.locator("[data-entregadas]").innerText()).trim() === String(ENTREGADAS_INICIAL) && calco.includes("calcos entregados hasta hoy"));
  check("y el formulario está igual", (await page.locator('[data-pedido="formulario"]').count()) === 1);
});

await paso("con el diseño subido, el calco se ve a 5 × 8 cm por URL firmada", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli/${DEMO}?tab=calcos`, { waitUntil: "networkidle" });
  await f.getByRole("button", { name: "Subir diseño" }).first().click();
  const dialogo = f.getByRole("dialog");
  await dialogo.locator('input[type="file"]').setInputFiles(ARCHIVO_PNG);
  await dialogo.getByRole("button", { name: "Subir diseño" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });

  await page.goto(RUTA, { waitUntil: "networkidle" });
  const img = page.locator("[data-calco] img");
  await img.waitFor({ timeout: 10_000 });
  const src = await img.getAttribute("src");
  check("el calco sale por URL firmada del bucket privado", /\/storage\/v1\/object\/sign\/calcos\//.test(src ?? ""), src ?? "");
  const caja = await page.locator("[data-calco] a").first().boundingBox();
  // 5 × 8 cm en CSS son 189 × 302 px.
  check("a tamaño 5 × 8 cm", Math.abs(caja.width - 189) <= 2 && Math.abs(caja.height - 302) <= 2, `${Math.round(caja.width)} × ${Math.round(caja.height)}`);
  check("el texto dice qué versión es", (await page.locator("[data-calco]").innerText()).includes("Diseño v1"));
});

await paso("los packs y sus precios salen del catálogo", async () => {
  const packs = page.locator("[data-pack]");
  check("son los cinco packs", (await packs.count()) === 5);
  const textos = await packs.allInnerTexts();
  const esperado = [["pack_200", "200"], ["pack_400", "400"], ["pack_800", "800"], ["pack_1000", "1.000"], ["pack_2000", "2.000"]];
  check("cada uno con su cantidad y el precio de la base",
    esperado.every(([codigo, cantidad], i) => textos[i].includes(cantidad) && textos[i].includes(ars(precio(codigo)))), textos.join(" | "));
  check("uno prendido, y es el de 400", (await page.locator('[data-pack][aria-pressed="true"]').getAttribute("data-pack")) === "pack_400");
  const form = page.locator('[data-pedido="formulario"]');
  check("el precio por calco, debajo", (await form.innerText()).includes(`${ars(precio("pack_400") / 400)} por calco.`));
  check("el total arranca en el pack", (await page.locator("[data-total-valor]").innerText()) === ars(precio("pack_400")));

  await tocar(page.locator('[data-pack="pack_1000"]'));
  check("tocar otro pack cambia el total y el precio por calco",
    (await page.locator("[data-total-valor]").innerText()) === ars(precio("pack_1000")) &&
    (await form.innerText()).includes(`${ars(precio("pack_1000") / 1000)} por calco.`));
  await tocar(page.locator('[data-pack="pack_400"]'));
});

await paso("el rediseño y el envío se suman solos al total", async () => {
  const form = page.locator('[data-pedido="formulario"]');
  const interruptor = page.getByRole("switch", { name: /Rediseñar el calco/ });
  check("el rediseño dice su precio", (await interruptor.innerText()).includes(`+ ${ars(precio("rediseno"))}`));
  check("el textarea no está hasta prenderlo", (await page.locator('textarea[name="rediseno_pedido"]').count()) === 0);
  await tocar(interruptor);
  await page.locator('textarea[name="rediseno_pedido"]').fill("el logo nuevo, con fondo negro");
  check("prendido, suma al total", (await page.locator("[data-total-valor]").innerText()) === ars(precio("pack_400") + precio("rediseno")));

  check("la entrega arranca en retiro, sin cargo",
    (await page.locator('[data-entrega="retiro"]').getAttribute("aria-pressed")) === "true" &&
    (await page.locator('[data-entrega="retiro"]').innerText()).includes("Sin cargo · lo coordinamos por WhatsApp"));
  check("sin envío no se pide dirección", (await page.locator('input[name="direccion"]').count()) === 0);
  await tocar(page.locator('[data-entrega="envio"]'));
  check("el envío dice su precio y el plazo",
    (await page.locator('[data-entrega="envio"]').innerText()).includes(`+ ${ars(precio("envio"))} · Andreani, 2 a 5 días hábiles`));
  const sucursal = sql(`select coalesce(direccion, '') || '|' || coalesce(telefono, '') from sucursales where lubricentro_id = '${DEMO}' and activa order by created_at limit 1;`).split("|");
  check("la dirección llega precargada con la de la sucursal", (await page.locator('input[name="direccion"]').inputValue()) === sucursal[0], sucursal[0]);
  check("y el teléfono de contacto también", (await page.locator('input[name="telefono"]').inputValue()) === sucursal[1], sucursal[1]);
  // Si la sucursal del seed no los tiene, se escriben: son obligatorios.
  if (!sucursal[0]) await page.locator('input[name="direccion"]').fill("Av. Vélez Sarsfield 1480, Alta Gracia");
  if (!sucursal[1]) await page.locator('input[name="telefono"]').fill("351 555 0199");
  await page.locator('input[name="codigo_postal"]').fill("5186");
  const total = precio("pack_400") + precio("rediseno") + precio("envio");
  check("el total: pack + rediseño + envío", (await page.locator("[data-total-valor]").innerText()) === ars(total));
  const desglose = await page.locator("[data-total]").innerText();
  check("con sus tres renglones a la vista", desglose.includes("400 calcos") && desglose.includes("Rediseño") && desglose.includes("Envío a domicilio"), desglose);
  check("los tiempos que se prometen", /3 a 5 días hábiles desde que se acredita el pago/.test(await form.innerText()) && /hasta 7 en zonas alejadas/.test(await form.innerText()));
  check("la palabra «m²» no aparece", await sinM2(page));
  await capturar(page, "mi-cuenta-pedido-armado-390");
});

let p1 = null; // { id, numero, externalId, total }

await paso("«Confirmar y pagar» abre la pantalla de pago con su alias", async () => {
  const total = precio("pack_400") + precio("rediseno") + precio("envio");
  await tocar(page.getByRole("button", { name: "Confirmar y pagar" }));
  const pago = page.locator('[data-pago="esperando"]');
  await pago.waitFor({ timeout: 20_000 });
  const [id, numero, estado] = ultimo();
  p1 = { id, numero: Number(numero), externalId: `calcos:${id}`, total };
  check("el pedido nació sin pagar", estado === "pendiente_pago");
  check("con los montos congelados del catálogo",
    sql(`select monto_pack || '/' || monto_rediseno || '/' || monto_envio || '/' || monto_total from encargos_calcos where id = '${id}';`) ===
      `${precio("pack_400")}.00/${precio("rediseno")}.00/${precio("envio")}.00/${total}.00`);
  check("la orden quedó en cresium_ordenes del lado de calcos",
    sql(`select external_id || '|' || (suscripcion_id is null)::int || '|' || (periodo is null)::int || '|' || monto from cresium_ordenes where encargo_calcos_id = '${id}';`) === `calcos:${id}|1|1|${total}.00`);

  const texto = await pago.innerText();
  check("el título es el pedido", texto.includes(`Tu pedido ${numeroBonito(p1.numero)}`), texto.slice(0, 80));
  check("el desglose: pack, rediseño, envío y total",
    texto.includes("400 calcos") && texto.includes(ars(precio("pack_400"))) && texto.includes("Rediseño") &&
    texto.includes("Envío a domicilio") && texto.includes("Total a transferir") && texto.includes(ars(total)), texto);
  check("la vigencia", /Tenés 7 días para pagar/.test(texto));
  check("espera la transferencia", texto.includes("Esperando tu transferencia"));
  check("el formulario ya no está: es un pedido a la vez", (await page.locator('[data-pedido="formulario"]').count()) === 0);

  const alias = sql(`select alias from cresium_ordenes where encargo_calcos_id = '${id}';`);
  check("el alias es el de la orden, con forma de alias y 20 caracteres o menos",
    texto.includes(alias) && /^fm\.[a-z0-9]{1,8}\.[0-9a-f]{6}$/.test(alias) && alias.length <= 20, alias);
  check("y el CVU, de 22 dígitos", /\b\d{22}\b/.test(texto));
  check("la palabra «m²» no aparece", await sinM2(page));

  await tocar(page.getByRole("button", { name: "Copiar Alias" }));
  await page.getByRole("button", { name: "Copiar Alias" }).filter({ hasText: "Copiado" }).waitFor({ timeout: 3000 });
  check("«Copiar» copia el alias", (await page.evaluate(() => navigator.clipboard.readText())) === alias);
  await capturar(page, "pago-390");
});

await paso("la pantalla de la suscripción no se confunde con la orden de calcos", async () => {
  // El demo está bonificado: se le saca el descuento un momento para que
  // tenga pantalla de pago de suscripción.
  const sub = sql(`select id || '|' || descuento_pct from suscripciones where lubricentro_id = '${DEMO}' order by inicio desc, created_at desc limit 1;`).split("|");
  sql(`update suscripciones set descuento_pct = 0 where id = '${sub[0]}';`);
  try {
    const otra = await ctx.newPage();
    otra.setDefaultNavigationTimeout(45_000);
    await otra.goto(`${BASE}/panel/suscripcion`, { waitUntil: "networkidle" });
    const texto = await otra.locator("main").innerText();
    const alias = sql(`select alias from cresium_ordenes where encargo_calcos_id = '${p1.id}';`);
    check("no muestra el alias de los calcos", !texto.includes(alias), alias);
    check("y sigue ofreciendo pagar la suscripción", (await otra.getByRole("button", { name: "Quiero pagar" }).count()) === 1, texto.slice(0, 160));
    await otra.close();
  } finally {
    sql(`update suscripciones set descuento_pct = ${sub[1]} where id = '${sub[0]}';`);
  }
});

await paso("un depósito parcial dice cuánto entró y cuánto falta", async () => {
  await cresium.simularDeposito(p1.externalId, 50000, WEBHOOK);
  const pago = page.locator('[data-pago="esperando"]');
  await pago.getByText(`Recibimos ${ars(50000)}`).waitFor({ timeout: 12_000 });
  const texto = await pago.innerText();
  check("un depósito parcial dice cuánto entró", texto.includes(`Recibimos ${ars(50000)}`));
  check("y cuánto falta para completar el pedido, al mismo alias",
    texto.includes(`Faltan ${ars(p1.total - 50000)} para completar el pedido`) && texto.includes("se acumula sobre lo que ya mandaste"), texto.slice(-260));
  check("el pedido sigue sin pagar", sql(`select estado from encargos_calcos where id = '${p1.id}';`) === "pendiente_pago");
});

await paso("el depósito completo cambia la pantalla SOLA al éxito", async () => {
  const pagos = sql("select count(*) from pagos;");
  const t0 = Date.now();
  await cresium.simularDeposito(p1.externalId, p1.total - 50000, WEBHOOK);
  const exito = page.locator('[data-pago="pagado"]');
  await exito.waitFor({ timeout: 10_000 });
  const segundos = (Date.now() - t0) / 1000;
  check(`la pantalla cambia sola al éxito en menos de 10 s (${segundos.toFixed(1)} s)`, segundos < 10);
  const texto = await exito.innerText();
  check("el éxito dice qué se pagó y qué sigue",
    texto.includes("Tu pedido de 400 calcos está pagado.") && texto.includes("Arrancamos la producción: 3 a 5 días hábiles."), texto);
  check("y cuánto entró", texto.includes(`Recibimos ${ars(p1.total)}`), texto);
  check("con el tick", (await exito.locator("svg.tick").count()) === 1);
  check("el pedido quedó pagado en la base", sql(`select estado from encargos_calcos where id = '${p1.id}';`) === "pagado");
  check("sin una fila nueva en `pagos`: la plata de calcos no es MRR", sql("select count(*) from pagos;") === pagos);
  await capturar(page, "exito-390");
});

await paso("el mail de pago sale una vez, aunque Cresium reintente", async () => {
  // El mail sale DESPUÉS de contestarle a Cresium: se le da un momento.
  let mails = [];
  for (let i = 0; i < 20 && mails.length === 0; i++) {
    await page.waitForTimeout(250);
    mails = (await enviados()).filter((m) => /Recibimos tu pago/.test(m.subject ?? ""));
  }
  check("el mail de pago salió", mails.length === 1, `${mails.length}`);
  const m = mails[0] ?? {};
  check("al mail del owner", JSON.stringify(m.to ?? "").includes("demo@fidellimotors.app"), JSON.stringify(m.to));
  check("con el número del pedido y la cantidad",
    (m.subject ?? "") === `Recibimos tu pago del pedido ${numeroBonito(p1.numero)}` &&
    (m.text ?? "").includes(`Recibimos tu pago del pedido ${numeroBonito(p1.numero)}: 400 calcos.`), m.subject);
  check("sin «m²»", !/m²|\bm2\b/i.test((m.html ?? "") + (m.text ?? "")));
  check("y quedó marcado en el pedido", sql(`select mail_pago_at is not null from encargos_calcos where id = '${p1.id}';`) === "t");

  // Cresium reintenta la misma entrega: ni otro pago, ni otro mail.
  await cresium.simularDeposito(p1.externalId, 0, WEBHOOK, 2);
  await page.waitForTimeout(1500);
  check("el reintento de Cresium no manda otro",
    (await enviados()).filter((x) => /Recibimos tu pago/.test(x.subject ?? "")).length === 1);
});

await paso("el historial dice Pagado", async () => {
  const fila = page.locator(`[data-historial] [data-pedido="${p1.numero}"]`);
  check("el historial muestra el pedido como Pagado", (await fila.locator("[data-estado]").getAttribute("data-estado")) === "pagado");
  const texto = await fila.innerText();
  check("con qué lleva, el número, la fecha y el monto",
    texto.includes("400 calcos · rediseño · envío a domicilio") && texto.includes(numeroBonito(p1.numero)) && texto.includes(ars(p1.total)), texto);
  check("arriba a la derecha: entregadas y en camino",
    (await page.locator("[data-resumen]").innerText()) === `${ENTREGADAS_INICIAL} entregadas · 400 en camino`, await page.locator("[data-resumen]").innerText());
  await tocar(page.getByRole("button", { name: "Listo" }));
  await page.locator('[data-pedido="formulario"]').waitFor({ timeout: 5000 });
  check("«Listo» devuelve el formulario", true);
});

// ============================================================
// C · /fidelli lo despacha
// ============================================================
titulo("C · /fidelli lo despacha y el tenant lo sigue");

await paso("enviado con seguimiento: mail, y «En camino» para el tenant", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  await filaFidelli(p1.numero).waitFor({ timeout: 10_000 });
  check("la cola lo tiene pagado, con el pedido de rediseño a la vista",
    (await filaFidelli(p1.numero).locator("[data-estado]").getAttribute("data-estado")) === "pagado" &&
    (await filaFidelli(p1.numero).innerText()).includes("el logo nuevo, con fondo negro"));
  await filaFidelli(p1.numero).getByRole("button", { name: "En producción" }).click();
  await filaFidelli(p1.numero).locator('[data-estado="en_produccion"]').waitFor({ timeout: 10_000 });
  await filaFidelli(p1.numero).getByRole("button", { name: "Enviado" }).click();
  const dialogo = f.getByRole("dialog");
  await dialogo.locator('input[name="seguimiento"]').fill("1234 5678");
  await dialogo.getByRole("button", { name: "Marcar enviado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  await f.goto(`${BASE}/fidelli/calcos?estado=despachados`, { waitUntil: "networkidle" });
  await filaFidelli(p1.numero).locator('[data-estado="enviado"]').waitFor({ timeout: 10_000 });

  const mails = (await enviados()).filter((m) => /Salió tu pedido/.test(m.subject ?? ""));
  check("salió el mail de envío, una vez", mails.length === 1, `${mails.length}`);
  check("con el transportista, el seguimiento y el plazo",
    (mails[0]?.text ?? "").includes(`Salió tu pedido ${numeroBonito(p1.numero)} por Andreani, seguimiento 1234 5678, 2 a 5 días hábiles.`), mails[0]?.text);
  check("y quedó marcado", sql(`select mail_envio_at is not null from encargos_calcos where id = '${p1.id}';`) === "t");

  await page.goto(RUTA, { waitUntil: "networkidle" });
  const pill = page.locator(`[data-historial] [data-pedido="${p1.numero}"] [data-estado]`);
  check("el tenant ve «En camino» con el seguimiento",
    (await pill.getAttribute("data-estado")) === "enviado" && /^En camino · .*1234 5678$/.test(await pill.innerText()), await pill.innerText());
  await capturar(page, "historial-390");
});

await paso("entregado: el contador del tenant sube", async () => {
  const f = fidelli.page;
  await filaFidelli(p1.numero).getByRole("button", { name: "Entregado" }).click();
  const dialogo = f.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Marcar entregado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  check("el contador subió 400 en la base", entregadas() === ENTREGADAS_INICIAL + 400, `${entregadas()}`);

  await page.goto(RUTA, { waitUntil: "networkidle" });
  check("el tenant ve el contador nuevo", (await page.locator("[data-entregadas]").innerText()).trim() === String(ENTREGADAS_INICIAL + 400));
  check("y el pedido entregado, ya sin nada en camino",
    (await page.locator(`[data-historial] [data-pedido="${p1.numero}"] [data-estado]`).getAttribute("data-estado")) === "entregado" &&
    (await page.locator("[data-resumen]").innerText()) === `${ENTREGADAS_INICIAL + 400} entregadas`, await page.locator("[data-resumen]").innerText());
  check("lo entregado antes de esta pantalla también está en el historial",
    (await page.locator("[data-historial]").innerText()).includes(`${ENTREGADAS_INICIAL} calcos`) &&
    (await page.locator("[data-historial]").innerText()).includes("Entregas anteriores a esta pantalla"));
});

// ============================================================
// D · Plan y precios
// ============================================================
titulo("D · El catálogo se edita desde «Plan y precios»");

await paso("editar un pack con motivo cambia lo que ve el tenant, no lo ya pedido", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli/precios`, { waitUntil: "networkidle" });
  const bloque = f.locator("[data-precios-calcos]");
  check("«Plan y precios» tiene el bloque de calcos con sus siete filas", (await bloque.locator("[data-codigo]").count()) === 7);
  const fila = bloque.locator('[data-codigo="pack_200"]');
  check("con el precio, el costo y el m², que son de /fidelli",
    (await fila.locator("[data-precio]").innerText()) === ars(45000) && (await fila.locator("[data-costo]").innerText()) === ars(30000) &&
    (await fila.innerText()).includes("1 m²"), await fila.innerText());

  await fila.getByRole("button", { name: /Editar/ }).click();
  const dialogo = f.getByRole("dialog");
  await dialogo.locator('input[name="precio"]').fill("47000");
  await dialogo.getByRole("button", { name: "Guardar precio" }).click();
  check("sin motivo no se guarda", await dialogo.locator('textarea[name="motivo"]').evaluate((el) => !el.checkValidity()));
  await dialogo.locator('textarea[name="motivo"]').fill("sube la lista de octubre");
  await dialogo.getByRole("button", { name: "Guardar precio" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  await fila.locator("[data-precio]").filter({ hasText: ars(47000) }).waitFor({ timeout: 10_000 });
  check("el precio nuevo queda en la base", precio("pack_200") === 47000);
  check("con su fila de auditoría, motivo y autor",
    sql(`select c.motivo || '|' || (c.antes ->> 'precio_ars')::numeric::integer || '|' || (c.despues ->> 'precio_ars')::numeric::integer || '|' || u.rol from cambios_precio_calcos c join usuarios u on u.id = c.cambiado_por order by c.created_at desc limit 1;`) === "sube la lista de octubre|45000|47000|superadmin");
  check("y el cambio se lee en la pantalla", (await bloque.locator("[data-cambios]").innerText()).includes("sube la lista de octubre"));

  await page.goto(RUTA, { waitUntil: "networkidle" });
  check("el tenant ve el precio nuevo en el pack de 200", (await page.locator('[data-pack="pack_200"]').innerText()).includes(ars(47000)));
  check("y su pedido anterior no se movió",
    (await page.locator(`[data-historial] [data-pedido="${p1.numero}"]`).innerText()).includes(ars(p1.total)) &&
    sql(`select monto_total from encargos_calcos where id = '${p1.id}';`) === `${p1.total}.00`);
});

// ============================================================
// E · El vencimiento
// ============================================================
titulo("E · El pedido sin pagar vence a los 7 días");
let p2 = null;
let p3 = null;

await paso("vencido, deja de ofrecer su cuenta y se puede volver a pedir", async () => {
  await tocar(page.locator('[data-pack="pack_200"]'));
  await tocar(page.getByRole("button", { name: "Confirmar y pagar" }));
  await page.locator('[data-pago="esperando"]').waitFor({ timeout: 20_000 });
  const [id, numero] = ultimo();
  p2 = { id, numero: Number(numero), externalId: `calcos:${id}` };
  check("el pedido nuevo salió con el precio nuevo", sql(`select monto_total from encargos_calcos where id = '${id}';`) === "47000.00");

  // Ocho días después, sin que haya pasado el cierre diario.
  sql(`update encargos_calcos set created_at = now() - interval '8 days' where id = '${id}';`);
  await page.goto(RUTA, { waitUntil: "networkidle" });
  check("con más de 7 días, la pantalla ya no ofrece esa cuenta", (await page.locator("[data-pago]").count()) === 0 && (await page.locator('[data-pedido="formulario"]').count()) === 1);
  check("y el historial dice que venció",
    (await page.locator(`[data-historial] [data-pedido="${p2.numero}"] [data-estado]`).getAttribute("data-estado")) === "vencido");

  await tocar(page.locator('[data-pack="pack_200"]'));
  await tocar(page.getByRole("button", { name: "Confirmar y pagar" }));
  await page.locator('[data-pago="esperando"]').waitFor({ timeout: 20_000 });
  const [id3, numero3] = ultimo();
  p3 = { id: id3, numero: Number(numero3), externalId: `calcos:${id3}` };
  check("el tenant vuelve a pedir: es otro pedido", p3.id !== p2.id && p3.numero > p2.numero);
  check("y el viejo quedó vencido en la base", sql(`select estado from encargos_calcos where id = '${p2.id}';`) === "vencido");
});

await paso("si igual paga el vencido, el webhook lo acredita", async () => {
  await cresium.simularDeposito(p2.externalId, 47000, WEBHOOK);
  check("el vencido que se paga vuelve a pagado", sql(`select estado from encargos_calcos where id = '${p2.id}';`) === "pagado");
  check("y el pedido nuevo sigue esperando", sql(`select estado from encargos_calcos where id = '${p3.id}';`) === "pendiente_pago");
});

// ============================================================
// F · Reintentar
// ============================================================
titulo("F · Un pedido sin cuenta: Reintentar");

await paso("Reintentar genera la cuenta, con el sufijo del intento", async () => {
  // La orden se creó en Cresium y nuestra fila se perdió: el pedido queda
  // sin pagar y sin cuenta.
  sql(`delete from cresium_ordenes where encargo_calcos_id = '${p3.id}';`);
  await page.goto(RUTA, { waitUntil: "networkidle" });
  const sinCuenta = page.locator('[data-pago="sin-cuenta"]');
  await sinCuenta.waitFor({ timeout: 10_000 });
  check("sin cuenta, la pantalla lo dice y ofrece Reintentar",
    (await sinCuenta.innerText()).includes("Tu pedido quedó guardado") && (await sinCuenta.getByRole("button", { name: "Reintentar" }).count()) === 1);
  check("sin alias que copiar", (await sinCuenta.getByRole("button", { name: /Copiar/ }).count()) === 0);

  await tocar(sinCuenta.getByRole("button", { name: "Reintentar" }));
  await page.locator('[data-pago="esperando"]').waitFor({ timeout: 20_000 });
  const externo = sql(`select external_id from cresium_ordenes where encargo_calcos_id = '${p3.id}';`);
  // La referencia `calcos:<uuid>` ya existe en Cresium (regla 20): sale la :2.
  check("Reintentar genera la cuenta con la referencia del segundo intento", externo === `${p3.externalId}:2`, externo);

  await cresium.simularDeposito(externo, 47000, WEBHOOK);
  await page.locator('[data-pago="pagado"]').waitFor({ timeout: 10_000 });
  check("y un depósito a esa referencia paga el mismo pedido", sql(`select estado from encargos_calcos where id = '${p3.id}';`) === "pagado");
});

// ============================================================
// G · El cierre diario
// ============================================================
// En E el que vence el pedido es «Confirmar y pagar» (el tenant vuelve a
// pedir). Acá nadie vuelve a mirar: lo vence el cron, por la ruta de verdad.
titulo("G · El cierre diario vence el pedido que nadie volvió a mirar");
const CIERRE = `${BASE}/api/fidelli/cierre-diario`;
const estadoDe = (id) => sql(`select estado from encargos_calcos where id = '${id}';`);

await paso("la ruta del cron vence el pedido de más de 7 días", async () => {
  if (!env.CRON_SECRET) throw new Error("falta CRON_SECRET en .env.local");
  await page.goto(RUTA, { waitUntil: "networkidle" });
  await page.locator('[data-pedido="formulario"]').waitFor({ timeout: 10_000 });
  await tocar(page.locator('[data-pack="pack_200"]'));
  await tocar(page.getByRole("button", { name: "Confirmar y pagar" }));
  await page.locator('[data-pago="esperando"]').waitFor({ timeout: 20_000 });
  const [id4, numero4] = ultimo();
  check("hay un pedido nuevo sin pagar", id4 !== p3.id && estadoDe(id4) === "pendiente_pago");
  sql(`update encargos_calcos set created_at = now() - interval '8 days' where id = '${id4}';`);

  const sinSecreto = await fetch(CIERRE);
  check("sin el secreto del cron → 401, y el pedido sigue sin pagar",
    sinSecreto.status === 401 && estadoDe(id4) === "pendiente_pago", `${sinSecreto.status}`);

  // El vencimiento va ANTES del tipo de cambio y no depende de él: si hoy no
  // hay cotización el día no cierra (502) y los pedidos vencen igual. Por eso
  // lo que se mira siempre es la base, y la cuenta solo si la ruta dio 200.
  const r = await fetch(CIERRE, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  check("con el secreto, el pedido queda vencido en la base", estadoDe(id4) === "vencido", `${r.status} · ${estadoDe(id4)}`);
  if (r.status === 200) check("y la ruta dice que venció uno", (await r.json()).calcos_vencidos === 1);
  check("los pedidos pagados y el entregado no se tocaron",
    sql(`select string_agg(estado::text, ',' order by numero) from encargos_calcos where lubricentro_id = '${DEMO}' and id <> '${id4}';`) === "entregado,pagado,pagado");

  const otra = await fetch(CIERRE, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  if (otra.status === 200) check("corrida otra vez, no vence nada más", (await otra.json()).calcos_vencidos === 0);

  await page.goto(RUTA, { waitUntil: "networkidle" });
  check("el tenant vuelve a ver el formulario, y el historial dice que venció",
    (await page.locator('[data-pedido="formulario"]').count()) === 1 &&
      (await page.locator(`[data-historial] [data-pedido="${Number(numero4)}"] [data-estado]`).getAttribute("data-estado")) === "vencido");
});

// ============================================================
// H · Todos los dispositivos
// ============================================================
titulo("H · Todos los dispositivos");
for (const vista of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 900 }]) {
  const v = await abrir(vista, SESION_OWNER);
  await paso(`a ${vista.width}`, async () => {
    await v.page.goto(RUTA, { waitUntil: "networkidle" });
    await v.page.locator('[data-pedido="formulario"]').waitFor({ timeout: 10_000 });
    const desborde = await v.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${vista.width}: sin scroll horizontal`, desborde <= 0, `${desborde}px de más`);

    const filas = await v.page.locator("[data-pack]").evaluateAll((els) => {
      const tops = els.map((el) => Math.round(el.getBoundingClientRect().top));
      return tops.filter((t) => t === tops[0]).length;
    });
    const esperadas = vista.width < 640 ? 3 : 5;
    check(`${vista.width}: ${esperadas} packs por fila`, filas === esperadas, `${filas}`);

    await v.tocar(v.page.getByRole("switch", { name: /Rediseñar el calco/ }));
    await v.tocar(v.page.locator('[data-entrega="envio"]'));
    const chicos = await v.page.locator('[data-pedido="formulario"]').locator("button, input, textarea, [role=switch]").evaluateAll((els) =>
      els.filter((el) => el.type !== "hidden" && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44)
        .map((el) => `${(el.getAttribute("name") ?? el.textContent ?? "").trim().slice(0, 24)} (${Math.round(el.getBoundingClientRect().height)}px)`));
    check(`${vista.width}: todo lo que se toca mide 44px o más`, chicos.length === 0, chicos.join(", "));

    const visibles = await v.page.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      return [...document.querySelectorAll('[data-total], [data-pedido="formulario"] button[type="submit"]')]
        .every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= ancho + 0.5; });
    });
    check(`${vista.width}: el total y el botón entran en el ancho`, visibles);
    check(`${vista.width}: la palabra «m²» no aparece`, await sinM2(v.page));
    const rojos = await v.page.locator("[data-estado], [data-pack], [data-entrega]").evaluateAll((els) =>
      els.filter((el) => /rgb\(224, 31, 38\)/.test(getComputedStyle(el).color + getComputedStyle(el).backgroundColor + getComputedStyle(el).borderColor)).length);
    check(`${vista.width}: ningún estado ni selección en el rojo de marca`, rojos === 0);
    if (vista.width === 1280) {
      await v.page.locator('input[name="codigo_postal"]').fill("5186");
      await capturar(v.page, "mi-cuenta-pedido-armado-1280");
    }
  });
  await v.ctx.close();
}

await ctx.close();
await fidelli.ctx.close();
await navegador.close();
cresium.parar();
resend.parar();
fs.rmSync(TMP, { recursive: true, force: true });

console.log(fallas === 0 ? "\nTodo en verde." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
