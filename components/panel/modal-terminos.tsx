"use client";

import { useActionState, useId, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { aceptarTerminos, type EstadoAceptacion } from "@/app/panel/actions";
import { DOCUMENTOS_LEGALES, VERSION_LEGAL } from "@/lib/legal";

// ============================================================
// EL MODAL DE LOS TÉRMINOS — bloqueante, sin "después"
//
// Aparece cuando el tenant no aceptó la versión vigente de los documentos
// legales (`sesion.terminosPendientes`), encima de TODO el panel: lo monta
// app/panel/layout.tsx, así que cubre también el onboarding y Ayuda.
// Términos primero, onboarding después: nadie carga un producto antes de
// haber aceptado el contrato.
//
// No se cierra: sin botón de cerrar, Escape y el clic afuera no hacen nada.
// El foco queda atrapado adentro y el scroll de la página se bloquea —eso lo
// pone el Dialog de Radix—, y como el layout lo vuelve a renderizar en cada
// ruta del panel, tampoco se sale navegando. La única salida es aceptar.
//
// Ink, nunca rojo: no es una acción de marca, es un trámite. Y el botón se
// deshabilita apenas se toca, con ancho fijo, como todo botón de guardar.
// ============================================================

const INICIAL: EstadoAceptacion = {};

export function ModalTerminos({ taller }: { taller: string }) {
  const [estado, accion, pendiente] = useActionState(aceptarTerminos, INICIAL);
  const [leido, setLeido] = useState(false);
  const idCheck = useId();
  const idDescripcion = useId();

  return (
    <RadixDialog.Root open>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <RadixDialog.Content
          aria-describedby={idDescripcion}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[94dvh] overflow-y-auto rounded-t-lg bg-base p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] focus:outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line sm:p-6 sm:shadow-lg"
        >
          <RadixDialog.Title className="font-brand text-lead font-bold text-ink">
            Antes de seguir
          </RadixDialog.Title>

          <RadixDialog.Description id={idDescripcion} className="mt-2 text-body text-ink-60">
            Para seguir usando Fidelli, leé y aceptá los Términos y la Política
            de Privacidad.
          </RadixDialog.Description>

          {/* Los dos documentos, en pestaña nueva: el modal sigue acá cuando
              vuelva. Enlaces de texto, del ancho de su contenido, con área
              táctil de 44px. */}
          <ul className="mt-4 flex flex-col gap-1">
            {DOCUMENTOS_LEGALES.map((d) => (
              <li key={d.slug}>
                <a
                  href={d.ruta}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4 hover:text-ink-60"
                >
                  {d.slug === "terminos" ? "Términos y Condiciones" : "Política de Privacidad"}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </li>
            ))}
          </ul>

          <form action={accion} className="mt-5 flex flex-col gap-4">
            {estado.error && (
              <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
                {estado.error}
              </p>
            )}

            <label htmlFor={idCheck} className="flex min-h-11 cursor-pointer items-start gap-3 text-body text-ink">
              <input
                id={idCheck}
                name="acepto"
                type="checkbox"
                value="si"
                checked={leido}
                onChange={(e) => setLeido(e.target.checked)}
                className="mt-1 size-5 shrink-0 cursor-pointer accent-ink"
              />
              <span>
                Leí y acepto los Términos y Condiciones y la Política de
                Privacidad en nombre de {taller}.
              </span>
            </label>

            <button
              type="submit"
              disabled={!leido || pendiente}
              className="inline-flex h-12 w-full items-center justify-center rounded-md bg-ink px-5 font-brand text-body font-bold text-base transition-colors hover:bg-ink-60 disabled:pointer-events-none disabled:opacity-60"
            >
              {pendiente ? "Registrando…" : "Aceptar y continuar"}
            </button>

            <p className="text-label text-ink-40 tabular-nums">
              Versión {VERSION_LEGAL}. Queda registrado quién aceptó y cuándo.
            </p>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
