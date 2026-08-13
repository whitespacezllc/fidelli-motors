import {
  DESCRIPCION_PORTADA,
  NOMBRE_SITIO,
  REDES,
  SITIO_URL,
  TELEFONO_VENTAS,
} from "@/lib/seo";
import { CTA_WHATSAPP } from "@/lib/landing";

// JSON-LD de la landing comercial: quiénes somos (Organization) y qué se
// vende (SoftwareApplication). El FAQPage vive en preguntas.tsx, al lado
// de las preguntas que describe — acá solo lo que es de la página entera.
//
// LOS PRECIOS TIENEN QUE COINCIDIR EXACTO CON LA SECCIÓN 09: 46.750 por
// mes y 420.750 por año son los mismos números de selector-plan.tsx. Si
// cambia el precio, se cambia en los dos lados o Google marca el rich
// result como inconsistente.
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
  offers: [
    {
      "@type": "Offer",
      price: "46750",
      priceCurrency: "ARS",
      description: "Plan mensual, sin permanencia",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: 46750,
        priceCurrency: "ARS",
        unitText: "por mes",
      },
    },
    {
      "@type": "Offer",
      price: "420750",
      priceCurrency: "ARS",
      description: "Plan anual: pagás 9 meses, usás 12",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: 420750,
        priceCurrency: "ARS",
        unitText: "por año",
      },
    },
  ],
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
