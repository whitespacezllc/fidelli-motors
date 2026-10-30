// Service de caja + mecánica en UNA carga, de punta a punta en el navegador,
// contra el stack local (regla 13: una prueba que nunca se vio en rojo no
// existe — esta se vio en rojo sobre el front de `develop`, donde el cartón
// de la caja no ofrece la pregunta).
//
// Lo que cubre:
//   B · La feature caja prendida en el demo (por SQL, la puerta real); el
//       demo ya tiene 'mecanica' por su plan.
//   C · La carga en 390 táctil: el cartón de la caja ofrece «¿Se le hizo
//       algo de mecánica?» (y el de una mecánica suelta, no); tildada, el
//       teclado de renglones no repite el aceite de caja pero sí ofrece
//       batería, líquido de frenos y refrigerante (que en el cartón de
//       aceite se esconden); un renglón escribe su línea; la
//       previsualización muestra los DOS papeles, nombra el plazo de cada
//       uno y el botón dice «Confirmar service de caja y mecánica»; el
//       guardado dice «Service de caja y mecánica guardados» con el enlace
//       a la mecánica; y en la base la pareja nació junta (misma fecha, km,
//       sucursal y created_at, vinculada por cargado_con_id).
//   D · El detalle de las dos mitades («Misma visita» en las dos
//       direcciones, nombrando el service de caja), el aviso al anular (en
//       las dos), Editar la caja (el aviso, y corregir los kilómetros los
//       copia a la mecánica) y Editar la mecánica (el aviso que manda a
//       editar el service de caja).
//   E · La página del cliente: el historial tiene la caja y la mecánica de
//       la misma fecha.
//   F · Todos los dispositivos (360, 390, 820, 1280): la pregunta abierta en
//       una caja no produce scroll horizontal.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-caja-mecanica.mjs
//   BASE_URL=http://localhost:3250 node --no-warnings scripts/regresion-caja-mecanica.mjs
//   CAPTURAS=1 …   (además deja las capturas en docs/capturas/caja-mecanica/)
//   DEJAR=1 …      no restaura: deja la feature prendida y la pareja cargada
//
// TOCA DATOS DEL DEMO LOCAL —prende la feature y carga una caja con su
// mecánica en el ABC 123— y LOS RESTAURA AL FINAL, pase lo que pase: el SQL
// de restauración se escribe en un archivo temporal apenas se sabe qué se
// tocó, corre en el `finally`, ante Ctrl-C, y al arrancar si quedó de una
// corrida que murió. El override deja su fila en `cambios_override_plan`
// (es auditoría y no se borra).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/caja-mecanica") : null;
const DEJAR = Boolean(process.env.DEJAR);
const ARCHIVO_RESTAURAR = path.join(os.tmpdir(), "fm-regresion-caja-mecanica-restaurar.sql");

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const fmt = (n) => n.toLocaleString("es-AR");
const MARCA_DE_PRUEBA = "Zzcajamec";

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}
const lista = (ids) => (ids.length ? ids.map((id) => `'${id}'`).join(", ") : "null");

const LUB = sql("select id from lubricentros where slug = 'demo'");
const SUPER = sql("select id from usuarios where rol = 'superadmin' limit 1");
const tocado = { services: [] };

// Un override del demo, por la puerta real (fijar_override_plan como el
// superadmin): un UPDATE suelto lo rechaza el candado. Conserva las otras
// claves, y no hace nada si la clave ya está como se pide.
const sqlOverride = (clave, prendida) => `
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fijar_override_plan('${LUB}',
    (select ${prendida ? `coalesce(plan_overrides, '{}'::jsonb) || '{"${clave}": true}'::jsonb` : `coalesce(plan_overrides, '{}'::jsonb) - '${clave}'`} from lubricentros where id = '${LUB}'),
    'regresion-caja-mecanica.mjs · ${clave} ${prendida ? "prendida" : "apagada"} para la prueba')
  where ${prendida ? "not" : ""} coalesce((select (plan_overrides ->> '${clave}')::boolean from lubricentros where id = '${LUB}'), false);
  commit;`;

function sqlDeRestauracion() {
  return [
    `delete from trabajos_pendientes where origen_service_id in (${lista(tocado.services)}) or resuelto_service_id in (${lista(tocado.services)});`,
    `delete from service_items where service_id in (${lista(tocado.services)});`,
    `delete from services where cargado_con_id in (${lista(tocado.services)});`,
    `delete from services where id in (${lista(tocado.services)});`,
    `delete from services where lubricentro_id = '${LUB}' and observaciones like '${MARCA_DE_PRUEBA}%';`,
    sqlOverride("caja", false),
  ].join("\n");
}
const anotar = () => fs.writeFileSync(ARCHIVO_RESTAURAR, sqlDeRestauracion());
let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
  if (DEJAR) {
    console.log(`\n  ◦ DEJAR=1: el demo queda con la feature prendida y la pareja cargada. Para limpiar: psql < ${ARCHIVO_RESTAURAR}, o supabase db reset`);
    return;
  }
  try {
    sql(sqlDeRestauracion());
    fs.rmSync(ARCHIVO_RESTAURAR, { force: true });
    console.log("\n  ◦ datos del demo restaurados");
  } catch (e) {
    console.log(`\n  ✗ NO SE PUDO RESTAURAR el demo: ${String(e.message).split("\n")[0]}`);
    console.log(`    El SQL quedó en ${ARCHIVO_RESTAURAR}; la próxima corrida lo aplica. O: supabase db reset`);
    fallas++;
  }
}
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    restaurar();
    process.exit(1);
  });
}
if (fs.existsSync(ARCHIVO_RESTAURAR)) {
  sql(fs.readFileSync(ARCHIVO_RESTAURAR, "utf8"));
  fs.rmSync(ARCHIVO_RESTAURAR);
  console.log("\n  ◦ se restauró lo que dejó una corrida anterior");
}
anotar();

// El auto con historia: uno del seed con services y kilómetros.
const AUTO = JSON.parse(sql(`
  select json_build_object('id', v.id, 'patente', v.patente_normalizada, 'km', max(s.kilometros))
  from vehiculos v join services s on s.vehiculo_id = v.id
  where v.lubricentro_id = '${LUB}' and v.patente_normalizada = 'ABC123' and not s.anulado
  group by v.id`) || "null");
const KM = (AUTO?.km ?? 98450) + 550;
const HOY = new Date();
const FECHA_LARGA = `${String(HOY.getDate()).padStart(2, "0")}/${String(HOY.getMonth() + 1).padStart(2, "0")}/${HOY.getFullYear()}`;

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

try {
  if (!AUTO) throw new Error("el seed no tiene el ABC 123 con services: supabase db reset");

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
  const sesion = await entrar("demo@fidellimotors.app");

  async function abrir(vista, estado = sesion) {
    const tactil = vista.width < 768;
    const ctx = await navegador.newContext({
      viewport: vista,
      deviceScaleFactor: 2,
      locale: "es-AR",
      hasTouch: tactil,
      isMobile: tactil,
      storageState: estado,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const tocar = (locator) => (tactil ? locator.tap() : locator.click());
    return { ctx, page, tocar };
  }

  async function capturar(page, nombre) {
    if (!DIR_CAPTURAS) return;
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const vista = page.viewportSize();
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vista.width, height: alto });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`) });
    await page.setViewportSize(vista);
    console.log(`  ◦ captura ${nombre}.png`);
  }

  async function irAlCarton(page, patente) {
    await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
    await page.fill("#patente", patente);
    await page.click('a[href^="/panel/services/nuevo/"]', { timeout: 20_000 });
    await page.waitForSelector("#fecha", { timeout: 20_000 });
  }
  // El selector de tipo es el fieldset «Tipo de trabajo»: afuera hay otros
  // botones que dicen «Caja» (el aceite de caja del cartón, el renglón del
  // teclado de la mecánica).
  const botonTipo = (page, nombre) =>
    page.getByRole("group", { name: "Tipo de trabajo" }).getByRole("button", { name: nombre, exact: true });
  const renglonCaja = (page, nombre) => page.locator("[data-renglones-caja]").getByRole("switch", { name: nombre });
  const pregunta = (page) => page.getByRole("switch", { name: /Se le hizo algo de mecánica/ });
  const renglonMec = (page, clave) => page.locator(`[data-renglon="${clave}"]`);

  // ------------------------------------------------------------
  titulo("B · La feature caja, prendida en el demo");
  sql(sqlOverride("caja", true));
  check("el demo tiene la feature caja por override", sql(`select plan_overrides ->> 'caja' from lubricentros where id = '${LUB}'`) === "true");
  check("y la feature mecánica por su plan",
    sql(`select p.features ->> 'mecanica' from suscripciones s join planes p on p.id = s.plan_id where s.lubricentro_id = '${LUB}' order by s.inicio desc, s.created_at desc limit 1`) === "true");

  // ------------------------------------------------------------
  titulo("C · La carga en 390 táctil: caja + mecánica");
  let cajaId = null;
  let mecId = null;
  await paso("la carga", async () => {
    const { ctx, page, tocar } = await abrir({ width: 390, height: 844 });
    await irAlCarton(page, "ABC 123");

    // La pregunta es del service y de la caja; no de la mecánica suelta.
    check("el cartón de aceite ofrece la pregunta", (await pregunta(page).count()) === 1);
    await tocar(botonTipo(page, "Mecánica"));
    check("el cartón de una mecánica suelta NO la ofrece", (await pregunta(page).count()) === 0);
    await tocar(botonTipo(page, "Caja"));
    check("el cartón de la caja la ofrece", (await pregunta(page).count()) === 1);
    check("y viene apagada", (await pregunta(page).getAttribute("aria-checked")) === "false");

    await page.fill("#km", String(KM));
    await tocar(page.locator("[data-bloque-aceite-caja]").getByRole("button", { name: "Dexron VI", exact: true }));
    await tocar(renglonCaja(page, "Filtro de caja"));
    const revisar = page.getByRole("button", { name: "Revisar y confirmar" });
    check("la caja sola ya se puede revisar", await revisar.isEnabled());

    await tocar(pregunta(page));
    check("tildada, aparece el teclado de la mecánica", (await page.locator("[data-renglon]").count()) > 0);
    check("con la pregunta tildada y sin descripción no se puede revisar", await revisar.isDisabled());
    check("y dice qué falta", (await page.getByText("Contá qué trabajo de mecánica se hizo, o destildá la pregunta.").count()) === 1);
    check("el teclado NO repite el aceite de caja (es el trabajo de arriba)", (await renglonMec(page, "aceite_caja").count()) === 0);
    check("pero SÍ ofrece batería, líquido de frenos y refrigerante (no están en el cartón de la caja)",
      (await renglonMec(page, "bateria").count()) === 1 && (await renglonMec(page, "liquido_frenos").count()) === 1 &&
        (await renglonMec(page, "refrigerante").count()) === 1);
    await tocar(renglonMec(page, "pastillas_delanteras"));
    check("un renglón escribe su línea", (await page.inputValue("#trabajo")) === "Cambio de pastillas delanteras");
    check("con la descripción ya se puede revisar", await revisar.isEnabled());
    await page.getByRole("button", { name: /Observaciones/ }).click();
    await page.fill("#obs", `${MARCA_DE_PRUEBA} caja con mecánica desde el celular`);
    await capturar(page, "carga-390");

    await tocar(revisar);
    await page.getByRole("heading", { name: "Revisá el service de caja y la mecánica" }).waitFor();
    check("la previsualización nombra los dos trabajos", true);
    check("muestra el papel de la caja", (await page.locator('[data-papel="caja"]').count()) === 1);
    check("y debajo el de la mecánica, de la misma fecha", (await page.locator('[data-papel="mecanica"]').count()) === 1);
    const textoMec = ((await page.locator('[data-papel="mecanica"]').innerText().catch(() => "")) ?? "").replace(/\s+/g, " ");
    check("el papel de la mecánica trae su descripción y los km de la caja",
      textoMec.includes("Cambio de pastillas delanteras") && textoMec.includes(fmt(KM)), textoMec);
    check("«Se registra además una mecánica»", (await page.getByText("Se registra además una mecánica").count()) === 1);
    check("el plazo nombra los dos: 24 horas el service de caja y 7 días la mecánica",
      (await page.getByText("Editable por 24 horas el service de caja y 7 días la mecánica").count()) === 1);
    const confirmar = page.getByRole("button", { name: "Confirmar service de caja y mecánica" });
    check("el botón dice «Confirmar service de caja y mecánica»", (await confirmar.count()) === 1);
    await capturar(page, "previsualizacion-390");

    await tocar(confirmar);
    await page.waitForURL("**/guardado", { timeout: 30_000 });
    cajaId = page.url().match(/services\/([0-9a-f-]{36})\/guardado/)?.[1] ?? null;
    if (cajaId) {
      tocado.services.push(cajaId);
      anotar();
    }
    check("el guardado dice «Service de caja y mecánica guardados»", (await page.getByText("Service de caja y mecánica guardados").count()) === 1);
    check("y resume la mecánica de la misma visita", (await page.getByText("Cambio de pastillas delanteras").count()) === 1);
    const enlace = page.getByRole("link", { name: "Ver la mecánica" });
    check("con el enlace «Ver la mecánica»", (await enlace.count()) === 1);
    mecId = ((await enlace.getAttribute("href").catch(() => "")) ?? "").match(/services\/([0-9a-f-]{36})/)?.[1] ?? null;
    await capturar(page, "guardado-390");
    await ctx.close();

    // Lo que quedó en la base: la pareja nació junta.
    const par = JSON.parse(sql(`select row_to_json(x) from (
      select c.tipo as caja_tipo, c.fecha as caja_fecha, c.kilometros as caja_km, c.prox_caja_km, c.cargado_con_id as caja_vinculo,
             m.id as mec_id, m.tipo as mec_tipo, m.fecha as mec_fecha, m.kilometros as mec_km, m.prox_caja_km as mec_prox_caja,
             m.sucursal_id = c.sucursal_id as misma_sucursal, m.created_at = c.created_at as mismo_instante,
             m.trabajo_descripcion as mec_desc
      from services c left join services m on m.cargado_con_id = c.id
      where c.id = '${cajaId}') x`) || "null");
    check("en la base la caja es una caja, sin vínculo propio y con su próximo",
      par?.caja_tipo === "caja" && par.caja_vinculo === null && par.prox_caja_km === KM + 80000, JSON.stringify(par));
    check("y la mecánica nació vinculada a ella, con la misma fecha, km, sucursal e instante",
      par?.mec_tipo === "mecanica" && par.mec_fecha === par.caja_fecha && par.mec_km === KM && par.misma_sucursal === true &&
        par.mismo_instante === true && par.mec_prox_caja === null, JSON.stringify(par));
    check("el enlace del guardado apunta a esa mecánica", Boolean(mecId) && par?.mec_id === mecId, `${mecId} vs ${par?.mec_id}`);
    check("con su descripción", par?.mec_desc === "Cambio de pastillas delanteras");
  });

  // ------------------------------------------------------------
  titulo("D · El detalle, anular y editar, en las dos direcciones");
  await paso("el detalle y la edición", async () => {
    if (!cajaId || !mecId) throw new Error("la pareja no se cargó");
    const { ctx, page } = await abrir({ width: 1280, height: 800 });

    await page.goto(`${BASE}/panel/services/${cajaId}`, { waitUntil: "networkidle" });
    const mismaVisitaCaja = page.locator("dd", { has: page.locator(`a[href="/panel/services/${mecId}"]`) });
    check("el detalle de la caja dice «Misma visita: Una mecánica: …» con el enlace a la mecánica",
      (await mismaVisitaCaja.count()) === 1 && /Una mecánica: Cambio de pastillas delanteras/.test(await mismaVisitaCaja.innerText().catch(() => "")));
    await page.getByRole("button", { name: "Anular service" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.waitFor();
    const textoAnular = (await dialogo.innerText()).replace(/\s+/g, " ");
    check("al anular la caja avisa que se cargó junto con una mecánica, con su enlace",
      /se cargó junto con una mecánica de la misma visita/.test(textoAnular) &&
        (await dialogo.locator(`a[href="/panel/services/${mecId}"]`, { hasText: "la mecánica" }).count()) === 1, textoAnular);
    await capturar(page, "anular-caja-1280");
    await page.keyboard.press("Escape");

    await page.goto(`${BASE}/panel/services/${mecId}`, { waitUntil: "networkidle" });
    const mismaVisitaMec = page.locator("dd", { has: page.locator(`a[href="/panel/services/${cajaId}"]`) });
    check("el detalle de la mecánica dice «Misma visita: El service de caja del dd/mm/aaaa»",
      (await mismaVisitaMec.count()) === 1 && (await mismaVisitaMec.innerText().catch(() => "")).includes(`El service de caja del ${FECHA_LARGA}`),
      await mismaVisitaMec.innerText().catch(() => "no hay fila"));
    await page.getByRole("button", { name: "Anular service" }).click();
    await page.getByRole("dialog").waitFor();
    const textoAnularMec = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
    check("al anular la mecánica avisa que se cargó junto con el service de caja",
      /se cargó junto con el service de caja de la misma visita/.test(textoAnularMec) &&
        (await page.getByRole("dialog").locator(`a[href="/panel/services/${cajaId}"]`, { hasText: "el service de caja" }).count()) === 1, textoAnularMec);
    await page.keyboard.press("Escape");

    // Editar la mecánica: el aviso manda a editar el service de caja.
    await page.goto(`${BASE}/panel/services/${mecId}/editar`, { waitUntil: "networkidle" });
    const avisoMec = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("Editar la mecánica avisa que es de la misma visita que el service de caja",
      /Esta mecánica se cargó junto con el service de caja de la misma visita/.test(avisoMec) && /editá el service de caja y se copian a los dos/.test(avisoMec));

    // Editar la caja: el aviso, y los kilómetros corregidos viajan a la mecánica.
    await page.goto(`${BASE}/panel/services/${cajaId}/editar`, { waitUntil: "networkidle" });
    const avisoCaja = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("Editar la caja avisa que se cargó junto con una mecánica y que la fecha, los km y la sucursal se copian",
      /Este service de caja se cargó junto con una mecánica de la misma visita/.test(avisoCaja) && /se copian también a la mecánica/.test(avisoCaja));
    check("y no ofrece la pregunta (solo en el alta)", (await pregunta(page).count()) === 0);
    await page.fill("#km", String(KM + 10));
    await page.getByRole("button", { name: "Revisar y confirmar" }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.waitForURL(`**/panel/services/${cajaId}`, { timeout: 30_000 });
    const kms = sql(`select string_agg(kilometros::text, ',' order by tipo) from services where id in ('${cajaId}', '${mecId}')`);
    check("corregir los kilómetros de la caja los copió a la mecánica", kms === `${KM + 10},${KM + 10}`, kms);
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("E · La página del cliente");
  await paso("el cliente", async () => {
    if (!cajaId) throw new Error("la pareja no se cargó");
    const { ctx, page } = await abrir({ width: 390, height: 844, });
    await page.goto(`${BASE}/demo/ABC123`, { waitUntil: "networkidle" });
    // El historial va en <details> cerrados: se lee el textContent entero.
    const texto = (await page.evaluate(() => document.body.textContent ?? "")).replace(/\s+/g, " ");
    check("el cliente ve su próximo service de caja", /service de caja/i.test(texto) && texto.includes(fmt(KM + 10 + 80000)), texto.slice(0, 200));
    check("y la mecánica de la misma visita en su historial", texto.includes("Cambio de pastillas delanteras"));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("F · Todos los dispositivos: la pregunta abierta en una caja, sin scroll horizontal");
  for (const w of [360, 390, 820, 1280]) {
    await paso(`${w}`, async () => {
      const { ctx, page, tocar } = await abrir({ width: w, height: 844 });
      await irAlCarton(page, "ABC 123");
      await tocar(botonTipo(page, "Caja"));
      await tocar(pregunta(page));
      await tocar(renglonMec(page, "bateria"));
      const scroll = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      check(`${w} · sin scroll horizontal con la pregunta abierta`, scroll <= 0, `sobran ${scroll}px`);
      check(`${w} · el teclado está y escribe`, (await page.inputValue("#trabajo")) === "Cambio de batería");
      if (w === 1280 || w === 360) await capturar(page, `caja-con-pregunta-${w}`);
      await ctx.close();
    });
  }
} catch (e) {
  check("la corrida", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close();
  restaurar();
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);
