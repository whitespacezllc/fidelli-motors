// La orden de trabajo: los renglones de la mecánica son un teclado que
// escribe líneas en la descripción (regla 13: una prueba que nunca se vio
// en rojo no existe). Esta se vio en rojo tres veces: sobre `develop`, sin
// la feature (61 fallas: sin renglones escribe el texto a mano y sigue,
// para que los lectores fallen por lo suyo); con el `whitespace-pre-line`
// del papel sacado a mano (5 fallas: la previsualización y el papel del
// cliente); y cada regla del catálogo se rompe sola acá abajo.
//
// Lo que cubre:
//   A · El catálogo y los helpers de lib/renglones-mecanica.ts, sin
//       navegador: 42 renglones, 6 grupos, claves y frases únicas, toda
//       frase con 5 caracteres o más, los 4 compañeros del service y los 2
//       que se van con la gomería; alternar, reconocer y resumir.
//       Y LAS ROTURAS: cada regla se rompe sobre una copia del archivo, se
//       recompila y la comprobación que la cubre tiene que fallar.
//   B · La pantalla, con Playwright, en 390×844 (táctil) y 1280×800:
//       tocar escribe la línea y destocar la borra; escribir a mano no
//       mueve ningún botón; editar la línea de un renglón lo apaga; la
//       comparación es sin tildes ni mayúsculas; guardar → previsualización
//       → guardado → listado en una línea → papel del cliente en líneas →
//       edición con los renglones prendidos; la mecánica adjunta a un
//       service sin los cuatro compañeros.
//   C · Todos los dispositivos (360, 390, 768, 820, 1280): cero scroll
//       horizontal, botones de 44px o más que no se cortan ni cambian de
//       ancho al tocarlos, el textarea que crece hacia abajo, y tocar un
//       renglón no enfoca el textarea (no abre el teclado del celular).
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-orden-de-trabajo.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-orden-de-trabajo.mjs
//     (además deja las capturas en docs/capturas/orden-de-trabajo/)
//
// Guarda dos mecánicas de prueba en el demo local (una por viewport);
// `supabase db reset` las limpia. No toca nada fuera de local.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const TSC = path.join(RAIZ, "node_modules", ".bin", "tsc");
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS
  ? path.join(RAIZ, "docs/capturas/orden-de-trabajo")
  : null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ============================================================
// A · El catálogo y los helpers
// ============================================================

const ARCHIVO = "lib/renglones-mecanica.ts";

// Compila texto.ts + renglones-mecanica.ts (con reemplazos opcionales) a
// CommonJS en un temporal y devuelve el módulo. El «@/lib/texto» pasa a
// «./texto», que es lo que Node sabe resolver.
function compilar(reemplazos = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-orden-"));
  const src = path.join(dir, "src");
  fs.mkdirSync(src);
  fs.copyFileSync(path.join(RAIZ, "lib/texto.ts"), path.join(src, "texto.ts"));
  let fuente = fs
    .readFileSync(path.join(RAIZ, ARCHIVO), "utf8")
    .replace('"@/lib/texto"', '"./texto"');
  for (const [de, a] of reemplazos) {
    if (!fuente.includes(de)) throw new Error(`EL REEMPLAZO NO MORDIÓ: «${de}» no está en ${ARCHIVO}`);
    fuente = fuente.replace(de, a);
  }
  fs.writeFileSync(path.join(src, "renglones-mecanica.ts"), fuente);
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"),
    path.join(src, "texto.ts"), path.join(src, "renglones-mecanica.ts"),
  ], { stdio: "pipe" });
  return require(path.join(dir, "out", "renglones-mecanica.js"));
}

const COMPANEROS = ["aceite_caja", "bateria", "liquido_frenos", "refrigerante"];
const SOLO_SIN_GOMERIA = ["alineacion_balanceo", "rotacion_cubiertas"];
const GRUPOS = ["Frenos", "Suspensión y dirección", "Motor", "Embrague y caja", "Eléctrico", "General"];

// Cada comprobación con su nombre: la corrida normal espera todas en
// verde; cada rotura espera la suya en rojo.
function revisarCatalogo(m) {
  const R = m.RENGLONES_MECANICA;
  const claves = (lista) => lista.map((r) => r.clave).sort();
  const F = (clave) => R.find((r) => r.clave === clave).frase;
  const [pastillas, discos, bujias] = [F("pastillas_delanteras"), F("discos"), F("bujias")];
  const tres = `${pastillas}\n${discos}\n${bujias}`;
  return [
    ["son 42 renglones", R.length === 42, `hay ${R.length}`],
    ["son 6 grupos, en el orden de la pantalla", igual([...m.GRUPOS_MECANICA], GRUPOS)],
    ["cada renglón está en un grupo que existe y ningún grupo queda vacío",
      R.every((r) => GRUPOS.includes(r.grupo)) && GRUPOS.every((g) => R.some((r) => r.grupo === g))],
    ["los renglones de un grupo van juntos",
      igual(R.map((r) => r.grupo).filter((g, i, a) => g !== a[i - 1]), GRUPOS)],
    ["las claves son únicas y snake_case",
      new Set(R.map((r) => r.clave)).size === R.length && R.every((r) => /^[a-z]+(_[a-z]+)*$/.test(r.clave))],
    ["las frases son únicas al normalizar",
      new Set(R.map((r) => m.normalizarLinea(r.frase))).size === R.length],
    ["toda frase tiene 5 caracteres o más (un toque ya cumple el mínimo)",
      R.every((r) => r.frase.trim().length >= 5)],
    ["ninguna frase trae saltos ni espacios de más",
      R.every((r) => r.frase === r.frase.trim() && !/\n|\s{2}/.test(r.frase))],
    ["los 4 compañeros del service son los que son",
      igual(claves(R.filter((r) => r.companeroDeService)), COMPANEROS)],
    ["los 2 que se van con la gomería son los que son",
      igual(claves(R.filter((r) => r.soloSinGomeria)), SOLO_SIN_GOMERIA)],

    ["sin gomería y suelta se ven los 42",
      m.renglonesVisibles({ tieneGomeria: false, adjunta: false }).length === 42],
    ["con gomería se van alineación y rotación (40)", (() => {
      const v = m.renglonesVisibles({ tieneGomeria: true, adjunta: false });
      return v.length === 40 && !v.some((r) => SOLO_SIN_GOMERIA.includes(r.clave));
    })()],
    ["en la adjunta se van los 4 compañeros (38)", (() => {
      const v = m.renglonesVisibles({ tieneGomeria: false, adjunta: true });
      return v.length === 38 && !v.some((r) => COMPANEROS.includes(r.clave));
    })()],
    ["adjunta y con gomería: 36",
      m.renglonesVisibles({ tieneGomeria: true, adjunta: true }).length === 36],

    ["tocar sobre el texto vacío deja la frase sola", m.alternarFrase("", pastillas) === pastillas],
    ["tocar agrega la frase como ÚLTIMA línea",
      m.alternarFrase(`${pastillas}\nSe limpió el sensor de ABS`, bujias) ===
        `${pastillas}\nSe limpió el sensor de ABS\n${bujias}`],
    ["agregar no deja un renglón en blanco si el texto terminaba en salto",
      m.alternarFrase(`${pastillas}\n`, bujias) === `${pastillas}\n${bujias}`],
    ["destocar saca su línea y deja las otras tal cual",
      m.alternarFrase(tres, discos) === `${pastillas}\n${bujias}`],
    ["destocar saca TODAS las líneas iguales",
      m.alternarFrase(`${bujias}\n${pastillas}\ncambio de bujias`, bujias) === pastillas],
    ["destocar la única línea deja el texto vacío", m.alternarFrase(bujias, bujias) === ""],
    ["destocar colapsa los blancos que quedan pegados y recorta los extremos",
      m.alternarFrase(`${pastillas}\n\n${discos}\n\n${bujias}\n`, discos) === `${pastillas}\n\n${bujias}`],
    ["destocar no toca lo escrito a mano",
      m.alternarFrase(`Se limpió el sensor  de ABS\n${discos}\n  con sangría`, discos) ===
        "Se limpió el sensor  de ABS\n  con sangría"],

    ["reconoce la línea sin tildes y en minúscula", m.tieneFrase("algo\ncambio de bujias", bujias)],
    ["reconoce la línea con espacios de más", m.tieneFrase("  Cambio   de  bujías  ", bujias)],
    ["una línea que solo EMPIEZA con la frase no es la frase",
      !m.tieneFrase("Rectificación de discos delanteros", F("rectificacion_discos"))],
    ["la frase en el medio de otra línea no cuenta", !m.tieneFrase(`Hoy: ${bujias}`, bujias)],
    ["el texto vacío no tiene ninguna", !R.some((r) => m.tieneFrase("", r.frase))],

    ["lineasDe saca las vacías y recorta", igual(m.lineasDe(" a \n\n  \nb\r\nc"), ["a", "b", "c"])],
    ["en una línea: unidas con « · »", m.descripcionEnUnaLinea(`${pastillas}\n\n ${bujias} `) === `${pastillas} · ${bujias}`],
    ["en una línea: una sola queda igual", m.descripcionEnUnaLinea(pastillas) === pastillas],
    ["en una línea: null, undefined y vacío dan null",
      m.descripcionEnUnaLinea(null) === null && m.descripcionEnUnaLinea(undefined) === null &&
        m.descripcionEnUnaLinea("") === null && m.descripcionEnUnaLinea(" \n ") === null],
  ];
}

titulo("A · El catálogo y los helpers");
let catalogo = null;
if (!fs.existsSync(path.join(RAIZ, ARCHIVO))) {
  check(`${ARCHIVO} existe`, false, "no está: la orden de trabajo no existe en esta rama");
} else {
  catalogo = compilar();
  for (const [nombre, ok, detalle] of revisarCatalogo(catalogo)) check(nombre, ok, detalle);

  titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
  const ROTURAS = [
    ["una frase repetida en el catálogo",
      [['frase: "Cambio de discos de freno"', 'frase: "Rectificación  de discos"']],
      "las frases son únicas al normalizar"],
    ["un renglón de menos",
      [['  { clave: "revision_general", grupo: "General", etiqueta: "Revisión general", frase: "Revisión general" },\n', ""]],
      "son 42 renglones"],
    ["la batería deja de ser compañera del service",
      [['frase: "Cambio de batería", companeroDeService: true', 'frase: "Cambio de batería"']],
      "los 4 compañeros del service son los que son"],
    ["la adjunta muestra los compañeros",
      [["!(r.companeroDeService && opts.adjunta)", "true"]],
      "en la adjunta se van los 4 compañeros (38)"],
    ["la gomería no oculta nada",
      [["!(r.soloSinGomeria && opts.tieneGomeria)", "true"]],
      "con gomería se van alineación y rotación (40)"],
    ["la comparación deja de normalizar",
      [["lineasDe(texto).some((l) => normalizarLinea(l) === buscada)", "lineasDe(texto).some((l) => l === frase)"]],
      "reconoce la línea sin tildes y en minúscula"],
    ["los espacios internos no se colapsan",
      [['return normalizar(linea).replace(/\\s+/g, " ");', "return normalizar(linea);"]],
      "reconoce la línea con espacios de más"],
    ["la frase entra arriba en vez de al final",
      [["return base ? `${base}\\n${frase}` : frase;", "return base ? `${frase}\\n${base}` : frase;"]],
      "tocar agrega la frase como ÚLTIMA línea"],
    ["destocar deja los blancos pegados",
      [["if (enBlanco && anteriorEnBlanco) continue;", ""]],
      "destocar colapsa los blancos que quedan pegados y recorta los extremos"],
    ["destocar reescribe las demás líneas",
      [["quedan.push(linea);", "quedan.push(linea.trim());"]],
      "destocar no toca lo escrito a mano"],
    ["el resumen de una línea usa coma",
      [['lineasDe(texto).join(" · ") || null', 'lineasDe(texto).join(", ") || null']],
      "en una línea: unidas con « · »"],
    ["el resumen del vacío devuelve cadena vacía",
      [['lineasDe(texto).join(" · ") || null', 'lineasDe(texto).join(" · ")']],
      "en una línea: null, undefined y vacío dan null"],
  ];
  for (const [nombre, reemplazos, esperada] of ROTURAS) {
    const rojas = revisarCatalogo(compilar(reemplazos)).filter(([, ok]) => !ok).map(([n]) => n);
    check(`rota: ${nombre}`, rojas.includes(esperada),
      rojas.length ? `se pusieron en rojo otras: ${rojas.join(" | ")}` : "SE ESCAPÓ: ninguna comprobación la vio");
  }
}

// ============================================================
// B y C · La pantalla
// ============================================================

const FRASE = Object.fromEntries((catalogo?.RENGLONES_MECANICA ?? []).map((r) => [r.clave, r.frase]));
// Sin catálogo (la corrida sobre develop) las frases salen de acá, para
// que la pantalla se pruebe igual y falle por lo que le falta.
const f = (clave) => FRASE[clave] ?? {
  pastillas_delanteras: "Cambio de pastillas delanteras",
  rectificacion_discos: "Rectificación de discos",
  liquido_frenos: "Purga y cambio de líquido de frenos",
  bujias: "Cambio de bujías",
  kit_distribucion: "Cambio de kit de distribución",
  bomba_agua: "Cambio de bomba de agua",
}[clave];

// --lang: el <input type="date"> se dibuja con el idioma del NAVEGADOR, no
// con el del contexto. Sin esto las capturas dicen 10/01/2026 un 1° de
// octubre.
const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

// Una sola sesión del demo para todos los contextos.
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
    // Las fechas como las lee el taller: DD/MM/AAAA.
    locale: "es-AR",
    hasTouch: tactil,
    isMobile: tactil,
    storageState: sesion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  const tocar = (clave) => {
    const boton = page.locator(`[data-renglon="${clave}"]`);
    return tactil ? boton.tap() : boton.click();
  };
  return { ctx, page, tocar, tactil };
}

async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  // La pastilla del dev overlay de Next no es parte del producto.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  // La ventana se estira al alto del documento en vez de pedir fullPage:
  // con fullPage, la banda fija de «Revisar y confirmar» y la barra de
  // abajo del celular quedan estampadas en el medio de la captura.
  const vista = page.viewportSize();
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vista.width, height: alto });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`) });
  await page.setViewportSize(vista);
  console.log(`  ◦ captura ${nombre}.png`);
}

// El cartón de un vehículo del seed, con el tipo elegido.
async function irAlCarton(page, patente, tipo) {
  await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
  await page.fill("#patente", patente);
  await page.click('a[href^="/panel/services/nuevo/"]', { timeout: 15_000 });
  await page.waitForSelector("#fecha", { timeout: 15_000 });
  await page.getByRole("button", { name: tipo, exact: true }).click();
}

const prendidos = (page) =>
  page.locator('[data-renglon][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.dataset.renglon));
const texto = (page) => page.locator("#trabajo").inputValue();
const revisar = (page) => page.getByRole("button", { name: "Revisar y confirmar" });
// Las cajas en coordenadas de PÁGINA: tocar un renglón que está abajo del
// pliegue scrollea, y con las del viewport todo «se movería».
const cajas = (page) =>
  page.locator("[data-renglon]").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const d1 = (n) => Math.round(n * 10) / 10;
      return { clave: e.dataset.renglon, x: d1(r.x + window.scrollX), y: d1(r.y + window.scrollY), w: d1(r.width), h: r.height, cortado: e.scrollWidth > e.clientWidth };
    }));
const cajaTexto = (page) =>
  page.locator("#trabajo").evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { y: Math.round((r.y + window.scrollY) * 10) / 10, height: r.height };
  });

// El párrafo de «Trabajo realizado» del papel: cuántas líneas se VEN.
// Con white-space normal, dos frases cortas entran en una sola línea (o
// se parten donde caiga el ancho): por eso se mira además el white-space.
async function trabajoRealizado(raiz) {
  const p = raiz.locator("p", { hasText: /^Trabajo realizado$/ }).first().locator("xpath=following-sibling::p[1]");
  await p.waitFor({ timeout: 15_000 });
  return p.evaluate((el) => {
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const tops = new Set([...rango.getClientRects()].map((r) => Math.round(r.top)));
    return { lineas: tops.size, espacio: getComputedStyle(el).whiteSpace, texto: el.textContent };
  });
}

// La página pública del auto, sin sesión de por medio en lo que muestra:
// la mecánica es una entrada del historial. Cerrada, se resume en UNA
// línea; abierta, es el papel, con una línea por renglón.
async function papelDelCliente(page, patente, dos, etiqueta) {
  await page.goto(`${BASE}/demo/${patente}`, { waitUntil: "networkidle" });
  const entrada = page.locator("details", { has: page.locator("summary", { hasText: dos.join(" · ") }) }).first();
  check(`${etiqueta} · el historial del cliente resume la mecánica en una línea`, (await entrada.count()) === 1);
  await entrada.locator("summary").click();
  const papel = await trabajoRealizado(entrada);
  check(`${etiqueta} · el papel del cliente muestra «Trabajo realizado» en dos líneas`,
    papel.lineas === 2 && papel.espacio === "pre-line" && papel.texto === dos.join("\n"), JSON.stringify(papel));
  check(`${etiqueta} · la página del cliente no tiene scroll horizontal`,
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

// Sección 5 del prompt: lo que tiene que valer en TODOS los anchos.
async function revisarAncho(page, vista) {
  const medidas = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  check(`${vista.width}px · cero scroll horizontal`, medidas.scroll <= medidas.ancho, `scrollWidth ${medidas.scroll} > ${medidas.ancho}`);
  const botones = await cajas(page);
  const bajos = botones.filter((b) => b.h < 44);
  check(`${vista.width}px · todo renglón mide 44px de alto o más`, botones.length > 0 && bajos.length === 0,
    botones.length ? bajos.map((b) => `${b.clave} ${b.h}`).join(", ") : "no hay renglones");
  // 16px de margen por lado es el mínimo de la pantalla de carga.
  const anchos = botones.filter((b) => b.w > vista.width - 32 || b.x < 0 || b.x + b.w > vista.width + 0.5);
  check(`${vista.width}px · ningún renglón se sale de la pantalla`, botones.length > 0 && anchos.length === 0,
    anchos.map((b) => `${b.clave} ${b.w}`).join(", "));
  const cortados = botones.filter((b) => b.cortado || b.h > 60);
  check(`${vista.width}px · ninguna etiqueta se trunca ni se parte en dos líneas`, botones.length > 0 && cortados.length === 0,
    cortados.map((b) => b.clave).join(", "));
  const porFila = {};
  for (const b of botones) porFila[b.y] = (porFila[b.y] ?? 0) + 1;
  const maximo = Math.max(0, ...Object.values(porFila));
  console.log(`  ◦ ${vista.width}px: ${Object.keys(porFila).length} filas de renglones, hasta ${maximo} por fila`);
  return { botones, maximo };
}

// Tocar tres renglones: el ancho de cada botón y la posición de TODOS no
// cambian, el textarea crece hacia abajo y el foco no se va al texto.
async function tocarTresYMedir(page, tocar, vista) {
  const antes = await cajas(page);
  const taAntes = await cajaTexto(page).catch(() => null);
  for (const clave of ["pastillas_delanteras", "rectificacion_discos", "liquido_frenos"]) await tocar(clave);
  const despues = await cajas(page);
  const taDespues = await cajaTexto(page);
  const movidos = despues.filter((d, i) => !antes[i] || d.x !== antes[i].x || d.y !== antes[i].y || d.w !== antes[i].w);
  check(`${vista.width}px · tocar no cambia el ancho ni corre de lugar ningún renglón`, despues.length > 0 && movidos.length === 0,
    movidos.map((d) => d.clave).slice(0, 5).join(", "));
  check(`${vista.width}px · el textarea no salta: crece hacia abajo`,
    taAntes !== null && taDespues.y === taAntes.y && taDespues.height > taAntes.height,
    taAntes ? `y ${taAntes.y} → ${taDespues.y}, alto ${taAntes.height} → ${taDespues.height}` : "no había textarea");
  const foco = await page.evaluate(() => document.activeElement?.tagName ?? "");
  check(`${vista.width}px · tocar un renglón no enfoca el texto (no abre el teclado)`, foco !== "TEXTAREA" && foco !== "INPUT", `foco en ${foco}`);
}

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

// ---------- B · El recorrido completo, en 390 y en 1280 ----------
const RECORRIDOS = [
  { vista: { width: 390, height: 844 }, patente: "ABC123" },
  { vista: { width: 1280, height: 800 }, patente: "XYZ789" },
];
let seedConGomeria = false;
const guardados = [];

for (const { vista, patente } of RECORRIDOS) {
  titulo(`B · El recorrido en ${vista.width}×${vista.height} (${patente})`);
  const { ctx, page, tocar } = await abrir(vista);
  const w = vista.width;
  const tresFrases = [f("pastillas_delanteras"), f("rectificacion_discos"), f("liquido_frenos")];

  // 1 · La mecánica suelta, recién abierta.
  await paso(`${w} · 1 · abrir la mecánica`, async () => {
    await irAlCarton(page, patente, "Mecánica");
    seedConGomeria = (await page.getByRole("button", { name: "Neumáticos", exact: true }).count()) > 0;
    const esperados = 42 - (seedConGomeria ? 2 : 0);
    const grupos = await page.locator("[data-grupo-mecanica]").allTextContents();
    check(`${w} · 1 · hay 6 grupos, en orden`, igual(grupos, GRUPOS), grupos.join(" | ") || "ninguno");
    const claves = await page.locator("[data-renglon]").evaluateAll((els) => els.map((e) => e.dataset.renglon));
    check(`${w} · 1 · hay ${esperados} renglones`, claves.length === esperados, `hay ${claves.length}`);
    check(`${w} · 1 · en la mecánica suelta están los 4 compañeros del service`, COMPANEROS.every((c) => claves.includes(c)));
    check(`${w} · 1 · ninguno prendido`, (await prendidos(page)).length === 0 && claves.length > 0);
    check(`${w} · 1 · el textarea, vacío`, (await texto(page)) === "");
    check(`${w} · 1 · Revisar deshabilitado, con el mensaje`,
      (await revisar(page).isDisabled()) && (await page.getByText("Tocá un renglón o contá qué trabajo se hizo.").count()) === 1);
    await revisarAncho(page, vista);
  });

  // 2 · Tres toques.
  await paso(`${w} · 2 · tocar tres renglones`, async () => {
    await tocarTresYMedir(page, tocar, vista);
    check(`${w} · 2 · el textarea es exactamente las tres frases, en orden`, (await texto(page)) === tresFrases.join("\n"), JSON.stringify(await texto(page)));
    check(`${w} · 2 · los tres botones prendidos`, igual((await prendidos(page)).sort(), ["liquido_frenos", "pastillas_delanteras", "rectificacion_discos"]));
    check(`${w} · 2 · Revisar habilitado`, await revisar(page).isEnabled());
    await revisarAncho(page, vista);
    await capturar(page, `mecanica-tres-renglones-${w}`);
  });

  // 3 · Destocar.
  await paso(`${w} · 3 · destocar`, async () => {
    await tocar("pastillas_delanteras");
    check(`${w} · 3 · su línea desaparece y las otras dos quedan tal cual`, (await texto(page)) === tresFrases.slice(1).join("\n"));
    check(`${w} · 3 · dos prendidos`, (await prendidos(page)).length === 2);
  });

  // 4 · Escribir a mano no mueve ningún botón; lo tocado entra al final.
  await paso(`${w} · 4 · escribir a mano`, async () => {
    await page.fill("#trabajo", `${await texto(page)}\nSe limpió el sensor de ABS`);
    check(`${w} · 4 · escribir a mano: siguen dos prendidos`, (await prendidos(page)).length === 2);
    await tocar("bujias");
    check(`${w} · 4 · la frase de bujías entra DESPUÉS de la línea a mano`,
      (await texto(page)) === [...tresFrases.slice(1), "Se limpió el sensor de ABS", f("bujias")].join("\n"), JSON.stringify(await texto(page)));
  });

  // 5 · Editar la línea de un renglón lo apaga.
  await paso(`${w} · 5 · editar la línea de un renglón`, async () => {
    const editado = (await texto(page)).replace(f("rectificacion_discos"), "Rectificación de discos delanteros");
    await page.fill("#trabajo", editado);
    check(`${w} · 5 · rectificacion_discos se apaga`, !(await prendidos(page)).includes("rectificacion_discos"));
    check(`${w} · 5 · el texto queda como se escribió`, (await texto(page)) === editado);
  });

  // 6 · Sin tildes y en minúscula, el renglón se prende igual.
  await paso(`${w} · 6 · la línea escrita a mano prende su renglón`, async () => {
    await tocar("bujias");
    check(`${w} · 6 · bujías apagado antes de escribir`, !(await prendidos(page)).includes("bujias"));
    const base = await texto(page);
    await page.fill("#trabajo", `${base}\ncambio de bujias\nCAMBIO  DE BUJÍAS`);
    check(`${w} · 6 · «cambio de bujias» prende bujías`, (await prendidos(page)).includes("bujias"));
    await tocar("bujias");
    check(`${w} · 6 · tocarlo se lleva las líneas que coinciden, y nada más`, (await texto(page)) === base, JSON.stringify(await texto(page)));
  });

  // 7 · Vaciar; y diez toques seguidos.
  await paso(`${w} · 7 · vaciar`, async () => {
    await page.fill("#trabajo", "");
    check(`${w} · 7 · cero prendidos`, (await prendidos(page)).length === 0);
    check(`${w} · 7 · Revisar deshabilitado`, await revisar(page).isDisabled());
    await page.locator("#trabajo").blur();
    const diez = ["pastillas_delanteras", "discos", "bieletas", "rotulas", "extremos", "bujias", "correas", "embrague", "alternador", "escaneo"];
    for (const clave of diez) await tocar(clave);
    const foco = await page.evaluate(() => document.activeElement?.tagName ?? "");
    check(`${w} · 7 · diez toques seguidos: diez líneas, diez prendidos, sin teclado`,
      (await texto(page)).split("\n").length === 10 && (await prendidos(page)).length === 10 && foco !== "TEXTAREA");
    check(`${w} · 7 · el textarea crece hasta 8 renglones y no más`, (await page.locator("#trabajo").getAttribute("rows")) === "8");
    await page.fill("#trabajo", "");
    check(`${w} · 7 · vacío vuelve a 3 renglones`, (await page.locator("#trabajo").getAttribute("rows")) === "3");
  });

  // 8 · Guardar y seguir la descripción por todos sus lectores.
  let serviceId = null;
  const dos = [f("kit_distribucion"), f("bomba_agua")];
  await paso(`${w} · 8 · guardar`, async () => {
    try {
      await tocar("kit_distribucion");
      await tocar("bomba_agua");
    } catch {
      // Sin renglones (la corrida sobre develop) el texto se escribe a
      // mano y el recorrido sigue: así los LECTORES también se ven en rojo
      // por lo suyo, y no tapados por la falla de más arriba.
      check(`${w} · 8 · los dos renglones se pueden tocar`, false, "no hay renglones; se escribe a mano para seguir hasta los lectores");
      await page.fill("#trabajo", dos.join("\n"));
    }
    await revisar(page).click();
    const previa = await trabajoRealizado(page);
    check(`${w} · 8 · la previsualización muestra dos líneas`,
      previa.lineas === 2 && previa.espacio === "pre-line" && previa.texto === dos.join("\n"), JSON.stringify(previa));
    await page.getByRole("button", { name: "Confirmar trabajo" }).click();
    await page.waitForURL("**/guardado", { timeout: 20_000 });
    serviceId = page.url().match(/services\/([0-9a-f-]{36})\/guardado/)?.[1] ?? null;
    check(`${w} · 8 · la pantalla de guardado muestra la descripción, en una línea`,
      (await page.getByText(dos.join(" · ")).count()) > 0);
    await page.goto(`${BASE}/panel/services`, { waitUntil: "networkidle" });
    const fila = await page.locator(`a[href="/panel/services/${serviceId}"]`).first().textContent();
    check(`${w} · 8 · el listado muestra «frase 1 · frase 2» en una línea`, (fila ?? "").includes(dos.join(" · ")), fila ?? "sin fila");
    await papelDelCliente(page, patente, dos, `${w} · 8`);
    if (w === 390) await capturar(page, "papel-del-cliente-390");
    guardados.push({ patente, serviceId, dos });
  });

  // 9 · La edición corre sobre el texto guardado.
  await paso(`${w} · 9 · editar`, async () => {
    await page.goto(`${BASE}/panel/services/${serviceId}/editar`, { waitUntil: "networkidle" });
    await page.waitForSelector("#trabajo", { timeout: 15_000 });
    check(`${w} · 9 · en la edición, el texto guardado`, (await texto(page)) === dos.join("\n"));
    check(`${w} · 9 · en la edición, los dos renglones prendidos`, igual((await prendidos(page)).sort(), ["bomba_agua", "kit_distribucion"]));
    if (w === 390) await capturar(page, "edicion-390");
  });

  // 10 · La mecánica adjunta a un service: sin los cuatro compañeros.
  await paso(`${w} · 10 · la mecánica adjunta`, async () => {
    await irAlCarton(page, patente, "Service");
    check(`${w} · 10 · en el service, sin tildar la pregunta, no hay renglones`, (await page.locator("[data-renglon]").count()) === 0);
    await page.getByRole("switch", { name: /Se le hizo algo de mecánica/ }).click();
    await page.waitForSelector("#trabajo");
    const claves = await page.locator("[data-renglon]").evaluateAll((els) => els.map((e) => e.dataset.renglon));
    const esperados = 38 - (seedConGomeria ? 2 : 0);
    check(`${w} · 10 · la adjunta tiene ${esperados} renglones`, claves.length === esperados, `hay ${claves.length}`);
    check(`${w} · 10 · sin batería, líquido de frenos, refrigerante ni aceite de caja`,
      claves.length > 0 && !COMPANEROS.some((c) => claves.includes(c)));
    await tocar("pastillas_delanteras");
    await tocar("amortiguadores_delanteros");
    check(`${w} · 10 · en la adjunta tocar también escribe`,
      (await texto(page)) === [f("pastillas_delanteras"), "Cambio de amortiguadores delanteros"].join("\n"));
    await revisarAncho(page, vista);
    if (w === 390) await capturar(page, "mecanica-adjunta-a-un-service-390");
  });

  // 11 · Gomería: alineación y rotación no se ofrecen.
  if (seedConGomeria) {
    await paso(`${w} · 11 · gomería`, async () => {
      await irAlCarton(page, patente, "Mecánica");
      const claves = await page.locator("[data-renglon]").evaluateAll((els) => els.map((e) => e.dataset.renglon));
      check(`${w} · 11 · con gomería no están alineación ni rotación`, claves.length > 0 && !SOLO_SIN_GOMERIA.some((c) => claves.includes(c)));
    });
  }

  await ctx.close();
}

// ---------- C · Los otros anchos: 360, 768 y 820 ----------
for (const vista of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }]) {
  titulo(`C · ${vista.width}×${vista.height}`);
  const { ctx, page, tocar } = await abrir(vista);
  await paso(`${vista.width} · la mecánica`, async () => {
    await irAlCarton(page, "ABC123", "Mecánica");
    await revisarAncho(page, vista);
    await tocarTresYMedir(page, tocar, vista);
    await revisarAncho(page, vista);
    if (vista.width === 820) await capturar(page, "mecanica-tres-renglones-820");
  });
  if (vista.width === 360 && guardados[0]?.serviceId) {
    await paso("360 · el papel del cliente", () =>
      papelDelCliente(page, guardados[0].patente, guardados[0].dos, "360"));
  }
  await ctx.close();
}

await navegador.close();

if (!seedConGomeria) {
  console.log("\n  ◦ Paso 11 (gomería) NO corrió en pantalla: el seed no tiene ningún tenant con la feature");
  console.log("    'neumaticos'. La regla queda cubierta en la sección A (renglonesVisibles y su rotura).");
}
console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);
