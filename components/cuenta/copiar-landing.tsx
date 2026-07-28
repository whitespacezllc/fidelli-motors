"use client";

import { useState } from "react";

// La URL de la landing con su botón de copiar. Se copia la URL completa:
// es lo que el lubri pega en su Instagram o le manda a un cliente.
export function CopiarLanding({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de clipboard: el texto está visible, se copia a mano.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3.5 py-3 text-ui text-ink tabular-nums">
        {url}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="h-11 shrink-0 rounded-md border border-line bg-base px-4 text-ui font-semibold text-ink transition-colors hover:bg-surface"
      >
        {copiado ? "Copiada ✓" : "Copiar"}
      </button>
    </div>
  );
}
