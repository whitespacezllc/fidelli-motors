import { IconoChevron, IconoCandado } from "@/components/iconos";
import { CartonPapel } from "@/components/services/carton-papel";
import { marcadosDe, type ServiceCarton } from "@/lib/cliente/carton";
import { formatearKm } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";

// El historial cronológico. Cada fila se abre al cartón completo en el
// mismo formato papel: es el mismo objeto, no un resumen distinto.
//
// Va con <details>/<summary> y no con estado de React: expandir y colapsar
// es exactamente para lo que existe el elemento, funciona sin que hidrate
// nada y le ahorra JavaScript a un celular viejo con 4G.
export function HistorialCartones({
  services,
  lubricentroNombre,
  colorTenant,
}: {
  services: ServiceCarton[];
  lubricentroNombre: string;
  colorTenant: string;
}) {
  if (services.length === 0) return null;

  return (
    <section>
      <h2 className="text-c-lead font-bold">Cartones anteriores</h2>
      {/* El sello no se explica fila por fila: se explica una vez, acá, y
          deja de ser jerga para pasar a ser lo que es — una garantía. */}
      <p className="mt-1 text-c-body text-ink-60">
        Pasadas las 24 horas un cartón queda fijado: ni el lubricentro puede
        modificarlo.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {services.map((s) => (
          <li key={`${s.fecha}-${s.kilometros}`}>
            <details className="group rounded-lg border border-line">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-c-body font-bold tabular-nums">
                    {formatearFecha(s.fecha)}
                  </span>
                  <span className="block text-c-body text-ink-60 tabular-nums">
                    {formatearKm(s.kilometros)} km
                    {s.sucursal ? ` · ${s.sucursal}` : ""}
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

              <div className="px-3 pt-1 pb-4">
                <CartonPapel
                  escala="cliente"
                  datos={{
                    lubricentroNombre,
                    colorTenant,
                    fecha: s.fecha,
                    kilometros: s.kilometros,
                    aceiteTipo: s.aceiteTipo,
                    aceiteNombre: s.aceiteNombre,
                    proxServiceKm: s.proxServiceKm,
                    marcados: marcadosDe(s),
                  }}
                />
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
