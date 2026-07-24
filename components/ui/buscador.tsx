"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconoBuscar } from "@/components/iconos";

// Buscador que vive en la URL: el filtrado lo hace el servidor y la pantalla
// queda compartible y con historial. El valor actual llega por prop, así no
// hace falta useSearchParams (que obligaría a un Suspense sin darnos nada).
export function Buscador({
  ruta,
  valor,
  placeholder,
  etiqueta,
  paramsExtra,
}: {
  ruta: string;
  valor?: string;
  placeholder: string;
  etiqueta: string;
  // Otros filtros de la pantalla que hay que conservar al buscar.
  paramsExtra?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se espera a que deje de tipear: una navegación por tecla sería ruido.
  function alEscribir(texto: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [clave, v] of Object.entries(paramsExtra ?? {})) {
        if (v) params.set(clave, v);
      }
      const limpio = texto.trim();
      if (limpio) params.set("q", limpio);
      const query = params.toString();
      iniciar(() => router.replace(`${ruta}${query ? `?${query}` : ""}`, { scroll: false }));
    }, 300);
  }

  return (
    <div className={`relative transition-opacity ${pendiente ? "opacity-60" : ""}`}>
      <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
      <input
        // La key ata el input al valor de la URL: si el filtro se limpia desde
        // afuera, el campo se vacía con él en vez de quedar mostrando una
        // búsqueda que ya no se está aplicando.
        key={valor ?? ""}
        type="search"
        defaultValue={valor}
        onChange={(e) => alEscribir(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
      />
    </div>
  );
}
