import Link from "next/link";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";
import { etiquetaCategoria } from "@/lib/finanzas";

// Finanzas del cliente en su ficha: lo que debe (saldo de la cuenta
// corriente) y sus últimos ingresos. El detalle completo —fiados, cobros
// parciales— vive en la cuenta corriente, a un clic. Si no hay saldo ni
// ingresos, la sección no aparece.
export type IngresoFicha = {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  categoria: string | null;
};

export function SeccionFinanzasCliente({
  clienteId,
  saldo,
  ingresos,
}: {
  clienteId: string;
  saldo: number;
  ingresos: IngresoFicha[];
}) {
  if (saldo <= 0 && ingresos.length === 0) return null;

  return (
    <section className="surface-card mb-5 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-brand text-lead font-bold text-ink">Finanzas</h2>
        <Link
          href={`/panel/finanzas/cuenta/${clienteId}`}
          className="text-ui font-semibold text-brand-texto"
        >
          Ver cuenta corriente
        </Link>
      </div>

      {saldo > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-overdue-soft px-3.5 py-3">
          <span className="text-ui text-overdue">Debe en la cuenta corriente</span>
          <span className="font-brand text-body font-bold text-overdue tabular-nums">
            {formatearPesos(saldo)}
          </span>
        </div>
      )}

      {ingresos.length > 0 && (
        <>
          <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Últimos ingresos
          </p>
          <ul className="flex flex-col">
            {ingresos.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-ui text-ink">{i.concepto}</span>
                    {etiquetaCategoria(i.categoria) && (
                      <span className="shrink-0 rounded-sm bg-surface px-1.5 py-0.5 text-label text-ink-60">
                        {etiquetaCategoria(i.categoria)}
                      </span>
                    )}
                  </span>
                  <span className="block text-label text-ink-60 tabular-nums">
                    {formatearFecha(i.fecha)}
                  </span>
                </span>
                <span className="shrink-0 text-ui font-semibold text-ink tabular-nums">
                  {formatearPesos(i.monto)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
