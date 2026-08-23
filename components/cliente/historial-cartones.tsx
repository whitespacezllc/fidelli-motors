import { IconoChevron, IconoCandado } from "@/components/iconos";
import {
  CartonPapel,
  CartonPapelMecanica,
} from "@/components/services/carton-papel";
import {
  marcadosDe,
  renglonesLibres,
  type ServiceCarton,
} from "@/lib/cliente/carton";
import { formatearKm } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import { ESTILO_PAPEL } from "@/lib/cliente/tema";

// El historial cronológico, con LOS DOS tipos de trabajo en una sola
// línea de tiempo — un cliente de taller que escanea tiene que ver todo
// lo que le hicieron al auto, no solo los cambios de aceite. Cada fila se
// abre a su papel: el cartón para el service, la orden de trabajo para la
// mecánica. Es el mismo objeto, no un resumen distinto.
//
// Va con <details>/<summary> y no con estado de React: expandir y colapsar
// es exactamente para lo que existe el elemento, funciona sin que hidrate
// nada y le ahorra JavaScript a un celular viejo con 4G.
export function HistorialCartones({
  services,
  lubricentroNombre,
  colorTenant,
  colorPapel = null,
}: {
  services: ServiceCarton[];
  lubricentroNombre: string;
  colorTenant: string;
  colorPapel?: string | null;
}) {
  if (services.length === 0) return null;

  return (
    <section>
      <h2 className="text-c-lead font-bold">Historial del auto</h2>
      {/* El sello no se explica fila por fila: se explica una vez, acá, y
          deja de ser jerga para pasar a ser lo que es — una garantía. */}
      <p className="mt-1 text-c-body text-ink-60">
        Pasadas las 24 horas un trabajo queda fijado: ni el lubricentro puede
        modificarlo.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {services.map((s, i) => (
          <li key={`${s.fecha}-${i}`}>
            <details className="group rounded-lg border border-line">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-c-body font-bold tabular-nums">
                    {formatearFecha(s.fecha)}
                    {s.tipo === "mecanica" && (
                      <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                        Mecánica
                      </span>
                    )}
                  </span>
                  <span className="block text-c-body text-ink-60 tabular-nums">
                    {s.tipo === "mecanica"
                      ? [s.trabajoDescripcion, s.sucursal]
                          .filter(Boolean)
                          .join(" · ")
                      : `${formatearKm(s.kilometros ?? 0)} km${s.sucursal ? ` · ${s.sucursal}` : ""}`}
                  </span>
                  {s.fijado && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1 text-c-body text-ink-60">
                      <IconoCandado aria-hidden className="size-5 shrink-0" />
                      Registro fijado
                    </span>
                  )}
                </span>
                <IconoChevron
                  aria-hidden
                  className="size-7 shrink-0 text-ink-60 transition-transform group-open:rotate-180"
                />
              </summary>

              {/* El papel no se apaga: en modo oscuro el cartón sigue
                  siendo un recibo claro sobre el mostrador — el reset
                  devuelve los tokens de tinta dentro de este subárbol. */}
              <div className="px-3 pt-1 pb-4" style={ESTILO_PAPEL}>
                {s.tipo === "mecanica" ? (
                  <CartonPapelMecanica
                    escala="cliente"
                    datos={{
                      lubricentroNombre,
                      colorTenant,
                      colorPapel,
                      fecha: s.fecha,
                      kilometros: s.kilometros,
                      descripcion: s.trabajoDescripcion ?? "",
                      renglones: renglonesLibres(s),
                    }}
                  />
                ) : (
                  <CartonPapel
                    escala="cliente"
                    datos={{
                      lubricentroNombre,
                      colorTenant,
                      fecha: s.fecha,
                      kilometros: s.kilometros ?? 0,
                      aceiteTipo: s.aceiteTipo ?? "",
                      aceiteNombre: s.aceiteNombre,
                      proxServiceKm: s.proxServiceKm ?? 0,
                      colorPapel,
                      marcados: marcadosDe(s),
                    }}
                  />
                )}
                {s.observaciones && (
                  <p className="mt-3 text-c-body text-ink-60">
                    {s.observaciones}
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
