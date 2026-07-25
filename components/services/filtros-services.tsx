"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Sucursal = { id: string; nombre: string };

export type FiltrosListado = {
  q?: string;
  sucursal?: string;
  desde?: string;
  hasta?: string;
};

const CLASE_CAMPO =
  "h-11 rounded-md border border-line bg-base px-2.5 text-ui text-ink";

// Los filtros viven en la URL, como en clientes y productos: la pantalla
// queda compartible y con historial. Cada cambio navega al toque — sin
// botón "Aplicar", que en un panel es un paso de más.
export function FiltrosServices({
  sucursales,
  filtros,
}: {
  sucursales: Sucursal[];
  filtros: FiltrosListado;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  function aplicar(cambio: Partial<FiltrosListado>) {
    const siguiente = { ...filtros, ...cambio };
    const params = new URLSearchParams();
    if (siguiente.q) params.set("q", siguiente.q);
    if (siguiente.sucursal) params.set("sucursal", siguiente.sucursal);
    if (siguiente.desde) params.set("desde", siguiente.desde);
    if (siguiente.hasta) params.set("hasta", siguiente.hasta);
    // Cambiar un filtro siempre vuelve a la página 1: la página vieja
    // puede no existir con el resultado nuevo.
    const query = params.toString();
    iniciar(() =>
      router.replace(`/panel/services${query ? `?${query}` : ""}`, {
        scroll: false,
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Sucursal
        </span>
        <select
          value={filtros.sucursal ?? ""}
          onChange={(e) => aplicar({ sucursal: e.target.value || undefined })}
          className={CLASE_CAMPO}
        >
          <option value="">Todas</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Desde
        </span>
        <input
          type="date"
          value={filtros.desde ?? ""}
          onChange={(e) => aplicar({ desde: e.target.value || undefined })}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Hasta
        </span>
        <input
          type="date"
          value={filtros.hasta ?? ""}
          onChange={(e) => aplicar({ hasta: e.target.value || undefined })}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </label>

      {(filtros.sucursal || filtros.desde || filtros.hasta || filtros.q) && (
        <button
          type="button"
          onClick={() => router.replace("/panel/services", { scroll: false })}
          className="h-11 px-2 text-ui font-semibold text-brand"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
