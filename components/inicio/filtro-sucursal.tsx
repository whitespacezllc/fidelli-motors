"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Sucursal = { id: string; nombre: string };

// El filtro vive en la URL, como el resto del panel: la pantalla queda
// compartible y con historial. Un solo control — el Inicio es para mirar,
// no para configurar una consulta.
export function FiltroSucursal({
  sucursales,
  actual,
}: {
  sucursales: Sucursal[];
  actual?: string;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  // Con una sola sucursal el selector no ofrece ninguna decisión.
  if (sucursales.length < 2) return null;

  return (
    <select
      value={actual ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        iniciar(() =>
          router.replace(v ? `/panel?sucursal=${v}` : "/panel", {
            scroll: false,
          }),
        );
      }}
      aria-label="Filtrar por sucursal"
      className="h-11 rounded-md border border-line bg-base px-2.5 text-ui text-ink"
    >
      <option value="">Todas las sucursales</option>
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}
