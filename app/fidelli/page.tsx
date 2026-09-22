import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/fechas";
import { leerResumen } from "@/lib/fidelli/resumen";
import { serieObjetivo } from "@/lib/fidelli/objetivo";
import { esGranularidad, type Granularidad, type PuntoSerie } from "@/lib/series";
import { FranjaResumen } from "@/components/fidelli/franja-resumen";
import { GraficoMrr } from "@/components/fidelli/grafico-mrr";
import { esMoneda, type Moneda, type PuntoMrr } from "@/lib/fidelli/mrr";
import { Pulso } from "@/components/fidelli/pulso";
import { Alertas } from "@/components/fidelli/alertas";

export const metadata: Metadata = { title: "Resumen" };

// ============================================================
// El Resumen de /fidelli: lo que se mira a la mañana.
//
// Cinco números con su comparación, el MRR contra el objetivo, el pulso de
// trabajos y las alertas del día. Tres lecturas y nada más: resumen_admin()
// (los números y los conteos de las alertas), snapshots_diarios (la serie
// del MRR, que se lee y no se recalcula) y metricas_plataforma() (el pulso).
// El listado vive en /fidelli/lubricentros.
// ============================================================
export default async function PaginaResumen({
  searchParams,
}: {
  searchParams: Promise<{ pulso?: string; moneda?: string }>;
}) {
  const { pulso, moneda } = await searchParams;
  // Semanal por defecto: con pocos datos es el que mejor se lee.
  const granularidad: Granularidad = esGranularidad(pulso) ? pulso : "semana";
  // Dólares por defecto: es la moneda del objetivo.
  const monedaInicial: Moneda = esMoneda(moneda) ? moneda : "usd";

  const supabase = await createClient();

  const [resumenRes, snapshotsRes, plataformaRes] = await Promise.all([
    supabase.rpc("resumen_admin"),
    supabase
      .from("snapshots_diarios")
      .select("fecha, mrr_ars, mrr_usd, tenants_activos, tc_venta, fuente")
      .order("fecha"),
    supabase.rpc("metricas_plataforma"),
  ]);

  const resumen = leerResumen(resumenRes.data);

  const hoy = hoyISO();
  const snapshots = snapshotsRes.data ?? [];
  const serie: PuntoMrr[] = snapshots
    .filter((s) => s.fecha < hoy)
    .map((s) => ({
      fecha: s.fecha,
      mrrArs: Number(s.mrr_ars),
      mrrUsd: s.mrr_usd == null ? null : Number(s.mrr_usd),
      tenantsActivos: Number(s.tenants_activos),
      tcVenta: s.tc_venta == null ? null : Number(s.tc_venta),
      fuente: s.fuente === "reconstruido" ? "reconstruido" : "cierre",
    }));
  // El punto de hoy, en vivo: el snapshot de hoy recién existe mañana a
  // las 00:10, y el gráfico tiene que terminar en «hoy».
  serie.push({
    fecha: hoy,
    mrrArs: resumen.mrr_ars,
    mrrUsd: resumen.mrr_usd,
    tenantsActivos: resumen.activos,
    tcVenta: resumen.tc_venta,
    fuente: "vivo",
  });

  const metricas = (plataformaRes.data ?? {}) as {
    trabajos_mes?: number;
    acumulado?: number;
    series?: Partial<Record<Granularidad, PuntoSerie[]>>;
  };
  const series: Record<Granularidad, PuntoSerie[]> = {
    dia: metricas.series?.dia ?? [],
    semana: metricas.series?.semana ?? [],
    mes: metricas.series?.mes ?? [],
  };

  return (
    <div>
      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">Resumen</h1>

      <FranjaResumen r={resumen} />

      <GraficoMrr serie={serie} objetivo={serieObjetivo()} monedaInicial={monedaInicial} />

      <Pulso
        series={series}
        acumulado={metricas.acumulado ?? 0}
        granularidadInicial={granularidad}
      />

      <Alertas r={resumen} />
    </div>
  );
}
