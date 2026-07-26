import type { EstadoSuscripcion, Periodo } from "@/lib/fidelli/plan";
import type { PlanCompleto, EstadoOwner } from "@/components/fidelli/tipos";

export type Tenant = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  calcos_entregadas: number;
  created_at: string;
};

export type SuscripcionVigente = {
  id: string;
  estado: EstadoSuscripcion;
  periodo: Periodo;
  descuento_pct: number;
  inicio: string;
  vencimiento: string;
  plan: PlanCompleto | null;
};

export type Owner = {
  nombre: string;
  email: string;
  estado: EstadoOwner;
};

export const PESTANAS = [
  { clave: "resumen", nombre: "Resumen" },
  { clave: "suscripcion", nombre: "Suscripción" },
  { clave: "datos", nombre: "Datos" },
  { clave: "configuracion", nombre: "Configuración" },
] as const;

export type Pestana = (typeof PESTANAS)[number]["clave"];

export function esPestana(v: string | undefined): v is Pestana {
  return PESTANAS.some((p) => p.clave === v);
}

// Las secciones de la pestaña Datos, también en la URL.
export const VISTAS_DATOS = [
  { clave: "clientes", nombre: "Clientes" },
  { clave: "vehiculos", nombre: "Vehículos" },
  { clave: "services", nombre: "Services" },
] as const;

export type VistaDatos = (typeof VISTAS_DATOS)[number]["clave"];

export function esVistaDatos(v: string | undefined): v is VistaDatos {
  return VISTAS_DATOS.some((s) => s.clave === v);
}
