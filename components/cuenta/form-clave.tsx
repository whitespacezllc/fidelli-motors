"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui/boton";
import { CampoClave } from "@/components/auth/campo-clave";
import { cambiarClave, type EstadoCuenta } from "@/app/panel/cuenta/actions";

const INICIAL: EstadoCuenta = {};

const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

export function FormClavePanel() {
  const [estado, enviar, pendiente] = useActionState(cambiarClave, INICIAL);

  return (
    <form action={enviar} className="flex max-w-md flex-col gap-4">
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
        <label htmlFor="actual" className={CLASE_LABEL}>
          Contraseña actual
        </label>
        <CampoClave name="actual" autoComplete="current-password" />
      </div>

      <div>
        <label htmlFor="nueva" className={CLASE_LABEL}>
          Contraseña nueva
        </label>
        <CampoClave name="nueva" autoComplete="new-password" minLength={8} />
        <p className="mt-1.5 text-label text-ink-40">Mínimo 8 caracteres.</p>
      </div>

      <Boton
        type="submit"
        variante="secundario"
        disabled={pendiente}
        className="min-w-[190px] self-start"
      >
        {pendiente ? "Guardando…" : "Cambiar contraseña"}
      </Boton>
    </form>
  );
}
