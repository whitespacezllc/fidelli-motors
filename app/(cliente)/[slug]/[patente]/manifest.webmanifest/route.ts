import { obtenerLanding } from "@/lib/cliente/landing";
import { GRAFITO } from "@/lib/cliente/tema";
import { formatearPatente, normalizarPatente } from "@/lib/texto";
import { ICONOS_MARCA, respuestaManifest } from "@/lib/pwa";

// El acceso directo AL CARTÓN DE UN AUTO. Es el que cierra el círculo del
// producto: el QR del parasol se escanea una vez, y el dueño se guarda el
// ícono para volver a su historial sin escribir la patente de nuevo.
//
// La marca sigue siendo la del lubricentro; lo que cambia es a dónde abre.
// Se usa obtenerLanding y NO get_carton a propósito: get_carton registra la
// búsqueda en landing_busquedas —es la captura de leads del lubri— y pedir
// el manifest dejaría una fila basura por cada visita. Acá no hace falta
// validar la patente: el manifest solo se pide desde una página que el
// visitante ya está mirando.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; patente: string }> },
) {
  const { slug, patente } = await params;
  const lubricentro = await obtenerLanding(slug);
  if (!lubricentro) {
    return new Response("No encontrado", { status: 404 });
  }

  const normalizada = normalizarPatente(patente);
  const legible = formatearPatente(patente);

  const fondo =
    lubricentro.tema === "oscuro"
      ? GRAFITO
      : (lubricentro.colorFondo ?? "#FFFFFF");

  const icons = lubricentro.logoUrl
    ? [{ src: lubricentro.logoUrl, sizes: "any" }, ...ICONOS_MARCA]
    : ICONOS_MARCA;

  return respuestaManifest({
    id: `/${slug}/${normalizada}`,
    // La patente adelante: es lo que distingue un auto de otro cuando el
    // mismo cliente se guarda dos.
    name: `${legible} · ${lubricentro.nombre}`,
    short_name: legible,
    description: `El historial de tu auto en ${lubricentro.nombre}.`,
    start_url: `/${slug}/${normalizada}`,
    // El scope es el del lubricentro, no el del auto: desde la app se
    // puede volver a la página y buscar otra patente sin salir.
    scope: `/${slug}`,
    display: "standalone",
    background_color: fondo,
    theme_color: lubricentro.colorPrimario,
    icons,
  });
}
