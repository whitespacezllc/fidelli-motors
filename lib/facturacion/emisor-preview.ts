import "server-only";
import type {
  ComprobanteParaEmitir,
  EmisorFiscal,
  ResultadoEmision,
} from "@/lib/facturacion/emisor";
import type { TipoComprobante } from "@/lib/facturacion/tipos";

// ============================================================
// Facturación (Nivel 3) · El emisor PREVIEW — rebanada 1, sin ARCA
//
// La única implementación de EmisorFiscal que existe hoy. NO pide un CAE,
// NO numera fiscalmente, NO toca ninguna red: el comprobante se queda en
// `borrador` y lo único que hace esta rebanada es previsualizarlo.
//
// `emitir()` rechaza a propósito: la emisión real es la rebanada 2. Está
// acá para que la UI pueda cablear el botón "Emitir" contra la interfaz
// desde ya y mostrar el mensaje correcto ("emisión real: próxima entrega")
// sin ramas especiales. El día que entre el emisor real, se cambia la
// implementación elegida y la UI no se toca.
// ============================================================

export class EmisorPreview implements EmisorFiscal {
  async emitir(_comprobante: ComprobanteParaEmitir): Promise<ResultadoEmision> {
    return {
      ok: false,
      motivo:
        "La emisión electrónica todavía no está habilitada. Por ahora podés " +
        "previsualizar el comprobante; la factura con CAE llega en la próxima entrega.",
    };
  }

  async consultarUltimoNumero(_puntoVenta: number, _tipo: TipoComprobante): Promise<number> {
    // Sin ARCA no hay numeración fiscal: el borrador no lleva número.
    return 0;
  }
}

/**
 * El emisor fiscal vigente. Hoy siempre el preview; en la rebanada 2 esta
 * función elige la implementación real por entorno (molde del cliente de
 * Cresium). Llamarla y no instanciar la clase a mano deja un único lugar
 * donde cambiar.
 */
export function emisorFiscal(): EmisorFiscal {
  return new EmisorPreview();
}
