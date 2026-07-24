import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Sucursales — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Sucursales" descripcion="tus sucursales y sus datos" />;
}
