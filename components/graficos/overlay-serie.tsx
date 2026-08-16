"use client";

import { useRef, type ReactNode } from "react";

// La capa de interacción de los gráficos de serie: UNA superficie que
// convierte la posición del puntero en un índice de la serie, más el
// tooltip anclado por porcentaje.
//
// POR QUÉ ASÍ Y NO CON @visx/tooltip: los SVG de la casa van con
// preserveAspectRatio="none" — se estiran para ser responsive y por eso
// todo el texto vive en HTML afuera. Cualquier técnica de píxeles sobre
// ese SVG (localPoint, un <circle> marcador) se deforma con él. Acá el
// índice sale de la FRACCIÓN horizontal del contenedor
// (getBoundingClientRect del propio overlay), que es inmune al
// estiramiento, y el tooltip se ancla con `left: %`, que también lo es.
//
// UNA superficie y no una celda por punto: con 30 puntos en mobile las
// celdas medirían ~12px — debajo del área táctil mínima de 44px de la
// casa — y el DOM se llenaría de nodos. El teclado va sobre el wrapper
// (un solo tab stop, flechas para moverse), no sobre 30 botones.
//
// ACCESIBILIDAD: el tooltip es redundante con el aria-label del SVG, que
// ya lee la serie completa — por eso va aria-hidden. El overlay expone su
// propio label con la instrucción de las flechas.
export function OverlaySerie({
  n,
  indice,
  alCambiar,
  etiqueta,
  tooltip,
  children,
}: {
  /** Cantidad de puntos de la serie visible. */
  n: number;
  /** El punto bajo el puntero/foco, o null sin interacción. */
  indice: number | null;
  alCambiar: (indice: number | null) => void;
  /** Para el lector de pantalla: qué se explora con las flechas. */
  etiqueta: string;
  /** El contenido del tooltip del punto activo. */
  tooltip: (indice: number) => ReactNode;
  /** El SVG del gráfico (y cualquier marcador HTML del dueño). */
  children: ReactNode;
}) {
  const superficie = useRef<HTMLDivElement | null>(null);

  function indiceDesde(clientX: number): number {
    const caja = superficie.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return 0;
    const fraccion = (clientX - caja.left) / caja.width;
    return Math.min(n - 1, Math.max(0, Math.floor(fraccion * n)));
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const paso = e.key === "ArrowRight" ? 1 : -1;
      const base = indice ?? (paso === 1 ? -1 : n);
      alCambiar(Math.min(n - 1, Math.max(0, base + paso)));
    }
    if (e.key === "Escape") alCambiar(null);
  }

  // El ancla horizontal del tooltip: el centro del punto activo. En los
  // bordes el translate se recorta para que no se desborde de la tarjeta.
  const centro = indice === null ? 0 : ((indice + 0.5) / n) * 100;
  const corrimiento =
    centro < 12 ? "0%" : centro > 88 ? "-100%" : "-50%";

  return (
    <div
      ref={superficie}
      role="group"
      aria-label={`${etiqueta}. Explorá los puntos con las flechas.`}
      tabIndex={0}
      className="relative outline-none"
      onPointerMove={(e) => alCambiar(indiceDesde(e.clientX))}
      onPointerDown={(e) => alCambiar(indiceDesde(e.clientX))}
      // Solo el mouse limpia al salir: en touch el pointerleave dispara al
      // LEVANTAR el dedo, y borraba el tooltip en el mismo tap que lo
      // abrió. En el celular queda visible hasta el próximo tap o hasta
      // salir del gráfico (blur).
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") alCambiar(null);
      }}
      onKeyDown={alTeclear}
      onBlur={() => alCambiar(null)}
    >
      {children}

      {indice !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1 z-10"
          style={{ left: `${centro}%`, transform: `translate(${corrimiento}, -100%)` }}
        >
          {/* La sombra está permitida: es un elemento flotando sobre otro. */}
          <div className="rounded-md border border-line bg-base px-2.5 py-1.5 whitespace-nowrap shadow-lg">
            {tooltip(indice)}
          </div>
        </div>
      )}
    </div>
  );
}
