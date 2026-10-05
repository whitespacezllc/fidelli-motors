import { Cabecera, CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Diseño de experiencia, en gris: las tarjetas de la configuración a la
// izquierda y, en escritorio, la vista previa del celular a la derecha.
export default function CargandoExperiencia() {
  return (
    <Esqueleto>
      <Cabecera titulo="Diseño de experiencia" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex flex-col gap-6">
          {["min-h-[320px]", "min-h-[260px]", "min-h-[300px]"].map((alto, i) => (
            <Marco key={i} className={`surface-card flex flex-col gap-5 p-5 ${alto}`}>
              <Pieza className="h-5 w-40" />
              <CampoGris />
              <CampoGris />
            </Marco>
          ))}
        </div>
        <Marco className="hidden h-[733px] w-[296px] rounded-[40px] border border-line p-4 lg:block">
          <Pieza className="h-full w-full rounded-[28px]" />
        </Marco>
      </div>
    </Esqueleto>
  );
}
