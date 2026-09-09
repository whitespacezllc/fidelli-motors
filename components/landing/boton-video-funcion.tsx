"use client";

import { useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { IconoReproducirLanding } from "@/components/iconos";
import { videoDeFuncion } from "@/lib/ayuda/videos";

// El modal se trae solo cuando hay un ícono que lo abra: sin videos con
// ID, la landing no carga ni un byte de esto.
const ModalVideo = dynamic(
  () => import("@/components/ayuda/modal-video").then((m) => m.ModalVideo),
  { ssr: false },
);

// El ícono de "ver cómo funciona" al lado de una función de la sección de
// precios que tiene video (patrón Pedix). 16px en ink-40, rojo al pasar.
//
// SOLO EXISTE SI EL VIDEO TIENE ID. Sin ID no se renderiza nada: la
// landing no puede tener botones muertos.
//
// VA EN ABSOLUTO para no mover el texto ni cambiar el alto de la fila: no
// ocupa lugar en el flujo, y la fila lleva `relative`. Dónde queda lo
// decide una medición después de montar: justo después de donde termina
// el texto, en su última línea, como un ícono en línea pero sin serlo. Si
// ahí no entra —una fila de una sola línea que llega hasta el borde—, cae
// al margen de la tarjeta, afuera de la caja del texto. Con un `right: 0`
// fijo, en las filas largas el ícono pisaba las últimas letras.
//
// Hasta que se mide, el botón está pero invisible: un ícono que salta de
// lugar al cargar se nota más que uno que aparece. El área de toque es de
// 44px aunque el ícono mida 16.

const ICONO = 16;
const CAJA = 44;
/** Aire entre el final del texto y el ícono. */
const AIRE = 8;
/** Cuánto puede salirse de la fila, hacia la derecha, si no hay lugar. */
const MARGEN = 4;

type Posicion = { left: number; top: number };

function posicionDelIcono(fila: HTMLElement): Posicion | null {
  const nodos = [...fila.childNodes].filter(
    (n): n is Text => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "",
  );
  if (nodos.length === 0) return null;

  // La última línea del texto: donde termina de leerse.
  const rango = document.createRange();
  rango.selectNodeContents(nodos[nodos.length - 1]);
  const lineas = [...rango.getClientRects()].filter((r) => r.width > 0);
  if (lineas.length === 0) return null;
  const ultima = lineas[lineas.length - 1];

  const caja = fila.getBoundingClientRect();
  const entra = caja.right + MARGEN - ultima.right >= AIRE + ICONO;
  const left = entra ? ultima.right + AIRE : caja.right + MARGEN;

  return {
    left: left - caja.left,
    top: ultima.top + ultima.height / 2 - caja.top,
  };
}

export function BotonVideoFuncion({
  funcion,
  oscuro = false,
}: {
  /** El texto exacto de la función, tal como se ve. */
  funcion: string;
  /** Sobre la tarjeta grafito de Pro. */
  oscuro?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const video = videoDeFuncion(funcion);

  useLayoutEffect(() => {
    const fila = ref.current?.parentElement;
    if (!fila) return;

    const medir = () => setPosicion(posicionDelIcono(fila));
    medir();
    // Las fuentes cambian el largo del texto; el ancho, dónde corta.
    document.fonts?.ready.then(medir);
    const observador = new ResizeObserver(medir);
    observador.observe(fila);
    return () => observador.disconnect();
  }, [video]);

  if (!video) return null;

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ver cómo funciona: ${funcion}`}
        style={
          posicion
            ? {
                left: posicion.left - (CAJA - ICONO) / 2,
                top: posicion.top - CAJA / 2,
              }
            : undefined
        }
        className={`absolute flex size-11 items-center justify-center rounded-md transition-colors hover:text-brand focus-visible:text-brand ${
          posicion ? "" : "invisible"
        } ${oscuro ? "text-inverso-40" : "text-ink-40"}`}
      >
        <IconoReproducirLanding
          aria-hidden
          strokeWidth={2}
          className="size-4 fill-current"
        />
      </button>
      {abierto && (
        <ModalVideo
          videos={[video]}
          inicial={video.id}
          lugar="landing"
          abierto
          alCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
