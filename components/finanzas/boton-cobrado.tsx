"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  marcarPresupuestoCobrado,
  type ResultadoIngreso,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";

const INICIAL: ResultadoIngreso = {};

// Convierte un presupuesto en un ingreso. No cambia el presupuesto: solo
// registra que esa plata entró. Al terminar, refresca para que la pantalla
// muestre el estado "cobrado" (que decide el servidor).
export function BotonCobrado({ presupuestoId }: { presupuestoId: string }) {
  const router = useRouter();

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoIngreso) => {
    const r = await marcarPresupuestoCobrado(presupuestoId);
    if (r.id) router.refresh();
    return r;
  }, INICIAL);

  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <Boton type="submit" variante="secundario" tam="md" disabled={enviando}>
        {enviando ? "Registrando…" : "Marcar como cobrado"}
      </Boton>
      {resultado.error && (
        <p role="alert" className="text-label text-overdue">
          {resultado.error}
        </p>
      )}
    </form>
  );
}
