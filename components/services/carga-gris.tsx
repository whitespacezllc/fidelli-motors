import { CampoGris, Marco, Pieza } from "@/components/ui/esqueleto";

// La carga de un trabajo, en gris (la de un auto nuevo y la de Editar
// comparten el formulario): la franja del vehículo con la sucursal, el
// selector de tipo, la fecha y los kilómetros, la tarjeta del aceite y los
// grupos de renglones del cartón, y el botón de guardar al pie.
export function CargaGris() {
  return (
    <>
      <Marco className="mb-4 flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex-1">
          <Pieza className="h-5 w-24" />
          <Pieza className="mt-1.5 h-3 w-48 max-w-full" />
        </div>
        <Pieza className="h-11 w-34 rounded-md" />
      </Marco>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Pieza className="h-12 w-full rounded-md" />
        <Pieza className="h-12 w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <CampoGris />
          <CampoGris />
        </div>
        <Marco className="h-[376px] rounded-lg border border-line p-4">
          <Pieza className="h-5 w-36" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Pieza key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <CampoGris />
            <CampoGris />
          </div>
        </Marco>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          {["h-[247px]", "h-[194px]", "h-[141px]", "h-[141px]"].map((alto, i) => (
            <Marco key={i} className={`rounded-lg border border-line p-4 ${alto}`}>
              <Pieza className="h-4 w-28" />
              <div className="mt-4 flex flex-col gap-3">
                <Pieza className="h-6 w-4/5" />
                <Pieza className="h-6 w-3/5" />
              </div>
            </Marco>
          ))}
        </div>
        <Pieza className="h-12 w-full rounded-md" />
      </div>
    </>
  );
}
