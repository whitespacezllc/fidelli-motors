"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconoBuscar } from "@/components/iconos";

// El buscador del listado. Dos formas de encontrar el mismo papel, que son
// las dos que usa el mostrador: "el 47" cuando el cliente tiene el número
// a la vista, y el apellido cuando no.
//
// El filtro vive en la URL, como en clientes, productos y trabajos: la
// pantalla queda compartible y con historial. Se aplica al enviar y no en
// cada tecla — el listado es una consulta paginada contra la base, y
// dispararla por letra sería una consulta por pulsación.
export function BuscadorPresupuestos({ q }: { q?: string }) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  function buscar(valor: string) {
    const limpio = valor.trim();
    const params = new URLSearchParams();
    if (limpio) params.set("q", limpio);
    const query = params.toString();
    iniciar(() =>
      router.replace(`/panel/presupuestos${query ? `?${query}` : ""}`, {
        scroll: false,
      }),
    );
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        buscar(new FormData(e.currentTarget).get("q") as string);
      }}
      className="relative max-w-sm flex-1"
    >
      <IconoBuscar
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40"
      />
      <input
        name="q"
        type="search"
        defaultValue={q ?? ""}
        placeholder="Número o nombre…"
        aria-label="Buscar un presupuesto por número o por nombre"
        className="h-11 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-ui text-ink placeholder:text-ink-40"
      />
    </form>
  );
}
