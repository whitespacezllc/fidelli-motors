import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// El cartel de guardado, en gris: el título, la tarjeta del auto, la nota
// para el cliente y los botones de lo que sigue.
export default function CargandoGuardado() {
  return (
    <Esqueleto className="mx-auto max-w-md lg:max-w-xl lg:pt-4">
      <Pieza className="mt-4 h-10 w-64 max-w-full" />
      <Marco className="surface-card mt-4 h-[79px] p-4">
        <Pieza className="h-5 w-24" />
        <Pieza className="mt-2 h-3.5 w-64 max-w-full" />
      </Marco>
      <Pieza className="mt-4 h-[67px] w-full rounded-lg" />
      <div className="mt-5 flex flex-col gap-2.5">
        <Pieza className="h-12 w-full rounded-md" />
        <Pieza className="h-11 w-full rounded-md" />
        <div className="flex gap-2.5">
          <Pieza className="h-11 flex-1 rounded-md" />
          <Pieza className="h-11 flex-1 rounded-md" />
        </div>
      </div>
    </Esqueleto>
  );
}
