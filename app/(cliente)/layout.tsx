import type { Metadata } from "next";

// La superficie del cliente final. No comparte nada con el panel: sin
// sidebar, sin barra inferior, sin sesión.
//
// Acá se fijan las dos cosas que valen para todas sus pantallas:
//
//   · Nunito y 18px de piso. El Flow del Cliente pide cuerpo mínimo de
//     18px —no los 16 del resto del producto— porque Pedro tiene 60 años,
//     está parado al lado del auto y usa anteojos de lejos.
//   · data-superficie="cliente", que en globals.css apaga el rojo Motors
//     del anillo de foco y lo reemplaza por el color del lubricentro. En
//     esta superficie el rojo de marca no aparece ni un píxel.
// Open Graph de la superficie: el del layout raíz dice og:site_name
// «Fidelli Motors», y acá eso no corresponde en ninguna pantalla. Declararlo
// de nuevo sin siteName lo reemplaza para todo lo que cuelga (/[slug] pone
// el nombre del taller; /[slug]/[patente] queda sin site_name, que es mejor
// que el nuestro). La imagen no va acá: la pone [slug]/opengraph-image.tsx.
export const metadata: Metadata = {
  openGraph: { locale: "es_AR", type: "website" },
};

export default function LayoutCliente({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-superficie="cliente"
      className="flex min-h-full flex-1 flex-col font-brand text-c-body leading-normal text-ink"
    >
      {children}
    </div>
  );
}
