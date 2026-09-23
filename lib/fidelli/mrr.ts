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
