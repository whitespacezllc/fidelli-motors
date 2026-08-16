"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AreaClosed, LinePath } from "@visx/shape";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import {
  GRANULARIDADES,
  etiquetaDePunto,
  mostrarEtiqueta,
  pasoDeEtiquetas,
  type Granularidad,
  type PuntoSerie,
} from "@/lib/series";
import { Segmentado } from "@/components/ui/segmentado";
import { OverlaySerie } from "@/components/graficos/overlay-serie";

const ANCHO = 900;
const ALTO = 200;
// Aire abajo para que la curva no muerda el borde; arriba para el pico.
const PISO = 8;

// ============================================================
// El pulso de la plataforma — ahora interactivo.
//
// Área cerrada con gradiente, como la cotización de algo que acaba de
// salir al mercado: el día uno es hoy y de acá en adelante se llena.
//
// LAS TRES SERIES LLEGAN JUNTAS y el toggle cambia de serie al instante
// (useState); router.replace corre atrás en una transición para que la
// URL siga siendo compartible y los <Link> del filtro de atención —que el
// server renderiza con ?pulso= adentro— se re-sincronicen. Se edita SOLO
// la clave pulso del querystring: el filtro ?atencion=1 sobrevive.
//
// LA GEOMETRÍA VA POR ÍNDICE, no por scaleTime: las etiquetas, el overlay
// y el tooltip reparten el ancho en n celdas iguales, y una escala de
// tiempo desalinea la curva de sus etiquetas en meses de 28-31 días.
// Cada punto cae en el CENTRO de su celda — (i + 0.5) / n — y esa misma
// fracción posiciona el marcador y el tooltip en HTML con `left: %`, que
// es lo único que sobrevive al estiramiento del SVG
// (preserveAspectRatio="none"). Un <circle> adentro del SVG se
// deformaría en elipse; por eso el marcador del hover es un div.
//
// COLOR — se evaluó el rojo de marca muy diluido y quedó en los neutros.
// Razón: la tabla de abajo ya está llena de color de estado (verde de "al
// día", ámbar de lo vencido) y esos colores tienen que ganar, porque son
// los que dicen a quién llamar hoy. La línea en ink con el relleno
// degradado tiene la lectura financiera que busca la metáfora.
//
// DEGRADACIÓN — cada serie llega de la base ya recortada al primer
// service de la historia: con tres días de datos hay tres puntos, no
// veintisiete ceros previos al lanzamiento. Los períodos sin services SÍ
// van en cero y visibles: un domingo cerrado es información.
// ============================================================
export function Pulso({
  series,
  acumulado,
  granularidadInicial,
}: {
  series: Record<Granularidad, PuntoSerie[]>;
  acumulado: number;
  granularidadInicial: Granularidad;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [granularidad, setGranularidad] = useState(granularidadInicial);
  const [indice, setIndice] = useState<number | null>(null);

  function cambiar(g: Granularidad) {
    setGranularidad(g);
    setIndice(null);
    // La URL atrás, sin bloquear el cambio visual. Se toca solo `pulso`:
    // pisar el querystring entero se llevaría puesto ?atencion=1.
    iniciar(() => {
      const params = new URLSearchParams(searchParams);
      params.set("pulso", g);
      router.replace(`/fidelli?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <section className="surface-card mb-5 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4.5 py-4">
        <div>
          <p className="font-brand text-h2 font-bold text-ink tabular-nums">
            {acumulado.toLocaleString("es-AR")}
          </p>
          <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Services desde el día uno
          </p>
        </div>

        <Segmentado
          etiqueta="Granularidad del gráfico"
          opciones={GRANULARIDADES}
          valor={granularidad}
          alCambiar={cambiar}
        />
      </div>

      {/* key: al cambiar de serie el bloque se remonta con la aparición
          suave de la casa — un crossfade barato sin animar `d`, que entre
          series de 30 y 12 puntos no es interpolable. */}
      <div key={granularidad} className="animar-aparicion">
        <Grafico
          serie={series[granularidad]}
          granularidad={granularidad}
          indice={indice}
          alCambiar={setIndice}
        />
      </div>
    </section>
  );
}

function Grafico({
  serie,
  granularidad,
  indice,
  alCambiar,
}: {
  serie: PuntoSerie[];
  granularidad: Granularidad;
  indice: number | null;
  alCambiar: (i: number | null) => void;
}) {
  if (serie.length === 0) {
    return (
      <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">
        Todavía no se cargó ningún service en la plataforma. Acá va a aparecer
        el pulso en cuanto entre el primero.
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
          {etiquetaDePunto(serie[0].inicio, granularidad)} — el primer período
          de la plataforma. Con dos ya hay curva.
        </p>
      </div>
    );
  }

  const n = serie.length;
  const maximo = Math.max(...serie.map((p) => p.cantidad));

  // El centro de la celda i, en coordenadas del viewBox.
  const x = (i: number) => ((i + 0.5) / n) * ANCHO;

  // Con todo en cero el dominio sería [0,0] y no habría escala: el max de 1
  // deja el gráfico plano contra el piso, que es exactamente lo que pasó.
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });

  const activo = indice !== null ? serie[indice] : null;

  return (
    <div className="border-t border-line px-4.5 pt-4 pb-3">
      <OverlaySerie
        n={n}
        indice={indice}
        alCambiar={alCambiar}
        etiqueta={`Services por ${granularidad}`}
        tooltip={(i) => (
          <p className="font-ui text-ui text-ink">
            <span className="font-semibold tabular-nums">
              {serie[i].cantidad}
            </span>{" "}
            {serie[i].cantidad === 1 ? "service" : "services"}
            <span className="text-ink-60">
              {" "}
              · {etiquetaDePunto(serie[i].inicio, granularidad)}
            </span>
          </p>
        )}
      >
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="block h-[200px] w-full"
          role="img"
          aria-label={`Services por ${granularidad}: ${serie
            .map((p) => `${etiquetaDePunto(p.inicio, granularidad)} ${p.cantidad}`)
            .join(", ")}`}
        >
          <LinearGradient
            id="pulso-relleno"
            from="var(--color-ink)"
            to="var(--color-ink)"
            fromOpacity={0.16}
            toOpacity={0}
          />

          <AreaClosed
            data={serie}
            x={(_, i) => x(i)}
            y={(d) => y(d.cantidad)}
            yScale={y}
            curve={curveMonotoneX}
            fill="url(#pulso-relleno)"
          />

          {/* El borde superior definido y el relleno suave: la línea es la
              que se lee, el área solo le da cuerpo. */}
          <LinePath
            data={serie}
            x={(_, i) => x(i)}
            y={(d) => y(d.cantidad)}
            curve={curveMonotoneX}
            stroke="var(--color-ink)"
            strokeWidth={2}
            // El SVG se estira en horizontal: sin esto el trazo se
            // engrosaría con el escalado.
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
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
          pesada: lo mínimo para leer la tendencia. */}
      <div
        className="mt-1.5 grid gap-1 text-center text-label text-ink-40 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {serie.map((p, i) => (
          // Las etiquetas anchas se saltean para no pisarse — ancladas a
          // la última, que siempre se ve. Las salteadas van vacías y no
          // ocultas: una etiqueta invisible sigue ocupando su ancho y se
          // desborda de la celda en pantallas angostas.
          <span
            key={p.inicio}
            className={i === indice ? "font-semibold text-ink" : undefined}
          >
            {mostrarEtiqueta(i, n, pasoDeEtiquetas(n, granularidad))
              ? etiquetaDePunto(p.inicio, granularidad)
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
