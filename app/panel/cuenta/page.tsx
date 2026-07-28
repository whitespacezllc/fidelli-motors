import type { Metadata } from "next";
import { PlaceholderSeccion } from "@/components/placeholder-seccion";

export const metadata: Metadata = { title: "Mi cuenta — Fidelli Motors" };

export default function Pagina() {
  return <PlaceholderSeccion titulo="Mi cuenta" descripcion="tus datos de acceso y tu suscripción" />;
}
