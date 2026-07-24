"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIAS, type CategoriaProducto } from "@/lib/categorias";
import { Buscador } from "@/components/ui/buscador";

// Los filtros viven en la URL: el estado lo maneja el servidor, que ya tiene
// el catálogo, y la pantalla queda compartible y con historial.
export function FiltrosProductos({
  categoria,
  q,
}: {
  categoria?: CategoriaProducto;
  q?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function navegarCategoria(nuevaCategoria?: string) {
    const params = new URLSearchParams();
    if (nuevaCategoria) params.set("categoria", nuevaCategoria);
    if (q) params.set("q", q);
    const query = params.toString();
    iniciar(() =>
      router.replace(`/panel/productos${query ? `?${query}` : ""}`, {
        scroll: false,
      }),
    );
  }

  const CLASE_CHIP =
    "flex h-11 items-center rounded-md border px-3.5 text-ui transition-colors";

  return (
    <div className="mb-5 flex flex-col gap-3">
      <Buscador
        ruta="/panel/productos"
        valor={q}
        placeholder="Buscar por nombre o marca…"
        etiqueta="Buscar productos"
        paramsExtra={{ categoria }}
      />

      <div
        className={`flex flex-wrap gap-2 transition-opacity ${
          pendiente ? "opacity-60" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => navegarCategoria(undefined)}
          aria-pressed={!categoria}
          className={`${CLASE_CHIP} ${
            !categoria
              ? "border-ink bg-ink font-semibold text-white"
              : "border-line bg-base text-ink-60 hover:bg-surface"
          }`}
        >
          Todas
        </button>
        {CATEGORIAS.map((c) => {
          const activa = categoria === c.valor;
          return (
            <button
              key={c.valor}
              type="button"
              onClick={() => navegarCategoria(activa ? undefined : c.valor)}
              aria-pressed={activa}
              className={`${CLASE_CHIP} ${
                activa
                  ? "border-ink bg-ink font-semibold text-white"
                  : "border-line bg-base text-ink-60 hover:bg-surface"
              }`}
            >
              {c.plural}
            </button>
          );
        })}
      </div>
    </div>
  );
}
