import { urlWhatsappSoporte } from "@/lib/config";
import { IconoCandado, IconoWhatsapp } from "@/components/iconos";

// La pantalla para el que llega por URL directa a una sección que su plan
// no incluye. Misma forma que BloqueoSuspension: nunca un crash, nunca un
// rechazo mudo — se nombra qué pasa y cuál es la salida. La diferencia con
// la suspensión es el tono: esto no es un problema a resolver, es una
// función que se puede sumar.
export function BloqueoPlan({ funcion }: { funcion: string }) {
  return (
    <div className="surface-card px-6 py-9 text-center">
      <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-full border border-line bg-surface text-ink-40">
        <IconoCandado className="size-6" />
      </div>

      <p className="font-brand text-body font-bold text-ink">
        {funcion} no está en tu plan
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
        Tu plan actual no incluye esta función. Si te interesa, escribinos y
        te contamos qué plan la trae y cómo activarla.
      </p>

      <a
        href={urlWhatsappSoporte()}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
      >
        <IconoWhatsapp className="size-4" />
        Preguntar por WhatsApp
      </a>
    </div>
  );
}
