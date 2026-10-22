"use client";

import { useState } from "react";
import { VISTAS_PANEL, type PuntoSerie, type VistaPanel } from "@/lib/series";
import { Segmentado } from "@/components/ui/segmentado";
import { GraficoSerie } from "@/components/graficos/grafico-serie";
import { formatearPesos } from "@/lib/presupuestos";
import {
  METRICAS_CAJA,
  valorMetrica,
  type MetricaCaja,
  type PuntoCaja,
} from "@/lib/finanzas";

// ============================================================
// La evolución de la caja en el tiempo, estilo dashboard.
//
// MISMO GRÁFICO que el Pulso de /fidelli y los services del Inicio: monta
// components/graficos/grafico-serie.tsx. Lo propio de acá son dos
// selectores —qué se muestra (ingresos / egresos / neto) y el período— y
// que el valor es PLATA, así que el eje y el tooltip van en pesos
// (formatear). El estado es local: son preferencias de vista, no van a la
// URL (la lista de abajo usa ?pagina= y no la queremos pisar).
// ============================================================
export function GraficoCaja({
  series,
  vistaInicial,
}: {
  series: Record<VistaPanel, PuntoCaja[]>;
  vistaInicial: VistaPanel;
}) {
  const [vista, setVista] = useState<VistaPanel>(vistaInicial);
  const [metrica, setMetrica] = useState<MetricaCaja>("ingresos");

  const puntos = series[vista] ?? [];
  const serie: PuntoSerie[] = puntos.map((p) => ({
    inicio: p.inicio,
    cantidad: valorMetrica(p, metrica),
  }));
  const meta = VISTAS_PANEL.find((v) => v.clave === vista)!;
  const metricaMeta = METRICAS_CAJA.find((m) => m.clave === metrica)!;
  const total = serie.reduce((s, p) => s + p.cantidad, 0);

  return (
    <section className="surface-card mb-5 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4.5 py-4">
        <div>
          <p className="font-brand text-h2 font-bold text-ink tabular-nums">
            {formatearPesos(total)}
          </p>
          <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            {metricaMeta.nombre} · {meta.descripcion}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            etiqueta="Qué se muestra"
            opciones={METRICAS_CAJA}
            valor={metrica}
            alCambiar={setMetrica}
          />
          <Segmentado
            etiqueta="Período del gráfico"
            opciones={VISTAS_PANEL}
            valor={vista}
            alCambiar={setVista}
          />
        </div>
      </div>

      <div key={`${vista}-${metrica}`} className="animar-aparicion">
        <GraficoSerie
          serie={serie}
          unidad={vista}
          ultimoEnCurso
          formatear={formatearPesos}
          vacio={{
            sinDatos: "Cuando registres movimientos, acá vas a ver cómo evoluciona tu caja.",
            unSoloPunto: "tu primer período. Con dos ya hay curva.",
          }}
        />
      </div>
    </section>
  );
}
