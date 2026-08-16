"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GRANULARIDADES,
  type Granularidad,
  type PuntoSerie,
} from "@/lib/series";
import { Segmentado } from "@/components/ui/segmentado";
import { GraficoSerie } from "@/components/graficos/grafico-serie";

// ============================================================
// El pulso de la plataforma: cuántos services entran, en el tiempo.
//
// El dibujo vive en components/graficos/grafico-serie.tsx, compartido
// con el panel del lubricentro. Acá queda lo propio de esta superficie:
// el acumulado histórico, el selector de granularidad y el cableado con
// la URL.
//
// LAS TRES SERIES LLEGAN JUNTAS y el toggle cambia de serie al instante
// (useState); router.replace corre atrás en una transición para que la
// URL siga siendo compartible y los <Link> del filtro de atención —que
// el server renderiza con ?pulso= adentro— se re-sincronicen. Se edita
// SOLO la clave pulso del querystring: el filtro ?atencion=1 sobrevive.
//
// El último período NO se marca como en curso acá, a diferencia del
// panel: este número es el latido de la plataforma y se mira para ver si
// entra trabajo hoy, no para comparar períodos cerrados entre sí.
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

  function cambiar(g: Granularidad) {
    setGranularidad(g);
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
        <GraficoSerie
          serie={series[granularidad]}
          unidad={granularidad}
          vacio={{
            sinDatos:
              "Todavía no se cargó ningún service en la plataforma. Acá va a aparecer el pulso en cuanto entre el primero.",
            unSoloPunto:
              "el primer período de la plataforma. Con dos ya hay curva.",
          }}
        />
      </div>
    </section>
  );
}
