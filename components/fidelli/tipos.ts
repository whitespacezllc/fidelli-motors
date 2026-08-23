import type { Database } from "@/lib/database.types";
import type { FeaturePlan } from "@/lib/planes";

// La fila del listado, tal como la devuelve listado_lubricentros().
export type FilaLubricentro =
  Database["public"]["Functions"]["listado_lubricentros"]["Returns"][number];

export type PlanCompleto = {
  id: string;
  nombre: string;
  precio_mensual: number;
  descuento_semestral_pct: number;
  descuento_anual_pct: number;
  // Presentes solo donde el select los pide. Se muestran en solo lectura:
  // qué habilita un plan se cambia por migración, nunca con un clic — el
  // escape para un caso puntual es el override por cuenta.
  features?: Partial<Record<FeaturePlan, boolean>> | null;
  limites?: { sucursales?: number | null } | null;
  heredado?: boolean;
};

export type EstadoOwner = "sin_owner" | "pendiente" | "activo";
