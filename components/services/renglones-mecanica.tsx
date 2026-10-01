"use client";

import { IconoCheck } from "@/components/iconos";
import {
  GRUPOS_MECANICA,
  alternarFrase,
  renglonesVisibles,
  tieneFrase,
} from "@/lib/renglones-mecanica";

// ============================================================
// La orden de trabajo — los renglones de la mecánica, como teclado
//
// Presentacional y sin estado propio: el texto vive en carton.tsx
// (`descripcion`) y es lo único que se guarda. Cada botón escribe o borra
// SU línea; prendido o no se decide en cada render mirando el texto
// (`tieneFrase`), nunca al revés. Ver lib/renglones-mecanica.ts.
//
// El botón NO mueve el foco al textarea ni abre el teclado del celular:
// el mecánico tiene que poder tocar diez renglones seguidos sin pelearse
// con el teclado.
// ============================================================

export function RenglonesMecanica({
  descripcion,
  alCambiar,
  tieneGomeria,
  adjunta,
}: {
  descripcion: string;
  alCambiar: (texto: string) => void;
  /** El taller tiene la feature 'neumaticos': alineación y rotación se
   *  cargan como trabajo de gomería y acá no se ofrecen. */
  tieneGomeria: boolean;
  /** Es la mecánica adjunta a un service: lo que ya está en el cartón de
   *  arriba no se repite. */
  adjunta: boolean;
}) {
  const visibles = renglonesVisibles({ tieneGomeria, adjunta });

  return (
    <div className="flex flex-col gap-3.5">
      {GRUPOS_MECANICA.map((grupo) => {
        const delGrupo = visibles.filter((r) => r.grupo === grupo);
        if (delGrupo.length === 0) return null;
        const idGrupo = `grupo-mecanica-${delGrupo[0].clave}`;
        return (
          <div key={grupo} role="group" aria-labelledby={idGrupo}>
            <p
              id={idGrupo}
              data-grupo-mecanica={grupo}
              className="mb-1.5 font-brand text-label font-bold tracking-[0.1em] text-ink-40 uppercase"
            >
              {grupo}
            </p>
            {/* Envueltos, siempre: nunca una fila con scroll horizontal ni
                una grilla de columnas fijas. En 360px entran uno o dos por
                fila; en la compu, seis o siete. */}
            <div className="flex flex-wrap gap-2">
              {delGrupo.map((r) => {
                const prendido = tieneFrase(descripcion, r.frase);
                return (
                  <button
                    key={r.clave}
                    type="button"
                    data-renglon={r.clave}
                    aria-pressed={prendido}
                    onClick={() => alCambiar(alternarFrase(descripcion, r.frase))}
                    // EL ANCHO NO CAMBIA AL TOCAR: apagado lleva 24px de
                    // aire por lado; prendido, el ✓ (14px) y su separación
                    // (6px) salen de ese mismo aire (12 + 14 + 6 … 16).
                    // Las dos cuentas dan texto + 48px, así que ningún
                    // vecino se corre de fila. Lo mide la prueba.
                    className={`flex min-h-11 items-center rounded-md border text-ui font-semibold whitespace-nowrap transition-colors ${
                      prendido
                        ? "gap-1.5 border-ink bg-ink pr-4 pl-3 text-white"
                        : "border-line bg-base px-6 text-ink hover:bg-surface"
                    }`}
                  >
                    {/* El estado es tinta, nunca rojo: el rojo es acción. */}
                    {prendido && (
                      <IconoCheck aria-hidden className="size-3.5 shrink-0" />
                    )}
                    {r.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
