// La pantalla de pago y Mi cuenta en cuatro solapas (30/10/2026), con
// navegador, contra `next dev` y el seed. No levanta ningún doble: lo que
// mira es la forma, en 390 táctil y en 1280.
//
//   A · /panel/suscripcion del demo: el mensual viene elegido, el anual
//       vende el ahorro en pesos y «12 meses al precio de N», el desglose
//       dice el total del período elegido, hay «Quiero pagar» si todavía no
//       tiene cuenta de cobro (y no lo hay si la tiene), y no hay scroll
//       horizontal.
//   B · /panel/cuenta: cuatro solapas por URL; Cuenta (la persona:
//       datos, apariencia, seguridad, legales al pie), Plan y pagos (el
//       plan, «Pagar o renovar», los pagos), Tu negocio (la marca, la
//       página pública, la empresa con presupuestos), Calcos (su ruta con
//       la misma barra); una solapa que no existe cae en Cuenta.
//
//   BASE_URL=http://localhost:3270 node --no-warnings scripts/regresion-pago-cuenta.mjs
//   CAPTURAS=docs/capturas/pago-cuenta … para guardar capturas.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const sql = (q) =>
  execSync(
    `docker exec supabase_db_fidelli-motors psql -U postgres -d postgres -X -q -tA -c "${q.replace(/"/g, '\\"')}"`,
    { encoding: "utf8" },
  ).trim();
// El demo puede venir con su cuenta de cobro de una corrida anterior de
// regresion-cvu-dedicado.mjs (el libro no se borra): la pantalla cambia de
// forma y la prueba lo contempla. Y para ver el selector, el demo tiene que
// tener algo por pagar: sin orden PAID viva ni pago de la última media hora.
const DEMO = sql(`select id from lubricentros where slug='demo'`);
const TIENE_CUENTA = sql(`select cresium_cvu is not null from lubricentros where id='${DEMO}'`) === "t";
const prepararDemo = () => {
  sql(`update suscripciones set vencimiento = current_date + 5 where lubricentro_id='${DEMO}'`);
  sql(`update cresium_ordenes set estado='CERRADA', actualizado_at=now() where lubricentro_id='${DEMO}' and suscripcion_id is not null and estado <> 'CERRADA'`);
  sql(`update pagos set created_at = created_at - interval '1 hour' where lubricentro_id='${DEMO}' and created_at > now() - interval '30 minutes'`);
};
const DIR_CAPTURAS = process.env.CAPTURAS ? path.resolve(process.env.CAPTURAS) : null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function sesionDe(email, destino) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(45_000);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "demo1234");
  await p.click('button[type="submit"]');
  await p.waitForURL(destino, { timeout: 20_000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}
const SESION = await sesionDe("demo@fidellimotors.app", "**/panel**");

async function abrir(vista) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({
    viewport: vista, deviceScaleFactor: 2, locale: "es-AR",
    hasTouch: tactil, isMobile: tactil, storageState: SESION,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(45_000);
  return { ctx, page };
}
async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`), fullPage: true });
}
const sinHorizontal = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const VISTAS = { movil: { width: 390, height: 844 }, escritorio: { width: 1280, height: 800 } };

try {
  for (const vista of Object.values(VISTAS)) {
    console.log(`── A · /panel/suscripcion a ${vista.width} ──`);
    // Cada vista arranca igual: tocar el anual en la anterior dejó una
    // orden interna abierta, y la pantalla la recuerda como elección.
    prepararDemo();
    const { ctx, page } = await abrir(vista);
    await page.goto(`${BASE}/panel/suscripcion`, { waitUntil: "networkidle" });
    const mensual = page.getByRole("button", { name: /^Mensual/ });
    const anual = page.getByRole("button", { name: /^Anual/ });
    check("el mensual viene elegido por defecto", (await mensual.getAttribute("aria-pressed")) === "true");
    check("y el anual no", (await anual.getAttribute("aria-pressed")) === "false");
    const textoAnual = (await anual.textContent()) ?? "";
    check("el anual dice el ahorro EN PESOS", /Ahorrás ARS [0-9.]+/.test(textoAnual), textoAnual);
    check("y «12 meses al precio de N»", /12 meses al precio de \d+/.test(textoAnual), textoAnual);
    check("el mensual dice que se renueva cada 30 días", /cada 30 días/.test((await mensual.textContent()) ?? ""));
    // El desglose sigue al selector: el total del mensual, y al tocar el
    // anual, el del anual.
    const totalDe = async () => (await page.getByText("Total a transferir").locator("..").textContent()) ?? "";
    const precioMensual = ((await mensual.textContent()) ?? "").match(/ARS [0-9.]+/)?.[0];
    check("el desglose dice el total del mensual", precioMensual !== undefined && (await totalDe()).includes(precioMensual), await totalDe());
    await (vista.width < 768 ? anual.tap() : anual.click());
    const precioAnual = textoAnual.match(/ARS [0-9.]+ por 12 meses/)?.[0]?.replace(" por 12 meses", "");
    check("y al elegir el anual, el del anual", precioAnual !== undefined && (await totalDe()).includes(precioAnual), await totalDe());
    if (TIENE_CUENTA) {
      check("con cuenta de cobro no hay botón: la cuenta y el monto exacto están a la vista",
        (await page.getByRole("button", { name: "Quiero pagar" }).count()) === 0 &&
          await page.getByRole("heading", { name: /Transferí exactamente/ }).isVisible());
    } else {
      check("sin cuenta de cobro todavía hay «Quiero pagar» (pago único)", (await page.getByRole("button", { name: "Quiero pagar" }).count()) === 1);
    }
    check("sin scroll horizontal", await sinHorizontal(page));
    await capturar(page, `pago-${vista.width}`);
    await ctx.close();
  }

  for (const vista of Object.values(VISTAS)) {
    console.log(`── B · /panel/cuenta a ${vista.width} ──`);
    const { ctx, page } = await abrir(vista);
    await page.goto(`${BASE}/panel/cuenta`, { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Secciones de Mi cuenta" });
    const nombres = await nav.getByRole("link").allTextContents();
    check("cuatro solapas, en orden", nombres.join("|") === "Cuenta|Plan y pagos|Tu negocio|Calcos", nombres.join("|"));
    check("Cuenta es la abierta", (await nav.getByRole("link", { name: "Cuenta" }).getAttribute("aria-current")) === "page");
    for (const t of ["Tus datos", "Apariencia", "Seguridad"]) {
      check(`Cuenta tiene «${t}»`, await page.getByRole("heading", { name: t }).isVisible());
    }
    check("y no tiene el plan ni la marca", (await page.getByRole("heading", { name: "Tu plan" }).count()) === 0 && (await page.getByRole("heading", { name: "Tu marca" }).count()) === 0);
    check("los legales al pie", (await page.getByRole("link", { name: "Términos" }).count()) === 1 && (await page.getByRole("link", { name: "Privacidad" }).count()) === 1);
    check("sin scroll horizontal", await sinHorizontal(page));
    await capturar(page, `cuenta-${vista.width}`);

    await page.goto(`${BASE}/panel/cuenta?tab=plan`, { waitUntil: "networkidle" });
    check("Plan y pagos es la abierta", (await nav.getByRole("link", { name: "Plan y pagos" }).getAttribute("aria-current")) === "page");
    check("tiene «Tu plan» y «Tus pagos»", await page.getByRole("heading", { name: "Tu plan" }).isVisible() && await page.getByRole("heading", { name: "Tus pagos" }).isVisible());
    check("con «Pagar o renovar» a la pantalla de pago", (await page.getByRole("link", { name: "Pagar o renovar" }).getAttribute("href")) === "/panel/suscripcion");
    check("y no tiene los datos de la persona", (await page.getByRole("heading", { name: "Tus datos" }).count()) === 0);
    check("sin scroll horizontal", await sinHorizontal(page));
    await capturar(page, `cuenta-plan-${vista.width}`);

    await page.goto(`${BASE}/panel/cuenta?tab=negocio`, { waitUntil: "networkidle" });
    check("Tu negocio es la abierta", (await nav.getByRole("link", { name: "Tu negocio" }).getAttribute("aria-current")) === "page");
    check("tiene «Tu marca» y la página pública", await page.getByRole("heading", { name: "Tu marca" }).isVisible() && (await page.getByText("Tu página pública").count()) >= 1);
    check("sin scroll horizontal", await sinHorizontal(page));
    await capturar(page, `cuenta-negocio-${vista.width}`);

    await page.goto(`${BASE}/panel/cuenta?tab=loquesea`, { waitUntil: "networkidle" });
    check("una solapa que no existe cae en Cuenta", (await nav.getByRole("link", { name: "Cuenta" }).getAttribute("aria-current")) === "page");

    await (vista.width < 768 ? nav.getByRole("link", { name: "Calcos" }).tap() : nav.getByRole("link", { name: "Calcos" }).click());
    await page.waitForURL("**/panel/cuenta/calcos");
    check("Calcos es su ruta, con la misma barra", (await page.getByRole("navigation", { name: "Secciones de Mi cuenta" }).getByRole("link", { name: "Calcos" }).getAttribute("aria-current")) === "page");
    check("sin scroll horizontal en Calcos", await sinHorizontal(page));
    await ctx.close();
  }
} finally {
  await navegador.close();
}

console.log(fallas === 0 ? "\nTodo en verde." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
