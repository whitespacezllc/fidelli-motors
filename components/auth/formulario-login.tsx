"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { iniciarSesion, type EstadoAccion } from "@/lib/auth/actions";
import { CampoClave } from "@/components/auth/campo-clave";

const ESTADO_INICIAL: EstadoAccion = {};

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(
    iniciarSesion,
    ESTADO_INICIAL,
  );
  const [sinConexion, setSinConexion] = useState(false);

  const error = sinConexion
    ? "Estás sin conexión a internet. Revisá la señal y tocá Entrar de nuevo."
    : estado.error;

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        // Si el dispositivo está offline, el envío no va a llegar: se avisa acá.
        if (!navigator.onLine) {
          e.preventDefault();
          setSinConexion(true);
        } else {
          setSinConexion(false);
        }
      }}
      className="flex flex-col gap-5"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {error}
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

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase"
        >
          Contraseña
        </label>
        <CampoClave autoComplete="current-password" />
      </div>

      {/* Se deshabilita apenas se toca; el ancho completo evita saltos de layout. */}
      <button
        type="submit"
        disabled={pendiente}
        className="h-12 w-full rounded-md bg-brand font-brand text-body font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>

      <Link
        href="/recuperar"
        className="self-center text-ui font-semibold text-brand"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
