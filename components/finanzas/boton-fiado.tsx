"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import {
  marcarPresupuestoFiado,
  type ResultadoMovimiento,
} from "@/app/panel/(tras-onboarding)/finanzas/actions";

const INICIAL: ResultadoMovimiento = {};

// Convierte un presupuesto en un fiado (deuda) contra su cliente. No cambia
// el presupuesto. Al terminar refresca para que la pantalla muestre el
// estado "fiado" (que decide el servidor).
export function BotonFiado({ presupuestoId }: { presupuestoId: string }) {
  const router = useRouter();

  const [resultado, enviar, enviando] = useActionState(async (prev: ResultadoMovimiento) => {
    const r = await marcarPresupuestoFiado(presupuestoId);
    if (r.id) router.refresh();
    return r;
  }, INICIAL);

  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <Boton type="submit" variante="secundario" tam="md" disabled={enviando}>
        {enviando ? "Registrando…" : "Marcar como fiado"}
      </Boton>
      {resultado.error && (
        <p role="alert" className="text-label text-overdue">
          {resultado.error}
        </p>
      )}
    </form>
  );
}
