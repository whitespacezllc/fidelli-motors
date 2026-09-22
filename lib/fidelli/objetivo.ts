// ============================================================
// El objetivo de MRR, en USD, mes a mes hasta marzo de 2028.
//
// Son la META, no una proyección: los fijó el brief del bloque MÉTRICAS 2
// (22/09/2026) y se mueven solo a mano, acá. El gráfico del Resumen los
// dibuja punteados sobre la serie real y marca la referencia de los
// US$ 10.000 con una línea fina. Solo tienen sentido en dólares: en pesos
// no hay objetivo, porque un número en ARS se vuelve otro con cada
// devaluación sin que nadie haya vendido nada.
//
// Cada fila es el MRR al ÚLTIMO DÍA del mes.
// ============================================================

export const OBJETIVO_MRR_USD: readonly { mes: string; usd: number }[] = [
  { mes: "2026-09", usd: 510 },
  { mes: "2026-10", usd: 930 },
  { mes: "2026-11", usd: 1380 },
  { mes: "2026-12", usd: 1770 },
  { mes: "2027-01", usd: 2370 },
  { mes: "2027-02", usd: 2970 },
  { mes: "2027-03", usd: 3540 },
  { mes: "2027-04", usd: 4290 },
  { mes: "2027-05", usd: 4980 },
  { mes: "2027-06", usd: 5670 },
  { mes: "2027-07", usd: 6360 },
  { mes: "2027-08", usd: 6990 },
  { mes: "2027-09", usd: 7620 },
  { mes: "2027-10", usd: 8370 },
  { mes: "2027-11", usd: 9060 },
  { mes: "2027-12", usd: 9750 },
  { mes: "2028-01", usd: 10410 },
  { mes: "2028-02", usd: 11070 },
  { mes: "2028-03", usd: 11700 },
];

/** La línea horizontal de referencia del gráfico: la meta redonda. */
export const REFERENCIA_MRR_USD = 10_000;

export type PuntoObjetivo = { fecha: string; usd: number };

// "2026-09" → "2026-09-30". Aritmética pura de calendario (Date.UTC), sin
// depender de la zona horaria del proceso.
export function finDeMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return `${mes}-${String(ultimoDia).padStart(2, "0")}`;
}

/** El objetivo como serie de fechas (fin de cada mes), lista para dibujar. */
export function serieObjetivo(): PuntoObjetivo[] {
  return OBJETIVO_MRR_USD.map((o) => ({ fecha: finDeMes(o.mes), usd: o.usd }));
}
