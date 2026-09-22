import { formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import { dolares, enteroAR, variacion, type ResumenAdmin } from "@/lib/fidelli/resumen";

// ============================================================
// Los cinco números del Resumen, cada uno con su comparación al lado.
//
// Un número solo no dice nada: 17 activos son buenos o malos según cuántos
// eran el mes pasado. Por eso cada tarjeta lleva dos líneas debajo de la
// cifra —qué es, y contra qué se compara— y ninguna cifra queda sin la
// segunda. Todo sale de resumen_admin(); acá no se calcula nada más que
// el porcentaje.
// ============================================================

function Tarjeta({
  valor,
  etiqueta,
  comparacion,
  detalle,
}: {
  valor: string;
  etiqueta: string;
  /** La segunda línea: contra qué se compara. Siempre hay una. */
  comparacion: string;
  /** Una línea más, opcional, para el desglose. */
  detalle?: string;
}) {
  return (
    <div className="surface-card min-w-0 px-4 py-3.5">
      <p className="truncate font-brand text-h3 font-bold text-ink tabular-nums">{valor}</p>
      <p className="mt-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
        {etiqueta}
      </p>
      {detalle && <p className="mt-1 text-label text-ink-60 tabular-nums">{detalle}</p>}
      <p className="mt-0.5 text-label text-ink-40 tabular-nums">{comparacion}</p>
    </div>
  );
}

function conSigno(n: number): string {
  if (n > 0) return `+${enteroAR(n)}`;
  if (n < 0) return `−${enteroAR(Math.abs(n))}`;
  return "0";
}

export function FranjaResumen({ r }: { r: ResumenAdmin }) {
  // El MRR se compara en pesos: es la moneda en la que se cobra y en la
  // que está el snapshot. La lectura en dólares va al lado, con el TC.
  const cambioMrr = variacion(r.mrr_ars, r.mrr_ars_fin_mes_anterior);
  const comparacionMrr =
    cambioMrr && r.fin_mes_anterior
      ? `${cambioMrr} vs. ${formatearFecha(r.fin_mes_anterior)}`
      : "sin historia todavía";

  const enDolares =
    r.mrr_usd != null && r.tc_venta != null
      ? `${dolares(r.mrr_usd)} · TC ${enteroAR(r.tc_venta)}${r.tc_fecha ? ` del ${formatearFecha(r.tc_fecha).slice(0, 5)}` : ""}`
      : "sin tipo de cambio cargado";

  const netoDelMes = r.altas_mes - r.bajas_mes;

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tarjeta
        valor={pesos(r.mrr_ars)}
        etiqueta="MRR"
        detalle={enDolares}
        comparacion={comparacionMrr}
      />

      <Tarjeta
        valor={enteroAR(r.activos)}
        etiqueta="Tenants activos"
        comparacion={
          netoDelMes === 0 ? "sin cambios este mes" : `${conSigno(netoDelMes)} este mes`
        }
      />

      <Tarjeta
        valor={enteroAR(r.altas_mes)}
        etiqueta="Altas del mes"
        comparacion={`${enteroAR(r.altas_mes_anterior)} el mes pasado`}
      />

      <Tarjeta
        valor={enteroAR(r.bajas_mes)}
        etiqueta="Bajas del mes"
        detalle={`${enteroAR(r.bajas_involuntarias_mes)} ${r.bajas_involuntarias_mes === 1 ? "involuntaria" : "involuntarias"}`}
        comparacion={`${enteroAR(r.bajas_mes_anterior)} el mes pasado`}
      />

      <Tarjeta
        valor={enteroAR(r.trabajos_mes)}
        etiqueta="Trabajos del mes"
        detalle={`${enteroAR(r.trabajos_service)} service · ${enteroAR(r.trabajos_mecanica)} mecánica · ${enteroAR(r.trabajos_neumaticos)} neumáticos`}
        comparacion={`${enteroAR(r.trabajos_mes_anterior)} el mes pasado`}
      />
    </div>
  );
}
