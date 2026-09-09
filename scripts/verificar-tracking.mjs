// Verificación del bloque de tracking (atribución de WhatsApp por canal):
// los puntos 1 a 8, 14 y 15 de la lista del bloque, contra un servidor de
// producción local.
//
//   npm run build && npm start -- -p 3700
//   node scripts/verificar-tracking.mjs            # BASE=http://localhost:3700
//
// Corre con Playwright (devDependency) y un Chromium headless. TODO lo que
// iría a Google, Meta o WhatsApp se intercepta: se anota para los asserts y
// NO se envía, así que se puede correr las veces que haga falta sin ensuciar
// GA4 ni Google Ads. Lo que sí se necesita es red: gtag.js y fbevents.js se
// cargan de verdad, porque el punto es ver qué mandan.
//
// Dos trampas del harness que costaron encontrar:
//   · El Píxel de Meta NO manda nada si el user agent dice "HeadlessChrome":
//     por eso los contextos llevan un user agent de Chrome normal.
//   · `page_path` es un campo reservado de gtag: en el hit de GA4 viaja como
//     `dp`, no como `ep.page_path`. `debug_mode` sale como `ep.debug_mode`.
// Y una de Next: al volver a `/` por un Link, el router restaura la URL
// canónica del segmento, con la query de la carga inicial (`/?utm_source=…`).
//
// Los puntos 9 a 13 se comprueban en producción: DebugView de GA4, Probar
// eventos de Meta, el estado de la conversión en Google Ads, los
// encabezados de las redirecciones y Lighthouse.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3700";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const UA_MOVIL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";
const NUM = "5493513736028";
const MSG = {
  google: "Hola, vi Fidelli Motors en Google y quiero saber más.",
  meta: "Hola, vi Fidelli Motors en Instagram y quiero saber más.",
  none: "Hola, quiero saber más de Fidelli Motors.",
  blogPrecio: "Hola, leí el artículo sobre cuánto cuesta un sistema para lubricentro y quiero saber más.",
};

// Destinos que se interceptan siempre (se anotan, no salen).
const CAPTURAR = [
  /google-analytics\.com/, /analytics\.google\.com/, /googleadservices\.com/,
  /google\.com\/(pagead|ccm)/, /doubleclick\.net/, /googlesyndication\.com/,
  /facebook\.com\/tr/, /googletagmanager\.com\/(a\?|td\?|gtag\/destination)/,
  /wa\.me/, /whatsapp\.com/,
];
// Con "bloqueador de anuncios": tampoco cargan las librerías.
const LIBRERIAS = [/googletagmanager\.com/, /connect\.facebook\.net/];

let fallos = 0;
function ok(cond, nombre, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${nombre}${detalle ? "  — " + detalle : ""}`);
  if (!cond) fallos++;
}

function parsear(url, body) {
  const u = new URL(url);
  const eventos = [];
  const base = Object.fromEntries(u.searchParams.entries());
  if (body && /\ben=/.test(body)) {
    for (const linea of body.split("\n").filter(Boolean)) {
      eventos.push({ ...base, ...Object.fromEntries(new URLSearchParams(linea).entries()) });
    }
  } else eventos.push(base);
  return eventos;
}

async function nuevoContexto(browser, { adblock = false, js = true, sinStorage = false } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1280, height: 900 }, userAgent: UA });
  const registro = { peticiones: [], consola: [], errores: [] };
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (adblock && LIBRERIAS.some((r) => r.test(url))) return route.abort("blockedbyclient");
    if (CAPTURAR.some((r) => r.test(url))) {
      registro.peticiones.push({ url, body: route.request().postData() ?? "" });
      if (/wa\.me|whatsapp\.com/.test(url)) return route.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>ok" });
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  ctx.on("page", (p) => {
    p.on("console", (m) => registro.consola.push({ tipo: m.type(), texto: m.text() }));
    p.on("pageerror", (e) => registro.errores.push(String(e)));
  });
  if (sinStorage) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new Error("localStorage deshabilitado"); } });
    });
  }
  return { ctx, registro };
}

// Hace clic y devuelve la URL de wa.me que se abrió en la pestaña nueva.
async function clicWhatsapp(page, selector) {
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.click(selector),
  ]);
  await popup.waitForLoadState().catch(() => {});
  const url = popup.url();
  await popup.close();
  return url;
}
function mensajeDe(url) {
  const u = new URL(url);
  return { numero: u.pathname.replace("/", ""), texto: u.searchParams.get("text") };
}
function eventosGa4(registro) {
  return registro.peticiones.filter((p) => /google-analytics\.com|analytics\.google\.com/.test(p.url) && /\/g\/collect/.test(p.url))
    .flatMap((p) => parsear(p.url, p.body));
}
function conversiones(registro) {
  return registro.peticiones.filter((p) => /googleadservices\.com\/pagead\/conversion|google\.com\/pagead\/1p-conversion/.test(p.url)).map((p) => p.url);
}
function eventosMeta(registro) {
  return registro.peticiones.filter((p) => /facebook\.com\/tr/.test(p.url)).map((p) => {
    const u = new URL(p.url);
    const params = Object.fromEntries(u.searchParams.entries());
    if (p.body) Object.assign(params, Object.fromEntries(new URLSearchParams(p.body).entries()));
    return params;
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

// ---------- 1 y 2: Google por UTM, sobrevive a la navegación interna ----------
{
  const { ctx, registro } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=google&utm_medium=cpc&utm_campaign=busqueda-generica&utm_content=test&fm_debug=1`);
  await page.waitForLoadState("networkidle");
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("fm_origin")));
  ok(guardado?.source === "google" && guardado.campaign === "busqueda-generica" && guardado.content === "test" && guardado.landing === "/", "1. fm_origin guardado con google/campaña/landing", JSON.stringify(guardado));

  const url1 = await clicWhatsapp(page, "#cta-hero");
  const m1 = mensajeDe(url1);
  ok(m1.numero === NUM && m1.texto === MSG.google, "1. hero con UTM google → mensaje Google", url1);
  await espera(1500);

  const ga4 = eventosGa4(registro);
  const pv = ga4.filter((e) => e.en === "page_view");
  ok(pv.length === 1, "1. exactamente un page_view de GA4 en la carga", `page_view=${pv.length}`);
  const wc = ga4.filter((e) => e.en === "whatsapp_click");
  ok(wc.length === 1, "1. un whatsapp_click en GA4", JSON.stringify(wc));
  ok(wc[0]?.["ep.origin"] === "google" && wc[0]?.["ep.cta_id"] === "hero" && wc[0]?.dp === "/" && wc[0]?.["ep.utm_campaign"] === "busqueda-generica" && wc[0]?.["ep.utm_content"] === "test" && !("ep.utm_term" in wc[0]) && wc[0]?.tid === "G-D5ZPJ6BZHX", "1. parámetros del whatsapp_click (origin, cta_id, page_path→dp, utm_*, tid)", JSON.stringify({ origin: wc[0]?.["ep.origin"], cta: wc[0]?.["ep.cta_id"], dp: wc[0]?.dp, camp: wc[0]?.["ep.utm_campaign"], content: wc[0]?.["ep.utm_content"], tid: wc[0]?.tid }));
  ok(wc[0]?.["ep.debug_mode"] === "true" || wc[0]?._dbg === "1", "8. con fm_debug el evento lleva debug_mode (DebugView)", `debug_mode=${wc[0]?.["ep.debug_mode"]}`);
  const conv = conversiones(registro);
  ok(conv.some((u) => u.includes("18440390476") && u.includes("VfV0CKP3i_IcEMyOiNlE")), "11. conversión de Google Ads con la etiqueta correcta", conv.join(" | ").slice(0, 300));
  const meta = eventosMeta(registro);
  ok(meta.filter((e) => e.ev === "PageView").length === 1, "4. un PageView de Meta en la carga", JSON.stringify(meta.map((e) => e.ev)));
  const contact = meta.find((e) => e.ev === "Contact");
  ok(contact && contact["cd[origin]"] === "google" && contact["cd[content_name]"] === "hero" && contact.id === "1601809244956895", "4. Contact de Meta con origin y content_name", JSON.stringify(contact));

  // Debug: la consola cuenta el origen, el mensaje y los tres eventos.
  const fm = registro.consola.filter((c) => c.texto.startsWith("[fm]")).map((c) => c.texto);
  ok(fm.some((t) => t.includes("origen vigente")) && fm.some((t) => t.includes("clic en WhatsApp (hero)")) && fm.some((t) => t.includes("evento GA4: whatsapp_click")) && fm.some((t) => t.includes("evento Google Ads: conversion") && t.includes("AW-18440390476/VfV0CKP3i_IcEMyOiNlE")) && fm.some((t) => t.includes("evento Meta: Contact")), "8. fm_debug: consola con origen, clic y los tres eventos", fm.map((t) => t.slice(0, 90)).join(" || "));

  // Doble clic: dos clics inmediatos (más de 2 s después del primero), un
  // solo juego de eventos nuevo.
  await espera(2100);
  const antes = { ga4: eventosGa4(registro).filter((e) => e.en === "whatsapp_click").length, conv: conversiones(registro).length, meta: eventosMeta(registro).filter((e) => e.ev === "Contact").length };
  const popups = [];
  const juntar = (p) => popups.push(p);
  page.context().on("page", juntar);
  await page.click("#cta-hero");
  await page.click("#cta-hero");
  await espera(1500);
  page.context().off("page", juntar);
  ok(popups.length === 2 && popups.every((p) => mensajeDe(p.url()).texto === MSG.google), "3. los dos clics abren WhatsApp con el mensaje Google", popups.map((p) => p.url()).join(" | "));
  for (const p of popups) await p.close();
  const despues = { ga4: eventosGa4(registro).filter((e) => e.en === "whatsapp_click").length, conv: conversiones(registro).length, meta: eventosMeta(registro).filter((e) => e.ev === "Contact").length };
  ok(despues.ga4 === antes.ga4 + 1 && despues.conv === antes.conv + 1 && despues.meta === antes.meta + 1, "3. protección contra doble clic: un solo juego de eventos por los dos clics", JSON.stringify({ antes, despues }));

  // Navegación interna: Precio → Blog → inicio; el mensaje sigue siendo Google.
  await page.click('nav[aria-label="Principal"] a[href="/#precio"]');
  await espera(300);
  await page.click('nav[aria-label="Principal"] a[href="/blog"]');
  await page.waitForURL(`${BASE}/blog`);
  await page.waitForLoadState("networkidle");
  ok(eventosMeta(registro).filter((e) => e.ev === "PageView").length === 2, "4. PageView de Meta en la navegación interna a /blog", JSON.stringify(eventosMeta(registro).map((e) => e.ev)));
  const url2f = await clicWhatsapp(page, 'footer a:has-text("WhatsApp")');
  ok(mensajeDe(url2f).texto === MSG.google, "2. pie en /blog, sigue Google", url2f);
  await page.evaluate(() => window.scrollTo(0, 0));
  await espera(500);
  await page.click('a[aria-label="Fidelli Motors, ir al inicio"]');
  await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`));
  await espera(300);
  const url2 = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url2).texto === MSG.google, "2. vuelta a la raíz tras /#precio y /blog: sigue Google", url2);
  await espera(1500);
  const wc2 = eventosGa4(registro).filter((e) => e.en === "whatsapp_click");
  ok(wc2.length === 4 && wc2[2]["ep.cta_id"] === "footer" && wc2[2].dp === "/blog" && wc2[3].dp === "/", "2. cta_id=footer y page_path=/blog en el clic del blog", JSON.stringify(wc2.map((e) => [e["ep.cta_id"], e.dp])));
  ok(registro.errores.length === 0 && !registro.consola.some((c) => c.tipo === "error"), "13. sin errores de consola", JSON.stringify(registro.errores.concat(registro.consola.filter((c) => c.tipo === "error").map((c) => c.texto))));
  await ctx.close();
}

// ---------- 3: parámetros después del ancla ----------
{
  const { ctx, registro } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#precio?utm_source=google&utm_medium=cpc`);
  await page.waitForLoadState("networkidle");
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("fm_origin")));
  ok(guardado?.source === "google" && guardado.landing === "/#precio", "3. UTM después del ancla → google, landing /#precio", JSON.stringify(guardado));
  const enPantalla = await page.evaluate(() => { const r = document.getElementById("precio").getBoundingClientRect(); return r.top >= -5 && r.top < window.innerHeight; });
  ok(enPantalla, "3. la página saltó a #precio pese al sufijo");
  const url = await clicWhatsapp(page, 'a:has-text("Sumar mi lubricentro") >> nth=0');
  ok(mensajeDe(url).texto === MSG.google, "3. mensaje Google", url);
  ok(!registro.consola.some((c) => c.texto.startsWith("[fm]")), "5. sin fm_debug, silencio total en consola", JSON.stringify(registro.consola.filter((c) => c.texto.startsWith("[fm]")).length));
  ok(registro.errores.length === 0 && !registro.consola.some((c) => c.tipo === "error"), "13. sin errores de consola (incógnito)");
  await ctx.close();
}

// ---------- 4 y 5: meta, gclid, fbclid ----------
for (const [query, esperado, nombre] of [
  ["?utm_source=meta&utm_medium=cpc", MSG.meta, "4. utm_source=meta → Instagram"],
  ["?utm_source=Instagram", MSG.meta, "4. utm_source=Instagram (mayúscula) → Instagram"],
  ["?gclid=test123", MSG.google, "5. gclid solo → Google"],
  ["?fbclid=test123", MSG.meta, "5. fbclid solo → Instagram"],
  ["", MSG.none, "7. sin parámetros → mensaje sin origen"],
]) {
  const { ctx, registro } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${query}`);
  await page.waitForLoadState("networkidle");
  const url = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url).texto === esperado && mensajeDe(url).numero === NUM, nombre, url);
  if (query === "?utm_source=meta&utm_medium=cpc") {
    await espera(1200);
    const contact = eventosMeta(registro).find((e) => e.ev === "Contact");
    ok(contact?.["cd[origin]"] === "meta", "10. Contact de Meta con origin=meta", JSON.stringify(contact));
    ok(eventosGa4(registro).find((e) => e.en === "whatsapp_click")?.["ep.origin"] === "meta", "9. whatsapp_click con origin=meta");
  }
  if (query === "") {
    await espera(1200);
    const wc = eventosGa4(registro).find((e) => e.en === "whatsapp_click");
    ok(wc?.["ep.origin"] === "none" && !("ep.utm_campaign" in wc), "7. sin origen: origin=none y sin utm_*", JSON.stringify(wc));
    const guardado = await page.evaluate(() => localStorage.getItem("fm_origin"));
    ok(guardado === null, "7. sin parámetros no se guarda nada");
  }
  await ctx.close();
}

// ---------- 6: blog directo ----------
{
  const { ctx, registro } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/blog/cuanto-cuesta-sistema-para-lubricentro`);
  await page.waitForLoadState("networkidle");
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("fm_origin")));
  ok(guardado?.source === "blog" && guardado.article === "cuanto-cuesta-sistema-para-lubricentro" && guardado.topic === "cuánto cuesta un sistema para lubricentro", "6. artículo directo → blog + slug + tema", JSON.stringify(guardado));
  const url = await clicWhatsapp(page, 'section[aria-labelledby="cierre-blog-titulo"] a');
  ok(mensajeDe(url).texto === MSG.blogPrecio, "6. mensaje 'leí el artículo sobre…'", url);
  await espera(1200);
  const wc = eventosGa4(registro).find((e) => e.en === "whatsapp_click");
  ok(wc?.["ep.origin"] === "blog" && wc["ep.cta_id"] === "blog" && wc.dp === "/blog/cuanto-cuesta-sistema-para-lubricentro", "6. whatsapp_click origin=blog cta_id=blog page_path=/blog/…", JSON.stringify({ origin: wc?.["ep.origin"], cta: wc?.["ep.cta_id"], dp: wc?.dp }));
  // Del artículo a la landing por el navbar: sigue diciendo blog.
  await page.evaluate(() => window.scrollTo(0, 0));
  await espera(500);
  await page.click('a[aria-label="Fidelli Motors, ir al inicio"]');
  await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`));
  await espera(300);
  const url2 = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url2).texto === MSG.blogPrecio, "6. en la landing después del artículo: sigue el artículo", url2);
  await ctx.close();
}

// ---------- 2 bis: fuente paga + artículo → gana la paga, el artículo queda anotado ----------
{
  const { ctx } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/blog/sistema-de-gestion-para-lubricentro?utm_source=google&utm_campaign=busqueda-marca`);
  await page.waitForLoadState("networkidle");
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("fm_origin")));
  ok(guardado?.source === "google" && guardado.article === "sistema-de-gestion-para-lubricentro" && guardado.campaign === "busqueda-marca" && guardado.landing === "/blog/sistema-de-gestion-para-lubricentro", "2b. artículo con UTM: google gana, artículo anotado", JSON.stringify(guardado));
  const url = await clicWhatsapp(page, 'section[aria-labelledby="cierre-blog-titulo"] a');
  ok(mensajeDe(url).texto === MSG.google, "2b. mensaje Google en el artículo", url);
  // Meta después de google: último toque pago.
  await page.goto(`${BASE}/?fbclid=abc`);
  await page.waitForLoadState("networkidle");
  const g2 = await page.evaluate(() => JSON.parse(localStorage.getItem("fm_origin")));
  ok(g2?.source === "meta" && g2.article === "sistema-de-gestion-para-lubricentro" && g2.campaign === null, "2b. último toque pago: meta pisa a google y conserva el artículo", JSON.stringify(g2));
  // Vencido a los 30 días: se descarta.
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem("fm_origin")); o.ts = Date.now() - 31 * 24 * 3600 * 1000; localStorage.setItem("fm_origin", JSON.stringify(o)); });
  const url3 = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url3).texto === MSG.none, "2b. origen vencido (31 días) → mensaje sin origen", url3);
  ok((await page.evaluate(() => localStorage.getItem("fm_origin"))) === null, "2b. el vencido se borra");
  // Basura en el storage: no rompe.
  await page.evaluate(() => localStorage.setItem("fm_origin", "{no es json"));
  const url4 = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url4).texto === MSG.none, "2b. JSON roto en fm_origin → mensaje sin origen", url4);
  await ctx.close();
}

// ---------- 14: sin JavaScript ----------
{
  const { ctx } = await nuevoContexto(browser, { js: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=google`);
  const href = await page.getAttribute("#cta-hero", "href");
  const target = await page.getAttribute("#cta-hero", "target");
  ok(href === `https://wa.me/${NUM}?text=${encodeURIComponent(MSG.none)}` && target === "_blank", "14. sin JS: href de respaldo con el mensaje sin origen, pestaña nueva", href);
  const hrefs = await page.$$eval('a[href^="https://wa.me/"]', (as) => as.map((a) => a.getAttribute("href")));
  // Navbar, hero, tres planes, preguntas, cierre, barra de mobile y pie: nueve.
  ok(hrefs.length === 9 && hrefs.every((h) => h === hrefs[0]), "14. los nueve enlaces a wa.me del HTML son el mismo href de respaldo", `${hrefs.length} enlaces`);
  const noscript = await page.content();
  ok(noscript.includes("facebook.com/tr?id=1601809244956895&amp;ev=PageView&amp;noscript=1"), "4. <noscript> del Píxel presente");
  await ctx.close();
}

// ---------- 15: bloqueador de anuncios ----------
{
  const { ctx, registro } = await nuevoContexto(browser, { adblock: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=google&utm_medium=cpc`);
  await page.waitForLoadState("networkidle");
  const url = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url).texto === MSG.google, "15. con bloqueador: abre wa.me con el mensaje Google", url);
  await espera(800);
  ok(eventosGa4(registro).length === 0 && conversiones(registro).length === 0 && eventosMeta(registro).filter((e) => e.ev === "Contact").length === 0, "15. con bloqueador no sale ningún evento");
  ok(registro.errores.length === 0, "15. con bloqueador, sin errores de página", JSON.stringify(registro.errores));
  await ctx.close();
}

// ---------- localStorage deshabilitado ----------
{
  const { ctx, registro } = await nuevoContexto(browser, { sinStorage: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=google`);
  await page.waitForLoadState("networkidle");
  const url = await clicWhatsapp(page, "#cta-hero");
  ok(mensajeDe(url).texto === MSG.google, "1b. sin localStorage: el origen vive en memoria y el mensaje sale igual", url);
  ok(registro.errores.length === 0, "1b. sin localStorage, sin errores", JSON.stringify(registro.errores));
  await ctx.close();
}

// ---------- Los tres botones de precio y el remate de preguntas ----------
{
  const { ctx, registro } = await nuevoContexto(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=google&fm_debug=1`);
  await page.waitForLoadState("networkidle");
  for (const [sel, id] of [['a:has-text("Empezar con Basic")', "precio-basic"], ['#precio a:has-text("Sumar mi lubricentro")', "precio-pro"], ['a:has-text("Empezar con Ultra")', "precio-ultra"], ['#preguntas a:has-text("Escribinos por WhatsApp")', "preguntas"], ['nav[aria-label="Principal"] a:has-text("Sumar mi lubricentro")', "navbar"], ['#cierre a:has-text("Sumar mi lubricentro")', "cierre"]]) {
    const url = await clicWhatsapp(page, sel);
    ok(mensajeDe(url).texto === MSG.google, `cta ${id} abre con el mensaje Google`, url);
  }
  await espera(1500);
  const ids = eventosGa4(registro).filter((e) => e.en === "whatsapp_click").map((e) => e["ep.cta_id"]);
  ok(JSON.stringify(ids) === JSON.stringify(["precio-basic", "precio-pro", "precio-ultra", "preguntas", "navbar", "cierre"]), "cta_id de cada botón", JSON.stringify(ids));
  await ctx.close();
}

// ---------- Mobile: la barra fija ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA_MOVIL });
  const registro = { peticiones: [] };
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (CAPTURAR.some((r) => r.test(url))) { registro.peticiones.push({ url, body: route.request().postData() ?? "" }); return /wa\.me/.test(url) ? route.fulfill({ status: 200, contentType: "text/html", body: "ok" }) : route.fulfill({ status: 204, body: "" }); }
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?utm_source=meta`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 1600));
  await espera(600);
  const url = await clicWhatsapp(page, 'div.fixed.inset-x-0.bottom-0 a');
  ok(mensajeDe(url).texto === MSG.meta, "barra fija de mobile → Instagram", url);
  await espera(1200);
  ok(eventosGa4(registro).find((e) => e.en === "whatsapp_click")?.["ep.cta_id"] === "barra-movil", "cta_id=barra-movil");
  await ctx.close();
}

await browser.close();
console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
