// El doble local de la API de Resend, para probar /api/fidelli/avisos-cobranza
// sin mandar un solo email de verdad.
//
//   node scripts/doble-resend.mjs            (PUERTO=4020 por defecto)
//
// El SDK de Resend lee RESEND_BASE_URL del entorno: con
// RESEND_BASE_URL=http://localhost:4020 en .env.local, `resend.emails.send()`
// pega acá. Lo que contesta:
//
//   · POST /emails con la key esperada → 200 {"id": "<uuid>"}, y guarda el
//     email en memoria.
//   · POST /emails con otra key         → 401 {"statusCode":401,
//     "message":"API key is invalid","name":"validation_error"}.
//   · en modo «caer» → 500 {"statusCode":500, "message":"…",
//     "name":"internal_server_error"}: Resend caído.
//
// ⚠ REGLA 19 DE CLAUDE.md: estas respuestas salen de la DOCUMENTACIÓN de
// Resend (resend.com/docs/api-reference/errors), no de una llamada real
// medida. El doble prueba lo que hace la ruta con un rechazo y con una
// confirmación; no prueba que Resend conteste exactamente así. Por eso la
// ruta trata como no mandado cualquier respuesta sin `id`, venga con el
// error que venga. Los tres emails reales a fidelli.motors@gmail.com son la
// prueba contra el original.
//
// Endpoints de control (no existen en Resend): GET /_enviados,
// POST /_reset, POST /_modo {"modo":"ok"|"rechazar"|"caer"}.
import http from "node:http";
import crypto from "node:crypto";

const PUERTO = Number(process.env.PUERTO ?? 4020);
const KEY = process.env.DOBLE_RESEND_KEY ?? "re_prueba_local";

let modo = "ok";
const enviados = [];

function json(res, status, cuerpo) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req) {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PUERTO}`);

  if (req.method === "GET" && url.pathname === "/_enviados") return json(res, 200, enviados);
  if (req.method === "POST" && url.pathname === "/_reset") { enviados.length = 0; modo = "ok"; return json(res, 200, { ok: true }); }
  if (req.method === "POST" && url.pathname === "/_modo") {
    const b = await leerCuerpo(req);
    modo = b.modo ?? "ok";
    return json(res, 200, { modo });
  }

  if (req.method === "POST" && url.pathname === "/emails") {
    const cuerpo = await leerCuerpo(req);
    if (modo === "caer") {
      return json(res, 500, { statusCode: 500, message: "Something went wrong", name: "internal_server_error" });
    }
    const auth = req.headers.authorization ?? "";
    if (modo === "rechazar" || auth !== `Bearer ${KEY}`) {
      return json(res, 401, { statusCode: 401, message: "API key is invalid", name: "validation_error" });
    }
    const id = crypto.randomUUID();
    enviados.push({ id, recibido_at: new Date().toISOString(), ...cuerpo });
    return json(res, 200, { id });
  }

  json(res, 404, { statusCode: 404, message: "Not found", name: "not_found" });
});

export function arrancar() {
  return new Promise((r) => server.listen(PUERTO, () => {
    console.log(`doble de Resend escuchando en http://localhost:${PUERTO} (key ${KEY})`);
    r();
  }));
}
export function parar() { server.close(); }

if (import.meta.url === `file://${process.argv[1]}`) await arrancar();
