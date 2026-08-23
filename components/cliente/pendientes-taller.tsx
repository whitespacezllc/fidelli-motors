import type { PendientePublico } from "@/lib/cliente/carton";
import { formatearFecha } from "@/lib/fechas";
import { formatearKm } from "@/lib/renglones";

// Lo que el taller recomienda hacer y quedó pendiente. Cierra el círculo
// de la retención del lado del cliente: lo que antes se decía de palabra
// en el mostrador ahora lo ve cada vez que escanea el calco. Solo llegan
// los que el lubricentro marcó visibles — mostrarlos es SU decisión, y el
// default es oculto.
export function PendientesTaller({
  pendientes,
}: {
  pendientes: PendientePublico[];
}) {
  if (pendientes.length === 0) return null;

  return (
    <section>
      <h2 className="text-c-lead font-bold">Recomendado por el taller</h2>
      <p className="mt-1 text-c-body text-ink-60">
        Trabajos que quedaron pendientes en tu auto.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {pendientes.map((tp, i) => (
          <li
            key={`${tp.creado}-${i}`}
            className="rounded-lg border border-line border-l-4 border-l-tenant p-4"
          >
            <p className="text-c-body leading-relaxed font-bold text-ink">
              {tp.descripcion}
            </p>
            <p className="mt-1 text-c-body text-ink-60 tabular-nums">
              {[
                tp.objetivoFecha
                  ? `para ${formatearFecha(tp.objetivoFecha)}`
                  : null,
                tp.objetivoKm
                  ? `a los ${formatearKm(tp.objetivoKm)} km`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || null}
            </p>
            <p className="mt-1 text-c-body text-ink-60 tabular-nums">
              anotado el {formatearFecha(tp.creado)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
