"use client";

import { useEffect, useState } from "react";
import { IconoReproducir } from "@/components/iconos";
import {
  miniaturaYoutube,
  urlEmbedYoutube,
  type VideoAyuda,
} from "@/lib/ayuda/videos";
import { registrarReproduccion, type LugarVideo } from "@/lib/ayuda/eventos";

// El reproductor de un video de ayuda. Uno solo para el panel, el
// onboarding y la landing.
//
// SIN IFRAME HASTA EL CLIC. Lo que se ve primero es la miniatura que
// YouTube publica del video con un botón de reproducir propio; recién al
// tocarlo se inserta el iframe de youtube-nocookie.com con autoplay. Así
// ninguna página carga JavaScript de YouTube hasta que alguien quiere ver
// un video — y la landing, que la mira gente desde un celular viejo, no
// paga nada por tener videos.
//
// SIN ID NO HAY MINIATURA NI BOTÓN: la misma caja, con "Video en
// preparación". Es un estado de diseño, no un error: los IDs se pegan en
// lib/ayuda/videos.ts a medida que los videos existen.
export function Reproductor({
  video,
  lugar,
  reproducirAlMontar = false,
  className = "",
}: {
  video: VideoAyuda;
  lugar: LugarVideo;
  /** Dentro del modal: el clic ya fue en la tarjeta, no se pide otro. */
  reproducirAlMontar?: boolean;
  className?: string;
}) {
  const [reproduciendo, setReproduciendo] = useState(
    reproducirAlMontar && video.youtubeId !== null,
  );

  // El evento sale cuando el iframe entra, sea por el clic o por abrir el
  // modal: las dos son "alguien quiso ver este video".
  useEffect(() => {
    if (reproduciendo) registrarReproduccion(video.id, lugar);
  }, [reproduciendo, video.id, lugar]);

  const caja = `relative aspect-video w-full overflow-hidden rounded-lg ${className}`;

  if (!video.youtubeId) {
    return (
      <div
        className={`${caja} flex items-center justify-center border border-line bg-surface`}
        role="img"
        aria-label={`${video.titulo}: video en preparación`}
      >
        <span className="font-ui text-ui text-ink-60">Video en preparación</span>
      </div>
    );
  }

  if (reproduciendo) {
    return (
      <div className={`${caja} bg-ink`}>
        <iframe
          src={urlEmbedYoutube(video.youtubeId)}
          title={video.titulo}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setReproduciendo(true)}
      aria-label={`Reproducir: ${video.titulo}`}
      className={`${caja} group block bg-ink`}
    >
      {/* hqdefault es 4:3 con bandas negras arriba y abajo: object-cover
          las recorta y deja el cuadro 16:9 del video. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={miniaturaYoutube(video.youtubeId)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        {/* El círculo rojo con el triángulo blanco: la única acción de la
            tarjeta, en el color de acción. */}
        <span className="flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform group-hover:scale-105 group-focus-visible:scale-105">
          <IconoReproducir weight="fill" aria-hidden className="ml-0.5 size-6" />
        </span>
      </span>
    </button>
  );
}
