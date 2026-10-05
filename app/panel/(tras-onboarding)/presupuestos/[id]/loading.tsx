import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Un presupuesto, en gris: la miga de pan, las acciones del documento
// (descargar, compartir, duplicar, editar) y la hoja.
export default function CargandoPresupuesto() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <div className="mb-4 flex h-5 items-center gap-2">
        <Pieza className="h-3.5 w-20" />
        <Pieza className="h-3.5 w-28" />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2.5">
          <Pieza className="h-11 w-36 rounded-md" />
          <Pieza className="h-11 w-32 rounded-md" />
        </div>
        <div className="flex gap-2.5">
          <Pieza className="h-11 w-24 rounded-md" />
          <Pieza className="h-11 w-20 rounded-md" />
        </div>
      </div>
      <Marco className="surface-card h-[860px] p-6 sm:p-8">
        <div className="flex justify-between gap-4">
          <div>
            <Pieza className="h-6 w-48" />
            <Pieza className="mt-2.5 h-3.5 w-40" />
          </div>
          <Pieza className="h-10 w-32" />
        </div>
        <div className="mt-10 flex flex-col gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Pieza key={i} className="h-4 w-full" />
          ))}
        </div>
      </Marco>
    </Esqueleto>
  );
}
