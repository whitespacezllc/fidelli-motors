import Link from "next/link";
import type { PasoOnboarding } from "@/lib/onboarding/estado";

// El progreso: un punto por paso, sin porcentaje. Lleno = hecho, con anillo
// = el actual, vacío = falta. Los hechos son enlaces: se puede volver.
export function IndicadorPasos({
  pasos,
  actual,
  hechos,
}: {
  pasos: 2 | 3;
  actual: PasoOnboarding;
  hechos: readonly PasoOnboarding[];
}) {
  const lista: PasoOnboarding[] = pasos === 3 ? [1, 2, 3] : [1, 2];

  return (
    <div className="flex items-center gap-3">
      <ol className="flex items-center gap-2" aria-label="Progreso de los pasos">
        {lista.map((n) => {
          const hecho = hechos.includes(n);
          const esActual = n === actual;
          const punto = (
            <span
              aria-hidden
              className={`block size-2.5 rounded-full ${
                esActual
                  ? "bg-ink ring-4 ring-line"
                  : hecho
                    ? "bg-ink"
                    : "border border-ink-40 bg-base"
              }`}
            />
          );
          return (
            <li key={n} aria-current={esActual ? "step" : undefined}>
              {hecho && !esActual ? (
                <Link
                  href={`/panel/onboarding?paso=${n}`}
                  aria-label={`Volver al paso ${n}`}
                  className="flex size-6 items-center justify-center rounded-full"
                >
                  {punto}
                </Link>
              ) : (
                <span className="flex size-6 items-center justify-center">
                  {punto}
                  <span className="sr-only">
                    Paso {n}{hecho ? ", hecho" : esActual ? ", actual" : ""}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <span className="font-ui text-ui text-ink-60 tabular-nums">
        Paso {actual} de {pasos}
      </span>
    </div>
  );
}
