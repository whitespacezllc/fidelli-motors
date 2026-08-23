import {
  DESCRIPCION_PORTADA,
  NOMBRE_SITIO,
  REDES,
  SITIO_URL,
  TELEFONO_VENTAS,
} from "@/lib/seo";
import { CTA_WHATSAPP } from "@/lib/landing";
import { PLANES } from "@/lib/planes-landing";

// JSON-LD de la landing comercial: quiénes somos (Organization) y qué se
// vende (SoftwareApplication). El FAQPage vive en preguntas.tsx, al lado
// de las preguntas que describe — acá solo lo que es de la página entera.
//
// LOS PRECIOS SALEN DE lib/planes-landing.ts, la misma fuente que pintan
// las tarjetas y la tabla de comparación. No se escriben acá: así no hay
// forma de que el JSON-LD y la sección se contradigan, que es lo que
// Google marca como rich result inconsistente.
//
// CÓMO SE REPRESENTAN TRES PLANES: un AggregateOffer con el rango
// (lowPrice/highPrice) y adentro las tres ofertas mensuales, cada una con
// su nombre. Las anuales NO entran como ofertas separadas a propósito —
// serían seis ofertas para tres productos, y el precio que se compara en
// un resultado de búsqueda es el de entrada. El descuento anual se
// describe en la oferta de cada plan.
//
// PROHIBIDO ACÁ: AggregateRating, Review o cualquier schema de reseñas.
// No tenemos reseñas verificables, y un schema de reseñas inventado es
// penalización directa. El día que haya testimonios reales con nombre y
// autorización, entran como Review con autor identificado — no antes.
//
// `sameAs` sale de REDES (lib/seo.ts). Hoy es solo Instagram; cuando haya
// más perfiles se agregan ahí y entran solos.

const ORGANIZACION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: NOMBRE_SITIO,
  url: SITIO_URL,
  logo: `${SITIO_URL}/icon-512.png`,
  sameAs: [...REDES],
  areaServed: "AR",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: TELEFONO_VENTAS,
      url: CTA_WHATSAPP,
      areaServed: "AR",
      availableLanguage: "es",
    },
  ],
};

const APLICACION = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: NOMBRE_SITIO,
  url: SITIO_URL,
  description: DESCRIPCION_PORTADA,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "ARS",
    offerCount: PLANES.length,
    lowPrice: String(PLANES[0].mensual),
    highPrice: String(PLANES[PLANES.length - 1].mensual),
    offers: PLANES.map((plan) => ({
      "@type": "Offer",
      name: plan.nombre,
      price: String(plan.mensual),
      priceCurrency: "ARS",
      description: `Plan ${plan.nombre}, por mes y sin permanencia. Pagándolo por año, $${plan.anual.toLocaleString("es-AR")} (pagás 9 meses, usás 12).`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plan.mensual,
        priceCurrency: "ARS",
        unitText: "por mes",
      },
    })),
  },
};

/** Escapado igual que el FAQPage: un `<` dentro de un <script> puede
 *  cerrar la etiqueta antes de tiempo. */
function escapar(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export function DatosEstructurados() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapar(ORGANIZACION) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapar(APLICACION) }}
      />
    </>
  );
}
