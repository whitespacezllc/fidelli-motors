"use client";

import { useActionState, useEffect, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { IconoOjo, IconoCandado } from "@/components/iconos";
import {
  crearNota,
  editarNota,
  type EstadoNota,
} from "@/app/panel/notas/actions";

export type NotaEditable = {
  id: string;
  contenido: string;
  visibleCliente: boolean;
};

const ESTADO_INICIAL: EstadoNota = {};

// El mismo formulario crea (con vehiculoId) y edita (con nota). La
// visibilidad va en dos tarjetas de radio explícitas — nunca un toggle
// sutil: la diferencia entre "la ve tu cliente" y "solo la ves vos" es
// exactamente lo que no puede quedar ambiguo.
export function FormNota({
  vehiculoId,
  nota,
  alGuardar,
}: {
  vehiculoId?: string;
  nota?: NotaEditable;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    nota ? editarNota : crearNota,
    ESTADO_INICIAL,
  );
  const [visibilidad, setVisibilidad] = useState<"visible" | "interna">(
    nota ? (nota.visibleCliente ? "visible" : "interna") : "visible",
  );
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    if (estado.ok) alGuardar();
  }, [estado.ok, alGuardar]);

  const error = sinConexion
    ? "Estás sin conexión a internet. No cierres esta ventana: lo que escribiste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo."
    : estado.error;

  const OPCIONES = [
    {
      valor: "visible" as const,
      Icono: IconoOjo,
      titulo: "La ve tu cliente",
      detalle: "Aparece en su cartón, con la fecha de hoy.",
    },
    {
      valor: "interna" as const,
      Icono: IconoCandado,
      titulo: "Solo la ves vos",
      detalle: "Queda en el panel, para el taller.",
    },
  ];

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!navigator.onLine) {
          e.preventDefault();
          setSinConexion(true);
        } else {
          setSinConexion(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {error}
        </p>
      )}

      {nota ? (
        <input type="hidden" name="id" value={nota.id} />
      ) : (
        <input type="hidden" name="vehiculo_id" value={vehiculoId} />
      )}

      <div>
        <label
          htmlFor={`nota-${nota?.id ?? vehiculoId}`}
          className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase"
        >
          La nota
        </label>
        <textarea
          id={`nota-${nota?.id ?? vehiculoId}`}
          name="contenido"
          required
          minLength={2}
          rows={3}
          defaultValue={nota?.contenido}
          className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
        />
        <p className="mt-1.5 text-label text-ink-60">
          Sobre el auto, no sobre esta visita: “cubiertas delanteras para
          cambio”, “pérdida chica en el cárter, controlar”.
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Quién la ve
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES.map((o) => (
            <label
              key={o.valor}
              className={`flex min-h-16 cursor-pointer items-start gap-2.5 rounded-md border px-3.5 py-3 transition-colors ${
                visibilidad === o.valor
                  ? "border-ink bg-surface"
                  : "border-line bg-base hover:bg-surface/60"
              }`}
            >
              <input
                type="radio"
                name="visibilidad"
                value={o.valor}
                checked={visibilidad === o.valor}
                onChange={() => setVisibilidad(o.valor)}
                className="mt-1 size-4 shrink-0 cursor-pointer accent-ink"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-ui font-semibold text-ink">
                  <o.Icono aria-hidden className="size-4.5 shrink-0" />
                  {o.titulo}
                </span>
                <span className="mt-0.5 block text-label text-ink-60">
                  {o.detalle}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Boton type="submit" tam="lg" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Guardar nota"}
      </Boton>
    </form>
  );
}
