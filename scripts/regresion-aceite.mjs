// El bloque «Aceite de motor» del cartón de service, y el papel que dice
// qué es (regla 13: una prueba que nunca se vio en rojo no existe — esta se
// vio en rojo sobre `develop`, sin la feature, y cada regla de los helpers
// se rompe sola acá abajo).
//
// Lo que cubre:
//   A · Los helpers, sin navegador: viscosidadDelNombre (lib/renglones.ts)
//       y aceitesMasUsados / chipsDeAceite / desdeMasUsados (lib/aceite.ts).
//       Y LAS ROTURAS: cada regla se rompe sobre una copia, se recompila y
//       la comprobación que la cubre tiene que fallar.
//   B · La pantalla, con Playwright, en 390×844 (táctil) y 1280×800: los
//       chips de los más usados, la viscosidad con «Otra», el aviso de
//       coherencia, el buscador en el flujo con «Quitar» y «+ Agregar “…”
//       al catálogo», el alta con el nombre precargado. Y una vez: guardar
//       y reabrir en edición, el taller sin aceites y el papel del cliente.
//   C · Todos los dispositivos (360, 390, 768, 820, 1280): cero scroll
//       horizontal, chips de 44px o más, nada del bloque cortado, la lista
//       que empuja lo de abajo.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-aceite.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-aceite.mjs
//     (además deja las capturas en docs/capturas/aceite/)
//
// TOCA DATOS DEL DEMO LOCAL por psql —dos aceites de prueba, el aceite de
// seis services del seed (la historia de uso), el catálogo apagado un
// rato— y LOS RESTAURA AL FINAL, pase lo que pase: el SQL de restauración
// se escribe en un archivo temporal apenas se sabe qué se tocó, corre en el
// `finally`, ante Ctrl-C, y al arrancar si quedó de una corrida que murió.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/aceite") : null;
const ARCHIVO_RESTAURAR = path.join(os.tmpdir(), "fm-regresion-aceite-restaurar.sql");

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ============================================================
// A · Los helpers
// ============================================================

// Sin chequeo de tipos ni resolución de imports: lib/renglones.ts importa
// solo un tipo (se borra) y lib/aceite.ts no importa nada.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-aceite-"));
  const salida = path.join(dir, path.basename(archivo).replace(/\.ts$/, ".js"));
  fs.writeFileSync(salida, outputText);
  return require(salida);
}

function revisarViscosidad(m) {
  const v = m.viscosidadDelNombre;
  if (typeof v !== "function") return [["viscosidadDelNombre existe", false, "no está en lib/renglones.ts"]];
  return [
    ["lee la viscosidad del nombre", v("Magnatec 5W30 Castrol") === "5W30"],
    ["la lee con el nombre armado «nombre · marca»", v("Quartz 7000 10W40 · Total") === "10W40"],
    ["la lee en minúscula y con guion", v("Elaion F50 5w-40") === "5W40"],
    ["la lee entre otras cifras", v("EDGE 5W30 X4L") === "5W30"],
    ["la lee aunque no sea de las once", v("Toyota 0W16") === "0W16"],
    ["sin viscosidad en el nombre, null", v("Limpia inyectores") === null && v("Aceite 2T") === null && v("SAE 40") === null],
    ["una cifra pegada a más números no es una viscosidad", v("Filtro 15W400") === null && v("X215W40") === null],
  ];
}

function revisarAceite(m) {
  const cat = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
  const ids = (lista) => lista.map((p) => p.id).join("");
  const filas = (texto) => [...texto].map((c) => ({ aceite_producto_id: c === "-" ? null : c }));
  return [
    ["más usados: del más usado al menos", igual(m.aceitesMasUsados(filas("abbccc")), ["c", "b", "a"])],
    ["más usados: el empate lo gana el que se usó último (la primera fila)", igual(m.aceitesMasUsados(filas("ba")), ["b", "a"])],
    ["más usados: las filas sin aceite no cuentan", igual(m.aceitesMasUsados(filas("-a--a-")), ["a"])],
    ["más usados: sin filas, vacío", igual(m.aceitesMasUsados([]), [])],
    ["chips: como mucho cuatro, los más usados primero", ids(m.chipsDeAceite(cat, ["f", "e", "d", "c", "b"], null)) === "fedc"],
    ["chips: sin historia, los primeros cuatro del catálogo", ids(m.chipsDeAceite(cat, [], null)) === "abcd"],
    ["chips: con poca historia, se completa con el catálogo", ids(m.chipsDeAceite(cat, ["e"], null)) === "eabc"],
    ["chips: con cuatro o menos en el catálogo, son todos", ids(m.chipsDeAceite(cat.slice(0, 3), ["c"], null)) === "cab"],
    ["chips: un más usado que ya no está en el catálogo se saltea", ids(m.chipsDeAceite(cat, ["z", "b"], null)) === "bacd"],
    ["chips: el elegido que no está entre los cuatro va al final", ids(m.chipsDeAceite(cat, [], "f")) === "abcdf"],
    ["chips: el elegido que ya está no se repite", ids(m.chipsDeAceite(cat, [], "b")) === "abcd"],
    ["chips: catálogo vacío, ninguno", m.chipsDeAceite([], ["a"], "a").length === 0],
    ["la ventana son 90 días de calendario", m.desdeMasUsados("2026-10-01") === "2026-07-03" && m.desdeMasUsados("2026-03-15") === "2025-12-15"],
  ];
}

titulo("A · Los helpers");
let hayHelpers = true;
for (const [nombre, ok, detalle] of revisarViscosidad(cargar("lib/renglones.ts"))) check(nombre, ok, detalle);
if (!fs.existsSync(path.join(RAIZ, "lib/aceite.ts"))) {
  hayHelpers = false;
  check("lib/aceite.ts existe", false, "no está: los más usados no existen en esta rama");
} else {
  for (const [nombre, ok, detalle] of revisarAceite(cargar("lib/aceite.ts"))) check(nombre, ok, detalle);
}

if (hayHelpers) {
  titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
  const ROTURAS = [
    ["lib/renglones.ts", revisarViscosidad, "la viscosidad sin el guion opcional",
      [["(\\d{1,2})W-?(\\d{2})", "(\\d{1,2})W(\\d{2})"]], "la lee en minúscula y con guion"],
    ["lib/renglones.ts", revisarViscosidad, "la viscosidad sin pasar el nombre a mayúsculas",
      [["nombre.toUpperCase().match(", "nombre.match("]], "la lee en minúscula y con guion"],
    ["lib/renglones.ts", revisarViscosidad, "la viscosidad sin los bordes de palabra",
      [["/\\b(\\d{1,2})W-?(\\d{2})\\b/", "/(\\d{1,2})W-?(\\d{2})/"]], "una cifra pegada a más números no es una viscosidad"],
    ["lib/aceite.ts", revisarAceite, "los más usados ordenados al revés",
      [["sort((a, b) => b[1] - a[1])", "sort((a, b) => a[1] - b[1])"]], "más usados: del más usado al menos"],
    ["lib/aceite.ts", revisarAceite, "los chips sin tope",
      [[".slice(0, MAX_CHIPS_ACEITE)", ""]], "chips: como mucho cuatro, los más usados primero"],
    ["lib/aceite.ts", revisarAceite, "los chips sin completar con el catálogo",
      [["[...usados, ...resto]", "[...(usados.length ? usados : resto)]"]], "chips: con poca historia, se completa con el catálogo"],
    ["lib/aceite.ts", revisarAceite, "el elegido se queda sin chip",
      [["if (elegido && !chips.includes(elegido)) chips.push(elegido);", ""]], "chips: el elegido que no está entre los cuatro va al final"],
    ["lib/aceite.ts", revisarAceite, "el elegido se repite",
      [["if (elegido && !chips.includes(elegido))", "if (elegido)"]], "chips: el elegido que ya está no se repite"],
    ["lib/aceite.ts", revisarAceite, "la ventana de 30 días",
      [["export const DIAS_MAS_USADOS = 90;", "export const DIAS_MAS_USADOS = 30;"]], "la ventana son 90 días de calendario"],
  ];
  for (const [archivo, revisar, nombre, reemplazos, esperada] of ROTURAS) {
    const rojas = revisar(cargar(archivo, reemplazos)).filter(([, ok]) => !ok).map(([n]) => n);
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

// Lo que la prueba tocó. El archivo de restauración se reescribe cada vez
// que cambia: si el proceso muere, la próxima corrida lo encuentra.
const tocado = { historia: [], productos: [], apagados: [], services: [] };
// Los aceites que se crean por la interfaz llevan esta marca: así se
// encuentran para borrarlos aunque no se haya llegado a anotar su id.
const MARCA_DE_PRUEBA = "Zzprueba";

function sqlDeRestauracion() {
  return [
    `update services set aceite_producto_id = null where id in (${lista(tocado.historia)});`,
    `update productos set activo = true where id in (${lista(tocado.apagados)});`,
    // Los services que cargó la prueba (sus renglones se van en cascada).
    `delete from services where id in (${lista(tocado.services)});`,
    `delete from productos where categoria = 'aceite' and marca = '${MARCA_DE_PRUEBA}';`,
    `delete from productos where id in (${lista(tocado.productos)});`,
  ].join("\n");
}
const anotar = () => fs.writeFileSync(ARCHIVO_RESTAURAR, sqlDeRestauracion());
let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
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

// Una corrida anterior que murió sin restaurar.
if (fs.existsSync(ARCHIVO_RESTAURAR)) {
  sql(fs.readFileSync(ARCHIVO_RESTAURAR, "utf8"));
  fs.rmSync(ARCHIVO_RESTAURAR);
  console.log("\n  ◦ se restauró lo que dejó una corrida anterior");
}

const LUB = sql("select id from lubricentros where slug = 'demo'");
// Y los aceites de prueba que hayan quedado sueltos (nunca se guardan en
// un service: se pueden borrar).
sql(`delete from productos where categoria = 'aceite' and marca = '${MARCA_DE_PRUEBA}';`);
const idDe = (nombre) => sql(`select id from productos where lubricentro_id = '${LUB}' and categoria = 'aceite' and nombre = '${nombre}'`);
const QUARTZ = idDe("Quartz 7000 10W40");
const HELIX = idDe("Helix HX7 10W40");

// Dos aceites más, para que el catálogo tenga más que chips: uno a granel
// (stock en litros, con litros sugeridos) y uno que queda solo en el
// buscador.
const crearAceite = (valores) => {
  const id = sql(`insert into productos (lubricentro_id, categoria, nombre, marca, unidad, stock, litros_sugeridos)
    values ('${LUB}', 'aceite', ${valores}) returning id;`);
  tocado.productos.push(id);
  anotar();
  return id;
};
const EDGE = crearAceite("'Edge 5W40', 'Castrol', 'litro', 40, 4");
crearAceite("'Semisintético 10W40', 'Valvoline', 'unidad', null, null");

// La historia de uso: seis services recientes del seed pasan a tener
// aceite. Edge ×3, Quartz ×2, Helix ×1.
tocado.historia = sql(`
  with elegidos as (
    select id, row_number() over (order by fecha desc, created_at desc) as n
    from services
    where lubricentro_id = '${LUB}' and tipo = 'service' and not anulado
      and aceite_producto_id is null and fecha >= current_date - 89
    order by fecha desc, created_at desc
    limit 6
  )
  update services s
     set aceite_producto_id = case when e.n <= 3 then '${EDGE}'::uuid when e.n <= 5 then '${QUARTZ}'::uuid else '${HELIX}'::uuid end
    from elegidos e where s.id = e.id
  returning s.id;`).split("\n").filter(Boolean);
anotar();

// Los chips que tienen que salir, en orden: los tres usados y el primero
// del catálogo que no se usó.
const CHIPS = ["Edge 5W40 · Castrol", "Quartz 7000 10W40 · Total", "Helix HX7 10W40 · Shell", "Elaion F50 15W40 · YPF"];
const SAE = ["0W20", "0W30", "5W20", "5W30", "5W40", "10W30", "10W40", "10W60", "15W40", "20W50", "25W60"];
// Lo que se escribe en el buscador y pasa a ser un aceite nuevo: uno por
// recorrido (el índice de productos no admite dos con el mismo nombre). En
// minúscula a propósito: así lo tipea un mecánico.
const NUEVO = { 390: "supreme 5w30", 1280: "xtreme 5w30" };

// ============================================================
// B y C · La pantalla
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
  if (tocado.historia.length !== 6) {
    throw new Error(`el seed tiene ${tocado.historia.length} services sin aceite en los últimos 90 días y hacen falta 6: supabase db reset`);
  }

  let sesion;
  {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', "demo@fidellimotors.app");
    await p.fill('input[name="password"]', "demo1234");
    await p.click('button[type="submit"]');
    await p.waitForURL("**/panel**", { timeout: 20_000 });
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
    page.setDefaultTimeout(4000);
    const tocar = (locator) => (tactil ? locator.tap() : locator.click());
    return { ctx, page, tocar };
  }

  // La ventana se estira al alto del documento: con fullPage (o con el
  // scroll de una captura de elemento) las barras fijas quedan estampadas
  // encima. `de` recorta a un elemento; sin él, la página entera.
  async function capturar(page, nombre, de = null) {
    if (!DIR_CAPTURAS) return;
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
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

  async function irAlCarton(page, patente, tipo = "Service") {
    await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
    await page.fill("#patente", patente);
    await page.click('a[href^="/panel/services/nuevo/"]', { timeout: 15_000 });
    await page.waitForSelector("#fecha", { timeout: 15_000 });
    await page.getByRole("button", { name: tipo, exact: true }).click();
  }

  const bloque = (page) => page.locator("[data-bloque-aceite]");
  const chips = (page) => page.locator("[data-aceite]");
  const chipPrendido = (page) => page.locator('[data-aceite][aria-pressed="true"]').allTextContents();
  const chipSae = (page, v) => page.getByRole("button", { name: v, exact: true });
  const saePrendidas = (page) =>
    page.locator('button[aria-pressed="true"]').evaluateAll(
      (els, sae) => els.map((e) => e.textContent.trim()).filter((t) => sae.includes(t)), SAE);
  const otra = (page) => page.locator("[data-viscosidad-otra]");
  const buscador = (page) => page.locator("#aceite-producto");
  const itemsDeLaLista = (page) => page.locator("#aceite-producto-lista > li").allTextContents();
  const revisar = (page) => page.getByRole("button", { name: "Revisar y confirmar" });
  const yDe = (locator) => locator.evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY));

  // Sección C: lo que tiene que valer en todos los anchos.
  async function revisarAncho(page, vista) {
    const w = vista.width;
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: window.innerWidth }));
    check(`${w}px · cero scroll horizontal`, m.scroll <= m.ancho, `scrollWidth ${m.scroll} > ${m.ancho}`);
    const medidas = await bloque(page).evaluate((b) => {
      const caja = b.getBoundingClientRect();
      const botones = [...b.querySelectorAll("button[aria-pressed]")].map((e) => {
        const r = e.getBoundingClientRect();
        return { texto: e.textContent.trim(), h: r.height, y: Math.round(r.top) };
      });
      const afuera = [...b.querySelectorAll("*")]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > caja.right + 0.5 || r.left < caja.left - 0.5); })
        .map((e) => e.tagName + (e.id ? "#" + e.id : ""));
      return { botones, afuera, ancho: caja.width };
    }).catch(() => null);
    check(`${w}px · los chips del bloque miden 44px o más`, medidas !== null && medidas.botones.length >= 12 && medidas.botones.every((b) => b.h >= 44),
      medidas ? medidas.botones.filter((b) => b.h < 44).map((b) => `${b.texto} ${b.h}`).join(", ") || `hay ${medidas.botones.length} chips` : "no existe el bloque nuevo");
    check(`${w}px · nada del bloque de aceite se sale ni se corta`, medidas !== null && medidas.afuera.length === 0, medidas?.afuera.slice(0, 5).join(", ") ?? "");
    if (medidas) {
      const filas = new Set(medidas.botones.map((b) => b.y)).size;
      console.log(`  ◦ ${w}px: ${medidas.botones.length} chips en ${filas} filas`);
      check(`${w}px · los chips envuelven solos`, filas > 1);
    }
  }

  // La lista del buscador va en el flujo: lo que sigue baja al abrirse y
  // vuelve a subir al cerrarse.
  async function revisarListaEnFlujo(page, tocar, w) {
    const sigue = page.locator("#renglones-carton");
    const cerrada = await yDe(sigue);
    await tocar(buscador(page));
    await page.locator("#aceite-producto-lista").waitFor();
    const abierta = await yDe(sigue);
    const posicion = await page.locator("#aceite-producto-lista").evaluate((e) => getComputedStyle(e).position);
    check(`${w} · 7 · la lista no flota: está en el flujo`, posicion === "static", `position: ${posicion}`);
    check(`${w} · 7 · al abrirse la lista, lo que sigue baja`, abierta > cerrada, `${cerrada} → ${abierta}`);
    // Tocar afuera la cierra (cuando el toque ya terminó).
    await tocar(page.getByText("Aceite de motor", { exact: true }));
    await page.locator("#aceite-producto-lista").waitFor({ state: "detached" });
    check(`${w} · 7 · al cerrarse, lo que sigue vuelve a subir`, (await yDe(sigue)) === cerrada, `${cerrada} → ${await yDe(sigue)}`);
  }

  // ---------- B · Los puntos 1 a 7, en 390 y en 1280 ----------
  const RECORRIDOS = [
    { vista: { width: 390, height: 844 }, patente: "ABC123" },
    { vista: { width: 1280, height: 800 }, patente: "XYZ789" },
  ];

  for (const { vista, patente } of RECORRIDOS) {
    const w = vista.width;
    titulo(`B · El bloque de aceite en ${w}×${vista.height} (${patente})`);
    const { ctx, page, tocar } = await abrir(vista);
    const nuevo = NUEVO[w];

    await paso(`${w} · 1 · el bloque recién abierto`, async () => {
      await irAlCarton(page, patente);
      check(`${w} · 1 · los chips son los más usados, en orden, y son 4`, igual(await chips(page).allTextContents(), CHIPS), (await chips(page).allTextContents()).join(" | ") || "ninguno");
      check(`${w} · 1 · ninguno prendido`, (await chips(page).count()) > 0 && (await chipPrendido(page)).length === 0);
      check(`${w} · 1 · «Los que más usás. El resto, abajo.»`, (await page.getByText("Los que más usás. El resto, abajo.").count()) === 1);
      check(`${w} · 1 · ningún <input> de viscosidad a la vista`, (await page.locator("#viscosidad").count()) === 0);
      const sae = await page.locator('[aria-labelledby="viscosidad-etiqueta"] button[aria-pressed]').allTextContents();
      check(`${w} · 1 · once chips SAE más «Otra», al final`, igual(sae, [...SAE, "Otra"]), sae.join(" ") || "sin el grupo de viscosidad");
      check(`${w} · 1 · ninguna viscosidad prendida`, (await saePrendidas(page)).length === 0);
      check(`${w} · 1 · «Otra» lleva el borde punteado`, (await otra(page).evaluate((e) => getComputedStyle(e).borderStyle).catch(() => "")) === "dashed");
      check(`${w} · 1 · el buscador dice «Nombre o marca…»`, (await buscador(page).getAttribute("placeholder")) === "Nombre o marca…");
      await revisarAncho(page, vista);
    });

    await paso(`${w} · 2 · tocar el primer aceite`, async () => {
      await tocar(chips(page).first());
      check(`${w} · 2 · queda prendido, y solo él`, igual(await chipPrendido(page), [CHIPS[0]]));
      check(`${w} · 2 · la viscosidad de su nombre queda prendida`, igual(await saePrendidas(page), ["5W40"]), (await saePrendidas(page)).join(" "));
      check(`${w} · 2 · descuenta por litros: aparece Litros con el sugerido`, (await page.locator("#aceite-litros").inputValue()) === "4");
      await capturar(page, `aceite-chip-tocado-${w}`, bloque(page));
    });

    await paso(`${w} · 3 · el aviso de coherencia`, async () => {
      const aviso = page.locator("[data-aviso-viscosidad]");
      check(`${w} · 3 · sin diferencia, no hay aviso`, (await aviso.count()) === 0);
      await tocar(chipSae(page, "10W40"));
      check(`${w} · 3 · con otra viscosidad, el aviso dice las dos`, ((await aviso.textContent()) ?? "").startsWith("Edge 5W40 es 5W40 y marcaste 10W40."), (await aviso.textContent().catch(() => "")) ?? "");
      check(`${w} · 3 · el aviso no pisa: sigue 10W40`, igual(await saePrendidas(page), ["10W40"]));
      const usar = aviso.getByRole("button", { name: "Usar 5W40" });
      check(`${w} · 3 · «Usar 5W40» mide 44px de alto`, ((await usar.boundingBox())?.height ?? 0) >= 44);
      if (w === 390) await capturar(page, "aceite-aviso-viscosidad-390", bloque(page));
      await tocar(usar);
      check(`${w} · 3 · «Usar 5W40» vuelve a la del producto`, igual(await saePrendidas(page), ["5W40"]));
      check(`${w} · 3 · y el aviso desaparece`, (await aviso.count()) === 0);
      // Tocar el prendido lo apaga; elegir otro con la viscosidad ya
      // cargada no la pisa.
      await tocar(chips(page).first());
      check(`${w} · 3 · tocar el prendido lo apaga (y Litros se va)`, (await chipPrendido(page)).length === 0 && (await page.locator("#aceite-litros").count()) === 0);
      await tocar(chips(page).nth(1));
      check(`${w} · 3 · elegir otro aceite con la viscosidad ya puesta no la pisa`, igual(await saePrendidas(page), ["5W40"]));
      check(`${w} · 3 · y avisa`, ((await aviso.textContent().catch(() => "")) ?? "").startsWith("Quartz 7000 10W40 es 10W40 y marcaste 5W40."));
      await tocar(chips(page).nth(1));
    });

    await paso(`${w} · 4 · «Otra»`, async () => {
      await tocar(otra(page));
      const campo = page.locator("#viscosidad");
      await campo.waitFor();
      check(`${w} · 4 · tocar «Otra» abre el campo, vacío y con el foco`, (await campo.inputValue()) === "" && (await campo.evaluate((e) => e === document.activeElement)));
      check(`${w} · 4 · con placeholder «Ej: 0W16»`, (await campo.getAttribute("placeholder")) === "Ej: 0W16");
      await page.keyboard.type("0w16");
      check(`${w} · 4 · lo escrito queda en mayúsculas`, (await campo.inputValue()) === "0W16");
      check(`${w} · 4 · «Otra» prendida y ninguna SAE`, (await otra(page).getAttribute("aria-pressed")) === "true" && (await saePrendidas(page)).length === 0);
      const caja = await campo.boundingBox();
      check(`${w} · 4 · el campo es angosto (200px como mucho)`, caja.width <= 200.5, `${caja.width}px`);
      await page.fill("#km", "999000");
      check(`${w} · 4 · con 0W16 el service se puede confirmar`, await revisar(page).isEnabled());
      await revisarAncho(page, vista);
    });

    await paso(`${w} · 5 · el buscador y el alta`, async () => {
      // Con la viscosidad vacía, para ver que el nombre nuevo la completa.
      await page.fill("#viscosidad", "");
      await buscador(page).fill("VALVOLINE");
      check(`${w} · 5 · el buscador también mira la marca`, (await itemsDeLaLista(page)).some((t) => t.startsWith("Semisintético 10W40 · Valvoline")), (await itemsDeLaLista(page)).join(" | "));
      await buscador(page).fill("semisintetico");
      check(`${w} · 5 · y busca sin tildes`, (await itemsDeLaLista(page)).some((t) => t.startsWith("Semisintético 10W40")));
      await buscador(page).fill("magnatec 5w30");
      check(`${w} · 5 · con una coincidencia exacta no ofrece agregarlo`, (await page.locator("[data-agregar-producto]").count()) === 0 && (await itemsDeLaLista(page)).length === 1);
      await buscador(page).fill(nuevo);
      const items = await itemsDeLaLista(page);
      check(`${w} · 5 · el último ítem es «+ Agregar “…” al catálogo»`, items.at(-1) === `+ Agregar “${nuevo}” al catálogo`, items.join(" | "));
      if (w === 390) await capturar(page, "aceite-buscador-agregar-390", bloque(page));
      await tocar(page.locator("[data-agregar-producto]"));
      const alta = page.locator("[data-alta-aceite]");
      await alta.waitFor();
      check(`${w} · 5 · el alta abre con el Nombre precargado`, (await page.locator("#alta-aceite-nombre").inputValue()) === nuevo);
      check(`${w} · 5 · y con el foco en Marca`, await page.locator("#alta-aceite-marca").evaluate((e) => e === document.activeElement));
      check(`${w} · 5 · los dos campos tienen label y ejemplo`,
        (await alta.locator('label[for="alta-aceite-nombre"]').textContent()) === "Nombre" &&
        (await alta.locator('label[for="alta-aceite-marca"]').textContent()) === "Marca" &&
        (await page.locator("#alta-aceite-nombre").getAttribute("placeholder")) === "Magnatec 5W30" &&
        (await page.locator("#alta-aceite-marca").getAttribute("placeholder")) === "Castrol");
      check(`${w} · 5 · el buscador quedó vacío: lo escrito se fue al alta`, (await buscador(page).inputValue()) === "");
      await page.locator("#alta-aceite-marca").fill(MARCA_DE_PRUEBA);
      await alta.getByRole("button", { name: "Agregar al catálogo" }).click();
      await alta.waitFor({ state: "detached", timeout: 15_000 });
      check(`${w} · 5 · al crear queda elegido, con su chip`, igual(await chipPrendido(page), [`${nuevo} · ${MARCA_DE_PRUEBA}`]), (await chipPrendido(page)).join(" | "));
      check(`${w} · 5 · y la viscosidad vacía se completa con la del nombre`, igual(await saePrendidas(page), ["5W30"]) && (await page.locator("#viscosidad").count()) === 0, (await saePrendidas(page)).join(" "));
    });

    await paso(`${w} · 6 · «Quitar»`, async () => {
      await tocar(buscador(page));
      const items = await itemsDeLaLista(page);
      check(`${w} · 6 · con un producto elegido, el primer ítem es «Quitar <nombre>»`, items[0] === `Quitar ${nuevo}`, items[0] ?? "sin lista");
      await tocar(page.locator("[data-quitar-producto]"));
      check(`${w} · 6 · quitarlo deja el service sin producto`, (await chipPrendido(page)).length === 0);
      await tocar(buscador(page));
      await page.locator("#aceite-producto-lista").waitFor();
      check(`${w} · 6 · sin producto, «Quitar» no existe y el primero es un producto`,
        (await page.locator("[data-quitar-producto]").count()) === 0 && !(await itemsDeLaLista(page))[0].startsWith("Quitar"));
      await page.keyboard.press("Tab");
      check(`${w} · 6 · con Tab se entra a la lista, que sigue abierta`,
        await page.evaluate(() => document.activeElement?.closest("#aceite-producto-lista") != null));
      await page.keyboard.press("Escape");
      check(`${w} · 6 · Escape cierra la lista`, (await page.locator("#aceite-producto-lista").count()) === 0);
    });

    await paso(`${w} · 7 · la lista en el flujo`, () => revisarListaEnFlujo(page, tocar, w));

    await ctx.close();
  }

  // ---------- Una vez, en 390: guardar, sin catálogo y el papel ----------
  titulo("B · Guardar y reabrir, el taller sin aceites y el papel (390×844)");
  {
    const vista = { width: 390, height: 844 };
    const { ctx, page, tocar } = await abrir(vista);

    async function guardarService(patente, km, elegir) {
      await irAlCarton(page, patente);
      await page.fill("#km", km);
      await elegir();
      await revisar(page).click();
      await page.getByRole("button", { name: "Confirmar service" }).click();
      await page.waitForURL("**/guardado", { timeout: 20_000 });
      const id = page.url().match(/services\/([0-9a-f-]{36})\/guardado/)?.[1];
      tocado.services.push(id);
      anotar();
      return id;
    }

    await paso("8 · guardar con producto y reabrir", async () => {
      const id = await guardarService("ABC123", "102300", async () => {
        try {
          await tocar(chips(page).nth(1));
        } catch {
          // Sin chips (la corrida sobre develop): la viscosidad a mano, para
          // llegar igual a la edición y al papel.
          check("8 · el chip de Quartz se puede tocar", false, "no hay chips; se sigue con la viscosidad sola");
          await tocar(chipSae(page, "10W40"));
        }
      });
      await page.goto(`${BASE}/panel/services/${id}/editar`, { waitUntil: "networkidle" });
      await page.waitForSelector("#km", { timeout: 15_000 });
      check("8 · en la edición, el chip del producto prendido", igual(await chipPrendido(page), ["Quartz 7000 10W40 · Total"]), (await chipPrendido(page)).join(" | ") || "ninguno");
      check("8 · y su viscosidad prendida, sin campo a la vista", igual(await saePrendidas(page), ["10W40"]) && (await page.locator("#viscosidad").count()) === 0);
    });

    await paso("8 · guardar con 0W16 y reabrir", async () => {
      const id = await guardarService("XYZ789", "80500", async () => {
        try {
          await tocar(otra(page));
        } catch {
          check("8 · «Otra» se puede tocar", false, "no existe; se escribe en el campo de siempre");
        }
        await page.fill("#viscosidad", "0W16");
      });
      await page.goto(`${BASE}/panel/services/${id}/editar`, { waitUntil: "networkidle" });
      await page.waitForSelector("#km", { timeout: 15_000 });
      check("8 · un service guardado con 0W16 abre con «Otra» prendida", (await otra(page).getAttribute("aria-pressed").catch(() => null)) === "true" && (await saePrendidas(page)).length === 0);
      const campo = page.locator("#viscosidad");
      check("8 · con el campo visible y el valor", (await campo.count()) === 1 && (await campo.inputValue()) === "0W16");
      check("8 · y sin robar el foco al abrir", !(await campo.evaluate((e) => e === document.activeElement)));
    });

    await paso("9 · el taller sin aceites", async () => {
      tocado.apagados = sql(`update productos set activo = false where lubricentro_id = '${LUB}' and categoria = 'aceite' and activo returning id;`).split("\n").filter(Boolean);
      anotar();
      await irAlCarton(page, "ABC123");
      check("9 · dice «Todavía no cargaste aceites.»", (await bloque(page).getByText("Todavía no cargaste aceites.").count()) === 1);
      check("9 · sin chips y sin buscador", (await chips(page).count()) === 0 && (await buscador(page).count()) === 0);
      const link = bloque(page).getByRole("button", { name: "+ Agregar el primero" });
      check("9 · con el link «+ Agregar el primero», de 44px", ((await link.boundingBox())?.height ?? 0) >= 44);
      await capturar(page, "aceite-sin-catalogo-390", bloque(page));
      await tocar(link);
      await page.locator("[data-alta-aceite]").waitFor();
      check("9 · el alta abre vacía, con el foco en Nombre", (await page.locator("#alta-aceite-nombre").inputValue()) === "" && (await page.locator("#alta-aceite-nombre").evaluate((e) => e === document.activeElement)));
      const primero = "Primero 10W40";
      await page.locator("#alta-aceite-nombre").fill(primero);
      await page.locator("#alta-aceite-marca").fill(MARCA_DE_PRUEBA);
      await page.locator("[data-alta-aceite]").getByRole("button", { name: "Agregar al catálogo" }).click();
      await page.locator("[data-alta-aceite]").waitFor({ state: "detached", timeout: 15_000 });
      check("9 · al crear el primero, el bloque toma su forma normal", igual(await chips(page).allTextContents(), [`${primero} · ${MARCA_DE_PRUEBA}`]) && (await buscador(page).count()) === 1);
      check("9 · elegido, y con su viscosidad", igual(await chipPrendido(page), [`${primero} · ${MARCA_DE_PRUEBA}`]) && igual(await saePrendidas(page), ["10W40"]));
      check("9 · el aviso de vacío se fue", (await bloque(page).getByText("Todavía no cargaste aceites.").count()) === 0);
    });
    // El catálogo vuelve ya, no al final: lo que sigue lo necesita.
    sql(`update productos set activo = true where id in (${lista(tocado.apagados)});`);
    tocado.apagados = [];
    anotar();

    await paso("10 · el papel dice qué es", async () => {
      await page.goto(`${BASE}/demo/ABC123`, { waitUntil: "networkidle" });
      const bajada = page.locator("p", { hasText: /^Service$/ }).first();
      check("10 · el papel del service dice «SERVICE» bajo el nombre",
        (await bajada.isVisible().catch(() => false)) && (await bajada.evaluate((e) => getComputedStyle(e).textTransform)) === "uppercase");
      check("10 · y ya no dice «Lubricentro»", (await page.locator("p", { hasText: /^Lubricentro$/ }).count()) === 0);
      await capturar(page, "papel-del-cliente-service-390");

      // La orden de trabajo de una mecánica, en la previsualización (es el
      // mismo papel que ve el cliente).
      await irAlCarton(page, "ABC123", "Mecánica");
      await page.fill("#trabajo", "Cambio de bujías");
      await revisar(page).click();
      check("10 · el de una mecánica sigue diciendo «ORDEN DE TRABAJO»", await page.locator("p", { hasText: /^Orden de trabajo$/ }).first().isVisible());

      const respuesta = await page.goto(`${BASE}/zz-taller-que-no-existe`, { waitUntil: "networkidle" });
      check("10 · un slug inexistente dice «No encontramos ese taller»", (await page.getByRole("heading", { name: "No encontramos ese taller" }).count()) === 1);
      check("10 · y manda al taller, no al lubricentro", (await page.getByText("preguntale al taller donde hiciste el service").count()) === 1);
      check("10 · con título «Taller no encontrado» y 404", (await page.title()).startsWith("Taller no encontrado") && respuesta.status() === 404, `${await page.title()} · ${respuesta.status()}`);
    });

    await ctx.close();
  }

  // ---------- C · Los otros anchos: 360, 768 y 820 ----------
  for (const vista of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }]) {
    const w = vista.width;
    titulo(`C · ${w}×${vista.height}`);
    const { ctx, page, tocar } = await abrir(vista);
    await paso(`${w} · el bloque`, async () => {
      await irAlCarton(page, "ABC123");
      await revisarAncho(page, vista);
      // Por nombre y no «el primero»: a esta altura el service guardado en
      // el punto 8 empató a Quartz con Edge, y el empate lo gana el más
      // reciente.
      await tocar(chips(page).filter({ hasText: "Edge 5W40" }));
      check(`${w}px · tocar un aceite completa viscosidad y litros`, igual(await saePrendidas(page), ["5W40"]) && (await page.locator("#aceite-litros").inputValue()) === "4");
      if (w === 820) await capturar(page, "aceite-chip-tocado-820", bloque(page));
      await tocar(otra(page));
      await page.locator("#viscosidad").waitFor();
      await page.keyboard.type("0w16");
      // Con «Otra» abierta, el aviso y los litros: el bloque en su forma
      // más cargada.
      await revisarAncho(page, vista);
      await revisarListaEnFlujo(page, tocar, w);
    });
    await ctx.close();
  }
} catch (e) {
  check("la prueba corrió hasta el final", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close().catch(() => {});
  restaurar();
}

console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);
