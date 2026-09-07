import { ICONOS_MARCA, respuestaManifest } from "@/lib/pwa";

// El acceso directo del LUBRICENTRO: abre en /panel, no en la landing.
//
// Vive bajo /panel pero es público a propósito: el navegador pide el
// manifest sin cookies, así que si dependiera de la sesión no se podría
// instalar la app. No expone nada — son cuatro campos de marca. La
// autorización sigue estando en el layout, que un route handler no ejecuta.
//
// El scope es "/panel" y no "/": los scopes NO se pueden solapar entre
// aplicaciones o deja de estar definido cuál abre un enlace, y la landing
// ya se queda con "/". Gana el scope más largo que coincida, así que un
// link a /panel abre esta app y uno a / abre la landing. El costo es que
// una sesión vencida manda a /login, que queda afuera y se muestra con la
// barra del navegador arriba; se vuelve solo al entrar.
export const dynamic = "force-static";

export function GET() {
  return respuestaManifest({
    id: "/panel",
    name: "Fidelli Motors · Panel",
    short_name: "Mi panel",
    description:
      "Cargá los services del día y mirá a quién te toca llamar esta semana.",
    start_url: "/panel",
    scope: "/panel",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#E01F26",
    icons: ICONOS_MARCA,
  });
}
