"use client";

import { useState } from "react";
import { IconoChevron, IconoIncluido } from "@/components/iconos";
import { COMPARACION, PLANES, pesos } from "@/lib/planes-landing";

// 09b · La comparación de los tres planes.
//
// PLEGADA POR DEFECTO. La sección de precio ya tiene tres tarjetas, y una
// tabla de 20 filas abierta debajo duplicaría el alto de la página justo
// donde el visitante está por decidir. El que quiere el detalle lo pide.
//
// SIN SCROLL HORIZONTAL EN MOBILE, que es la trampa obvia de una tabla de
// cuatro columnas: no se resuelve con overflow-x, se resuelve haciendo que
// entre. La primera columna se lleva el 40% y las tres de planes se
// reparten el resto; a 375 los conceptos envuelven en dos renglones y la
// tabla sigue entrando entera.
//
// El encabezado es `sticky`: con la tabla abierta, scrollear 20 filas sin
// saber qué columna es cuál no sirve de nada. Va con fondo opaco propio
// —si fuera transparente, las filas se leerían por debajo al pasar.

function Celda({ valor }: { valor: boolean | string }) {
  if (valor === true) {
    return (
      <>
        <IconoIncluido
          aria-hidden
          strokeWidth={2}
          className="mx-auto size-[18px] text-success"
        />
        <span className="sr-only">Incluido</span>
      </>
    );
  }
  if (valor === false) {
    return (
      <>
        <span aria-hidden className="text-ink-40">
          —
        </span>
        <span className="sr-only">No incluido</span>
      </>
    );
  }
  return (
    <span className="font-ui text-ui font-semibold text-ink tabular-nums">
      {valor}
    </span>
  );
}

export function ComparacionPlanes() {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="mt-(--espacio-bloque)">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-controls="tabla-planes"
          className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-line bg-base px-6 font-ui text-ui font-semibold text-ink transition-colors hover:border-ink-40"
        >
          {abierta ? "Ocultar la comparación" : "Comparar los tres planes"}
          <IconoChevron
            aria-hidden
            className={`size-4 transition-transform ${abierta ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Se monta solo al abrir: son ~20 filas × 4 columnas de nodos que no
          tienen por qué estar en el DOM de una página que la mayoría lee
          hasta las tarjetas. */}
      {abierta && (
        <div id="tabla-planes" className="mt-8">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Qué incluye cada plan de Fidelli Motors
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-base py-4 pl-0 text-left shadow-[inset_0_-1px_0_var(--color-line)]"
                >
                  <span className="sr-only">Función</span>
                </th>
                {PLANES.map((p) => (
                  <th
                    key={p.clave}
                    scope="col"
                    className={`sticky top-0 z-10 px-1.5 py-4 text-center shadow-[inset_0_-1px_0_var(--color-line)] sm:px-2.5 ${
                      p.destacado ? "bg-surface" : "bg-base"
                    }`}
                  >
                    <span
                      className={`font-brand text-body font-bold sm:text-lead ${
                        p.destacado
                          ? "inline-block rounded-full bg-ink px-2.5 py-1 text-inverso sm:px-3.5"
                          : "text-ink"
                      }`}
                    >
                      {p.nombre}
                    </span>
                    <span className="mt-1 block font-ui text-label font-semibold text-ink-40 tabular-nums">
                      {pesos(p.mensual)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {COMPARACION.map((grupo) => (
              <tbody key={grupo.titulo}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="pt-7 pb-2 text-left font-ui text-label font-semibold tracking-[0.06em] text-ink-40 uppercase"
                  >
                    {grupo.titulo}
                  </th>
                </tr>
                {grupo.filas.map((fila) => (
                  <tr key={fila.concepto}>
                    <th
                      scope="row"
                      className="w-[40%] border-b border-line py-3 pr-2 pl-0 text-left text-ui font-normal text-ink sm:text-body"
                    >
                      {fila.concepto}
                    </th>
                    {fila.valores.map((valor, i) => (
                      <td
                        key={PLANES[i].clave}
                        className={`border-b border-line px-1.5 py-3 text-center text-ui text-ink-60 sm:px-2.5 sm:text-body ${
                          PLANES[i].destacado ? "bg-surface" : ""
                        }`}
                      >
                        <Celda valor={valor} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
