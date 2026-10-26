import "server-only";
import type { TipoComprobante } from "@/lib/facturacion/tipos";

// ============================================================
// Facturación (Nivel 3) · La interfaz del EMISOR FISCAL — el seam
//
// El punto donde la rebanada 2 se enchufa sin tocar ni la base ni la UI.
// En la rebanada 1 la única implementación es `emisor-preview.ts`, que NO
// toca ARCA: arma el preview y nada más. El día que entre la emisión real
// —un proveedor fiscal (AFIP SDK / TusFacturas / …) o el directo contra
// ARCA, primero en homologación— implementa ESTA interfaz y se elige por
// entorno, igual que el cliente de Cresium (lib/cresium/cliente.ts).
//
// La decisión proveedor-vs-directo está DIFERIDA a propósito: la rebanada 1
// es gratis y agnóstica, así que acá no se nombra a nadie.
// ============================================================

export type ComprobanteParaEmitir = {
  id: string;
  tipo: TipoComprobante;
  puntoVenta: number;
  /** El total y el desglose ya calculados por la base. */
  total: number;
  netoGravado: number;
  exento: number;
  iva105: number;
  iva21: number;
  receptorCuit: string | null;
  receptorCondicion: string;
};

/** Lo que devuelve una emisión: el CAE y la numeración, o el rechazo. */
export type ResultadoEmision =
  | {
      ok: true;
      /** El número fiscal que asignó ARCA. */
      numero: number;
      cae: string;
      caeVencimiento: string; // ISO date
      /** El id del comprobante del lado del emisor (proveedor o AFIP). */
      emisorRef: string | null;
    }
  | {
      ok: false;
      /** El motivo del rechazo, para mostrarlo sin jerga. */
      motivo: string;
    };

export interface EmisorFiscal {
  /**
   * Emite un comprobante contra el emisor fiscal y devuelve el CAE + número.
   * En la rebanada 1 NADIE llama a esto en serio: la implementación preview
   * no lo expone como emisión real.
   */
  emitir(comprobante: ComprobanteParaEmitir): Promise<ResultadoEmision>;

  /** El último número usado en un punto de venta y tipo (para numerar). */
  consultarUltimoNumero(puntoVenta: number, tipo: TipoComprobante): Promise<number>;
}
