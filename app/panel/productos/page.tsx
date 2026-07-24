import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Productos — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Productos" descripcion="tu catálogo de aceites, filtros y aditivos" />;
}
