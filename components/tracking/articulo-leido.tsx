"use client";

import { useEffect } from "react";
import { registrarArticulo } from "@/lib/tracking/origen";

// Se monta en cada artículo del blog y anota que se leyó: el slug y su
// `whatsappTema`, que es lo que completa "leí el artículo sobre ___" en el
// mensaje de WhatsApp. Sin fuente paga vigente, el blog pasa a ser el
// origen (lib/tracking/origen.ts).
//
// Es el único componente de cliente propio del blog y no pinta nada: el
// artículo sigue llegando entero del servidor.
export function ArticuloLeido({ slug, tema }: { slug: string; tema: string }) {
  useEffect(() => {
    registrarArticulo(slug, tema);
  }, [slug, tema]);

  return null;
}
