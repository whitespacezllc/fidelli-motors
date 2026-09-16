// EL DOBLE DE CRESIUM, para desarrollo local.
//
// ⚠ POR QUÉ EXISTE: Cresium NO TIENE ENTORNO DE PRUEBAS. Verificado el
// 16/09/2026 leyendo la spec entera — `develop`, `sandbox`, `staging` y
// `environment` aparecen cero veces, el OpenAPI declara un solo server y
// las credenciales se gestionan en un único lugar. Una API Key llamada
// "Develop FM" es una key de PRODUCCIÓN con ese nombre: cada `POST` crea
// un CVU real que puede recibir transferencias reales.
//
// Así que en local `CRESIUM_BASE_URL` apunta acá, y es imposible que una
// prueba mueva plata. La única corrida contra Cresium de verdad es la que
// hace Santiago a mano, una sola vez, con un monto chico.
//
// Este doble NO es complaciente: verifica la firma HMAC exactamente como
// la documenta Cresium, así que si la construcción del string está mal,
// acá se ve — que es la mitad del valor de tenerlo.
//
// Correr:  node scripts/doble-cresium.mjs        (queda escuchando en 4010)
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";

const PUERTO = Number(process.env.PUERTO ?? 4010);
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()];
    }));

const SECRET = env.CRESIUM_SECRET ?? "";
const API_KEY = env.CRESIUM_API_KEY ?? "";
const COMPANY = env.CRESIUM_COMPANY_ID ?? "";

// Las órdenes creadas, en memoria. Se van al reiniciar: es un doble, no
// una base de datos.
const ordenes = new Map();
let proximoId = 7000;

function responder(res, status, cuerpo) {
  const t = JSON.stringify(cuerpo);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(t);
}

function verificar(req, path, body) {
  const h = req.headers;
  if (!h["x-api-key"] || !h["x-company-id"] || !h["x-timestamp"] || !h["x-signature"]) {
    return { ok: false, code: 401, error: "UNAUTHORIZED",
             message: "Missing companyId, apiKey, signature or timestamp in request" };
  }
  if (API_KEY && h["x-api-key"] !== API_KEY) {
    return { ok: false, code: 400, error: "NOT_FOUND",
             message: "Partner not found when finding by apiKey" };
  }
  if (COMPANY && h["x-company-id"] !== COMPANY) {
    return { ok: false, code: 401, error: "UNAUTHORIZED",
             message: "Company does not belong to the authenticated Partner" };
  }

  // La ventana de 60 segundos de las requests de API.
  const ts = String(h["x-timestamp"]);
  const ms = /^\d+$/.test(ts) ? Number(ts) : Date.parse(ts);
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 60_000) {
    return { ok: false, code: 401, error: "UNAUTHORIZED", message: "Timestamp too old" };
  }
  // Y el aviso que la doc da por escrito: un ISO sin `Z` se lee como UTC y
  // queda corrido tres horas. El doble lo replica en vez de perdonarlo.
  if (!/^\d+$/.test(ts) && !ts.endsWith("Z")) {
    return { ok: false, code: 401, error: "UNAUTHORIZED",
             message: "Timestamp must be UTC (ISO-8601 ending in Z) or epoch ms" };
  }

  // ⚠ `x-company-id` NO entra en la firma. Es el único de los cuatro
  // headers que queda afuera.
  const esperada = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}|${req.method}|${path}|${body}`)
    .digest("base64");

  if (esperada !== h["x-signature"]) {
    return { ok: false, code: 401, error: "UNAUTHORIZED",
             message: "Signature mismatch — check path (including query string), method case and body serialization" };
  }
  return { ok: true };
}

const server = http.createServer((req, res) => {
  const trozos = [];
  req.on("data", (c) => trozos.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(trozos).toString("utf8");
    // El path que se firma incluye el query string, tal cual viaja.
    const path = req.url;

    // ---------- La manija de las pruebas ----------
    // NO es parte de la API de Cresium y por eso lleva guion bajo: es lo
    // que necesita una prueba para hacer que "entre una transferencia".
    // Va antes de la verificación de firma porque la llama el script, no
    // Cresium.
    if (req.method === "POST" && path === "/_simular") {
      const d = JSON.parse(body || "{}");
      try {
        const r = await simularDeposito(d.externalId, d.monto, d.webhook, d.intento ?? 1);
        const o = ordenes.get(d.externalId);
        console.log(`  → depósito de $${d.monto} en ${d.externalId} · orden ${o.status} · webhook ${r.status}`);
        return responder(res, 200, { ok: true, webhook: r.status, estado: o.status, pagado: o.amountPaid });
      } catch (e) {
        return responder(res, 400, { error: String(e.message) });
      }
    }

    const v = verificar(req, path, body);
    if (!v.ok) {
      console.log(`  ✗ ${req.method} ${path} → ${v.code} ${v.message}`);
      return responder(res, v.code, { code: v.code, error: v.error, message: v.message });
    }

    // ---------- POST /v3/payment-order/ ----------
    if (req.method === "POST" && path === "/v3/payment-order/") {
      const d = JSON.parse(body);
      const ext = d?.paymentOrder?.externalId;

      if (!d?.alias) {
        return responder(res, 400, { code: 400, error: "BAD_REQUEST", message: "alias is required" });
      }
      if (!ext || typeof d.paymentOrder.amount !== "number" || d.paymentOrder.amount <= 0) {
        return responder(res, 400, { code: 400, error: "BAD_REQUEST",
                                     message: "paymentOrder.externalId and a positive amount are required" });
      }
      // `externalId` único por company, igual que el de verdad.
      if (ordenes.has(ext)) {
        return responder(res, 409, { code: 409, error: "CONFLICT",
                                     message: "externalId already exists for this company" });
      }
      // Y el alias es único en todo el país.
      for (const o of ordenes.values()) {
        if (o.alias === d.alias) {
          return responder(res, 409, { code: 409, error: "CONFLICT", message: "alias already taken" });
        }
      }

      const id = proximoId++;
      const orden = {
        id,
        externalId: ext,
        status: "NOT_PAID",
        amount: d.paymentOrder.amount,
        amountPaid: 0,
        alias: d.alias,
        metadata: d.paymentOrder.metadata ?? {},
        // Un CVU con la forma real: 22 dígitos.
        cvu: "0000168400" + String(id).padStart(12, "0"),
      };
      ordenes.set(ext, orden);
      console.log(`  ✓ orden creada ${ext} · ${d.alias} · $${orden.amount}`);
      // ⚠ CON EL ENVOLTORIO `data`, como el de verdad. El doble devolvía
      // el objeto pelado y por eso dejó pasar el bug: el cliente leía
      // `paymentOrder` del nivel superior, acá lo encontraba, y en
      // producción no. Un doble más permisivo que el original es un doble
      // que da verde con el bug adentro.
      return responder(res, 201, {
        data: {
          paymentOrder: { id, externalId: ext, status: "NOT_PAID",
                          amount: orden.amount, amountPaid: 0 },
          depositAddress: { id, type: "CVU", value: orden.cvu, alias: d.alias },
        },
      });
    }

    // ---------- GET /v3/payment-order/{externalId} ----------
    if (req.method === "GET" && path.startsWith("/v3/payment-order/")) {
      const ext = decodeURIComponent(path.slice("/v3/payment-order/".length).split("?")[0]);
      const o = ordenes.get(ext);
      if (!o) return responder(res, 404, { code: 404, error: "NOT_FOUND", message: "payment order not found" });
      return responder(res, 200, { data: o });
    }

    // ---------- GET /v3/transaction/search ----------
    if (req.method === "GET" && path.startsWith("/v3/transaction/search")) {
      return responder(res, 200, { data: { transactions: [], total: 0 } });
    }

    console.log(`  ? ${req.method} ${path} → 404 (el doble no implementa esto)`);
    return responder(res, 404, { code: 404, error: "NOT_FOUND", message: "not implemented in the double" });
  });
});

// ---------- El costado de "simular que alguien transfirió" ----------
// No es parte de la API de Cresium: es la manija que necesita una prueba
// para hacer que entre un depósito. Manda el webhook a la app, firmado
// como lo firmaría Cresium.
export async function simularDeposito(externalId, monto, urlWebhook, intento = 1) {
  const o = ordenes.get(externalId);
  if (!o) throw new Error(`no existe la orden ${externalId}`);
  o.amountPaid += monto;
  o.status = o.amountPaid >= o.amount ? "PAID" : "PARTIAL";

  // ⚠ LA FORMA REAL: data.transaction, un nivel más de lo que dice la doc.
  // Medida con el DEPOSIT de $390 del 16/09/2026. El doble mandaba `data`
  // pelado —como la doc— y por eso dio verde mientras producción dejaba
  // la plata acreditada en Cresium y la pantalla en "esperando".
  const payload = {
    type: "DEPOSIT",
    // El DEPOSIT real de las 01:30 no traía `retry`; el ping del panel sí.
    // Se manda igual: la función lo lee con default 1 y no le importa.
    retry: intento,
    data: {
      transaction: {
        id: 8000 + o.id,
        type: "DEPOSIT",
        status: "SUCCESS",
        totalAmount: monto,
        currency: { code: "ARS", symbol: "$", decimals: 2 },
        to: { type: "CVU", value: o.cvu, ownerName: "SANTIAGO AFUR" },
        paymentOrder: {
          id: o.id, externalId, status: o.status,
          amount: o.amount, amountPaid: o.amountPaid,
          metadata: o.metadata, currency: { code: "ARS" },
        },
      },
    },
  };

  const crudo = JSON.stringify(payload);
  const ts = String(Date.now());
  const u = new URL(urlWebhook);
  const firma = crypto.createHmac("sha256", SECRET)
    .update(`${ts}|POST|${u.pathname + u.search}|${crudo}`).digest("base64");

  return fetch(urlWebhook, {
    method: "POST", body: crudo,
    headers: {
      "content-type": "application/json", "x-api-key": API_KEY,
      "x-company-id": COMPANY, "x-timestamp": ts, "x-signature": firma,
    },
  });
}

export function arrancar() {
  return new Promise((r) => server.listen(PUERTO, () => {
    console.log(`doble de Cresium escuchando en http://localhost:${PUERTO}`);
    r(server);
  }));
}

export function parar() { server.close(); }

// Si se corre directo, queda escuchando.
if (import.meta.url === `file://${process.argv[1]}`) await arrancar();
