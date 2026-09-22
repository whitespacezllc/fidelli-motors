import type { Metadata } from "next";
import { NOMBRE_SITIO, OG_IMAGEN } from "@/lib/seo";
import { obtenerDocumentoLegal } from "@/lib/legal/documentos";
import { DocumentoLegal } from "@/components/legal/documento-legal";

// /privacidad — la Política de Privacidad. Es la página que enlaza el pie
// de la vidriera de cada lubricentro (la única mención de Fidelli en esa
// superficie), además del pie de la landing y del panel. El texto vive en
// content/legal/privacidad.md con su versión; acá no hay copy.
const RUTA = "/privacidad";

export async function generateMetadata(): Promise<Metadata> {
  const documento = await obtenerDocumentoLegal("privacidad");
  const titulo = "Política de Privacidad";
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

export default async function PaginaPrivacidad() {
  const documento = await obtenerDocumentoLegal("privacidad");
  return <DocumentoLegal documento={documento} />;
}
