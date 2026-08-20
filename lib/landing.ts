// La landing comercial: una sola acción primaria en toda la página.
//
// El número NO es el mismo que WHATSAPP_SOPORTE de lib/config.ts, y es a
// propósito: aquel es soporte de clientes que ya compraron, este es ventas.
// Si algún día se unifican, se unifican los dos lugares a la vez.
const WHATSAPP_VENTAS = "5493513736028";

const MENSAJE =
  "Hola Santiago, tengo un lubricentro y quiero saber más de Fidelli Motors";

/**
 * El href de TODOS los CTA de la landing: navbar, hero, precio, cierre y la
 * barra fija de mobile. Que se repita está bien; lo prohibido es que haya
 * dos acciones primarias distintas compitiendo.
 */
export const CTA_WHATSAPP = `https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(MENSAJE)}`;

/**
 * El texto del CTA, uno solo para toda la página: navbar, hero, precio,
 * cierre y la barra fija de mobile.
 *
 * OJO — `docs/landing-spec.md` todavía dice "Quiero mi lugar" en la 01 y la
 * 02, y "Hablar por WhatsApp" en la 11. Esto lo pisa por decisión de sesión:
 * una sola acción con un solo nombre. Si el spec no se actualiza, el
 * próximo que lo lea va a creer que la landing está mal.
 */
export const TEXTO_CTA = "Sumar mi lubricentro";

/**
 * El id del CTA del hero. Lo miran con IntersectionObserver el navbar —para
 * decidir si su botón va en outline o en rojo— y la barra fija de mobile,
 * que recién aparece cuando este sale de pantalla. Vive acá y no escrito a
 * mano en cada lado porque son tres archivos que tienen que coincidir.
 */
export const ID_CTA_HERO = "cta-hero";

/**
 * LOS CUPOS DEL MES — la única fuente de verdad.
 *
 * El módulo de la sección de precio Y la línea del cierre salen de acá:
 * antes el número estaba escrito a mano en dos lugares con dos
 * redacciones distintas, y en algún momento se iban a contradecir solos.
 *
 * ⚠ MANTENIMIENTO HUMANO: `tomados` se actualiza a mano con cada venta y
 * `mes` con cada mes nuevo. Si esto deja de actualizarse, EL MÓDULO SE
 * SACA — un contador congelado destruye más confianza de la que genera.
 */
export const CUPOS = { mes: "Agosto 2026", total: 5, tomados: 1 } as const;

/**
 * La garantía de 30 días, palabra por palabra.
 *
 * Vive en una constante y no suelta en el JSX de la sección 09 porque el
 * spec la ata al documento de cancelación y reembolsos (entrega 2): si acá
 * dice "te devolvemos la plata" y allá dice "menos el costo de las calcos",
 * es un reclamo esperando. Cuando se escriba `/terminos`, esa página importa
 * esta constante en vez de volver a tipear la frase.
 *
 * La segunda oración es una CONDICIÓN, no un adorno: "que lo hayas usado"
 * es lo único que separa la garantía de un mes gratis. Cuando se escriba la
 * política tiene que definir qué cuenta como usarlo, y decirlo igual que
 * acá.
 */
export const GARANTIA_30_DIAS =
  "Si a los 30 días no te sirve, te devolvemos la plata. Solo te pedimos que lo hayas usado.";

/**
 * Las once secciones, en el orden narrativo: dolor → deseo → duda.
 * El id es el ancla; los tres que usa el navbar son `como-funciona`,
 * `precio` y `preguntas`. El resto lleva id igual, para poder medir
 * profundidad de scroll por sección en la entrega 3.
 */
export const SECCIONES = [
  { id: "hero", nombre: "Hero" },
  { id: "como-funciona", nombre: "La prueba de que es fácil" },
  { id: "que-cambia", nombre: "Qué cambia en tu lubricentro" },
  { id: "qr", nombre: "La calco y los pasos del cliente" },
  { id: "fidelliza", nombre: "Fidelliza" },
  { id: "caso", nombre: "El caso Brothers Oil" },
  { id: "precio", nombre: "Precio, garantía y cupos" },
  { id: "preguntas", nombre: "Preguntas" },
  { id: "cierre", nombre: "Cierre" },
] as const;

/** Los tres links del navbar. Cada link extra es una salida. */
export const LINKS_NAVBAR = [
  { href: "#como-funciona", texto: "Cómo funciona" },
  { href: "#precio", texto: "Precio" },
  { href: "#preguntas", texto: "Preguntas" },
] as const;
