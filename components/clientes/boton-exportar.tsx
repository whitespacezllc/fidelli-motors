"use client";

import { useState } from "react";
import { clasesBoton } from "@/components/ui/boton";

// Exporta lo que está filtrado en pantalla: si Bruno buscó "gomez", se
// lleva esos; sin filtro, todos. Con cero resultados no se genera un
// archivo vacío — se avisa acá mismo.
export function BotonExportar({
  q,
  hayResultados,
}: {
  q?: string;
  hayResultados: boolean;
}) {
  const [aviso, setAviso] = useState(false);

  if (!hayResultados) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          aria-disabled="true"
          onClick={() => setAviso((v) => !v)}
          className={`${clasesBoton("secundario", "md")} cursor-not-allowed opacity-60`}
        >
          Exportar
        </button>
        {aviso && (
          <span role="status" className="max-w-56 text-right text-label text-ink-60">
            No hay clientes para exportar con ese filtro. Cambiá la búsqueda y
            volvé a intentar.
          </span>
        )}
      </span>
    );
  }

  const url = `/panel/clientes/exportar${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    // Un <a> con download: el navegador maneja la descarga y la pantalla
    // no se mueve de donde está.
    <a href={url} download className={clasesBoton("secundario", "md")}>
      Exportar
    </a>
  );
}
