import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Crecimiento, en gris: la bajada, el filtro de fechas y las tarjetas de
// los gráficos, cada una con su franja de cifras arriba.
function TarjetaGrafico({ alto }: { alto: string }) {
  return (
    <Marco className={`surface-card ${alto}`}>
      <div className="flex flex-wrap gap-4 border-b border-line px-4.5 py-4">
        <Pieza className="h-10 w-40" />
        <Pieza className="h-10 w-32" />
        <Pieza className="h-10 w-32" />
      </div>
      <div className="px-4.5 py-5">
        <Pieza className="h-[180px] w-full rounded-md" />
      </div>
    </Marco>
  );
}

export default function CargandoCrecimiento() {
  return (
    <Esqueleto className="flex flex-col gap-5">
      <div>
        <h1 className="font-brand text-h2 font-bold text-ink">Crecimiento</h1>
        <div className="mt-1 flex max-w-2xl flex-col gap-2">
          <Pieza className="h-3.5 w-full" />
          <Pieza className="h-3.5 w-1/2" />
        </div>
      </div>
      <Marco className="surface-card flex h-[87px] flex-wrap items-end gap-x-4 gap-y-3 px-4.5 py-3">
        <Pieza className="h-11 w-40 rounded-md" />
        <Pieza className="h-11 w-40 rounded-md" />
        <Pieza className="h-11 w-12 rounded-md" />
      </Marco>
      <TarjetaGrafico alto="h-[252px]" />
      <TarjetaGrafico alto="h-[644px]" />
      <TarjetaGrafico alto="h-[258px]" />
    </Esqueleto>
  );
}
