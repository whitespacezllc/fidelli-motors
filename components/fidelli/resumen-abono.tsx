import {
  MESES_DEL_PERIODO,
  abonoMensual,
  descuentoDeLista,
  pesos,
  porcentaje,
  totalDelPeriodo,
  type Periodo,
} from "@/lib/fidelli/plan";
import type { PlanCompleto } from "@/components/fidelli/tipos";

function Renglon({
  etiqueta,
  valor,
  fuerte = false,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={fuerte ? "font-semibold text-ink" : "text-ink-60"}>
        {etiqueta}
      </span>
      <span className={fuerte ? "font-brand text-lead font-bold text-ink" : "text-ink"}>
        {valor}
      </span>
    </div>
  );
}

// El número que se le va a cobrar, desglosado. Va tanto en el paso 3 del
// wizard como en la edición: es la misma cuenta y tiene que dar lo mismo en
// los dos lados.
export function ResumenAbono({
  plan,
  periodo,
  descuentoPct,
}: {
  plan: PlanCompleto;
  periodo: Periodo;
  descuentoPct: number;
}) {
  const lista = descuentoDeLista(plan, periodo);
  const mensual = abonoMensual(plan, periodo, descuentoPct);
  const meses = MESES_DEL_PERIODO[periodo];

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3 text-ui">
      <Renglon etiqueta="Precio de lista" valor={`${pesos(plan.precio_mensual)}/mes`} />

      {lista > 0 && (
        <Renglon
          etiqueta={`Descuento por pagar ${periodo}`}
          valor={`−${porcentaje(lista)}`}
        />
      )}

      {descuentoPct > 0 && (
        <Renglon
          etiqueta={descuentoPct === 50 ? "Descuento founding" : "Descuento del cliente"}
          valor={`−${porcentaje(descuentoPct)}`}
        />
      )}

      <div className="mt-2 border-t border-line pt-2">
        <Renglon etiqueta="Abono" valor={`${pesos(mensual)}/mes`} fuerte />

        {meses > 1 && (
          <p className="mt-1 text-label text-ink-60">
            Se factura {pesos(totalDelPeriodo(plan, periodo, descuentoPct))} cada{" "}
            {meses} meses.
          </p>
        )}
      </div>
    </div>
  );
}
