"use client";

import { Boton } from "@/components/ui/boton";

// El mismo mecanismo que el presupuesto: el navegador imprime la página
// y el CSS de impresión aísla la hoja. Sin PDFs generados en el servidor.
export function BotonImprimirCalcos() {
  return <Boton onClick={() => window.print()}>Imprimir la hoja</Boton>;
}
