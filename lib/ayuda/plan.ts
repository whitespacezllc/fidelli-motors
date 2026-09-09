import type { ClavePlan } from "@/lib/planes-landing";
import type { CapacidadesPlan } from "@/lib/planes";

// El plan de la cuenta, para la etiqueta "Plan Pro" / "Plan Ultra" de los
// videos que muestran una función que el plan no incluye.
//
// Se deriva de las CAPACIDADES (override → plan vigente), no del nombre de
// la suscripción: un Basic al que Fidelli le habilitó los premios por
// override no tiene por qué ver "Plan Pro" sobre el video del premio.

export const NIVEL_PLAN: Record<ClavePlan, number> = { basic: 0, pro: 1, ultra: 2 };

export const NOMBRE_PLAN: Record<ClavePlan, string> = {
  basic: "Basic",
  pro: "Pro",
  ultra: "Ultra",
};

export function planEfectivo(capacidades: CapacidadesPlan | null): ClavePlan {
  const f = capacidades?.features;
  if (!f) return "basic";
  if (f.pagina_premium) return "ultra";
  if (f.premios || f.mecanica || f.presupuestos || f.personalizacion_pagina) return "pro";
  return "basic";
}

/** La etiqueta a mostrar sobre un video, o null si el plan ya lo incluye. */
export function etiquetaPlan(planVideo: ClavePlan, planCuenta: ClavePlan): string | null {
  return NIVEL_PLAN[planVideo] > NIVEL_PLAN[planCuenta]
    ? `Plan ${NOMBRE_PLAN[planVideo]}`
    : null;
}
