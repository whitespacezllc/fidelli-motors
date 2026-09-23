"use client";

import { useId, useLayoutEffect, useState } from "react";
import { AreaStack } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { etiquetaDePunto, mostrarEtiqueta, type Granularidad } from "@/lib/series";
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
//
// EL EJE X SE MIDE, NO SE ADIVINA (bloque MÉTRICAS 4): cada cuántas celdas
// va un rótulo sale del ancho real del eje (ResizeObserver) dividido por
// n, contra el ancho del rótulo más largo de la serie. Hasta medir (el
// render del servidor y el primer paint) se asume el eje de un celular
// chico, el mismo número que grafico-mrr.tsx: más ralo es el error barato
// (la heurística por cantidad de puntos de lib/series.ts sigue siendo la
// del panel del tenant, pero en un celular de 320px pisaba los «dd/MM»).
// Anclado al final, como siempre: la última fecha se ve.
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

// ---------- El eje X según el ancho real ----------

// Ancho estimado de un rótulo, sin medir texto (el ancho del contenedor no
// depende de que la fuente haya cargado; el del texto sí): text-label mide
// 12px y en Public Sans un dígito tabular ocupa ~8,4px y una letra ~6px.
// Se redondea para arriba a propósito (mejor un rótulo de menos que dos
// pisados). Entre rótulos vecinos quedan 8px de aire.
const PX_POR_DIGITO = 8.5;
const PX_POR_LETRA = 6.5;
const SEPARACION = 8;

function anchoDeTexto(texto: string): number {
  let ancho = 0;
  for (const c of texto) ancho += c >= "0" && c <= "9" ? PX_POR_DIGITO : PX_POR_LETRA;
  return ancho;
}
// Antes de medir se asume el eje de un celular de 320px de ancho: la
// tarjeta le descuenta unos 80px de márgenes y padding y quedan ~240. Si
// el eje real es más ancho sobran rótulos, que es el error barato; el
// ResizeObserver corrige antes de pintar.
const ANCHO_SUPUESTO = 240;

// Cada cuántas celdas va un rótulo para que el más ancho de la serie no
// toque al vecino: los rótulos van centrados en celdas iguales, así que
// dos que se muestran están a `paso × celda` de distancia. Sin medida
// todavía (null, o 0 si el eje está oculto), el ancho supuesto.
function pasoSegunAncho(
  serie: PuntoPulso[],
  unidad: Granularidad,
  anchoPx: number | null,
): number {
  const n = serie.length;
  const ancho = anchoPx || ANCHO_SUPUESTO;
  const masAncho = Math.max(...serie.map((p) => anchoDeTexto(etiquetaDePunto(p.inicio, unidad))));
  return Math.max(1, Math.ceil((masAncho + SEPARACION) / (ancho / n)));
}

// El ancho real de un elemento, seguido con ResizeObserver. Devuelve el ref
// (como callback, para volver a medir si el nodo se monta después) y el
// ancho, null hasta medir.
function useAncho(): [(nodo: HTMLDivElement | null) => void, number | null] {
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!nodo) return;
    const medir = () => setAncho(nodo.getBoundingClientRect().width);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [nodo]);
  return [setNodo, ancho];
}

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
  const [ejeX, anchoEje] = useAncho();
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
  const paso = pasoSegunAncho(serie, unidad, anchoEje);
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

      {/* El rótulo va en un span absoluto centrado en su celda, no como
          texto de la celda: con 30 días en un celular la celda mide 6px y
          un «23/09» de 38px la desborda, y un texto que desborda su caja
          se alinea al inicio (CSS Text), así que el último se salía de la
          tarjeta y quedaba recortado. Centrado, cada rótulo asoma lo mismo
          para los dos lados y el de la punta cabe en el padding. */}
      <div
        ref={ejeX}
        data-eje-x
        className="mt-1.5 grid h-4 gap-1 text-label text-ink-40 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {serie.map((p, i) => (
          <span key={p.inicio} className="relative">
            {mostrarEtiqueta(i, n, paso) && (
              <span
                className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${
                  i === indice ? "font-semibold text-ink" : ""
                }`}
              >
                {etiquetaDePunto(p.inicio, unidad)}
              </span>
            )}
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
