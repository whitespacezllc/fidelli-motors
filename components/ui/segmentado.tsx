"use client";

import { useId } from "react";

// El control segmentado del panel: elegir UNA opción de dos a cinco, con
// cambio inmediato. Nace para el selector de período de los gráficos y
// reemplaza a las tres implementaciones ad-hoc que había con estas mismas
// clases copiadas (el pulso, el tab-datos de la ficha y el filtro de
// atención usan <Link>; esas siguen siendo navegación y están bien así —
// esto es para estado de cliente).
//
// ES UN RADIOGROUP DE VERDAD — fieldset con radios nativos—, no botones
// con role: los nativos traen gratis la navegación con flechas, el único
// tab stop del grupo y la semántica de "elegí uno". El input va estirado
// sobre la pastilla (absolute inset-0, no sr-only) para que el
// :focus-visible global dibuje el anillo alrededor de la pastilla entera
// y no de un punto de 1px. La técnica es la de selector-plan.tsx de la
// landing; la paleta es la del panel.
export function Segmentado<Clave extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  /** Para el lector de pantalla; no se ve. */
  etiqueta: string;
  opciones: readonly { clave: Clave; nombre: string }[];
  valor: Clave;
  alCambiar: (clave: Clave) => void;
}) {
  // Único en el documento: dos segmentados en la misma pantalla no pueden
  // compartir name o los radios se pisan entre grupos.
  const grupo = useId();

  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">{etiqueta}</legend>
      {opciones.map((opcion) => {
        const activa = opcion.clave === valor;
        return (
          <label
            key={opcion.clave}
            className={`relative flex h-9 cursor-pointer items-center rounded-md px-3 font-ui text-ui font-semibold transition-colors ${
              activa
                ? "bg-ink text-base"
                : "border border-line bg-base text-ink-60 hover:bg-surface"
            }`}
          >
            <input
              type="radio"
              name={grupo}
              value={opcion.clave}
              checked={activa}
              onChange={() => alCambiar(opcion.clave)}
              className="absolute inset-0 cursor-pointer appearance-none rounded-md"
            />
            {opcion.nombre}
          </label>
        );
      })}
    </fieldset>
  );
}
