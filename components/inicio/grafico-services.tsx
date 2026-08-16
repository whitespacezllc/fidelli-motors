"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { scaleBand, scaleLinear } from "@visx/scale";
import {
  VISTAS_PANEL,
  etiquetaDePunto,
  mostrarEtiqueta,
  pasoDeEtiquetas,
  type PuntoSerie,
  type VistaPanel,
} from "@/lib/series";
import { Segmentado } from "@/components/ui/segmentado";
import { OverlaySerie } from "@/components/graficos/overlay-serie";

const ANCHO = 600;
const ALTO = 120;

// ============================================================
// Los services del lubricentro, por semana / mes / trimestre / año.
//
// LAS CUATRO SERIES LLEGAN JUNTAS de resumen_inicio (sigue siendo una
// consulta por pantalla) y el toggle cambia de serie al instante;
// router.replace corre atrás para que la URL quede compartible. Se edita
// solo la clave `vista` del querystring: ?sucursal= sobrevive.
//
// EL SVG SOLO DIBUJA GEOMETRÍA. Se estira en horizontal
// (preserveAspectRatio="none"): las barras son rectángulos y estirarlas
// no deforma nada. Los textos —valores arriba, etiquetas abajo— van en
// HTML alineados por una grilla de n columnas, y el resalte del hover
// también: nada que deba conservar su forma vive adentro del SVG.
//
// LA GRILLA Y LAS BARRAS COMPARTEN EL REPARTO: paddingOuter = inner/2
// hace que el centro de la banda i caiga exactamente en (i+0.5)/n, que
// es el centro de la celda i de la grilla HTML y el ancla del tooltip.
//
// LAS BARRAS VAN KEYED POR ÍNDICE, no por fecha: semana(12) ↔ mes(12)
// morphean barra a barra con la transición CSS de y/height, y contra
// trimestre(8) las cuatro sobrantes entran y salen. Con reduced-motion
// no anima nada.
//
// El último punto de TODA vista está en curso —la semana, el mes, el
// trimestre o el año no terminaron— y se pinta más claro (fill-line):
// no es comparable con los cerrados y fingir que sí miente la tendencia.
// ============================================================
export function GraficoServices({
  series,
  vistaInicial,
}: {
  series: Record<VistaPanel, PuntoSerie[]>;
  vistaInicial: VistaPanel;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [vista, setVista] = useState(vistaInicial);
  const [indice, setIndice] = useState<number | null>(null);

  const serie = series[vista];
  const meta = VISTAS_PANEL.find((v) => v.clave === vista)!;

  function cambiar(v: VistaPanel) {
    setVista(v);
    setIndice(null);
    iniciar(() => {
      const params = new URLSearchParams(searchParams);
      params.set("vista", v);
      router.replace(`/panel?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <section className="rounded-lg border border-line px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-brand text-body font-bold text-ink">Services</h2>
          <p className="mt-0.5 text-label text-ink-40">
            {serie.length > 0
              ? `${meta.descripcion} · ${etiquetaDePunto(serie[serie.length - 1].inicio, vista)} en curso`
              : meta.descripcion}
          </p>
        </div>
        <Segmentado
          etiqueta="Período del gráfico"
          opciones={VISTAS_PANEL}
          valor={vista}
          alCambiar={cambiar}
        />
      </div>

      <div className="mt-4">
        <Barras
          serie={serie}
          vista={vista}
          indice={indice}
          alCambiar={setIndice}
        />
      </div>
    </section>
  );
}

function Barras({
  serie,
  vista,
  indice,
  alCambiar,
}: {
  serie: PuntoSerie[];
  vista: VistaPanel;
  indice: number | null;
  alCambiar: (i: number | null) => void;
}) {
  if (serie.length === 0) {
    return (
      <p className="py-6 text-center text-ui text-ink-60">
        Cuando cargues el primer service, acá va a aparecer la evolución.
      </p>
    );
  }

  const n = serie.length;
  const maximo = Math.max(...serie.map((d) => d.cantidad));
  const enCurso = n - 1;

  const x = scaleBand({
    domain: serie.map((_, i) => i),
    range: [0, ANCHO],
    // outer = inner / 2: así el centro de cada banda cae en (i+0.5)/n y
    // las barras calzan con la grilla HTML de valores y etiquetas.
    paddingInner: 0.42,
    paddingOuter: 0.21,
  });
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO, 0],
  });

  const grilla = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  // Las etiquetas anchas se saltean para no pisarse (12 "dd/MM" no entran
  // en un celular); los valores de arriba siempre están — son el eje Y de
  // este gráfico.
  const paso = pasoDeEtiquetas(n, vista);

  return (
    <div>
      {/* Los valores arriba reemplazan al eje Y: se lee el número exacto
          en vez de estimarlo contra una grilla. */}
      <div className="grid gap-1 text-center" style={grilla}>
        {serie.map((d, i) => (
          <span
            key={i}
            className={`text-ui font-semibold tabular-nums transition-colors motion-reduce:transition-none ${
              i === indice
                ? "text-ink"
                : i === enCurso
                  ? "text-ink-40"
                  : indice !== null
                    ? "text-ink-40"
                    : "text-ink"
            }`}
          >
            {d.cantidad}
          </span>
        ))}
      </div>

      <OverlaySerie
        n={n}
        indice={indice}
        alCambiar={alCambiar}
        etiqueta={`Services por ${vista}`}
        tooltip={(i) => (
          <p className="font-ui text-ui text-ink">
            <span className="font-semibold tabular-nums">
              {serie[i].cantidad}
            </span>{" "}
            {serie[i].cantidad === 1 ? "service" : "services"}
            <span className="text-ink-60">
              {" "}
              · {etiquetaDePunto(serie[i].inicio, vista)}
              {i === n - 1 ? " (en curso)" : ""}
            </span>
          </p>
        )}
      >
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Services por ${vista}: ${serie
            .map((d) => `${etiquetaDePunto(d.inicio, vista)} ${d.cantidad}`)
            .join(", ")}`}
          className="mt-1.5 block h-28 w-full sm:h-32"
        >
          {serie.map((d, i) => {
            const alto = ALTO - y(d.cantidad);
            return (
              <rect
                // Por ÍNDICE a propósito: entre vistas del mismo largo la
                // barra i morphea de un valor al otro en vez de
                // desmontarse.
                key={i}
                x={x(i) ?? 0}
                // Un período en cero deja 2px de zócalo: la barra existe
                // aunque valga cero, que es distinto de que falte.
                y={ALTO - Math.max(alto, 2)}
                width={x.bandwidth()}
                height={Math.max(alto, 2)}
                rx="2"
                className={`transition-[x,y,width,height,opacity] duration-200 ease-out motion-reduce:transition-none ${
                  i === enCurso ? "fill-line" : "fill-ink"
                } ${indice !== null && indice !== i ? "opacity-40" : ""}`}
              />
            );
          })}
        </svg>
      </OverlaySerie>

      <div className="mt-1.5 grid gap-1 text-center" style={grilla}>
        {serie.map((d, i) => (
          <span
            key={i}
            className={`text-label ${
              i === indice
                ? "font-semibold text-ink"
                : i === enCurso
                  ? "text-ink-40"
                  : "text-ink-60"
            }`}
          >
            {mostrarEtiqueta(i, n, paso) ? etiquetaDePunto(d.inicio, vista) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
