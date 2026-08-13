"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconoPremio } from "@/components/iconos";

// 07 · La escena de Fidelliza — el personaje y la tarjeta de progreso.
//
// SON UNA SOLA ESCENA, no dos piezas: la tarjeta se apoya sobre la esquina
// de abajo del personaje y, cuando el premio se desbloquea, el personaje
// pega un salto. Por eso viven en el mismo componente — el rebote y el
// contador salen del mismo estado. Separados harían falta dos estados
// hablando entre sí, que es la forma más rápida de que se desincronicen.
//
// El texto de la sección entra como `children` y se ubica en el medio del
// DOM a propósito: en mobile el orden es personaje → texto → tarjeta, y
// los tres son hijos directos de la grilla. Envolviendo personaje y
// tarjeta en un div, el texto no podía quedar en el medio.
//
// LA ANIMACIÓN SOLO CORRE EN PANTALLA. Fuera de vista se pausa: son ocho
// segundos y medio en loop y esto se mira desde un celular.
//
// CON prefers-reduced-motion NO SE MUEVE NADA: el personaje queda quieto y
// la tarjeta se congela en "Vas 4 de 5 services" — un paso antes del
// premio, que es el estado que mejor cuenta de qué se trata sin moverse.

const META = 5;
const MS_POR_PASO = 1200;
// El premio se sostiene: es el momento que importa, el resto es la tensión
// previa. Ciclo completo = 5 × 1200 + 2500 = 8500 ms.
const MS_PREMIO = 2500;
// Un paso antes del premio: lo que se ve si no hay animación.
const PASO_QUIETO = 4;

export function EscenaFidelliza({ children }: { children: React.ReactNode }) {
  const [paso, setPaso] = useState(0);
  const [enPantalla, setEnPantalla] = useState(false);
  const [reducido, setReducido] = useState(false);
  const escena = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducido(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const nodo = escena.current;
    if (!nodo) return;
    const observer = new IntersectionObserver(
      ([entrada]) => setEnPantalla(entrada.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(nodo);
    return () => observer.disconnect();
  }, []);

  // El reloj del contador. Sin intervalo: un timeout por paso, que además
  // deja que el último dure distinto. Al salir de pantalla no se agenda
  // nada y el ciclo queda donde estaba; al volver, sigue de ahí.
  useEffect(() => {
    if (!enPantalla || reducido) return;
    const espera = paso >= META ? MS_PREMIO : MS_POR_PASO;
    const t = setTimeout(
      () => setPaso((p) => (p >= META ? 0 : p + 1)),
      espera,
    );
    return () => clearTimeout(t);
  }, [paso, enPantalla, reducido]);

  const mostrado = reducido ? PASO_QUIETO : paso;
  const premio = mostrado >= META;
  const faltan = META - mostrado;
  const animar = enPantalla && !reducido;

  return (
    <div
      ref={escena}
      className="contenedor grid items-center gap-10 lg:grid-cols-2 lg:gap-x-14"
    >
      {/* 1 · El personaje. En mobile va arriba de todo y reducido; en
          desktop ocupa la columna derecha y la tarjeta se le apoya encima.

          Dos divs anidados y no uno: el de afuera respira siempre, el de
          adentro pega el salto del desbloqueo. Con las dos animaciones en
          el mismo elemento, la segunda pisaba a la primera. */}
      <div className="mx-auto w-full max-w-[11rem] sm:max-w-[13rem] lg:col-start-2 lg:row-start-1 lg:max-w-[20rem]">
        <div className={animar ? "animar-flotar" : undefined}>
          <div className={animar && premio ? "animar-rebote" : undefined}>
            <Image
              src="/assets/fidelli-motors-tipo.webp"
              alt="El personaje de Fidelli Motors saludando."
              width={1500}
              height={2225}
              sizes="(min-width: 1024px) 20rem, 13rem"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>

      {/* 2 · El texto de la sección, en el medio del orden de mobile. */}
      {children}

      {/* 3 · La tarjeta de progreso. En desktop comparte celda con el
          personaje —misma columna y misma fila— y se ancla abajo a la
          izquierda, corrida hacia afuera para que se lea apoyada sobre él
          y no adentro de su caja. El corrimiento entra en el gap de la
          grilla, así que no invade la columna del texto.

          La sombra está permitida acá: es un elemento flotando sobre otro,
          que es la única excepción que el design system admite. */}
      <div className="lg:col-start-2 lg:row-start-1 lg:w-[19rem] lg:-translate-x-10 lg:translate-y-8 lg:self-end lg:justify-self-start">
        <div
          className={`rounded-lg border bg-base p-5 transition-colors sm:p-6 lg:shadow-lg ${
            premio ? "border-reward bg-reward-soft" : "border-line"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-lead font-bold tabular-nums">
              Vas {mostrado} de {META} services
            </p>
            <p className="text-ui text-ink-60 tabular-nums">
              {premio
                ? "¡completaste el ciclo!"
                : faltan === 1
                  ? "falta 1"
                  : `faltan ${faltan}`}
            </p>
          </div>

          {/* La barra en GRAFITO, también con el premio puesto: es
              progreso, no acción, y el rojo no comunica estado. El ancho
              va con transición para que acompañe en vez de saltar. */}
          <div
            role="presentation"
            className="mt-3 h-2.5 overflow-hidden rounded-sm border border-line bg-surface"
          >
            <div
              className="h-full rounded-sm bg-ink transition-[width] duration-500 ease-out"
              style={{ width: `${(mostrado / META) * 100}%` }}
            />
          </div>

          {/* El dorado es del trofeo y de nadie más: es el único amarillo
              del sistema y significa premio en todo el producto. */}
          <p className="mt-4 flex gap-2.5 text-body text-ink-60">
            <IconoPremio
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-reward"
            />
            <span>
              {premio ? (
                <span className="font-bold text-ink">
                  ¡Premio! El quinto service, con 40% de descuento.
                </span>
              ) : (
                <>
                  El quinto, con{" "}
                  <span className="font-bold text-ink">40% de descuento</span>.
                </>
              )}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
