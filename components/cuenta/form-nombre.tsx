"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui/boton";
import type { EstadoCuenta } from "@/app/panel/cuenta/actions";

const INICIAL: EstadoCuenta = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// El mismo formulario sirve para el nombre del usuario y el de la marca:
// un campo, una action, el mensaje de resultado. Lo que cambia viene por props.
export function FormNombre({
  accion,
  etiqueta,
  ayuda,
  valorInicial,
  deshabilitado = false,
}: {
  accion: (prev: EstadoCuenta, formData: FormData) => Promise<EstadoCuenta>;
  etiqueta: string;
  ayuda?: string;
  valorInicial: string;
  deshabilitado?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, INICIAL);

  return (
    <form action={enviar} className="flex flex-col gap-3">
      {estado.error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
          {estado.ok}
        </p>
      )}

      <div>
        <label htmlFor={`nombre-${etiqueta}`} className={CLASE_LABEL}>
          {etiqueta}
        </label>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <input
            id={`nombre-${etiqueta}`}
            name="nombre"
            required
            minLength={2}
            defaultValue={valorInicial}
            disabled={deshabilitado}
            className={`${CLASE_CAMPO} disabled:bg-surface disabled:text-ink-40`}
          />
          {/* Ancho fijo: el texto cambia al enviarse y el botón no salta. */}
          <Boton
            type="submit"
            variante="secundario"
            disabled={pendiente || deshabilitado}
            className="w-full shrink-0 sm:w-[130px]"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </Boton>
        </div>
        {ayuda && <p className="mt-1.5 text-label text-ink-60">{ayuda}</p>}
      </div>
    </form>
  );
}
