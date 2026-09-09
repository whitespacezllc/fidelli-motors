"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { IconoReproducirLanding } from "@/components/iconos";
import { videoDeFuncion } from "@/lib/ayuda/videos";

// El modal se trae solo cuando hay un ícono que lo abra: hoy, con todos
// los IDs en null, la landing no carga ni un byte de esto.
const ModalVideo = dynamic(
  () => import("@/components/ayuda/modal-video").then((m) => m.ModalVideo),
  { ssr: false },
);

// El ícono de "ver cómo funciona" al lado de una función de la sección de
// precios que tiene video (patrón Pedix). 16px en ink-40, rojo al pasar.
//
// SOLO EXISTE SI EL VIDEO TIENE ID. Sin ID no se renderiza nada: la
// landing no puede tener botones muertos, y así con la lista entera en
// null la sección queda píxel por píxel como estaba.
//
// VA EN ABSOLUTO, AL BORDE DERECHO DE LA FILA, para no mover el texto ni
// cambiar el alto de la fila: no ocupa lugar en el flujo. La fila lleva
// `relative`. El área de toque es de 44px aunque el ícono mida 16.
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
  const video = videoDeFuncion(funcion);

  if (!video) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ver cómo funciona: ${funcion}`}
        className={`absolute top-1/2 -right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:text-brand focus-visible:text-brand ${
          oscuro ? "text-inverso-40" : "text-ink-40"
        }`}
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
