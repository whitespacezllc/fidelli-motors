import type { Metadata } from "next";
import { LubricentroNoEncontrado } from "@/components/cliente/lubricentro-no-encontrado";

export const metadata: Metadata = { title: "Lubricentro no encontrado" };

// Va como boundary de not-found y no como un render más de la página para
// que la respuesta sea un 404 de verdad. `/[slug]` matchea cualquier cosa
// que no sea una ruta del producto —incluido un slug tipeado mal o un QR
// viejo—, así que devolver 200 haría que un buscador indexara páginas que
// no existen.
export default function NoEncontrado() {
  return <LubricentroNoEncontrado />;
}
