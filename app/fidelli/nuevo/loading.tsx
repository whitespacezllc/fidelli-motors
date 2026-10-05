import { CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// El alta de un lubricentro, en gris: la vuelta al listado, el título y la
// tarjeta del asistente con sus tres pasos.
export default function CargandoNuevoLubricentro() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <Pieza className="mb-4 h-8 w-24 rounded-md" />
      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">Nuevo lubricentro</h1>
      <Marco className="surface-card min-h-[601px]">
        <div className="flex border-b border-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-11 flex-1 items-center justify-center">
              <Pieza className="h-3.5 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-5 p-5">
          <CampoGris />
          <CampoGris />
          <CampoGris />
          <CampoGris />
        </div>
      </Marco>
    </Esqueleto>
  );
}
