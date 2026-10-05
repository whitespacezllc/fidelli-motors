import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Pauta, en gris: la bajada, el formulario de un contacto nuevo, el embudo
// y las dos tarjetas de las tablas.
export default function CargandoPauta() {
  return (
    <Esqueleto className="flex flex-col gap-5">
      <div>
        <h1 className="font-brand text-h2 font-bold text-ink">Pauta</h1>
        <div className="mt-1 flex max-w-2xl flex-col gap-2">
          <Pieza className="h-3.5 w-full" />
          <Pieza className="h-3.5 w-1/2" />
        </div>
      </div>
      <Marco className="surface-card flex h-[101px] flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3.5">
        <Pieza className="h-11 w-48 rounded-md" />
        <Pieza className="h-11 w-40 rounded-md" />
        <Pieza className="h-11 w-36 rounded-md" />
        <Pieza className="h-11 w-28 rounded-md" />
      </Marco>
      <Marco className="surface-card h-[179px] px-4.5 py-3">
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Pieza key={i} className="h-16 w-40 rounded-md" />
          ))}
        </div>
      </Marco>
      <Marco className="surface-card h-[783px] px-4.5 py-3">
        <Pieza className="h-8 w-64 rounded-md" />
      </Marco>
    </Esqueleto>
  );
}
