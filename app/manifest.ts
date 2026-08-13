import type { MetadataRoute } from "next";
import { DESCRIPCION_PORTADA, NOMBRE_SITIO } from "@/lib/seo";

// Los dos PNG salen de app/icon.svg (el isotipo de marca), generados a
// 192 y 512 en public/. El theme_color es el rojo de marca: acá es
// identidad, no estado.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_SITIO,
    short_name: NOMBRE_SITIO,
    description: DESCRIPCION_PORTADA,
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#E01F26",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
