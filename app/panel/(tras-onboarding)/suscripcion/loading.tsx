import { Cabecera, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Tu suscripción, en gris: la tarjeta del plan, el período y el pago.
export default function CargandoSuscripcion() {
  return (
    <Esqueleto>
      <Cabecera titulo="Tu suscripción" />
      <div className="max-w-xl">
        <Marco className="surface-card flex min-h-[596px] flex-col gap-5 p-5 sm:p-6">
          <Pieza className="h-6 w-48" />
          <Pieza className="h-3.5 w-4/5" />
          <div className="grid grid-cols-3 gap-2">
            <Pieza className="h-16 w-full rounded-md" />
            <Pieza className="h-16 w-full rounded-md" />
            <Pieza className="h-16 w-full rounded-md" />
          </div>
          <Pieza className="h-24 w-full rounded-md" />
          <Pieza className="mt-auto h-12 w-full rounded-md" />
        </Marco>
      </div>
    </Esqueleto>
  );
}
