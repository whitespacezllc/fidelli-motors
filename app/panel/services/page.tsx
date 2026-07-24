import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Services — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Services" descripcion="el historial de services cargados" />;
}
