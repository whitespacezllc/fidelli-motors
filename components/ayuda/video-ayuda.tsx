"use client";

import { Reproductor } from "@/components/ayuda/reproductor";
import { formatearDuracion, type VideoAyuda as Video } from "@/lib/ayuda/videos";
import type { LugarVideo } from "@/lib/ayuda/eventos";

// La tarjeta de un video con su reproductor adentro: miniatura y botón,
// el título y la duración en m:ss. Es la que va en la columna de cada
// paso del onboarding. En la solapa Ayuda las tarjetas abren el modal
// (TarjetaVideo) y en el modal el reproductor va solo.
//
// `etiquetaPlan` ("Plan Pro") va cuando el video muestra una función que
// el plan de la cuenta no incluye: en Basic, el paso 2 del onboarding es
// solo la vista previa, pero el video de Diseño de experiencia se ve igual.
export function VideoAyuda({
  video,
  lugar,
  etiquetaPlan = null,
  className = "",
}: {
  video: Video;
  lugar: LugarVideo;
  etiquetaPlan?: string | null;
  className?: string;
}) {
  return (
    <figure className={className}>
      <Reproductor video={video} lugar={lugar} />
      <figcaption className="mt-3">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-brand text-body font-bold text-ink">{video.titulo}</span>
          {video.youtubeId && (
            <span className="shrink-0 font-ui text-ui text-ink-60 tabular-nums">
              {formatearDuracion(video.duracion)}
            </span>
          )}
        </span>
        {etiquetaPlan && (
          <span className="mt-2 inline-block rounded-sm border border-line bg-surface px-1.5 py-px font-ui text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            {etiquetaPlan}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
