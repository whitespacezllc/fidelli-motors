import type { Metadata } from "next";
import { NOMBRE_SITIO, OG_IMAGEN } from "@/lib/seo";
import { obtenerDocumentoLegal } from "@/lib/legal/documentos";
import { DocumentoLegal } from "@/components/legal/documento-legal";

// /terminos — los Términos y Condiciones del Servicio. El texto vive en
// content/legal/terminos.md con su versión; acá no hay copy. Indexable: es
// un documento público de la superficie comercial, como en cualquier SaaS.
//
// El título declara solo su nombre y el template del layout raíz agrega la
// marca. Sin `images` en el Open Graph propio de la página: es un
// documento, la tarjeta general del sitio alcanza.
const RUTA = "/terminos";

export async function generateMetadata(): Promise<Metadata> {
  const documento = await obtenerDocumentoLegal("terminos");
  const titulo = "Términos y Condiciones";
  return {
    title: titulo,
    description: documento.descripcion,
    alternates: { canonical: RUTA },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${titulo} | ${NOMBRE_SITIO}`,
      description: documento.descripcion,
      url: RUTA,
      siteName: NOMBRE_SITIO,
      locale: "es_AR",
      type: "website",
      images: [OG_IMAGEN],
    },
    twitter: {
      card: "summary_large_image",
      title: `${titulo} | ${NOMBRE_SITIO}`,
      description: documento.descripcion,
      images: [OG_IMAGEN.url],
    },
  };
}

export default async function PaginaTerminos() {
  const documento = await obtenerDocumentoLegal("terminos");
  return <DocumentoLegal documento={documento} />;
}
