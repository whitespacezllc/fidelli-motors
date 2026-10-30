// Emitir la cuenta de cobro de cada tenant en PRODUCCIÓN (Fase 3 del CVU
// dedicado, 31/10/2026): para cada lubricentro sin cuenta, Cresium emite
// el CVU con el alias APROBADO de la lista de abajo y la base guarda los
// tres datos por la puerta de siempre (fijar_cvu_de_tenant, como superadmin).
//
// Corre con una sesión de superadmin de verdad —no con la clave de
// servicio— para pasar por la misma validación que la ficha:
//
//   FIDELLI_URL=https://<prod>.supabase.co FIDELLI_ANON_KEY=<anon> \
//   FIDELLI_ADMIN_EMAIL=<superadmin> FIDELLI_ADMIN_PASSWORD=<clave> \
//   node --no-warnings scripts/emitir-cuentas.mjs --dry-run
//
// Sin --dry-run EMITE CUENTAS REALES en Cresium (una por tenant, no se
// repite: el que ya tiene cuenta se saltea). Las credenciales de Cresium
// salen de .env.local (las de prod). El demo nunca.
//
// ⚠ EL ALIAS ES LA LISTA, NO LA SUGERENCIA. Santi aprobó estos 34 el
// 30/10/2026; un tenant nuevo o uno que no esté acá se emite desde la
// ficha, no desde este script.
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const SOLO = process.argv.find((a) => a.startsWith("--solo="))?.slice(7) ?? null;

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }));
const { CRESIUM_API_KEY: KEY, CRESIUM_SECRET: SECRET, CRESIUM_COMPANY_ID: COMPANY } = env;
const CRESIUM = "https://api.cresium.app";
if (!KEY || !SECRET || !COMPANY) { console.error("Faltan las credenciales de Cresium en .env.local"); process.exit(1); }
for (const v of ["FIDELLI_URL", "FIDELLI_ANON_KEY", "FIDELLI_ADMIN_EMAIL", "FIDELLI_ADMIN_PASSWORD"]) {
  if (!process.env[v]) { console.error(`Falta ${v} en la shell`); process.exit(1); }
}

// Los 34, aprobados el 30/10/2026.
const ALIAS = new Map([
  ["aimar-mecanica", "fm.aimar"],
  ["autoshop-lubricantes", "fm.autoshop"],
  ["battelo-automotive", "fm.battelo"],
  ["bottone-lubricantes", "fm.bottone"],
  ["brothers-oil", "fm.brothersoil"],
  ["capuzzi-neumaticos-y-servicios", "fm.capuzzineumaticos"],
  ["check", "fm.check"],
  ["comas", "fm.comas"],
  ["cristian-penaloza", "fm.cristianpenaloza"],
  ["f-f-lubricentro", "fm.fflubricentro"],
  ["falco-lubricantes-y-servicios", "fm.falco"],
  ["fenix-integral", "fm.fenix"],
  ["ferrari-mecanica", "fm.ferrari"],
  ["grendene-servicio-mecanico", "fm.grendene"],
  ["loprestimotorsport", "fm.loprestimotorspor"],
  ["lubricantes-de-sa", "fm.lubricantesdesa"],
  ["lubricentro-el-buda", "fm.elbuda"],
  ["lubricentro-el-garage", "fm.elgarage"],
  ["lubricentro-el-nano", "fm.elnano"],
  ["lubricentro-fassetta", "fm.fassetta"],
  ["lubricentro-guerra", "fm.guerra"],
  ["lubricentro-manuel", "fm.manuel"],
  ["lubricentro-y-gomeria-el-colo", "fm.gomeriaelcolo"],
  ["lubricheck-sassi", "fm.lubrichecksassi"],
  ["mecanica-prete", "fm.prete"],
  ["deambrossio", "fm.deambrossio"],
  ["mecatronica-broilo", "fm.mecatronicabroilo"],
  ["metal-camion", "fm.metalcamion"],
  ["olmos-soluciones-mecanicas", "fm.olmos"],
  ["pg-taller-lubricentro", "fm.pgtaller"],
  ["psm", "fm.psm"],
  ["risso-motorsport", "fm.rissomotorsport"],
  ["shaddai-garage", "fm.shaddaigarage"],
  ["shaddai-mecanica-general", "fm.shaddaigeneral"]
]);

async function cresium(metodo, path, cuerpo) {
  const body = cuerpo === undefined ? "" : JSON.stringify(cuerpo);
  const ts = new Date().toISOString();
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}|${metodo}|${path}|${body}`).digest("base64");
  const r = await fetch(CRESIUM + path, { method: metodo, headers: { "x-api-key": KEY, "x-company-id": COMPANY, "x-timestamp": ts, "x-signature": sig, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body } : {}) });
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch {}
  return { status: r.status, json, texto };
}

const supabase = createClient(process.env.FIDELLI_URL, process.env.FIDELLI_ANON_KEY, { auth: { persistSession: false } });
const { error: errLogin } = await supabase.auth.signInWithPassword({
  email: process.env.FIDELLI_ADMIN_EMAIL, password: process.env.FIDELLI_ADMIN_PASSWORD,
});
if (errLogin) { console.error("No se pudo entrar como superadmin:", errLogin.message); process.exit(1); }

const { data: tenants, error } = await supabase
  .from("lubricentros")
  .select("id, nombre, slug, activo, cresium_alias, cresium_cvu")
  .neq("slug", "demo")
  .order("nombre");
if (error) { console.error("No se pudo leer lubricentros:", error.message); process.exit(1); }

console.log(`${DRY ? "SIMULACIÓN" : "EMISIÓN REAL"} · ${tenants.length} tenants · Cresium ${CRESIUM}\n`);
let emitidas = 0, saltadas = 0, fallas = 0;
for (const t of tenants) {
  if (SOLO && t.slug !== SOLO) continue;
  if (t.cresium_cvu) { console.log(`  · ${t.nombre}: ya tiene ${t.cresium_alias} — se saltea`); saltadas++; continue; }
  const alias = ALIAS.get(t.slug);
  if (!alias) { console.log(`  ✗ ${t.nombre} (${t.slug}): no está en la lista aprobada — se emite desde la ficha`); fallas++; continue; }
  // Nuestra base primero: el alias tiene que estar libre.
  const { data: estado } = await supabase.rpc("alias_estado", { p_alias: alias });
  if (estado !== "disponible") { console.log(`  ✗ ${t.nombre}: el alias ${alias} está ${estado}`); fallas++; continue; }
  if (DRY) { console.log(`  ✓ ${t.nombre}${t.activo ? "" : " (apagado)"} → ${alias}`); emitidas++; continue; }

  const e = await cresium("POST", "/v3/deposit-address/cvu", { value: alias });
  const cvu = e.json?.data?.value, id = e.json?.data?.id;
  if (e.status !== 200 || !cvu || !/^[0-9]{22}$/.test(cvu) || !id) {
    console.log(`  ✗ ${t.nombre}: Cresium contestó ${e.status} ${e.texto.slice(0, 160)}`); fallas++; continue;
  }
  const { error: errGuardar } = await supabase.rpc("fijar_cvu_de_tenant", {
    p_lubricentro: t.id, p_alias: alias, p_cvu: cvu, p_deposit_address_id: id,
  });
  if (errGuardar) {
    // El CVU YA EXISTE en Cresium: queda escrito para conciliar a mano.
    console.log(`  ✗ ${t.nombre}: Cresium emitió el CVU …${cvu.slice(-4)} (id ${id}) pero la base no lo guardó: ${errGuardar.message}`);
    fallas++; continue;
  }
  console.log(`  ✓ ${t.nombre} → ${alias} · CVU …${cvu.slice(-4)} (id ${id})`);
  emitidas++;
}
console.log(`\n${DRY ? "simuladas" : "emitidas"} ${emitidas} · salteadas ${saltadas} · fallas ${fallas}`);
process.exit(fallas === 0 ? 0 : 1);
