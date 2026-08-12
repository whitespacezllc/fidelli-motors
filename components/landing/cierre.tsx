import { IconoWhatsapp } from "@/components/iconos";
import { CTA_WHATSAPP } from "@/lib/landing";

// 11 · Cierre — una sola acción, sin fricción.
//
// Sobre grafito y centrado. Es el tercer y último bloque oscuro de la
// página (05, 06 y este), y el que cierra: abajo solo queda el pie.
//
// El CTA dice "Hablar por WhatsApp" y el del navbar "Quiero mi lugar":
// distinta formulación, MISMA acción y mismo href. Eso no son dos acciones
// primarias compitiendo — es la misma, dicha donde corresponde.
export function Cierre() {
  return (
    <section
      id="cierre"
      aria-labelledby="cierre-titulo"
      className="scroll-mt-14 bg-ink px-5 py-16 text-inverso sm:scroll-mt-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <h2
          id="cierre-titulo"
          className="text-balance text-h3 font-bold sm:text-h2"
        >
          El cartón del parasol tiene los días contados.
        </h2>

        {/* max-w-prose topa la medida de línea: el lead es largo y en
            desktop se estiraría más allá de los 65-75 caracteres. */}
        <p className="mt-4 max-w-prose text-pretty text-body text-inverso-60 sm:text-lead">
          Escribinos por WhatsApp y en cinco minutos sabés si te sirve. Sin
          formularios, sin vueltas.
        </p>

        <a
          href={CTA_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex h-13 items-center gap-2.5 rounded-md bg-brand px-7 text-body font-bold text-white transition-colors hover:bg-brand-deep"
        >
          <IconoWhatsapp aria-hidden className="size-5 shrink-0" />
          Hablar por WhatsApp
        </a>

        {/* La escasez NO va en rojo: el rojo es acción, nunca estado. Va en
            la tinta terciaria, que es lo que corresponde a una bajada. */}
        <p className="mt-4 text-ui text-inverso-40">
          Quedan 4 de 5 lugares con instalación sin cargo
        </p>
      </div>
    </section>
  );
}
