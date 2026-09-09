"use client";

import { useState } from "react";
import { IconoReproducir } from "@/components/iconos";
import { ModalVideo } from "@/components/ayuda/modal-video";
import {
  formatearDuracion,
  miniaturaYoutube,
  type VideoAyuda,
} from "@/lib/ayuda/videos";

// Una tarjeta de la solapa Ayuda: miniatura, título, duración y
// descripción. Un clic abre el modal con el video andando.
//
// Con el video en preparación la tarjeta es la misma pero no es un botón:
// no hay nada que reproducir y un botón que no hace nada enseña a no tocar.
// La etiqueta del plan va en ink-60 y sin candado: no es un bloqueo, es
// para que sepan qué hay.
export function TarjetaVideo({
  video,
  etiquetaPlan,
}: {
  video: VideoAyuda;
  /** "Plan Pro" / "Plan Ultra" cuando la función no está en el plan de la cuenta. */
  etiquetaPlan: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const listo = video.youtubeId !== null;

  const contenido = (
    <>
      <span className="relative block aspect-video w-full overflow-hidden rounded-md bg-surface">
        {listo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={miniaturaYoutube(video.youtubeId as string)}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform group-hover:scale-105 group-focus-visible:scale-105">
                <IconoReproducir weight="fill" aria-hidden className="ml-0.5 size-5" />
              </span>
            </span>
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-ui text-ui text-ink-60">
            Video en preparación
          </span>
        )}
      </span>
      <span className="mt-3 flex items-start justify-between gap-3">
        <span className="font-brand text-body font-bold text-ink">{video.titulo}</span>
        {listo && (
          <span className="shrink-0 pt-0.5 font-ui text-ui text-ink-60 tabular-nums">
            {formatearDuracion(video.duracion)}
          </span>
        )}
      </span>
      <span className="mt-1 block text-ui text-ink-60">{video.descripcion}</span>
      {etiquetaPlan && (
        <span className="mt-2.5 inline-block rounded-sm border border-line bg-surface px-1.5 py-px font-ui text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
          {etiquetaPlan}
        </span>
      )}
    </>
  );

  if (!listo) {
    return <li className="surface-card p-4">{contenido}</li>;
  }

  return (
    <li className="surface-card p-4 transition-colors hover:border-ink-40">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group block w-full text-left"
      >
        {contenido}
      </button>
      <ModalVideo
        videos={[video]}
        inicial={video.id}
        lugar="panel"
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      />
    </li>
  );
}
