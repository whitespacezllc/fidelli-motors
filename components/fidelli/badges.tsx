import {
  ETIQUETA_PERIODO,
  diasHasta,
  porcentaje,
  type EstadoSuscripcion,
  type Periodo,
} from "@/lib/fidelli/plan";

const BASE =
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-label font-semibold tracking-[0.04em] uppercase whitespace-nowrap";

// El rojo de marca no aparece: acá todo es estado, y el estado nunca es rojo.
const COLORES: Record<EstadoSuscripcion, string> = {
  activa: "border-success bg-success-soft text-success",
  trial: "border-line bg-surface text-upcoming",
  vencida: "border-overdue bg-overdue-soft text-overdue",
  cancelada: "border-line bg-surface text-ink-40",
};

// "ACTIVA · MENSUAL" — el estado y el período leen juntos porque juntos son
// una sola cosa: cómo está contratado este lubricentro hoy.
// El trial cambia el sufijo por la cuenta regresiva, que es el dato que
// mueve el trabajo del día.
export function BadgeSuscripcion({
  estado,
  periodo,
  vencimiento,
}: {
  estado: EstadoSuscripcion;
  periodo: Periodo;
  vencimiento: string;
}) {
  let sufijo = ETIQUETA_PERIODO[periodo];

  if (estado === "trial") {
    const dias = diasHasta(vencimiento);
    sufijo =
      dias > 1 ? `${dias} días` : dias === 1 ? "último día" : "trial terminado";
  }

  return (
    <span className={`${BASE} ${COLORES[estado]}`}>
      {estado} · {sufijo}
    </span>
  );
}

// Solo aparece cuando el lubricentro tiene un trato propio. El descuento de
// lista por pagar semestral o anual no lleva chapa: lo tiene cualquiera.
export function BadgeDescuento({ pct }: { pct: number }) {
  if (pct <= 0) return null;

  return (
    <span className={`${BASE} border-reward bg-reward-soft text-reward`}>
      {pct === 50 ? "founding " : ""}−{porcentaje(pct)}
    </span>
  );
}

export function BadgeSinSuscripcion() {
  return (
    <span className={`${BASE} border-line bg-surface text-ink-40`}>
      sin suscripción
    </span>
  );
}
