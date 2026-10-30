"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  crearIngreso,
  crearEgreso,
  type ResultadoMovimiento,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";
import { recordarSucursal } from "@/lib/preferencias";
import { BuscadorCliente } from "@/components/finanzas/buscador-cliente";
import { MEDIOS_PAGO, ETIQUETA_MEDIO, parsearMonto, type MedioPago } from "@/lib/finanzas";

type Sucursal = { id: string; nombre: string };

const INICIAL: ResultadoMovimiento = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// El alta de un movimiento de caja (ingreso o egreso). Pensado para el
// mostrador: un monto, qué fue, cómo se pagó y listo.
export function FormMovimiento({
  tipo,
  sucursales,
  sucursalInicial,
  hoy,
}: {
  tipo: "ingreso" | "egreso";
  sucursales: Sucursal[];
  sucursalInicial: string;
  hoy: string;
}) {
  const router = useRouter();
  const esIngreso = tipo === "ingreso";

  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  // Solo para ingresos: de qué cliente es la plata que entró. Opcional —
  // así el cobro queda en el seguimiento del cliente, como el de un
  // presupuesto. Un egreso es un gasto, no va contra un cliente.
  const [cliente, setCliente] = useState<{ id: string; nombre: string } | null>(null);

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoMovimiento) => {
    const base = {
      sucursalId,
      fecha,
      monto: parsearMonto(monto),
      concepto,
      medio,
    };
    const r = esIngreso
      ? await crearIngreso(prev, { ...base, clienteId: cliente?.id ?? null })
      : await crearEgreso(prev, base);
    if (r.id) {
      router.push("/panel/finanzas");
      router.refresh();
    }
    return r;
  }, INICIAL);

  const listo = concepto.trim().length >= 2 && monto.trim() !== "" && parsearMonto(monto) >= 0;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div>
        <label htmlFor="mov-concepto" className={CLASE_LABEL}>
          {esIngreso ? "Qué entró" : "Qué salió"}
        </label>
        <input
          id="mov-concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={esIngreso ? "ej: Service Corsa" : "ej: Compra de filtros"}
          aria-label={esIngreso ? "Concepto del ingreso" : "Concepto del egreso"}
          className={CLASE_CAMPO}
          autoFocus
        />
      </div>

      {/* De quién es la plata: solo para ingresos y opcional. Lo deja en el
          seguimiento del cliente, igual que el cobro de un presupuesto. */}
      {esIngreso && (
        <div>
          <label className={CLASE_LABEL}>
            Cliente <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <BuscadorCliente onElegir={setCliente} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="mov-monto" className={CLASE_LABEL}>
            Monto
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-40">
              $
            </span>
            <input
              id="mov-monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Monto"
              className={`${CLASE_CAMPO} pl-7 text-right tabular-nums`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="mov-medio" className={CLASE_LABEL}>
            Medio
          </label>
          <select
            id="mov-medio"
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioPago)}
            className={`${CLASE_CAMPO} cursor-pointer`}
          >
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="mov-fecha" className={CLASE_LABEL}>
            Fecha
          </label>
          <input
            id="mov-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="mov-sucursal" className={CLASE_LABEL}>
            Sucursal
          </label>
          <select
            id="mov-sucursal"
            value={sucursalId}
            onChange={(e) => {
              setSucursalId(e.target.value);
              recordarSucursal(e.target.value);
            }}
            className={`${CLASE_CAMPO} cursor-pointer`}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {resultado.error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {resultado.error}
        </p>
      )}

      <div className="mt-2 flex justify-end">
        <Boton type="submit" tam="lg" disabled={enviando || !listo} className="min-w-[190px]">
          {enviando ? "Guardando…" : esIngreso ? "Registrar ingreso" : "Registrar egreso"}
        </Boton>
      </div>
    </form>
  );
}
