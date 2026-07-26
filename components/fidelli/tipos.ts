import type { Database } from "@/lib/database.types";

// La fila del listado, tal como la devuelve listado_lubricentros().
export type FilaLubricentro =
  Database["public"]["Functions"]["listado_lubricentros"]["Returns"][number];

export type PlanCompleto = {
  id: string;
  nombre: string;
  precio_mensual: number;
  descuento_semestral_pct: number;
  descuento_anual_pct: number;
};

export type EstadoOwner = "sin_owner" | "pendiente" | "activo";
