"use client";

import { useState } from "react";
import { CLASES, clasePorMarca } from "@/lib/clase-vehiculo";
import type { ClaseVehiculo } from "@/lib/renglones";

const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

type Estado = "elegida" | "sugerida" | "ninguna";

// La clase del vehículo, en el alta y en la edición. Dos botones de 56px
// —el mecánico tiene los dedos con aceite— y un input oculto: los
// formularios que lo usan son de FormData y no cambian su contrato.
//
// UNA SUGERENCIA NO ES UNA RESPUESTA. Hasta que el mecánico toca un botón,
// la marca SUGIERE una clase (Scania es camión sin ambigüedad; Ford
// arranca en Liviano) y se ve como sugerida, distinta de la elegida: un
// toque la confirma. Lo que viaja en el input depende del modo:
//   · alta — la sugerencia viaja. Quien manda el formulario está dando de
//     alta el vehículo, y eso sí es una decisión.
//   · edición — la sugerencia NO viaja: el input va vacío, la acción lo
//     lee como null y no incluye la clase en el update. Así un camión
//     cargado antes del sprint se marca cuando alguien lo confirma, nunca
//     porque abrió el dialog para corregir el año. Con una clase ya
//     guardada, manda la guardada y la marca no opina.
export function SelectorClase({
  marca,
  inicial = null,
  modo = "alta",
}: {
  /** La marca que se está escribiendo en el formulario. */
  marca: string;
  /** La clase guardada, si la hay. */
  inicial?: ClaseVehiculo | null;
  modo?: "alta" | "edicion";
}) {
  const [elegida, setElegida] = useState<ClaseVehiculo | null>(inicial);
  const sugerida = elegida === null ? clasePorMarca(marca) : null;
  // "" = no se contestó: esClaseVehiculo("") es false y la acción lo lee
  // como null.
  const enviada = elegida ?? (modo === "alta" ? sugerida : null) ?? "";

  function estadoDe(valor: ClaseVehiculo): Estado {
    if (elegida === valor) return "elegida";
    if (sugerida === valor) return "sugerida";
    return "ninguna";
  }

  const CLASE_POR_ESTADO: Record<Estado, string> = {
    elegida: "border-ink bg-ink text-white",
    // Punteado y en tinta, sin relleno: se lee como propuesta, no como hecho.
    sugerida: "border-dashed border-ink bg-base text-ink hover:bg-surface",
    ninguna: "border-line bg-base text-ink-60 hover:bg-surface",
  };
  const DETALLE_POR_ESTADO: Record<Estado, string> = {
    elegida: "text-white/70",
    sugerida: "text-ink-60",
    ninguna: "text-ink-40",
  };

  return (
    <fieldset>
      <legend className={CLASE_LABEL}>Clase de vehículo</legend>
      <input type="hidden" name="clase" value={enviada} />
      <div className="grid grid-cols-2 gap-2">
        {CLASES.map((c) => {
          const estado = estadoDe(c.valor);
          return (
            <button
              key={c.valor}
              type="button"
              aria-pressed={estado === "elegida"}
              data-estado={estado}
              onClick={() => setElegida(c.valor)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors ${CLASE_POR_ESTADO[estado]}`}
            >
              <span className="font-brand text-body font-bold">
                {c.etiqueta}
              </span>
              <span className={`text-label ${DETALLE_POR_ESTADO[estado]}`}>
                {c.detalle}
              </span>
            </button>
          );
        })}
      </div>
      {sugerida && (
        <p className="mt-1.5 text-label text-ink-60">
          {modo === "alta"
            ? "Sugerida por la marca. Se guarda así si no la cambiás."
            : "Sugerida por la marca. Tocala para confirmarla; si no, queda sin contestar."}
        </p>
      )}
    </fieldset>
  );
}
