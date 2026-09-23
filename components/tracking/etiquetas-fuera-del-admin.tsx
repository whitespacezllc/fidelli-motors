"use client";

import { usePathname } from "next/navigation";
import { EtiquetaGoogle, PixelMeta, PixelMetaSinJs } from "@/components/tracking/etiquetas";

// Las etiquetas de Google y el Píxel de Meta, en todas las superficies
// menos /fidelli. El admin lo miramos nosotros: cada pantalla contaría
// como una visita y cada recarga como un PageView, y ninguna de las dos
// es tráfico. Se resuelve por la ruta y no bajando el bloque a otro
// layout: el layout raíz sigue siendo el único lugar donde se montan.
export function EtiquetasFueraDelAdmin() {
  const ruta = usePathname();
  if (ruta.startsWith("/fidelli")) return null;

  return (
    <>
      <EtiquetaGoogle />
      <PixelMeta />
      <PixelMetaSinJs />
    </>
  );
}
