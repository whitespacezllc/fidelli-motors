"use client";

import { useState } from "react";
import { FormNota } from "@/components/notas/form-nota";

// El momento natural de escribir "las cubiertas están para cambio" es
// recién terminado el service, no después navegando a la ficha. Pero es
// DESPUÉS de confirmar, fuera de los 90 segundos: colapsado, opcional,
// ignorable sin fricción — nunca un paso más del flujo.
export function NotaPostGuardado({
  vehiculoId,
  primerNombre,
}: {
  vehiculoId: string;
  primerNombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardada, setGuardada] = useState(false);

  if (guardada) {
    return (
      <p className="mt-4 rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
        ✓ Nota guardada. {primerNombre} la va a ver en su cartón — y la tenés
        en su ficha.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-4 min-h-11 w-full rounded-lg border border-dashed border-line px-4 py-3 text-left text-ui text-ink-60 transition-colors hover:bg-surface"
      >
        <span className="font-semibold text-ink">
          ¿Querés dejarle una nota a {primerNombre}?
        </span>{" "}
        Algo del auto para la próxima — cubiertas, frenos, una pérdida. La ve
        en su cartón.
      </button>
    );
  }

  return (
    <div className="surface-card mt-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-brand text-body font-bold text-ink">
          Nota del vehículo
        </p>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="min-h-9 px-2 text-ui font-semibold text-ink-60"
        >
          Ahora no
        </button>
      </div>
      <FormNota vehiculoId={vehiculoId} alGuardar={() => setGuardada(true)} />
    </div>
  );
}
