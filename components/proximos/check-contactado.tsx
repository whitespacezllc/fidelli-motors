"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarContacto } from "@/app/panel/proximos/actions";
import type { EstadoContacto } from "@/lib/contacto";

// El check es toggleable a mano y cubre dos casos reales: el llamado
// telefónico hecho por afuera (se marca, canal 'manual') y el tap
// accidental (se destilda).
//
// Es un checkbox de verdad —no un div con onClick— para que llegue el foco
// por teclado y el lector de pantalla anuncie el estado.
//
// El valor optimista va con useOptimistic y no con useState: useState se
// siembra una sola vez y no vuelve a mirar el prop, así que después de
// tocar WhatsApp —que registra el contacto y refresca— el check se quedaba
// mostrando "sin contactar" y el toque siguiente registraba un contacto
// nuevo en vez de destildar. useOptimistic dura lo que dura la transición
// y después cae al valor real que llegó del servidor.
export function CheckContactado({
  vehiculoId,
  estado,
  contactado,
  etiqueta,
}: {
  vehiculoId: string;
  estado: EstadoContacto;
  contactado: boolean;
  etiqueta: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [marcado, marcarOptimista] = useOptimistic(contactado);
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    setError(null);
    iniciar(async () => {
      marcarOptimista(!contactado);
      const resultado = await alternarContacto(vehiculoId, estado, contactado);
      if (resultado.error) setError(resultado.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 lg:justify-center">
        <input
          type="checkbox"
          checked={marcado}
          disabled={pendiente}
          onChange={alternar}
          aria-label={etiqueta}
          className="size-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="text-ui text-ink-60 lg:hidden">
          {marcado ? "Contactado" : "Sin contactar"}
        </span>
      </label>
      {error && (
        <span role="alert" className="text-label text-overdue">
          {error}
        </span>
      )}
    </span>
  );
}
