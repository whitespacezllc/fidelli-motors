import type { Lubricentro } from "@/lib/cliente/landing";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { estilosTema } from "@/lib/cliente/tema";
import { PieConfianza } from "@/components/cliente/pie-confianza";

// La base no contestó. NO es «no existe»: el taller está y el historial
// también; lo que falló es la llamada (lib/cliente/puerta.ts). Por eso esto
// no es un 404 ni dice que algo no se encontró: dice qué pasó y qué hacer,
// sin disculpas y sin culpar a nadie.
//
// El color sale de las variables del tenant. Con la marca del lubricentro
// va pintado con su color; sin ella quedan los neutros de :root —el borde
// y el botón en grafito—. Nunca el rojo Motors: en esta superficie no
// aparece ni un píxel, y un error tampoco es rojo.
export function SinRespuesta({
  titulo,
  reintentar = false,
  nivel: Titulo = "h1",
}: {
  titulo: string;
  /** Con el botón «Reintentar». Sin él, reintentar es otra cosa que ya está
   *  en la pantalla (en la vidriera, tocar «Ver mi historial» de nuevo). */
  reintentar?: boolean;
  /** h1 cuando es lo único de la pantalla; h2 debajo de la marca. */
  nivel?: "h1" | "h2";
}) {
  return (
    <section className="rounded-lg border border-tenant bg-tenant-soft p-5 text-center sm:p-6">
      {/* text-balance: a 375 el título parte en dos líneas, y sin esto
          deja una palabra sola en la segunda. */}
      <Titulo className="text-balance text-c-lead font-bold sm:text-c-titulo">
        {titulo}
      </Titulo>
      <p className="mt-2 text-c-body text-ink-60">
        Probá de nuevo en un momento.
      </p>

      {reintentar && (
        // Reintentar es volver a pedir la misma URL, y `href=""` es eso
        // exactamente —con su consulta y todo—, sin rearmar la dirección
        // con lo que escribió el visitante. Un <a> y no un <Link>: pide el
        // documento entero y anda igual sin JavaScript.
        <a
          href=""
          className="mt-5 flex min-h-16 w-full items-center justify-center rounded-md bg-tenant px-4 py-3 text-c-lead font-bold text-tenant-ink transition-colors hover:bg-tenant-deep"
        >
          Reintentar
        </a>
      )}
    </section>
  );
}

// La pantalla entera, para cuando no hay nada más que mostrar: la vidriera
// sin get_landing y el cartón sin get_carton.
//
// `lubricentro` es la marca, si se la pudo conseguir. Con ella la pantalla
// lleva su color, su tema y su pie de confianza —dónde queda el taller y
// cómo escribirle, que es lo que el dueño del auto puede hacer mientras
// tanto—. Sin ella queda neutra, como la del taller que no existe.
export function PantallaSinRespuesta({
  titulo,
  lubricentro,
}: {
  titulo: string;
  lubricentro: Lubricentro | null;
}) {
  const cuerpo = (
    <main className="flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12">
      <div className="m-auto w-full max-w-md sm:max-w-xl">
        <SinRespuesta titulo={titulo} reintentar />
      </div>
    </main>
  );

  if (!lubricentro) return cuerpo;

  const paleta = paletaTenant(lubricentro.colorPrimario, lubricentro.tema);

  return (
    <div
      style={{
        ...variablesTenant(paleta),
        ...estilosTema(lubricentro.tema, lubricentro.colorFondo),
      }}
      className="flex min-h-full flex-1 flex-col"
    >
      {cuerpo}
      {/* Sin el premio: acá no se promociona nada, se dice cómo llegar. */}
      <PieConfianza lubricentro={{ ...lubricentro, premio: null }} />
    </div>
  );
}
