import { Esqueleto } from "@/components/ui/esqueleto";
import { CargaGris } from "@/components/services/carga-gris";

// La carga de un trabajo para un auto, en gris.
export default function CargandoCarga() {
  return (
    <Esqueleto className="mx-auto max-w-md sm:max-w-2xl lg:max-w-3xl">
      <CargaGris />
    </Esqueleto>
  );
}
