import { obtenerLanding } from "@/lib/cliente/landing";
import { GRAFITO } from "@/lib/cliente/tema";
import { ICONOS_MARCA, respuestaManifest } from "@/lib/pwa";

// El acceso directo del CLIENTE FINAL: abre la página del lubricentro que
// escaneó, no la landing comercial de Fidelli.
//
// Es el manifest del lubricentro y lleva SU marca: nombre, color y logo.
// Acá el rojo Motors no aparece —ni en el theme_color—, igual que en la
// página: este ícono va a vivir en el teléfono del cliente de otro.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const lubricentro = await obtenerLanding(slug);
  if (!lubricentro) {
    return new Response("No encontrado", { status: 404 });
  }

  // El fondo del arranque tiene que ser el fondo real de la página: en
  // oscuro manda el grafito del sistema y color_fondo no se aplica, igual
  // que en estilosTema().
  const fondo =
    lubricentro.tema === "oscuro"
      ? GRAFITO
      : (lubricentro.colorFondo ?? "#FFFFFF");

  // El logo del tenant primero: es su marca la que tiene que quedar en la
  // pantalla de inicio. Los de Fidelli quedan de respaldo por si el
  // archivo no carga — sin un ícono válido el navegador no deja instalar.
  const icons = lubricentro.logoUrl
    ? [{ src: lubricentro.logoUrl, sizes: "any" }, ...ICONOS_MARCA]
    : ICONOS_MARCA;

  return respuestaManifest({
    id: `/${slug}`,
    name: lubricentro.nombre,
    short_name: lubricentro.nombre,
    description: "Mirá el historial de tu auto y cuándo te toca volver.",
    start_url: `/${slug}`,
    // Acotado al lubricentro: la superficie del cliente se basta sola
    // (la página y el cartón de cada patente viven acá adentro).
    scope: `/${slug}`,
    display: "standalone",
    background_color: fondo,
    theme_color: lubricentro.colorPrimario,
    icons,
  });
}
