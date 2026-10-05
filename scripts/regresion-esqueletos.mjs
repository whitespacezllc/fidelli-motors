// Los esqueletos de carga del panel y de /fidelli, de punta a punta (regla
// 13: una prueba que nunca se vio en rojo no existe). CLAUDE.md · «Estados
// de carga»: cada ruta del panel tiene su loading.tsx con la estructura
// real; una ruta nueva sin él no pasa esta prueba.
//
// Lo que cubre:
//   1 · CADA RUTA TIENE SU loading.tsx: se recorren app/panel y app/fidelli
//       y toda carpeta con page.tsx tiene que tener el suyo al lado.
//   2 · EL ESQUELETO VA ANTES QUE EL CONTENIDO: con Supabase contestando a
//       los 2 s (el proxy de esta prueba demora todo menos la sesión), cada
//       ruta, entrando con la URL escrita, muestra [data-esqueleto] —con sus
//       piezas grises— a los 300 ms de la navegación, y la pantalla real
//       llega después y lo reemplaza. Una ruta que no espera a la base (su
//       contenido llega antes de los 300 ms) no necesita esqueleto.
//   3 · NADA PARPADEA POR DEBAJO DE 300 ms: si un esqueleto aparece, queda
//       en pantalla por lo menos 250 ms antes de que lo reemplace la
//       pantalla real. Lo sostiene React (no revela el contenido antes de
//       300 ms desde que mostró el fallback); acá se mira con Supabase
//       RÁPIDO (60 ms), que es justo cuando un esqueleto podría asomar y
//       desaparecer en un parpadeo, y en todas las corridas de arriba.
//   4 · EL CLIC: desde el menú, Inicio → A quién llamar → Clientes →
//       Trabajos → Mi cuenta muestran su esqueleto a los 300 ms del clic,
//       con Supabase a 2 s y con Supabase a 60 ms.
//   5 · EL NÚMERO DE LA BARRA NO FRENA LA PANTALLA: con solo
//       contactos_por_hacer demorado 4 s, /panel/proximos llega con su
//       contenido antes de los 2 s y el badge aparece después.
//
// Requiere el stack local con el seed y un servidor de Next que hable con
// Supabase A TRAVÉS del proxy de esta prueba (127.0.0.1:54398). Como
// NEXT_PUBLIC_SUPABASE_URL se fija al compilar, el servidor se arma
// apuntando al proxy, con el proxy arriba (el sitemap le pregunta a la
// base durante el build):
//   node scripts/regresion-esqueletos.mjs --solo-proxy &   # el proxy, sin demora
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 npm run build
//   kill %1
//   npx next start -p 3030
// Correr:
//   BASE_URL=http://localhost:3030 node --no-warnings scripts/regresion-esqueletos.mjs
//
// Carga un presupuesto de prueba en el demo (N° 9002, para las dos rutas
// del presupuesto) y lo borra al final. No toca nada más.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO_PROXY = 54398;
const KONG = { host: "127.0.0.1", port: 54321 };
const RETRASO = 2000;

// ---- el proxy: todo a kong, demorado según `estado` ----
// La sesión no se demora nunca: es lo único que el layout del panel tiene
// que esperar para dibujar el menú, y demorarla probaría otra cosa.
const estado = { retraso: 0, soloA: null, vistos: 0 };
const esSesion = (url) => url.startsWith("/auth/v1/") || url.startsWith("/rest/v1/usuarios");
const agente = new http.Agent({ keepAlive: true, maxSockets: 64 });
const proxy = http.createServer((req, res) => {
  estado.vistos++;
  const url = req.url ?? "/";
  const demora =
    esSesion(url) ? 0 : estado.soloA ? (url.includes(estado.soloA) ? estado.retraso : 0) : estado.retraso;
  setTimeout(() => {
    const salida = http.request(
      { ...KONG, method: req.method, path: url, headers: { ...req.headers, host: `${KONG.host}:${KONG.port}` }, agent: agente },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    salida.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(salida);
  }, demora);
});
await new Promise((ok) => proxy.listen(PUERTO_PROXY, "127.0.0.1", ok));

if (process.argv.includes("--solo-proxy")) {
  console.log(`proxy en 127.0.0.1:${PUERTO_PROXY} → kong, sin demora (para el build). Ctrl+C para cortar.`);
  await new Promise(() => {});
}

const { chromium } = await import("playwright");
const BASE = (process.env.BASE_URL ?? "http://localhost:3030").replace(/\/+$/, "");

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : `  → ${detalle}`}`);
  if (!cond) fallas++;
};
const sql = (q) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();

// ---- 1 · cada carpeta con page.tsx tiene su loading.tsx ----
console.log("\n── 1 · cada ruta tiene su loading.tsx ──");
const carpetas = [];
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) recorrer(path.join(dir, e.name));
    else if (e.name === "page.tsx") carpetas.push(dir);
  }
};
recorrer(path.join(RAIZ, "app/panel"));
recorrer(path.join(RAIZ, "app/fidelli"));
for (const dir of carpetas.sort()) {
  check(`${path.relative(RAIZ, dir)}/loading.tsx`, fs.existsSync(path.join(dir, "loading.tsx")));
}

// ---- los datos de las rutas con id ----
const LUB = sql("select id from lubricentros where slug = 'demo'");
const OWNER = sql("select id from usuarios where email = 'demo@fidellimotors.app'");
const SUCURSAL = sql(`select id from sucursales where lubricentro_id = '${LUB}' and activa order by nombre limit 1`);
const CLIENTE = sql(`select id from clientes where lubricentro_id = '${LUB}' order by created_at limit 1`);
const VEHICULO = sql(`select id from vehiculos where lubricentro_id = '${LUB}' order by created_at limit 1`);
const SERVICE = sql(`select id from services where lubricentro_id = '${LUB}' and tipo = 'service' and not anulado order by fecha desc limit 1`);
const PRESUPUESTO = "e5e5e5e5-0000-4000-8000-000000009002";
sql(`delete from presupuestos where id = '${PRESUPUESTO}';
  insert into presupuestos (id, lubricentro_id, sucursal_id, usuario_id, numero, fecha, validez_dias, destinatario_nombre)
  values ('${PRESUPUESTO}', '${LUB}', '${SUCURSAL}', '${OWNER}', 9002, current_date, 15, 'Prueba de esqueletos');
  insert into presupuesto_items (presupuesto_id, lubricentro_id, orden, descripcion, cantidad, precio_unitario)
  values ('${PRESUPUESTO}', '${LUB}', 1, 'Cambio de aceite y filtro', 1, 48500);`);
let limpio = false;
const limpiar = () => {
  if (limpio) return;
  limpio = true;
  try {
    sql(`delete from presupuestos where id = '${PRESUPUESTO}';`);
  } catch (e) {
    console.error("no se pudo borrar el presupuesto de prueba:", e.message);
  }
};
process.on("exit", limpiar);

// Las rutas, de la carpeta a la URL. Las de grupo «(…)» no suman segmento.
const aUrl = (dir) => {
  const rel = path.relative(path.join(RAIZ, "app"), dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s));
  const id = rel[0] === "fidelli" ? LUB : rel.includes("presupuestos") ? PRESUPUESTO : CLIENTE;
  return `/${rel.join("/")}`.replace("[id]", id).replace("[serviceId]", SERVICE).replace("[vehiculoId]", VEHICULO);
};
const rutas = carpetas.map((d) => ({ dir: d, url: aUrl(d), admin: path.relative(RAIZ, d).startsWith("app/fidelli") }));

// ---- el vigía: corre en cada documento desde el primer instante ----
// Anota, en cada cuadro, cuándo se ve por primera vez el esqueleto, cuándo
// sus piezas grises y cuándo la pantalla real (sin esqueleto y con algo
// adentro del <main>), en ms desde el comienzo de la navegación (t0 = 0) o
// desde el clic. Después de un clic, la pantalla real es la de la ruta de
// destino: hasta que cambia la URL, lo que hay es la pantalla anterior.
const VIGIA = `
window.__reiniciarVigia = (t0, destino) => {
  window.__vigia = { t0, destino, esqueleto: null, piezas: null, contenido: null, badge: null };
};
window.__reiniciarVigia(0, null);
const __visible = (el) => el && getComputedStyle(el).visibility === "visible" && el.getClientRects().length > 0;
const __cuadro = () => {
  const v = window.__vigia;
  const t = performance.now() - v.t0;
  const main = document.querySelector("main");
  if (main && (v.destino === null || location.pathname === v.destino)) {
    const e = main.querySelector("[data-esqueleto]");
    if (e && v.esqueleto === null && __visible(e)) v.esqueleto = t;
    if (e && v.piezas === null && [...e.querySelectorAll(".skeleton")].some(__visible)) v.piezas = t;
    if (!e && v.contenido === null && main.textContent.trim().length > 0) v.contenido = t;
  }
  if (v.badge === null && document.querySelector("[data-por-llamar]")) v.badge = t;
  requestAnimationFrame(__cuadro);
};
requestAnimationFrame(__cuadro);
`;

const browser = await chromium.launch();
async function sesion(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(VIGIA);
  const page = await ctx.newPage();
  estado.retraso = 0;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => /^\/(panel|fidelli)/.test(u.pathname), { timeout: 60000 });
  return page;
}

try {
  const owner = await sesion("demo@fidellimotors.app");
  const admin = await sesion("santi@fidellimotors.app");
  check("el servidor habla con Supabase a través del proxy de la prueba", estado.vistos > 0,
    `el proxy no vio ningún pedido: el servidor de ${BASE} no se armó con NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PUERTO_PROXY}`);
  if (estado.vistos === 0) throw new Error("sin proxy no hay prueba");

  // ---- 2 y 3 · cada ruta, con la URL escrita ----
  console.log(`\n── 2 y 3 · con Supabase a ${RETRASO} ms, el esqueleto va primero (URL escrita) ──`);
  for (const r of rutas) {
    const page = r.admin ? admin : owner;
    // Una vuelta sin demora: que la ruta exista, compile y responda.
    estado.retraso = 0;
    estado.soloA = null;
    await page.goto(`${BASE}${r.url}`, { waitUntil: "networkidle" });
    const destinoSinDemora = new URL(page.url()).pathname;

    estado.retraso = RETRASO;
    await page.goto(`${BASE}${r.url}`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.__vigia.contenido !== null, null, { timeout: 30000, polling: 50 }).catch(() => {});
    const v = await page.evaluate(() => window.__vigia);
    estado.retraso = 0;

    const nombre = `${path.relative(RAIZ, r.dir).replace(/^app\//, "")}${destinoSinDemora !== r.url.split("?")[0] ? ` (redirige a ${destinoSinDemora})` : ""}`;
    const ms = (x) => (x === null ? "nunca" : `${Math.round(x)} ms`);
    const resumen = `esqueleto ${ms(v.esqueleto)} · piezas ${ms(v.piezas)} · contenido ${ms(v.contenido)}`;
    console.log(`    ${resumen}`);
    if (v.contenido !== null && v.contenido < 300) {
      check(`${nombre}: no espera a la base (llega antes de los 300 ms)`, true);
    } else {
      check(`${nombre}: esqueleto, con sus piezas grises, a los 300 ms`,
        v.esqueleto !== null && v.esqueleto <= 300 && v.piezas !== null && v.piezas <= 300, resumen);
      check(`${nombre}: la pantalla real llega después y lo reemplaza`, v.contenido !== null && v.contenido >= RETRASO * 0.9, resumen);
    }
    // Se cuenta desde que se VE lo gris: un esqueleto que asoma sus piezas
    // justo antes de que llegue el contenido es exactamente el parpadeo. La
    // cabecera del esqueleto es la real y queda: esa no parpadea.
    const desde = v.piezas;
    check(`${nombre}: no parpadea (lo gris que aparece queda 250 ms o más)`,
      desde === null || v.contenido === null || v.contenido - desde >= 250, resumen);
  }

  // ---- 4 · el clic desde el menú ----
  for (const demora of [RETRASO, 60]) {
    console.log(`\n── 4${demora === 60 ? " y 3" : ""} · el clic en el menú (Supabase a ${demora} ms) ──`);
    estado.retraso = 0;
    await owner.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    for (const ruta of ["/panel/proximos", "/panel/clientes", "/panel/services", "/panel/cuenta", "/panel"]) {
      await owner.waitForTimeout(1500); // el prefetch de <Link>
      estado.retraso = demora;
      await owner.evaluate((r) => {
        const link = [...document.querySelectorAll(`a[href="${r}"]`)].find((a) => a.offsetParent !== null);
        window.__reiniciarVigia(performance.now(), r);
        link.click();
      }, ruta);
      await owner.waitForFunction((r) => location.pathname === r && window.__vigia.contenido !== null, ruta, { timeout: 30000, polling: 50 }).catch(() => {});
      const v = await owner.evaluate(() => window.__vigia);
      estado.retraso = 0;
      const resumen = `esqueleto ${Math.round(v.esqueleto ?? -1)} ms · piezas ${Math.round(v.piezas ?? -1)} ms · contenido ${Math.round(v.contenido ?? -1)} ms`;
      console.log(`    ${ruta}: ${resumen}`);
      check(`clic → ${ruta}: esqueleto a los 300 ms del clic`, v.esqueleto !== null && v.esqueleto <= 300, resumen);
      const desde = v.piezas;
      check(`clic → ${ruta}: no parpadea (lo gris queda 250 ms o más)`,
        desde !== null && v.contenido !== null && v.contenido - desde >= 250, resumen);
    }
  }

  // ---- 5 · el badge de «A quién llamar» no frena la pantalla ----
  console.log("\n── 5 · contactos_por_hacer a 4 s: la pantalla no lo espera ──");
  estado.retraso = 4000;
  estado.soloA = "/rest/v1/rpc/contactos_por_hacer";
  await owner.goto(`${BASE}/panel/proximos`, { waitUntil: "commit" });
  await owner.waitForFunction(() => window.__vigia.badge !== null && window.__vigia.contenido !== null, null, { timeout: 30000, polling: 50 }).catch(() => {});
  const vb = await owner.evaluate(() => window.__vigia);
  estado.retraso = 0;
  estado.soloA = null;
  const lista = await owner.locator("main li").count();
  check("la lista llega antes de los 2 s, sin esperar el número", lista > 0 && vb.contenido !== null && vb.contenido < 2000,
    `contenido ${Math.round(vb.contenido ?? -1)} ms · filas ${lista}`);
  check("el número aparece después, cuando llega", vb.badge !== null && vb.badge >= 4000,
    `badge ${Math.round(vb.badge ?? -1)} ms`);
} catch (e) {
  console.error(e);
  fallas++;
} finally {
  await browser.close();
  limpiar();
  proxy.close();
}

console.log(fallas ? `\n✗ ${fallas} falla(s).` : "\nTodo en verde.");
process.exit(fallas ? 1 : 0);
