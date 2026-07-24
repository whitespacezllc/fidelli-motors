"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIAS, type CategoriaProducto } from "@/lib/categorias";
import { IconoBuscar } from "@/components/iconos";

// Los filtros viven en la URL: el estado lo maneja el servidor, que ya tiene
// el catálogo, y la pantalla queda compartible y con historial. Los valores
// actuales llegan por props, así no hace falta useSearchParams (que obligaría
// a un Suspense sin darnos nada).
export function FiltrosProductos({
  categoria,
  q,
}: {
  categoria?: CategoriaProducto;
  q?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navegar(nuevaCategoria?: string, nuevaBusqueda?: string) {
    const params = new URLSearchParams();
    if (nuevaCategoria) params.set("categoria", nuevaCategoria);
    if (nuevaBusqueda) params.set("q", nuevaBusqueda);
    const query = params.toString();
    iniciar(() =>
      router.replace(`/panel/productos${query ? `?${query}` : ""}`, {
        scroll: false,
      }),
    );
  }

  // Se espera a que deje de tipear: una navegación por tecla sería ruido.
  function alEscribir(valor: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(
      () => navegar(categoria, valor.trim() || undefined),
      300,
    );
  }

  const CLASE_CHIP =
    "flex h-11 items-center rounded-md border px-3.5 text-ui transition-colors";

  return (
    <div
      className={`mb-5 flex flex-col gap-3 transition-opacity ${
        pendiente ? "opacity-60" : ""
      }`}
    >
      <div className="relative">
        <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
        <input
          // La key ata el input al valor de la URL: si el filtro se limpia
          // desde afuera ("Limpiar filtros"), el campo se vacía con él en vez
          // de quedar mostrando una búsqueda que ya no se está aplicando.
          key={q ?? ""}
          type="search"
          defaultValue={q}
          onChange={(e) => alEscribir(e.target.value)}
          placeholder="Buscar por nombre o marca…"
          aria-label="Buscar productos"
          className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navegar(undefined, q)}
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
              onClick={() => navegar(activa ? undefined : c.valor, q)}
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
