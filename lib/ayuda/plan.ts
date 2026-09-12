import type { ClavePlan } from "@/lib/planes-landing";
import { ETIQUETA_MODULO, type CapacidadesPlan, type ModuloPago } from "@/lib/planes";

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

/**
 * La etiqueta de un video, contemplando los MÓDULOS PAGOS.
 *
 * El filtro por plan no alcanzaba para un módulo: un taller Ultra con la
 * gomería sin contratar vería el video de neumáticos sin ninguna etiqueta
 * —porque su plan es el más alto— y un Pro vería "Plan Pro", que también
 * es falso. El módulo no viene con ningún plan y no se consigue subiendo
 * de plan, así que lo que falta se nombra por su nombre.
 *
 * El módulo manda sobre el plan: si la cuenta no lo tiene, esa es LA
 * razón por la que el video muestra algo que no puede hacer.
 */
export function etiquetaVideo(
  video: { plan: ClavePlan; modulo?: ModuloPago },
  capacidades: CapacidadesPlan | null,
): string | null {
  if (video.modulo) {
    return capacidades?.features?.[video.modulo]
      ? null
      : ETIQUETA_MODULO[video.modulo];
  }
  return etiquetaPlan(video.plan, planEfectivo(capacidades));
}
