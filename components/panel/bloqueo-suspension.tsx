import { urlWhatsappSoporte } from "@/lib/config";
import { IconoCandado, IconoWhatsapp } from "@/components/iconos";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";

// El botón que ocupa el lugar de una acción primaria mientras la cuenta
// está suspendida. Sigue viéndose donde estaba —un botón que desaparece
// hace pensar que se rompió otra cosa— pero apagado y con el motivo.
export function AccionBloqueada({ etiqueta }: { etiqueta: string }) {
  return (
    <span
      aria-disabled="true"
      title={MOTIVO_SUSPENSION}
      className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-4 text-ui font-semibold text-ink-40"
    >
      <IconoCandado className="size-4" />
      {etiqueta}
    </span>
  );
}

// Reemplaza una pantalla entera de carga o edición. Va donde el formulario
// no tiene sentido: no es un permiso que falte, es una cuenta que hay que
// reactivar, y la salida es el mismo WhatsApp del aviso de arriba.
export function BloqueoSuspension({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="surface-card px-6 py-9 text-center">
      <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-full border border-line bg-surface text-ink-40">
        <IconoCandado className="size-6" />
      </div>

      <p className="font-brand text-body font-bold text-ink">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">{descripcion}</p>

      <a
        href={urlWhatsappSoporte()}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
      >
        <IconoWhatsapp className="size-4" />
        Escribirle a Fidelli
      </a>
    </div>
  );
}
