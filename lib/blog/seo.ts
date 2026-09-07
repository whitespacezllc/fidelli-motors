import { NOMBRE_SITIO, SITIO_URL } from "@/lib/seo";
import type { Articulo, ImagenBlog } from "@/lib/blog/articulos";

// La identidad SEO del blog, en un solo lugar: URLs, autor, feed y los
// esquemas JSON-LD. Sigue la regla de lib/seo.ts: "Fidelli Motors" idéntico
// en todos lados, y textos que se entienden solos fuera de contexto.

export const URL_BLOG = `${SITIO_URL}/blog`;
export const RUTA_FEED = "/blog/feed.xml";

export const TITULO_BLOG = "Blog";

/** La bajada del índice, una línea. */
export const BAJADA_BLOG =
  "Guías para el dueño de un lubricentro o taller: cómo ordenarse, cuánto cuesta un sistema y cómo hacer que los clientes vuelvan.";

// 158 caracteres, arranca con una oración completa: los motores
// generativos citan pasajes sueltos.
export const DESCRIPCION_BLOG =
  "Guías de Fidelli Motors para dueños de lubricentros y talleres mecánicos de Argentina: cómo ordenarse, cuánto cuesta un sistema y cómo hacer que los clientes vuelvan.";

/** La foto del índice del blog. Misma licencia y mismo lugar que las de los artículos. */
export const PORTADA: ImagenBlog = {
  src: "/assets/blog/portada.webp",
  alt: "Dos mecánicos revisan un auto blanco levantado en el elevador de un taller.",
  credito: "Jose Ricardo Barraza Morachis · Pexels",
};

export const AUTOR = {
  nombre: "Santiago Afur",
  rol: "Cofundador de Fidelli Motors",
  iniciales: "SA",
  /** La URL del autor en el JSON-LD: el blog, no una página personal. */
  url: URL_BLOG,
} as const;

/**
 * El <link rel="alternate" type="application/rss+xml"> del blog.
 *
 * Va en el layout del blog Y en cada página: Next no mezcla en profundidad
 * `alternates` entre layout y página —el de la página lo reemplaza entero—,
 * así que una página que declara su canonical perdería el feed si no lo
 * vuelve a declarar.
 */
export const ALTERNATES_FEED = {
  "application/rss+xml": [{ url: RUTA_FEED, title: `Blog de ${NOMBRE_SITIO}` }],
};

export function urlArticulo(slug: string): string {
  return `${URL_BLOG}/${slug}`;
}

/** La imagen OG dinámica de app/blog/[slug]/opengraph-image.tsx. */
export function urlImagenOg(slug: string): string {
  return `${urlArticulo(slug)}/opengraph-image`;
}

// ------------------------------------------------------------
// JSON-LD
// ------------------------------------------------------------

const PUBLICADOR = {
  "@type": "Organization",
  name: NOMBRE_SITIO,
  url: SITIO_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITIO_URL}/icon-512.png`,
    width: 512,
    height: 512,
  },
};

const PERSONA = {
  "@type": "Person",
  name: AUTOR.nombre,
  url: AUTOR.url,
};

export function schemaBlogPosting(articulo: Articulo) {
  const url = urlArticulo(articulo.slug);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: articulo.titulo,
    description: articulo.descripcion,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: articulo.fecha,
    dateModified: articulo.actualizado,
    author: PERSONA,
    publisher: PUBLICADOR,
    // Primero la foto (16:9, 1920 de ancho: lo que Discover pide) y después
    // la tarjeta OG, que es la que se comparte.
    image: [
      ...(articulo.imagen ? [`${SITIO_URL}${articulo.imagen.src}`] : []),
      {
        "@type": "ImageObject",
        url: urlImagenOg(articulo.slug),
        width: 1200,
        height: 630,
      },
    ],
    inLanguage: "es-AR",
    keywords: articulo.etiquetas.join(", "),
    // Con su propio @id: el de la URL a secas ya es la CollectionPage del
    // índice, y un mismo @id con dos tipos es una entidad ambigua.
    isPartOf: { "@type": "Blog", "@id": `${URL_BLOG}#blog`, name: `Blog de ${NOMBRE_SITIO}` },
  };
}

// Las preguntas salen del mismo Markdown que se renderiza: el texto del
// schema y el de la página no pueden decir cosas distintas.
export function schemaPreguntas(articulo: Articulo) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: articulo.preguntas.map((p) => ({
      "@type": "Question",
      name: p.pregunta,
      acceptedAnswer: { "@type": "Answer", text: p.respuesta },
    })),
  };
}

export function schemaMigas(articulo: Articulo) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITIO_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: URL_BLOG },
      {
        "@type": "ListItem",
        position: 3,
        name: articulo.tituloCorto,
        item: urlArticulo(articulo.slug),
      },
    ],
  };
}

export function schemaIndice(articulos: readonly Articulo[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": URL_BLOG,
    name: `Blog de ${NOMBRE_SITIO}`,
    url: URL_BLOG,
    description: DESCRIPCION_BLOG,
    image: `${SITIO_URL}${PORTADA.src}`,
    inLanguage: "es-AR",
    publisher: PUBLICADOR,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articulos.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: a.titulo,
        url: urlArticulo(a.slug),
      })),
    },
  };
}
