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
// El pb-24 de mobile deja lugar a la barra fija del CTA, que es fixed y no
// ocupa espacio en el flujo — sin ese aire, tapa el pie.
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
    <div className="flex min-h-full flex-1 flex-col font-brand text-body leading-normal">
      <Navbar />
      <main className="flex-1 pb-24 sm:pb-0">{children}</main>
      <Pie />
      <BarraCtaMovil />
    </div>
  );
}
