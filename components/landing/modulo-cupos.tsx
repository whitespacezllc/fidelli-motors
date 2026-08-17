"use client";

import { useEffect, useRef, useState } from "react";
import { CUPOS } from "@/lib/landing";

// La escasez, dicha con una barra y no con un párrafo. Reemplazó al texto
// de capacidad ("No activamos un lubricentro a distancia…"): el módulo
// muestra el mes, cuánto queda y por qué hay un límite, en cuatro líneas.
//
// ⚠ REGLA CONDICIONAL — NO ES UN BUG, NO LA BORRES:
// la barra y los números se muestran SOLO con `tomados >= 2`. Una barra
// casi vacía no comunica escasez: comunica que nadie está comprando. Los
// primeros días de cada mes juegan en contra si mostramos el número —
// hasta la segunda venta, queda únicamente el subtexto.
//
// La ÚNICA animación con información de la página: el relleno crece de 0
// a su valor al entrar en viewport, 700ms. Con prefers-reduced-motion va
// directo al valor final.
//
// Cuando queda 1 lugar o ninguno, el relleno pasa a la escala ámbar
// (--color-urgente). NUNCA rojo: es un estado, y los estados no usan el
// rojo de marca.
export function ModuloCupos() {
  const restantes = CUPOS.total - CUPOS.tomados;
  const [lleno, setLleno] = useState(false);
  const barra = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const llenar = () => setLleno(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      llenar();
      return;
    }
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        llenar();
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (CUPOS.tomados < 2) {
    return (
      <div className="rounded-lg bg-surface px-5 py-5 sm:px-6">
        <p className="text-ui text-ink-40">
          Instalamos en tu local, en persona.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-surface px-5 py-5 sm:px-6">
      <p className="font-ui text-label font-semibold tracking-[0.08em] text-ink-60 uppercase">
        {CUPOS.mes}
      </p>

      <div
        ref={barra}
        role="presentation"
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${
            restantes <= 1 ? "bg-urgente" : "bg-ink"
          }`}
          style={{ width: lleno ? `${(CUPOS.tomados / CUPOS.total) * 100}%` : "0%" }}
        />
      </div>

      <p className="mt-3 text-body font-semibold text-ink tabular-nums">
        Quedan {restantes} de {CUPOS.total} lugares.
      </p>
      <p className="mt-1 text-ui text-ink-40">
        Instalamos en tu local, en persona.
      </p>
    </div>
  );
}
