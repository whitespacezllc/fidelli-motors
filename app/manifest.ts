import type { MetadataRoute } from "next";
import { DESCRIPCION_PORTADA, NOMBRE_SITIO } from "@/lib/seo";

// El manifest de la LANDING COMERCIAL, y el que hereda cualquier ruta que
// no declare el suyo. Las demás superficies tienen uno propio para que
// "agregar a la pantalla de inicio" abra donde el usuario estaba parado y
// no siempre acá: ver lib/pwa.ts y los route handlers de cada una.
//
// Los dos PNG salen de app/icon.svg (el isotipo de marca), generados a
// 192 y 512 en public/. El theme_color es el rojo de marca: acá es
// identidad, no estado.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // El id es lo que distingue una app instalada de otra. Sin él, el
    // navegador usa el start_url y no podría convivir con las demás.
    id: "/",
    name: NOMBRE_SITIO,
    short_name: NOMBRE_SITIO,
    description: DESCRIPCION_PORTADA,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#E01F26",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
