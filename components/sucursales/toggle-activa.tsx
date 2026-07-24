"use client";

import { useActionState } from "react";
import {
  toggleSucursal,
  type EstadoSucursal,
} from "@/app/panel/sucursales/actions";

const ESTADO_INICIAL: EstadoSucursal = {};

// Toggle inmediato, sin confirmación: es reversible y de bajo riesgo.
// La regla de "última activa" la valida el Server Action y el error se
// muestra acá abajo, junto al control que lo causó.
export function ToggleActiva({
  id,
  nombre,
  activa,
}: {
  id: string;
  nombre: string;
  activa: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    toggleSucursal,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activar" value={String(!activa)} />
      <button
        type="submit"
        role="switch"
        aria-checked={activa}
        aria-label={`${nombre}: ${activa ? "activa" : "inactiva"}`}
        disabled={pendiente}
        className="flex h-11 w-12 items-center justify-center disabled:opacity-60"
      >
        <span
          className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
            activa ? "bg-ink" : "bg-line"
          }`}
        >
          <span
            className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
              activa ? "translate-x-4" : "translate-x-0"
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
