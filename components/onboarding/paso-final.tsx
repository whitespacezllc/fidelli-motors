"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { registrarPasoHecho } from "@/app/panel/onboarding/actions";

// El caso raro: todos los pasos están hechos por los datos —por ejemplo,
// Fidelli le cargó el catálogo y el premio por una importación— pero
// nadie llegó a completar el onboarding. No se escribe nada al renderizar:
// el botón le avisa a la base y de ahí al panel.
export function PasoFinal() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="surface-card flex flex-col items-start gap-4 p-5 sm:p-6">
      <div>
        <h2 className="font-brand text-h3 font-bold text-ink">Ya está todo cargado.</h2>
        <p className="mt-1.5 max-w-prose text-body text-ink-60">
          Tu catálogo y tu diseño ya están. Entrá al panel y cargá el primer
          trabajo con el próximo auto que entre.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}
      <Boton
        type="button"
        tam="lg"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await registrarPasoHecho();
            if (r.error) {
              setError(r.error);
              return;
            }
            router.replace("/panel");
            router.refresh();
          })
        }
      >
        {pendiente ? "Entrando…" : "Entrar al panel"}
      </Boton>
    </div>
  );
}
