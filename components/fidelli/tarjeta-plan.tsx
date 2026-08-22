"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { guardarPlan, type EstadoPlan } from "@/app/fidelli/precios/actions";
import {
  ETIQUETA_PERIODO,
  MESES_DEL_PERIODO,
  PERIODOS,
  abonoMensual,
  descuentoDeLista,
  pesos,
  porcentaje,
  totalDelPeriodo,
  type EstadoSuscripcion,
  type Periodo,
} from "@/lib/fidelli/plan";
import type { PlanCompleto } from "@/components/fidelli/tipos";
import { FEATURES_PLAN, ETIQUETA_FEATURE } from "@/lib/planes";

const INICIAL: EstadoPlan = {};

type Suscripto = {
  id: string;
  nombre: string;
  periodo: Periodo | null;
  descuento: number;
  estado: EstadoSuscripcion | null;
};

export function TarjetaPlan({
  plan,
  suscriptos,
}: {
  plan: PlanCompleto;
  suscriptos: Suscripto[];
}) {
  // Los derivados se recalculan mientras se escribe: el ajuste trimestral se
  // decide mirando en qué queda el semestral, no el número de la lista.
  const [borrador, setBorrador] = useState({
    precio_mensual: plan.precio_mensual,
    descuento_semestral_pct: plan.descuento_semestral_pct,
    descuento_anual_pct: plan.descuento_anual_pct,
  });

  const [estado, guardar, guardando] = useActionState(
    async (previo: EstadoPlan, formData: FormData) => {
      const r = await guardarPlan(previo, formData);
      // Se resincroniza con lo que quedó guardado en vez de asumir que es lo
      // que se tipeó: si la base normalizó algo, manda la base.
      if (r.ok) {
        setBorrador({
          precio_mensual: Number(formData.get("precio_mensual")),
          descuento_semestral_pct: Number(formData.get("descuento_semestral_pct")),
          descuento_anual_pct: Number(formData.get("descuento_anual_pct")),
        });
      }
      return r;
    },
    INICIAL,
  );

  const cambiado =
    borrador.precio_mensual !== plan.precio_mensual ||
    borrador.descuento_semestral_pct !== plan.descuento_semestral_pct ||
    borrador.descuento_anual_pct !== plan.descuento_anual_pct;

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="font-brand text-lead font-bold text-ink">{plan.nombre}</h2>
        {plan.heredado && (
          <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Heredado — no se ofrece en el alta
          </span>
        )}
      </div>

      {/* ---------- Qué habilita: SOLO LECTURA a propósito ----------
          Editar esto afecta a todos los tenants que tienen el plan: se
          cambia por migración, no con un clic. La excepción puntual es el
          override por cuenta, en la ficha del tenant, que deja rastro. */}
      {plan.features && (
        <div className="border-b border-line px-5 py-3.5">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {FEATURES_PLAN.map((f) => {
              const activa = plan.features?.[f] === true;
              return (
                <li
                  key={f}
                  className={`inline-flex items-center gap-1.5 text-ui ${activa ? "text-ink" : "text-ink-40 line-through decoration-line"}`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${activa ? "bg-success" : "bg-line"}`}
                  />
                  {ETIQUETA_FEATURE[f]}
                </li>
              );
            })}
            <li className="inline-flex items-center gap-1.5 text-ui text-ink-60 tabular-nums">
              <span aria-hidden className="size-1.5 rounded-full bg-line" />
              Sucursales:{" "}
              {plan.limites?.sucursales == null
                ? "sin límite"
                : `hasta ${plan.limites.sucursales}`}
            </li>
          </ul>
          <p className="mt-2 text-label text-ink-40">
            Qué habilita un plan se cambia por migración. Para una excepción
            puntual: override en la ficha del tenant.
          </p>
        </div>
      )}

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* ---------- Lo que se edita ---------- */}
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="id" value={plan.id} />

          <div>
            <label htmlFor={`precio-${plan.id}`} className={CLASE_LABEL}>
              Precio de lista
            </label>
            <div className="flex items-center gap-2">
              <span className="text-body text-ink-40">ARS</span>
              <input
                id={`precio-${plan.id}`}
                name="precio_mensual"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                required
                value={borrador.precio_mensual}
                onChange={(e) =>
                  setBorrador((b) => ({
                    ...b,
                    precio_mensual: Number(e.target.value),
                  }))
                }
                className={`${CLASE_CAMPO} max-w-[170px]`}
              />
              <span className="text-body text-ink-60">/mes</span>
            </div>
            <p className={CLASE_AYUDA}>
              Es el número del ajuste trimestral. Cambiarlo mueve la factura de
              todos: los descuentos son porcentuales sobre la lista vigente,
              nunca montos congelados.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`sem-${plan.id}`} className={CLASE_LABEL}>
                Descuento semestral
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`sem-${plan.id}`}
                  name="descuento_semestral_pct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={borrador.descuento_semestral_pct}
                  onChange={(e) =>
                    setBorrador((b) => ({
                      ...b,
                      descuento_semestral_pct: Number(e.target.value),
                    }))
                  }
                  className={`${CLASE_CAMPO} max-w-[110px]`}
                />
                <span className="text-body text-ink-60">%</span>
              </div>
            </div>

            <div>
              <label htmlFor={`anu-${plan.id}`} className={CLASE_LABEL}>
                Descuento anual
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`anu-${plan.id}`}
                  name="descuento_anual_pct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={borrador.descuento_anual_pct}
                  onChange={(e) =>
                    setBorrador((b) => ({
                      ...b,
                      descuento_anual_pct: Number(e.target.value),
                    }))
                  }
                  className={`${CLASE_CAMPO} max-w-[110px]`}
                />
                <span className="text-body text-ink-60">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Boton type="submit" disabled={guardando || !cambiado} className="min-w-[150px]">
              {guardando ? "Guardando…" : "Guardar precios"}
            </Boton>
            {estado.ok && !cambiado && (
              <span className="text-ui text-success">Precios guardados.</span>
            )}
          </div>
        </form>

        {/* ---------- Lo que se deriva ---------- */}
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Con estos números
            </p>

            <dl className="flex flex-col gap-2">
              {PERIODOS.map((periodo) => {
                const lista = descuentoDeLista(borrador, periodo);
                const mensual = abonoMensual(borrador, periodo, 0);
                const meses = MESES_DEL_PERIODO[periodo];

                return (
                  <div key={periodo} className="flex items-baseline justify-between gap-4">
                    <dt className="text-ui text-ink-60">
                      {ETIQUETA_PERIODO[periodo]}
                      {lista > 0 && (
                        <span className="text-ink-40"> · −{porcentaje(lista)}</span>
                      )}
                    </dt>
                    <dd className="text-right">
                      <span className="font-semibold text-ink">
                        {pesos(totalDelPeriodo(borrador, periodo, 0))}
                      </span>
                      {meses > 1 && (
                        <span className="block text-label text-ink-60">
                          {pesos(mensual)}/mes
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="rounded-md border border-line px-4 py-3">
            <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Quiénes lo tienen ({suscriptos.length})
            </p>

            {suscriptos.length === 0 ? (
              <p className="text-ui text-ink-40">
                Todavía no hay ningún lubricentro con este plan.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {suscriptos.map((s) => {
                  const periodo = s.periodo ?? "mensual";
                  return (
                    <li
                      key={s.id}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/fidelli/${s.id}`}
                          className="truncate font-semibold text-ink hover:underline"
                        >
                          {s.nombre}
                        </Link>
                        <span className="block text-label text-ink-40">
                          {ETIQUETA_PERIODO[periodo].toLowerCase()}
                          {s.descuento > 0 && ` · −${porcentaje(s.descuento)} propio`}
                          {s.estado === "trial" && " · en trial"}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-ink">
                        {pesos(abonoMensual(borrador, periodo, s.descuento))}
                        <span className="font-normal text-ink-60">/mes</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-label text-ink-60">
              El abono de cada uno sale de aplicar primero el descuento de
              lista de su período y después el suyo. Se recalcula mientras
              editás, antes de guardar.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
