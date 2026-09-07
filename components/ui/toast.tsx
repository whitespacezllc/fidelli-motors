"use client";

import { useEffect, useRef } from "react";
import { IconoCerrar } from "@/components/iconos";

export type AvisoToast = {
  tipo: "ok" | "error";
  texto: string;
};

// El aviso flotante del panel. Existe para confirmar algo que pasó FUERA
// de la pantalla —una descarga que el navegador se llevó a su carpeta— y
// que ningún control de la página puede mostrar al lado del gesto. Para
// un error de formulario sigue valiendo la regla de siempre: el mensaje
// va junto al control que lo causó, no acá.
//
// Grafito con texto blanco, como los botones sobre fondo oscuro del
// sistema: ni el rojo de marca ni un color de estado. Se apaga solo (los
// errores duran más, para que se lleguen a leer) y también se cierra con
// un toque. En mobile flota por encima de la barra inferior; en desktop,
// abajo a la derecha.
export function Toast({
  aviso,
  alCerrar,
  duracionMs = 6000,
}: {
  aviso: AvisoToast;
  alCerrar: () => void;
  duracionMs?: number;
}) {
  // El cierre va en un ref para que un padre que re-renderiza con otra
  // función no reinicie la cuenta regresiva. Se actualiza en un efecto,
  // nunca durante el render.
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    const temporizador = setTimeout(
      () => cerrar.current(),
      aviso.tipo === "error" ? duracionMs * 1.5 : duracionMs,
    );
    return () => clearTimeout(temporizador);
  }, [aviso, duracionMs]);

  return (
    <div
      role={aviso.tipo === "error" ? "alert" : "status"}
      className="fixed inset-x-4 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-lg bg-ink py-2 pr-1 pl-4 text-ui text-inverso shadow-lg sm:inset-x-auto sm:right-6 sm:max-w-md lg:bottom-6"
    >
      <p className="min-w-0 flex-1 py-1.5 break-words tabular-nums">{aviso.texto}</p>
      <button
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar aviso"
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-inverso-60 transition-colors hover:text-inverso"
      >
        <IconoCerrar className="size-5" />
      </button>
    </div>
  );
}
