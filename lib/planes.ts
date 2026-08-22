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
