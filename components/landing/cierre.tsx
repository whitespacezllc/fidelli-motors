import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";
import { Revelar } from "@/components/landing/revelar";
import { CUPOS } from "@/lib/landing";

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
      className="aire-seccion scroll-mt-14 bg-ink text-inverso md:scroll-mt-16"
    >
      <div className="contenedor">
        <Revelar className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <h2
          id="cierre-titulo"
          className="text-balance text-h3 font-bold sm:text-h2"
        >
          Ordená tu lubricentro con fidelli motors.
        </h2>

        {/* max-w-prose topa la medida de línea: el lead es largo y en
            desktop se estiraría más allá de los 65-75 caracteres. */}
        <p className="mt-(--espacio-h2-lead) max-w-prose text-pretty text-body text-inverso-60 sm:text-lead">
          Escribinos por WhatsApp y agendamos una demo.
        </p>

        <CtaWhatsapp className="mt-8 h-13 px-7 text-body" />

        {/* La escasez NO va en rojo: el rojo es acción, nunca estado. Va en
            la tinta terciaria, que es lo que corresponde a una bajada.

            Deriva de CUPOS —la misma fuente que el módulo del precio— y
            con la MISMA condición: con menos de dos tomados no se muestra
            ningún número. Una cifra recién arrancada no comunica escasez,
            comunica que nadie está comprando. No es un bug: no la
            borres. */}
          {CUPOS.tomados >= 2 && (
            <p className="mt-4 text-ui text-inverso-40 tabular-nums">
              Quedan {CUPOS.total - CUPOS.tomados} de {CUPOS.total} lugares
              para {CUPOS.mes}.
            </p>
          )}
        </Revelar>
      </div>
    </section>
  );
}
