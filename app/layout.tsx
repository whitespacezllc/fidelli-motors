import type { Metadata } from "next";
import { Nunito, Public_Sans } from "next/font/google";
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

const DESCRIPCION =
  "El cartón de service digitalizado: cargá el service y tus clientes ven su historial escaneando el QR.";

// metadataBase hace que la URL del og:image sea ABSOLUTA. Sin esto WhatsApp
// no puede resolver la imagen y cae al favicon —que era, justamente, lo que
// mostraba el logo de Vercel—. Producción por defecto; se puede pisar con la
// env para apuntar a otro entorno.
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://fidellimotors.app",
  ),
  // Las páginas ya traen "— Fidelli Motors" en su propio título, así que
  // acá NO va un template (duplicaría la marca). Este default sólo se usa
  // en las pocas rutas que no ponen título propio.
  title: "Fidelli Motors",
  description: DESCRIPCION,
  applicationName: "Fidelli Motors",
  // app/icon.svg, app/apple-icon.png y app/favicon.ico los detecta Next solo.
  // app/opengraph-image.png y app/twitter-image.png también: son la tarjeta
  // que ve WhatsApp al compartir el link, en vez del favicon suelto.
  openGraph: {
    title: "Fidelli Motors",
    description: DESCRIPCION,
    siteName: "Fidelli Motors",
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fidelli Motors",
    description: DESCRIPCION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${nunito.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
