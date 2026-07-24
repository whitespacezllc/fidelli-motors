import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Nuevo service — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Nuevo service" descripcion="la carga del service: patente, cartón y confirmación" />;
}
