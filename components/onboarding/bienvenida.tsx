"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { marcarBienvenidaVista } from "@/app/panel/onboarding/actions";

// ============================================================
// La bienvenida: el último paso se completó, y solo esa vez.
//
// Un telón blanco sobre el panel, menos de tres segundos, y se levanta. La
// coreografía es CSS (globals.css · "La bienvenida"): el isotipo, el
// wordmark que sale de atrás, el texto, y las solapas de la navegación que
// se desbloquean de arriba hacia abajo cuando el telón sube. Todo arranca
// con el pintado, así que va sincronizado sin temporizadores.
//
// Este componente hace tres cosas: marca la bienvenida como vista apenas
// se muestra (un campo del taller: recargar a mitad no la repite), salta
// todo a su estado final con un clic, y se retira del DOM al terminar.
//
// Con prefers-reduced-motion no hay coreografía: la misma pieza queda como
// una tarjeta quieta —logo, texto y el botón— hasta que se toca.
// ============================================================

const DURACION_MS = 3200;

export function Bienvenida({ nombre }: { nombre: string }) {
  const [visible, setVisible] = useState(true);

  const terminar = useCallback(() => {
    document.documentElement.dataset.bienvenida = "lista";
    setVisible(false);
  }, []);

  useEffect(() => {
    void marcarBienvenidaVista();
    document.documentElement.dataset.bienvenida = "en-curso";

    // Con movimiento reducido la tarjeta se queda hasta que la toquen.
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const temporizador = reducido ? null : setTimeout(terminar, DURACION_MS);

    return () => {
      if (temporizador) clearTimeout(temporizador);
      document.documentElement.dataset.bienvenida = "lista";
    };
  }, [terminar]);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      onClick={terminar}
      className="bienvenida-telon fixed inset-0 z-[70] flex items-center justify-center bg-base px-6"
    >
      <div className="flex max-w-lg flex-col items-center text-center motion-reduce:surface-card motion-reduce:px-8 motion-reduce:py-10">
        <div className="flex items-center gap-4 sm:gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-512.png"
            alt=""
            width={96}
            height={96}
            className="bienvenida-isotipo size-20 shrink-0 sm:size-24"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logos/logo-negro_bordo.webp"
            alt="Fidelli Motors"
            width={1000}
            height={127}
            className="bienvenida-wordmark h-7 w-auto sm:h-9"
          />
        </div>

        <div className="bienvenida-texto mt-8">
          <p className="font-brand text-h3 font-bold text-balance text-ink sm:text-h2">
            Bienvenido, {nombre}.
          </p>
          <p className="mt-2 font-brand text-body text-ink-60">
            Tu lubricentro ya está en Fidelli.
          </p>
        </div>

        {/* Solo con movimiento reducido: la tarjeta quieta lleva el botón.
            Las clases del primario van escritas y no con clasesBoton(): esa
            trae `inline-flex`, que le gana a `hidden`, y el botón se veía
            también en la animación. */}
        <Link
          href="/panel/services/nuevo"
          className="mt-8 hidden h-12 items-center justify-center gap-1.5 rounded-md bg-brand px-5 font-brand text-body font-bold text-white transition-colors hover:bg-brand-deep motion-reduce:inline-flex"
        >
          Cargar mi primer trabajo
        </Link>
      </div>
    </div>
  );
}
