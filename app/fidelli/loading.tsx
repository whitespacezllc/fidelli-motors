import { Esqueleto, FilaGris, Marco, Pieza } from "@/components/ui/esqueleto";

// El Resumen de /fidelli, en gris: los cinco indicadores, la línea de la
// pauta, la tarjeta del MRR, el Pulso con su gráfico y las alertas.
export default function CargandoResumen() {
  return (
    <Esqueleto>
      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">Resumen</h1>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Marco key={i} className="surface-card flex h-[163px] flex-col px-4 py-3.5">
            <Pieza className="h-7 w-28 max-w-full" />
            <Pieza className="mt-2.5 h-3 w-24" />
            <Pieza className="mt-2.5 h-3 w-32 max-w-full" />
            <Pieza className="mt-1.5 h-3 w-20" />
          </Marco>
        ))}
      </div>
      <Pieza className="mb-5 h-4 w-80 max-w-full" />
      <Marco className="surface-card mb-5 h-[182px] px-4.5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Pieza className="h-8 w-28" />
            <Pieza className="mt-2 h-3 w-12" />
          </div>
          <Pieza className="h-9 w-64 max-w-full rounded-md" />
        </div>
        <Pieza className="mx-auto mt-12 h-3.5 w-3/5" />
      </Marco>
      <Marco className="surface-card mb-5 h-[377px] px-4.5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Pieza className="h-8 w-16" />
            <Pieza className="mt-2 h-3 w-40" />
          </div>
          <Pieza className="h-9 w-44 rounded-md" />
        </div>
        <Pieza className="mt-8 h-[250px] w-full rounded-md" />
      </Marco>
      <Marco className="surface-card">
        <div className="border-b border-line px-4.5 py-3">
          <Pieza className="h-4 w-28" />
        </div>
        <ul className="px-4.5">
          {[0, 1].map((i) => (
            <FilaGris key={i} className="h-10" lineas={["h-3.5 w-80 max-w-full"]} />
          ))}
        </ul>
      </Marco>
    </Esqueleto>
  );
}
