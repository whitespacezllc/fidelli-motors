// Las etiquetas de terceros del sitio: la etiqueta de Google (GA4 + Google
// Ads) y el Píxel de Meta.
//
// Los IDs van acá y no sueltos en los componentes por la misma razón que el
// resto de la identidad vive en lib/seo.ts: un identificador de terceros
// repetido en dos lugares es un identificador que algún día va a estar
// desactualizado en uno de los dos. Los scripts que los usan están en
// components/tracking/etiquetas.tsx y se montan desde el layout raíz.

/** La propiedad de GA4. Es también el ID con el que se carga gtag.js. */
export const GA4_ID = "G-D5ZPJ6BZHX";

/** La cuenta de Google Ads (ID de conversión). */
export const ADS_ID = "AW-18440390476";

/**
 * La acción de conversión "Clic en WhatsApp" de Google Ads, en el formato
 * `send_to` que pide gtag: ID de conversión / etiqueta de conversión.
 */
export const ADS_CONVERSION_WHATSAPP = `${ADS_ID}/VfV0CKP3i_IcEMyOiNlE`;

/** El conjunto de datos (Píxel) de Meta. */
export const PIXEL_META_ID = "1601809244956895";

// ⚠ HASTA EL 09/09/2026 ACÁ HABÍA GOOGLE TAG MANAGER (GTM-5N2856ZH) y GA4
// vivía adentro del contenedor. Se reemplazó por gtag.js directo, y no es
// un capricho: el clic en WhatsApp tiene que disparar en el mismo momento
// el evento de GA4, la conversión de Google Ads y el Contact de Meta, con
// el origen que resolvió el código, y eso se hace desde el clic, en el
// navegador. El contenedor tenía una sola etiqueta —la de Google para la
// propiedad de arriba—, así que la medición de GA4 no cambió: la misma
// propiedad, ahora configurada desde el código.
//
// EL CONTENEDOR DE GTM NO SE CARGA MÁS. Si alguien lo vuelve a pegar, cada
// visita se cuenta DOS VECES (una por gtag.js y otra por la etiqueta de
// adentro de GTM). Lo mismo si se pega el snippet del asistente de GA4: ya
// está instalado, es EtiquetaGoogle. El propio diálogo de Google lo avisa:
// "No añada más de una etiqueta de Google a cada página".

/**
 * Si las etiquetas de terceros se cargan o no.
 *
 * Dos entornos quedan afuera y por motivos distintos:
 *
 *   · DESARROLLO — `npm run dev` no tiene por qué mandar visitas. Cada
 *     recarga mientras se programa sería una sesión falsa.
 *   · PREVIEWS de Vercel — cada PR genera una URL que abrimos nosotros
 *     media docena de veces. Eso infla usuarios y sesiones en la misma
 *     propiedad que mide el tráfico real.
 *
 * Lo que NO se apaga con esto es la resolución del origen y el mensaje de
 * WhatsApp (lib/tracking): eso funciona en todos los entornos, así se puede
 * probar en un preview sin mandarle nada a Google ni a Meta.
 *
 * LA PUERTA FALLA HACIA "ENCENDIDO" A PROPÓSITO: si Vercel no expone
 * NEXT_PUBLIC_VERCEL_ENV, `enPreview` es false y las etiquetas igual cargan
 * en producción. El modo de falla peligroso no es medir de más un preview:
 * es que producción deje de medir en silencio y nadie se entere por
 * semanas.
 */
const enPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const analiticaActiva =
  process.env.NODE_ENV === "production" && !enPreview;
