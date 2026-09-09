"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FormularioPremio,
  type Premio,
} from "@/components/fidelizacion/formulario-premio";
import { omitirPremio } from "@/app/panel/onboarding/actions";

// Paso 3 · el formulario de premio de Fidelización, tal cual, más "Omitir
// por ahora": terciario, siempre visible, sin confirmación. Omitir cuenta
// como paso hecho; el premio se define después desde Fidelización.
//
// Guardar el premio ES completar el onboarding: la base lo evalúa en el
// trigger onboarding_premios, la acción de Fidelización revalida y la
// página, al refrescarse ya completa, redirige sola a /panel con la
// bienvenida. Por eso acá no se le avisa a nadie: alcanza con refrescar.
export function PasoPremio({
  premio,
  impactoPorMeta,
  enProgreso,
}: {
  premio: Premio;
  impactoPorMeta: Record<number, number>;
  enProgreso: number;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const alGuardar = useCallback(() => router.refresh(), [router]);

  const omitir = () =>
    iniciar(async () => {
      const r = await omitirPremio();
      if (r.error) {
        setError(r.error);
        return;
      }
      router.replace(r.completado ? "/panel" : "/panel/onboarding");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}
      <div className="surface-card p-5 sm:p-6">
        <FormularioPremio
          premio={premio}
          impactoPorMeta={impactoPorMeta}
          enProgreso={enProgreso}
          etiquetaGuardar="Guardar premio"
          alGuardar={alGuardar}
        />
      </div>
      <button
        type="button"
        onClick={omitir}
        disabled={pendiente}
        className="min-h-11 self-start px-1 font-ui text-ui font-semibold text-ink-60 underline underline-offset-4 transition-colors hover:text-ink disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Omitir por ahora"}
      </button>
    </div>
  );
}
