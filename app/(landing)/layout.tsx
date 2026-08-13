import { Navbar } from "@/components/landing/navbar";
import { BarraCtaMovil } from "@/components/landing/barra-cta-movil";
import { Pie } from "@/components/landing/pie";

// La superficie comercial: `/`, y más adelante `/terminos` y `/privacidad`.
//
// Es la ÚNICA de las tres superficies donde el rojo Motors es la marca. En
// `/[slug]` no aparece ni un píxel (ahí manda el color del lubricentro) y el
// panel se rige por CLAUDE.md. La regla del rojo es por superficie.
//
// No lee la sesión en ningún punto: la landing es lo que más tráfico
// anónimo va a recibir y tiene que poder servirse estática.
//
// EL AIRE DE ABAJO VA EN ESTE DIV Y NO EN <main>. La barra fija del CTA es
// `fixed`: no ocupa lugar en el flujo, así que hay que reservárselo al final
// del documento. Estaba en <main>, que solo empuja el pie hacia abajo — el
// pie seguía quedando debajo de la barra al llegar al final de la página.
//
// La medida no es a ojo y se midió, no se estimó: 73px son 1 de borde + 12
// de aire arriba + 48 del botón + 12 abajo, más el safe-area del iPhone.
// A ojo daban 72 y el pie quedaba un píxel abajo de la barra.
// LA VOZ POR DEFECTO SE DECLARA ACÁ, y no se hereda del body.
//
// globals.css pone en <body> la voz del INSTRUMENTO —Public Sans, 14px—,
// que es la correcta para el panel: un mecánico leyendo datos a 25 cm. La
// landing es lo contrario: es prosa de marca que se lee de corrido, y el
// design system pide Nunito con cuerpo de 16.
//
// Se resuelve una vez, acá, en vez de repetir `font-brand text-body` en cada
// párrafo de once secciones. Lo que sí es instrumento dentro de la landing
// —el número de sección, algún label— se marca explícito con `font-ui`.
export default function LayoutLanding({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-superficie="landing"
      className="flex min-h-full flex-1 flex-col pb-[calc(4.5rem+1px+env(safe-area-inset-bottom))] font-brand text-body leading-normal md:pb-0"
    >
      <Navbar />
      <main className="flex-1">{children}</main>
      <Pie />
      <BarraCtaMovil />
    </div>
  );
}
