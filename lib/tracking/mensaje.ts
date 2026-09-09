import { MENSAJE_SIN_ORIGEN, urlWhatsapp } from "@/lib/landing";
import type { Origen } from "@/lib/tracking/origen";

// El mensaje prellenado de WhatsApp, según de dónde vino el visitante. Es lo
// que el vendedor lee en el chat: la atribución "de cabotaje", que funciona
// aunque Google y Meta no reciban ni un evento.
//
// Se elige EN EL MOMENTO DEL CLIC, no al renderizar: el origen se resuelve
// en el navegador y sobrevive a la navegación interna, así que el botón del
// pie tiene que decir lo mismo que el del hero aunque se haya montado antes.
//
// Con fuente paga y un artículo leído gana la fuente paga: es el canal que
// se anota en el tracker. Meta dice "Instagram" aunque el clic haya salido
// de Facebook: es lo que el lubricentrero reconoce.

const POR_FUENTE = {
  google: "Hola, vi Fidelli Motors en Google y quiero saber más.",
  meta: "Hola, vi Fidelli Motors en Instagram y quiero saber más.",
} as const;

export function mensajeParaOrigen(origen: Origen | null): string {
  switch (origen?.source) {
    case "google":
    case "meta":
      return POR_FUENTE[origen.source];
    case "blog":
      return origen.topic
        ? `Hola, leí el artículo sobre ${origen.topic} y quiero saber más.`
        : MENSAJE_SIN_ORIGEN;
    default:
      return MENSAJE_SIN_ORIGEN;
  }
}

/** La URL de wa.me con el mensaje que corresponde al origen. */
export function urlParaOrigen(origen: Origen | null): string {
  return urlWhatsapp(mensajeParaOrigen(origen));
}
