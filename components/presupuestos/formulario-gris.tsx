import { CampoGris, Marco, Pieza } from "@/components/ui/esqueleto";

// El formulario del presupuesto, en gris (Nuevo, Duplicar y Editar lo
// comparten): el destinatario, los renglones con su precio, la fecha, la
// validez y la sucursal, Observaciones y la barra del total al pie.
export function FormularioPresupuestoGris() {
  return (
    <div className="flex flex-col gap-4">
      <Marco className="flex h-[117px] flex-col gap-3 rounded-lg border border-line p-4">
        <Pieza className="h-4 w-28" />
        <Pieza className="h-11 w-full rounded-md" />
      </Marco>
      <Marco className="flex h-[279px] flex-col gap-3 rounded-lg border border-line p-4">
        <Pieza className="h-4 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2">
            <Pieza className="h-11 flex-1 rounded-md" />
            <Pieza className="h-11 w-16 rounded-md" />
            <Pieza className="h-11 w-24 rounded-md" />
          </div>
        ))}
        <Pieza className="h-11 w-36 rounded-md" />
      </Marco>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoGris />
        <CampoGris />
        <CampoGris />
      </div>
      <Pieza className="h-11 w-28 rounded-md" />
      <Marco className="mt-2 flex h-20 items-center justify-between border-t border-line px-4 py-3 sm:rounded-lg">
        <Pieza className="h-6 w-32" />
        <Pieza className="h-11 w-36 rounded-md" />
      </Marco>
    </div>
  );
}
