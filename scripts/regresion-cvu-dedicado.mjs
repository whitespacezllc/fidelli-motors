// La cuenta de cobro del tenant, de punta a punta, con navegador
// (20261031100000). Contra `next dev` y el doble de Cresium, que este
// script levanta adentro (puerto 4010): ninguna llamada sale a Cresium.
//
//   A · /fidelli: la ficha del demo ofrece «Emitir la cuenta de cobro» con
//       el alias propuesto; se emite contra el doble y la tarjeta muestra
//       el alias y el CVU (si el demo ya tiene cuenta de una corrida
//       anterior, se saltea la emisión y se le da la cuenta al doble).
//   B · /panel/suscripcion (390 táctil y 1280): mensual, «Quiero pagar» no
//       llama a Cresium, la tarjeta dice «Transferí exactamente $X» con el
//       alias fijo; un depósito del monto exacto acredita y la pantalla
//       pasa sola a «Al día»; otro monto deja el aviso «lo estamos
//       revisando».
//   C · /fidelli: la alerta del hub y la lista «Depósitos a confirmar» de
//       Cobranzas; acreditar uno a un período y descartar otro con nota.
//
// Requiere: stack local (supabase db reset) + next dev en BASE_URL con
// CRESIUM_BASE_URL=http://localhost:4010 en .env.local.
//   BASE_URL=http://localhost:3270 node --no-warnings scripts/regresion-cvu-dedicado.mjs
//   CAPTURAS=docs/capturas/cvu-dedicado … para guardar capturas.
//
// ⚠ DEJA RASTRO: el demo queda con su cuenta de cobro, con pagos y con
// filas en depositos_cresium (el libro no se borra). `supabase db reset`
// es la única limpieza.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.resolve(process.env.CAPTURAS) : null;
const WEBHOOK = `${BASE}/api/cresium/webhook`;

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()];
    }));
if (env.CRESIUM_BASE_URL !== "http://localhost:4010") {
  console.error("En .env.local tiene que estar CRESIUM_BASE_URL=http://localhost:4010 (el doble): esta prueba NO puede correr contra Cresium de verdad.");
  process.exit(1);
}

const sql = (q) =>
  execSync(
    `docker exec supabase_db_fidelli-motors psql -U postgres -d postgres -X -q -tA -c "${q.replace(/"/g, '\\"')}"`,
    { encoding: "utf8" },
  ).trim();

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};

process.env.PUERTO = "4010";
process.env.WEBHOOK_URL = WEBHOOK;
const cresium = await import("./doble-cresium.mjs");
await cresium.arrancar();

const DEMO = sql(`select id from lubricentros where slug='demo'`);
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
const SESION_OWNER = await sesionDe("demo@fidellimotors.app", "**/panel**");
const SESION_FIDELLI = await sesionDe("santi@fidellimotors.app", "**/fidelli**");

async function abrir(vista, sesion) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({
    viewport: vista, deviceScaleFactor: 2, locale: "es-AR",
    hasTouch: tactil, isMobile: tactil, storageState: sesion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(45_000);
  const tocar = (locator) => (tactil ? locator.tap() : locator.click());
  return { ctx, page, tocar };
}

async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`), fullPage: true });
}

const VISTAS = { movil: { width: 390, height: 844 }, escritorio: { width: 1280, height: 800 } };
const sinHorizontal = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

try {
  // ── A · La ficha emite la cuenta ─────────────────────────────────
  console.log("── A · /fidelli: la cuenta de cobro ──");
  {
    const { ctx, page, tocar } = await abrir(VISTAS.escritorio, SESION_FIDELLI);
    await page.goto(`${BASE}/fidelli/${DEMO}?tab=suscripcion`, { waitUntil: "networkidle" });
    const yaTiene = sql(`select coalesce(cresium_cvu,'') from lubricentros where id='${DEMO}'`);
    if (yaTiene) {
      console.log(`  ◦ el demo ya tiene cuenta (${yaTiene}): se la damos a conocer al doble`);
      cresium.registrarCvu(yaTiene, sql(`select cresium_alias from lubricentros where id='${DEMO}'`),
        Number(sql(`select cresium_deposit_address_id from lubricentros where id='${DEMO}'`)));
    } else {
      const campo = page.getByLabel("Alias de la cuenta");
      check("la ficha propone un alias desde el slug", (await campo.inputValue()) === "fm.demo", await campo.inputValue());
      await page.getByText("Libre entre nuestros lubricentros").waitFor();
      await tocar(page.getByRole("button", { name: "Emitir la cuenta de cobro" }));
      await page.getByText("Emitida el").waitFor({ timeout: 20_000 });
      const fila = sql(`select cresium_alias || '/' || cresium_cvu || '/' || cresium_deposit_address_id from lubricentros where id='${DEMO}'`);
      check("la base guardó los tres datos juntos", /^fm\.demo\/[0-9]{22}\/[0-9]+$/.test(fila), fila);
    }
    await page.goto(`${BASE}/fidelli/${DEMO}?tab=suscripcion`, { waitUntil: "networkidle" });
    check("la tarjeta muestra el alias y el CVU", await page.getByText("fm.demo").isVisible() &&
      await page.getByText(/^[0-9]{22}$/).first().isVisible());
    check("y ya no ofrece emitir", (await page.getByRole("button", { name: "Emitir la cuenta de cobro" }).count()) === 0);
    await capturar(page, "ficha-cuenta-1280");
    await ctx.close();
  }
  const CVU = sql(`select cresium_cvu from lubricentros where id='${DEMO}'`);
  const mensual = Number(sql(`select total from montos_ofrecidos('${DEMO}') where periodo='mensual'`));
  const anual = Number(sql(`select total from montos_ofrecidos('${DEMO}') where periodo='anual'`));
  // Que el demo tenga algo que pagar: el demo está afuera del reloj, así que
  // la pantalla de éxito (la última orden PAID) se queda para siempre. Para
  // esta prueba se cierran TODAS sus órdenes internas (es el estado de una
  // renovación que ya pasó) y se lo deja venciendo en 5 días.
  const prepararDemo = () => {
    sql(`update suscripciones set vencimiento = current_date + 5 where lubricentro_id='${DEMO}'`);
    sql(`update cresium_ordenes set estado='CERRADA', actualizado_at=now() where lubricentro_id='${DEMO}' and deposit_address_id is not null and estado <> 'CERRADA'`);
  };
  prepararDemo();

  // ── B · La pantalla de pago del dueño ────────────────────────────
  for (const [nombre, vista] of Object.entries(VISTAS)) {
    console.log(`── B · /panel/suscripcion a ${vista.width} ──`);
    const { ctx, page, tocar } = await abrir(vista, SESION_OWNER);
    await page.goto(`${BASE}/panel/suscripcion`, { waitUntil: "networkidle" });
    check("sin scroll horizontal", await sinHorizontal(page));
    await tocar(page.getByRole("button", { name: /^Mensual/ }));
    const ordenesAntes = Number(sql(`select count(*) from cresium_ordenes where lubricentro_id='${DEMO}'`));
    await tocar(page.getByRole("button", { name: "Quiero pagar" }));
    await page.getByRole("heading", { name: /Transferí exactamente/ }).waitFor({ timeout: 20_000 });
    const titulo = await page.getByRole("heading", { name: /Transferí exactamente/ }).textContent();
    check("la tarjeta dice el monto exacto del mensual", titulo.replace(/ /g, " ").includes(new Intl.NumberFormat("es-AR").format(mensual)), titulo);
    check("con el alias fijo del tenant", await page.getByText("fm.demo").isVisible());
    check("y el CVU", await page.getByText(CVU).isVisible());
    const orden = sql(`select external_id || '|' || estado || '|' || coalesce(deposit_address_id::text,'') from cresium_ordenes where lubricentro_id='${DEMO}' order by created_at desc limit 1`);
    check("la orden es interna (cvu:…, con la cuenta) y no viajó a Cresium", /^cvu:.*\|NOT_PAID\|[0-9]+$/.test(orden) &&
      Number(sql(`select count(*) from cresium_ordenes where lubricentro_id='${DEMO}'`)) === ordenesAntes + 1, orden);
    check("sin scroll horizontal con la tarjeta", await sinHorizontal(page));
    await capturar(page, `pago-esperando-${vista.width}`);

    // El depósito exacto: la pantalla cambia sola.
    const vencAntes = sql(`select vencimiento from suscripciones where lubricentro_id='${DEMO}'`);
    const r = await cresium.simularDepositoDedicado(CVU, mensual, WEBHOOK);
    check("el webhook del depósito exacto → 200", r.status === 200, String(r.status));
    await page.getByText("Tu suscripción está al día hasta el").waitFor({ timeout: 25_000 });
    const esperado = sql(`select to_char((date '${vencAntes}' + interval '1 month')::date, 'YYYY-MM-DD')`);
    check(`el vencimiento se movió un mes (${esperado})`, sql(`select vencimiento from suscripciones where lubricentro_id='${DEMO}'`) === esperado);
    check("la pantalla pasó sola a «Al día»", await page.getByText("Al día").first().isVisible());
    await capturar(page, `pago-al-dia-${vista.width}`);

    // Otro monto: el aviso.
    const r2 = await cresium.simularDepositoDedicado(CVU, mensual + 777, WEBHOOK);
    check("el webhook de otro monto → 200", r2.status === 200, String(r2.status));
    await page.reload({ waitUntil: "networkidle" });
    check("el dueño ve que su plata llegó y está en revisión", await page.getByText(/lo estamos revisando/).isVisible());
    await capturar(page, `pago-en-revision-${vista.width}`);
    await ctx.close();
    // Para la segunda vista: que vuelva a tener algo que pagar.
    prepararDemo();
  }
  check("el anual también está ofrecido", anual > mensual, `${mensual} / ${anual}`);

  // ── C · Fidelli decide ───────────────────────────────────────────
  console.log("── C · /fidelli: los depósitos a confirmar ──");
  {
    const { ctx, page, tocar } = await abrir(VISTAS.escritorio, SESION_FIDELLI);
    await page.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
    check("el hub avisa", await page.getByText(/depósitos? esperan? que confirmes/).isVisible());
    await page.goto(`${BASE}/fidelli/cobranzas`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Depósitos a confirmar" }).waitFor();
    const pendientes = Number(sql(`select count(*) from depositos_cresium where lubricentro_id='${DEMO}' and estado='a_confirmar'`));
    check("hay al menos dos del demo (uno por vista)", pendientes >= 2, String(pendientes));
    await capturar(page, "cobranzas-depositos-1280");

    // Las filas se localizan por el id del depósito (el hidden del form):
    // al resolverse, el artículo cambia de contenido y un locator por texto
    // pasaría a apuntar a la fila siguiente.
    const pendientesDemo = sql(`select string_agg(id::text, ',' order by recibido_at) from depositos_cresium where lubricentro_id='${DEMO}' and estado='a_confirmar'`).split(",");
    const fila = (id) => page.locator("article", { has: page.locator(`input[name="deposito_id"][value="${id}"]`) });
    const vencAntes = sql(`select vencimiento from suscripciones where lubricentro_id='${DEMO}'`);
    const pagosAntes = Number(sql(`select count(*) from pagos where lubricentro_id='${DEMO}'`));
    await tocar(fila(pendientesDemo[0]).getByRole("button", { name: "Acreditar" }));
    await page.getByText(/Acreditado\. El vencimiento quedó en/).first().waitFor({ timeout: 15_000 });
    const esperado = sql(`select to_char((date '${vencAntes}' + interval '1 month')::date, 'YYYY-MM-DD')`);
    check("acreditar a mano movió el vencimiento un mes", sql(`select vencimiento from suscripciones where lubricentro_id='${DEMO}'`) === esperado);
    check("y dejó un pago con la transacción y quién decidió", Number(sql(`select count(*) from pagos p where p.lubricentro_id='${DEMO}' and p.origen='cresium' and p.registrado_por is not null`)) >= 1 &&
      Number(sql(`select count(*) from pagos where lubricentro_id='${DEMO}'`)) === pagosAntes + 1);

    const segunda = fila(pendientesDemo[1]);
    await segunda.getByLabel("Descartar, con una nota").fill("prueba: transferencia equivocada, se devuelve");
    await tocar(segunda.getByRole("button", { name: "Descartar" }));
    await page.getByText(/Descartado\./).first().waitFor({ timeout: 15_000 });
    check("descartar no tocó pagos", Number(sql(`select count(*) from pagos where lubricentro_id='${DEMO}'`)) === pagosAntes + 1);
    check("y quedó en el libro con la nota",
      Number(sql(`select count(*) from depositos_cresium where lubricentro_id='${DEMO}' and estado='descartado' and nota like 'prueba:%'`)) >= 1);
    await ctx.close();
  }
} finally {
  await navegador.close();
  cresium.parar();
}

console.log(fallas === 0 ? "\nTodo en verde." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);
