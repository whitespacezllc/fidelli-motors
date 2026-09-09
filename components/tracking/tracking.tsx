"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { log } from "@/lib/tracking/debug";
import { paginaVistaMeta } from "@/lib/tracking/eventos";
import { resolverOrigen } from "@/lib/tracking/origen";
import { anclaDe } from "@/lib/tracking/parametros";

// El módulo de origen, montado una vez en el layout raíz. En cada carga de
// página —y en cada navegación interna, que para Next es un cambio de ruta
// sin recarga— lee los parámetros de la URL y guarda de dónde vino el
// visitante (lib/tracking/origen.ts), antes de que pueda hacer clic en un
// botón de WhatsApp.
//
// No renderiza nada y no lee la sesión: la landing sigue siendo estática.
// Lee `window.location` en vez de `useSearchParams` a propósito: ese hook
// obliga a envolver en Suspense a toda página estática que lo use, y
// además no ve la query que Google pega después del ancla (`/#precio?utm…`).
//
// Corre en todos los entornos —a diferencia de las etiquetas— para que el
// mensaje de WhatsApp se pueda probar en un preview.
export function Tracking() {
  const ruta = usePathname();
  const primeraCarga = useRef(true);

  useEffect(() => {
    const { search, hash } = window.location;
    const origen = resolverOrigen({ pathname: ruta, search, hash });
    log("origen vigente", origen);

    if (primeraCarga.current) {
      primeraCarga.current = false;

      // Con el sufijo de campaña pegado después del ancla, el navegador
      // busca un elemento con id `precio?utm_source=google` y no salta a
      // ningún lado. El salto a la sección se hace acá.
      if (hash.includes("?")) {
        document.getElementById(anclaDe(hash))?.scrollIntoView();
      }
      return;
    }

    // Navegación interna: gtag.js registra el cambio de página solo (la
    // medición mejorada de GA4); el Píxel de Meta no, así que se le avisa.
    paginaVistaMeta(ruta);
  }, [ruta]);

  return null;
}
