import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Mensajes — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Mensajes" descripcion="los templates de WhatsApp para contactar clientes" />;
}
