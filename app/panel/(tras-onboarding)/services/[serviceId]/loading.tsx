import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// El detalle de un trabajo, en gris: la miga de pan, la patente con el
// vehículo y el cliente, y la grilla de la pantalla: el papel del cartón a
// la izquierda (con su troquel arriba) y, al lado, el resumen y los
// adjuntos.
export default function CargandoDetalleTrabajo() {
  return (
    <Esqueleto className="mx-auto max-w-md sm:max-w-2xl lg:max-w-4xl">
      <div className="mb-4 flex h-5 items-center gap-2">
        <Pieza className="h-3.5 w-14" />
        <Pieza className="h-3.5 w-40" />
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Pieza className="h-7 w-72 max-w-full" />
          <Pieza className="mt-2 h-3.5 w-32" />
        </div>
        <Pieza className="h-7 w-16 rounded-sm" />
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr] md:items-start">
        <Marco className="h-[792px] rounded-t-[44px] rounded-b-lg border border-line px-4 pt-14">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Pieza key={i} className="h-6 w-full" />
            ))}
          </div>
        </Marco>
        <div className="flex flex-col gap-5">
          <Marco className="surface-card grid h-[183px] grid-cols-[auto_1fr] content-start gap-x-4 gap-y-3.5 p-4 sm:p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="contents">
                <Pieza className="h-3.5 w-20" />
                <Pieza className="h-3.5 w-40 max-w-full" />
              </div>
            ))}
          </Marco>
          <Marco className="surface-card h-[206px] p-4 sm:p-5">
            <Pieza className="h-5 w-32" />
            <Pieza className="mt-3 h-3.5 w-4/5" />
            <Pieza className="mt-6 h-11 w-44 rounded-md" />
          </Marco>
        </div>
      </div>
    </Esqueleto>
  );
}
