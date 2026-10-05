import { Cabecera, CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Fidelización, en gris: la tarjeta del premio (la meta, qué se gana y qué
// trabajos cuentan) y la línea de pie.
export default function CargandoFidelizacion() {
  return (
    <Esqueleto className="max-w-3xl">
      <Cabecera titulo="Fidelización" />
      <Marco className="surface-card flex min-h-[711px] flex-col gap-5 p-5 sm:p-6">
        <Pieza className="h-5 w-56" />
        <Pieza className="h-3.5 w-4/5" />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoGris />
          <CampoGris />
        </div>
        <CampoGris />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Pieza key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
        <CampoGris />
        <Pieza className="mt-auto h-12 w-40 rounded-md" />
      </Marco>
      <Marco className="mt-4">
        <Pieza className="h-3.5 w-4/5" />
      </Marco>
    </Esqueleto>
  );
}
