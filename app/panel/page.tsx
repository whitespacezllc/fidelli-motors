import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Inicio — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Inicio" descripcion="el resumen del día: services cargados, retención pendiente y recuperados del mes" />;
}
