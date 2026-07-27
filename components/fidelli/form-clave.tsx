"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui/boton";
import { CampoClave } from "@/components/auth/campo-clave";
import { CLASE_AYUDA, CLASE_ERROR, CLASE_LABEL } from "@/components/fidelli/estilos";
import { cambiarClave, type EstadoClave } from "@/app/fidelli/cuenta/actions";

const INICIAL: EstadoClave = {};

export function FormClave() {
  const [estado, guardar, guardando] = useActionState(cambiarClave, INICIAL);

  return (
    <form action={guardar} className="flex max-w-[420px] flex-col gap-4">
      {estado.error && (
        <p role="alert" className={CLASE_ERROR}>
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
        <p className={CLASE_AYUDA}>
          Se pide para confirmar que sos vos: esta cuenta ve los datos de
          todos los lubricentros.
        </p>
      </div>

      <div>
        <label htmlFor="nueva" className={CLASE_LABEL}>
          Contraseña nueva
        </label>
        <CampoClave name="nueva" autoComplete="new-password" minLength={8} />
        <p className={CLASE_AYUDA}>Mínimo 8 caracteres.</p>
      </div>

      {/* Ancho fijo: el texto cambia al enviarse y el botón no puede saltar. */}
      <Boton type="submit" tam="lg" disabled={guardando} className="min-w-[190px] self-start">
        {guardando ? "Guardando…" : "Cambiar contraseña"}
      </Boton>
    </form>
  );
}
