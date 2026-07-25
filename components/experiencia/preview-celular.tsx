"use client";

import { useState } from "react";

// La landing REAL adentro de un marco de celular. Es un iframe de
// /[slug], no una maqueta: si fuera una maqueta, mentiría. `version` es
// el updated_at de la configuración — al guardar, la Server Action
// revalida, el server component vuelve a renderizar con la versión
// nueva, y el cambio de key recarga el iframe solo. Se siente inmediato,
// que es el argumento comercial de la pantalla.
export function PreviewCelular({
  slug,
  version,
}: {
  slug: string;
  version: string;
}) {
  const [manual, setManual] = useState(0);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="h-[604px] w-[296px] overflow-hidden rounded-[36px] border-[6px] border-ink bg-base shadow-lg">
        {/* La landing es responsive: a 284px de ancho se acomoda sola,
            como en un celular chico de verdad. */}
        <iframe
          key={`${version}-${manual}`}
          src={`/${slug}`}
          title="Así ve tu página el cliente"
          className="h-full w-full"
        />
      </div>
      <div className="flex items-center gap-3">
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 content-center text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
        >
          Abrir la página
        </a>
        <button
          type="button"
          onClick={() => setManual((n) => n + 1)}
          className="min-h-11 text-ui font-semibold text-ink-60 hover:text-ink"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
