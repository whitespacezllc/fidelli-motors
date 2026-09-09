"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { IconoReproducir } from "@/components/iconos";
import { ModalVideo } from "@/components/ayuda/modal-video";
import { videosDeSolapa } from "@/lib/ayuda/videos";

// "¿Cómo se usa?" — el botón terciario de la cabecera de cada solapa que
// tiene videos. Vive dentro de CabeceraSeccion, así que está en la misma
// posición en todas: a la derecha del título, antes de la acción primaria.
//
// Qué videos mostrar lo decide la ruta (usePathname contra `solapa` de la
// lista): las pantallas no tienen que declarar nada, y una solapa sin
// videos no muestra el botón. Con un solo video, el modal abre con él;
// con varios, con el primero y el resto listado debajo del reproductor.
//
// En un celular queda solo el ícono, con el texto en aria-label: la
// cabecera comparte la fila con Exportar y el botón primario.
export function BotonComoSeUsa() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const videos = videosDeSolapa(ruta);

  if (videos.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="¿Cómo se usa?"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 font-ui text-ui font-semibold text-ink-60 transition-colors hover:bg-surface hover:text-ink sm:px-2.5"
      >
        <IconoReproducir aria-hidden className="size-5 shrink-0" />
        <span className="hidden sm:inline">¿Cómo se usa?</span>
      </button>
      <ModalVideo
        videos={videos}
        inicial={videos[0].id}
        lugar="panel"
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
      />
    </>
  );
}
