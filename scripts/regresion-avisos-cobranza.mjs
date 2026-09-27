// La ruta de los avisos de cobranza, de punta a punta, contra el servidor
// local y el doble de Resend (regla 13: una prueba que nunca se vio en rojo
// no existe).
//
// Lo que cubre (docs/PROMPT-cobranza-hoy.md, bloque 2 § 6):
//   · la guarda: sin bearer y con bearer equivocado → 401.
//   · ?simular=1 dice a quién le tocaría qué, sin mandar ni insertar.
//   · la primera corrida manda uno por tenant, con el remitente, el
//     reply-to, el asunto y el marco esperados, e inserta la evidencia con
//     el id de Resend; la segunda corrida manda cero.
//   · key inválida (Resend rechaza): no se inserta nada, y la corrida
//     siguiente lo manda.
//   · un tenant que paga entre el 2 y el 3 no recibe el 3.
//   · un vencimiento nuevo habilita los tres otra vez.
//   · la evidencia no se borra.
//   · sin RESEND_API_KEY la ruta responde 500 con el motivo, no 200 con
//     cero enviados (se saca la variable de .env.local y se vuelve a poner).
//
// Requiere: stack local (supabase db reset) + servidor Next en :3000 con
// .env.local apuntando al doble:
//   CRON_SECRET=<algo>  RESEND_API_KEY=re_prueba_local  RESEND_BASE_URL=http://localhost:4020
// Correr:  node --no-warnings scripts/regresion-avisos-cobranza.mjs
//
// Levanta el doble en el 4020 y lo apaga al terminar. Crea sus tenants de
// prueba (slug email-run-<marca>-*) con owner y los DEJA: las filas de
// emails_cobranza no se pueden borrar (es evidencia) y la FK impide borrar
// el tenant. Se limpian con supabase db reset.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUTA = "/api/fidelli/avisos-cobranza";
const ENV = new URL("../.env.local", import.meta.url);

const env = Object.fromEntries(
  fs.readFileSync(ENV, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const SECRET = env.CRON_SECRET;
if (!SECRET) { console.error("Falta CRON_SECRET en .env.local"); process.exit(1); }
if (env.RESEND_BASE_URL !== "http://localhost:4020" || env.RESEND_API_KEY !== "re_prueba_local") {
  console.error("En .env.local tiene que estar RESEND_BASE_URL=http://localhost:4020 y RESEND_API_KEY=re_prueba_local (el doble)."); process.exit(1);
}

process.env.PUERTO = "4020";
const doble = await import("./doble-resend.mjs");

const sql = (q) => execFileSync("docker",
  ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA", "-c", q],
  { encoding: "utf8" }).trim();
const sqlArchivo = (texto) => execFileSync("docker",
  ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { encoding: "utf8", input: texto }).trim();

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};

async function llamar({ auth = `Bearer ${SECRET}`, simular = false } = {}) {
  const r = await fetch(`${BASE}${RUTA}${simular ? "?simular=1" : ""}`, { headers: auth ? { authorization: auth } : {} });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j };
}
const control = async (path, cuerpo) => (await fetch(`http://localhost:4020${path}`, { method: "POST", body: cuerpo ? JSON.stringify(cuerpo) : undefined })).json();
const recibidos = async () => (await fetch("http://localhost:4020/_enviados")).json();

// ---------- Los tenants de prueba ----------
const MARCA = Date.now().toString(36);
const slug = (n) => `email-run-${MARCA}-${n}`;
const owner = (n) => `owner-${slug(n)}@fidellimotors.app`;
const enviadosDe = (j, n) => (j?.enviados ?? []).filter((e) => e.slug === slug(n));
const fallidosDe = (j, n) => (j?.fallidos ?? []).filter((e) => e.slug === slug(n));
const filas = (n, tipo) => Number(sql(`select count(*) from emails_cobranza e join lubricentros l on l.id = e.lubricentro_id where l.slug = '${slug(n)}'${tipo ? ` and e.tipo = '${tipo}'` : ""}`));

function crearTenants() {
  // Como en R37: adentro del reloj, con o sin pago, con owner por auth.users.
  const t = (n, dias, pago, estado = "activa", susp = false, desdeHoy = false) => `
    insert into lubricentros (nombre, slug, cobranza_desde, suspension_automatica)
    values ('Email run ${n}', '${slug(n)}', ${desdeHoy ? "current_date" : "current_date - 60"}, ${susp})
    returning id into v_id;
    insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
    values (v_id, v_plan, '${estado}', 'mensual', 0, current_date - 30, current_date + (${dias}))
    returning id into v_s;
    ${pago ? `insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago)
    values (v_id, v_s, v_super, current_date - 30, current_date + (${dias}), 49000, current_date - 30);` : ""}
    insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', '${owner(n)}', extensions.crypt('x', extensions.gen_salt('bf')), now(),
      now(), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('rol', 'owner', 'nombre', 'Owner ${n}', 'lubricentro_id', v_id), '', '', '', '');`;
  sqlArchivo(`do $$
    declare v_id uuid; v_s uuid; v_plan uuid; v_super uuid;
    begin
      select id into v_plan from planes where nombre = 'Pro' and not heredado;
      select id into v_super from usuarios where rol = 'superadmin' limit 1;
      ${t("hoy", 0, true)}
      ${t("tres", 3, true)}
      ${t("susp", -20, true, "activa", true)}
      ${t("trial", 3, false, "trial")}
      ${t("alta", 1, false, "activa", false, true)}
    end $$;`);
}

async function esperar(pred, ms = 60_000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { if (await pred()) return true; } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

await doble.arrancar();
let envOriginal = null;
try {
  crearTenants();
  await control("/_reset");

  console.log("\n— la guarda");
  check("sin bearer → 401", (await llamar({ auth: null })).status === 401);
  check("con otro bearer → 401", (await llamar({ auth: "Bearer no" })).status === 401);

  console.log("\n— simular: a quién le toca qué, sin mandar");
  {
    const { status, j } = await llamar({ simular: true });
    check("responde 200 y dice que es simulado", status === 200 && j?.simulado === true, JSON.stringify(j).slice(0, 200));
    const esperado = { hoy: "vencido:cobranza", tres: "por_vencer:cobranza", susp: "suspendido:cobranza", trial: "por_vencer:trial", alta: "por_vencer:alta" };
    for (const [n, tv] of Object.entries(esperado)) {
      const e = enviadosDe(j, n)[0];
      check(`${n} → ${tv}`, e && `${e.tipo}:${e.voz}` === tv && e.destinatario === owner(n), JSON.stringify(e));
    }
    check("no mandó nada", (await recibidos()).length === 0);
    check("no insertó nada", ["hoy", "tres", "susp", "trial", "alta"].every((n) => filas(n) === 0));
  }

  console.log("\n— la primera corrida manda; la segunda, cero");
  {
    const { status, j } = await llamar();
    check("responde 200", status === 200, JSON.stringify(j).slice(0, 200));
    for (const n of ["hoy", "tres", "susp", "trial", "alta"]) {
      const e = enviadosDe(j, n)[0];
      check(`${n} enviado, con id de Resend y fila en emails_cobranza`,
        e && e.resend_id && filas(n) === 1 && sql(`select resend_id from emails_cobranza e join lubricentros l on l.id = e.lubricentro_id where l.slug = '${slug(n)}'`) === e.resend_id,
        JSON.stringify(e));
    }
    const rec = await recibidos();
    const deHoy = rec.find((m) => (m.to ?? [])[0] === owner("hoy"));
    check("lo que recibió Resend: remitente, reply-to, asunto, html con el marco y text",
      deHoy && deHoy.from === "Fidelli Motors <hola@fidellimotors.app>" && deHoy.reply_to === "fidelli.motors@gmail.com"
        && deHoy.subject === "Hoy vence tu plan — tenés 7 días"
        && /FIDELLI <span style="color:#E01F26;">MOTORS<\/span>/.test(deHoy.html ?? "") && /Hoy vence tu plan Pro/.test(deHoy.text ?? ""),
      JSON.stringify({ from: deHoy?.from, reply_to: deHoy?.reply_to, subject: deHoy?.subject }));
    const trial = rec.find((m) => (m.to ?? [])[0] === owner("trial"));
    check("el trial recibió el suyo, sin monto y con WhatsApp", trial && !/\$/.test(trial.text ?? "") && /Hablemos por WhatsApp/.test(trial.text ?? ""), trial?.subject);

    const antes = rec.length;
    const segunda = await llamar();
    check("la segunda corrida manda cero a estos tenants",
      segunda.status === 200 && ["hoy", "tres", "susp", "trial", "alta"].every((n) => enviadosDe(segunda.j, n).length === 0),
      JSON.stringify(segunda.j?.enviados?.map((e) => e.slug)));
    check("y Resend no recibió nada nuevo", (await recibidos()).length === antes);
  }

  console.log("\n— key inválida: no se inserta; la corrida siguiente lo manda");
  {
    // Un pendiente nuevo: ciclo nuevo para «tres» (vencimiento a 5 días).
    sql(`update suscripciones set vencimiento = current_date + 5 where lubricentro_id = (select id from lubricentros where slug = '${slug("tres")}')`);
    await control("/_modo", { modo: "rechazar" });
    const { j } = await llamar();
    const f = fallidosDe(j, "tres")[0];
    check("Resend rechazó y la ruta lo cuenta como fallido, con el motivo", f && /API key is invalid/.test(f.motivo), JSON.stringify(f));
    check("no se insertó nada para el ciclo nuevo", filas("tres") === 1);
    await control("/_modo", { modo: "ok" });
    const otra = await llamar();
    check("la corrida siguiente lo manda", enviadosDe(otra.j, "tres").length === 1 && filas("tres") === 2, JSON.stringify(enviadosDe(otra.j, "tres")));
  }

  console.log("\n— el que paga entre el 2 y el 3 no recibe el 3");
  {
    // «hoy» ya recibió el 2. Lo dejamos vencido hace 20 días con el
    // interruptor prendido: le tocaría el 3 …
    sql(`update suscripciones set vencimiento = current_date - 20 where lubricentro_id = (select id from lubricentros where slug = '${slug("hoy")}')`);
    sql(`update lubricentros set suspension_automatica = true where slug = '${slug("hoy")}'`);
    const sim = await llamar({ simular: true });
    check("… le tocaría el 3", enviadosDe(sim.j, "hoy")[0]?.tipo === "suspendido", JSON.stringify(enviadosDe(sim.j, "hoy")));
    // … y paga (el vencimiento se va a +30).
    sql(`update suscripciones set vencimiento = current_date + 30 where lubricentro_id = (select id from lubricentros where slug = '${slug("hoy")}')`);
    const { j } = await llamar();
    check("pagó: no recibe el 3", enviadosDe(j, "hoy").length === 0 && filas("hoy", "suspendido") === 0, JSON.stringify(enviadosDe(j, "hoy")));
  }

  console.log("\n— un vencimiento nuevo habilita los tres otra vez");
  {
    // «susp» recibió el 3; con un vencimiento nuevo a 3 días le toca el 1.
    sql(`update suscripciones set vencimiento = current_date + 3 where lubricentro_id = (select id from lubricentros where slug = '${slug("susp")}')`);
    const { j } = await llamar();
    check("recibe el 1 del ciclo nuevo", enviadosDe(j, "susp")[0]?.tipo === "por_vencer" && filas("susp") === 2, JSON.stringify(enviadosDe(j, "susp")));
  }

  console.log("\n— la evidencia no se borra");
  {
    let error = "";
    try { sqlArchivo(`delete from emails_cobranza where lubricentro_id = (select id from lubricentros where slug = '${slug("susp")}');`); }
    catch (e) { error = String(e.stderr ?? e.message); }
    check("delete rechazado con email_no_se_borra", /email_no_se_borra/.test(error) && filas("susp") === 2, error.slice(0, 120));
  }

  console.log("\n— sin RESEND_API_KEY: 500 con el motivo");
  {
    envOriginal = fs.readFileSync(ENV, "utf8");
    fs.writeFileSync(ENV, envOriginal.replace(/^RESEND_API_KEY=.*$/m, "# RESEND_API_KEY= (sacada por regresion-avisos-cobranza.mjs)"));
    const sinKey = await esperar(async () => (await llamar()).status === 500);
    const { status, j } = await llamar();
    check("responde 500 y dice qué falta", sinKey && status === 500 && /RESEND_API_KEY/.test(j?.motivo ?? ""), JSON.stringify({ status, j }));
    fs.writeFileSync(ENV, envOriginal); envOriginal = null;
    const vuelve = await esperar(async () => (await llamar({ simular: true })).status === 200);
    check("con la variable de vuelta, responde 200", vuelve);
  }
} finally {
  if (envOriginal) fs.writeFileSync(ENV, envOriginal);
  doble.parar();
}

console.log(fallas === 0 ? "\n✓ todo en verde" : `\n✗ ${fallas} falla(s)`);
process.exit(fallas === 0 ? 0 : 1);
