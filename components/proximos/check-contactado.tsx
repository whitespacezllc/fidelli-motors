"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarContacto } from "@/app/panel/(tras-onboarding)/proximos/actions";
import type { MotivoContacto } from "@/lib/contacto";
import { LUGAR_CHECK, LUGAR_MENSAJE } from "@/components/proximos/grilla";

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
//
// La etiqueta al lado del check («Contactado» / «Sin contactar») va hasta
// 1279: desde `xl` la columna tiene su título y mide 40 px. Ahí el check y
// su error son ítems de la grilla de la fila (grilla.ts): el error ocupa
// un renglón entero debajo, no una columna de 40.
export function CheckContactado({
  vehiculoId,
  estado,
  contactado,
  etiqueta,
}: {
  vehiculoId: string;
  estado: MotivoContacto;
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
    <span className="inline-flex flex-col gap-0.5 xl:contents">
      <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 ${LUGAR_CHECK}`}>
        <input
          type="checkbox"
          checked={marcado}
          disabled={pendiente}
          onChange={alternar}
          aria-label={etiqueta}
          className="size-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="text-ui text-ink-60 xl:hidden">
          {marcado ? "Contactado" : "Sin contactar"}
        </span>
      </label>
      {error && (
        <span role="alert" className={`text-label text-overdue ${LUGAR_MENSAJE}`}>
          {error}
        </span>
      )}
    </span>
  );
}
