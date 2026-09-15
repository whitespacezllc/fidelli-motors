"use client";

import { useState } from "react";
import { CLASES, clasePorMarca } from "@/lib/clase-vehiculo";
import type { ClaseVehiculo } from "@/lib/renglones";

const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// La clase del vehículo, en el alta. Dos botones de 56px —el mecánico
// tiene los dedos con aceite— y un input oculto: los formularios que lo
// usan son de FormData y no cambian su contrato.
//
// Viene PRE-SELECCIONADA por la marca (Scania es camión sin ambigüedad;
// Ford arranca en Liviano) hasta que el mecánico toca un botón: desde ahí
// manda lo que eligió, cambie la marca o no. Al editar un vehículo con la
// clase ya guardada, manda la guardada; con la clase en null (nunca se
// preguntó), la marca sugiere igual — así los camiones cargados antes del
// sprint se marcan a medida que vuelven.
export function SelectorClase({
  marca,
  inicial = null,
}: {
  /** La marca que se está escribiendo en el formulario. */
  marca: string;
  /** La clase guardada, si la hay. */
  inicial?: ClaseVehiculo | null;
}) {
  const [elegida, setElegida] = useState<ClaseVehiculo | null>(inicial);
  const clase = elegida ?? clasePorMarca(marca);

  return (
    <fieldset>
      <legend className={CLASE_LABEL}>Clase de vehículo</legend>
      <input type="hidden" name="clase" value={clase} />
      <div className="grid grid-cols-2 gap-2">
        {CLASES.map((c) => {
          const activa = clase === c.valor;
          return (
            <button
              key={c.valor}
              type="button"
              aria-pressed={activa}
              onClick={() => setElegida(c.valor)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors ${
                activa
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-base text-ink-60 hover:bg-surface"
              }`}
            >
              <span className="font-brand text-body font-bold">
                {c.etiqueta}
              </span>
              <span
                className={`text-label ${activa ? "text-white/70" : "text-ink-40"}`}
              >
                {c.detalle}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
