"use client";

import {
  IconoAuto,
  IconoConfirmar,
  IconoFluidos,
  IconoPasoHecho,
} from "@/components/iconos";

// Los tres pasos de la sección 03 — la guía de lo que el visitante está
// haciendo en el celular de al lado.
//
// NO TIENE ESTADO PROPIO: recibe el de la simulación ya derivado. Un
// segundo estado acá se desincronizaría del teléfono en el primer camino
// raro, y entonces la guía diría una cosa y la pantalla otra — que es peor
// que no tener guía.
//
// Los íconos son señalización, no acción: gris, sin relleno, sin fondo de
// color. En esta sección no hay nada para apretar, así que rojo sería
// mentir sobre lo que hace.
//
// DOS JERARQUÍAS DISTINTAS, como pide el spec: el ícono dice QUÉ es el
// paso, el número dice CUÁNDO. Por eso el número queda como etiqueta chica
// arriba del título y no compite con el ícono por el mismo lugar.

export type EstadoPaso = "pendiente" | "activo" | "completado";

// SOLO TÍTULOS, sin párrafos: el formulario de al lado ya demuestra cada
// paso —el autocompletado se ve al escribir la patente— y el cálculo del
// próximo service se cuenta en la sección 04. Lo que el demo muestra, el
// texto no lo repite.
const PASOS = [
  {
    numero: "1",
    titulo: "Cargás la patente y los kilómetros",
    Icono: IconoAuto,
  },
  {
    numero: "2",
    titulo: "Marcás qué le hiciste",
    Icono: IconoFluidos,
  },
  {
    numero: "3",
    titulo: "Confirmás y listo",
    Icono: IconoConfirmar,
  },
] as const;

// El borde es lo único que cambia de la caja: "un poco más marcado" en el
// activo. Sin fondo de color y sin sombra — el aire lo da la ausencia de
// ruido, y acá hay tres cajas juntas.
const BORDE: Record<EstadoPaso, string> = {
  pendiente: "border-line",
  activo: "border-ink",
  completado: "border-line",
};

// El completado baja de peso pero NO de contraste: ink-60 sobre blanco da
// 8.9:1. Bajarlo a ink-40 lo dejaría en 3:1 y sería texto por debajo del
// AA solo por estar hecho.
const TITULO: Record<EstadoPaso, string> = {
  pendiente: "font-bold text-ink",
  activo: "font-bold text-ink",
  completado: "font-semibold text-ink-60",
};

export function PasosGuia({ estados }: { estados: EstadoPaso[] }) {
  return (
    <ol className="flex flex-col gap-3 sm:gap-4">
      {PASOS.map((paso, i) => {
        const estado = estados[i] ?? "pendiente";
        const hecho = estado === "completado";
        // El check reemplaza al ícono del paso cuando está hecho.
        const Icono = hecho ? IconoPasoHecho : paso.Icono;

        return (
          <li
            key={paso.numero}
            // aria-current="step" es la forma estándar de decir "estás
            // acá" en una secuencia; el lector de pantalla lo anuncia sin
            // que haga falta una región viva que interrumpa a cada tecla.
            aria-current={estado === "activo" ? "step" : undefined}
            className={`flex gap-4 rounded-lg border bg-base p-5 transition-colors sm:p-6 ${BORDE[estado]}`}
          >
            {/* El contenedor cuadrado del ícono. 40px con el ícono de 18
                adentro: área suficiente para que el trazo respire sin que
                el cuadrado compita con el título. */}
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-ink-40"
            >
              <Icono
                strokeWidth={1.5}
                className="size-[18px]"
              />
            </span>

            <div className="min-w-0">
              <p className="font-ui text-label font-semibold tracking-[0.08em] text-ink-60 tabular-nums">
                {paso.numero}
              </p>
              <h3
                className={`mt-1.5 text-lead transition-colors ${TITULO[estado]}`}
              >
                {paso.titulo}
              </h3>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
