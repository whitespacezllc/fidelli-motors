"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

  // El campo es controlado y manda el que tipea: la respuesta del servidor
  // nunca lo pisa ni lo remonta — remontarlo le roba el foco y en el celular
  // eso cierra el teclado a mitad de la búsqueda.
  const [texto, setTexto] = useState(valor ?? "");
  // Lo último que ESTE buscador puso en la URL. Distingue el eco de nuestra
  // propia navegación (no hay que tocar el campo) de un cambio externo
  // —"limpiar filtros", volver atrás— que sí tiene que reflejarse.
  const ultimoEnviado = useRef(valor ?? "");
  // Foto viva de los props: el timeout del debounce no puede navegar con una
  // ruta o unos filtros de hace dos renders.
  const actuales = useRef({ ruta, paramsExtra });
  useEffect(() => {
    actuales.current = { ruta, paramsExtra };
  }, [ruta, paramsExtra]);

  useEffect(() => {
    if ((valor ?? "") !== ultimoEnviado.current) {
      if (temporizador.current) clearTimeout(temporizador.current);
      ultimoEnviado.current = valor ?? "";
      setTexto(valor ?? "");
    }
  }, [valor]);

  // Si el buscador se desmonta con una búsqueda en cola (tipeó y tocó un
  // resultado), el timeout huérfano navegaría de vuelta al listado.
  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function dispararBusqueda(nuevo: string) {
    const { ruta, paramsExtra } = actuales.current;
    const params = new URLSearchParams();
    for (const [clave, v] of Object.entries(paramsExtra ?? {})) {
      if (v) params.set(clave, v);
    }
    const limpio = nuevo.trim();
    if (limpio) params.set("q", limpio);
    ultimoEnviado.current = limpio;
    const query = params.toString();
    iniciar(() => router.replace(`${ruta}${query ? `?${query}` : ""}`, { scroll: false }));
  }

  // Se espera a que deje de tipear: una navegación por tecla sería ruido.
  function alEscribir(nuevo: string) {
    setTexto(nuevo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      dispararBusqueda(nuevo);
    }, 300);
  }

  // Si el campo pierde el foco con una búsqueda en cola, sale ya: tocar un
  // resultado (o cerrar el teclado) no puede dejar un timeout colgado que
  // navegue después, pisando lo que el usuario tocó. Enter y la tecla
  // "buscar" del teclado del celular hacen lo mismo: buscar ahora.
  function alSoltar(valorActual: string) {
    if (!temporizador.current) return;
    clearTimeout(temporizador.current);
    temporizador.current = null;
    dispararBusqueda(valorActual);
  }

  return (
    <div className={`relative transition-opacity ${pendiente ? "opacity-60" : ""}`}>
      <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
      <input
        type="search"
        value={texto}
        onChange={(e) => alEscribir(e.target.value)}
        onBlur={(e) => alSoltar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") alSoltar(e.currentTarget.value);
        }}
        placeholder={placeholder}
        aria-label={etiqueta}
        enterKeyHint="search"
        className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
      />
    </div>
  );
}
