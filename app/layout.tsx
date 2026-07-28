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

export const metadata: Metadata = {
  title: "Fidelli Motors",
  description:
    "El cartón de service digitalizado: cargá el service y tus clientes ven su historial escaneando el QR.",
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
