"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DialogMensaje } from "@/components/mensajes/dialog-mensaje";
import {
  activarMensaje,
  eliminarMensaje,
  type EstadoMensaje,
} from "@/app/panel/mensajes/actions";
import type { VariablesMensaje } from "@/lib/contacto";

type Mensaje = {
  id: string;
  tono: string;
  contenido: string;
  activo: boolean;
};

const ESTADO_INICIAL: EstadoMensaje = {};

export function FilaMensaje({
  mensaje,
  ejemplo,
  ejemploEsReal,
  suspendido = false,
}: {
  mensaje: Mensaje;
  ejemplo: VariablesMensaje;
  ejemploEsReal: boolean;
  suspendido?: boolean;
}) {
  const router = useRouter();
  const [activando, iniciarActivar] = useTransition();
  const [errorActivar, setErrorActivar] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const [estadoBorrar, borrar, borrando] = useActionState(
    eliminarMensaje,
    ESTADO_INICIAL,
  );

  function activar() {
    setErrorActivar(null);
    iniciarActivar(async () => {
      const r = await activarMensaje(mensaje.id);
      if (r.error) setErrorActivar(r.error);
      else router.refresh();
    });
  }

  return (
    <li
      className={`rounded-lg border px-4.5 py-4 ${
        mensaje.activo ? "border-ink bg-base" : "border-line bg-base"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-brand text-body font-bold text-ink">{mensaje.tono}</p>

        {mensaje.activo ? (
          <span className="rounded-sm border border-success bg-success-soft px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-success uppercase">
            En uso
          </span>
        ) : suspendido ? null : (
          <button
            type="button"
            onClick={activar}
            disabled={activando}
            className="rounded-md border border-line bg-base px-2.5 py-1 text-label font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
          >
            {activando ? "Activando…" : "Usar este"}
          </button>
        )}

        {/* Suspendido: solo lectura, sin acciones que rebotan. El aviso de
            arriba del layout ya explica por qué. */}
        <span className="ml-auto flex items-center gap-1">
          {!suspendido && (
            <DialogMensaje
              mensaje={mensaje}
              ejemplo={ejemplo}
              ejemploEsReal={ejemploEsReal}
            />
          )}

          {/* Borrar pide un segundo tap: no hay papelera de la que volver.
              El activo ni lo ofrece — la action además lo rechaza. */}
          {!suspendido &&
            !mensaje.activo &&
            (confirmarBorrado ? (
              <form action={borrar} className="flex items-center gap-1">
                <input type="hidden" name="id" value={mensaje.id} />
                <button
                  type="submit"
                  disabled={borrando}
                  className="rounded-md border border-overdue bg-overdue-soft px-2.5 py-1.5 text-ui font-semibold text-overdue disabled:opacity-60"
                >
                  {borrando ? "Borrando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  className="px-2 py-1.5 text-ui font-semibold text-ink-60"
                >
                  No
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                className="rounded-md px-2.5 py-1.5 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink"
              >
                Borrar
              </button>
            ))}
        </span>
      </div>

      <p className="mt-2 text-ui leading-relaxed text-ink-60">
        {mensaje.contenido}
      </p>

      {mensaje.activo && (
        <p className="mt-2 text-label text-ink-40">
          Es el que arma los WhatsApp del panel de próximos services.
        </p>
      )}

      {(errorActivar || estadoBorrar.error) && (
        <p role="alert" className="mt-2 rounded-md bg-overdue-soft px-3 py-2 text-ui text-overdue">
          {errorActivar ?? estadoBorrar.error}
        </p>
      )}
    </li>
  );
}
