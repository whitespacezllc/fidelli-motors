import { abonoMensual, type Periodo } from "@/lib/fidelli/plan";
import type { FilaLubricentro } from "@/components/fidelli/tipos";

// ============================================================
// La franja de totales, calculada sobre las filas que la pantalla YA
// trajo. No hay una consulta más: listado_lubricentros() devuelve el
// precio del plan, sus dos descuentos de lista, el período y el descuento
// propio de cada tenant, que es exactamente lo que hace falta.
//
// Y el MRR se calcula acá y no en SQL por una razón concreta: la cadena de
// descuentos —primero el de lista del período, después el del cliente—
// vive en abonoMensual(). Repetirla en una consulta sería tener dos
// versiones de la misma regla comercial, y el día que cambie una va a
// quedar la otra. El resumen de la ficha, el wizard y esta franja tienen
// que dar el mismo número siempre.
// ============================================================

export type Totales = {
  activos: number;
  /** Ya normalizado: abonoMensual() devuelve el equivalente mensual, así
   *  que el anual entra dividido 12 y el semestral dividido 6. */
  mrr: number;
  /** Lo que sumaría el MRR si los trials en curso convirtieran. */
  pipelineTrials: number;
  trials: number;
  /** Los dos vencimientos de trial más cercanos, para el subtexto. */
  proximosTrials: string[];
};

function mensualDe(fila: FilaLubricentro): number {
  if (!fila.plan_id || !fila.sub_periodo) return 0;
  return abonoMensual(
    {
      precio_mensual: Number(fila.plan_precio ?? 0),
      descuento_semestral_pct: Number(fila.plan_desc_sem ?? 0),
      descuento_anual_pct: Number(fila.plan_desc_anual ?? 0),
    },
    fila.sub_periodo as Periodo,
    Number(fila.sub_descuento_pct ?? 0),
  );
}

export function calcularTotales(filas: FilaLubricentro[]): Totales {
  // "Activo" es la suscripción en estado activa. Un trial todavía no paga
  // —por eso tiene su propio número— y una vencida dejó de pagar.
  const activos = filas.filter((f) => f.sub_estado === "activa");
  const trials = filas.filter((f) => f.sub_estado === "trial");

  const sumar = (xs: FilaLubricentro[]) =>
    Math.round(xs.reduce((total, f) => total + mensualDe(f), 0) * 100) / 100;

  return {
    activos: activos.length,
    mrr: sumar(activos),
    pipelineTrials: sumar(trials),
    trials: trials.length,
    proximosTrials: trials
      .map((f) => f.sub_vencimiento)
      .filter((v): v is string => Boolean(v))
      .sort()
      .slice(0, 2),
  };
}
