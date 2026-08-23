"use client";

import { useId, useState } from "react";
import { IconoDesplegar } from "@/components/iconos";

// 10 · El acordeón de las seis preguntas de abajo.
//
// ANTES ERA <details>/<summary> NATIVO y funcionaba sin JavaScript, que es
// mejor por defecto. Se cambió por dos requisitos que el elemento nativo no
// da: uno solo abierto por vez y una apertura animada. El atributo `name`
// de <details> resuelve lo primero, pero no lo segundo, y no hay forma de
// animar la altura de un <details> sin JavaScript igual.
//
// EL PRIMERO ARRANCA ABIERTO. Con los seis cerrados el bloque se lee como
// un muro gris y nada avisa que se despliegan; con uno abierto, el patrón
// se entiende sin tocar nada.
//
// LA ALTURA SE ANIMA CON GRID, no con max-height. `grid-template-rows` de
// 0fr a 1fr anima la altura REAL del contenido: con max-height hay que
// adivinar un valor, y si el texto crece se corta o queda un salto al
// final. El hijo lleva `overflow-hidden`, que es lo que recorta mientras la
// fila mide cero.

import { RespuestaFaq, type EnlaceFaq } from "@/components/landing/respuesta-faq";

type Item = {
  readonly pregunta: string;
  readonly respuesta: string;
  /** Opcional: la de los planes remite a la comparación. */
  readonly enlace?: EnlaceFaq;
};

export function AcordeonPreguntas({ items }: { items: readonly Item[] }) {
  // El primero abierto. Se guarda el índice y no un Set: uno por vez.
  const [abierto, setAbierto] = useState(0);
  const base = useId();

  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {items.map((item, i) => {
        const activo = i === abierto;
        const idBoton = `${base}-b-${i}`;
        const idPanel = `${base}-p-${i}`;

        return (
          <div key={item.pregunta}>
            {/* El <h3> lleva el botón adentro y no al revés: la pregunta es
                un encabezado del documento —y así aparece en la lista de
                encabezados de un lector de pantalla— y además es el control
                que abre el panel. */}
            <h3>
              <button
                type="button"
                id={idBoton}
                aria-expanded={activo}
                aria-controls={idPanel}
                // Volver a tocar el que está abierto lo cierra. Que no se
                // pueda cerrar el último es una trampa clásica de acordeón.
                onClick={() => setAbierto(activo ? -1 : i)}
                className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-body font-semibold text-ink transition-colors hover:bg-surface"
              >
                {item.pregunta}
                <IconoDesplegar
                  aria-hidden
                  strokeWidth={2}
                  className={`size-5 shrink-0 text-ink-60 transition-[rotate] duration-200 ease-out motion-reduce:transition-none ${
                    activo ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
            </h3>

            {/* `inert` cuando está cerrado: sin eso el texto sigue en el
                árbol de accesibilidad —está recortado, no oculto— y un
                lector de pantalla lee las seis respuestas de corrido. */}
            <div
              id={idPanel}
              role="region"
              aria-labelledby={idBoton}
              inert={!activo}
              className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                activo ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="max-w-[68ch] text-pretty px-5 pb-5 text-body text-ink-60">
                  <RespuestaFaq texto={item.respuesta} enlace={item.enlace} />
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
