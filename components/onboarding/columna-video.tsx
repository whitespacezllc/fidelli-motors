"use client";

import { useState } from "react";
import { IconoReproducir } from "@/components/iconos";
import { VideoAyuda } from "@/components/ayuda/video-ayuda";
import { formatearDuracion, type VideoAyuda as Video } from "@/lib/ayuda/videos";

// El video de cada paso. En escritorio va a la derecha del formulario,
// siempre visible; en un celular va arriba y plegado, con un botón que
// dice qué video es: el formulario es lo que importa y la pantalla es chica.
export function ColumnaVideo({ video }: { video: Video | null }) {
  const [abierto, setAbierto] = useState(false);

  if (!video) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-md border border-line bg-base px-3.5 text-left transition-colors hover:bg-surface lg:hidden"
      >
        <IconoReproducir aria-hidden className="size-5 shrink-0 text-ink-60" />
        <span className="min-w-0 flex-1 font-ui text-ui font-semibold text-ink">
          {abierto ? "Ocultar el video" : video.titulo}
        </span>
        <span className="shrink-0 font-ui text-label text-ink-60 tabular-nums">
          {video.youtubeId ? formatearDuracion(video.duracion) : "En preparación"}
        </span>
      </button>
      <div className={`${abierto ? "mt-3 block" : "hidden"} lg:block`}>
        <VideoAyuda video={video} lugar="onboarding" />
      </div>
    </div>
  );
}
