// La landing comercial: una sola acción primaria en toda la página.
//
// El número NO es el mismo que WHATSAPP_SOPORTE de lib/config.ts, y es a
// propósito: aquel es soporte de clientes que ya compraron, este es ventas.
// Si algún día se unifican, se unifican los dos lugares a la vez.
const WHATSAPP_VENTAS = "5493516136192";

const MENSAJE =
  "Hola Santiago, tengo un lubricentro y quiero saber más de Fidelli Motors";

/**
 * El href de TODOS los CTA de la landing: navbar, hero, precio, cierre y la
 * barra fija de mobile. Que se repita está bien; lo prohibido es que haya
 * dos acciones primarias distintas compitiendo.
 */
export const CTA_WHATSAPP = `https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(MENSAJE)}`;

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
  { id: "qr", nombre: "Y encima, el QR" },
  { id: "pasos-cliente", nombre: "Los tres pasos del cliente" },
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
