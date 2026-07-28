"use client";

import { useActionState } from "react";
import Link from "next/link";
import { enviarRecuperacion, type EstadoAccion } from "@/lib/auth/actions";

const ESTADO_INICIAL: EstadoAccion = {};

export function FormularioRecuperar() {
  const [estado, accion, pendiente] = useActionState(
    enviarRecuperacion,
    ESTADO_INICIAL,
  );

  // Enviado: se confirma sin revelar si el email existe.
  if (estado.ok) {
    return (
      <div>
        <h1 className="mb-3 font-brand text-h3 font-bold text-ink">
          Revisá tu correo
        </h1>
        <p className="text-body text-ink-60">
          Te mandamos un enlace a{" "}
          <span className="font-semibold text-ink">{estado.email}</span> para
          crear una contraseña nueva. Si no aparece en unos minutos, mirá en el
          correo no deseado.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block text-ui font-semibold text-brand"
        >
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 font-brand text-h3 font-bold text-ink">
        Recuperá tu contraseña
      </h1>
      <p className="mb-6 text-ui text-ink-60">
        Escribí el email con el que entrás al panel y te mandamos un enlace
        para crear una nueva.
      </p>

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
            htmlFor="email"
            className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40"
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="h-12 w-full rounded-md bg-brand font-brand text-body font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {pendiente ? "Enviando…" : "Enviar enlace"}
        </button>

        <Link
          href="/login"
          className="self-center text-ui font-semibold text-brand"
        >
          Volver a entrar
        </Link>
      </form>
    </div>
  );
}
