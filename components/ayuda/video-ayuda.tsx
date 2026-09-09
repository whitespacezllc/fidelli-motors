"use client";

import { Reproductor } from "@/components/ayuda/reproductor";
import { formatearDuracion, type VideoAyuda as Video } from "@/lib/ayuda/videos";
import type { LugarVideo } from "@/lib/ayuda/eventos";

// La tarjeta de un video con su reproductor adentro: miniatura y botón,
// el título y la duración en m:ss. Es la que va en la columna de cada
// paso del onboarding. En la solapa Ayuda las tarjetas abren el modal
// (TarjetaVideo) y en el modal el reproductor va solo.
export function VideoAyuda({
  video,
  lugar,
  className = "",
}: {
  video: Video;
  lugar: LugarVideo;
  className?: string;
}) {
  return (
    <figure className={className}>
      <Reproductor video={video} lugar={lugar} />
      <figcaption className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-brand text-body font-bold text-ink">{video.titulo}</span>
        {video.youtubeId && (
          <span className="shrink-0 font-ui text-ui text-ink-60 tabular-nums">
            {formatearDuracion(video.duracion)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
