"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { IconoCerrar } from "@/components/iconos";

// Dialog del sistema sobre Radix (foco atrapado, Escape, scroll lock) con
// estilos propios: hoja casi completa en mobile, tarjeta centrada en desktop.
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

export function DialogContenido({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <RadixDialog.Content
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[94dvh] overflow-y-auto rounded-t-lg bg-base p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] focus:outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line sm:p-6 sm:shadow-lg"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <RadixDialog.Title className="font-brand text-lead font-bold text-ink">
            {titulo}
          </RadixDialog.Title>
          <RadixDialog.Close
            aria-label="Cerrar"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-40 hover:text-ink-60"
          >
            <IconoCerrar className="size-5" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
