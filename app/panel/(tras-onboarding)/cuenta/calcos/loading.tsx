import { CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";

// Mi cuenta → Calcos, en gris: la vuelta a Mi cuenta, la tarjeta del stock
// y del diseño, y el pedido de más calcos.
export default function CargandoCalcosCuenta() {
  return (
    <Esqueleto className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Pieza className="mb-2 h-11 w-24 rounded-md" />
        <CabeceraSeccion titulo="Calcos" />
      </div>
      <Marco className="surface-card flex min-h-[344px] flex-wrap gap-5 p-5">
        <Pieza className="aspect-[5/8] w-40 rounded-md" />
        <div className="flex min-w-48 flex-1 flex-col gap-3">
          <Pieza className="h-5 w-40" />
          <Pieza className="h-10 w-24" />
          <Pieza className="h-3.5 w-4/5" />
          <Pieza className="h-3.5 w-3/5" />
        </div>
      </Marco>
      <Marco className="surface-card flex min-h-[733px] flex-col gap-5 p-5">
        <Pieza className="h-6 w-44" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Pieza className="h-24 w-full rounded-md" />
          <Pieza className="h-24 w-full rounded-md" />
        </div>
        <CampoGris />
        <CampoGris />
        <Pieza className="mt-auto h-12 w-full rounded-md" />
      </Marco>
    </Esqueleto>
  );
}
