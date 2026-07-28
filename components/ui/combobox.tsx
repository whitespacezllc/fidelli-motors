"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconoChevron } from "@/components/iconos";

// Combobox del sistema: se puede elegir de una lista O escribir libre. Nace
// para el detalle de cada renglón del cartón —"qué aceite de caja le puse"—,
// donde a veces el producto está en el catálogo y a veces es texto suelto.
//
// Reemplaza al <input list=datalist>, que no abría como dropdown: el datalist
// sólo sugiere al tipear y no muestra la lista al tocarlo, así que no se
// sentía como un desplegable. Este abre al foco o al tocar la flecha, filtra
// mientras se escribe, y deja pasar el texto libre.
//
// Accesible: role combobox + listbox, navegable con flechas y Enter, se
// cierra con Escape o tocando afuera. Objetivos táctiles de 44px para el
// dedo con aceite.
export function Combobox({
  value,
  onChange,
  opciones,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  id?: string;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Sin texto muestra todo; con texto, filtra por coincidencia.
  const termino = value.trim().toLowerCase();
  const filtradas = termino
    ? opciones.filter((o) => o.toLowerCase().includes(termino))
    : opciones;

  // El resaltado no puede quedar apuntando a un índice que el filtro ya no tiene.
  const indice = Math.min(resaltado, Math.max(0, filtradas.length - 1));

  // Cerrar al tocar afuera.
  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [abierto]);

  function elegir(o: string) {
    onChange(o);
    setAbierto(false);
  }

  function alTeclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) setAbierto(true);
      else setResaltado((r) => Math.min(r + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (e.key === "Enter" && abierto && filtradas[indice]) {
      e.preventDefault();
      elegir(filtradas[indice]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedor} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setAbierto(true);
            setResaltado(0);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclado}
          className="h-11 w-full rounded-md border border-line bg-base pr-10 pl-3.5 text-body text-ink"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onMouseDown={(e) => {
            // preventDefault para que el input no pierda el foco antes de togglear.
            e.preventDefault();
            setAbierto((a) => !a);
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-40 hover:text-ink-60"
        >
          <IconoChevron
            className={`size-4 transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {abierto && filtradas.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-base py-1 shadow-lg"
        >
          {filtradas.map((o, i) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                // onMouseDown y no onClick: se dispara antes del blur del input,
                // así el click no se pierde al cerrarse el panel.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setResaltado(i)}
                className={`flex min-h-11 w-full items-center px-3.5 text-left text-body transition-colors ${
                  i === indice ? "bg-surface text-ink" : "text-ink-60"
                }`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
