"use client";

import { useLayoutEffect, useState } from "react";
import { LinePath } from "@visx/shape";
import { curveLinear } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { OverlaySerie } from "@/components/graficos/overlay-serie";
import {
  MENOS,
  entero,
  mesCorto,
  type FilaAltasBajas,
} from "@/lib/fidelli/crecimiento";

// ============================================================
// «¿Entran más de los que se van?»: altas hacia arriba, bajas hacia abajo
// y el neto como línea encima, mes a mes (altas_bajas_por_mes()).
//
// UN SOLO EJE Y, SIMÉTRICO, con la línea del cero en el medio: una baja
// mide lo mismo que un alta, y el neto se lee en la misma escala que las
// barras que lo explican. Los colores son categoría, no estado: el
// ladrillo de marca para las altas (la serie principal, como el service
// en el Pulso), el charcoal para las bajas, el gris medio para la línea.
// No dependen del color solo: la dirección ya lo dice y la leyenda va
// siempre visible.
//
// La geometría es por índice, como grafico-pulso.tsx: n celdas iguales,
// la barra centrada en su celda, el overlay y el tooltip en HTML por
// porcentaje (el SVG se estira con preserveAspectRatio="none", así que
// nada de texto vive adentro y los trazos van con non-scaling-stroke).
//
// EL TOOLTIP ES ANGOSTO A PROPÓSITO (renglones cortos: el mes, «4 altas ·
// 4 bajas», «2 reactivaciones», «neto 0»; unos 120px). OverlaySerie lo
// centra en el punto y recién lo corre a −100 % pasado el 88 % del ancho:
// con el desglose en un solo renglón (210px) sobre el overlay de un
// celular (≈290px a 390) cualquier mes entre el 70 % y el 88 % salía del
// viewport. Angosto, el peor caso (centro en el 88 %) queda adentro de la
// pantalla a 390px y a lo sumo asoma unos píxeles sobre el borde de la
// tarjeta, que por eso no recorta (seccion.tsx).
//
// EL EJE X SE MIDE, NO SE ADIVINA (el patrón que dejó D4 en
// grafico-pulso.tsx / grafico-mrr.tsx): el ancho real del eje sale de un
// ResizeObserver y el paso es el primero en el que el rótulo más ancho que
// se muestra no toca al vecino. Los rótulos son el mes corto («sept») con
// el año en el primero que se ve y en cada cambio de año, anclados al
// final para que el último mes tenga siempre fecha. Hasta medir se asume
// el eje de un celular chico (240px), el mismo número que los otros dos.
// ============================================================

const ANCHO = 900;
const ALTO = 220;
const PISO = 10;
/** El ancho de cada barra como fracción de su celda: queda aire entre meses. */
const BARRA = 0.56;
/**
 * Y un tope: con dos o tres meses la celda mide un tercio del gráfico y una
 * barra al 56 % es un bloque de 300px; un octavo del ancho (unos 150px en
 * una pantalla grande, 40 en un celular) sigue leyéndose como barra.
 */
const BARRA_MAXIMA = ANCHO / 8;

// ---------- El eje X según el ancho real ----------

// Ancho estimado de un rótulo, sin medir texto: text-label mide 12px y en
// Public Sans un dígito tabular ocupa ~8,4px y una letra ~6px. Redondeado
// para arriba a propósito (mejor un rótulo de menos que dos pisados), con
// 8px de aire entre vecinos. Los mismos números que grafico-pulso.tsx.
const PX_POR_DIGITO = 8.5;
const PX_POR_LETRA = 6.5;
const SEPARACION = 8;
const ANCHO_SUPUESTO = 240;

function anchoDeTexto(texto: string): number {
  let ancho = 0;
  for (const c of texto)
    ancho += c >= "0" && c <= "9" ? PX_POR_DIGITO : PX_POR_LETRA;
  return ancho;
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

// «sept», «ago»: por partes y sin timeZone, como toda fecha-calendario.
const MES_CORTO = new Intl.DateTimeFormat("es-AR", { month: "short" });

function nombreDelMes(mes: string): string {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return MES_CORTO.format(new Date(a, m - 1, 1)).replace(".", "");
}

type Rotulo = { indice: number; texto: string; izquierdaPct: number };

// Con un paso dado: qué celdas llevan rótulo (anclado al final: la última
// siempre se ve) y con qué texto (el año en el primero que se muestra y en
// cada cambio de año, para que el eje se ubique solo). La posición se
// calcula después, en `ubicar()`.
function rotulosCon(serie: FilaAltasBajas[], paso: number): Rotulo[] {
  const n = serie.length;
  const salida: Rotulo[] = [];
  let anioAnterior: number | null = null;
  for (let i = 0; i < n; i++) {
    if ((n - 1 - i) % paso !== 0) continue;
    const anio = Number(serie[i].mes.slice(0, 4));
    const nombre = nombreDelMes(serie[i].mes);
    salida.push({
      indice: i,
      texto: anio !== anioAnterior ? `${nombre} ${anio}` : nombre,
      izquierdaPct: 0,
    });
    anioAnterior = anio;
  }
  return salida;
}

// Ubica cada rótulo centrado bajo su barra y lo ancla hacia adentro en los
// bordes (el primero nunca arranca antes del eje, el último nunca termina
// después). Devuelve null si dos vecinos se pisan con ese paso: es el
// mismo criterio que grafico-mrr.tsx. Se hace acá y no con CSS porque con
// muchos meses la celda de cada barra mide menos que su texto, y un rótulo
// centrado en una celda de dos píxeles asomaba fuera de la tarjeta.
function ubicar(
  rotulos: Rotulo[],
  n: number,
  anchoPx: number,
): Rotulo[] | null {
  const celda = anchoPx / n;
  let derechaAnterior = -Infinity;
  const salida: Rotulo[] = [];
  for (const r of rotulos) {
    const ancho = anchoDeTexto(r.texto);
    const centro = (r.indice + 0.5) * celda;
    const izquierda = Math.min(Math.max(centro - ancho / 2, 0), anchoPx - ancho);
    if (izquierda < derechaAnterior + SEPARACION) return null;
    derechaAnterior = izquierda + ancho;
    salida.push({ ...r, izquierdaPct: (izquierda / anchoPx) * 100 });
  }
  return salida;
}

// El primer paso en el que todos los rótulos que se muestran (con su año,
// si lo llevan) caben sin pisarse ni salirse del eje. Se prueba con los
// textos reales de cada paso porque cuáles llevan año depende de cuáles se
// muestran. Termina siempre: con paso = n queda un rótulo solo, anclado.
function elegirRotulos(
  serie: FilaAltasBajas[],
  anchoPx: number | null,
): Rotulo[] {
  const n = serie.length;
  const ancho = anchoPx || ANCHO_SUPUESTO;
  for (let paso = 1; paso < n; paso++) {
    const ubicados = ubicar(rotulosCon(serie, paso), n, ancho);
    if (ubicados) return ubicados;
  }
  return ubicar(rotulosCon(serie, n), n, ancho) ?? [];
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function conSigno(n: number): string {
  if (n > 0) return `+${entero(n)}`;
  if (n < 0) return `${MENOS}${entero(-n)}`;
  return "0";
}

export function GraficoAltasBajas({
  serie,
}: {
  /** Todos los meses del rango, ascendentes, con ceros (como los devuelve la base). */
  serie: FilaAltasBajas[];
}) {
  const [indice, setIndice] = useState<number | null>(null);
  const [ejeX, anchoEje] = useAncho();

  if (serie.length === 0) {
    return (
      <p className="max-w-2xl px-4.5 py-6 text-ui text-ink-60">
        Cuando el rango tenga al menos un mes vas a ver acá las altas hacia
        arriba, las bajas hacia abajo y el neto encima.
      </p>
    );
  }

  const n = serie.length;
  // La escala es simétrica alrededor del cero y la fija el mayor de los
  // tres (altas, bajas o neto en valor absoluto); con todo en cero, 1,
  // para que el eje exista.
  const maximo = Math.max(
    1,
    ...serie.flatMap((p) => [p.altas, p.bajas, Math.abs(p.neto)]),
  );
  const y = scaleLinear({
    domain: [-maximo, maximo],
    range: [ALTO - PISO, PISO],
    nice: true,
  });
  const yMax = y.domain()[1];
  const y0 = y(0);
  const celda = ANCHO / n;
  const centro = (i: number) => (i + 0.5) * celda;
  const anchoBarra = Math.min(celda * BARRA, BARRA_MAXIMA);
  // Solo ticks enteros: son conteos de tenants, y con un máximo de 1 la
  // escala propone 0,5 y −0,5, que redondeados se leerían como dos «1».
  const ticks = y
    .ticks(4)
    .filter((t) => Number.isInteger(t) && Math.abs(t) <= yMax);
  const textoTick = (t: number) =>
    t < 0 ? `${MENOS}${entero(-t)}` : entero(t);
  // La canaleta del eje Y: los rótulos van a la IZQUIERDA del área de las
  // barras, no encima (con trece meses en un celular la primera barra
  // quedaba debajo del «4»). Mide lo que necesita el rótulo más ancho con
  // el mismo estimador y el mismo aire que los del eje X; es un número
  // fijo por serie, igual en el servidor y en el cliente, así que no hay
  // salto al hidratar. El eje X arranca en la misma x para que las celdas
  // de los rótulos sigan alineadas con las barras.
  const canaleta =
    Math.ceil(Math.max(0, ...ticks.map((t) => anchoDeTexto(textoTick(t))))) +
    SEPARACION;
  const rotulos = elegirRotulos(serie, anchoEje);
  const activo = indice !== null ? serie[indice] : null;
  const pctX = (i: number) => ((i + 0.5) / n) * 100;
  const pctY = (v: number) => (y(v) / ALTO) * 100;

  return (
    <div className="px-4.5 pt-4 pb-3">
      <div style={{ paddingLeft: canaleta }}>
        <OverlaySerie
          n={n}
          indice={indice}
          alCambiar={setIndice}
          etiqueta="Altas y bajas por mes"
          tooltip={(i) => (
            <div className="font-ui text-label text-ink tabular-nums">
              <p className="text-ui font-semibold">{mesCorto(serie[i].mes)}</p>
              <p className="mt-0.5 text-ink-60">
                {plural(serie[i].altas, "alta", "altas")} ·{" "}
                {plural(serie[i].bajas, "baja", "bajas")}
              </p>
              <p className="text-ink-60">
                {plural(
                  serie[i].reactivaciones,
                  "reactivación",
                  "reactivaciones",
                )}
              </p>
              <p className="text-ink-60">
                neto{" "}
                <span className="font-semibold text-ink">
                  {conSigno(serie[i].neto)}
                </span>
              </p>
            </div>
          )}
        >
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            preserveAspectRatio="none"
            className="block h-36 w-full sm:h-44 lg:h-[220px]"
            role="img"
            aria-label={`Altas y bajas por mes: ${serie
              .map(
                (p) =>
                  `${mesCorto(p.mes)} ${p.altas} altas, ${p.bajas} bajas, neto ${conSigno(p.neto)}`,
              )
              .join(", ")}`}
          >
            {/* La grilla: una línea por tick, sin decorar; la del cero va aparte, encima de las barras. */}
            {ticks
              .filter((t) => t !== 0)
              .map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={ANCHO}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

            {serie.map((p, i) => (
              <g key={p.mes} data-mes={p.mes.slice(0, 7)}>
                {p.altas > 0 && (
                  <rect
                    data-barra="altas"
                    x={centro(i) - anchoBarra / 2}
                    y={y(p.altas)}
                    width={anchoBarra}
                    height={y0 - y(p.altas)}
                    fill="var(--color-brand)"
                    fillOpacity={indice === null || indice === i ? 1 : 0.7}
                  />
                )}
                {p.bajas > 0 && (
                  <rect
                    data-barra="bajas"
                    x={centro(i) - anchoBarra / 2}
                    y={y0}
                    width={anchoBarra}
                    height={y(-p.bajas) - y0}
                    fill="var(--color-ink)"
                    fillOpacity={indice === null || indice === i ? 1 : 0.7}
                  />
                )}
              </g>
            ))}

            <line
              x1={0}
              x2={ANCHO}
              y1={y0}
              y2={y0}
              stroke="var(--color-ink-40)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {/* El neto, fino, encima de todo. Con un solo mes no hay línea que
              trazar: va un trazo corto sobre la barra, a la altura del neto. */}
            {n >= 2 ? (
              <LinePath
                data={serie}
                x={(_, i) => centro(i)}
                y={(p) => y(p.neto)}
                curve={curveLinear}
                stroke="var(--color-ink-60)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            ) : (
              <line
                x1={centro(0) - anchoBarra / 2}
                x2={centro(0) + anchoBarra / 2}
                y1={y(serie[0].neto)}
                y2={y(serie[0].neto)}
                stroke="var(--color-ink-60)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Las etiquetas del eje Y, en HTML en la canaleta a la izquierda de
            la grilla (pegadas a su borde por la derecha), con signo: la mitad
            de abajo es negativa para el neto y son bajas para las barras. */}
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              data-tick-y
              className="pointer-events-none absolute left-0 -translate-x-full -translate-y-1/2 pr-1 text-label text-ink-40 tabular-nums"
              style={{ top: `${pctY(t)}%` }}
            >
              {textoTick(t)}
            </span>
          ))}

          {activo && indice !== null && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-line"
                style={{ left: `${pctX(indice)}%` }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute size-2.5 rounded-full border-2 border-base bg-ink-60"
                style={{
                  left: `${pctX(indice)}%`,
                  top: `${pctY(activo.neto)}%`,
                  translate: "-50% -50%",
                }}
              />
            </>
          )}
        </OverlaySerie>
      </div>

      {/* Los rótulos van en spans absolutos ubicados por porcentaje del eje
          (`ubicar()`), no en una grilla de una celda por mes: la grilla
          sumaba un gap de 4px por mes y con muchos meses ensanchaba el
          documento, y un rótulo centrado en una celda de dos píxeles se
          salía de la tarjeta. Así el eje mide siempre lo que mide la
          tarjeta, y el primero y el último quedan anclados hacia adentro. */}
      <div
        ref={ejeX}
        data-eje-x
        className="relative mt-1.5 h-4 text-label text-ink-40 tabular-nums"
        style={{ marginLeft: canaleta }}
      >
        {rotulos.map((rotulo) => (
          <span
            key={serie[rotulo.indice].mes}
            className={`absolute top-0 whitespace-nowrap ${
              rotulo.indice === indice ? "font-semibold text-ink" : ""
            }`}
            style={{ left: `${rotulo.izquierdaPct}%` }}
          >
            {rotulo.texto}
          </span>
        ))}
      </div>

      {/* La leyenda, siempre visible. */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-60">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm bg-brand"
          />
          Altas <span className="text-ink-40">hacia arriba</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm bg-ink"
          />
          Bajas <span className="text-ink-40">hacia abajo</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block w-4 border-t-2 border-ink-60"
          />
          Neto <span className="text-ink-40">altas − bajas</span>
        </li>
      </ul>
    </div>
  );
}
