"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { registrarPago, type EstadoPago } from "@/app/fidelli/[id]/actions";

const INICIAL: EstadoPago = {};

// El formulario llega con el próximo período y el importe ya calculados: el
// caso normal es confirmar, no tipear. Todo es editable igual — un pago
// puede venir con otro monto acordado o cubrir un período distinto.
export function FormPago({
  lubricentroId,
  desde,
  hasta,
  monto,
  firma,
}: {
  lubricentroId: string;
  desde: string;
  hasta: string;
  monto: number;
  firma: string;
}) {
  const [estado, guardar, guardando] = useActionState(registrarPago, INICIAL);

  // Hoy, en la zona del navegador: la transferencia normalmente se registra
  // el día que entró.
  const [hoy] = useState(() => {
    const f = new Date();
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  });

  return (
    <form action={guardar} className="flex flex-col gap-4">
      {estado.error && (
        <p role="alert" className={CLASE_ERROR}>
          {estado.error}
        </p>
      )}

      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
          {estado.ok}
        </p>
      )}

      <input type="hidden" name="lubricentro_id" value={lubricentroId} />

      <fieldset className="min-w-0">
        <legend className={CLASE_LABEL}>Período</legend>
        <div className="flex items-center gap-2">
          <input
            name="periodo_desde"
            type="date"
            required
            defaultValue={desde}
            aria-label="Período desde"
            className={CLASE_CAMPO}
          />
          <span className="shrink-0 text-body text-ink-40">→</span>
          <input
            name="periodo_hasta"
            type="date"
            required
            defaultValue={hasta}
            aria-label="Período hasta"
            className={CLASE_CAMPO}
          />
        </div>
        <p className={CLASE_AYUDA}>
          Al guardar, el vencimiento de la suscripción pasa a la fecha de la
          derecha.
        </p>
      </fieldset>

      <div>
        <label htmlFor="monto" className={CLASE_LABEL}>
          Monto
        </label>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-body text-ink-40">ARS</span>
          <input
            id="monto"
            name="monto"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            required
            defaultValue={monto}
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      <div>
        <label htmlFor="fecha_pago" className={CLASE_LABEL}>
          Fecha de transferencia
        </label>
        <input
          id="fecha_pago"
          name="fecha_pago"
          type="date"
          required
          defaultValue={hoy}
          className={CLASE_CAMPO}
        />
      </div>

      <Boton type="submit" tam="lg" disabled={guardando} className="w-full">
        {guardando ? "Registrando…" : "Registrar pago"}
      </Boton>

      <p className="text-label text-ink-60">
        Queda firmado como <span className="font-semibold text-ink">{firma}</span>{" "}
        con fecha y hora.
      </p>
    </form>
  );
}
