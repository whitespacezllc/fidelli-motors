"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { guardarModulo, type EstadoPlan } from "@/app/fidelli/precios/actions";
import { MOTIVO_MINIMO } from "@/components/fidelli/tarjeta-plan";
import { MESES_DEL_PERIODO, PERIODOS, ETIQUETA_PERIODO, pesos } from "@/lib/fidelli/plan";

const INICIAL: EstadoPlan = {};

export type ModuloCatalogo = {
  id: string;
  codigo: string;
  nombre: string;
  precio_mensual: number;
  activo: boolean;
};

// ============================================================
// El precio de un módulo pago
//
// Hasta septiembre de 2026 este número no existía en ningún lado: el
// derecho al módulo vivía en el override de plan y el precio vivía en la
// cabeza de Santiago. Ahora es dato, y moverlo deja rastro.
//
// LO QUE ESTA TARJETA NO HACE: dar o sacar el módulo. Eso sigue siendo el
// override de plan en la ficha del tenant, con su motivo y su auditoría
// propia. Acá solo vive cuánto sale.
// ============================================================
export function TarjetaModulo({
  modulo,
  conElModulo,
}: {
  modulo: ModuloCatalogo;
  conElModulo: { id: string; nombre: string; bonificado: boolean }[];
}) {
  const [precio, setPrecio] = useState(modulo.precio_mensual);
  const [motivo, setMotivo] = useState("");

  // Mismo motivo que en TarjetaPlan: tras `revalidatePath` el servidor manda
  // el precio nuevo y `useState` no lo mira. Sin esto el input queda con el
  // viejo bajo un cartel que dice "Precio guardado", y el próximo guardado
  // lo revierte dejando una fila de auditoría que miente.
  const [ultimoDelServidor, setUltimoDelServidor] = useState(modulo.precio_mensual);
  if (ultimoDelServidor !== modulo.precio_mensual) {
    setUltimoDelServidor(modulo.precio_mensual);
    setPrecio(modulo.precio_mensual);
  }

  const [estado, guardar, guardando] = useActionState(
    async (previo: EstadoPlan, formData: FormData) => {
      const r = await guardarModulo(previo, formData);
      if (r.ok) {
        setPrecio(Number(formData.get("precio_mensual")));
        setMotivo("");
      }
      return r;
    },
    INICIAL,
  );

  const cambiado = precio !== modulo.precio_mensual;
  const pagan = conElModulo.filter((l) => !l.bonificado);
  const bonificados = conElModulo.filter((l) => l.bonificado);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="font-brand text-lead font-bold text-ink">{modulo.nombre}</h2>
        <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
          Módulo pago — aparte del plan
        </span>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="id" value={modulo.id} />

          <div>
            <label htmlFor={`precio-${modulo.id}`} className={CLASE_LABEL}>
              Precio de lista
            </label>
            <div className="flex items-center gap-2">
              <span className="text-body text-ink-40">ARS</span>
              <input
                id={`precio-${modulo.id}`}
                name="precio_mensual"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                required
                value={precio}
                onChange={(e) => setPrecio(Number(e.target.value))}
                className={`${CLASE_CAMPO} max-w-[170px]`}
              />
              <span className="text-body text-ink-60">/mes</span>
            </div>
            <p className={CLASE_AYUDA}>
              Se suma al plan y lleva el mismo descuento del período que el
              plan. El descuento propio del lubricentro no se le aplica: se
              negoció sobre el plan, antes de que el módulo existiera.
            </p>
          </div>

          {cambiado && (
            <div>
              <label htmlFor={`motivo-${modulo.id}`} className={CLASE_LABEL}>
                Por qué se mueve
              </label>
              <textarea
                id={`motivo-${modulo.id}`}
                name="motivo"
                rows={2}
                required
                minLength={MOTIVO_MINIMO}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ajuste del módulo gomería por costo de insumos"
                className={CLASE_CAMPO}
              />
              <p className={CLASE_AYUDA}>
                Queda registrado con tu nombre y la fecha.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Boton
              type="submit"
              disabled={guardando || !cambiado || motivo.trim().length < MOTIVO_MINIMO}
              className="min-w-[150px]"
            >
              {guardando ? "Guardando…" : "Guardar precio"}
            </Boton>
            {estado.ok && !cambiado && (
              <span className="text-ui text-success">Precio guardado.</span>
            )}
          </div>
        </form>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Con este precio
            </p>
            <dl className="flex flex-col gap-2">
              {PERIODOS.map((periodo) => (
                <div key={periodo} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ui text-ink-60">{ETIQUETA_PERIODO[periodo]}</dt>
                  <dd className="text-body font-semibold text-ink tabular-nums">
                    {pesos(precio * MESES_DEL_PERIODO[periodo])}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-label text-ink-40">
              Antes del descuento del período, que sale del plan de cada uno.
            </p>
          </div>

          {/* ---------- Quién lo tiene, y quién lo paga ----------
              Son dos cosas distintas y la diferencia es plata: el módulo
              bonificado no entra en el monto. Hoy los dos que lo tienen lo
              tienen bonificado de por vida, así que este número es cero. */}
          <div className="rounded-md border border-line px-4 py-3">
            <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Quién lo tiene
            </p>
            {conElModulo.length === 0 ? (
              <p className="text-ui text-ink-60">Todavía nadie.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pagan.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3 text-ui">
                    <span className="text-ink">{l.nombre}</span>
                    <span className="text-ink-60 tabular-nums">{pesos(precio)}/mes</span>
                  </li>
                ))}
                {bonificados.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3 text-ui">
                    <span className="text-ink-60">{l.nombre}</span>
                    <span className="text-ink-40">bonificado</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-label text-ink-40">
              Se da y se saca desde la ficha del tenant, con motivo. Acá solo
              vive el precio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
