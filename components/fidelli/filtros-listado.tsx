import Link from "next/link";
import { Buscador } from "@/components/ui/buscador";
import { QUERY_FILTRO, type FiltroListado } from "@/lib/fidelli/listado";

const RUTA = "/fidelli/lubricentros";

const BASE = "flex h-9 items-center gap-2 rounded-md px-3 text-ui transition-colors";

// Los filtros son enlaces y el estado queda en la URL: se puede compartir
// y sobrevive al refresh que hace cada aviso registrado. El buscador
// también escribe en la URL (?q=) y conserva el filtro activo.
export function FiltrosListado({
  filtro,
  q,
  conteos,
}: {
  filtro: FiltroListado;
  q: string;
  conteos: Record<Exclude<FiltroListado, "todos">, number>;
}) {
  const opciones: { clave: FiltroListado; nombre: string; n?: number; alerta?: boolean }[] = [
    { clave: "todos", nombre: "Todos" },
    { clave: "atencion", nombre: "Necesitan atención", n: conteos.atencion, alerta: true },
    { clave: "sin_actividad", nombre: "Sin actividad", n: conteos.sin_actividad, alerta: true },
    { clave: "sin_origen", nombre: "Sin origen", n: conteos.sin_origen },
  ];

  function hrefDe(clave: FiltroListado): string {
    const params = new URLSearchParams(QUERY_FILTRO[clave]);
    if (q) params.set("q", q);
    const s = params.toString();
    return `${RUTA}${s ? `?${s}` : ""}`;
  }

  const paramsExtra = Object.fromEntries(new URLSearchParams(QUERY_FILTRO[filtro]).entries());

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {opciones.map((o) => {
        const activa = o.clave === filtro;
        return (
          <Link
            key={o.clave}
            href={hrefDe(o.clave)}
            aria-current={activa ? "page" : undefined}
            className={
              activa
                ? `${BASE} bg-ink font-semibold text-base`
                : `${BASE} border border-line bg-base text-ink-60 hover:bg-surface`
            }
          >
            {o.nombre}
            {o.n !== undefined && (
              <span
                className={`rounded-sm px-1.5 py-px text-label font-semibold tabular-nums ${
                  o.n === 0
                    ? activa
                      ? "bg-base/20 text-base"
                      : "bg-surface text-ink-40"
                    : activa
                      ? "bg-base text-ink"
                      : o.alerta
                        ? "bg-overdue-soft text-overdue"
                        : "bg-surface text-ink-60"
                }`}
              >
                {o.n}
              </span>
            )}
          </Link>
        );
      })}

      <div className="w-full sm:ml-auto sm:w-72">
        <Buscador
          ruta={RUTA}
          valor={q}
          placeholder="Nombre o slug"
          etiqueta="Buscar lubricentro"
          paramsExtra={paramsExtra}
        />
      </div>
    </div>
  );
}
