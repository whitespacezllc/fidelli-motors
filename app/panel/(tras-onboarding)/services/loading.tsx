import { Cabecera, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Trabajos, en gris: Exportar y «+ Nuevo trabajo», el buscador, los cuatro
// filtros (tipo, sucursal, desde y hasta) y la lista con la grilla de
// FilaService (components/services/fila-service.tsx): fecha, patente,
// vehículo, cliente, sucursal, km y el sello.
export default function CargandoServices() {
  return (
    <Esqueleto>
      <Cabecera titulo="Trabajos" derecha={["h-11 w-35 rounded-md", "h-11 w-34 rounded-md"]} />
      <div className="mb-5 flex flex-col gap-3">
        <Pieza className="h-12 w-full rounded-md" />
        <div className="flex flex-wrap gap-2.5">
          {["w-30", "w-35", "w-40", "w-40"].map((ancho, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Pieza className="h-3 w-14" />
              <Pieza className={`h-11 rounded-md ${ancho}`} />
            </div>
          ))}
        </div>
      </div>
      <Marco como="ul" className="surface-card px-4 sm:px-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li
            key={i}
            className="flex h-[77px] flex-wrap content-center items-center gap-x-4 gap-y-2 border-b border-line last:border-b-0 lg:grid lg:h-[52px] lg:grid-cols-[7.5rem_7rem_1fr_1fr_8.5rem_6rem_auto]"
          >
            <Pieza className="h-3 w-20" />
            <Pieza className="h-4 w-20" />
            <Pieza className="h-3 w-28" />
            <Pieza className="h-3 w-32" />
            <Pieza className="hidden h-3 w-24 lg:block" />
            <Pieza className="h-3 w-16" />
            <Pieza className="h-5 w-16 rounded-sm" />
          </li>
        ))}
      </Marco>
    </Esqueleto>
  );
}
