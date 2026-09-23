import type { Database } from "@/lib/database.types";

// ============================================================
// Los catálogos que alimentan tenant_eventos desde el admin
// (docs/METRICAS.md § 1 y § 3). Son ESPEJOS de los enums de la base
// —`origen_tenant` y `motivo_suspension`, migraciones 20260922200000 y
// 20260922201000; `google` llegó en 20260924100000—: la fuente de verdad es
// SQL, y el tipo generado ata la lista para que un valor inventado no
// compile.
// ============================================================

export type OrigenTenant = Database["public"]["Enums"]["origen_tenant"];

export const ORIGENES_TENANT = [
  "meta",
  "google",
  "referido",
  "directo",
  "distribuidor",
  "calco",
  "organico",
  "otro",
] as const satisfies readonly OrigenTenant[];

/** Cómo se lee cada origen en el formulario. */
export const ETIQUETA_ORIGEN: Record<OrigenTenant, string> = {
  meta: "Meta (Instagram / Facebook)",
  google: "Google Ads",
  referido: "Referido por otro lubricentro",
  directo: "Directo (nos contactó él)",
  distribuidor: "Distribuidor",
  calco: "Vio una calco en un auto",
  organico: "Orgánico (buscador / web)",
  otro: "Otro",
};

/** La versión corta, para el chip de la ficha: «Meta», «Referido», «Calco». */
export const ETIQUETA_ORIGEN_CORTA: Record<OrigenTenant, string> = {
  meta: "Meta",
  google: "Google",
  referido: "Referido",
  directo: "Directo",
  distribuidor: "Distribuidor",
  calco: "Calco",
  organico: "Orgánico",
  otro: "Otro",
};

export function esOrigenTenant(v: unknown): v is OrigenTenant {
  return typeof v === "string" && (ORIGENES_TENANT as readonly string[]).includes(v);
}

export type MotivoSuspension = Database["public"]["Enums"]["motivo_suspension"];

export const MOTIVOS_SUSPENSION = [
  "falta_de_pago",
  "pedido_del_cliente",
  "cierre_del_negocio",
  "otro",
] as const satisfies readonly MotivoSuspension[];

/** Las etiquetas del brief, tal cual. `falta_de_pago` es churn involuntario. */
export const ETIQUETA_MOTIVO_SUSPENSION: Record<MotivoSuspension, string> = {
  falta_de_pago: "Falta de pago",
  pedido_del_cliente: "Lo pidió el cliente",
  cierre_del_negocio: "Cerró el negocio",
  otro: "Otro",
};

export function esMotivoSuspension(v: unknown): v is MotivoSuspension {
  return typeof v === "string" && (MOTIVOS_SUSPENSION as readonly string[]).includes(v);
}
