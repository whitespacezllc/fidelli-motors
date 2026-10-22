"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  cobrarDeuda,
  type ResultadoMovimiento,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";
import { MEDIOS_PAGO, ETIQUETA_MEDIO, parsearMonto, type MedioPago } from "@/lib/finanzas";
import { formatearPesos } from "@/lib/presupuestos";

const INICIAL: ResultadoMovimiento = {};
const CLASE_CAMPO =
  "h-11 w-full rounded-md border border-line bg-base px-3 text-body text-ink placeholder:text-ink-40";

// Cobrar un fiado, total o parcial. Nace plegado (un botón) y al abrirse
// muestra monto (precargado con el saldo), medio y fecha.
export function CobrarDeuda({
  deudaId,
  saldo,
  hoy,
}: {
  deudaId: string;
  saldo: number;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(String(saldo));
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [fecha, setFecha] = useState(hoy);

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoMovimiento) => {
    const r = await cobrarDeuda(prev, {
      deudaId,
      monto: parsearMonto(monto),
      medio,
      fecha,
    });
    if (r.id) {
      setAbierto(false);
      router.refresh();
    }
    return r;
  }, INICIAL);

  if (!abierto) {
    return (
      <Boton type="button" variante="secundario" tam="md" onClick={() => setAbierto(true)}>
        Cobrar
      </Boton>
    );
  }

  const parseado = parsearMonto(monto);
  const listo = parseado > 0 && parseado <= saldo;

  return (
    <form action={enviar} className="flex flex-col gap-2 rounded-md border border-line bg-surface/60 p-3">
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_9rem]">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-body text-ink-40">
            $
          </span>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            aria-label="Monto a cobrar"
            className={`${CLASE_CAMPO} pl-6 text-right tabular-nums`}
          />
        </div>
        <select
          value={medio}
          onChange={(e) => setMedio(e.target.value as MedioPago)}
          aria-label="Medio de pago"
          className={`${CLASE_CAMPO} cursor-pointer`}
        >
          {MEDIOS_PAGO.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MEDIO[m]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          aria-label="Fecha del cobro"
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </div>

      {parseado > saldo && (
        <p className="text-label text-overdue">El cobro no puede superar el saldo ({formatearPesos(saldo)}).</p>
      )}
      {resultado.error && (
        <p role="alert" className="text-label text-overdue">
          {resultado.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="secundario" tam="md" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton type="submit" tam="md" disabled={enviando || !listo}>
          {enviando ? "Cobrando…" : "Confirmar cobro"}
        </Boton>
      </div>
    </form>
  );
}
