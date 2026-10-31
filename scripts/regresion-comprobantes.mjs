// Comprobantes por foto/IA (20261101120000), de punta a punta contra el
// stack local. La foto/PDF de una factura de proveedor se sube, la IA
// PROPONE y el dueño CONFIRMA: ahí nace el egreso, con lo REVISADO.
//
// La rotura a mano del lado SQL vive en scripts/regresion-comprobantes.sh
// (regla 13). Este compañero prueba el camino real:
//
//   A · La API directa: `anon` no lee la tabla, no ejecuta las puertas de
//       mutación y no ve el bucket.
//   B · El navegador (Playwright): el dueño sube un comprobante, la IA
//       (el DOBLE, sin llamada real) lo lee y prellena el formulario, el
//       dueño CORRIGE el monto y confirma, y el egreso aparece en la caja
//       con el monto corregido — no con el que leyó la IA.
//
// El doble se prende con EXTRACTOR_COMPROBANTE=doble en el servidor de Next.
// Requiere el stack local con el seed y el servidor:
//   supabase start
//   EXTRACTOR_COMPROBANTE=doble npm run dev
// Correr:
//   node --no-warnings scripts/regresion-comprobantes.mjs
//
// Toca el demo (le prende el módulo Finanzas y lo restaura) y deja el
// archivo subido en el bucket (lo barre el cierre diario; `supabase db
// reset` limpia del todo).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTENEDOR = process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-comprobantes-"));

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}

const ENV = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const LUB = sql("select id from lubricentros where slug = 'demo'");
const SUPER = sql("select id from usuarios where email = 'santi@fidellimotors.app'");
const RAZON_DOBLE = "Distribuidora La Pampa S.R.L."; // lo que devuelve el doble

// El módulo Finanzas para el demo, por la puerta real, y de vuelta.
const OVERRIDES_ANTES = sql(`select plan_overrides::text from lubricentros where id = '${LUB}'`);
const sqlOverrides = (json, motivo) => `
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fijar_override_plan('${LUB}', '${json}'::jsonb, 'regresion-comprobantes.mjs · ${motivo}');
  commit;`;

function limpiarDatos() {
  // Los egresos y comprobantes de prueba (los deja postgres, que saltea el RLS).
  sql(`delete from comprobantes_recibidos where lubricentro_id = '${LUB}' and extraido->>'razon_social' = '${RAZON_DOBLE}';`);
  sql(`delete from egresos where lubricentro_id = '${LUB}' and concepto like '${RAZON_DOBLE.replaceAll("'", "''")}%';`);
}

let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
  try {
    limpiarDatos();
    if (sql(`select plan_overrides::text from lubricentros where id = '${LUB}'`) !== OVERRIDES_ANTES) {
      sql(sqlOverrides(OVERRIDES_ANTES, "restaurar"));
    }
  } catch (e) {
    console.log(`  ⚠ no se pudo restaurar el demo: ${String(e.message).split("\n")[0]}`);
  }
}
process.on("SIGINT", () => { restaurar(); process.exit(130); });

// Un PNG mínimo y válido (2×2), para subir como comprobante. El doble no lo
// mira; alcanza con que el navegador lo decodifique y lo achique.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAtTgN9N9tC5wAAAABJRU5ErkJggg==";
const PNG_PATH = path.join(TMP, "factura.png");
fs.writeFileSync(PNG_PATH, Buffer.from(PNG_B64, "base64"));

async function pedir(ruta, { metodo = "GET", token, cuerpo } = {}) {
  const r = await fetch(`${SUPA}${ruta}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { "content-type": "application/json" } : {}),
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* texto plano */ }
  return { status: r.status, texto, json };
}

let navegador;
try {
  limpiarDatos();
  sql(sqlOverrides('{"finanzas": true}', "prueba"));

  // ---------- A · la API directa ----------
  titulo("A · La API directa: anon no entra");
  {
    const t = await pedir(`/rest/v1/comprobantes_recibidos?select=id&limit=1`);
    check("anon no lee comprobantes_recibidos",
      t.status === 401 || (Array.isArray(t.json) && t.json.length === 0),
      `${t.status} ${t.texto.slice(0, 120)}`);
    const reg = await pedir(`/rest/v1/rpc/registrar_comprobante`, {
      metodo: "POST",
      cuerpo: { p_ruta: `${LUB}/x.pdf`, p_nombre: "x", p_mime: "application/pdf", p_bytes: 10 },
    });
    check("anon no ejecuta registrar_comprobante",
      reg.status === 401 || reg.json?.code === "42501" || /permission|not.*exist|find.*function/i.test(reg.texto),
      `${reg.status} ${reg.texto.slice(0, 120)}`);
    const conf = await pedir(`/rest/v1/rpc/confirmar_comprobante`, {
      metodo: "POST",
      cuerpo: { p_id: LUB, p_sucursal_id: LUB, p_monto: 1, p_concepto: "x" },
    });
    check("anon no ejecuta confirmar_comprobante",
      conf.status === 401 || conf.json?.code === "42501" || /permission|not.*exist|find.*function/i.test(conf.texto),
      `${conf.status} ${conf.texto.slice(0, 120)}`);
    const obj = await pedir(`/storage/v1/object/list/comprobantes`, { metodo: "POST", cuerpo: { prefix: "" } });
    check("anon no lista el bucket comprobantes",
      obj.status === 400 || obj.status === 401 || obj.status === 403 || (Array.isArray(obj.json) && obj.json.length === 0),
      `${obj.status} ${obj.texto.slice(0, 120)}`);
  }

  // ---------- B · el navegador ----------
  titulo("B · El dueño sube, la IA propone, el dueño corrige y confirma");
  navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Entrar como owner del demo.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "demo@fidellimotors.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 90_000 });

  await page.goto(`${BASE}/panel/finanzas/comprobantes`, { waitUntil: "networkidle" });
  check("la pantalla «Cargar desde comprobante» abre con el módulo",
    (await page.getByRole("heading", { name: "Cargar desde comprobante" }).count()) === 1);

  // Subir el PNG: dispara achicar → subir → registrar → leer (doble).
  await page.setInputFiles('input[aria-label="Elegir comprobante"]', PNG_PATH);

  // El formulario de revisión aparece cuando terminó la lectura.
  await page.waitForSelector("#c-concepto", { timeout: 60_000 });
  const concepto = await page.locator("#c-concepto").inputValue();
  const monto = await page.locator("#c-monto").inputValue();
  check("el concepto se prellenó con el proveedor que leyó la IA",
    concepto.includes("Distribuidora La Pampa"), concepto);
  check("el monto se prellenó con el total leído (121.000)",
    monto.replace(/\./g, "") === "121000", monto);
  check("se ve «Lo que leímos» con el total",
    (await page.getByText("Lo que leímos").count()) === 1);

  // El dueño CORRIGE el monto: tiene que ganar lo revisado, no lo leído.
  await page.fill("#c-monto", "55000");
  await page.getByRole("button", { name: "Confirmar egreso" }).click();
  await page.waitForURL(/\/panel\/finanzas(\?|$)/, { timeout: 60_000 });

  const texto = await page.locator("body").innerText();
  check("el egreso aparece en la caja con el proveedor", texto.includes("Distribuidora La Pampa"));
  check("y con el monto CORREGIDO (55.000), no el leído (121.000)",
    texto.includes("55.000") && !texto.includes("121.000"), "");

  // En la base: el comprobante quedó confirmado y atado a un egreso de 55000.
  const estado = sql(`select estado from comprobantes_recibidos
    where lubricentro_id = '${LUB}' and extraido->>'razon_social' = '${RAZON_DOBLE}'
    order by created_at desc limit 1`);
  check("el comprobante quedó confirmado", estado === "confirmado", estado);
  const montoEg = sql(`select c.id from comprobantes_recibidos c
    join egresos e on e.id = c.egreso_id
    where c.lubricentro_id = '${LUB}' and e.monto = 55000 and e.concepto like '${RAZON_DOBLE.replaceAll("'", "''")}%'
    order by c.created_at desc limit 1`);
  check("el egreso nació con el monto corregido y atado al comprobante", montoEg !== "", montoEg);

  await ctx.close();
} catch (e) {
  check("la corrida terminó sin romperse", false, String(e.message ?? e).split("\n")[0]);
} finally {
  if (navegador) await navegador.close();
  restaurar();
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${fallas === 0 ? "✓ TODO EN VERDE" : `✗ ${fallas} FALLA(S)`}`);
process.exit(fallas === 0 ? 0 : 1);
