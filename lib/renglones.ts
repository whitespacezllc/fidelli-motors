import type { Database } from "@/lib/database.types";

export type ItemTipo = Database["public"]["Enums"]["item_tipo"];

// Los grupos del cartón, en el orden del papel. LUBRICACIÓN es del
// vehículo pesado (contiene solo el engrase). La batería no arma grupo:
// va suelta, sin encabezado (ver RENGLONES).
export const GRUPOS = [
  "FILTROS",
  "ACEITES",
  "LÍQUIDOS",
  "ADITIVOS",
  "LUBRICACIÓN",
] as const;

export type Grupo = (typeof GRUPOS)[number];

// La clase del vehículo, como la lee el front: `clase ?? "liviano"`. Es
// un DEFAULT de qué viene desplegado, nunca una puerta: en ninguna
// combinación de clase queda un renglón inalcanzable. La moto no vive
// acá (se deriva de la chapa, ver 20260904120000). Un tercer valor que
// aparezca algún día cae en el set liviano, nunca en ninguno.
export type ClaseVehiculo = "liviano" | "pesado";

export function normalizarClase(valor: unknown): ClaseVehiculo {
  return valor === "pesado" ? "pesado" : "liviano";
}

// Qué decide si un renglón viene desplegado en la carga:
//   siempre — los 11 de siempre. A la vista para todos.
//   pesado  — los 9 de camión. Desplegados cuando el vehículo es pesado.
//   extra   — solo la batería. Nunca desplegada por clase; siempre
//             detrás del "+". Sirve en todos los vehículos, y por eso era
//             el único que podía estar de más en la pantalla de alguien.
export type AlcanceRenglon = "siempre" | "pesado" | "extra";

export type Renglon = {
  tipo: ItemTipo;
  /** null = renglón suelto, sin encabezado de grupo (la batería). */
  grupo: Grupo | null;
  alcance: AlcanceRenglon;
  /** Como se lee en la carga: el grupo ya dice el sustantivo. */
  corto: string;
  /** Como está impreso en el cartón, con las abreviaturas del papel. */
  papel: string;
  /** La relectura para vehículo pesado. MISMO item_tipo, mismo valor en
   *  la base: solo cambia cómo se lee la etiqueta. En el Excel va siempre
   *  la neutra (ver ETIQUETA_RENGLON en la exportación). */
  pesado?: { corto: string; papel: string };
};

// Los 21 renglones en el orden del enum, que es el del cartón físico.
// Los 11 de siempre más los 10 del sprint de vehículo pesado
// (20260915120000): nueve de camión y la batería.
//
// filtro_hidraulico es EL FILTRO (nuevo, de camión). aceite_hidraulico es
// EL ACEITE y existe desde el día uno. Son dos renglones distintos: en el
// papel los dos dicen "Hidráulic." y los distingue la etiqueta vertical
// del grupo, igual que en el cartón de siempre.
export const RENGLONES: Renglon[] = [
  { tipo: "filtro_aceite", grupo: "FILTROS", alcance: "siempre", corto: "Aceite", papel: "Aceite" },
  { tipo: "filtro_aire", grupo: "FILTROS", alcance: "siempre", corto: "Aire", papel: "Aire" },
  {
    tipo: "filtro_combustible",
    grupo: "FILTROS",
    alcance: "siempre",
    corto: "Combustible",
    papel: "Combusti.",
    pesado: { corto: "Combustible primario", papel: "Combust. prim." },
  },
  { tipo: "filtro_habitaculo", grupo: "FILTROS", alcance: "siempre", corto: "Habitáculo", papel: "Habitáculo" },
  { tipo: "filtro_combustible_secundario", grupo: "FILTROS", alcance: "pesado", corto: "Combustible secundario", papel: "Combust. sec." },
  { tipo: "filtro_separador_agua", grupo: "FILTROS", alcance: "pesado", corto: "Separador de agua", papel: "Separ. agua" },
  { tipo: "filtro_aire_secundario", grupo: "FILTROS", alcance: "pesado", corto: "Aire secundario", papel: "Aire sec." },
  { tipo: "filtro_secador_aire", grupo: "FILTROS", alcance: "pesado", corto: "Secador de aire", papel: "Secador aire" },
  { tipo: "filtro_urea", grupo: "FILTROS", alcance: "pesado", corto: "Urea (AdBlue)", papel: "Urea" },
  { tipo: "filtro_hidraulico", grupo: "FILTROS", alcance: "pesado", corto: "Hidráulico", papel: "Hidráulic." },
  { tipo: "aceite_caja", grupo: "ACEITES", alcance: "siempre", corto: "Caja", papel: "Caja" },
  {
    tipo: "aceite_diferencial",
    grupo: "ACEITES",
    alcance: "siempre",
    corto: "Diferencial",
    papel: "Diferenc.",
    pesado: { corto: "Diferencial trasero", papel: "Diferenc. tras." },
  },
  { tipo: "aceite_hidraulico", grupo: "ACEITES", alcance: "siempre", corto: "Hidráulico", papel: "Hidráulic." },
  { tipo: "aceite_caja_reductora", grupo: "ACEITES", alcance: "pesado", corto: "Caja reductora", papel: "Caja reduct." },
  { tipo: "aceite_diferencial_delantero", grupo: "ACEITES", alcance: "pesado", corto: "Diferencial delantero", papel: "Diferenc. del." },
  { tipo: "liq_refrigerante", grupo: "LÍQUIDOS", alcance: "siempre", corto: "Refrigerante", papel: "Líq. refrige." },
  { tipo: "liq_frenos", grupo: "LÍQUIDOS", alcance: "siempre", corto: "Frenos", papel: "Líq. frenos" },
  { tipo: "aditivo_motor", grupo: "ADITIVOS", alcance: "siempre", corto: "Motor", papel: "Aditivo motor" },
  { tipo: "aditivo_transmision", grupo: "ADITIVOS", alcance: "siempre", corto: "Transmisión", papel: "Aditivo transm." },
  { tipo: "engrase", grupo: "LUBRICACIÓN", alcance: "pesado", corto: "Engrase", papel: "Engrase" },
  { tipo: "bateria", grupo: null, alcance: "extra", corto: "Batería", papel: "Batería" },
];

// En el papel solo FILTROS y ACEITES llevan la etiqueta vertical; los
// líquidos, los aditivos y el engrase van sueltos porque su nombre ya se
// explica solo.
export const GRUPOS_CON_ETIQUETA_EN_PAPEL = ["FILTROS", "ACEITES"];

/** Lo que la clase despliega por defecto. Un default, no una puerta. */
export function desplegadoPorClase(r: Renglon, clase: ClaseVehiculo): boolean {
  return r.alcance === "siempre" || (r.alcance === "pesado" && clase === "pesado");
}

/** La etiqueta de la carga, con la relectura de pesado si la hay. */
export function etiquetaCorta(r: Renglon, clase: ClaseVehiculo): string {
  return clase === "pesado" && r.pesado ? r.pesado.corto : r.corto;
}

/** La etiqueta del papel, con la relectura de pesado si la hay. */
export function etiquetaPapel(r: Renglon, clase: ClaseVehiculo): string {
  return clase === "pesado" && r.pesado ? r.pesado.papel : r.papel;
}

// Las once viscosidades de uso corriente, en orden ascendente — la
// convención del rubro. Es una CONSTANTE y no una tabla: la viscosidad es
// un estándar de la industria (SAE J300), no una decisión comercial de
// cada lubricentro. Los chips de la carga salen de acá; el texto libre
// sigue existiendo para lo que no esté (un 0W16 de japoneses nuevos).
export const VISCOSIDADES_SAE = [
  "0W20",
  "0W30",
  "5W20",
  "5W30",
  "5W40",
  "10W30",
  "10W40",
  "10W60",
  "15W40",
  "20W50",
  "25W60",
] as const;

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

// Los saltos del próximo service. Tres atajos fijos —el service típico de
// un auto, a un toque— y "Otro" para lo que no entra en ellos: la moto que
// se hace cada 4.000, el camión pesado cada 25.000, el cliente que conoce
// su auto y pide 12.000. El número a mano ya existió y se sacó (un 100.000
// de más ensució la predicción de retorno); vuelve acotado: pide el SALTO
// y no el kilometraje final, y el salto tiene rango. Un cero de más en un
// 10.000 no pasa; en un 4.000 se ve al lado, en "Próximo service: …".
export const SALTOS_FIJOS = [8_000, 10_000, 15_000] as const;
export const SALTO_POR_DEFECTO = 10_000;
export const SALTO_MINIMO = 1_000;
export const SALTO_MAXIMO = 60_000;

export function esSaltoValido(salto: number): boolean {
  return (
    Number.isInteger(salto) && salto >= SALTO_MINIMO && salto <= SALTO_MAXIMO
  );
}

// Bajo el campo de "Otro": el hecho y el ejemplo correcto.
export const SALTO_RANGO = `Entre ${formatearKm(SALTO_MINIMO)} y ${formatearKm(SALTO_MAXIMO)} km: 4.000 para una moto, 25.000 para un camión.`;

// La misma regla desde el servidor, para un payload que no pasó por el cartón.
export const SALTO_RANGO_ERROR = `El próximo service tiene que quedar entre ${formatearKm(SALTO_MINIMO)} y ${formatearKm(SALTO_MAXIMO)} km después de los kilómetros de hoy. Elegí un salto o corregí el de Otro.`;
