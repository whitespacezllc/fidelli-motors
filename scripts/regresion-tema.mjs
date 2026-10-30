// El modo oscuro del panel, de punta a punta en el navegador, contra el
// stack local (regla 13: una prueba que nunca se vio en rojo no existe —
// esta se vio en rojo sobre el front de `develop`, sin interruptor, y cada
// regla estática se rompe sola acá abajo).
//
// Lo que cubre:
//   A · Sin navegador: las reglas que viven en el código y no dan error
//       si se rompen. En globals.css: el bloque `[data-theme="claro"]`
//       existe y va DESPUÉS del oscuro (a igual especificidad gana el
//       último: es lo que mantiene claros los papeles adentro del panel
//       oscuro), el `@media print` vuelve a claro, y no hay
//       `prefers-color-scheme`. En los componentes: ningún `text-white`
//       sobre `bg-ink` (en oscuro la tinta es blanca), ningún velo
//       `bg-ink/…`, y las tres raíces de papel llevan `data-theme="claro"`.
//       Y LAS ROTURAS: cada regla se rompe sobre una copia del texto y la
//       comprobación que la cubre tiene que fallar.
//   B · El interruptor: a 1280 el sidebar lo tiene; tocarlo pinta el
//       wrapper en el acto, la base guarda `usuarios.tema`, y al recargar
//       el panel sale oscuro desde la sesión; el logotipo pasa al gris; el
//       lienzo (html) es grafito. A 390 vive en la hoja «Más». Y en
//       /fidelli, en la barra. Volver a claro deja todo como estaba.
//   C · LA LEGIBILIDAD, medida: en oscuro, a 1280 y a 390, en TODAS las
//       pantallas de /panel y de /fidelli (y en el diálogo de anular y la
//       hoja «Más»), cada texto visible se compara con el fondo efectivo
//       que tiene detrás (apilando los fondos con alfa desde el html) y
//       tiene que pasar AA (4,5:1; 3:1 para los grandes). Los controles
//       deshabilitados están exentos, como en WCAG.
//   D · Los papeles no se apagan: el cartón del detalle y el presupuesto
//       siguen blancos con tinta oscura dentro del panel oscuro, y en
//       impresión el panel entero vuelve a claro.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-tema.mjs
//   BASE_URL=http://localhost:3250 node --no-warnings scripts/regresion-tema.mjs
//   CAPTURAS=1 …   deja capturas de muestra en docs/capturas/tema-oscuro/
//   CAPTURAS_TODO=<dir> …   deja TODAS las pantallas en ese directorio
//
// TOCA DATOS DEL DEMO LOCAL —el tema del owner del demo y del superadmin—
// y LOS RESTAURA AL FINAL (vuelven a claro), pase lo que pase.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/tema-oscuro") : null;
const DIR_TODO = process.env.CAPTURAS_TODO || null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}

// ------------------------------------------------------------
titulo("A · Las reglas estáticas, y sus roturas");
const PAPELES = ['data-papel={nombrePapel ?? "service"}', 'data-papel="mecanica"', 'data-papel="neumaticos"'];
function revisarEstatico(css, componentes, papel) {
  // El bloque oscuro arranca con sus DOS selectores (el wrapper y el html).
  const iOscuro = css.indexOf('[data-theme="oscuro"],\nhtml:has([data-theme="oscuro"]) {\n  color-scheme: dark;');
  const iClaro = css.indexOf('[data-theme="claro"] {');
  const iPrint = css.indexOf("@media print");
  const papelOk = PAPELES.every((p) => {
    const i = papel.indexOf(p);
    return i >= 0 && papel.slice(i, i + 80).includes('data-theme="claro"');
  });
  return [
    ["globals.css tiene el bloque oscuro y el claro", iOscuro >= 0 && iClaro >= 0],
    ["el bloque claro va DESPUÉS del oscuro (los papeles ganan adentro del panel oscuro)", iClaro > iOscuro && iOscuro >= 0],
    ["en impresión el panel oscuro vuelve a claro", iPrint > iClaro && css.slice(iPrint).includes('[data-theme="oscuro"]') && css.slice(iPrint).includes("--color-base: #FFFFFF")],
    ["el lienzo sigue al panel oscuro (html:has)", /html:has\(\[data-theme="oscuro"\]\)\s*\{\s*background: #0A0A0A;/.test(css)],
    ["los tokens oscuros también en html:has (los portales de Radix heredan de ahí)", iOscuro >= 0],
    ["sin prefers-color-scheme en los estilos (en una regla, no en un comentario)", !/@media[^{]*prefers-color-scheme/.test(css)],
    ["los cuatro tokens nuevos existen en el tema", ["--color-fondo", "--color-velo", "--color-brillo", "--color-brand-texto"].every((t) => css.includes(`${t}:`))],
    ["ningún text-white sobre bg-ink en los componentes (en oscuro la tinta es blanca)", !/bg-ink[^"'`]*text-white|text-white[^"'`]*bg-ink/.test(componentes)],
    ["ningún velo bg-ink/… (en oscuro sería un velo blanco)", !/bg-ink\/\d/.test(componentes)],
    ["las tres raíces de papel llevan data-theme=\"claro\"", papelOk],
  ];
}
const CSS = leer("app/globals.css");
const COMPONENTES = ["components/ui/dialog.tsx", "components/panel/barra-mobile.tsx", "components/services/carton.tsx",
  "components/services/renglones-mecanica.tsx", "components/ui/segmentado.tsx", "components/vehiculos/selector-clase.tsx",
  "components/panel/modal-terminos.tsx", "components/ayuda/modal-video.tsx"].map(leer).join("\n");
const PAPEL = leer("components/services/carton-papel.tsx");
for (const [nombre, ok] of revisarEstatico(CSS, COMPONENTES, PAPEL)) check(nombre, ok);

titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
const ROTURAS = [
  ["el bloque claro borrado", (c) => c.replace('[data-theme="claro"] {', '[data-theme="borrado"] {'), null, null, "globals.css tiene el bloque oscuro y el claro"],
  ["el bloque oscuro borrado", (c) => c.replace('[data-theme="oscuro"],\nhtml:has([data-theme="oscuro"]) {\n  color-scheme: dark;', '[data-theme="borrado"] {\n  color-scheme: dark;'), null, null, "globals.css tiene el bloque oscuro y el claro"],
  ["el bloque claro movido ANTES del oscuro", (c) => {
    const a = c.indexOf('[data-theme="oscuro"],\nhtml:has([data-theme="oscuro"]) {'); const b = c.indexOf('[data-theme="claro"] {');
    const fin = c.indexOf("\n}\n", b) + 3; const claro = c.slice(b, fin);
    return c.slice(0, a) + claro + c.slice(a, b) + c.slice(fin);
  }, null, null, "el bloque claro va DESPUÉS del oscuro (los papeles ganan adentro del panel oscuro)"],
  ["la impresión sin volver a claro", (c) => c.replace(/@media print \{\n  \[data-theme="oscuro"\],\n  html:has\(\[data-theme="oscuro"\]\) \{[\s\S]*?\n  \}\n/, "@media print {\n"), null, null, "en impresión el panel oscuro vuelve a claro"],
  ["el lienzo que no sigue al panel", (c) => c.replace('html:has([data-theme="oscuro"]) {\n  background: #0A0A0A;', 'html:has([data-theme="oscuro"]) {\n  background: #FFFFFF;'), null, null, "el lienzo sigue al panel oscuro (html:has)"],
  ["los tokens oscuros solo en el wrapper (los diálogos salen blancos)", (c) => c.replace('[data-theme="oscuro"],\nhtml:has([data-theme="oscuro"]) {\n  color-scheme: dark;', '[data-theme="oscuro"] {\n  color-scheme: dark;'), null, null, "los tokens oscuros también en html:has (los portales de Radix heredan de ahí)"],
  ["un prefers-color-scheme colado", (c) => c + "\n@media (prefers-color-scheme: dark) { :root { --color-base: #000; } }\n", null, null, "sin prefers-color-scheme en los estilos (en una regla, no en un comentario)"],
  ["un text-white sobre bg-ink de vuelta", null, (k) => k.replace('bg-ink text-base"', 'bg-ink text-white"'), null, "ningún text-white sobre bg-ink en los componentes (en oscuro la tinta es blanca)"],
  ["el velo del diálogo de vuelta a ink/40", null, (k) => k.replace("bg-velo", "bg-ink/40"), null, "ningún velo bg-ink/… (en oscuro sería un velo blanco)"],
  ["el papel de la mecánica sin su claro", null, null, (p) => p.replace('data-papel="mecanica"\n      data-theme="claro"', 'data-papel="mecanica"'), "las tres raíces de papel llevan data-theme=\"claro\""],
];
for (const [nombre, rCss, rComp, rPapel, objetivo] of ROTURAS) {
  const css = rCss ? rCss(CSS) : CSS;
  const comp = rComp ? rComp(COMPONENTES) : COMPONENTES;
  const papel = rPapel ? rPapel(PAPEL) : PAPEL;
  if (css === CSS && comp === COMPONENTES && papel === PAPEL) { check(`rota: ${nombre}`, false, "LA ROTURA NO MORDIÓ"); continue; }
  const fila = revisarEstatico(css, comp, papel).find(([n]) => n === objetivo);
  check(`rota: ${nombre}`, fila && fila[1] === false, fila ? "la comprobación siguió en verde" : "no existe la comprobación");
}

// ------------------------------------------------------------
const LUB = sql("select id from lubricentros where slug = 'demo'");
const OWNER = sql(`select id from usuarios where lubricentro_id = '${LUB}' and rol = 'owner' order by created_at limit 1`);
const SUPER = sql("select id from usuarios where rol = 'superadmin' limit 1");
const IDS = JSON.parse(sql(`select json_build_object(
  'cliente', (select id from clientes where lubricentro_id = '${LUB}' order by created_at limit 1),
  'vehiculo', (select id from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada = 'ABC123'),
  'service', (select id from services where lubricentro_id = '${LUB}' and tipo = 'service' and not anulado order by created_at desc limit 1),
  'mecanica', (select id from services where lubricentro_id = '${LUB}' and tipo = 'mecanica' and not anulado order by created_at desc limit 1),
  'editable', (select id from services where lubricentro_id = '${LUB}' and not anulado and created_at > now() - interval '23 hours' order by created_at desc limit 1),
  'presupuesto', (select id from presupuestos where lubricentro_id = '${LUB}' order by created_at desc limit 1))`) || "{}");

const temaDe = (uid) => sql(`select tema from usuarios where id = '${uid}'`);
function restaurar() {
  try {
    sql(`update usuarios set tema = 'claro' where id in ('${OWNER}', '${SUPER}')`);
    console.log("\n  ◦ los dos usuarios vuelven a claro");
  } catch (e) {
    console.log(`\n  ✗ NO SE PUDO RESTAURAR el tema: ${String(e.message).split("\n")[0]}`);
    fallas++;
  }
}
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => { restaurar(); process.exit(1); });
sql(`update usuarios set tema = 'claro' where id in ('${OWNER}', '${SUPER}')`);

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
if (DIR_TODO) fs.mkdirSync(DIR_TODO, { recursive: true });

async function paso(nombre, fn) {
  try { await fn(); } catch (e) { check(nombre, false, String(e.message ?? e).split("\n")[0]); }
}

// El fondo efectivo detrás de cada texto, y el contraste WCAG. Corre en la
// página. Exentos: lo invisible, lo deshabilitado (como en WCAG) y lo que
// hereda una opacidad menor a 1 (un estado apagado a propósito).
const AUDITAR = `() => {
  const parse = (c) => { const m = (c || "").match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim())); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const comp = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat([1]);
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const fondoDe = (el) => {
    const cadena = []; for (let n = el; n; n = n.parentElement) cadena.push(n);
    let bg = [255, 255, 255, 1];
    for (const n of cadena.reverse()) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) bg = comp(c, bg); }
    return bg;
  };
  const ruta = (el) => { const partes = []; for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase(); if (n.id) s += "#" + n.id; const cl = (n.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
      if (cl) s += "." + cl; if (n.dataset && n.dataset.papel) s += "[papel=" + n.dataset.papel + "]"; partes.unshift(s); } return partes.join(" > "); };
  const malos = []; let total = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let nodo;
  while ((nodo = walker.nextNode())) {
    const texto = (nodo.textContent || "").replace(/\\s+/g, " ").trim(); if (!texto) continue;
    const el = nodo.parentElement; if (!el) continue;
    if (el.closest("script,style,noscript,.sr-only,[aria-hidden='true'],nextjs-portal")) continue;
    // Los papeles (data-theme="claro") no se miden acá: son el diseño claro
    // de siempre y la pregunta de esta prueba es el modo oscuro. Lo que el
    // papel tiene de gris sobre blanco (los renglones sin marcar, en
    // ink-40: 3,45:1) es una decisión del cartón físico y viene de antes.
    if (el.closest('[data-theme="claro"]')) continue;
    if (el.closest(":disabled,[aria-disabled='true'],[data-disabled]")) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
    const rect = el.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) continue;
    let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || "1"); if (op < 0.99) continue;
    const fg = parse(cs.color); if (!fg || fg[3] === 0) continue;
    const bg = fondoDe(el); const r = ratio(comp(fg, bg), bg);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    total++;
    if (r < min) malos.push({ texto: texto.slice(0, 48), fg: cs.color, bg: "rgb(" + bg.slice(0, 3).map(Math.round).join(",") + ")", ratio: Math.round(r * 100) / 100, size, min, ruta: ruta(el) });
  }
  return { total, malos };
}`;

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

async function abrir(vista, estado) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({ viewport: vista, deviceScaleFactor: 1, locale: "es-AR", hasTouch: tactil, isMobile: tactil, storageState: estado });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);
  return { ctx, page };
}

async function capturar(page, nombre, dir) {
  if (!dir) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await page.screenshot({ path: path.join(dir, `${nombre}.png`), fullPage: true });
}

const temaEnPantalla = (page) => page.locator("[data-tema-panel]").first().getAttribute("data-theme");
const esperarTema = async (uid, tema) => { for (let i = 0; i < 40 && temaDe(uid) !== tema; i++) await new Promise((r) => setTimeout(r, 250)); return temaDe(uid) === tema; };

let sesion = null;
let sesionFidelli = null;
try {
  sesion = await entrar("demo@fidellimotors.app");
  sesionFidelli = await entrar("santi@fidellimotors.app");

  // ------------------------------------------------------------
  titulo("B · El interruptor");
  await paso("el interruptor a 1280", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 }, sesion);
    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    check("el panel arranca en claro", (await temaEnPantalla(page)) === "claro");
    const logoNegro = page.locator('aside img[src*="negro_bordo"]');
    const logoGris = page.locator('aside img[src*="gris_bordo"]');
    check("en claro se ve el logotipo negro y no el gris", (await logoNegro.isVisible()) && !(await logoGris.isVisible()));
    const sw = page.locator("aside").getByRole("switch", { name: /Modo oscuro/ });
    check("el sidebar tiene el interruptor, apagado", (await sw.count()) === 1 && (await sw.getAttribute("aria-checked")) === "false");
    // El pie del sidebar es UNA fila (30/10/2026): «Cerrar sesión» como
    // texto y los dos accesos como íconos; mide menos de 64 px y los tres
    // siguen ahí. Y el menú no queda tapado: el último ítem («Ayuda») se
    // puede ver con scroll dentro del nav, no debajo del pie.
    const pie = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      const boton = Array.from(aside.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar sesión");
      const fila = boton?.closest("form")?.parentElement;
      const r = fila?.getBoundingClientRect();
      const ayuda = Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.trim() === "Ayuda");
      ayuda?.scrollIntoView({ block: "nearest" });
      const ra = ayuda?.getBoundingClientRect();
      return { alto: r ? Math.round(r.height) : null, whatsapp: Boolean(fila?.querySelector('a[aria-label="Ayuda por WhatsApp"]')),
        interruptor: Boolean(fila?.querySelector('[role="switch"]')), ayudaVisible: ra ? ra.bottom <= (r?.top ?? 0) + 1 : null };
    });
    check("el pie del sidebar es una sola fila (< 64 px) con Cerrar sesión, el WhatsApp y el modo oscuro",
      pie.alto != null && pie.alto < 64 && pie.whatsapp && pie.interruptor, JSON.stringify(pie));
    check("el último ítem del menú («Ayuda») no queda tapado por el pie", pie.ayudaVisible === true, JSON.stringify(pie));
    check("los enlaces legales ya no están en el sidebar", (await page.locator("aside").getByRole("link", { name: "Términos" }).count()) === 0);
    await sw.click();
    check("tocarlo pinta el panel oscuro en el acto", (await temaEnPantalla(page)) === "oscuro");
    check("y la base guarda la preferencia", await esperarTema(OWNER, "oscuro"), `usuarios.tema = ${temaDe(OWNER)}`);
    await page.reload({ waitUntil: "networkidle" });
    check("al recargar sale oscuro desde la sesión", (await temaEnPantalla(page)) === "oscuro");
    check("en oscuro se ve el logotipo gris y no el negro", (await logoGris.isVisible()) && !(await logoNegro.isVisible()));
    const htmlBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    check("el lienzo es grafito (lo que asoma al rebotar)", htmlBg === "rgb(10, 10, 10)", htmlBg);
    const esquema = await page.evaluate(() => getComputedStyle(document.querySelector("[data-tema-panel]")).colorScheme);
    check("los controles nativos siguen al oscuro (color-scheme: dark)", esquema === "dark", esquema);
    await capturar(page, "inicio-oscuro-1280", DIR_CAPTURAS);
    await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    const enCuenta = page.getByRole("switch", { name: /Modo oscuro/ });
    check("Mi cuenta tiene el interruptor, prendido, con su explicación",
      (await enCuenta.count()) >= 1 && (await enCuenta.first().getAttribute("aria-checked")) === "true" &&
        (await page.getByText("Se guarda en tu cuenta").count()) === 1);
    check("y los enlaces legales, al pie", (await page.getByRole("link", { name: "Términos" }).count()) === 1 && (await page.getByRole("link", { name: "Privacidad" }).count()) === 1);
    await ctx.close();
  });
  await paso("el interruptor a 390, en la hoja «Más»", async () => {
    const { ctx, page } = await abrir({ width: 390, height: 844 }, sesion);
    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    check("a 390 el panel sale oscuro (la preferencia es de la persona, no del dispositivo)", (await temaEnPantalla(page)) === "oscuro");
    await page.getByRole("button", { name: "Más", exact: true }).tap();
    const sw = page.getByRole("dialog").getByRole("switch", { name: /Modo oscuro/ });
    check("la hoja «Más» tiene el interruptor, prendido", (await sw.count()) === 1 && (await sw.getAttribute("aria-checked")) === "true");
    // La hoja (30/10/2026): cada acceso con su ícono, en dos columnas, con
    // Calcos y Ayuda, y las dos salidas con ícono. Sin los enlaces legales.
    const hoja = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      const accesos = Array.from(d.querySelectorAll("nav a, nav [aria-disabled]"));
      const salidas = Array.from(d.querySelectorAll("a, button")).filter((e) => /Ayuda por WhatsApp|Cerrar sesión/.test(e.textContent));
      const columnas = getComputedStyle(d.querySelector("nav")).gridTemplateColumns.split(" ").length;
      return { accesos: accesos.length, conIcono: accesos.filter((a) => a.querySelector("svg")).length, columnas,
        nombres: accesos.map((a) => a.textContent.trim()), salidasConIcono: salidas.filter((e) => e.querySelector("svg")).length, legales: d.textContent.includes("Términos") };
    });
    check("cada acceso de la hoja lleva su ícono, en dos columnas", hoja.accesos >= 9 && hoja.conIcono === hoja.accesos && hoja.columnas === 2, JSON.stringify(hoja));
    check("la hoja tiene Calcos, Mi cuenta y Ayuda", ["Calcos", "Mi cuenta", "Ayuda"].every((n) => hoja.nombres.includes(n)), hoja.nombres.join(" · "));
    check("las dos salidas (WhatsApp y cerrar sesión) llevan ícono y los enlaces legales se fueron a Mi cuenta", hoja.salidasConIcono === 2 && !hoja.legales, JSON.stringify(hoja));
    await capturar(page, "mas-oscuro-390", DIR_CAPTURAS);
    await sw.tap();
    check("apagarlo vuelve a claro en el acto", (await temaEnPantalla(page)) === "claro");
    check("y la base vuelve a claro", await esperarTema(OWNER, "claro"));
    await sw.tap();
    check("prenderlo de nuevo", (await temaEnPantalla(page)) === "oscuro" && (await esperarTema(OWNER, "oscuro")));
    await ctx.close();
  });
  await paso("el interruptor de /fidelli", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 }, sesionFidelli);
    await page.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
    check("/fidelli arranca en claro", (await temaEnPantalla(page)) === "claro");
    const sw = page.locator("header").getByRole("switch", { name: /Modo oscuro/ });
    check("la barra tiene el botón", (await sw.count()) === 1);
    await sw.click();
    check("y pinta /fidelli oscuro en el acto", (await temaEnPantalla(page)) === "oscuro");
    check("y la base guarda la preferencia del superadmin", await esperarTema(SUPER, "oscuro"));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("C · La legibilidad, medida en oscuro");
  const RUTAS_PANEL = [
    "/panel", "/panel/proximos", "/panel/clientes", `/panel/clientes/${IDS.cliente}`, "/panel/services",
    "/panel/services?tipo=mecanica", "/panel/services/nuevo", `/panel/services/nuevo/${IDS.vehiculo}`,
    `/panel/services/${IDS.service}`, `/panel/services/${IDS.mecanica}`, `/panel/services/${IDS.service}/editar`,
    `/panel/services/${IDS.service}/guardado`, "/panel/productos", "/panel/fidelizacion", "/panel/presupuestos",
    "/panel/presupuestos/nuevo", IDS.presupuesto ? `/panel/presupuestos/${IDS.presupuesto}` : null, "/panel/experiencia",
    "/panel/experiencia/calcos", "/panel/mensajes", "/panel/sucursales", "/panel/suscripcion", "/panel/cuenta",
    "/panel/cuenta?tab=plan", "/panel/cuenta?tab=negocio", "/panel/cuenta/calcos", "/panel/ayuda",
  ].filter(Boolean);
  const RUTAS_FIDELLI = [
    "/fidelli", "/fidelli/lubricentros", `/fidelli/${LUB}`, `/fidelli/${LUB}?tab=suscripcion`, `/fidelli/${LUB}?tab=datos`,
    `/fidelli/${LUB}?tab=configuracion`, `/fidelli/${LUB}?tab=calcos`, "/fidelli/calcos", "/fidelli/cobranzas",
    "/fidelli/crecimiento", "/fidelli/cuenta", "/fidelli/nuevo", "/fidelli/pauta", "/fidelli/precios",
  ];
  // La muestra que queda en el repo es chica a propósito (son PNG de página
  // entera): tres pantallas a 1280. Todo lo demás va a CAPTURAS_TODO.
  const MUESTRA = new Set(["/panel/proximos", `/panel/services/nuevo/${IDS.vehiculo}`, "/fidelli"]);
  const nombreDe = (ruta, w) => ruta.replace(/^\//, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "id").replace(/[\/?=]+/g, "-") + `-${w}`;

  async function auditar(page, ruta, w, extra = "") {
    const { total, malos } = await page.evaluate(`(${AUDITAR})()`);
    check(`${w} · ${ruta}${extra} · ${total} textos, todos legibles`, total > 0 && malos.length === 0,
      total === 0 ? "no se midió ningún texto" : malos.slice(0, 6).map((m) => `«${m.texto}» ${m.fg} sobre ${m.bg} = ${m.ratio} (${m.size}px, mín ${m.min}) en ${m.ruta}`).join("\n        "));
    return malos;
  }

  for (const [quien, estado, rutas] of [["panel", sesion, RUTAS_PANEL], ["fidelli", sesionFidelli, RUTAS_FIDELLI]]) {
    for (const w of [1280, 390]) {
      await paso(`${quien} a ${w}`, async () => {
        const { ctx, page } = await abrir({ width: w, height: w < 768 ? 844 : 800 }, estado);
        for (const ruta of rutas) {
          await paso(`${w} · ${ruta}`, async () => {
            await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 60_000 });
            if ((await temaEnPantalla(page)) !== "oscuro") { check(`${w} · ${ruta} · en oscuro`, false, `data-theme = ${await temaEnPantalla(page)}`); return; }
            await auditar(page, ruta, w);
            const nombre = nombreDe(ruta, w);
            await capturar(page, nombre, DIR_TODO);
            if (DIR_CAPTURAS && w === 1280 && MUESTRA.has(ruta)) await capturar(page, nombre, DIR_CAPTURAS);
          });
        }
        // El diálogo de anular y, a 390, la hoja «Más»: capas encima del panel.
        if (quien === "panel") {
          // El diálogo vive en un trabajo todavía editable (un fijado no tiene
          // el botón): el más nuevo de las últimas 23 horas, del tipo que sea.
          await paso(`${w} · el diálogo de anular`, async () => {
            if (!IDS.editable) { check(`${w} · el diálogo de anular`, false, "no hay ningún trabajo editable en el demo: cargá uno (o corré regresion-orden-de-trabajo.mjs) y volvé a correr"); return; }
            await page.goto(`${BASE}/panel/services/${IDS.editable}`, { waitUntil: "networkidle" });
            const anular = page.getByRole("button", { name: "Anular service" });
            await anular.click();
            await page.getByRole("dialog").waitFor();
            await auditar(page, `/panel/services/${IDS.editable}`, w, " (diálogo de anular abierto)");
            if (DIR_CAPTURAS && w === 1280) await capturar(page, "anular-oscuro-1280", DIR_CAPTURAS);
            await page.keyboard.press("Escape");
          });
          if (w === 390) {
            await paso("390 · la hoja «Más»", async () => {
              await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
              await page.getByRole("button", { name: "Más", exact: true }).tap();
              await page.getByRole("dialog").waitFor();
              await auditar(page, "/panel", w, " (hoja «Más» abierta)");
            });
          }
        }
        await ctx.close();
      });
    }
  }

  // ------------------------------------------------------------
  titulo("D · Los papeles no se apagan");
  await paso("los papeles", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 }, sesion);
    await page.goto(`${BASE}/panel/services/${IDS.service}`, { waitUntil: "networkidle" });
    const papel = await page.evaluate(() => {
      const p = document.querySelector("[data-papel]"); if (!p) return null;
      const cs = getComputedStyle(p); const t = p.querySelector("p") ? getComputedStyle(p.querySelector("p")).color : null;
      return { bg: cs.backgroundColor, tema: p.getAttribute("data-theme"), tinta: t, esquema: cs.colorScheme };
    });
    check("el cartón del detalle sigue claro dentro del panel oscuro (fondo claro, tinta oscura)",
      papel && papel.tema === "claro" && /rgb\((2[0-9]{2}), (2[0-9]{2}), (2[0-9]{2})\)/.test(papel.bg) && /rgb\((\d{1,2}), (\d{1,2}), (\d{1,2})\)/.test(papel.tinta ?? ""), JSON.stringify(papel));
    await capturar(page, "detalle-con-carton-oscuro-1280", DIR_CAPTURAS);
    if (IDS.presupuesto) {
      await page.goto(`${BASE}/panel/presupuestos/${IDS.presupuesto}`, { waitUntil: "networkidle" });
      const doc = await page.evaluate(() => {
        const d = document.querySelector("#documento-presupuesto"); if (!d) return null;
        const hoja = d.firstElementChild ? getComputedStyle(d.firstElementChild).backgroundColor : null;
        return { tema: d.getAttribute("data-theme"), hoja };
      });
      check("el presupuesto sigue claro", doc && doc.tema === "claro", JSON.stringify(doc));
      await page.emulateMedia({ media: "print" });
      const impreso = await page.evaluate(() => getComputedStyle(document.querySelector("[data-tema-panel]")).backgroundColor);
      check("en impresión el panel entero vuelve a claro", impreso === "rgb(255, 255, 255)", impreso);
      await page.emulateMedia({ media: "screen" });
    }
    await ctx.close();
  });
} catch (e) {
  check("la corrida", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close();
  restaurar();
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);
