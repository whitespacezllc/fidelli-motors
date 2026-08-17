import {
  IconoGarantia,
  IconoIncluido,
  IconoMismoDia,
} from "@/components/iconos";
import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";
import { ModuloCupos } from "@/components/landing/modulo-cupos";
import { SelectorPlan } from "@/components/landing/selector-plan";
import { Revelar } from "@/components/landing/revelar";
import { GARANTIA_30_DIAS } from "@/lib/landing";

// 09 · Precio — dos números y nada más.
//
// Va justo después del caso Brothers Oil: la prueba social rinde el doble
// inmediatamente antes de hablar de plata.
//
// LAS DOS TARJETAS NO PESAN LO MISMO Y ESO ES EL DISEÑO. Antes eran dos
// mitades iguales, y como el plan tiene cinco renglones y la instalación
// cuatro, la de la derecha quedaba con un hueco abajo. Ahora la del plan
// ocupa 7/12 y va en grafito —es la que se contrata todos los meses— y la
// de instalación 5/12 en claro, con alto propio: son dos cosas distintas,
// no dos opciones entre las que hay que elegir.
//
// Reglas que manda esta sección, todas de CLAUDE-landing:
//
//   · EL ROJO APARECE UNA SOLA VEZ, en el botón de WhatsApp. Ni en el borde
//     de la tarjeta destacada, ni en el badge del descuento, ni en la barra
//     de capacidad. El único otro rojo posible es el anillo de foco del
//     teclado, que lo pone globals.css para todo el sitio.
//   · Ni los cupos ni el descuento van en rojo: son estado, no acción.
//   · La garantía sale de GARANTIA_30_DIAS y no escrita a mano acá. Tiene
//     que decir exactamente lo mismo que la política de cancelación, y dos
//     copias de una frase siempre terminan divergiendo.
//   · Nada de contadores dinámicos ni cuentas regresivas. La condición del
//     programa de fundadores es una FECHA, no un stock que baja.
//
// Es la única sección de la entrega 1 que es "solo tipografía": sin fotos,
// sin capturas, sin video. Todo el peso lo lleva la escala.

const INCLUYE_PLAN = [
  "Services y clientes ilimitados",
  "Avisos por kilómetros y mensajes armados",
  "Tu página pública con QR y tu marca",
  "Fidelliza incluido",
  "Soporte por WhatsApp",
] as const;

// LO QUE ENTRA EN LA INSTALACIÓN, y nada más. En particular NO entra migrar
// ni cargar services, clientes o vehículos históricos: el producto hoy no
// lo hace y prometerlo acá se paga el día de la instalación.
const INCLUYE_INSTALACION = [
  "500 calcos con QR, diseñados e impresos",
  "Carga de tu catálogo de productos",
  "Capacitación en tu local",
  "Manual de usuario",
] as const;

// El escalón `label` del sistema: Public Sans 12/600 con tracking abierto.
const ETIQUETA = "font-ui text-label font-semibold tracking-[0.08em] uppercase";

// Los dos chips son el mismo objeto en dos escalas. Se declara una vez para
// que no se separen: si mañana cambia el radio de uno, cambia el del otro.
const CHIP =
  "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 font-ui text-ui font-semibold";

function Incluye({
  items,
  tono,
}: {
  items: readonly string[];
  /** `grafito` para la tarjeta oscura, `claro` para la blanca. */
  tono: "grafito" | "claro";
}) {
  const texto = tono === "grafito" ? "text-inverso-60" : "text-ink-60";
  const icono = tono === "grafito" ? "text-inverso-40" : "text-ink-40";

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className={`flex gap-2.5 text-body ${texto}`}>
          {/* El tilde en tinta terciaria, nunca en rojo: marca "incluido",
              que es un estado. */}
          <IconoIncluido
            aria-hidden
            strokeWidth={2}
            className={`mt-[0.2em] size-5 shrink-0 ${icono}`}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Precio() {
  return (
    <section
      id="precio"
      aria-labelledby="precio-titulo"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      {/* El contenedor global, el mismo que el resto de la página. Antes
          esta sección se topaba además en max-w-5xl y quedaba más angosta
          que todo lo de arriba y lo de abajo. */}
      <div className="contenedor">
        <Revelar className="mx-auto max-w-2xl text-center">
          <h2
            id="precio-titulo"
            className="text-balance text-h3 font-bold sm:text-h2"
          >
            Un solo plan, para cualquier lubricentro.
          </h2>
          <p className="mt-(--espacio-h2-lead) text-pretty text-body text-ink-60 sm:text-lead">
            Lo pagás por mes o por año. La instalación es una sola vez, y para
            los fundadores no la cobramos.
          </p>
        </Revelar>

        {/* ---------- Las dos tarjetas ----------
            `items-start` y no `items-stretch`: cada una mide lo que mide.
            Igualarlas era lo que dejaba el hueco abajo en la más corta.

            Pasan a dos columnas en `lg` y no en `md`: con el reparto 7/5, a
            768 la tarjeta de instalación quedaría en ~270px y ahí no entran
            el precio tachado al lado del $0 ni los renglones sin partirse.
            Apiladas a ese ancho se leen mejor. */}
        <div className="mt-(--espacio-lead) grid items-start gap-6 lg:grid-cols-12 lg:gap-10">
          {/* ============ A · La columna del plan ============
              La tarjeta y, debajo, la nota de capacidad. Van juntas y al
              mismo ancho a propósito: la nota explica por qué hay lista de
              espera para ESTO. A lo ancho de la página quedaba flotando
              entre las dos tarjetas sin pertenecer a ninguna. */}
          <Revelar className="flex flex-col gap-5 lg:col-span-7">
            {/* Sin borde de marca. La jerarquía la da el grafito y el tamaño
                de la columna, no un contorno rojo.

                La sombra es la excepción que admite el design system para
                un elemento que se despega del fondo: sobre blanco, una
                tarjeta negra sin borde necesita algo que la apoye. La clara
                no la lleva porque para eso tiene el borde.

                `text-inverso` en el contenedor y no solo en cada hijo: sin
                una tinta base, cualquier texto que se agregue mañana sin
                clase de color hereda el ink del body y sale negro sobre
                negro. No se ve, no falla el build y no lo agarra el
                linter. */}
            <div className="flex flex-col rounded-lg bg-ink p-6 text-inverso shadow-lg sm:p-8">
              <p className={`${ETIQUETA} text-inverso-40`}>Plan</p>

              <div className="mt-6">
                <SelectorPlan />
              </div>

              {/* "Sin permanencia" es media venta y estaba enterrada como
                  un renglón más entre los bullets. Acá es un objeto propio,
                  arriba de la lista. */}
              <p className="mt-7">
                <span className={`${CHIP} bg-white/8 text-inverso`}>
                  <IconoIncluido
                    aria-hidden
                    strokeWidth={2}
                    className="size-4 shrink-0 text-inverso-60"
                  />
                  Sin permanencia
                </span>
              </p>

              <Incluye items={INCLUYE_PLAN} tono="grafito" />

              {/* El mismo botón que el navbar, el hero, el cierre y la
                  barra fija de mobile: la misma acción dicha de nuevo donde
                  corresponde, no una segunda acción primaria.

                  La variante `solido-grafito` existe solo por el hover: el
                  porqué está medido en cta-whatsapp.tsx. */}
              <CtaWhatsapp
                variante="solido-grafito"
                className="mt-8 h-13 w-full px-7 text-body"
              />
            </div>

            <ModuloCupos />
          </Revelar>

          {/* ============ B · La instalación ============
              Sin botón propio: una sola acción primaria en toda la página. */}
          <Revelar indice={1} className="lg:col-span-5">
          <div className="flex flex-col rounded-lg border border-line bg-base p-6 sm:p-8">
            <p className={`${ETIQUETA} text-ink-60`}>
              Instalación · Programa Fundadores
            </p>

            {/* EL PRECIO TACHADO va al lado del $0 y sin la palabra "Antes"
                que llevaba antes. Esa palabra existía porque el titular
                decía "Sin cargo" y el número tachado tenía que cargar solo
                con el contraste; con un $0 al lado, la comparación se
                entiende sin ayuda y la etiqueta era ruido.

                `whitespace-nowrap` para que la cifra no se parta en dos
                renglones: un tachado cortado a la mitad se lee como un
                error de render. La línea va del mismo color que el número y
                a 1.5px por la misma razón. */}
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-h2 font-bold text-ink tabular-nums sm:text-h1">
                $0
              </span>
              {/* En ink-60 y no en ink-40: ink-40 sobre blanco da 3.45:1 y
                  el mínimo de cuerpo es 4.5:1. La jerarquía la sostiene el
                  tamaño —lead contra h1— y el tachado, no el gris. */}
              <s className="text-lead whitespace-nowrap text-ink-60 tabular-nums decoration-ink-60 decoration-[1.5px]">
                $93.500
              </s>
            </p>

            <p className="mt-3 text-pretty text-body text-ink-60">
              Sin cargo para los fundadores. El programa cierra en octubre de
              2026.
            </p>

            <p className="mt-6">
              <span className={`${CHIP} bg-surface text-ink`}>
                <IconoMismoDia
                  aria-hidden
                  strokeWidth={2}
                  className="size-4 shrink-0 text-ink-40"
                />
                Funcionando el mismo día
              </span>
            </p>

            <Incluye items={INCLUYE_INSTALACION} tono="claro" />

            {/* ---------- La garantía ----------
                Al pie y detrás de un divisor: es lo último que se lee antes
                de decidir, y es lo que baja el riesgo de la decisión.

                El ícono en la escala de éxito y no en rojo. Es exactamente
                el caso que la regla de oro protege: "garantía" se siente
                rojo y no lo es. */}
            <div className="mt-8 border-t border-line pt-6">
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
              <p className="mt-2 text-pretty text-body text-ink-60">
                {GARANTIA_30_DIAS}
              </p>
            </div>
          </div>
          </Revelar>
        </div>
      </div>
    </section>
  );
}
