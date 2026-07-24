import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Plan y precios — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Plan y precios" descripcion="la lista de precios vigente y los ajustes trimestrales" />;
}
