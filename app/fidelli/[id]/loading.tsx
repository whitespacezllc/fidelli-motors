import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// La ficha de un lubricentro, en gris: la vuelta al listado, el nombre con
// sus botones, la línea del alta, las etiquetas y las solapas, y debajo las
// tarjetas de la solapa abierta.
export default function CargandoFichaLubricentro() {
  return (
    <Esqueleto>
      <div className="mb-6">
        <Pieza className="h-8 w-24 rounded-md" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Pieza className="h-9 w-64" />
          <Pieza className="ml-auto h-11 w-28 rounded-md" />
          <Pieza className="h-11 w-28 rounded-md" />
        </div>
        <Pieza className="mt-2 h-3.5 w-56" />
        <div className="mt-3 flex gap-2">
          <Pieza className="h-6 w-20 rounded-sm" />
          <Pieza className="h-6 w-24 rounded-sm" />
        </div>
        <div className="mt-5 flex gap-1 border-b border-line pb-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Pieza key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Marco className="surface-card h-[195px] p-5" />
          <Marco className="surface-card h-[195px] p-5" />
        </div>
        <Marco className="surface-card h-[135px] p-5" />
        <Marco className="surface-card h-[135px] p-5" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Marco className="surface-card h-[154px] p-5" />
          <Marco className="surface-card h-[154px] p-5" />
        </div>
      </div>
    </Esqueleto>
  );
}
