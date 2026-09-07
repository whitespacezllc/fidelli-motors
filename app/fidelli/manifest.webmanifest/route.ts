import { ICONOS_MARCA, respuestaManifest } from "@/lib/pwa";

// El acceso directo del equipo Fidelli: abre en /fidelli. Mismo criterio
// que el del panel — público (el navegador lo pide sin cookies) y con el
// scope acotado a su ruta para no solaparse con la landing.
export const dynamic = "force-static";

export function GET() {
  return respuestaManifest({
    id: "/fidelli",
    name: "Fidelli · Administración",
    short_name: "Fidelli Admin",
    start_url: "/fidelli",
    scope: "/fidelli",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#E01F26",
    icons: ICONOS_MARCA,
  });
}
