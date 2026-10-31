// Helpers del módulo Finanzas compartidos entre pantallas.

// Los medios de pago: lista corta y cerrada, ESPEJO del CHECK de la base
// (ingresos_medio_valido / egresos_medio_valido en la migración de la caja).
// Un medio nuevo se agrega en las dos puntas, en el mismo PR.
export const MEDIOS_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const;

export type MedioPago = (typeof MEDIOS_PAGO)[number];

/** Cómo se nombra cada medio en la interfaz. */
export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export function esMedioPago(valor: string): valor is MedioPago {
  return (MEDIOS_PAGO as readonly string[]).includes(valor);
}

// ---------- Categoría / origen del movimiento ----------
// Set corto y FIJO, ESPEJO de los CHECK de la base (ingreso_categoria_valida /
// egreso_categoria_valida). Es el "de qué es la plata", aparte del medio.
export const CATEGORIAS_INGRESO = ["trabajo", "repuesto", "otro"] as const;
export const CATEGORIAS_EGRESO = ["insumos", "sueldos", "servicios", "otro"] as const;

export type CategoriaIngreso = (typeof CATEGORIAS_INGRESO)[number];
export type CategoriaEgreso = (typeof CATEGORIAS_EGRESO)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaIngreso | CategoriaEgreso, string> = {
  trabajo: "Trabajo",
  repuesto: "Repuesto",
  insumos: "Insumos",
  sueldos: "Sueldos",
  servicios: "Servicios",
  otro: "Otro",
};

/** La etiqueta de una categoría, tolerante al null/desconocido. */
export function etiquetaCategoria(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return (ETIQUETA_CATEGORIA as Record<string, string>)[valor] ?? null;
}

// ---------- Fondos: de qué bolsillo (solo egresos) ----------
// taller = plata del lubricentro (entra al arqueo); personal = la del dueño,
// de su bolsillo (NO entra al arqueo). Espejo de egreso_fondos_valido.
export const FONDOS = ["taller", "personal"] as const;
export type Fondos = (typeof FONDOS)[number];

export const ETIQUETA_FONDOS: Record<Fondos, string> = {
  taller: "Del taller",
  personal: "Personal (de tu bolsillo)",
};

/** AR: miles con punto, decimales con coma. "12.500,50" → 12500.5 */
export function parsearMonto(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", ".")) || 0;
}

// Un punto de la serie de la caja: ingresos y egresos de ese período. El
// neto se calcula en el front. Espejo de lo que devuelve serie_caja().
export type PuntoCaja = { inicio: string; ingresos: number; egresos: number };

export type MetricaCaja = "ingresos" | "egresos" | "neto";

/** Las tres curvas del gráfico de la caja, en el orden del selector. */
export const METRICAS_CAJA = [
  { clave: "ingresos", nombre: "Ingresos" },
  { clave: "egresos", nombre: "Egresos" },
  { clave: "neto", nombre: "Neto" },
] as const satisfies readonly { clave: MetricaCaja; nombre: string }[];

/** El valor de un punto según la métrica elegida. */
export function valorMetrica(p: PuntoCaja, metrica: MetricaCaja): number {
  const ingresos = Number(p.ingresos);
  const egresos = Number(p.egresos);
  if (metrica === "ingresos") return ingresos;
  if (metrica === "egresos") return egresos;
  return ingresos - egresos;
}
