"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  crearIngreso,
  type ResultadoIngreso,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";
import { recordarSucursal } from "@/lib/preferencias";

type Sucursal = { id: string; nombre: string };

const INICIAL: ResultadoIngreso = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

/** AR: miles con punto, decimales con coma. "12.500,50" → 12500.5 */
function parsearMonto(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", ".")) || 0;
}

// El alta de un ingreso: un monto, qué entró y listo. Pensado para el
// mostrador — nada obligatorio salvo el monto y dos palabras de concepto.
export function FormIngreso({
  sucursales,
  sucursalInicial,
  hoy,
}: {
  sucursales: Sucursal[];
  sucursalInicial: string;
  hoy: string;
}) {
  const router = useRouter();

  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");

  const [resultado, enviar, enviando] = useActionState(
    async (prev: ResultadoIngreso) => {
      const r = await crearIngreso(prev, {
        sucursalId,
        fecha,
        monto: parsearMonto(monto),
        concepto,
      });
      if (r.id) {
        router.push("/panel/finanzas");
        router.refresh();
      }
      return r;
    },
    INICIAL,
  );

  const listo = concepto.trim().length >= 2 && parsearMonto(monto) >= 0 && monto.trim() !== "";

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div>
        <label htmlFor="ing-concepto" className={CLASE_LABEL}>
          Qué entró
        </label>
        <input
          id="ing-concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="ej: Service Corsa · efectivo"
          aria-label="Concepto del ingreso"
          className={CLASE_CAMPO}
          autoFocus
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ing-monto" className={CLASE_LABEL}>
            Monto
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-40">
              $
            </span>
            <input
              id="ing-monto"
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
          <label htmlFor="ing-fecha" className={CLASE_LABEL}>
            Fecha
          </label>
          <input
            id="ing-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="ing-sucursal" className={CLASE_LABEL}>
            Sucursal
          </label>
          <select
            id="ing-sucursal"
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
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {resultado.error}
        </p>
      )}

      <div className="mt-2 flex justify-end">
        <Boton type="submit" tam="lg" disabled={enviando || !listo} className="min-w-[190px]">
          {enviando ? "Guardando…" : "Registrar ingreso"}
        </Boton>
      </div>
    </form>
  );
}
