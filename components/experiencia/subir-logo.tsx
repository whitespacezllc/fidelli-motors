"use client";

import { useActionState, useRef, useState } from "react";
import {
  subirLogo,
  quitarLogo,
  type EstadoLogo,
} from "@/app/panel/experiencia/actions";

const ESTADO_INICIAL: EstadoLogo = {};

const DOS_MB = 2 * 1024 * 1024;

// Subir, previsualizar y quitar. Sin logo la landing compone el nombre
// tipográficamente — no es un estado roto y la UI no lo trata como tal.
export function SubirLogo({
  logoUrl,
  nombre,
}: {
  logoUrl: string | null;
  nombre: string;
}) {
  const [estado, accion, subiendo] = useActionState(subirLogo, ESTADO_INICIAL);
  const [estadoQuitar, accionQuitar, quitando] = useActionState(
    quitarLogo,
    ESTADO_INICIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // El peso se frena ANTES de enviar: un archivo de más de 2 MB ni
  // siquiera pasaría el límite de body del server, así que mandarlo solo
  // gastaría la subida para morir sin mensaje. El server valida igual
  // (bytes reales, magic bytes) para lo que entre por otro camino.
  function alElegir() {
    setErrorLocal(null);
    const archivo = formRef.current?.logo?.files?.[0];
    if (!archivo) return;
    if (archivo.size > DOS_MB) {
      const mb = (archivo.size / 1024 / 1024).toFixed(1);
      setErrorLocal(
        `Ese archivo pesa ${mb} MB y el máximo es 2 MB: un logo más pesado hace lenta la página de tus clientes. Achicalo y volvé a subirlo.`,
      );
      formRef.current?.reset();
      return;
    }
    formRef.current?.requestSubmit();
  }

  const error = errorLocal ?? estado.error ?? estadoQuitar.error;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {/* La previsualización, sobre los dos fondos que va a pisar */}
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`Logo de ${nombre}`} className="size-full object-contain" />
          ) : (
            <span className="px-2 text-center text-label text-ink-40">Sin logo</span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <form ref={formRef} action={accion} className="flex flex-wrap items-center gap-2.5">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Elegir logo"
              // Al elegir el archivo se sube solo: "elegir y después
              // apretar subir" es un paso de más.
              onChange={alElegir}
              disabled={subiendo}
              className="max-w-full text-ui text-ink-60 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-base file:px-3.5 file:py-2 file:text-ui file:font-semibold file:text-ink hover:file:bg-surface"
            />
            {subiendo && <span className="text-ui text-ink-60">Subiendo…</span>}
          </form>

          {logoUrl && (
            <form action={accionQuitar} className="mt-2">
              <button
                type="submit"
                disabled={quitando}
                className="min-h-11 text-ui font-semibold text-ink-60 hover:text-ink"
              >
                {quitando ? "Quitando…" : "Quitar logo"}
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-2 text-label text-ink-60">
        PNG, JPG o WEBP · hasta 2 MB. Si no subís logo, tu nombre se muestra
        escrito y también queda bien.
      </p>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
