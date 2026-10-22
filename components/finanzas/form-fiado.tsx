"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  crearDeuda,
  type ResultadoMovimiento,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";
import { recordarSucursal } from "@/lib/preferencias";
import { parsearMonto } from "@/lib/finanzas";

type Sucursal = { id: string; nombre: string };
type Cliente = { id: string; nombre: string };

const INICIAL: ResultadoMovimiento = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// Registrar un fiado: a quién, cuánto y de qué. El fiado va siempre contra
// un cliente con ficha — la cuenta corriente se lleva por cliente.
export function FormFiado({
  clientes,
  sucursales,
  sucursalInicial,
  clienteInicial = "",
  hoy,
}: {
  clientes: Cliente[];
  sucursales: Sucursal[];
  sucursalInicial: string;
  clienteInicial?: string;
  hoy: string;
}) {
  const router = useRouter();

  const [clienteId, setClienteId] = useState(clienteInicial);
  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoMovimiento) => {
    const r = await crearDeuda(prev, {
      clienteId,
      sucursalId,
      fecha,
      monto: parsearMonto(monto),
      concepto,
    });
    if (r.id) {
      router.push(`/panel/finanzas/cuenta/${clienteId}`);
      router.refresh();
    }
    return r;
  }, INICIAL);

  const listo = clienteId !== "" && concepto.trim().length >= 2 && parsearMonto(monto) > 0;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fiado-cliente" className={CLASE_LABEL}>
          Cliente
        </label>
        <select
          id="fiado-cliente"
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className={`${CLASE_CAMPO} cursor-pointer`}
        >
          <option value="">Elegí un cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {clientes.length === 0 && (
          <p className="mt-1 text-label text-ink-60">
            Todavía no tenés clientes con ficha. Cargá uno desde Clientes para poder fiarle.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="fiado-concepto" className={CLASE_LABEL}>
          De qué es
        </label>
        <input
          id="fiado-concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="ej: Service + cubiertas"
          aria-label="Concepto del fiado"
          className={CLASE_CAMPO}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="fiado-monto" className={CLASE_LABEL}>
            Monto
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-40">
              $
            </span>
            <input
              id="fiado-monto"
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
          <label htmlFor="fiado-fecha" className={CLASE_LABEL}>
            Fecha
          </label>
          <input
            id="fiado-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="fiado-sucursal" className={CLASE_LABEL}>
            Sucursal
          </label>
          <select
            id="fiado-sucursal"
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
          {enviando ? "Guardando…" : "Registrar fiado"}
        </Boton>
      </div>
    </form>
  );
}
