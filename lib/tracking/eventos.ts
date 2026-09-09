import { ADS_CONVERSION_WHATSAPP, GA4_ID } from "@/lib/analitica";
import { debugActivo, log } from "@/lib/tracking/debug";
import { mensajeParaOrigen } from "@/lib/tracking/mensaje";
import { obtenerOrigen, type Origen } from "@/lib/tracking/origen";
import { urlWhatsapp } from "@/lib/landing";

// Lo que pasa en un clic a WhatsApp: se elige el mensaje según el origen y
// se avisa a las tres plataformas en el mismo clic.
//
//   1. GA4: `whatsapp_click`, con el origen, la campaña y qué botón fue.
//   2. Google Ads: la conversión "Clic en WhatsApp".
//   3. Meta: `Contact`, con el origen y el botón.
//
// NADA DE ACÁ BLOQUEA LA NAVEGACIÓN. El enlace abre en pestaña nueva, así
// que la página sigue viva y los eventos salen solos; no se usa
// `event_callback` para retrasar el clic, que es lo que hace el snippet de
// Google. Si un bloqueador frena gtag.js o fbevents.js, los eventos no
// salen y el botón abre WhatsApp igual, con el mensaje correcto.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * La función `gtag` de siempre: encola el comando en `dataLayer`. Si
 * gtag.js ya cargó lo procesa al instante; si todavía no —o nunca, por un
 * bloqueador— queda en la cola y no pasa nada.
 *
 * Empuja el objeto `arguments` y no un array a propósito: gtag.js reconoce
 * los comandos por ese tipo, un array lo ignora.
 */
const gtag: (...args: unknown[]) => void = function () {
  const cola = (window.dataLayer = window.dataLayer ?? []);
  // eslint-disable-next-line prefer-rest-params
  cola.push(arguments);
};

function fbq(...args: unknown[]) {
  if (typeof window.fbq === "function") window.fbq(...args);
}

// ------------------------------------------------------------
// Protección contra el doble clic
// ------------------------------------------------------------

// No más de un `whatsapp_click` por botón cada 2 segundos. Un dedo que toca
// dos veces —o el clic y el Enter— abren dos pestañas, pero cuentan como
// un contacto. Vale para los tres eventos: son el mismo clic.
const VENTANA_MS = 2000;
const ultimoClic = new Map<string, number>();

function repetido(cta: string, ahora: number): boolean {
  const anterior = ultimoClic.get(cta);
  ultimoClic.set(cta, ahora);
  return anterior !== undefined && ahora - anterior < VENTANA_MS;
}

// ------------------------------------------------------------
// Los eventos
// ------------------------------------------------------------

function enviar(cta: string, origen: Origen | null) {
  const pagina = window.location.pathname;
  const fuente = origen?.source ?? "none";

  const ga4: Record<string, unknown> = {
    origin: fuente,
    page_path: pagina,
    cta_id: cta,
    send_to: GA4_ID,
    transport_type: "beacon",
  };
  if (origen?.campaign) ga4.utm_campaign = origen.campaign;
  if (origen?.content) ga4.utm_content = origen.content;
  if (origen?.term) ga4.utm_term = origen.term;
  // Con el modo debug, GA4 muestra el evento en DebugView sin extensiones.
  if (debugActivo()) ga4.debug_mode = true;

  const conversion = {
    send_to: ADS_CONVERSION_WHATSAPP,
    transport_type: "beacon",
  };

  const contact = { origin: fuente, content_name: cta };

  gtag("event", "whatsapp_click", ga4);
  log("evento GA4: whatsapp_click", ga4);

  gtag("event", "conversion", conversion);
  log("evento Google Ads: conversion", conversion);

  fbq("track", "Contact", contact);
  log(
    typeof window.fbq === "function"
      ? "evento Meta: Contact"
      : "evento Meta: Contact (fbq no cargó, no se envía)",
    contact,
  );
}

/**
 * Registra un clic en un botón de WhatsApp y devuelve la URL de wa.me con
 * el mensaje que corresponde. `cta` identifica el botón: `hero`, `navbar`,
 * `precio-pro`, `footer`, `blog`…
 */
export function registrarClicWhatsapp(cta: string, ahora = Date.now()): string {
  const origen = obtenerOrigen(ahora);
  const mensaje = mensajeParaOrigen(origen);
  const url = urlWhatsapp(mensaje);
  log(`clic en WhatsApp (${cta})`, { origen, mensaje, url });

  if (repetido(cta, ahora)) {
    log("clic repetido en menos de 2 s: no se vuelven a mandar los eventos");
  } else {
    enviar(cta, origen);
  }
  return url;
}

/** El PageView del Píxel en una navegación interna (Next no recarga). */
export function paginaVistaMeta(ruta: string) {
  fbq("track", "PageView");
  log("evento Meta: PageView (navegación interna)", { ruta });
}
