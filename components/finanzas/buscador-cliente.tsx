"use client";

import { useMemo, useRef, useState } from "react";
import { IconoBuscar } from "@/components/iconos";
import { createClient } from "@/lib/supabase/client";
import {
  buscarClientes,
  BUSQUEDA_CLIENTES_MINIMO,
  type ClienteSugerido,
} from "@/lib/busqueda-alta";
import { sanitizarBusqueda } from "@/lib/texto";

// Buscador de cliente, a secas: para atar un movimiento de caja a su dueño.
// Reusa el MISMO filtro que el listado de Clientes (buscarClientes). No crea
// clientes ni pide auto —un ingreso no guarda vehículo—: para dar de alta a
// alguien nuevo está el alta de trabajo. Opcional: se puede dejar sin cliente.
export function BuscadorCliente({
  onElegir,
}: {
  onElegir: (cliente: { id: string; nombre: string } | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [elegido, setElegido] = useState<{ id: string; nombre: string } | null>(null);
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busqueda = useRef(0);

  function alEscribir(texto: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    const turno = ++busqueda.current;
    temporizador.current = setTimeout(async () => {
      const { clientes, error } = await buscarClientes(supabase, texto);
      if (turno !== busqueda.current) return;
      setSugerencias(clientes);
      setErrorBusqueda(error ?? null);
      setBuscado(sanitizarBusqueda(texto).length >= BUSQUEDA_CLIENTES_MINIMO);
    }, 300);
  }

  function elegir(c: ClienteSugerido) {
    const sel = { id: c.id, nombre: c.nombre };
    setElegido(sel);
    setSugerencias([]);
    setBuscado(false);
    onElegir(sel);
  }

  function quitar() {
    setElegido(null);
    onElegir(null);
  }

  if (elegido) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3.5 py-3">
        <span className="min-w-0 truncate font-brand text-body font-bold text-ink">
          {elegido.nombre}
        </span>
        <button
          type="button"
          onClick={quitar}
          className="min-h-11 shrink-0 px-2 text-ui font-semibold text-brand-texto"
        >
          Quitar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
        <input
          type="search"
          onChange={(e) => alEscribir(e.target.value)}
          placeholder="Nombre, teléfono o patente…"
          aria-label="Buscar cliente"
          className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
        />
      </div>

      {errorBusqueda && (
        <p role="alert" className="mt-2 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {errorBusqueda}
        </p>
      )}

      {sugerencias.length > 0 && (
        <ul className="mt-2 flex flex-col rounded-md border border-line">
          {sugerencias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => elegir(c)}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line px-3.5 py-2 text-left last:border-b-0 hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate font-brand text-body font-bold text-ink">
                    {c.nombre}
                  </span>
                  <span className="block truncate text-ui text-ink-60 tabular-nums">
                    {c.telefono}
                  </span>
                </span>
                <span className="shrink-0 text-label text-ink-60">
                  {c.cantidadVehiculos === 1 ? "1 auto" : `${c.cantidadVehiculos} autos`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {buscado && !errorBusqueda && sugerencias.length === 0 && (
        <p className="mt-2 text-ui text-ink-60">
          Ningún cliente con ese nombre, teléfono o patente.
        </p>
      )}
    </div>
  );
}
