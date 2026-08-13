import type { Metadata } from "next";
import { Nunito, Public_Sans } from "next/font/google";
import {
  DESCRIPCION_PORTADA,
  NOMBRE_SITIO,
  SITIO_URL,
  TITULO_PORTADA,
} from "@/lib/seo";
import "./globals.css";

// Nunito: la voz de la marca y de todo lo que lee el cliente final.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// Public Sans: la voz del instrumento — el dato operativo del panel.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// metadataBase hace que la URL del og:image sea ABSOLUTA. Sin esto WhatsApp
// no puede resolver la imagen y cae al favicon —que era, justamente, lo que
// mostraba el logo de Vercel—. Producción por defecto; se puede pisar con la
// env para apuntar a otro entorno.
export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  // El default es el título de "/" —la única página que no declara título
  // propio—. El resto de las páginas declara solo su nombre y el template
  // les agrega la marca; las de la superficie del cliente usan `absolute`
  // porque esa superficie es del lubricentro, no nuestra.
  title: {
    default: TITULO_PORTADA,
    template: `%s | ${NOMBRE_SITIO}`,
  },
  description: DESCRIPCION_PORTADA,
  applicationName: NOMBRE_SITIO,
  // app/icon.png, app/icon.svg, app/apple-icon.png y app/favicon.ico los
  // detecta Next solo. La imagen de Open Graph NO va por convención de
  // archivo sino declarada en cada página indexable: la convención pisa a
  // la metadata explícita y no deja declarar width/height/alt, que es lo
  // que WhatsApp necesita para la tarjeta grande.
  openGraph: {
    siteName: NOMBRE_SITIO,
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${nunito.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
