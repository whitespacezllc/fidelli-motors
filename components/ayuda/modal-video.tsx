"use client";

import { useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { IconoCerrar, IconoReproducir } from "@/components/iconos";
import { Reproductor } from "@/components/ayuda/reproductor";
import {
  formatearDuracion,
  miniaturaYoutube,
  type VideoAyuda,
} from "@/lib/ayuda/videos";
import type { LugarVideo } from "@/lib/ayuda/eventos";

// El modal de un video: se abre con el video ya reproduciéndose —el clic
// fue en la tarjeta, no se pide otro— y se cierra con la X, Escape o un
// clic afuera. Al cerrar, Radix desmonta el contenido y con él el iframe:
// la reproducción se detiene sola, sin hablarle a YouTube.
//
// Sobre los mismos primitivos de Radix que el Dialog del sistema (foco
// atrapado, Escape, scroll lock, aria) pero con otra caja: un video
// necesita ancho, y en un celular ocupa todo el ancho con 16px de margen
// en vez de la hoja pegada abajo de los formularios.
//
// Con varios videos —"¿Cómo se usa?" en una solapa con más de uno— el
// primero se reproduce y los otros quedan listados debajo: tocar uno lo
// pasa al reproductor.
export function ModalVideo({
  videos,
  inicial,
  lugar,
  abierto,
  alCerrar,
}: {
  videos: readonly VideoAyuda[];
  /** El id del video con el que se abre. */
  inicial: string;
  lugar: LugarVideo;
  abierto: boolean;
  alCerrar: () => void;
}) {
  const [actualId, setActualId] = useState(inicial);
  // Si cambia el video pedido (otra tarjeta), el actual lo sigue: se ajusta
  // durante el render, sin efecto.
  const [inicialVisto, setInicialVisto] = useState(inicial);
  if (inicial !== inicialVisto) {
    setInicialVisto(inicial);
    setActualId(inicial);
  }

  const actual = videos.find((v) => v.id === actualId) ?? videos[0];
  if (!actual) return null;
  const otros = videos.filter((v) => v.id !== actual.id);

  return (
    <RadixDialog.Root
      open={abierto}
      onOpenChange={(sigueAbierto) => {
        if (!sigueAbierto) {
          // La próxima apertura arranca por el video pedido, no por el
          // último que quedó puesto.
          setActualId(inicial);
          alCerrar();
        }
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <RadixDialog.Content className="fixed inset-x-4 top-1/2 z-50 max-h-[92dvh] -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-base p-4 shadow-lg focus:outline-none sm:inset-x-auto sm:left-1/2 sm:w-[min(calc(100vw-2rem),52rem)] sm:-translate-x-1/2 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <RadixDialog.Title className="font-brand text-lead font-bold text-ink">
                {actual.titulo}
              </RadixDialog.Title>
              <RadixDialog.Description className="mt-0.5 text-ui text-ink-60">
                {actual.descripcion}
                {actual.youtubeId && (
                  <span className="tabular-nums"> · {formatearDuracion(actual.duracion)}</span>
                )}
              </RadixDialog.Description>
            </div>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="-mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-40 hover:text-ink-60"
            >
              <IconoCerrar className="size-5" />
            </RadixDialog.Close>
          </div>

          {/* `key` para que cambiar de video remonte el reproductor y arranque
              solo, igual que al abrir. */}
          <Reproductor key={actual.id} video={actual} lugar={lugar} reproducirAlMontar />

          {otros.length > 0 && (
            <ul className="mt-5 flex flex-col divide-y divide-line border-t border-line">
              {otros.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActualId(v.id)}
                    className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface/60"
                  >
                    <span className="relative flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface">
                      {v.youtubeId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={miniaturaYoutube(v.youtubeId)}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : null}
                      {v.youtubeId && (
                        <span className="relative flex size-7 items-center justify-center rounded-full bg-brand text-white">
                          <IconoReproducir weight="fill" aria-hidden className="ml-px size-3.5" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-brand text-ui font-bold text-ink">
                        {v.titulo}
                      </span>
                      <span className="block text-label text-ink-60">
                        {v.youtubeId ? v.descripcion : "Video en preparación"}
                      </span>
                    </span>
                    {v.youtubeId && (
                      <span className="shrink-0 font-ui text-label text-ink-60 tabular-nums">
                        {formatearDuracion(v.duracion)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
