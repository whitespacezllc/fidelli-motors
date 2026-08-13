"use client";

import { useEffect, useRef } from "react";

// Un video de la sección 04: el producto andando, en loop y sin sonido.
//
// SIN CONTROLES Y SIN ESTADO. No hay play/pausa: el clip corre solo
// mientras se ve y no se manipula. Por eso el componente no guarda nada —
// el observer le habla al elemento directo.
//
// SOLO CORRE MIENTRAS SE VE. Son tres videos en la misma página y el
// público mira desde un celular viejo: dejarlos reproduciéndose fuera de
// pantalla es gastar batería y datos en algo que nadie está mirando.
//
// `preload="none"`: el archivo ni se pide hasta que hace falta. Lo que se
// ve mientras tanto es el póster, que es el primer frame REAL del video
// (scripts/posters-videos.mjs) — así el arranque no salta.
//
// CON prefers-reduced-motion NO ARRANCA NUNCA: queda el póster, que es un
// cuadro del propio video, así que la fila no pierde nada. Al no haber
// botón de pausa, esta es la única salida que le queda a quien pidió menos
// movimiento — por eso se escucha el `change` del media query y no se
// consulta una sola vez al montar: si cambia la preferencia con la página
// abierta, los videos se frenan ahí mismo.
export function VideoFeature({
  src,
  poster,
  alt,
  encuadre = "object-center",
}: {
  /** Sin extensión: se le agrega .mp4. */
  src: string;
  poster: string;
  /** Qué se ve en el clip. Es el texto alternativo del video. */
  alt: string;
  /** object-position, para recortar lo que el archivo traiga de más. */
  encuadre?: string;
}) {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const nodo = video.current;
    if (!nodo) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;

    const aplicar = () => {
      observer?.disconnect();
      observer = null;

      if (mq.matches) {
        nodo.pause();
        return;
      }

      observer = new IntersectionObserver(
        ([entrada]) => {
          // El play puede rechazar —una pestaña en segundo plano, batería
          // baja— y no hay nada que hacer al respecto: queda el póster.
          if (entrada.isIntersecting) nodo.play().catch(() => {});
          else nodo.pause();
        },
        // 0.35: que entre bien en pantalla antes de arrancar, no apenas
        // asoma un borde.
        { threshold: 0.35 },
      );
      observer.observe(nodo);
    };

    aplicar();
    mq.addEventListener("change", aplicar);
    return () => {
      observer?.disconnect();
      mq.removeEventListener("change", aplicar);
    };
  }, []);

  return (
    <video
      ref={video}
      src={`${src}.mp4`}
      poster={poster}
      aria-label={alt}
      muted
      loop
      playsInline
      preload="none"
      className={`size-full object-cover ${encuadre}`}
    />
  );
}
