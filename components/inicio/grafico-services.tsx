"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  VISTAS_PANEL,
  type PuntoSerie,
  type VistaPanel,
} from "@/lib/series";
import { Segmentado } from "@/components/ui/segmentado";
import { GraficoSerie } from "@/components/graficos/grafico-serie";

// ============================================================
// Los services del lubricentro, en el tiempo.
//
// MISMO GRÁFICO QUE EL PULSO DE /fidelli, literalmente: los dos montan
// components/graficos/grafico-serie.tsx. Antes esto eran barras y aquello
// una curva; ahora es una sola pieza y las dos superficies se leen igual.
// Lo propio de acá son el total del período, las cuatro vistas y el
// cableado con la URL.
//
// LAS CUATRO SERIES LLEGAN JUNTAS de resumen_inicio (sigue siendo una
// consulta por pantalla) y el toggle cambia de serie al instante;
// router.replace corre atrás para que la URL quede compartible. Se edita
// solo la clave `vista` del querystring: ?sucursal= sobrevive.
//
// EL ÚLTIMO PERÍODO VA EN CURSO —la semana, el mes, el trimestre o el año
// no terminaron— y su tramo se dibuja punteado. Es la diferencia con el
// Pulso, y no es cosmética: acá el dueño compara períodos entre sí, y una
// línea llena hasta un mes a medio andar se lee como una caída del
// negocio que no existe.
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

  const serie = series[vista];
  const meta = VISTAS_PANEL.find((v) => v.clave === vista)!;
  const total = serie.reduce((suma, p) => suma + p.cantidad, 0);

  function cambiar(v: VistaPanel) {
    setVista(v);
    iniciar(() => {
      const params = new URLSearchParams(searchParams);
      params.set("vista", v);
      router.replace(`/panel?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4.5 py-4">
        <div>
          {/* El total del período visible, en el lugar del acumulado del
              Pulso: da la magnitud de un vistazo, que es lo que el eje Y
              no está para dar. */}
          <p className="font-brand text-h2 font-bold text-ink tabular-nums">
            {total.toLocaleString("es-AR")}
          </p>
          <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Trabajos · {meta.descripcion}
          </p>
        </div>

        <Segmentado
          etiqueta="Período del gráfico"
          opciones={VISTAS_PANEL}
          valor={vista}
          alCambiar={cambiar}
        />
      </div>

      <div key={vista} className="animar-aparicion">
        <GraficoSerie
          serie={serie}
          unidad={vista}
          ultimoEnCurso
          vacio={{
            sinDatos:
              "Cuando cargues el primer trabajo, acá va a aparecer la evolución de tu taller.",
            unSoloPunto: "tu primer período. Con dos ya hay curva.",
          }}
        />
      </div>
    </section>
  );
}
