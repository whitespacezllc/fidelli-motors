import type { NotaPublica } from "@/lib/cliente/carton";
import { formatearFecha } from "@/lib/fechas";

// Las notas del mecánico sobre el auto: "cubiertas delanteras para
// cambio". Se leen como una recomendación del taller, no como un aviso
// del sistema. La fecha es la de creación — cuándo se OBSERVÓ — siempre.
//
// Si no hay notas visibles, la sección entera no existe: esta pantalla
// tiene una sola pregunta que responder y un vacío acá sería ruido.
export function Recomendaciones({ notas }: { notas: NotaPublica[] }) {
  if (notas.length === 0) return null;

  return (
    <section>
      <h2 className="text-c-lead font-bold">Para tener en cuenta</h2>
      <p className="mt-1 text-c-body text-ink-60">
        Lo que el taller vio en tu auto y te recomienda mirar.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {notas.map((n) => (
          <li
            key={`${n.fecha}-${n.contenido.slice(0, 24)}`}
            className="rounded-lg border border-line border-l-4 border-l-tenant p-4"
          >
            <p className="text-c-body text-ink-60 tabular-nums">
              {formatearFecha(n.fecha)}
            </p>
            <p className="mt-1 text-c-body leading-relaxed text-ink">
              {n.contenido}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
