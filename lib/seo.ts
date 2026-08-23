// La identidad SEO del sitio, en UN solo lugar.
//
// La regla que este archivo hace estructural: "Fidelli Motors" se escribe
// IDÉNTICO en el title, el Open Graph, el JSON-LD, el footer y llms.txt.
// Sin variantes, sin "Fidelli" suelto, sin "FidelliMotors". Los motores
// generativos arman la entidad juntando menciones: cada variante es una
// entidad a medias.
//
// El <title> y la description arrancan con una oración COMPLETA que se
// entiende sola ("Fidelli Motors es..."): los motores generativos citan
// pasajes sueltos, fuera de contexto, y una frase que depende del título
// de arriba no sobrevive al recorte. Por lo mismo, acá se dice "sistema de
// gestión" aunque el posicionamiento interno sea retención y no gestión:
// es la frase que el dueño de un lubricentro le escribe a un buscador.
// Vive SOLO en metadata — el copy de la página no la usa.

export const SITIO_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://fidellimotors.app";

export const NOMBRE_SITIO = "Fidelli Motors";

export const TITULO_PORTADA =
  "Fidelli Motors: sistema para lubricentros y talleres mecánicos";

// 146 caracteres — el tope es 155. Los números que más se citan (90
// segundos, Argentina) van acá adentro y en texto plano en la página.
// Nombra a los talleres mecánicos además de a los lubricentros: el 25-30%
// de los que escriben hacen las dos cosas, y desde el bloque 2 el producto
// también. Se cayó "olvidate del cartón" por el tope de caracteres; la
// frase sigue viva en el hero, que es donde pega.
export const DESCRIPCION_PORTADA =
  "Fidelli Motors es el sistema para lubricentros y talleres mecánicos de Argentina: cargá un trabajo en 90 segundos y traé a tus clientes de vuelta.";

// La tarjeta que ve WhatsApp al compartir el link. JPEG y no PNG a
// propósito: es una fotografía, y la misma imagen en PNG pesaba 947KB —
// arriba del límite (~300KB) con el que WhatsApp recorta o descarta la
// tarjeta grande. Ancho y alto declarados SIEMPRE: sin dimensiones,
// WhatsApp muestra la miniatura chica en vez de la tarjeta.
export const OG_IMAGEN = {
  url: "/assets/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Un mecánico sirviendo aceite en un taller y la marca Fidelli Motors: tus clientes vuelven.",
} as const;

/** El WhatsApp de ventas en formato E.164, para el JSON-LD. */
export const TELEFONO_VENTAS = "+5493513736028";

/** Las redes de la marca, para el `sameAs` del Organization. */
export const REDES = ["https://instagram.com/fidelli.motors"] as const;

/**
 * Lubricentros que EXISTEN pero no se indexan.
 *
 * `demo` es el tenant de demostración: su vidriera funciona y se le puede
 * mandar el link a un prospecto, pero no es un negocio real y no tiene por
 * qué competir en el buscador con las vidrieras de nuestros clientes. Que
 * un lubricentro inventado aparezca en Google buscando "lubricentro
 * Córdoba" es ruido para todos.
 *
 * NO va en `slug_reservado()` de la base: esa lista es de slugs que NADIE
 * puede tomar, y `demo` justamente ya está tomado. Esto es una decisión de
 * indexación, no de disponibilidad, así que vive en el front.
 *
 * Lo leen los dos lugares que deciden indexación: el sitemap (no lo lista)
 * y el generateMetadata de /[slug] (lo marca noindex).
 */
export const SLUGS_SIN_INDEXAR: readonly string[] = ["demo"];
