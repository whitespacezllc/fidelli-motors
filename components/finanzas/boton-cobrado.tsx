"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  marcarPresupuestoCobrado,
  type ResultadoMovimiento,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";
import { MEDIOS_PAGO, ETIQUETA_MEDIO, type MedioPago } from "@/lib/finanzas";

const INICIAL: ResultadoMovimiento = {};
const CLASE_CAMPO =
  "h-11 rounded-md border border-line bg-base px-3 text-body text-ink";

// Convierte un presupuesto en un ingreso. Nace plegado (un botón) y al
// abrirse pregunta con qué medio se cobró antes de confirmar — así no
// asume efectivo. No cambia el presupuesto; al terminar refresca para que
// la pantalla muestre el estado "cobrado" (que decide el servidor).
export function BotonCobrado({ presupuestoId }: { presupuestoId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [medio, setMedio] = useState<MedioPago>("efectivo");

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoMovimiento) => {
    const r = await marcarPresupuestoCobrado(presupuestoId, medio);
    if (r.id) {
      setAbierto(false);
      router.refresh();
    }
    return r;
  }, INICIAL);

  if (!abierto) {
    return (
      <Boton type="button" variante="secundario" tam="md" onClick={() => setAbierto(true)}>
        Marcar como cobrado
      </Boton>
    );
  }

  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="cobrado-medio" className="text-label text-ink-60">
          Medio
        </label>
        <select
          id="cobrado-medio"
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
        <Boton type="button" variante="secundario" tam="md" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton type="submit" tam="md" disabled={enviando}>
          {enviando ? "Registrando…" : "Confirmar"}
        </Boton>
      </div>
      {resultado.error && (
        <p role="alert" className="text-label text-overdue">
          {resultado.error}
        </p>
      )}
    </form>
  );
}
