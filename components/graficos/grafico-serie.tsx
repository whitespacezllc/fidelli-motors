"use client";

import { useId, useState } from "react";
import { AreaClosed, LinePath } from "@visx/shape";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import {
  etiquetaDePunto,
  mostrarEtiqueta,
  pasoDeEtiquetas,
  type Granularidad,
  type PuntoSerie,
  type VistaPanel,
} from "@/lib/series";
import { OverlaySerie } from "@/components/graficos/overlay-serie";

// ============================================================
// El gráfico de una serie temporal — UNO SOLO para todo el producto.
//
// Nació como el Pulso de /fidelli y ahora lo comparten las dos
// superficies: el panel del lubricentro con SUS services y /fidelli con
// los de toda la plataforma. Compartir el componente y no el estilo es
// lo que garantiza que no diverjan: un ajuste al hover o a la curva
// entra en los dos lugares o en ninguno.
//
// Área cerrada con gradiente y línea encima: la lectura financiera de
// "esto crece". El área sola es una mancha; la línea sola queda flaca.
//
// COLOR — neutro (ink), nunca el rojo de marca. En /fidelli la tabla de
// abajo está llena de color de estado y ese color tiene que ganar. En el
// panel vale la misma regla de la casa: el rojo es acción, no dato.
//
// LA GEOMETRÍA VA POR ÍNDICE, no por escala de tiempo: las etiquetas, el
// overlay y el tooltip reparten el ancho en n celdas iguales, y una
// escala temporal desalinea la curva de sus etiquetas en meses de 28-31
// días. Cada punto cae en el centro de su celda —(i + 0.5) / n— y esa
// misma fracción ubica el marcador y el tooltip en HTML con `left: %`,
// que es lo único que sobrevive al estiramiento del SVG
// (preserveAspectRatio="none"). Un <circle> adentro se deformaría en
// elipse; por eso el marcador es un div.
// ============================================================

const ANCHO = 900;
const ALTO = 200;
// Aire arriba y abajo para que el pico y el valle no muerdan el borde.
const PISO = 8;

export function GraficoSerie({
  serie,
  unidad,
  /** El último período todavía no terminó: su tramo va punteado. */
  ultimoEnCurso = false,
  /** Qué se cuenta, para el tooltip y el texto de los estados vacíos. */
  vacio,
}: {
  serie: PuntoSerie[];
  unidad: Granularidad | VistaPanel;
  ultimoEnCurso?: boolean;
  vacio: { sinDatos: string; unSoloPunto: string };
}) {
  const [indice, setIndice] = useState<number | null>(null);
  // El id del gradiente tiene que ser único: dos gráficos en la misma
  // página compartirían el <defs> y el segundo pisaría al primero.
  const idRelleno = useId();

  if (serie.length === 0) {
    return (
      <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">
        {vacio.sinDatos}
      </p>
    );
  }

  // Un solo punto no es una curva: no hay tendencia que dibujar y un área
  // de un punto es una mancha. Se muestra el dato y ya — degradar con
  // dignidad es también saber cuándo no hay gráfico.
  if (serie.length === 1) {
    return (
      <div className="border-t border-line px-4.5 py-8 text-center">
        <p className="font-brand text-h3 font-bold text-ink tabular-nums">
          {serie[0].cantidad}
        </p>
        <p className="mt-0.5 text-ui text-ink-60">
          {etiquetaDePunto(serie[0].inicio, unidad)} — {vacio.unSoloPunto}
        </p>
      </div>
    );
  }

  const n = serie.length;
  const maximo = Math.max(...serie.map((p) => p.cantidad));
  const x = (i: number) => ((i + 0.5) / n) * ANCHO;

  // Con todo en cero el dominio sería [0,0] y no habría escala: el max de
  // 1 deja el gráfico plano contra el piso, que es exactamente lo que
  // pasó.
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });

  // El tramo final va aparte y punteado cuando el período no cerró: la
  // semana o el mes en curso todavía no es comparable con los anteriores,
  // y una línea llena hasta ahí se lee como una caída que no existe.
  const cerrados = ultimoEnCurso ? serie.slice(0, n - 1) : serie;
  const enCurso = ultimoEnCurso ? serie.slice(n - 2) : [];
  const desplazado = ultimoEnCurso ? n - 2 : 0;

  const activo = indice !== null ? serie[indice] : null;
  const paso = pasoDeEtiquetas(n, unidad);

  return (
    <div className="border-t border-line px-4.5 pt-4 pb-3">
      <OverlaySerie
        n={n}
        indice={indice}
        alCambiar={setIndice}
        etiqueta={`Services por ${unidad}`}
        tooltip={(i) => (
          <p className="font-ui text-ui text-ink">
            <span className="font-semibold tabular-nums">
              {serie[i].cantidad}
            </span>{" "}
            {serie[i].cantidad === 1 ? "service" : "services"}
            <span className="text-ink-60">
              {" "}
              · {etiquetaDePunto(serie[i].inicio, unidad)}
              {ultimoEnCurso && i === n - 1 ? " (en curso)" : ""}
            </span>
          </p>
        )}
      >
        {/* EL ALTO BAJA EN PANTALLAS ANGOSTAS. El SVG se estira en los dos
            ejes (preserveAspectRatio="none"), así que la pendiente que se
            ve es el alto CSS contra el ancho real del contenedor: 200px
            fijos en una tarjeta de 300px convierten cualquier variación
            en un acantilado. Con estos escalones la proporción se mantiene
            en el orden de 2,5:1 desde un celular hasta el ancho completo. */}
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="block h-32 w-full sm:h-40 lg:h-[200px]"
          role="img"
          aria-label={`Services por ${unidad}: ${serie
            .map((p) => `${etiquetaDePunto(p.inicio, unidad)} ${p.cantidad}`)
            .join(", ")}`}
        >
          <LinearGradient
            id={idRelleno}
            from="var(--color-ink)"
            to="var(--color-ink)"
            fromOpacity={0.16}
            toOpacity={0}
          />

          {/* El área usa la serie ENTERA: el relleno del período en curso
              existe igual, lo que se atenúa es su contorno. */}
          <AreaClosed
            data={serie}
            x={(_, i) => x(i)}
            y={(d) => y(d.cantidad)}
            yScale={y}
            curve={curveMonotoneX}
            fill={`url(#${idRelleno})`}
          />

          <LinePath
            data={cerrados}
            x={(_, i) => x(i)}
            y={(d) => y(d.cantidad)}
            curve={curveMonotoneX}
            stroke="var(--color-ink)"
            strokeWidth={2}
            // El SVG se estira en horizontal: sin esto el trazo se
            // engrosaría con el escalado, y el punteado se deformaría.
            vectorEffect="non-scaling-stroke"
            fill="none"
          />

          {enCurso.length === 2 && (
            <LinePath
              data={enCurso}
              x={(_, i) => x(i + desplazado)}
              y={(d) => y(d.cantidad)}
              curve={curveMonotoneX}
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
          )}
        </svg>

        {/* La guía y el punto del hover, en HTML por porcentajes: lo único
            que no se deforma con el estiramiento del SVG. */}
        {activo && indice !== null && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-line"
              style={{ left: `${((indice + 0.5) / n) * 100}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute size-2.5 rounded-full border-2 border-base bg-ink"
              style={{
                left: `${((indice + 0.5) / n) * 100}%`,
                top: `${(y(activo.cantidad) / ALTO) * 100}%`,
                translate: "-50% -50%",
              }}
            />
          </>
        )}
      </OverlaySerie>

      {/* Las etiquetas van en HTML, alineadas por grilla contra el mismo
          reparto de celdas que usa la curva. Sin ejes decorados ni grilla
          pesada: lo mínimo para leer la tendencia. Las salteadas van
          vacías y no ocultas — una etiqueta invisible sigue ocupando su
          ancho y se desborda de la celda en pantallas angostas. */}
      <div
        className="mt-1.5 grid gap-1 text-center text-label text-ink-40 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {serie.map((p, i) => (
          <span
            key={p.inicio}
            className={i === indice ? "font-semibold text-ink" : undefined}
          >
            {mostrarEtiqueta(i, n, paso) ? etiquetaDePunto(p.inicio, unidad) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
