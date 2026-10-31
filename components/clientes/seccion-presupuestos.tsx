import Link from "next/link";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";

// Los presupuestos del cliente en su ficha: el primer tramo del hilo que une
// presupuesto → trabajo → finanzas. Si no tiene ninguno, la sección no
// aparece (sin ruido).
export type PresupuestoFicha = {
  id: string;
  numero: number;
  fecha: string;
  total: number;
};

export function SeccionPresupuestos({
  presupuestos,
}: {
  presupuestos: PresupuestoFicha[];
}) {
  if (presupuestos.length === 0) return null;

  return (
    <section className="surface-card mb-5 p-5">
      <h2 className="mb-3 font-brand text-lead font-bold text-ink">Presupuestos</h2>
      <ul className="flex flex-col">
        {presupuestos.map((p) => (
          <li key={p.id} className="border-b border-line last:border-b-0">
            <Link
              href={`/panel/presupuestos/${p.id}`}
              className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface"
            >
              <span className="flex items-baseline gap-2">
                <span className="font-brand text-body font-bold text-ink tabular-nums">
                  N° {p.numero}
                </span>
                <span className="text-ui text-ink-60 tabular-nums">
                  {formatearFecha(p.fecha)}
                </span>
              </span>
              <span className="text-ui font-semibold text-ink tabular-nums">
                {formatearPesos(p.total)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
