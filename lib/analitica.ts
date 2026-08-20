// Google Tag Manager — el contenedor que carga Google Analytics.
//
// El ID va acá y no suelto en el layout por la misma razón que el resto de
// la identidad vive en lib/seo.ts: un identificador de terceros repetido en
// dos lugares es un identificador que algún día va a estar desactualizado
// en uno de los dos.
export const GTM_ID = "GTM-5N2856ZH";

/**
 * Si la analítica se carga o no.
 *
 * Dos entornos quedan afuera y por motivos distintos:
 *
 *   · DESARROLLO — `npm run dev` no tiene por qué mandar visitas. Cada
 *     recarga mientras se programa sería una sesión falsa.
 *   · PREVIEWS de Vercel — cada PR genera una URL que abrimos nosotros
 *     media docena de veces. Eso infla usuarios y sesiones en el mismo
 *     contenedor que mide el tráfico real.
 *
 * LA PUERTA FALLA HACIA "ENCENDIDO" A PROPÓSITO: si Vercel no expone
 * NEXT_PUBLIC_VERCEL_ENV, `enPreview` es false y la analítica igual carga
 * en producción. El modo de falla peligroso no es medir de más un preview:
 * es que producción deje de medir en silencio y nadie se entere por
 * semanas.
 */
const enPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const analiticaActiva =
  process.env.NODE_ENV === "production" && !enPreview;
