"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ETIQUETAS } from "@/components/proximos/badge-urgencia";
import type { EstadoContacto } from "@/lib/contacto";

type Sucursal = { id: string; nombre: string };

export type FiltrosProximos = { sucursal?: string; estado?: EstadoContacto };

const CLASE_CAMPO =
  "h-11 rounded-md border border-line bg-base px-2.5 text-ui text-ink";

// Dos filtros y nada más, a propósito: la tabla ya viene ordenada para
// trabajarla de arriba a abajo. Cada control de más es una decisión que el
// lubri no tiene que tomar. Tampoco hay ordenamiento por columna — rompería
// el ritual.
export function FiltrosProximosServices({
  sucursales,
  filtros,
}: {
  sucursales: Sucursal[];
  filtros: FiltrosProximos;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  function aplicar(cambio: Partial<FiltrosProximos>) {
    const siguiente = { ...filtros, ...cambio };
    const params = new URLSearchParams();
    if (siguiente.sucursal) params.set("sucursal", siguiente.sucursal);
    if (siguiente.estado) params.set("estado", siguiente.estado);
    const query = params.toString();
    iniciar(() =>
      router.replace(`/panel/proximos${query ? `?${query}` : ""}`, {
        scroll: false,
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <select
        value={filtros.sucursal ?? ""}
        onChange={(e) => aplicar({ sucursal: e.target.value || undefined })}
        aria-label="Filtrar por sucursal"
        className={CLASE_CAMPO}
      >
        <option value="">Todas las sucursales</option>
        {sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>

      <select
        value={filtros.estado ?? ""}
        onChange={(e) =>
          aplicar({ estado: (e.target.value || undefined) as EstadoContacto })
        }
        aria-label="Filtrar por estado"
        className={CLASE_CAMPO}
      >
        <option value="">Todos los estados</option>
        {(["vencido", "urgente", "proximo"] as const).map((e) => (
          <option key={e} value={e}>
            {ETIQUETAS[e]}
          </option>
        ))}
      </select>
    </div>
  );
}
