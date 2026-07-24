import type { Database } from "@/lib/database.types";

export type ItemTipo = Database["public"]["Enums"]["item_tipo"];

// Los 11 renglones en el orden del enum, que es el del cartón físico.
// "corto" es como se lee en la carga (el grupo ya dice el sustantivo);
// "papel" es como está impreso en el cartón, con las abreviaturas del papel.
export const RENGLONES: {
  tipo: ItemTipo;
  grupo: string;
  corto: string;
  papel: string;
}[] = [
  { tipo: "filtro_aceite", grupo: "FILTROS", corto: "Aceite", papel: "Aceite" },
  { tipo: "filtro_aire", grupo: "FILTROS", corto: "Aire", papel: "Aire" },
  { tipo: "filtro_combustible", grupo: "FILTROS", corto: "Combustible", papel: "Combusti." },
  { tipo: "filtro_habitaculo", grupo: "FILTROS", corto: "Habitáculo", papel: "Habitáculo" },
  { tipo: "aceite_caja", grupo: "ACEITES", corto: "Caja", papel: "Caja" },
  { tipo: "aceite_diferencial", grupo: "ACEITES", corto: "Diferencial", papel: "Diferenc." },
  { tipo: "aceite_hidraulico", grupo: "ACEITES", corto: "Hidráulico", papel: "Hidráulic." },
  { tipo: "liq_refrigerante", grupo: "LÍQUIDOS", corto: "Refrigerante", papel: "Líq. refrige." },
  { tipo: "liq_frenos", grupo: "LÍQUIDOS", corto: "Frenos", papel: "Líq. frenos" },
  { tipo: "aditivo_motor", grupo: "ADITIVOS", corto: "Motor", papel: "Aditivo motor" },
  { tipo: "aditivo_transmision", grupo: "ADITIVOS", corto: "Transmisión", papel: "Aditivo transm." },
];

export const GRUPOS = ["FILTROS", "ACEITES", "LÍQUIDOS", "ADITIVOS"] as const;

// En el papel solo FILTROS y ACEITES llevan la etiqueta vertical; los
// líquidos y aditivos van sueltos porque su nombre ya se explica solo.
export const GRUPOS_CON_ETIQUETA_EN_PAPEL = ["FILTROS", "ACEITES"];

export const VISCOSIDAD_FORMATO =
  "La viscosidad se escribe como 15W40 o 5W30. Revisá el envase.";

export function normalizarViscosidad(texto: string): string {
  return texto.toUpperCase().replace(/[\s-]/g, "");
}

export function esViscosidadValida(texto: string): boolean {
  return /^\d{1,2}W\d{2}$/.test(normalizarViscosidad(texto));
}

// Miles con punto, como se lee un odómetro.
export function formatearKm(km: number): string {
  return km.toLocaleString("es-AR");
}
