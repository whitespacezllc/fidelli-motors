import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Diseño de experiencia — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Diseño de experiencia" descripcion="el color, el logo y los datos que ve tu cliente al escanear el QR" />;
}
