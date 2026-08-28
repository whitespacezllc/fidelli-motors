"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { anularService } from "@/app/panel/services/[serviceId]/actions";

// La confirmación es explícita porque no hay vuelta atrás: el service
// anulado desaparece del cartón del cliente y deja de contar para la
// fidelización. El botón que dispara es secundario — anular no puede
// competir visualmente con editar.
export function AnularService({
  serviceId,
  fecha,
  patente,
}: {
  serviceId: string;
  fecha: string;
  patente: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setAnulando(true);
    setError(null);
    const resultado = await anularService(serviceId);
    if (resultado.error) {
      setError(resultado.error);
      setAnulando(false);
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={clasesBoton("secundario", "md")}>
        Anular service
      </DialogTrigger>
      <DialogContenido titulo="¿Anular este service?">
        <p className="text-ui text-ink-60">
          Vas a anular el trabajo del{" "}
          <span className="font-semibold text-ink tabular-nums">{fecha}</span> de{" "}
          <span className="plate font-semibold text-ink">{patente}</span>. El
          cliente dejará de verlo en su historial y no contará para su premio.
          Esta acción no se puede deshacer.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <Boton
            variante="secundario"
            className="flex-1"
            onClick={() => setAbierto(false)}
            disabled={anulando}
          >
            Volver
          </Boton>
          {/* Primario porque acá adentro ES la acción; el ancho fijo evita
              el salto de layout al pasar a "Anulando…". */}
          <Boton className="flex-1" onClick={confirmar} disabled={anulando}>
            {anulando ? "Anulando…" : "Sí, anular"}
          </Boton>
        </div>
      </DialogContenido>
    </Dialog>
  );
}
