// ============================================================
// El contrato de resumen_admin() (migración 20260923100000), leído con
// tolerancia: PostgREST devuelve numeric como string y jsonb como lo que
// sea, así que cada campo pasa por su coerción antes de llegar a una
// pantalla. Un número que no está es 0; una fecha que no está es null.
// ============================================================

export type TenantAlerta = { id: string; nombre: string; dias: number | null };

export type ResumenAdmin = {
  mrr_ars: number;
  tc_venta: number | null;
  tc_fecha: string | null;
  mrr_usd: number | null;
  fin_mes_anterior: string | null;
  mrr_ars_fin_mes_anterior: number | null;
  mrr_usd_fin_mes_anterior: number | null;

  activos: number;
  altas_mes: number;
  altas_mes_anterior: number;
  bajas_mes: number;
  bajas_involuntarias_mes: number;
  bajas_mes_anterior: number;

  trabajos_mes: number;
  trabajos_service: number;
  trabajos_mecanica: number;
  trabajos_neumaticos: number;
  trabajos_mes_anterior: number;

  cierre_ayer: boolean;
  ultimo_snapshot: string | null;
  ordenes_cresium: number;
  atencion: number;
  sin_origen: number;
  sin_trabajos: TenantAlerta[];
  owner_pendiente: TenantAlerta[];
};

type Obj = Record<string, unknown>;

function entero(v: unknown): number {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? 0 : n;
}

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function textoONull(v: unknown): string | null {
  return v == null ? null : String(v);
}

function tenants(v: unknown): TenantAlerta[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Obj)
    .filter((x) => typeof x.id === "string" && typeof x.nombre === "string")
    .map((x) => ({ id: x.id as string, nombre: x.nombre as string, dias: numeroONull(x.dias) }));
}

export function leerResumen(v: unknown): ResumenAdmin {
  const r = (v && typeof v === "object" ? v : {}) as Obj;
  return {
    mrr_ars: entero(r.mrr_ars),
    tc_venta: numeroONull(r.tc_venta),
    tc_fecha: textoONull(r.tc_fecha),
    mrr_usd: numeroONull(r.mrr_usd),
    fin_mes_anterior: textoONull(r.fin_mes_anterior),
    mrr_ars_fin_mes_anterior: numeroONull(r.mrr_ars_fin_mes_anterior),
    mrr_usd_fin_mes_anterior: numeroONull(r.mrr_usd_fin_mes_anterior),

    activos: entero(r.activos),
    altas_mes: entero(r.altas_mes),
    altas_mes_anterior: entero(r.altas_mes_anterior),
    bajas_mes: entero(r.bajas_mes),
    bajas_involuntarias_mes: entero(r.bajas_involuntarias_mes),
    bajas_mes_anterior: entero(r.bajas_mes_anterior),

    trabajos_mes: entero(r.trabajos_mes),
    trabajos_service: entero(r.trabajos_service),
    trabajos_mecanica: entero(r.trabajos_mecanica),
    trabajos_neumaticos: entero(r.trabajos_neumaticos),
    trabajos_mes_anterior: entero(r.trabajos_mes_anterior),

    cierre_ayer: r.cierre_ayer === true,
    ultimo_snapshot: textoONull(r.ultimo_snapshot),
    ordenes_cresium: entero(r.ordenes_cresium),
    atencion: entero(r.atencion),
    sin_origen: entero(r.sin_origen),
    sin_trabajos: tenants(r.sin_trabajos),
    owner_pendiente: tenants(r.owner_pendiente),
  };
}

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** «US$ 512», sin decimales: el dólar del MRR es una lectura, no una factura. */
export function dolares(n: number): string {
  return `US$ ${ENTERO.format(n)}`;
}

export function enteroAR(n: number): string {
  return ENTERO.format(n);
}

/** «+12%», «−3%», «sin cambios». Null cuando no hay contra qué comparar. */
export function variacion(actual: number, anterior: number | null): string | null {
  if (anterior == null) return null;
  if (anterior === 0) return actual === 0 ? "sin cambios" : "desde cero";
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return "sin cambios";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}
