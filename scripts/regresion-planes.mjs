// Red de regresión del control por plan (1B) — LA CAPA DE APLICACIÓN.
//
// La capa RLS y la invariancia de la retención (2A) corren solas en cada
// `supabase db reset` (viven en supabase/verificaciones.sql); esto cubre
// lo que SQL no puede ver: sidebar filtrado, BloqueoPlan por URL directa,
// mensajes de las Server Actions, overrides desde /fidelli y el wizard.
//
// Requiere: stack local (supabase db reset) + servidor Next:
//   npm run build && npx next start -p 3010
// Correr:  CAPS=/tmp node scripts/regresion-planes.mjs
// Muta el plan del demo y lo restaura al final; deja solo filas de
// auditoría en cambios_override_plan (inofensivas, se van con el reset).
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3010";
const CAPS = process.env.CAPS ?? "/tmp";
const sql = (q) =>
  execSync(
    `docker exec supabase_db_fidelli-motors psql -U postgres -d postgres -X -q -tA -c "${q.replace(/"/g, '\\"')}"`,
    { encoding: "utf8" },
  ).trim();

let fallas = 0;
const check = (nombre, cond) => {
  console.log(`${cond ? "✓" : "✗ FALLA"} ${nombre}`);
  if (!cond) fallas++;
};

const browser = await chromium.launch();

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/panel|fidelli/, { timeout: 15000 });
  return { ctx, page };
}

const LUB = sql("select id from lubricentros where slug='demo'");
const BASIC = sql("select id from planes where nombre='Basic'");
const VIEJO = sql("select id from planes where nombre='Fidelli Motors'");

// ═══ 1 · BASELINE: el tenant heredado no perdió nada ═══
console.log("\n═══ 1 · Baseline (plan heredado) ═══");
const demo = await login("demo@fidellimotors.app");
const sidebar = demo.page.locator("aside");
check("sidebar muestra Fidelización", (await sidebar.getByText("Fidelización").count()) === 1);
check("sidebar muestra Diseño de experiencia", (await sidebar.getByText("Diseño de experiencia").count()) === 1);
await demo.page.goto(`${BASE}/panel/cuenta`);
await demo.page.waitForSelector("text=Qué incluye");
const cuentaTexto = await demo.page.locator("main").innerText();
check("cuenta: 'sin límite' de sucursales", /sin límite/i.test(cuentaTexto));
check("cuenta: sin la leyenda de upsell (todo incluido)", !/¿Te interesa algo/.test(cuentaTexto));
await demo.page.screenshot({ path: `${CAPS}/1-baseline-cuenta.png`, fullPage: true });

// ═══ 2 · Demo pasa a Basic ═══
console.log("\n═══ 2 · Basic: el menú se achica y la URL directa explica ═══");
sql(`update suscripciones set plan_id='${BASIC}' where lubricentro_id='${LUB}'`);
await demo.page.goto(`${BASE}/panel`);
check("sidebar SIN Fidelización", (await sidebar.getByText("Fidelización").count()) === 0);
check("sidebar SIN Diseño de experiencia", (await sidebar.getByText("Diseño de experiencia").count()) === 0);
check("sidebar conserva Productos", (await sidebar.getByText("Productos").count()) === 1);

await demo.page.goto(`${BASE}/panel/fidelizacion`);
const bloqueo = await demo.page.locator("main").innerText();
check("URL directa → 'Fidelliza no está en tu plan'", /Fidelliza no está en tu plan/.test(bloqueo));
check("…con la salida por WhatsApp", /Preguntar por WhatsApp/.test(bloqueo));
await demo.page.screenshot({ path: `${CAPS}/2-bloqueo-plan.png` });

await demo.page.goto(`${BASE}/panel/experiencia`);
check("experiencia también bloqueada", /no está en tu plan/.test(await demo.page.locator("main").innerText()));

await demo.page.goto(`${BASE}/panel/cuenta`);
const cuentaBasic = await demo.page.locator("main").innerText();
check("cuenta: 'Hasta 1 sucursal'", /Hasta 1 sucursal/.test(cuentaBasic));
check("cuenta: aparece el upsell", /¿Te interesa algo/.test(cuentaBasic));
await demo.page.screenshot({ path: `${CAPS}/3-cuenta-basic.png`, fullPage: true });

// ═══ 3 · La Server Action a mano: crear la 3ª sucursal (RLS → mensaje claro) ═══
console.log("\n═══ 3 · Acción rechaza con mensaje entendible ═══");
await demo.page.goto(`${BASE}/panel/sucursales`);
await demo.page.getByRole("button", { name: /nueva sucursal|agregar/i }).first().click().catch(() => {});
// el formulario puede ser inline o dialog: buscamos el campo de nombre
const campoNombre = demo.page.locator('input[name="nombre"]').first();
await campoNombre.waitFor({ timeout: 5000 });
await campoNombre.fill("Sucursal Tercera");
await demo.page.getByRole("button", { name: /guardar|crear/i }).first().click();
await demo.page.waitForTimeout(1200);
const conError = await demo.page.locator("body").innerText();
check(
  "el rechazo dice el plan y la salida (no 'row-level security')",
  /Tu plan permite 1 sucursal/.test(conError) && !/row-level security/i.test(conError),
);
const cuantas = sql(`select count(*) from sucursales where lubricentro_id='${LUB}'`);
check("y la base quedó como estaba (2 sucursales)", cuantas === "2");
await demo.page.screenshot({ path: `${CAPS}/4-sucursal-rechazo.png` });

// ═══ 4 · Override parcial desde /fidelli ═══
console.log("\n═══ 4 · Override: una sola feature, tres estados ═══");
const santi = await login("santi@fidellimotors.app");
await santi.page.goto(`${BASE}/fidelli/${LUB}?pestana=suscripcion`);
await santi.page.waitForSelector("text=Plan y overrides");
await santi.page.selectOption("#ov-premios", "si");
await santi.page.fill("#ov-motivo", "Prueba E2E del bloque 1B: cortesía puntual de Fidelliza.");
await santi.page.getByRole("button", { name: /guardar overrides/i }).click();
await santi.page.waitForTimeout(1500);
check("override guardado en la base", sql(`select plan_overrides->>'premios' from lubricentros where id='${LUB}'`) === "true");
check("las demás claves NO están (parcial)", sql(`select count(*) from jsonb_object_keys((select plan_overrides from lubricentros where id='${LUB}'))`) === "1");
await santi.page.screenshot({ path: `${CAPS}/5-fidelli-overrides.png`, fullPage: true });

await demo.page.goto(`${BASE}/panel`);
check("demo Basic + override: Fidelización REAPARECE", (await sidebar.getByText("Fidelización").count()) === 1);
check("…y experiencia sigue oculta (no arrastró nada)", (await sidebar.getByText("Diseño de experiencia").count()) === 0);
await demo.page.screenshot({ path: `${CAPS}/6-sidebar-override.png` });

// vuelta a "según el plan"
await santi.page.goto(`${BASE}/fidelli/${LUB}?pestana=suscripcion`);
await santi.page.waitForSelector("#ov-premios");
await santi.page.selectOption("#ov-premios", "plan");
await santi.page.fill("#ov-motivo", "Prueba E2E: se vuelve a lo que diga el plan.");
await santi.page.getByRole("button", { name: /guardar overrides/i }).click();
await santi.page.waitForTimeout(1500);
check("'Según el plan' borró la clave", sql(`select plan_overrides::text from lubricentros where id='${LUB}'`) === "{}");
const historial = sql(`select count(*) from cambios_override_plan where lubricentro_id='${LUB}'`);
check("historial con los 2 cambios", historial === "2");
await demo.page.goto(`${BASE}/panel`);
check("Fidelización se volvió a esconder", (await sidebar.getByText("Fidelización").count()) === 0);

// ═══ 5 · El wizard: heredados afuera y tope avisado ═══
console.log("\n═══ 5 · Wizard de alta ═══");
await santi.page.goto(`${BASE}/fidelli/nuevo`);
await santi.page.fill("#marca", "Prueba Wizard");
await santi.page.fill("#slug", "prueba-wizard");
await santi.page.waitForTimeout(900); // verificación de slug
await santi.page.getByRole("button", { name: "Continuar" }).click();
await santi.page.fill("#suc-nombre-0", "Centro");
await santi.page.getByRole("button", { name: /agregar otra|sumar sucursal|otra sucursal/i }).click().catch(() => {});
const segunda = santi.page.locator("#suc-nombre-1");
if (await segunda.count()) await segunda.fill("Norte");
await santi.page.fill("#owner-nombre", "Owner Prueba");
await santi.page.fill("#owner-email", "owner@prueba.test");
await santi.page.getByRole("button", { name: "Continuar" }).click();
await santi.page.waitForTimeout(400);
const paso3 = await santi.page.locator("body").innerText();
check("el wizard NO ofrece el plan heredado", !/Fidelli Motors\b/.test(paso3.split("Plan")[1] ?? paso3) || !(await santi.page.locator("select, [role=radio], label").getByText("Fidelli Motors").count()));
check("ofrece Basic / Pro / Ultra", /Basic/.test(paso3) && /Pro/.test(paso3) && /Ultra/.test(paso3));
// elegir Basic con 2 sucursales
const selectorPlan = santi.page.locator("select#alta-plan, select[name=plan], select").first();
try {
  const opciones = await selectorPlan.locator("option").allInnerTexts();
  const idx = opciones.findIndex((o) => /Basic/.test(o));
  if (idx >= 0) await selectorPlan.selectOption({ index: idx });
} catch { /* el plan puede ser radio/tarjeta */ }
await santi.page.getByText(/Basic/).first().click().catch(() => {});
await santi.page.waitForTimeout(400);
const avisoTope = await santi.page.locator("body").innerText();
const hayAviso = /permite 1 sucursal/.test(avisoTope);
check("aviso del tope con Basic + 2 sucursales", hayAviso);
const botonCrear = santi.page.getByRole("button", { name: /crear lubricentro/i });
check("y el botón de crear queda apagado", await botonCrear.isDisabled().catch(() => false));
await santi.page.screenshot({ path: `${CAPS}/7-wizard-tope.png`, fullPage: true });

// ═══ 6 · Restauración: el tenant existente no perdió nada ═══
console.log("\n═══ 6 · Restauración ═══");
sql(`update suscripciones set plan_id='${VIEJO}' where lubricentro_id='${LUB}'`);
await demo.page.goto(`${BASE}/panel`);
check("sidebar completo de nuevo", (await sidebar.getByText("Fidelización").count()) === 1 && (await sidebar.getByText("Diseño de experiencia").count()) === 1);

await browser.close();
console.log(fallas === 0 ? "\n══ FASE 1: TODO EN VERDE ══" : `\n══ FASE 1: ${fallas} FALLAS ══`);
process.exit(fallas === 0 ? 0 : 1);
