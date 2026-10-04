import { IconoClip } from "@/components/iconos";
import { ETIQUETA_MIME, esMimeAdjunto, nombreSinExtension } from "@/lib/adjuntos";
import { formatearFecha } from "@/lib/fechas";
import type { AdjuntoPublico } from "@/lib/cliente/carton";

// Los adjuntos que el taller decidió mostrar: el PDF del escaneo, una foto
// del diagnóstico. Van DEBAJO del papel, nunca adentro: el cartón es el
// registro de lo que se hizo y no cambia; el adjunto es un archivo que el
// taller suma, prende, apaga y quita cuando quiere.
//
// El enlace NO es una URL del archivo. Es la ruta
// /[slug]/[patente]/adjunto/[id], que verifica en el servidor que ese
// adjunto sigue visible y es de este auto, y recién ahí firma una URL de
// 60 segundos y redirige. En este HTML no hay nada que se pueda reenviar
// para abrir el archivo mañana.
//
// Sin JavaScript, como el resto del historial: es un enlace.
export function AdjuntosCliente({
  adjuntos,
  slug,
  patente,
  enEntrada = false,
}: {
  adjuntos: AdjuntoPublico[];
  slug: string;
  /** La patente normalizada: es la que va en la URL. */
  patente: string;
  /** Adentro de una entrada del historial van como renglones de esa
   *  tarjeta; debajo del cartón destacado, cada uno es su propia tarjeta. */
  enEntrada?: boolean;
}) {
  if (adjuntos.length === 0) return null;

  const base = `/${encodeURIComponent(slug)}/${encodeURIComponent(patente)}/adjunto`;

  return (
    <ul className={enEntrada ? "" : "flex flex-col gap-2"}>
      {adjuntos.map((a) => {
        const formato = esMimeAdjunto(a.mime) ? ETIQUETA_MIME[a.mime] : "Archivo";
        return (
          <li
            key={a.id}
            className={
              enEntrada ? "border-t border-line" : "rounded-lg border border-line"
            }
          >
            <a
              href={`${base}/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              data-adjunto-cliente={a.id}
              className="flex min-h-16 items-center gap-3 p-4 text-c-body"
            >
              <IconoClip aria-hidden className="size-6 shrink-0 text-ink-60" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">Diagnóstico adjunto</span>
                <span className="block break-words text-ink-60 tabular-nums">
                  {nombreSinExtension(a.nombre)} · {formato} · {formatearFecha(a.creado)}
                </span>
              </span>
              <span className="shrink-0 font-bold text-ink">
                Ver <span aria-hidden>→</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
