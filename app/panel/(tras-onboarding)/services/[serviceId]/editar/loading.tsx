import { Esqueleto, Pieza } from "@/components/ui/esqueleto";
import { CargaGris } from "@/components/services/carga-gris";

// Editar un trabajo, en gris: la miga de pan con «Volver sin guardar» y el
// mismo formulario de la carga.
export default function CargandoEditarTrabajo() {
  return (
    <Esqueleto className="mx-auto max-w-md sm:max-w-2xl lg:max-w-3xl">
      <div className="mb-4 flex h-5 items-center justify-between gap-3">
        <Pieza className="h-3.5 w-28" />
        <Pieza className="h-3.5 w-32" />
      </div>
      <CargaGris />
    </Esqueleto>
  );
}
