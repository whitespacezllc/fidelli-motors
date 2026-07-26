"use client";

import {
  ETIQUETA_PERIODO,
  PERIODOS,
  type Periodo,
} from "@/lib/fidelli/plan";
import { ResumenAbono } from "@/components/fidelli/resumen-abono";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_LABEL } from "@/components/fidelli/estilos";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export type ValoresPlan = {
  planId: string;
  periodo: Periodo;
  descuentoPct: number;
};

// Plan, período y descuento con el resumen del abono debajo. Es el mismo
// bloque en el alta y en la edición: si la cuenta se muestra distinta en cada
// pantalla, alguna de las dos está mintiendo.
export function CamposPlan({
  planes,
  valores,
  alCambiar,
  prefijo,
}: {
  planes: PlanCompleto[];
  valores: ValoresPlan;
  alCambiar: (parcial: Partial<ValoresPlan>) => void;
  prefijo: string;
}) {
  const plan = planes.find((p) => p.id === valores.planId) ?? planes[0];

  return (
    <>
      <div>
        <label htmlFor={`${prefijo}-plan`} className={CLASE_LABEL}>
          Plan
        </label>
        <select
          id={`${prefijo}-plan`}
          name="plan_id"
          value={valores.planId}
          onChange={(e) => alCambiar({ planId: e.target.value })}
          className={CLASE_CAMPO}
        >
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={CLASE_LABEL}>Período</legend>
        <div className="flex gap-2">
          {PERIODOS.map((p) => {
            const elegido = valores.periodo === p;
            return (
              <label
                key={p}
                className={`flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md border text-ui font-semibold transition-colors ${
                  elegido
                    ? "border-ink bg-ink text-base"
                    : "border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="periodo"
                  value={p}
                  checked={elegido}
                  onChange={() => alCambiar({ periodo: p })}
                  className="sr-only"
                />
                {ETIQUETA_PERIODO[p]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${prefijo}-descuento`} className={CLASE_LABEL}>
          Descuento del cliente
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${prefijo}-descuento`}
            name="descuento_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            inputMode="decimal"
            value={valores.descuentoPct}
            onChange={(e) => alCambiar({ descuentoPct: Number(e.target.value) })}
            className={`${CLASE_CAMPO} max-w-[110px]`}
          />
          <span className="text-body text-ink-60">%</span>
        </div>
        <p className={CLASE_AYUDA}>
          El trato propio de este lubricentro. Founding = 50. Va aparte del
          descuento de lista por pagar semestral o anual, que se aplica solo.
        </p>
      </div>

      {plan && (
        <ResumenAbono
          plan={plan}
          periodo={valores.periodo}
          descuentoPct={valores.descuentoPct}
        />
      )}
    </>
  );
}
