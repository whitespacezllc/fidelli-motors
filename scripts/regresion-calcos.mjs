// Pedidos de calcos, PR 1: la solapa Calcos de la ficha, la cola de
// /fidelli/calcos y la alerta del hub, de punta a punta contra el stack
// local (regla 13: una prueba que nunca se vio en rojo no existe). Esta se
// vio en rojo sobre `develop`, antes de que existiera una sola pantalla: la
// solapa no estaba y todo lo que sigue fallaba por lo suyo.
//
// Lo que cubre:
//   A · Sin navegador: la comisión de Cresium de lib/calcos.ts es la de
//       comision_cresium() en la base (el número vive en los dos lados y
//       cambia en el mismo commit).
//   B · El diseño: subir un PNG crea la v1 y la marca actual, y la
//       miniatura sale del bucket PRIVADO por URL firmada; subir un PDF
//       crea la v2, la marca actual y la v1 queda; un archivo que dice ser
//       PNG y no lo es se rechaza, no deja versión ni archivo.
//   C · El pedido incluido con retiro: nace pagado; el hub lo anuncia
//       primero y en verde; la cola lo muestra arriba; avanza a en
//       producción (desde la cola), listo para retirar y entregado (desde
//       la ficha); entregado escribe en el libro y el contador sube.
//   D · El pedido incluido con envío: sin dirección no entra; con cantidad
//       editada; «Enviado» exige transportista y seguimiento; entregado
//       vuelve a subir el contador.
//   E · Un pedido cargado por error se cancela con su nota y no toca el
//       contador.
//   F · La cola filtra por estado y, sin nada por hacer, lo celebra.
//   H · Un pedido COMPRADO (lo crea la puerta del owner, por psql: la
//       pantalla del tenant es del PR 2): la cola lo muestra sin pagar con
//       su monto y su ganancia; «Marcar pagado a mano» exige la nota; y
//       pagarlo no escribe ni una fila en `pagos` (no es MRR). Después, la
//       cola con tres abiertos: los pagados primero y el más viejo arriba.
//   G · 390 y 1280: sin scroll horizontal de página, botones de 44px y
//       ningún estado en el rojo de marca.
//
// Requiere el stack local RECIÉN RESETEADO y el servidor de Next:
//   supabase db reset && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-calcos.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-calcos.mjs
//     (además deja las capturas en docs/capturas/calcos/)
//
// Deja en el demo local dos diseños, seis pedidos y dos entregas en el
// libro, que no se borra: `supabase db reset` es la limpieza. No toca nada
// fuera de local.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/calcos") : null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);

function sql(consulta) {
  return execFileSync(
    "docker",
    ["exec", "-i", process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: consulta, encoding: "utf8" },
  ).trim();
}

// Un paso que falla no corta la corrida: cuenta su falla y sigue, para que
// el rojo diga TODO lo que falta y no solo lo primero.
async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

// ============================================================
// Los archivos de prueba
// ============================================================

// Un PNG de verdad, de 5 × 8 (la proporción del calco), en el azul de la
// maqueta. Sin dependencias: cabecera + IHDR + IDAT + IEND.
function pngLiso(ancho, alto, [r, g, b]) {
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3).map((_, i) => [r, g, b][i % 3])]);
  const crudo = Buffer.concat(Array.from({ length: alto }, () => fila));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(crudo)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-calcos-"));
const ARCHIVO_PNG = path.join(TMP, "calco-v1.png");
const ARCHIVO_PDF = path.join(TMP, "calco-v2.pdf");
const ARCHIVO_FALSO = path.join(TMP, "no-es-un-png.png");
fs.writeFileSync(ARCHIVO_PNG, pngLiso(250, 400, [0x1f, 0x4e, 0x79]));
fs.writeFileSync(
  ARCHIVO_PDF,
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 142 227]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
fs.writeFileSync(ARCHIVO_FALSO, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");

// ============================================================
// A · La comisión, en los dos lados
// ============================================================
titulo("A · La comisión de Cresium");
{
  const fuente = fs.existsSync(path.join(RAIZ, "lib/calcos.ts"))
    ? fs.readFileSync(path.join(RAIZ, "lib/calcos.ts"), "utf8")
    : "";
  const enTs = fuente.match(/export const COMISION_CRESIUM = ([0-9.]+);/)?.[1] ?? null;
  let enSql = null;
  try {
    enSql = sql("select comision_cresium();");
  } catch {
    enSql = null;
  }
  check("lib/calcos.ts declara COMISION_CRESIUM", enTs !== null);
  check("la base tiene comision_cresium()", enSql !== null);
  check(
    "los dos números son el mismo (0,968 %)",
    enTs !== null && enSql !== null && Number(enTs) === Number(enSql) && Number(enTs) === 0.00968,
    `lib/calcos.ts dice ${enTs} y la base ${enSql}`,
  );
}

// ============================================================
// El estado de partida
// ============================================================
const DEMO = sql("select id from lubricentros where slug = 'demo';");
const NOMBRE_DEMO = sql("select nombre from lubricentros where slug = 'demo';");
const contador = () => Number(sql(`select calcos_entregadas from lubricentros where id = '${DEMO}';`));
const tabla = (nombre) => sql(`select to_regclass('public.${nombre}') is not null;`) === "t";
const enLaBase = (consulta) => (tabla("encargos_calcos") ? sql(consulta) : "");
const CONTADOR_INICIAL = contador();
const FICHA = `${BASE}/fidelli/${DEMO}?tab=calcos`;

if (tabla("encargos_calcos") && Number(sql(`select count(*) from encargos_calcos where lubricentro_id = '${DEMO}';`)) > 0) {
  console.log("\nEl demo ya tiene pedidos de calcos: esta prueba necesita la base recién reseteada (supabase db reset).");
  process.exit(1);
}

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

let sesion;
{
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', "santi@fidellimotors.app");
  await p.fill('input[name="password"]', "demo1234");
  await p.click('button[type="submit"]');
  await p.waitForURL("**/fidelli**", { timeout: 20_000 });
  sesion = await ctx.storageState();
  await ctx.close();
}

async function abrir(vista) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({
    viewport: vista,
    deviceScaleFactor: 2,
    locale: "es-AR",
    hasTouch: tactil,
    isMobile: tactil,
    storageState: sesion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  // La primera visita a una ruta en `next dev` la compila: puede tardar.
  page.setDefaultNavigationTimeout(45_000);
  return { ctx, page };
}

async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  // La ventana se estira al alto del documento en vez de pedir fullPage.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const vista = page.viewportSize();
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vista.width, height: Math.max(vista.height, alto) });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`) });
  await page.setViewportSize(vista);
}

// La fila de un pedido, por su número, en la tabla de la pantalla.
const fila = (page, numero) => page.locator(`[data-encargo="${numero}"]`);
const estadoDe = async (page, numero) =>
  (await fila(page, numero).locator("[data-estado]").getAttribute("data-estado").catch(() => null)) ?? "(sin fila)";
const ultimoNumero = () => enLaBase(`select coalesce(max(numero), 0) from encargos_calcos where lubricentro_id = '${DEMO}';`);
const numeroBonito = (n) => `#${String(n).padStart(4, "0")}`;

const { ctx, page } = await abrir({ width: 1280, height: 900 });

// ============================================================
// B · El diseño
// ============================================================
titulo("B · El diseño del calco");
await page.goto(FICHA, { waitUntil: "networkidle" });

await paso("la ficha tiene la solapa Calcos", async () => {
  const solapa = page.locator('nav[aria-label="Secciones de la ficha"] a', { hasText: "Calcos" });
  check("la ficha tiene la solapa Calcos", (await solapa.count()) === 1);
  check("y abre con ?tab=calcos", (await solapa.getAttribute("aria-current").catch(() => null)) === "page");
});

async function subirDiseno(archivo, nota) {
  await page.getByRole("button", { name: "Subir diseño" }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[type="file"]').setInputFiles(archivo);
  if (nota) await dialogo.locator('input[name="nota"]').fill(nota);
  await dialogo.getByRole("button", { name: "Subir diseño" }).click();
  return dialogo;
}

await paso("subir un PNG crea la v1 y la marca actual", async () => {
  const dialogo = await subirDiseno(ARCHIVO_PNG, null);
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  const v1 = page.locator('[data-diseno="1"]');
  await v1.waitFor({ timeout: 30_000 });
  check("subir un PNG crea la v1 y la marca actual", (await v1.getAttribute("data-actual")) === "si");
  const src = await v1.locator("img").getAttribute("src");
  check("la miniatura sale por URL firmada del bucket calcos", /\/storage\/v1\/object\/sign\/calcos\//.test(src ?? ""), src ?? "sin img");
  const firmada = await page.request.get(src);
  check("la URL firmada entrega el PNG", firmada.status() === 200 && /image\/png/.test(firmada.headers()["content-type"] ?? ""),
    `${firmada.status()} ${firmada.headers()["content-type"]}`);
  const publica = await page.request.get(src.replace("/object/sign/", "/object/public/").replace(/\?.*$/, ""));
  check("sin la firma, el archivo no se baja (el bucket es privado)", publica.status() >= 400, `status ${publica.status()}`);
});

await paso("subir un PDF crea la v2, la marca actual y la v1 queda", async () => {
  const dialogo = await subirDiseno(ARCHIVO_PDF, "con el logo nuevo");
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  const v2 = page.locator('[data-diseno="2"]');
  await v2.waitFor({ timeout: 30_000 });
  check("subir un PDF crea la v2 y la marca actual", (await v2.getAttribute("data-actual")) === "si");
  check("la v1 sigue en pantalla y ya no es la actual", (await page.locator('[data-diseno="1"]').getAttribute("data-actual")) === "no");
  check("la nota de la versión se lee", (await v2.textContent()).includes("con el logo nuevo"));
  check("en la base hay una sola actual", enLaBase(`select count(*) from disenos_calco where lubricentro_id = '${DEMO}' and actual;`) === "1");
});

await paso("un archivo que dice ser PNG y no lo es se rechaza", async () => {
  const dialogo = await subirDiseno(ARCHIVO_FALSO, null);
  const error = dialogo.getByRole("alert");
  await error.waitFor({ timeout: 15_000 });
  check("un archivo que dice ser PNG y no lo es se rechaza", /PNG o PDF/.test(await error.textContent()));
  check("y no deja ni versión ni archivo",
    enLaBase(`select count(*) from disenos_calco where lubricentro_id = '${DEMO}';`) === "2" &&
    enLaBase(`select count(*) from storage.objects where bucket_id = 'calcos' and name like '${DEMO}/%';`) === "2");
  await page.keyboard.press("Escape");
});

// ============================================================
// C · El pedido incluido, con retiro
// ============================================================
titulo("C · El pedido incluido en el plan, con retiro");
let n1 = null;

await paso("«+ Pedido incluido en el plan» crea un pedido pagado", async () => {
  await page.goto(FICHA, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "+ Pedido incluido en el plan" }).click();
  const dialogo = page.getByRole("dialog");
  check("la cantidad arranca en lo que incluye el plan (200)", (await dialogo.locator('input[name="cantidad"]').inputValue()) === "200");
  check("la entrega arranca en retiro", await dialogo.locator('input[name="entrega"][value="retiro"]').isChecked());
  await dialogo.getByRole("button", { name: "Cargar pedido" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  n1 = ultimoNumero();
  await fila(page, n1).waitFor({ timeout: 30_000 });
  check("«+ Pedido incluido en el plan» crea un pedido pagado", (await estadoDe(page, n1)) === "pagado");
  const texto = await fila(page, n1).textContent();
  check("la fila dice qué lleva", texto.includes(numeroBonito(n1)) && /200 calcos · incluidos en el plan · retiro/.test(texto), texto);
  check("y la ganancia y el m², que solo se ven acá", /m²/.test(texto) && /ganancia/.test(texto), texto);
  check("en la base: incluido, monto 0, diseño v2",
    enLaBase(`select e.incluido and e.monto_total = 0 and d.version = 2 from encargos_calcos e left join disenos_calco d on d.id = e.diseno_id where e.numero = ${n1};`) === "t");
});

await paso("el hub lo anuncia primero y en verde", async () => {
  await page.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
  const alertas = page.locator("section", { has: page.getByRole("heading", { name: "Alertas" }) }).locator("li");
  const primera = alertas.first();
  const texto = (await primera.textContent().catch(() => "")) ?? "";
  check("el hub lo anuncia primero", texto.includes("1 pedido de calcos pagado espera producción."), texto);
  const color = await primera.locator("span").first().evaluate((el) => getComputedStyle(el).color).catch(() => "");
  const verde = await page.evaluate(() => {
    const s = document.createElement("span");
    s.className = "text-success";
    document.body.append(s);
    const c = getComputedStyle(s).color;
    s.remove();
    return c;
  });
  check("y en verde: es trabajo que entró, no un problema", color === verde, `${color} vs ${verde}`);
  check("la alerta lleva a la cola", (await primera.locator("a").getAttribute("href").catch(() => null)) === "/fidelli/calcos");
  await capturar(page, "hub-1280");
});

await paso("la cola lo muestra y lo manda a producción", async () => {
  await page.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  check("la barra de /fidelli tiene Calcos", (await page.locator('header nav a[href="/fidelli/calcos"]').count()) === 1);
  await fila(page, n1).waitFor({ timeout: 30_000 });
  const texto = await fila(page, n1).textContent();
  check("la cola lo muestra con el nombre del lubricentro", texto.includes(NOMBRE_DEMO), texto);
  await fila(page, n1).getByRole("button", { name: "En producción" }).click();
  await fila(page, n1).locator('[data-estado="en_produccion"]').waitFor({ timeout: 30_000 });
  check("desde la cola pasa a en producción", true);
  check("produccion_at quedó escrito", enLaBase(`select produccion_at is not null from encargos_calcos where numero = ${n1};`) === "t");
});

await paso("sigue hasta entregado desde la ficha, y el contador sube", async () => {
  await page.goto(FICHA, { waitUntil: "networkidle" });
  check("con retiro, en producción ofrece «Listo para retirar» y no «Enviado»",
    (await fila(page, n1).getByRole("button", { name: "Listo para retirar" }).count()) === 1 &&
    (await fila(page, n1).getByRole("button", { name: "Enviado" }).count()) === 0);
  await fila(page, n1).getByRole("button", { name: "Listo para retirar" }).click();
  await fila(page, n1).locator('[data-estado="listo_retiro"]').waitFor({ timeout: 30_000 });
  check("el contador no se movió todavía", contador() === CONTADOR_INICIAL, `${contador()}`);

  await fila(page, n1).getByRole("button", { name: "Entregado" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Marcar entregado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  await fila(page, n1).locator('[data-estado="entregado"]').waitFor({ timeout: 30_000 });
  check("llega a entregado", true);
  check("un entregado no ofrece ninguna acción", (await fila(page, n1).getByRole("button").count()) === 0);
  check("el contador subió 200 en la base", contador() === CONTADOR_INICIAL + 200, `${CONTADOR_INICIAL} → ${contador()}`);
  const libro = page.locator("[data-libro]");
  const textoLibro = (await libro.textContent().catch(() => "")) ?? "";
  check("la ficha muestra el contador nuevo", textoLibro.includes(String(CONTADOR_INICIAL + 200)), textoLibro.slice(0, 160));
  check("y la entrega en el libro, con el número del pedido", textoLibro.includes(`Encargo ${numeroBonito(n1)}`), textoLibro.slice(0, 260));
});

// ============================================================
// D · El pedido incluido, con envío
// ============================================================
titulo("D · El pedido incluido, con envío a domicilio");
let n2 = null;

await paso("con envío pide dirección y teléfono", async () => {
  await page.goto(FICHA, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "+ Pedido incluido en el plan" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[name="cantidad"]').fill("400");
  await dialogo.locator('input[name="entrega"][value="envio"]').check();
  const direccion = dialogo.locator('input[name="direccion"]');
  await direccion.waitFor();
  await direccion.fill("");
  await dialogo.locator('input[name="telefono"]').fill("351 555 0123");
  await dialogo.getByRole("button", { name: "Cargar pedido" }).click();
  const invalido = await direccion.evaluate((el) => !el.checkValidity());
  check("con envío, sin dirección no entra", invalido && ultimoNumero() === String(n1));
  await direccion.fill("Av. Belgrano 480");
  await dialogo.locator('input[name="localidad"]').fill("Alta Gracia");
  await dialogo.locator('input[name="codigo_postal"]').fill("5186");
  await dialogo.locator('input[name="nota"]').fill("segunda tanda del alta");
  await dialogo.getByRole("button", { name: "Cargar pedido" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  n2 = ultimoNumero();
  await fila(page, n2).waitFor({ timeout: 30_000 });
  const texto = await fila(page, n2).textContent();
  check("la fila dice 400 calcos con envío y a dónde", /400 calcos · incluidos en el plan · envío a domicilio/.test(texto) && texto.includes("Av. Belgrano 480"), texto);
});

await paso("«Enviado» exige transportista y seguimiento", async () => {
  await fila(page, n2).getByRole("button", { name: "En producción" }).click();
  await fila(page, n2).locator('[data-estado="en_produccion"]').waitFor({ timeout: 30_000 });
  check("con envío, en producción ofrece «Enviado» y no «Listo para retirar»",
    (await fila(page, n2).getByRole("button", { name: "Enviado" }).count()) === 1 &&
    (await fila(page, n2).getByRole("button", { name: "Listo para retirar" }).count()) === 0);
  await fila(page, n2).getByRole("button", { name: "Enviado" }).click();
  const dialogo = page.getByRole("dialog");
  check("el transportista arranca en Andreani", (await dialogo.locator('input[name="transportista"]').inputValue()) === "Andreani");
  await dialogo.getByRole("button", { name: "Marcar enviado" }).click();
  const seguimiento = dialogo.locator('input[name="seguimiento"]');
  check("sin seguimiento no sale", await seguimiento.evaluate((el) => !el.checkValidity()));
  await seguimiento.fill("3600 0012 3456");
  await dialogo.getByRole("button", { name: "Marcar enviado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  await fila(page, n2).locator('[data-estado="enviado"]').waitFor({ timeout: 30_000 });
  const texto = await fila(page, n2).textContent();
  check("queda enviado, con el seguimiento a la vista", texto.includes("Andreani") && texto.includes("3600 0012 3456"), texto);
});

await paso("entregado vuelve a subir el contador", async () => {
  await fila(page, n2).getByRole("button", { name: "Entregado" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Marcar entregado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  await fila(page, n2).locator('[data-estado="entregado"]').waitFor({ timeout: 30_000 });
  check("el contador suma las dos entregas (200 + 400)", contador() === CONTADOR_INICIAL + 600, `${CONTADOR_INICIAL} → ${contador()}`);
  check("el libro tiene las dos, como incluidas y sin monto",
    enLaBase(`select count(*) from pedidos_calcos p join encargos_calcos e on e.pedido_calcos_id = p.id where e.lubricentro_id = '${DEMO}' and p.incluidas and p.monto_ars is null;`) === "2");
});

// ============================================================
// E · El pedido cargado por error
// ============================================================
titulo("E · Cancelar un incluido cargado por error");
let n3 = null;

await paso("se cancela con nota y no toca el contador", async () => {
  await page.getByRole("button", { name: "+ Pedido incluido en el plan" }).click();
  let dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Cargar pedido" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  n3 = ultimoNumero();
  await fila(page, n3).waitFor({ timeout: 30_000 });
  await fila(page, n3).getByRole("button", { name: "Cancelar" }).click();
  dialogo = page.getByRole("dialog");
  const nota = dialogo.locator('textarea[name="nota"]');
  await dialogo.getByRole("button", { name: "Cancelar el pedido" }).click();
  check("cancelar un pagado pide la nota", await nota.evaluate((el) => !el.checkValidity()));
  await nota.fill("se cargó dos veces el mismo pedido");
  await dialogo.getByRole("button", { name: "Cancelar el pedido" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  await fila(page, n3).locator('[data-estado="cancelado"]').waitFor({ timeout: 30_000 });
  check("queda cancelado", true);
  check("y el contador no se movió", contador() === CONTADOR_INICIAL + 600, `${contador()}`);
});

// ============================================================
// F · La cola
// ============================================================
titulo("F · La cola de /fidelli/calcos");
let n4 = null;

await paso("sin nada por hacer, lo celebra", async () => {
  await page.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  const cuerpo = await page.locator("main").textContent();
  check("sin nada por hacer, lo celebra", /Estás al día/.test(cuerpo), cuerpo.slice(0, 200));
  check("y los cerrados no aparecen en «por hacer»", (await page.locator("[data-encargo]").count()) === 0);
  await page.goto(`${BASE}/fidelli/calcos?estado=entregado`, { waitUntil: "networkidle" });
  check("el filtro de entregados trae los dos", (await page.locator("[data-encargo]").count()) === 2);
  await page.goto(`${BASE}/fidelli/calcos?estado=todos`, { waitUntil: "networkidle" });
  check("«Todos» trae los tres", (await page.locator("[data-encargo]").count()) === 3);
});

// ============================================================
// H · Un pedido comprado
// ============================================================
titulo("H · Un pedido comprado por el lubricentro");
let nb = null;

await paso("un pedido sin pagar se marca pagado a mano, con su nota", async () => {
  const pagosAntes = sql("select count(*) from pagos;");
  // La puerta del owner, como el owner del demo (la pantalla es del PR 2).
  sql(`
    begin;
    select set_config('request.jwt.claims', json_build_object(
      'sub', (select id from usuarios where lubricentro_id = '${DEMO}' and rol = 'owner' limit 1),
      'role', 'authenticated')::text, true);
    set local role authenticated;
    select crear_encargo_calcos(
      p_pack => 'pack_400', p_rediseno => true, p_rediseno_pedido => 'el logo nuevo, con fondo negro',
      p_entrega => 'envio', p_direccion => 'Av. Vélez Sarsfield 1480', p_localidad => 'Alta Gracia',
      p_codigo_postal => '5186', p_telefono => '351 555 0199');
    commit;`);
  nb = Number(ultimoNumero());

  await page.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
  const alertas = await page.locator("section", { has: page.getByRole("heading", { name: "Alertas" }) }).textContent();
  check("un pedido sin pagar no cuenta como «espera producción»", !/esperan? producción/.test(alertas), alertas.slice(0, 200));

  await page.goto(`${BASE}/fidelli/calcos?estado=pendiente_pago`, { waitUntil: "networkidle" });
  await fila(page, nb).waitFor({ timeout: 30_000 });
  const texto = await fila(page, nb).textContent();
  check("la cola lo muestra sin pagar, con lo que lleva", (await estadoDe(page, nb)) === "pendiente_pago" &&
    /400 calcos · rediseño · envío a domicilio/.test(texto) && texto.includes("el logo nuevo, con fondo negro"), texto);
  check("con el monto del catálogo y la ganancia (monto − costo − Cresium)",
    texto.includes("ARS 124.000") && texto.includes("ganancia ARS 52.799,68") && texto.includes("2 m²"), texto);

  await fila(page, nb).getByRole("button", { name: "Marcar pagado a mano" }).click();
  const dialogo = page.getByRole("dialog");
  const nota = dialogo.locator('textarea[name="nota"]');
  await dialogo.getByRole("button", { name: "Marcar pagado" }).click();
  check("pagar a mano pide la nota", await nota.evaluate((el) => !el.checkValidity()));
  await nota.fill("transfirió al CBU viejo, comprobante por WhatsApp");
  await dialogo.getByRole("button", { name: "Marcar pagado" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 30_000 });

  await page.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  await fila(page, nb).locator('[data-estado="pagado"]').waitFor({ timeout: 30_000 });
  check("queda pagado, con la nota a la vista", (await fila(page, nb).textContent()).includes("transfirió al CBU viejo"));
  check("pagarlo no escribió nada en `pagos`: la plata de calcos no es MRR", sql("select count(*) from pagos;") === pagosAntes);
});

await paso("con pedidos abiertos, primero los pagados y el más viejo arriba", async () => {
  // Dos más, para que la cola tenga qué ordenar: uno queda pagado y el otro
  // entra a producción (y se lo atrasa a mano, como postgres).
  for (const cantidad of ["200", "800"]) {
    await page.goto(FICHA, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "+ Pedido incluido en el plan" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.locator('input[name="cantidad"]').fill(cantidad);
    await dialogo.getByRole("button", { name: "Cargar pedido" }).click();
    await dialogo.waitFor({ state: "hidden", timeout: 30_000 });
  }
  n4 = Number(ultimoNumero());
  await fila(page, n4).getByRole("button", { name: "En producción" }).click();
  await fila(page, n4).locator('[data-estado="en_produccion"]').waitFor({ timeout: 30_000 });
  sql(`update encargos_calcos set produccion_at = now() - interval '10 days' where numero = ${n4};`);

  await page.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  const orden = await page.locator("[data-encargo]").evaluateAll((filas) => filas.map((f) => f.getAttribute("data-encargo")));
  check("con pedidos abiertos, primero los pagados y el más viejo arriba", orden.join(",") === `${nb},${n4 - 1},${n4}`, orden.join(","));
  const texto = await fila(page, n4).textContent();
  check("el que lleva más de 5 días hábiles en producción se marca atrasado", /Atrasado/.test(texto), texto);
  await capturar(page, "cola-1280");

  await page.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
  const alertas = await page.locator("section", { has: page.getByRole("heading", { name: "Alertas" }) }).textContent();
  check("el hub cuenta los dos pagados", alertas.includes("2 pedidos de calcos pagados esperan producción."), alertas.slice(0, 300));
  check("y suma la del atraso", alertas.includes("1 en producción hace más de 5 días hábiles."), alertas.slice(0, 300));

  await page.goto(FICHA, { waitUntil: "networkidle" });
  await capturar(page, "ficha-1280");
});

// ============================================================
// G · 390 y 1280
// ============================================================
titulo("G · Todos los anchos");
for (const vista of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  const { ctx: c, page: p } = await abrir(vista);
  for (const [nombre, url] of [["ficha", FICHA], ["cola", `${BASE}/fidelli/calcos`]]) {
    await paso(`${nombre} a ${vista.width}`, async () => {
      await p.goto(url, { waitUntil: "networkidle" });
      const desborde = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${nombre} a ${vista.width}: sin scroll horizontal de página`, desborde <= 0, `${desborde}px de más`);
      // Solo lo de calcos: la cabecera de la ficha es de otra pantalla.
      const chicos = await p.locator("[data-calcos] button, [data-calcos] a[class*='h-']").evaluateAll((els) =>
        els.filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44)
          .map((el) => `${el.textContent.trim()} (${Math.round(el.getBoundingClientRect().height)}px)`));
      check(`${nombre} a ${vista.width}: ningún botón por debajo de 44px`, chicos.length === 0, chicos.join(", "));
      const rojos = await p.locator("[data-estado]").evaluateAll((els) =>
        els.filter((el) => /rgb\(224, 31, 38\)/.test(getComputedStyle(el).color + getComputedStyle(el).backgroundColor + getComputedStyle(el).borderColor)).length);
      check(`${nombre} a ${vista.width}: ningún estado en el rojo de marca`, rojos === 0);
      if (vista.width === 390) await capturar(p, `${nombre}-390`);
    });
  }
  await c.close();
}

await ctx.close();
await navegador.close();
fs.rmSync(TMP, { recursive: true, force: true });

console.log(fallas === 0 ? "\nTodo en verde." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
