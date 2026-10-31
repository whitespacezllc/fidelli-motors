import "server-only";
import { normalizarExtraido, type ComprobanteExtraido } from "@/lib/comprobantes";
import type { ArchivoComprobante, ExtractorComprobante } from "@/lib/comprobantes/extractor";

// ============================================================
// ExtractorClaude · la lectura real, con la visión de Claude
//
// Por HTTP directo a la Messages API, como el cliente de Cresium y Resend
// —el proyecto no suma SDKs—. La clave va server-only (molde
// lib/supabase/admin.ts): sin NEXT_PUBLIC_, nunca en el bundle del cliente.
// El modelo es un knob de costo (MODELO_COMPROBANTES): para leer un
// comprobante alcanza y sobra el más barato, y es una extracción por foto.
// ============================================================

const API = "https://api.anthropic.com/v1/messages";
const MODELO = process.env.MODELO_COMPROBANTES ?? "claude-haiku-5-5";

const INSTRUCCION = `Sos un lector de comprobantes argentinos (facturas, tickets, recibos). Te paso la imagen o el PDF de UN comprobante que un lubricentro recibió de un proveedor. Devolvé SOLO un objeto JSON (sin texto antes ni después, sin markdown) con estas claves exactas:
{"tipo": string|null, "razon_social": string|null, "cuit": string|null, "numero": string|null, "fecha": "YYYY-MM-DD"|null, "neto": number|null, "iva": number|null, "total": number|null, "items": [{"descripcion": string, "cantidad": number|null, "importe": number|null}], "advertencias": [string]}
Reglas:
- "razon_social" es el EMISOR (el proveedor que factura), no el que recibe.
- "cuit" en once dígitos pelados, sin guiones; null si no se lee.
- Los montos como número (punto decimal), sin símbolo ni separador de miles.
- "fecha" en formato YYYY-MM-DD.
- En "advertencias" poné en texto corto lo que no puedas leer con seguridad (por ejemplo "el total está borroso"). NO inventes datos: lo que no se lee va null.`;

export class ExtractorClaude implements ExtractorComprobante {
  async extraer(archivo: ArchivoComprobante): Promise<ComprobanteExtraido> {
    const clave = process.env.ANTHROPIC_API_KEY;
    if (!clave) {
      throw new Error(
        "Falta ANTHROPIC_API_KEY en el entorno. Sin esa clave no se puede leer un comprobante con IA (o prendé EXTRACTOR_COMPROBANTE=doble para desarrollo).",
      );
    }

    const base64 = Buffer.from(archivo.bytes).toString("base64");
    const fuente =
      archivo.mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: archivo.mime, data: base64 } };

    const r = await fetch(API, {
      method: "POST",
      headers: {
        "x-api-key": clave,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        system: INSTRUCCION,
        messages: [
          {
            role: "user",
            content: [fuente, { type: "text", text: "Extraé los datos de este comprobante." }],
          },
        ],
      }),
    });

    if (!r.ok) {
      throw new Error(`La lectura del comprobante falló (${r.status}).`);
    }

    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const texto = (j.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    return normalizarExtraido(parsearJson(texto));
  }
}

/** El modelo tiene que devolver JSON pelado, pero por las dudas se le saca
 *  el cerco de markdown y se toma el primer objeto. Si no hay JSON, se
 *  devuelve {} y la pantalla queda para cargar a mano. */
function parsearJson(texto: string): unknown {
  const limpio = texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const desde = limpio.indexOf("{");
  const hasta = limpio.lastIndexOf("}");
  if (desde === -1 || hasta === -1 || hasta < desde) return {};
  try {
    return JSON.parse(limpio.slice(desde, hasta + 1));
  } catch {
    return {};
  }
}
