import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// El listado de lubricentros, en gris: los botones de la cabecera, los
// filtros con el buscador y la tabla.
export default function CargandoLubricentros() {
  return (
    <Esqueleto>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-brand text-h2 font-bold text-ink">Lubricentros</h1>
        <div className="flex flex-wrap gap-2">
          <Pieza className="h-11 w-36 rounded-md" />
          <Pieza className="h-11 w-40 rounded-md" />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["w-16", "w-44", "w-34", "w-30"].map((ancho, i) => (
          <Pieza key={i} className={`h-9 rounded-md ${ancho}`} />
        ))}
        <Pieza className="h-12 w-full rounded-md sm:ml-auto sm:w-72" />
      </div>
      <Marco className="surface-card">
        <div className="flex gap-6 border-b border-line px-4 py-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Pieza key={i} className="h-3 w-20" />
          ))}
        </div>
        <ul className="px-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="flex h-[54px] items-center gap-6 border-b border-line last:border-b-0">
              <Pieza className="h-4 w-44" />
              <Pieza className="h-3.5 w-24" />
              <Pieza className="h-3.5 w-20" />
              <Pieza className="h-3.5 w-16" />
              <Pieza className="ml-auto h-6 w-24 rounded-sm" />
            </li>
          ))}
        </ul>
      </Marco>
    </Esqueleto>
  );
}
