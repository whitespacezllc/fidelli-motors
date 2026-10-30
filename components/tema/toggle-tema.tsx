"use client";

import { useState, useTransition } from "react";
import { IconoLuna, IconoSol } from "@/components/iconos";
import { fijarTemaPanel } from "@/lib/tema-panel-actions";
import { otroTema, type TemaPanel } from "@/lib/tema-panel";

// El interruptor del modo oscuro. Tres formas, un solo comportamiento:
//   · fila   — un renglón de la navegación (el pie del sidebar, la hoja
//              «Más» del celular): ícono, «Modo oscuro» y el switch.
//   · bloque — el renglón de Mi cuenta, con su explicación.
//   · icono  — un botón cuadrado para la barra de /fidelli.
//
// Cambia en el ACTO: el atributo `data-theme` del wrapper se pisa en el
// DOM antes de que la base conteste, así el panel no parpadea ni espera
// un round trip para ponerse oscuro. Si la base rechaza el cambio, vuelve
// atrás y lo dice. El layout vuelve a pintar el atributo desde la sesión
// en la próxima navegación, con lo guardado.
export function ToggleTema({
  tema,
  variante = "fila",
  className = "",
}: {
  tema: TemaPanel;
  variante?: "fila" | "bloque" | "icono";
  className?: string;
}) {
  const [actual, setActual] = useState<TemaPanel>(tema);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const oscuro = actual === "oscuro";

  function pintar(t: TemaPanel) {
    // El wrapper de la superficie es el único con `data-tema-panel`: los
    // papeles también llevan `data-theme`, pero fijo en claro.
    document
      .querySelectorAll<HTMLElement>("[data-tema-panel]")
      .forEach((el) => el.setAttribute("data-theme", t));
  }

  function cambiar() {
    const nuevo = otroTema(actual);
    setActual(nuevo);
    setError(null);
    pintar(nuevo);
    empezar(async () => {
      const resultado = await fijarTemaPanel(nuevo);
      if (resultado.error) {
        setActual(actual);
        pintar(actual);
        setError(resultado.error);
      }
    });
  }

  const Icono = oscuro ? IconoLuna : IconoSol;
  const etiqueta = `Modo oscuro: ${oscuro ? "activado" : "desactivado"}`;

  const interruptor = (
    <span
      aria-hidden
      className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        oscuro ? "bg-ink" : "bg-line"
      }`}
    >
      <span
        className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
          oscuro ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </span>
  );

  if (variante === "icono") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={oscuro}
        aria-label={etiqueta}
        title={oscuro ? "Pasar al modo claro" : "Pasar al modo oscuro"}
        onClick={cambiar}
        disabled={pendiente}
        className={`flex size-10 items-center justify-center rounded-md text-ink-60 transition-colors hover:bg-surface hover:text-ink disabled:opacity-60 ${className}`}
      >
        <Icono className="size-5" />
      </button>
    );
  }

  if (variante === "bloque") {
    return (
      <div className={className}>
        <button
          type="button"
          role="switch"
          aria-checked={oscuro}
          onClick={cambiar}
          disabled={pendiente}
          className="flex min-h-11 w-full items-center justify-between gap-4 text-left disabled:opacity-60"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-brand text-body font-bold text-ink">
              <Icono aria-hidden className="size-5 shrink-0 text-ink-60" />
              Modo oscuro
            </span>
            <span className="mt-0.5 block text-ui text-ink-60">
              Se guarda en tu cuenta: lo vas a ver igual en cualquier
              dispositivo donde entres. Los cartones y los presupuestos
              siguen en claro, como el papel.
            </span>
          </span>
          {interruptor}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-label text-overdue">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        role="switch"
        aria-checked={oscuro}
        onClick={cambiar}
        disabled={pendiente}
        className="flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-ui text-ink-60 transition-colors hover:bg-surface/60 disabled:opacity-60"
      >
        <Icono aria-hidden className="size-5 shrink-0" />
        <span className="flex-1">Modo oscuro</span>
        {interruptor}
      </button>
      {error && (
        <p role="alert" className="px-3 pb-1 text-label text-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
