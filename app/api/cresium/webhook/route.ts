import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import {
  firmar,
  firmaCoincide,
  stringAFirmar,
  timestampEnVentana,
  VENTANA_WEBHOOK_SEGUNDOS,
} from "@/lib/cresium/firma";
import { huella } from "@/lib/cresium/cliente";

// ============================================================
// EL WEBHOOK DE CRESIUM — la parte peligrosa
//
// Acá NO HAY SESIÓN DE SUPABASE: la llama Cresium, no un usuario. Esta
// ruta es la única puerta por la que entra plata al sistema, así que las
// tres reglas de abajo no se negocian.
//
//   1 · LA FIRMA SE VERIFICA ANTES DE LEER NADA DEL BODY. Un `externalId`
//       en un payload sin firmar es un string que cualquiera puede mandar
//       para regalarse doce meses de suscripción. Si la firma no valida:
//       401 y NO SE TOCA LA BASE. Ni un insert, ni un log en tabla —
//       si guardáramos los rechazos, cualquiera nos llena una tabla con
//       un `curl` en un for.
//
//   2 · IDEMPOTENTE. Cresium reintenta hasta CINCO veces si no
//       respondemos 2xx. La segunda entrega del mismo depósito tiene que
//       responder 200 sin acreditar de nuevo — lo garantiza el unique de
//       `pagos.cresium_transaccion_id`, en la base, no acá.
//
//   3 · LA CLAVE DE SERVICIO SE USA ACÁ Y EN NINGÚN OTRO LADO DEL REQUEST
//       PATH. Entra por `crearClienteAdmin()`, que lleva `server-only`.
//
// ⚠ Y UNA CUARTA, que es de dónde salen la mitad de los 401 ajenos:
// LA FIRMA SE CALCULA SOBRE EL BODY CRUDO, EL STRING TAL CUAL LLEGÓ.
// Parsear el JSON y volver a serializarlo cambia el orden de las claves y
// el espaciado, y la firma deja de coincidir. Por eso acá se lee
// `request.text()` primero y el `JSON.parse` viene DESPUÉS de verificar.
// ============================================================

// La ruta no se cachea ni se prerenderiza: cada entrega es un evento
// distinto con efectos en la base.
export const dynamic = "force-dynamic";

// Un cobro no puede depender de que el reloj del contenedor esté bien,
// pero tampoco puede aceptar un timestamp de 2099. La ventana la fija
// lib/cresium/firma.ts según la doc de Cresium (5 minutos para webhooks).

function rechazar(motivo: string, status = 401) {
  // El motivo va al log del servidor, NUNCA al cuerpo de la respuesta:
  // decirle a quien golpea la puerta si falló la firma o el timestamp es
  // regalarle un oráculo para ir corrigiendo.
  console.error(`[cresium/webhook] rechazado: ${motivo}`);
  return NextResponse.json({ error: "unauthorized" }, { status });
}

export async function POST(request: Request) {
  const secret = process.env.CRESIUM_SECRET;
  if (!secret) {
    // Sin secret no se puede verificar NADA. Fallar cerrado: un 500 hace
    // que Cresium reintente, así que el evento no se pierde mientras se
    // arregla el entorno.
    console.error("[cresium/webhook] falta CRESIUM_SECRET en el entorno");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const firmaRecibida = request.headers.get("x-signature");
  const timestamp = request.headers.get("x-timestamp");
  const apiKey = request.headers.get("x-api-key");

  if (!firmaRecibida || !timestamp || !apiKey) {
    return rechazar("faltan headers (x-signature, x-timestamp o x-api-key)");
  }

  // ⚠ QUÉ KEY FIRMÓ ESTE WEBHOOK, y por qué importa.
  //
  // Una cuenta de Cresium puede tener varias API Keys sobre la MISMA
  // empresa, cada una con su propio secret (el panel permite hasta tres).
  // El webhook lo firma la key que está asociada a su configuración, y
  // `x-api-key` es lo único que dice cuál fue.
  //
  // Sin este chequeo, un webhook firmado por la otra key llega como
  // "firma inválida" — un 401 que manda a revisar la construcción del
  // string, que es donde nunca está el problema. Con el chequeo, el log
  // dice exactamente qué pasó.
  const apiKeyEsperada = process.env.CRESIUM_API_KEY?.trim();
  if (apiKeyEsperada && apiKey.trim() !== apiKeyEsperada) {
    return rechazar(
      `el webhook lo firmó OTRA API Key de la cuenta: llegó ${huella(apiKey.trim())} ` +
        `y esperábamos ${huella(apiKeyEsperada)}. Si hay DOS webhooks configurados, ` +
        "borrá el que no corresponde en cresium.app → Configuración → Desarrolladores.",
    );
  }

  // La ventana ANTES que el HMAC: un replay con firma válida pero vieja
  // se descarta igual, y sale más barato.
  if (!timestampEnVentana(timestamp, VENTANA_WEBHOOK_SEGUNDOS)) {
    return rechazar(`timestamp fuera de la ventana de ${VENTANA_WEBHOOK_SEGUNDOS}s: ${timestamp}`);
  }

  // EL BODY CRUDO. Este string es el que se firma y el que se parsea,
  // en ese orden y nunca al revés.
  const crudo = await request.text();

  // El PATH incluye el query string, tal cual lo mandó Cresium. `new URL`
  // sobre `request.url` lo devuelve ya normalizado y sin el origen, que es
  // exactamente lo que entra en la firma.
  const url = new URL(request.url);
  const path = url.pathname + url.search;

  const esperada = firmar(
    { timestamp, metodo: "POST", path, body: crudo },
    secret,
  );

  if (!firmaCoincide(firmaRecibida, esperada)) {
    // ⚠ EL DIAGNÓSTICO, y por qué es seguro publicarlo.
    //
    // Un 401 de firma no dice DÓNDE difiere el string, y sin eso la única
    // salida es adivinar entre el path, el body y el timestamp. Acá se
    // publica la FORMA de cada pieza —nunca su contenido— más una huella
    // de 8 hex de las dos firmas.
    //
    // Ninguna de esas cosas sirve para forjar una firma: la huella es un
    // sha256 truncado, y el largo del body y el path ya los conoce quien
    // manda la request. Lo que sí hacen es contestar, con UNA entrega, si
    // Cresium firmó otro path, otro cuerpo o con otro secret.
    //
    // Se saca cuando el webhook ande. No es logging permanente.
    const u2 = new URL(request.url);
    console.error(
      `[cresium/webhook] DIAGNÓSTICO de firma:\n` +
        `  path firmado por nosotros : "${path}"\n` +
        `  pathname / search         : "${u2.pathname}" / "${u2.search}"\n` +
        `  url cruda de la request   : "${request.url}"\n` +
        `  timestamp recibido        : "${timestamp}" (${/^\d+$/.test(timestamp) ? "epoch ms" : "ISO"})\n` +
        `  body                      : ${crudo.length} caracteres · ${Buffer.byteLength(crudo, "utf8")} bytes\n` +
        `  body empieza              : ${JSON.stringify(crudo.slice(0, 80))}\n` +
        `  body termina              : ${JSON.stringify(crudo.slice(-40))}\n` +
        `  string firmado empieza    : ${JSON.stringify(stringAFirmar({ timestamp, metodo: "POST", path, body: crudo }).slice(0, 60))}\n` +
        `  firma recibida (huella)   : ${huella(firmaRecibida)} · largo ${firmaRecibida.length}\n` +
        `  firma esperada (huella)   : ${huella(esperada)} · largo ${esperada.length}\n` +
        `  secret en uso (huella)    : ${huella(secret)} · largo ${secret.length}\n` +
        `  api-key recibida (huella) : ${huella(apiKey.trim())}`,
    );

    // Y la prueba que cierra el caso: si la firma coincide firmando la URL
    // COMPLETA en vez del path, el problema es de ellos y se arregla sin
    // tocar credenciales. Es la divergencia más probable, porque la doc
    // dice "path" pero su propio ejemplo de webhooks lo deja ambiguo.
    const conUrlCompleta = firmar(
      { timestamp, metodo: "POST", path: request.url, body: crudo },
      secret,
    );
    const conPathSinBarra = firmar(
      { timestamp, metodo: "POST", path: u2.pathname.replace(/\/$/, ""), body: crudo },
      secret,
    );
    const conBarraFinal = firmar(
      { timestamp, metodo: "POST", path: u2.pathname + "/", body: crudo },
      secret,
    );
    console.error(
      `[cresium/webhook] ¿alguna variante coincide?` +
        ` urlCompleta=${firmaCoincide(firmaRecibida, conUrlCompleta)}` +
        ` sinBarraFinal=${firmaCoincide(firmaRecibida, conPathSinBarra)}` +
        ` conBarraFinal=${firmaCoincide(firmaRecibida, conBarraFinal)}`,
    );

    return rechazar(`firma inválida para POST ${path}`);
  }

  // ---------- Recién ACÁ el payload deja de ser un string hostil ----------
  let payload: unknown;
  try {
    payload = JSON.parse(crudo);
  } catch {
    // Firmado pero ilegible. Es raro y vale la pena verlo: 400, que no
    // dispara reintento, porque reintentar un JSON roto da lo mismo cinco
    // veces.
    console.error("[cresium/webhook] payload firmado pero no es JSON válido");
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const evento = payload as { type?: string; data?: { id?: number } };

  // Hoy Cresium manda UN solo tipo de evento. Uno desconocido se responde
  // 200 —no queremos cinco reintentos de algo que no vamos a procesar
  // nunca— pero se logea, porque significa que la integración cambió.
  if (evento.type !== "DEPOSIT") {
    console.warn(`[cresium/webhook] evento ignorado de tipo ${evento.type}`);
    return NextResponse.json({ ok: true, ignorado: evento.type ?? null });
  }

  const supabase = crearClienteAdmin();
  const { data, error } = await supabase.rpc("acreditar_deposito_cresium", {
    p_payload: payload as never,
  });

  if (error) {
    // 500 a propósito: Cresium reintenta y el depósito no se pierde
    // mientras se arregla lo que falló de este lado.
    console.error(
      `[cresium/webhook] falló al acreditar la transacción ${evento.data?.id}: ${error.message}`,
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const resultado = (data as { resultado?: string } | null)?.resultado ?? "desconocido";
  console.info(
    `[cresium/webhook] transacción ${evento.data?.id}: ${resultado}`,
  );

  // 200 para TODOS los caminos que ya no son un error nuestro —acreditado,
  // reintento, PARTIAL, orden ajena—. Si respondiéramos otra cosa, Cresium
  // reintentaría cinco veces un evento que ya entendimos perfectamente.
  return NextResponse.json({ ok: true, resultado });
}

// Cualquier otro método: 405. Sirve para darse cuenta rápido de que el
// webhook quedó apuntado a la URL equivocada.
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
