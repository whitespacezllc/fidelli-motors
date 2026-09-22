"use client";

import { useActionState, useId, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import type { EstadoSupresion } from "@/lib/clientes";

// ============================================================
// "Eliminar datos personales": la supresión a pedido del titular.
//
// Un solo dialog para las dos puertas —la ficha del cliente en el panel y
// la lista de clientes de la ficha del tenant en /fidelli—: cambia la
// acción, no la conversación. La base (anonimizar_cliente) exige el motivo
// y lo registra ANTES de tocar el dato; acá se pide y se explica qué pasa.
//
// Es una acción irreversible y por eso NO es el primario rojo: el rojo es
// acción de marca, y esto es un trámite serio. Va en ink, como el modal de
// términos, y el botón se deshabilita apenas se toca.
// ============================================================

const INICIAL: EstadoSupresion = {};

const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

export function DialogSuprimirCliente({
  clienteId,
  lubricentroId,
  nombre,
  accion,
}: {
  clienteId: string;
  /** Solo desde /fidelli: la ficha que hay que revalidar. */
  lubricentroId?: string;
  nombre: string;
  accion: (prev: EstadoSupresion, formData: FormData) => Promise<EstadoSupresion>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const idMotivo = useId();

  // El dialog se cierra dentro de la acción: cerrarse es la consecuencia de
  // haber suprimido, no un efecto suelto.
  const [estado, ejecutar, pendiente] = useActionState(
    async (previo: EstadoSupresion, formData: FormData) => {
      const r = await accion(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  const motivoCorto = motivo.trim().length < 10;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setMotivo("");
      }}
    >
      <DialogTrigger className="inline-flex min-h-11 items-center rounded-md px-2 text-ui text-ink-60 underline underline-offset-4 transition-colors hover:text-ink">
        Eliminar datos personales
      </DialogTrigger>
      <DialogContenido titulo="Eliminar los datos personales">
        <form action={ejecutar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
              {estado.error}
            </p>
          )}

          <input type="hidden" name="cliente_id" value={clienteId} />
          {lubricentroId && <input type="hidden" name="lubricentro_id" value={lubricentroId} />}

          <p className="text-body text-ink-60">
            Se borran el nombre, el teléfono, el email y el CUIT de{" "}
            <span className="font-semibold text-ink">{nombre}</span>. Sus
            vehículos y sus trabajos quedan, sin persona: el historial de
            cada auto sigue existiendo. No se puede deshacer.
          </p>

          <div>
            <label htmlFor={idMotivo} className={CLASE_LABEL}>
              Por qué
            </label>
            <textarea
              id={idMotivo}
              name="motivo"
              required
              minLength={10}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Lo pidió el titular en el mostrador el 22/09"
              className="w-full rounded-md border border-line bg-base px-3.5 py-2.5 text-body text-ink placeholder:text-ink-40"
            />
            <p className="mt-1.5 text-label text-ink-60">
              Queda registrado quién lo hizo, cuándo y por qué.
            </p>
          </div>

          <button
            type="submit"
            disabled={motivoCorto || pendiente}
            className="inline-flex h-12 w-full items-center justify-center rounded-md bg-ink px-5 font-brand text-body font-bold text-base transition-colors hover:bg-ink-60 disabled:pointer-events-none disabled:opacity-60"
          >
            {pendiente ? "Eliminando…" : "Eliminar los datos"}
          </button>
        </form>
      </DialogContenido>
    </Dialog>
  );
}
