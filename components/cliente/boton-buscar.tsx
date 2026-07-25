"use client";

import { useFormStatus } from "react-dom";

// El único JavaScript de la landing, y son doce líneas: el botón se apaga
// y avisa mientras viaja el pedido. En 4G esa vuelta puede tardar más de un
// segundo y sin señal de que pasó algo, Pedro lo toca de nuevo.
//
// El ancho no cambia entre los dos textos porque el botón ocupa toda la
// fila: no hay salto de layout.
export function BotonBuscar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 flex min-h-16 w-full items-center justify-center rounded-md bg-tenant px-4 py-3 text-c-lead font-bold text-tenant-ink transition-colors hover:bg-tenant-deep disabled:opacity-70 sm:mt-5 sm:min-h-18 sm:text-c-titulo"
    >
      {pending ? "Buscando…" : "Ver mi historial"}
    </button>
  );
}
