import { Cabecera, CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Neumáticos (la configuración del módulo de gomería), en gris: una
// tarjeta con los plazos de cada aviso.
export default function CargandoNeumaticos() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <Cabecera titulo="Neumáticos" />
      <Marco className="surface-card flex flex-col gap-5 p-5">
        <Pieza className="h-3.5 w-4/5" />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoGris />
          <CampoGris />
          <CampoGris />
          <CampoGris />
        </div>
        <Pieza className="h-12 w-40 rounded-md" />
      </Marco>
    </Esqueleto>
  );
}
