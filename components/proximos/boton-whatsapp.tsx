"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconoWhatsapp } from "@/components/iconos";
import { registrarContacto } from "@/app/panel/proximos/actions";
import type { EstadoContacto } from "@/lib/contacto";

// El contacto en un tap. Es un <a> de verdad, no un botón que abre la
// ventana después de esperar al servidor: si el link se abriera desde el
// callback de una promesa, el navegador ya no lo ve como gesto del usuario
// y Safari lo bloquea como popup. Así WhatsApp abre siempre, al toque, y
// el registro del contacto viaja en paralelo.
//
// El orden importa: primero abre, después registra. Si el registro falla,
// el lubri igual contactó al cliente — que es lo que vale.
export function BotonWhatsapp({
  vehiculoId,
  estado,
  link,
  contactado,
}: {
  vehiculoId: string;
  estado: EstadoContacto;
  link: string;
  contactado: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alTocar() {
    setError(null);
    iniciar(async () => {
      const resultado = await registrarContacto(vehiculoId, estado);
      if (resultado.error) setError(resultado.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={alTocar}
        // Ya contactado en este estado: sigue disponible —el lubri puede
        // querer reabrir la conversación— pero en secundario, para que la
        // vista de arriba a abajo salte a los que faltan.
        className={
          contactado
            ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-base px-3.5 text-ui font-semibold text-ink transition-colors hover:bg-surface"
            : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-brand px-3.5 font-brand text-ui font-bold text-white transition-colors hover:bg-brand-deep"
        }
      >
        <IconoWhatsapp aria-hidden className="size-5 shrink-0" />
        {pendiente ? "Abriendo…" : "WhatsApp"}
      </a>
      {error && (
        <span role="alert" className="text-label text-overdue">
          {error}
        </span>
      )}
    </span>
  );
}
