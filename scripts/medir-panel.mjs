// La medición del panel (docs/PROMPT-velocidad-y-seguridad.md § 6): entra al
// panel y recorre Inicio → A quién llamar → Clientes → Trabajos → Mi cuenta
// haciendo clic en el menú, como lo hace el dueño. Sin número no sabemos
// cuánto mejoró.
//
// Para cada pantalla anota tres tiempos, contados desde el clic:
//   · TTFB: el primer byte de la respuesta del servidor a esa navegación
//     (el pedido RSC que dispara el clic). «prefetch» si el clic no pidió
//     nada: todo lo que mostró ya estaba en el navegador.
//   · Esqueleto: el primer cuadro en que el esqueleto de la pantalla está
//     VISIBLE ([data-esqueleto] con visibility visible). «—» si no hubo:
//     en develop no hay ningún loading.tsx, y con el contenido antes de
//     300 ms el esqueleto no llega a mostrarse (es la regla).
//   · Contenido: el primer cuadro con la lista real de esa pantalla (una
//     fila, el formulario o su estado vacío) fuera del esqueleto.
// Y la ENTRADA: la carga completa de /panel con la URL escrita (TTFB del
// documento y contenido), que es donde pega el arranque en frío.
//
// Los tiempos se toman adentro de la página, en cada requestAnimationFrame
// (lo que el usuario ve, no lo que Playwright tarda en preguntar), y salen
// de RONDAS vueltas: la tabla da la mediana y el peor. Entre clic y clic
// hay una pausa (PAUSA_MS) para que <Link> haga su prefetch, como cuando
// alguien lee la pantalla antes de tocar la siguiente.
//
// Correr:
//   local, con el seed:
//     BASE_URL=http://localhost:3000 node --no-warnings scripts/medir-panel.mjs
//   contra un preview de Vercel:
//     BASE_URL=https://<deploy>.vercel.app MEDIR_EMAIL=<owner> MEDIR_PASSWORD=<clave> \
//     VERCEL_BYPASS=<secreto de «Protection Bypass for Automation»> \
//     node --no-warnings scripts/medir-panel.mjs
// Opciones: RONDAS (5), PAUSA_MS (2000), SALIDA=<archivo.json> con los crudos.
//
// Solo lee: navega y mide, no escribe nada en la base.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const EMAIL = process.env.MEDIR_EMAIL ?? (LOCAL ? "demo@fidellimotors.app" : null);
const CLAVE = process.env.MEDIR_PASSWORD ?? (LOCAL ? "demo1234" : null);
const RONDAS = Number(process.env.RONDAS ?? 5);
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 2000);
const BYPASS = process.env.VERCEL_BYPASS ?? null;

if (!EMAIL || !CLAVE) {
  console.error("Fuera de local hacen falta MEDIR_EMAIL y MEDIR_PASSWORD (el owner con el que se entra).");
  process.exit(1);
}

// El recorrido. `contenido` es lo que existe SOLO cuando llegó la pantalla
// real —en develop y después—, y se busca fuera de [data-esqueleto]: la
// cabecera del esqueleto es la real, así que el título no alcanza.
const VACIO = "main .surface-card > p.font-brand";
const PANTALLAS = [
  { nombre: "Inicio", ruta: "/panel", titulo: "Inicio", contenido: "main section, main li" },
  { nombre: "A quién llamar", ruta: "/panel/proximos", titulo: "A quién llamar", contenido: `main li, ${VACIO}` },
  { nombre: "Clientes", ruta: "/panel/clientes", titulo: "Clientes", contenido: `main li, ${VACIO}` },
  { nombre: "Trabajos", ruta: "/panel/services", titulo: "Trabajos", contenido: `main li, ${VACIO}` },
  { nombre: "Mi cuenta", ruta: "/panel/cuenta", titulo: "Mi cuenta", contenido: "main form" },
];
const ORDEN = ["/panel/proximos", "/panel/clientes", "/panel/services", "/panel/cuenta", "/panel"];

// Corre adentro de la página: mira cada cuadro hasta que la pantalla
// destino tiene su contenido, y deja los tiempos en window.__medicion.
// Va como script de inicio de cada documento: en la entrada (?medir=)
// arranca solo, con t0 en el comienzo de la navegación; en un clic lo
// arranca el propio clic.
const VIGIA = `
performance.setResourceTimingBufferSize(100000);
window.__vigilar = (destino, t0) => {
  const m = { t0, esqueleto: null, contenido: null, listo: false };
  window.__medicion = m;
  const cuadro = () => {
    const ahora = performance.now();
    const main = document.querySelector("main");
    if (main && location.pathname === destino.ruta) {
      if (m.esqueleto === null) {
        const e = main.querySelector("[data-esqueleto]");
        if (e && getComputedStyle(e).visibility === "visible" && e.getClientRects().length > 0)
          m.esqueleto = ahora - t0;
      }
      const titulo = main.querySelector("h1")?.textContent?.trim();
      const real = [...main.querySelectorAll(destino.contenido)].some((el) => !el.closest("[data-esqueleto]"));
      if (real && titulo === destino.titulo) {
        m.contenido = ahora - t0;
        m.listo = true;
        return;
      }
    }
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
};
if (new URLSearchParams(location.search).has("medir")) window.__vigilar(${JSON.stringify({
  ruta: "/panel",
  titulo: "Inicio",
  contenido: "main section, main li",
})}, 0);
`;

// El primer byte de lo que pidió el clic: el pedido al propio origen que
// empezó después de t0 y contestó antes (los RSC y lo que haga falta).
const ttfbDesde = (t0) =>
  performance
    .getEntriesByType("resource")
    .filter((r) => r.startTime >= t0 && r.name.startsWith(location.origin) && r.responseStart > 0)
    .reduce((min, r) => Math.min(min, r.responseStart - t0), Infinity);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(VIGIA);
const page = await ctx.newPage();

if (BYPASS) {
  // La protección de los previews: el parámetro deja una cookie para el
  // resto del recorrido (un header en cada pedido rompería el CORS de las
  // llamadas del navegador a Supabase).
  await page.goto(`${BASE}/login?x-vercel-protection-bypass=${encodeURIComponent(BYPASS)}&x-vercel-set-bypass-cookie=true`);
}
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill('input[type="password"]', CLAVE);
await page.click('button[type="submit"]');
await page.waitForURL((u) => u.pathname.startsWith("/panel"), { timeout: 60000 });

const crudos = { base: BASE, rondas: RONDAS, pausaMs: PAUSA_MS, fecha: new Date().toISOString(), entrada: [], pantallas: {} };
for (const p of PANTALLAS) crudos.pantallas[p.ruta] = [];

const esperarListo = () => page.waitForFunction(() => window.__medicion?.listo === true, null, { timeout: 60000, polling: 50 });

for (let ronda = 1; ronda <= RONDAS; ronda++) {
  // La entrada: /panel con la URL escrita. El vigía arranca con la página.
  await page.goto(`${BASE}/panel?medir=${ronda}`, { waitUntil: "commit" });
  await esperarListo();
  const entrada = await page.evaluate(() => ({
    ttfb: performance.getEntriesByType("navigation")[0]?.responseStart ?? null,
    contenido: window.__medicion.contenido,
  }));
  crudos.entrada.push(entrada);
  await page.waitForTimeout(PAUSA_MS);

  for (const ruta of ORDEN) {
    const destino = PANTALLAS.find((p) => p.ruta === ruta);
    // El clic sale de adentro de la página para que t0 y los cuadros estén
    // en el mismo reloj. El link es el del menú visible (escritorio).
    await page.evaluate((d) => {
      const link = [...document.querySelectorAll(`a[href="${d.ruta}"]`)].find((a) => a.offsetParent !== null);
      if (!link) throw new Error(`no hay link visible a ${d.ruta}`);
      const t0 = performance.now();
      window.__vigilar(d, t0);
      link.click();
    }, destino);
    await esperarListo();
    const medida = await page.evaluate(`(() => {
      const m = window.__medicion;
      const t = (${ttfbDesde.toString()})(m.t0);
      return { ttfb: Number.isFinite(t) ? t : null, esqueleto: m.esqueleto, contenido: m.contenido };
    })()`);
    crudos.pantallas[ruta].push(medida);
    await page.waitForTimeout(PAUSA_MS);
  }
  process.stderr.write(`ronda ${ronda}/${RONDAS} lista\n`);
}
await browser.close();

// ---- la tabla
const mediana = (xs) => {
  const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const peor = (xs) => {
  const v = xs.filter((x) => x !== null);
  return v.length ? Math.max(...v) : null;
};
const ms = (x) => (x === null ? "—" : `${Math.round(x).toLocaleString("es-AR")} ms`);
const ttfbTexto = (xs) => (xs.every((x) => x === null) ? "prefetch" : ms(mediana(xs)));
const esqueletoTexto = (xs) => {
  const vistos = xs.filter((x) => x !== null).length;
  if (!vistos) return "—";
  return vistos === xs.length ? ms(mediana(xs)) : `${ms(mediana(xs))} (${vistos} de ${xs.length})`;
};

const filas = [
  `| Pantalla | TTFB | Esqueleto | Contenido (mediana) | Contenido (peor) |`,
  `|---|---|---|---|---|`,
  `| Entrada a /panel (carga completa) | ${ms(mediana(crudos.entrada.map((e) => e.ttfb)))} | — | ${ms(mediana(crudos.entrada.map((e) => e.contenido)))} | ${ms(peor(crudos.entrada.map((e) => e.contenido)))} |`,
];
for (const ruta of ORDEN) {
  const p = PANTALLAS.find((x) => x.ruta === ruta);
  const xs = crudos.pantallas[ruta];
  filas.push(
    `| ${p.nombre} | ${ttfbTexto(xs.map((x) => x.ttfb))} | ${esqueletoTexto(xs.map((x) => x.esqueleto))} | ${ms(mediana(xs.map((x) => x.contenido)))} | ${ms(peor(xs.map((x) => x.contenido)))} |`,
  );
}
console.log(`\n${BASE} · ${RONDAS} rondas · clic desde el menú, pausa de ${PAUSA_MS} ms entre pantallas\n`);
console.log(filas.join("\n"));
if (process.env.SALIDA) {
  fs.writeFileSync(process.env.SALIDA, JSON.stringify(crudos, null, 2));
  console.log(`\nLos crudos quedaron en ${process.env.SALIDA}`);
}
