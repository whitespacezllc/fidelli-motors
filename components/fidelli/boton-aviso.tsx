"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconoWhatsapp } from "@/components/iconos";
import { registrarAviso, alternarAviso } from "@/app/fidelli/actions";
import type { MotivoAviso } from "@/lib/config";

// La regla anti-spam, la misma que en el panel de próximos: un aviso por
// ciclo. El camino para volver a escribirle es destildar el check, y el
// botón lo dice en vez de fallar en silencio.
const YA_CONTACTADO =
  "Ya le avisaste en este ciclo. Destildá el check para poder escribirle de nuevo.";

const SIN_TELEFONO =
  "Este lubricentro no cargó ningún teléfono: ni el WhatsApp de su landing ni el de una sucursal activa.";

const BASE_BOTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-label font-semibold transition-colors";

export function BotonAviso({
  lubricentroId,
  motivo,
  link,
  contactado,
  nombre,
}: {
  lubricentroId: string;
  motivo: MotivoAviso;
  // null = no hay a quién escribirle.
  link: string | null;
  contactado: boolean;
  nombre: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  // useOptimistic y no useState: después de tocar WhatsApp la fila se
  // revalida, y un useState sembrado una vez se quedaría mostrando "sin
  // avisar" — el toque siguiente registraría otro aviso en vez de destildar.
  const [marcado, marcarOptimista] = useOptimistic(contactado);
  const [error, setError] = useState<string | null>(null);
  const [motivoVisible, setMotivoVisible] = useState(false);

  function alAbrir() {
    setError(null);
    iniciar(async () => {
      marcarOptimista(true);
      const r = await registrarAviso(lubricentroId, motivo);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function alternar() {
    setError(null);
    iniciar(async () => {
      marcarOptimista(!contactado);
      const r = await alternarAviso(lubricentroId, motivo, contactado);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  const bloqueo = !link ? SIN_TELEFONO : marcado ? YA_CONTACTADO : null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {bloqueo ? (
          <button
            type="button"
            aria-disabled="true"
            title={bloqueo}
            // El motivo también al tocarlo: el title no existe en el táctil.
            onClick={() => setMotivoVisible((v) => !v)}
            className={`${BASE_BOTON} cursor-not-allowed border-line bg-surface text-ink-40`}
          >
            <IconoWhatsapp aria-hidden className="size-4 shrink-0" />
            {link ? "Avisado" : "Sin teléfono"}
          </button>
        ) : (
          // Un <a> de verdad y no un botón que abre la ventana después de
          // esperar al servidor: desde el callback de una promesa el
          // navegador ya no lo ve como gesto del usuario y Safari lo
          // bloquea como popup. El registro viaja en paralelo.
          <a
            href={link!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={alAbrir}
            aria-label={`Avisarle por WhatsApp a ${nombre}`}
            className={`${BASE_BOTON} border-line bg-base text-ink hover:bg-surface`}
          >
            <IconoWhatsapp aria-hidden className="size-4 shrink-0 text-success" />
            {pendiente ? "Abriendo…" : "Avisar"}
          </a>
        )}

        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={marcado}
            disabled={pendiente}
            onChange={alternar}
            aria-label={`Marcar a ${nombre} como avisado`}
            className="size-4 shrink-0 cursor-pointer accent-ink"
          />
          <span className="text-label text-ink-60">
            {marcado ? "avisado" : "sin avisar"}
          </span>
        </label>
      </span>

      {motivoVisible && bloqueo && (
        <span role="status" className="max-w-[240px] text-label text-ink-60">
          {bloqueo}
        </span>
      )}
      {error && (
        <span role="alert" className="max-w-[240px] text-label text-overdue">
          {error}
        </span>
      )}
    </span>
  );
}
