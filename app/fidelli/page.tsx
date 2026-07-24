import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Lubricentros — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Lubricentros" descripcion="la tabla de lubricentros: suscripción, services del mes y salud" />;
}
