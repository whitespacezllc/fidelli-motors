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
// DISEÑO: compacto y secundario, no un primario rojo por fila. El rojo es
// acción, pero repetido diez veces en una columna deja de ordenar y pasa a
// gritar — y pintarlo solo en los vencidos sería usar el rojo para
// comunicar estado, que es exactamente lo que la paleta prohíbe: la
// urgencia ya la dice el badge. La jerarquía la pone el deshabilitado:
// las filas ya contactadas se apagan, las pendientes quedan al frente.
// En desktop va solo el ícono (la columna es angosta); en la tarjeta de
// mobile, ícono con etiqueta. Área táctil de 44px siempre.
//
// LA REGLA ANTI-SPAM: contactado en este estado → el botón no funciona.
// Nunca dos mensajes en el mismo estado; el camino para reintentar es
// destildar el check, y el motivo se lo dice.
const MOTIVO_BLOQUEO =
  "Ya contactaste a este cliente en este estado. Destildá el check para habilitar un contacto nuevo.";

export function BotonWhatsapp({
  vehiculoId,
  estado,
  link,
  contactado,
  cliente,
}: {
  vehiculoId: string;
  estado: EstadoContacto;
  link: string;
  contactado: boolean;
  cliente: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState(false);

  if (contactado) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          aria-disabled="true"
          aria-label={`WhatsApp a ${cliente} — ya contactado en este estado`}
          title={MOTIVO_BLOQUEO}
          // El motivo también al tocarlo: el title no existe en el táctil.
          onClick={() => setMotivo((v) => !v)}
          className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 text-ui font-semibold text-ink-40 lg:min-w-11 lg:px-2.5"
        >
          <IconoWhatsapp aria-hidden className="size-5 shrink-0" />
          <span className="lg:hidden">WhatsApp</span>
        </button>
        {motivo && (
          <span role="status" className="max-w-52 text-right text-label text-ink-60">
            {MOTIVO_BLOQUEO}
          </span>
        )}
      </span>
    );
  }

  function alTocar() {
    setError(null);
    iniciar(async () => {
      const resultado = await registrarContacto(vehiculoId, estado);
      if (resultado.error) setError(resultado.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={alTocar}
        aria-label={`Abrir WhatsApp para ${cliente}`}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink transition-colors hover:bg-surface lg:min-w-11 lg:px-2.5"
      >
        <IconoWhatsapp aria-hidden className="size-5 shrink-0 text-success" />
        <span className="lg:hidden">{pendiente ? "Abriendo…" : "WhatsApp"}</span>
      </a>
      {error && (
        <span role="alert" className="max-w-52 text-right text-label text-overdue">
          {error}
        </span>
      )}
    </span>
  );
}
