import type { Metadata } from "next";
import { DESCRIPCION_PORTADA, OG_IMAGEN, TITULO_PORTADA } from "@/lib/seo";
import { DatosEstructurados } from "@/components/landing/datos-estructurados";
import { Hero } from "@/components/landing/hero";
import { Prueba } from "@/components/landing/prueba";
import { QueCambia } from "@/components/landing/que-cambia";
import { QrYPasos } from "@/components/landing/qr-y-pasos";
import { Fidelliza } from "@/components/landing/fidelliza";
import { Caso } from "@/components/landing/caso";
import { Preguntas } from "@/components/landing/preguntas";
import { Precio } from "@/components/landing/precio";
import { Cierre } from "@/components/landing/cierre";

// La landing comercial. Es la única superficie del producto que se indexa a
// propósito: `/[slug]` también se indexa —es la vidriera del lubricentro—,
// pero `/[slug]/[patente]` y el panel van noindex.
// Sin `title` propio: el default del layout raíz ES el título de esta
// página. El Open Graph se declara acá COMPLETO —Next no lo mezcla en
// profundidad con el del layout— y con la imagen dimensionada: sin width y
// height, WhatsApp muestra la miniatura chica en vez de la tarjeta grande.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITULO_PORTADA,
    description: DESCRIPCION_PORTADA,
    url: "/",
    siteName: "Fidelli Motors",
    locale: "es_AR",
    type: "website",
    images: [OG_IMAGEN],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO_PORTADA,
    description: DESCRIPCION_PORTADA,
    images: [OG_IMAGEN.url],
  },
};

// Las once secciones, en el orden narrativo. Ya no queda andamio: el
// componente <Seccion> que sostenía los carteles quedó sin uso.
//
// El orden es dolor → deseo → duda, y no es negociable:
//   · abre por el desorden (02), que es lo que lo hace frenar;
//   · sigue por la facilidad (03), que es la condición de entrada;
//   · después los resultados (04);
//   · el QR va en el MEDIO (05), no en el hero: es el "y encima", no el gancho;
//   · las dudas (10) se responden ANTES del precio... salvo que el precio (09)
//     va justo después del caso Brothers (08), porque la prueba social rinde
//     el doble inmediatamente antes de hablar de plata.
//
// El copy de cada una está cerrado en docs/landing-spec.md y se implementa
// sección por sección. Acá no se escribe copy de memoria.
export default function LandingComercial() {
  return (
    <>
      <DatosEstructurados />

      <Hero />

      <Prueba />

      <QueCambia />

      {/* 05 y 06 comparten el fondo grafito SIN corte entre ellas: es el
          único quiebre visual de la página. Las renderiza un solo
          componente para que no se pueda meter nada en el medio. */}
      <QrYPasos />

      <Fidelliza />

      {/* La 08 va PEGADA a la 09: la prueba social rinde el doble
          inmediatamente antes de la cifra. No mover una sin la otra. */}
      <Caso />

      <Precio />

      <Preguntas />

      <Cierre />
    </>
  );
}
