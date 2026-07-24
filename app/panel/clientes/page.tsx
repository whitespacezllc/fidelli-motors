import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Clientes — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Clientes" descripcion="la búsqueda de clientes y sus vehículos" />;
}
