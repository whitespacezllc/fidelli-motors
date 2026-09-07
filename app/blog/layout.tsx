import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Pie } from "@/components/landing/pie";
import { ALTERNATES_FEED } from "@/lib/blog/seo";

// El blog: parte de la superficie comercial —es nuestra marca, el rojo
// Motors es identidad y acción— con el mismo navbar y el mismo pie que la
// landing, pero SIN la barra fija de mobile ni el aire que la landing le
// reserva al pie de la página. El artículo tiene un solo llamado a la
// acción, al final, y una barra pegada abajo mientras se lee serían dos.
//
// Todo lo que se sirve acá es estático y sale del HTML del servidor: las
// páginas no traen ningún componente de cliente propio. Lo único con
// JavaScript es el navbar compartido (el menú y el gesto de esconderse),
// que es el mismo de la landing.
//
// La voz por defecto es Nunito (títulos, migas de la marca); el cuerpo de
// cada artículo cambia a Public Sans con la clase `prosa` de globals.css.
//
// El <link rel="alternate"> del feed va acá y también en cada página: ver
// ALTERNATES_FEED.
export const metadata: Metadata = {
  alternates: { types: ALTERNATES_FEED },
};

export default function LayoutBlog({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-superficie="blog"
      className="flex min-h-full flex-1 flex-col font-brand text-body leading-normal text-ink"
    >
      <Navbar />
      <main className="flex-1">{children}</main>
      <Pie />
    </div>
  );
}
