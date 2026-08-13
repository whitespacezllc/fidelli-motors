import Image from "next/image";

// 08 · El testimonio de Brothers Oil — probar que funciona con alguien
// igual a él, justo antes de hablar de plata.
//
// EL ORDEN NO ES DECORATIVO: esta sección va inmediatamente antes del
// precio. La prueba social rinde el doble pegada a la cifra, y por eso la
// 08 se cuela entre medio del orden narrativo (las dudas de la 10 vienen
// después). Si alguien mueve <Caso> de lugar en page.tsx, esto se pierde.
//
// LA COMPOSICIÓN ES UN TESTIMONIO CLÁSICO, una sola columna centrada:
// logo del lubricentro → cita grande → quién lo dice → los números.
// Sin tarjeta y sin fondo propio: el único objeto oscuro es el logo, que
// trae su propia placa grafito, y eso lo convierte en el ancla visual de
// la sección sin que hagamos nada.
//
// EL RESALTADO DE LA CITA se hace con peso y tinta —la cita en ink-60, el
// tramo clave en ink y bold—, nunca con color: el rojo acá es acción, y
// la itálica está prohibida en todo el sitio. El tramo resaltado es
// "un montón de planillas de Excel" porque es EL dolor textual del
// público según CLAUDE-landing, con esas mismas palabras.
//
// EL AVATAR ES UN MONOGRAMA, no una foto: no tenemos el retrato de Bruno
// todavía y una cara generada abajo del nombre de una persona real es
// exactamente el detalle que un prospecto huele (y el design system lo
// prohíbe). Cuando llegue la foto real, reemplaza al monograma en el
// mismo círculo y no se toca nada más.

// LA CITA VA TEXTUAL, no pulida: suena a un tipo hablando, y eso
// convierte. Comillas tipográficas “ ”, no las rectas del teclado.
//
// ⚠ ESTA ES LA ÚNICA FRASE DE BRUNO QUE ESTÁ REGISTRADA, y es de la
// entrevista: describe cómo estaba ANTES, no es un testimonio del
// producto. Cuando llegue su testimonio real —el spec pide autorización
// escrita para nombre, cita y números— se cambian estas tres constantes
// y nada más. No se le inventan palabras: es una persona con nombre y
// apellido que va a leer esta página.
const CITA_ANTES = "Tenía ";
const CITA_RESALTADA = "un montón de planillas de Excel";
const CITA_DESPUES = " y estaban todas desordenadas.";

// Los tres números salen de la instalación real, no de una proyección:
// 262 services cargados a mano en 15 días, en los dos locales. No hay
// importación en el producto, así que no hay nada "migrado" inflando la
// cifra — por eso el número exacto y no un "150+" redondeado.
const NUMEROS = [
  { cifra: "262", etiqueta: "services cargados" },
  { cifra: "15 días", etiqueta: "desde la instalación" },
  { cifra: "2", etiqueta: "sucursales funcionando" },
] as const;

export function Caso() {
  return (
    <section
      id="caso"
      // Sin heading visible: el título de esta sección es la cita, y una
      // cita entera como nombre de landmark es ilegible en un lector de
      // pantalla. El nombre corto va acá y no se inventa copy en pantalla.
      aria-label="El testimonio de Brothers Oil"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      <div className="contenedor">
        <figure className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* El logo con su placa grafito propia: sin marco ni radio
              nuestro encima. Es el logo de ellos, no una pieza nuestra. */}
          <Image
            src="/assets/logo-brothers-oil.webp"
            alt="Brothers Oil, lubricentro"
            width={1293}
            height={414}
            sizes="(min-width: 640px) 208px, 176px"
            className="h-auto w-44 sm:w-52"
          />

          {/* La cita, lo más grande de la sección. En <blockquote> y sin
              <cite>: el navegador inclina el <cite> por defecto y acá no
              hay una sola bastardilla en toda la página. */}
          <blockquote className="mt-10 sm:mt-12">
            <p className="text-balance text-h3 font-bold text-ink-60 sm:text-h2 lg:text-h1 lg:leading-[1.15]">
              {`“${CITA_ANTES}`}
              <span className="text-ink">{CITA_RESALTADA}</span>
              {`${CITA_DESPUES}”`}
            </p>
          </blockquote>

          {/* Quién lo dice. El círculo es el lugar de la foto real; hasta
              entonces, el monograma — tipografía de marca, nada de caras
              inventadas. */}
          <figcaption className="mt-10 flex flex-col items-center sm:mt-12">
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-full border border-line bg-surface text-lead font-bold text-ink"
            >
              BA
            </span>
            <p className="mt-4 text-lead font-bold text-ink">Bruno Albertini</p>
            <p className="mt-1 text-body text-ink-60">
              Fundador de Brothers Oil · Córdoba
            </p>
          </figcaption>
        </figure>

        {/* ---------- Los números ----------
            La prueba dura debajo de la prueba blanda, como ficha y no como
            tres tarjetas: una línea arriba, divisores entre columnas, cero
            cajas. En fila también en mobile — apilados pierden el efecto
            de tríada. */}
        <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-3 divide-x divide-line border-t border-line pt-8 sm:mt-16 sm:pt-10">
          {NUMEROS.map((n) => (
            <div key={n.etiqueta} className="px-1 text-center sm:px-4">
              {/* Cifra de marca: Nunito —la hereda del layout— Y tabular.
                  Baja un escalón abajo de 360px: a 25px "15 días" no entra
                  en un tercio de un iPhone SE y se parte en dos renglones,
                  y una cifra partida al lado de dos enteras desarma la
                  fila. */}
              <dt className="text-lead font-bold text-ink tabular-nums min-[360px]:text-h3 sm:text-h2">
                {n.cifra}
              </dt>
              <dd className="mt-1.5 text-pretty text-ui text-ink-60">
                {n.etiqueta}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
