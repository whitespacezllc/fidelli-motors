"use client";

import { useActionState } from "react";

export type EstadoToggle = { error?: string; ok?: boolean };

const ESTADO_INICIAL: EstadoToggle = {};

// Toggle de activo/inactivo sobre un Server Action. Inmediato y sin
// confirmación: apagar algo es reversible y de bajo riesgo.
//
// Si la acción rechaza el cambio por una regla de negocio (por ejemplo, la
// última sucursal activa), el mensaje aparece al lado del control que lo
// causó, no en un toast lejos del gesto.
export function ToggleEstado({
  id,
  activo,
  etiqueta,
  // El género lo pone quien llama: "Sucursal Norte: activa", "Filtro W712: activo".
  palabras = { activo: "activo", inactivo: "inactivo" },
  accion,
}: {
  id: string;
  activo: boolean;
  etiqueta: string;
  palabras?: { activo: string; inactivo: string };
  accion: (prev: EstadoToggle, formData: FormData) => Promise<EstadoToggle>;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activar" value={String(!activo)} />
      <button
        type="submit"
        role="switch"
        aria-checked={activo}
        aria-label={`${etiqueta}: ${activo ? palabras.activo : palabras.inactivo}`}
        disabled={pendiente}
        className="flex h-11 w-12 items-center justify-center disabled:opacity-60"
      >
        <span
          className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
            activo ? "bg-ink" : "bg-line"
          }`}
        >
          <span
            className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
              activo ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </button>
      {estado.error && (
        <p role="alert" className="max-w-52 text-right text-label text-overdue">
          {estado.error}
        </p>
      )}
    </form>
  );
}
