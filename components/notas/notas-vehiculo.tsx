"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { clasesBoton } from "@/components/ui/boton";
import { IconoOjo, IconoCandado } from "@/components/iconos";
import { FormNota } from "@/components/notas/form-nota";
import { eliminarNota, type EstadoNota } from "@/app/panel/notas/actions";
import { formatearFecha } from "@/lib/fechas";

export type NotaDelVehiculo = {
  id: string;
  contenido: string;
  visibleCliente: boolean;
  createdAt: string;
  updatedAt: string;
  autor: string | null;
};

const ESTADO_INICIAL: EstadoNota = {};

// Editada = updated_at real por detrás de created_at. El trigger toca
// updated_at en cada UPDATE, así que un margen de segundos alcanza para
// distinguir "recién creada" de "corregida después".
function fueEditada(nota: NotaDelVehiculo): boolean {
  return (
    new Date(nota.updatedAt).getTime() - new Date(nota.createdAt).getTime() >
    60 * 1000
  );
}

function FilaNota({ nota }: { nota: NotaDelVehiculo }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [estadoBorrar, borrar, borrando] = useActionState(
    eliminarNota,
    ESTADO_INICIAL,
  );

  return (
    <li className="rounded-md border border-line bg-base px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* La fecha grande es SIEMPRE la de creación: es cuándo se observó
            la cubierta. La corrección se ve aparte, discreta. */}
        <span className="text-ui font-semibold text-ink tabular-nums">
          {formatearFecha(nota.createdAt)}
        </span>
        {fueEditada(nota) && (
          <span className="text-label text-ink-40 tabular-nums">
            editada el {formatearFecha(nota.updatedAt)}
          </span>
        )}

        {/* La marca de visibilidad, inequívoca: ícono + etiqueta. */}
        {nota.visibleCliente ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-success bg-success-soft px-2 py-0.5 text-label font-semibold text-success">
            <IconoOjo aria-hidden className="size-4 shrink-0" />
            La ve tu cliente
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold text-ink-60">
            <IconoCandado aria-hidden className="size-4 shrink-0" />
            Solo la ves vos
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          <Dialog open={editando} onOpenChange={setEditando}>
            <DialogTrigger className="min-h-9 rounded-md px-2.5 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink">
              Editar
            </DialogTrigger>
            <DialogContenido titulo="Editar nota">
              <p className="mb-4 -mt-2 text-ui text-ink-60">
                La fecha que ve tu cliente sigue siendo la original (
                {formatearFecha(nota.createdAt)}): corregir la nota no la
                convierte en una nueva.
              </p>
              <FormNota
                key={String(editando)}
                nota={{
                  id: nota.id,
                  contenido: nota.contenido,
                  visibleCliente: nota.visibleCliente,
                }}
                alGuardar={() => setEditando(false)}
              />
            </DialogContenido>
          </Dialog>

          {/* Borrar con confirmación en la fila: una nota es una
              recomendación, no un registro — pero no hay papelera. */}
          {confirmando ? (
            <form action={borrar} className="flex items-center gap-1">
              <input type="hidden" name="id" value={nota.id} />
              <button
                type="submit"
                disabled={borrando}
                className="rounded-md border border-overdue bg-overdue-soft px-2.5 py-1.5 text-ui font-semibold text-overdue disabled:opacity-60"
              >
                {borrando ? "Borrando…" : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="px-2 py-1.5 text-ui font-semibold text-ink-60"
              >
                No
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="min-h-9 rounded-md px-2.5 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink"
            >
              Borrar
            </button>
          )}
        </span>
      </div>

      <p className="mt-1.5 text-ui leading-relaxed text-ink">{nota.contenido}</p>
      {nota.autor && (
        <p className="mt-1 text-label text-ink-40">por {nota.autor}</p>
      )}

      {estadoBorrar.error && (
        <p role="alert" className="mt-2 rounded-md bg-overdue-soft px-3 py-2 text-ui text-overdue">
          {estadoBorrar.error}
        </p>
      )}
    </li>
  );
}

// La sección "Notas" dentro de la tarjeta de cada vehículo en la ficha
// del cliente. Recomendaciones sobre EL AUTO — lo que en la carga del
// service son las "observaciones del service", acá sobrevive a la visita.
export function NotasVehiculo({
  vehiculoId,
  notas,
}: {
  vehiculoId: string;
  notas: NotaDelVehiculo[];
}) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Notas del vehículo
        </p>
        <Dialog open={creando} onOpenChange={setCreando}>
          <DialogTrigger className={clasesBoton("secundario", "md")}>
            + Nueva nota
          </DialogTrigger>
          <DialogContenido titulo="Nota del vehículo">
            <FormNota
              key={String(creando)}
              vehiculoId={vehiculoId}
              alGuardar={() => setCreando(false)}
            />
          </DialogContenido>
        </Dialog>
      </div>

      {notas.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-2">
          {notas.map((n) => (
            <FilaNota key={n.id} nota={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
