"use client";

import { useId, useState } from "react";
import { AreaStack } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import {
  etiquetaDePunto,
  mostrarEtiqueta,
  pasoDeEtiquetas,
  type Granularidad,
} from "@/lib/series";
import { OverlaySerie } from "@/components/graficos/overlay-serie";

// ============================================================
// El Pulso apilado por tipo (bloque MÉTRICAS 3): tres áreas, una por tipo
// de trabajo, en orden fijo de abajo hacia arriba —service, mecánica,
// neumáticos— cuya suma en cada punto es el total de trabajos.
//
// LOS COLORES SON CATEGORÍA, NO ESTADO. Salen de los tokens del proyecto:
// service con el ladrillo de marca, mecánica con el charcoal, neumáticos
// con el gris medio. No dependen del color solo: el orden es fijo y la
// leyenda va siempre visible con los tres nombres, así que un lector que
// no distingue los tonos lee «de abajo hacia arriba». El admin es solo
// claro (no hay modo oscuro en esta superficie, CLAUDE-landing.md).
//
// La geometría es por índice, como grafico-serie.tsx: n celdas iguales,
// el punto en el centro de cada una, y el overlay/tooltip en HTML por
// porcentaje (el SVG se estira con preserveAspectRatio="none").
// ============================================================

export type PuntoPulso = {
  inicio: string;
  cantidad: number;
  service: number;
  mecanica: number;
  neumaticos: number;
};

export type TipoPulso = "service" | "mecanica" | "neumaticos";

export const TIPOS_PULSO: readonly { clave: TipoPulso; nombre: string; color: string }[] = [
  { clave: "service", nombre: "Service", color: "var(--color-brand)" },
  { clave: "mecanica", nombre: "Mecánica", color: "var(--color-ink)" },
  { clave: "neumaticos", nombre: "Neumáticos", color: "var(--color-ink-40)" },
];

const CLAVES: TipoPulso[] = ["service", "mecanica", "neumaticos"];

const ANCHO = 900;
const ALTO = 200;
const PISO = 8;

export function GraficoPulso({
  serie,
  unidad,
  vacio,
}: {
  serie: PuntoPulso[];
  unidad: Granularidad;
  vacio: { sinDatos: string; unSoloPunto: string };
}) {
  const [indice, setIndice] = useState<number | null>(null);
  const idClip = useId();

  if (serie.length === 0) {
    return (
      <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">
        {vacio.sinDatos}
      </p>
    );
  }

  if (serie.length === 1) {
    const p = serie[0];
    return (
      <div className="border-t border-line px-4.5 py-8 text-center">
        <p className="font-brand text-h3 font-bold text-ink tabular-nums">{p.cantidad}</p>
        <p className="mt-0.5 text-ui text-ink-60">
          {etiquetaDePunto(p.inicio, unidad)} — {vacio.unSoloPunto}
        </p>
        <p className="mt-1 text-label text-ink-40 tabular-nums">
          {p.service} service · {p.mecanica} mecánica · {p.neumaticos} neumáticos
        </p>
      </div>
    );
  }

  const n = serie.length;
  const maximo = Math.max(...serie.map((p) => p.service + p.mecanica + p.neumaticos));
  const x = (i: number) => ((i + 0.5) / n) * ANCHO;
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });

  const activo = indice !== null ? serie[indice] : null;
  const paso = pasoDeEtiquetas(n, unidad);
  const colorDe = (clave: string) =>
    TIPOS_PULSO.find((t) => t.clave === clave)?.color ?? "var(--color-ink)";

  return (
    <div className="border-t border-line px-4.5 pt-4 pb-3">
      <OverlaySerie
        n={n}
        indice={indice}
        alCambiar={setIndice}
        etiqueta={`Trabajos por ${unidad}, por tipo`}
        tooltip={(i) => (
          <div className="font-ui text-label text-ink tabular-nums">
            <p className="text-ui">
              <span className="font-semibold">{serie[i].cantidad}</span>{" "}
              {serie[i].cantidad === 1 ? "trabajo" : "trabajos"}
              <span className="text-ink-60"> · {etiquetaDePunto(serie[i].inicio, unidad)}</span>
            </p>
            <p className="mt-0.5 text-ink-60">
              {serie[i].service} service · {serie[i].mecanica} mecánica ·{" "}
              {serie[i].neumaticos} neumáticos
            </p>
          </div>
        )}
      >
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="block h-32 w-full sm:h-40 lg:h-[200px]"
          role="img"
          aria-label={`Trabajos por ${unidad}, apilados por tipo: ${serie
            .map(
              (p) =>
                `${etiquetaDePunto(p.inicio, unidad)} ${p.cantidad} (${p.service} service, ${p.mecanica} mecánica, ${p.neumaticos} neumáticos)`,
            )
            .join(", ")}`}
        >
          <defs>
            <clipPath id={idClip}>
              <rect x={0} y={0} width={ANCHO} height={ALTO} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${idClip})`}>
            <AreaStack
              data={serie}
              keys={CLAVES}
              x={(_, i) => x(i)}
              y0={(d) => y(d[0])}
              y1={(d) => y(d[1])}
              curve={curveMonotoneX}
            >
              {({ stacks, path }) =>
                stacks.map((stack) => (
                  <path
                    key={stack.key}
                    d={path(stack) || ""}
                    fill={colorDe(stack.key)}
                    fillOpacity={0.88}
                    // Un filete claro entre áreas: separa dos tonos
                    // vecinos sin depender del contraste entre ellos.
                    stroke="var(--color-base)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              }
            </AreaStack>
          </g>
        </svg>

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

      <div
        className="mt-1.5 grid gap-1 text-center text-label text-ink-40 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {serie.map((p, i) => (
          <span key={p.inicio} className={i === indice ? "font-semibold text-ink" : undefined}>
            {mostrarEtiqueta(i, n, paso) ? etiquetaDePunto(p.inicio, unidad) : ""}
          </span>
        ))}
      </div>

      {/* La leyenda, siempre visible, en el orden de apilado (de abajo
          hacia arriba). */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-60">
        {TIPOS_PULSO.map((t) => (
          <li key={t.clave} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: t.color }}
            />
            {t.nombre}
          </li>
        ))}
        <li className="text-ink-40">apilados de abajo hacia arriba</li>
      </ul>
    </div>
  );
}
