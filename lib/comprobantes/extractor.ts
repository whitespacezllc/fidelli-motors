import "server-only";
import type { ComprobanteExtraido, MimeComprobante } from "@/lib/comprobantes";
import { ExtractorClaude } from "@/lib/comprobantes/extractor-claude";
import { ExtractorDoble } from "@/lib/comprobantes/extractor-doble";

// ============================================================
// El EXTRACTOR de comprobantes — el seam de la IA
//
// El punto donde la lectura por IA se enchufa sin tocar la base ni la UI,
// igual que EmisorFiscal (lib/facturacion/emisor.ts) o el cliente de
// Cresium. Hoy la única implementación real es ExtractorClaude (visión, por
// HTTP directo, como Cresium y Resend — sin SDK nuevo). En la regresión y
// en el dev sin clave se usa ExtractorDoble: ningún comprobante de prueba
// viaja a Anthropic.
//
// Server-only: la clave (ANTHROPIC_API_KEY) nunca puede terminar en un
// bundle del navegador.
// ============================================================

export type ArchivoComprobante = {
  /** Los bytes del archivo tal como llegaron al bucket. */
  bytes: Uint8Array;
  mime: MimeComprobante;
};

export interface ExtractorComprobante {
  /** Lee el comprobante y propone sus datos. Puede fallar (red, formato
   *  ilegible): quien llama lo trata como "no se pudo leer, cargalo a mano". */
  extraer(archivo: ArchivoComprobante): Promise<ComprobanteExtraido>;
}

/**
 * El extractor vigente. El doble se usa SOLO con EXTRACTOR_COMPROBANTE=doble
 * (lo prende la regresión, y el dev que no quiere gastar una llamada). En
 * cualquier otro caso es Claude, que exige la clave. Un único lugar donde
 * elegir, como emisorFiscal().
 */
export function extractorComprobante(): ExtractorComprobante {
  if (process.env.EXTRACTOR_COMPROBANTE === "doble") {
    return new ExtractorDoble();
  }
  return new ExtractorClaude();
}
