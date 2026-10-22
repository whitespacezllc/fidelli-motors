// La medición del alta de un trabajo: cuánto tarda la patente en resolverse
// y cuánto el «¿De quién es?» en sugerir, desde la última tecla hasta lo
// que el mecánico ve. Es el compañero de medir-panel.mjs para la pantalla
// que importa con el auto en el pozo. Sin número no sabemos cuánto mejoró.
//
// Para cada ronda anota, en milisegundos desde la última tecla:
//   · Patente → ficha: cuándo aparece la mini-ficha del vehículo (el botón
//     «Cargar trabajo»), y cuánto tardó la consulta en sí (del pedido a la
//     respuesta, según el navegador).
//   · Cliente → sugerencias: con una patente nueva abierta en «¿De quién
//     es?», cuándo aparece la primera sugerencia al escribir un nombre, y
//     cuánto tardó su consulta.
// La tabla da la mediana y el peor de las rondas.
//
// Correr:
//   local, con el seed:
//     BASE_URL=http://localhost:3000 node --no-warnings scripts/medir-alta.mjs
//   contra un preview de Vercel (con un owner real):
//     BASE_URL=https://<deploy>.vercel.app MEDIR_EMAIL=<owner> MEDIR_PASSWORD=<clave> \
//     VERCEL_BYPASS=<secreto de «Protection Bypass for Automation»> \
//     PATENTE=<una patente de ese taller> node --no-warnings scripts/medir-alta.mjs
// Opciones: RONDAS (5), PATENTE (ABC123 en local), NUEVA (una patente que
// no exista; ZZ999ZZ), NOMBRE (lo que se escribe en «¿De quién es?»; «gom»),
// SALIDA=<archivo.json> con los crudos.
//
// Solo lee: escribe en los campos y mide, no guarda nada.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const EMAIL = process.env.MEDIR_EMAIL ?? (LOCAL ? "demo@fidellimotors.app" : null);
const CLAVE = process.env.MEDIR_PASSWORD ?? (LOCAL ? "demo1234" : null);
const RONDAS = Number(process.env.RONDAS ?? 5);
const PATENTE = process.env.PATENTE ?? "ABC123";
const NUEVA = process.env.NUEVA ?? "ZZ999ZZ";
const NOMBRE = process.env.NOMBRE ?? "gom";
const BYPASS = process.env.VERCEL_BYPASS ?? null;

if (!EMAIL || !CLAVE) {
  console.error("Fuera de local hacen falta MEDIR_EMAIL y MEDIR_PASSWORD (el owner con el que se entra).");
  process.exit(1);
}

const navegador = await chromium.launch();
const ctx = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "es-AR",
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
page.setDefaultTimeout(60_000);

if (BYPASS) {
  await page.goto(`${BASE}/login?x-vercel-protection-bypass=${encodeURIComponent(BYPASS)}&x-vercel-set-bypass-cookie=true`);
}
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill('input[type="password"]', CLAVE);
await page.click('button[type="submit"]');
await page.waitForURL("**/panel**");

// Los pedidos a PostgREST, con su duración según el navegador.
const consultas = [];
page.on("requestfinished", async (r) => {
  if (!/\/rest\/v1\//.test(r.url())) return;
  const t = r.timing();
  consultas.push({ url: r.url(), fin: Date.now(), duracion: t.responseEnd >= 0 ? Math.round(t.responseEnd) : null });
});
const ultimaConsulta = (que) => [...consultas].reverse().find((c) => c.url.includes(que));

async function tipear(selector, texto) {
  await page.fill(selector, "");
  for (const c of texto) await page.type(selector, c, { delay: 70 });
  return Date.now();
}

const crudos = [];
for (let ronda = 1; ronda <= RONDAS; ronda++) {
  // La pantalla, fresca: así cada ronda paga lo mismo que una carga real.
  await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#patente");
  const r = { ronda };

  // ---- la patente ----
  {
    const t0 = await tipear("#patente", PATENTE);
    await page.waitForSelector("main a[href^='/panel/services/nuevo/']");
    r.patenteFicha = Date.now() - t0;
    r.patenteConsulta = ultimaConsulta("rpc/buscar_vehiculo_por_patente")?.duracion ?? null;
  }

  // ---- el cliente ----
  {
    await tipear("#patente", NUEVA);
    await page.waitForSelector('input[aria-label="Buscar cliente"]');
    const t0 = await tipear('input[aria-label="Buscar cliente"]', NOMBRE);
    await page.waitForFunction(() => {
      const m = document.querySelector("main");
      return m && (m.querySelectorAll("li button").length > 0 || /Ningún cliente/.test(m.textContent ?? ""));
    });
    r.clienteSugerencias = Date.now() - t0;
    r.clienteConsulta = ultimaConsulta("vista_clientes")?.duracion ?? null;
  }
  crudos.push(r);
  console.log(`ronda ${ronda}: patente → ficha ${r.patenteFicha} ms (consulta ${r.patenteConsulta ?? "—"} ms) · cliente → sugerencias ${r.clienteSugerencias} ms (consulta ${r.clienteConsulta ?? "—"} ms)`);
}

const mediana = (xs) => {
  const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const peor = (xs) => {
  const v = xs.filter((x) => x !== null);
  return v.length ? Math.max(...v) : null;
};
const fila = (nombre, xs) => `${nombre.padEnd(28)} mediana ${String(mediana(xs) ?? "—").padStart(6)} ms · peor ${String(peor(xs) ?? "—").padStart(6)} ms`;

console.log(`\n${BASE} · ${RONDAS} rondas · patente ${PATENTE} · «${NOMBRE}» en ¿De quién es?`);
console.log(fila("Patente → ficha", crudos.map((c) => c.patenteFicha)));
console.log(fila("  la consulta sola", crudos.map((c) => c.patenteConsulta)));
console.log(fila("Cliente → sugerencias", crudos.map((c) => c.clienteSugerencias)));
console.log(fila("  la consulta sola", crudos.map((c) => c.clienteConsulta)));
console.log("Desde la última tecla. «Cliente → sugerencias» incluye los 300 ms que el buscador espera a que dejes de tipear.");

if (process.env.SALIDA) {
  fs.writeFileSync(process.env.SALIDA, JSON.stringify(crudos, null, 2));
  console.log(`\nLos crudos quedaron en ${process.env.SALIDA}`);
}
await navegador.close();
