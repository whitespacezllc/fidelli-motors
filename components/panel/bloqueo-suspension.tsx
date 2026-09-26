import { urlWhatsappSoporte } from "@/lib/config";
import { IconoCandado, IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import { obtenerSesion } from "@/lib/auth/session";
import { enlaceDePagoDe, esEnlaceExterno, textoDeCobranza } from "@/lib/cobranza/copy";

// El botón que ocupa el lugar de una acción primaria mientras la cuenta
// está suspendida. Sigue viéndose donde estaba —un botón que desaparece
// hace pensar que se rompió otra cosa— pero apagado y con el motivo. El
// motivo es el NEUTRO: este botón vive en componentes que no conocen la
// sesión, y la salida (WhatsApp o Pagar) ya la dice la tarjeta de arriba.
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
// reactivar. LA SALIDA ES LA MISMA QUE LA DE LA TARJETA DE ARRIBA: WhatsApp
// si la suspendió Fidelli; Pagar si la suspendió el reloj, porque ahí el
// pago la levanta solo y mandar a escribir es mandar por el camino largo.
//
// Server Component que lee la sesión (memoizada por request: cero
// consultas extra). Las doce pantallas que lo montan no tienen que saber
// nada: el componente decide con `suspensionManual`.
//
// La descripción que manda cada página termina con la salida manual
// («…escribinos y reactivamos la cuenta», «Para reactivarla, escribinos»).
// Con el reloj esa última oración se reemplaza por la salida real, que es
// pagar; lo que cada pantalla dice de SUS datos («el service quedó
// guardado tal cual», «los presupuestos se siguen viendo») queda intacto.
function descripcionPorReloj(descripcion: string): string {
  const oraciones = descripcion.trim().split(/(?<=\.)\s+/);
  const ultima = oraciones[oraciones.length - 1] ?? "";
  const propio = /escrib/i.test(ultima) ? oraciones.slice(0, -1).join(" ") : descripcion.trim();
  return `${propio} Pagás y en minutos vuelve todo, sin que tengas que avisarnos.`.trim();
}

export async function BloqueoSuspension({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  const sesion = await obtenerSesion();
  const porReloj =
    sesion?.suspendido === true && !sesion.suspensionManual && sesion.cobranza !== null;
  const texto = porReloj && sesion.cobranza ? textoDeCobranza(sesion.cobranza) : null;
  const href =
    porReloj && sesion.cobranza && texto
      ? enlaceDePagoDe(sesion.cobranza, null, sesion.lubricentroNombre)
      : urlWhatsappSoporte();
  const externo = esEnlaceExterno(href);

  return (
    <div className="surface-card px-6 py-9 text-center">
      <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-full border border-line bg-surface text-ink-40">
        <IconoCandado className="size-6" />
      </div>

      <p className="font-brand text-body font-bold text-ink">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
        {texto && !externo ? descripcionPorReloj(descripcion) : descripcion}
      </p>

      {externo ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
        >
          <IconoWhatsapp className="size-4" />
          {texto?.accion ?? "Escribirle a Fidelli"}
        </a>
      ) : (
        <a href={href} className={`${clasesBoton("primario")} mt-5`}>
          {texto?.accion ?? "Pagar"}
        </a>
      )}
    </div>
  );
}
