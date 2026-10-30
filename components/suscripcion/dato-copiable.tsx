"use client";

import { useState } from "react";

// ============================================================
// Un dato que se copia: el alias, el CVU.
//
// Área táctil de 44px: el dueño copia esto con el home banking abierto en
// la otra mano. Y el estado "Copiado" dura lo justo para verse — sin eso,
// no hay forma de saber si el toque tomó. Lo usan la pantalla de pago y
// Mi cuenta → Plan y pagos, que muestran la misma cuenta.
// ============================================================
export function Copiar({ valor, que }: { valor: string; que: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copiar ${que}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        } catch {
          // Sin permiso de portapapeles —pasa en algunos navegadores sobre
          // http— no se rompe nada: el valor está a la vista para copiarlo
          // a mano, que es lo que el dueño iba a hacer igual.
        }
      }}
      className="h-11 shrink-0 rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink"
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

export function Dato({ k, v, copiable }: { k: string; v: string; copiable?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="w-16 shrink-0 text-label font-semibold tracking-[0.05em] text-ink-40 uppercase">
        {k}
      </span>
      <span className="min-w-0 flex-1 font-brand text-body font-bold break-all tabular-nums">
        {v}
      </span>
      {copiable && <Copiar valor={v} que={k} />}
    </div>
  );
}
