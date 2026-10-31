import "server-only";
import { normalizarExtraido, type ComprobanteExtraido } from "@/lib/comprobantes";
import type { ArchivoComprobante, ExtractorComprobante } from "@/lib/comprobantes/extractor";

// ============================================================
// ExtractorDoble · el doble de pruebas
//
// No mira el archivo: responde SIEMPRE lo mismo, para que la regresión sepa
// qué campos tienen que quedar prellenados. Se prende con
// EXTRACTOR_COMPROBANTE=doble. Ningún comprobante de prueba viaja a
// Anthropic, igual que los dobles de Cresium y de Resend.
// ============================================================

export class ExtractorDoble implements ExtractorComprobante {
  async extraer(archivo: ArchivoComprobante): Promise<ComprobanteExtraido> {
    void archivo; // el doble no mira el archivo: responde siempre lo mismo.
    return normalizarExtraido({
      tipo: "Factura A",
      razon_social: "Distribuidora La Pampa S.R.L.",
      cuit: "30711222333",
      numero: "0001-00012345",
      fecha: "2026-10-15",
      neto: 100000,
      iva: 21000,
      total: 121000,
      items: [{ descripcion: "Aceite 15W40 x20L", cantidad: 1, importe: 100000 }],
      advertencias: [],
    });
  }
}
