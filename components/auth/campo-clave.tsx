"use client";

import { useState } from "react";
import { IconoOjo, IconoOjoCerrado } from "@/components/iconos";

// Input de contraseña con mostrar/ocultar. El toggle tiene 44px de área táctil.
export function CampoClave({
  name = "password",
  autoComplete,
  minLength,
}: {
  name?: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={name}
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className="h-12 w-full rounded-md border border-line bg-base px-3.5 pr-13 text-body text-ink placeholder:text-ink-40"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-ink-40 hover:text-ink-60"
      >
        {visible ? (
          <IconoOjoCerrado className="size-5" />
        ) : (
          <IconoOjo className="size-5" />
        )}
      </button>
    </div>
  );
}
