import { IconoGarantia, IconoMismoDia } from "@/components/iconos";
import { TarjetasPlanes } from "@/components/landing/tarjetas-planes";
import { ComparacionPlanes } from "@/components/landing/comparacion-planes";
import { Revelar } from "@/components/landing/revelar";
import { GARANTIA_30_DIAS } from "@/lib/landing";

// 09 · Precio — los tres planes.
//
// Va justo después del caso Brothers Oil: la prueba social rinde el doble
// inmediatamente antes de hablar de plata.
//
// Reglas que manda esta sección, todas de CLAUDE-landing:
//
//   · EL ROJO APARECE UNA SOLA VEZ: en el botón de Pro. Basic y Ultra van
//     con contorno. Los tres van al mismo WhatsApp, pero hay una sola
//     acción primaria a la vista. El único otro rojo posible es el anillo
//     de foco del teclado, que lo pone globals.css para todo el sitio.
//   · Ni el badge del descuento ni la insignia "Recomendado" van en rojo:
//     son estado, no acción.
//   · La garantía sale de GARANTIA_30_DIAS y no escrita a mano acá. Tiene
//     que decir exactamente lo mismo que la política de cancelación, y dos
//     copias de una frase siempre terminan divergiendo.
//   · Nada de contadores dinámicos ni cuentas regresivas.
//
// LA ESCASEZ ESTÁ ACOTADA A DONDE ES REAL. El módulo anterior decía "5
// lugares por mes" sin decir de qué: a un taller de Rosario le anunciaba
// que no había lugar cuando en realidad se lo puede tomar hoy mismo. El
// límite es de las instalaciones PRESENCIALES en Córdoba capital; afuera
// de Córdoba se instala por videollamada el mismo día y sin lista. Dicho
// así, la escasez sigue operando donde aprieta y deja de espantar al resto.
//
// SE FUERON DE ACÁ, y de toda la página: el fee de implementación y el
// Programa Fundadores. Dejaron de existir — si vuelven, vuelven con su
// propio bloque, no colgados de esta sección.

export function Precio() {
  return (
    <section
      id="precio"
      aria-labelledby="precio-titulo"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      <div className="contenedor">
        <Revelar className="mx-auto mb-(--espacio-lead) max-w-2xl text-center">
          <h2
            id="precio-titulo"
            className="text-balance text-h3 font-bold sm:text-h2"
          >
            Tres planes. Ninguna letra chica.
          </h2>
          <p className="mt-(--espacio-h2-lead) text-pretty text-body text-ink-60 sm:text-lead">
            Todos incluyen trabajos ilimitados y la página del cliente con QR.
            La diferencia es cuánto hace el sistema por vos.
          </p>
        </Revelar>

        <Revelar>
          <TarjetasPlanes />
        </Revelar>

        {/* ---------- La banda: instalación y garantía ----------
            Dos cosas que valen para los tres planes, así que van una sola
            vez y debajo de las tarjetas en vez de repetirse tres veces. */}
        <Revelar className="mt-(--espacio-bloque) grid gap-6 rounded-lg border border-line bg-surface p-6 sm:p-7 lg:grid-cols-2 lg:gap-8">
          <div>
            <p className="flex items-center gap-2">
              <IconoMismoDia
                aria-hidden
                strokeWidth={2}
                className="size-5 shrink-0 text-ink-40"
              />
              <span className="font-ui text-ui font-semibold text-ink">
                Lo dejamos funcionando el mismo día
              </span>
            </p>
            <p className="mt-2 max-w-[52ch] text-pretty text-body text-ink-60">
              En Córdoba capital vamos a tu local y lo dejamos funcionando el
              mismo día. Abrimos 5 instalaciones presenciales por mes. Si estás
              en otra provincia, lo dejamos funcionando por videollamada el
              mismo día, sin lista de espera.
            </p>
          </div>

          <div>
            {/* El ícono en la escala de éxito y no en rojo. Es exactamente
                el caso que la regla de oro protege: "garantía" se siente
                rojo y no lo es. */}
            <p className="flex items-center gap-2">
              <IconoGarantia
                aria-hidden
                strokeWidth={2}
                className="size-5 shrink-0 text-success"
              />
              <span className="font-ui text-ui font-semibold text-ink">
                Garantía de 30 días
              </span>
            </p>
            <p className="mt-2 max-w-[52ch] text-pretty text-body text-ink-60">
              {GARANTIA_30_DIAS}
            </p>
          </div>
        </Revelar>

        <Revelar>
          <p className="mx-auto mt-5 max-w-[78ch] text-center text-ui text-ink-40">
            Los calcos QR incluidos se entregan una sola vez, al arrancar.
            Después se piden aparte en cualquier plan.
          </p>
        </Revelar>

        <Revelar>
          <ComparacionPlanes />
        </Revelar>
      </div>
    </section>
  );
}
