// Los tipos y guards del gráfico de MRR del Resumen.
//
// MÓDULO NEUTRO A PROPÓSITO (el mismo caso que lib/series.ts): lo importa
// la page (server component, para validar el ?moneda= de la URL) y el
// gráfico ("use client"). Un guard exportado desde un módulo "use client"
// no es invocable desde el servidor — es una referencia opaca—, y Next lo
// dice con «Attempted to call esMoneda() from the server».

export type Moneda = "usd" | "ars";

export const MONEDAS: readonly { clave: Moneda; nombre: string }[] = [
  { clave: "usd", nombre: "USD" },
  { clave: "ars", nombre: "ARS" },
];

export function esMoneda(v: string | undefined): v is Moneda {
  return v === "usd" || v === "ars";
}

export type FuenteMrr = "cierre" | "reconstruido" | "vivo";

export type PuntoMrr = {
  fecha: string;
  mrrArs: number;
  /** Null si ese día no había tipo de cambio. */
  mrrUsd: number | null;
  tenantsActivos: number;
  tcVenta: number | null;
  fuente: FuenteMrr;
};

// ---------- El período del gráfico ----------

/** Mes en curso, un trimestre del año en curso, o el año entero (hasta hoy). */
export type RangoMrr = "mes" | "q1" | "q2" | "q3" | "q4" | "anio";

export const RANGOS_MRR: readonly { clave: RangoMrr; nombre: string }[] = [
  { clave: "mes", nombre: "Mes" },
  { clave: "q1", nombre: "Q1" },
  { clave: "q2", nombre: "Q2" },
  { clave: "q3", nombre: "Q3" },
  { clave: "q4", nombre: "Q4" },
  { clave: "anio", nombre: "Año" },
];

export function esRangoMrr(v: string | undefined): v is RangoMrr {
  return v === "mes" || v === "q1" || v === "q2" || v === "q3" || v === "q4" || v === "anio";
}

export type LimitesRango = {
  /** «YYYY-MM-DD», ambos incluidos; `hasta` nunca pasa de hoy. */
  desde: string;
  hasta: string;
  /** Para leerlo: «septiembre de 2026», «Q3 2026», «2026». */
  nombre: string;
  /** Un trimestre que todavía no empezó. */
  futuro: boolean;
};

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Aritmética pura de calendario sobre «YYYY-MM-DD»: no pasa por la zona
// del proceso. `hoy` es el día argentino (lib/fechas.ts → hoyISO()).
function ultimoDia(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function limitesDelRango(rango: RangoMrr, hoy: string): LimitesRango {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  if (rango === "mes") {
    return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, nombre: `${MESES_LARGOS[mes - 1]} de ${anio}`, futuro: false };
  }
  if (rango === "anio") {
    return { desde: `${anio}-01-01`, hasta: hoy, nombre: String(anio), futuro: false };
  }
  const q = Number(rango.slice(1));
  const primerMes = (q - 1) * 3 + 1;
  const desde = `${anio}-${String(primerMes).padStart(2, "0")}-01`;
  const fin = ultimoDia(anio, primerMes + 2);
  return { desde, hasta: fin < hoy ? fin : hoy, nombre: `Q${q} ${anio}`, futuro: desde > hoy };
}
