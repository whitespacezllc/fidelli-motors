import type { Database } from "@/lib/database.types";

export type Periodo = Database["public"]["Enums"]["periodo_suscripcion"];
export type EstadoSuscripcion = Database["public"]["Enums"]["estado_suscripcion"];

export const PERIODOS: Periodo[] = ["mensual", "semestral", "anual"];

export const MESES_DEL_PERIODO: Record<Periodo, number> = {
  mensual: 1,
  semestral: 6,
  anual: 12,
};

export type Plan = {
  precio_mensual: number;
  descuento_semestral_pct: number;
  descuento_anual_pct: number;
};

// ============================================================
// Los dos descuentos, y cómo se combinan
//
// Hay dos, y son cosas distintas:
//
//   · El del PLAN (descuento_semestral_pct / descuento_anual_pct) es de
//     lista: lo tiene cualquiera que pague por adelantado. Es del
//     producto, no del cliente.
//
//   · El de la SUSCRIPCIÓN (descuento_pct) es del cliente: el trato que
//     se negoció con ese lubricentro. Founding = 50. Default 0.
//
// Se aplican en cadena, no se suman: primero el de lista sobre el precio
// del mes, después el del cliente sobre lo que quedó. Un founding anual
// paga 50% de lo que paga cualquiera que contrate un año — que es lo que
// significa "50% off", y no "65% off" que es lo que daría sumarlos.
//
// Los dos números del hi-fi salen de acá con el mismo cálculo:
//   semestral, cliente 0  → 45.000 × 0,90       = 40.500/mes (243.000)
//   mensual, founding 50  → 45.000 × 1,00 × 0,50 = 22.500/mes
// ============================================================

export function descuentoDeLista(plan: Plan, periodo: Periodo): number {
  if (periodo === "semestral") return plan.descuento_semestral_pct;
  if (periodo === "anual") return plan.descuento_anual_pct;
  return 0;
}

// Es dinero: se redondea al centavo y ahí termina. Lo que no se hace es
// redondear a miles ni mostrar "aproximadamente" en lugar de la cifra.
function alCentavo(n: number): number {
  return Math.round(n * 100) / 100;
}

// Lo que paga por mes, con los dos descuentos aplicados.
export function abonoMensual(
  plan: Plan,
  periodo: Periodo,
  descuentoCliente: number,
): number {
  const conLista = plan.precio_mensual * (1 - descuentoDeLista(plan, periodo) / 100);
  return alCentavo(conLista * (1 - descuentoCliente / 100));
}

// Lo que se le factura de una vez al arrancar o renovar el período.
export function totalDelPeriodo(
  plan: Plan,
  periodo: Periodo,
  descuentoCliente: number,
): number {
  return alCentavo(
    abonoMensual(plan, periodo, descuentoCliente) * MESES_DEL_PERIODO[periodo],
  );
}

const NUMERO = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// "ARS 243.000" — sin símbolo $ porque en la tabla convive con porcentajes
// y kilómetros, y el prefijo de tres letras es el que no se confunde.
export function pesos(n: number): string {
  return `ARS ${NUMERO.format(n)}`;
}

export function porcentaje(n: number): string {
  return `${NUMERO.format(n)}%`;
}

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  mensual: "Mensual",
  semestral: "Semestral",
  anual: "Anual",
};

export const ETIQUETA_ESTADO: Record<EstadoSuscripcion, string> = {
  trial: "Trial",
  activa: "Activa",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

// Días que faltan para el vencimiento. Negativo = ya venció.
export function diasHasta(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const objetivo = new Date(a, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}
