"use client";

import { useId, useState } from "react";

// Un ítem de navegación con candado, mientras el onboarding no terminó.
// No es un enlace: es un botón apagado que, al tocarlo, dice por qué.
//
// El motivo aparece al pasar el mouse, al enfocar con el teclado y al
// tocar (en un celular no hay hover): un tooltip chico en grafito, como los
// avisos flotantes del sistema. `aria-disabled` y no `disabled` para que
// el lector de pantalla lo encuentre y lea el motivo.
//
// El hover y el toque son dos estados distintos a propósito: con uno solo,
// el clic que llega después del hover lo apagaba en vez de fijarlo.
export function ItemBloqueado({
  motivo,
  posicion = "abajo",
  className = "",
  children,
}: {
  motivo: string;
  /** Dónde se abre el tooltip: debajo (sidebar) o encima (barra de mobile). */
  posicion?: "abajo" | "arriba";
  className?: string;
  children: React.ReactNode;
}) {
  const [fijado, setFijado] = useState(false);
  const [encima, setEncima] = useState(false);
  const visible = fijado || encima;
  const id = useId();

  return (
    <div className="relative">
      <span
        role="button"
        tabIndex={0}
        aria-disabled="true"
        aria-describedby={visible ? id : undefined}
        onClick={() => setFijado((f) => !f)}
        onMouseEnter={() => setEncima(true)}
        onMouseLeave={() => setEncima(false)}
        onFocus={() => setFijado(true)}
        onBlur={() => setFijado(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFijado((f) => !f);
          }
          if (e.key === "Escape") setFijado(false);
        }}
        className={className}
      >
        {children}
      </span>
      {visible && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-ink px-3 py-2 font-ui text-label text-inverso shadow-lg ${
            posicion === "abajo"
              ? "top-full left-3 mt-1"
              : "bottom-full left-1/2 mb-2 -translate-x-1/2"
          }`}
        >
          {motivo}
        </span>
      )}
    </div>
  );
}
