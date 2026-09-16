// El webhook de Cresium, de punta a punta, contra el servidor local.
//
// Es el "doble local": no llama a Cresium ni necesita credenciales suyas
// —arma los payloads con la forma que publica la documentación y los firma
// con el mismo secret que la ruta verifica—. Lo que prueba es lo que no se
// puede probar de otra forma sin mover plata de verdad: que la puerta
// rechace lo que tiene que rechazar y acredite una sola vez lo que tiene
// que acreditar.
//
// Requiere: stack local (supabase db reset) + servidor Next en :3000
//   npm run dev
// Correr:  node scripts/regresion-cresium-webhook.mjs
//
// Crea un lubricentro de prueba y lo borra al final, pase lo que pase.
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUTA = "/api/cresium/webhook";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()];
    }));

const SECRET = env.CRESIUM_SECRET;
if (!SECRET) { console.error("Falta CRESIUM_SECRET en .env.local"); process.exit(1); }

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

// Firma el body CRUDO, igual que la ruta. Si acá se serializara distinto
// que en el `fetch`, la firma no coincidiría — por eso se manda el mismo
// string que se firmó, nunca el objeto.
function enviar(cuerpo, { firmaRota = false, timestamp = null, sinHeaders = false, urlCompleta = false } = {}) {
  const crudo = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const ts = timestamp ?? String(Date.now());
  // ⚠ CRESIUM FIRMA LA URL COMPLETA, no el path, aunque su doc diga lo
  // contrario. Medido con una entrega real el 16/09/2026. Esta prueba
  // firmaba SOLO con el path, y por eso daba verde mientras producción
  // rechazaba todo: el doble reproducía la doc, no la realidad.
  const aFirmar = urlCompleta ? BASE + RUTA : RUTA;
  const firma = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}|POST|${aFirmar}|${crudo}`)
    .digest("base64");

  return fetch(BASE + RUTA, {
    method: "POST",
    body: crudo,
    headers: sinHeaders
      ? { "content-type": "application/json" }
      : {
          "content-type": "application/json",
          "x-api-key": env.CRESIUM_API_KEY ?? "no-importa",
          "x-company-id": env.CRESIUM_COMPANY_ID ?? "1488",
          "x-timestamp": ts,
          "x-signature": firmaRota ? "firma-invalida-pero-del-mismo-largo=" : firma,
        },
  });
}

const deposito = (id, externalId, status, amount, amountPaid, retry = 1) => ({
  type: "DEPOSIT",
  retry,
  data: {
    id,
    type: "DEPOSIT",
    status: "SUCCESS",
    totalAmount: amountPaid,
    currency: { code: "ARS", symbol: "$", decimals: 2 },
    paymentOrder: { externalId, status, amount, amountPaid, currency: { code: "ARS" } },
  },
});

// ── Preparar un tenant de prueba ────────────────────────────────────
const SLUG = "cresium-regresion";
function limpiar() {
  sql(`delete from pagos where lubricentro_id in (select id from lubricentros where slug='${SLUG}');
       delete from suscripciones where lubricentro_id in (select id from lubricentros where slug='${SLUG}');
       delete from lubricentros where slug='${SLUG}';
       delete from cresium_eventos where external_id like '%:%' and external_id in (select id::text || ':' || to_char(current_date + 30,'YYYY-MM-DD') from suscripciones);`);
}
limpiar();

sql(`insert into lubricentros (nombre, slug) values ('Cresium Regresión','${SLUG}')`);
const lub = sql(`select id from lubricentros where slug='${SLUG}'`);
sql(`insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, vencimiento)
     select '${lub}', id, 'activa', 'mensual', 0, current_date + 3 from planes where nombre='Pro' and not heredado`);
const sus = sql(`select id from suscripciones where lubricentro_id='${lub}'`);
const HASTA = sql(`select to_char(current_date + 33,'YYYY-MM-DD')`);
const EXT = `${sus}:${HASTA}`;
const vencAntes = sql(`select vencimiento from suscripciones where id='${sus}'`);

const pagos = () => Number(sql(`select count(*) from pagos where lubricentro_id='${lub}'`));
const eventos = () => Number(sql(`select count(*) from cresium_eventos where external_id='${EXT}'`));
const venc = () => sql(`select vencimiento from suscripciones where id='${sus}'`);

try {
  console.log(`tenant de prueba: ${SLUG} · vencimiento inicial ${vencAntes}\n`);

  // ── 1 · La puerta rechaza lo que tiene que rechazar ───────────────
  console.log("── La puerta ──");
  {
    const antesP = pagos(), antesE = eventos();
    const r = await enviar(deposito(90001, EXT, "PAID", 49000, 49000), { firmaRota: true });
    check("firma inválida → 401", r.status === 401, `dio ${r.status}`);
    check(
      "firma inválida → CERO escrituras en la base",
      pagos() === antesP && eventos() === antesE,
      `pagos ${antesP}→${pagos()}, eventos ${antesE}→${eventos()}`,
    );
  }
  {
    const r = await enviar(deposito(90002, EXT, "PAID", 49000, 49000), { sinHeaders: true });
    check("sin headers → 401", r.status === 401, `dio ${r.status}`);
  }
  {
    const viejo = String(Date.now() - 10 * 60_000);
    const r = await enviar(deposito(90003, EXT, "PAID", 49000, 49000), { timestamp: viejo });
    check("firma válida pero de hace 10 minutos → 401", r.status === 401, `dio ${r.status}`);
  }
  {
    // La firma se calcula sobre el body CRUDO: si se re-serializa con otro
    // espaciado, deja de coincidir. Es el 401 más difícil de diagnosticar.
    const obj = deposito(90004, EXT, "PAID", 49000, 49000);
    const crudo = JSON.stringify(obj);
    const ts = String(Date.now());
    const firma = crypto.createHmac("sha256", SECRET)
      .update(`${ts}|POST|${RUTA}|${crudo}`).digest("base64");
    const r = await fetch(BASE + RUTA, {
      method: "POST",
      // firmado con `crudo`, enviado con OTRO espaciado
      body: JSON.stringify(obj, null, 2),
      headers: {
        "content-type": "application/json", "x-api-key": "x", "x-company-id": "1488",
        "x-timestamp": ts, "x-signature": firma,
      },
    });
    check("body re-serializado con otro espaciado → 401", r.status === 401, `dio ${r.status}`);
  }
  {
    const r = await fetch(BASE + RUTA);
    check("GET a la ruta → 405", r.status === 405, `dio ${r.status}`);
  }

  // ---- La forma en que Cresium firma DE VERDAD ----
  // Es el caso que faltaba y el que costó una noche: la doc documenta el
  // path, la implementación manda la URL completa. Se aceptan las dos.
  {
    // Con un externalId ajeno: lo que se prueba es que la PUERTA acepte la
    // firma, no que acredite. Así no ensucia el conteo de evidencia de más
    // abajo, que cuenta las entregas de EXT.
    const r = await enviar(
      deposito(90005, "00000000-0000-0000-0000-000000000000:2099-01-01", "PAID", 1, 1),
      { urlCompleta: true },
    );
    check(
      "firmado con la URL COMPLETA (como firma Cresium) → 200",
      r.status === 200,
      `dio ${r.status}`,
    );
  }

  // ── 2 · El cobro entra, una sola vez ──────────────────────────────
  console.log("\n── El cobro ──");
  {
    const r = await enviar(deposito(90010, EXT, "PAID", 49000, 49000));
    const j = await r.json();
    check("DEPOSIT PAID → 200", r.status === 200, `dio ${r.status}`);
    check("acreditado", j.resultado === "acreditado", JSON.stringify(j));
    check("se registró UN pago", pagos() === 1, `hay ${pagos()}`);
    check(`el vencimiento se movió a ${HASTA}`, venc() === HASTA, `quedó en ${venc()}`);
    check(
      "el pago quedó sin usuario y con origen cresium",
      sql(`select coalesce(registrado_por::text,'NULL') || '/' || origen from pagos where lubricentro_id='${lub}'`) === "NULL/cresium",
    );
  }

  // ── 3 · Los cinco reintentos ──────────────────────────────────────
  console.log("\n── Los cinco reintentos de Cresium ──");
  {
    const codigos = [];
    for (let i = 2; i <= 5; i++) {
      const r = await enviar(deposito(90010, EXT, "PAID", 49000, 49000, i));
      codigos.push(r.status);
    }
    check("los cuatro reintentos responden 200", codigos.every((c) => c === 200), codigos.join(","));
    check("SIGUE habiendo un solo pago", pagos() === 1, `hay ${pagos()}`);
    check("el vencimiento no se movió de nuevo", venc() === HASTA, `quedó en ${venc()}`);
    check(
      "pero la evidencia guardó las cinco entregas",
      eventos() === 5,
      `hay ${eventos()} eventos`,
    );
  }

  // ── 4 · PARTIAL no activa nada ────────────────────────────────────
  console.log("\n── PARTIAL ──");
  {
    const vencAhora = venc();
    const r = await enviar(deposito(90020, EXT, "PARTIAL", 49000, 20000));
    const j = await r.json();
    check("PARTIAL → 200 (no se reintenta lo que ya entendimos)", r.status === 200);
    check("no acredita", j.resultado === "sin_acreditar", JSON.stringify(j));
    check("el vencimiento NO se movió", venc() === vencAhora, `quedó en ${venc()}`);
    check("y sigue habiendo un solo pago", pagos() === 1, `hay ${pagos()}`);
  }

  // ── 5 · Un evento que no es nuestro ───────────────────────────────
  console.log("\n── Lo ajeno ──");
  {
    const r = await enviar(deposito(90030, "00000000-0000-0000-0000-000000000000:2026-12-31", "PAID", 1, 1));
    check("orden de otro → 200 sin acreditar", r.status === 200 && (await r.json()).resultado === "sin_acreditar");
    check("no se creó ningún pago nuevo", pagos() === 1, `hay ${pagos()}`);
  }
  {
    const r = await enviar({ type: "OTRA_COSA", retry: 1, data: { id: 90040 } });
    check("evento de tipo desconocido → 200 e ignorado", r.status === 200 && (await r.json()).ignorado === "OTRA_COSA");
  }
} finally {
  limpiar();
  sql(`delete from cresium_eventos`);
}

console.log(
  fallas === 0
    ? "\nLa puerta rechaza lo que tiene que rechazar y acredita una sola vez."
    : `\n${fallas} falla(s).`,
);
process.exit(fallas === 0 ? 0 : 1);
