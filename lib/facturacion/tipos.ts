// ============================================================
// Facturación (Nivel 3) · Los tipos y la letra del comprobante
//
// ESPEJO TIPADO de la base: tipo_comprobante_para() y los CHECK de
// `comprobantes` viven en SQL (20261023120000). Acá se repite solo para
// decidir la letra en el preview del navegador y para nombrar las cosas en
// la interfaz — la fuente de verdad es la base.
//
// La condición del EMISOR sale de datos_empresa (tres valores). El RECEPTOR
// agrega 'consumidor_final': alguien sin CUIT que se lleva la factura.
// ============================================================

/** La condición del emisor (datos_empresa.condicion_iva). */
export type CondicionEmisor = "responsable_inscripto" | "monotributo" | "exento";

/** La del receptor: las tres del emisor + consumidor final. */
export type CondicionReceptor = CondicionEmisor | "consumidor_final";

/** La letra del comprobante (comprobantes.tipo). */
export type TipoComprobante =
  | "factura_a"
  | "factura_b"
  | "factura_c"
  | "nota_credito_a"
  | "nota_credito_b"
  | "nota_credito_c"
  | "nota_debito_a"
  | "nota_debito_b"
  | "nota_debito_c";

/** El estado del comprobante (comprobantes.estado). */
export type EstadoComprobante = "borrador" | "emitido" | "rechazado" | "anulado";

/** Las alícuotas que soporta esta rebanada. */
export const ALICUOTAS = [0, 10.5, 21] as const;
export type Alicuota = (typeof ALICUOTAS)[number];

export const ETIQUETA_CONDICION_RECEPTOR: Record<CondicionReceptor, string> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
  consumidor_final: "Consumidor Final",
};

/** Cómo se lee la letra en el documento y en la lista. */
export const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  nota_credito_a: "Nota de Crédito A",
  nota_credito_b: "Nota de Crédito B",
  nota_credito_c: "Nota de Crédito C",
  nota_debito_a: "Nota de Débito A",
  nota_debito_b: "Nota de Débito B",
  nota_debito_c: "Nota de Débito C",
};

/**
 * La letra que corresponde, espejo de tipo_comprobante_para() en SQL.
 *   · Emisor RI → receptor RI = A; receptor otro = B.
 *   · Emisor monotributo o exento → siempre C.
 * Devuelve null si el par no define una letra (no debería pasar con los
 * valores válidos).
 */
export function tipoComprobantePara(
  emisor: CondicionEmisor,
  receptor: CondicionReceptor,
): TipoComprobante | null {
  if (emisor === "responsable_inscripto") {
    return receptor === "responsable_inscripto" ? "factura_a" : "factura_b";
  }
  if (emisor === "monotributo" || emisor === "exento") return "factura_c";
  return null;
}

/** ¿Esta letra discrimina IVA en el papel? Solo las A/B/NC/ND de RI. */
export function discriminaIva(tipo: TipoComprobante): boolean {
  return !tipo.endsWith("_c");
}
