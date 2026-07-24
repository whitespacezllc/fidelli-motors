import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Próximos services — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Próximos services" descripcion="los vehículos por estado — vencidos, inminentes y próximos — con su contacto" />;
}
