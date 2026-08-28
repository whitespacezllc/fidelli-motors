// El catálogo de features y límites de plan — ESPEJO TIPADO del de la base.
//
// La fuente de verdad ejecutable es SQL: feature_plan_valida() y
// limite_plan_valido() en la migración 20260822150000_planes_con_control.
// Tiene que ser SQL porque las policies de RLS se evalúan en Postgres y no
// pueden leer una constante de TypeScript.
//
// Este espejo existe por la otra mitad del problema: que un
// plan_permite("mecanika") no compile. Los nombres inventados no fallan en
// build salvo que un tipo los ate — y este proyecto ya se quemó con eso.
//
// Si las dos listas divergen, gana la base; verificaciones.sql vigila el
// lado SQL en cada reset. Al agregar una feature: primero la migración,
// después esta lista, en el MISMO PR.

export const FEATURES_PLAN = [
  "mecanica",
  "pendientes",
  "premios",
  "presupuestos",
  "personalizacion_pagina",
  "pagina_premium",
] as const;

export type FeaturePlan = (typeof FEATURES_PLAN)[number];

export const LIMITES_PLAN = ["sucursales"] as const;

export type LimitePlan = (typeof LIMITES_PLAN)[number];

/** Cómo se le nombra cada feature al usuario. El catálogo manda; esto es voz. */
export const ETIQUETA_FEATURE: Record<FeaturePlan, string> = {
  mecanica: "Trabajos de mecánica",
  pendientes: "Trabajos pendientes",
  premios: "Fidelliza — premios",
  presupuestos: "Presupuestos",
  personalizacion_pagina: "Personalización de tu página",
  pagina_premium: "Página premium",
};

/**
 * A dónde manda sesionParaEscribir() cuando la feature no está en el plan:
 * la sección correspondiente, que es donde vive la pantalla que explica qué
 * pasa y cómo se activa. Mismo criterio que la suspensión (→ /panel).
 * Solo tienen ruta las features con superficie propia en el panel hoy.
 */
export const RUTA_FEATURE: Partial<Record<FeaturePlan, string>> = {
  premios: "/panel/fidelizacion",
  personalizacion_pagina: "/panel/experiencia",
  presupuestos: "/panel/presupuestos",
};

/**
 * Lo que devuelve plan_capacidades() — el campo calculado que viaja en la
 * consulta de sesión. Resuelto en la BASE (override → plan → cerrado):
 * acá no se re-decide nada, solo se tipa.
 */
export type CapacidadesPlan = {
  features: Record<FeaturePlan, boolean>;
  limites: { sucursales: number | null };
};
