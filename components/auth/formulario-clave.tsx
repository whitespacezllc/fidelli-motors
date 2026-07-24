"use client";

import { useActionState } from "react";
import { guardarClave, type EstadoAccion } from "@/lib/auth/actions";
import { CampoClave } from "@/components/auth/campo-clave";

const ESTADO_INICIAL: EstadoAccion = {};

export function FormularioClave() {
  const [estado, accion, pendiente] = useActionState(
    guardarClave,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {estado.error}
        </p>
      )}

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase"
        >
          Contraseña nueva
        </label>
        <CampoClave autoComplete="new-password" minLength={8} />
        <p className="mt-1.5 text-label text-ink-40">Mínimo 8 caracteres.</p>
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="h-12 w-full rounded-md bg-brand font-brand text-body font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
