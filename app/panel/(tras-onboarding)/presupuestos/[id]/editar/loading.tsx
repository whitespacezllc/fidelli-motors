import { Esqueleto, Pieza } from "@/components/ui/esqueleto";
import { FormularioPresupuestoGris } from "@/components/presupuestos/formulario-gris";

// Editar un presupuesto, en gris: la miga de pan con «Volver sin guardar»
// y el formulario.
export default function CargandoEditarPresupuesto() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <div className="mb-4 flex h-5 items-center justify-between gap-3">
        <Pieza className="h-3.5 w-44" />
        <Pieza className="h-3.5 w-32" />
      </div>
      <FormularioPresupuestoGris />
    </Esqueleto>
  );
}
