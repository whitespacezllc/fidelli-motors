import { formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import type { Totales } from "@/lib/fidelli/totales";

// Cuatro números y su contexto. Cifras exactas, sin redondear a miles: son
// pocas y se miran una vez por día — el "≈45k" ahorra tres caracteres y
// pierde la única precisión que importa cuando hay que cobrarla.
function Total({
  valor,
  etiqueta,
  pie,
}: {
  valor: string;
  etiqueta: string;
  pie?: React.ReactNode;
}) {
  return (
    <div className="surface-card px-4 py-3.5">
      <p className="font-brand text-h3 font-bold text-ink tabular-nums">{valor}</p>
      <p className="mt-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
        {etiqueta}
      </p>
      {pie && <p className="mt-1 text-label text-ink-40">{pie}</p>}
    </div>
  );
}

export function FranjaTotales({
  totales,
  servicesMes,
}: {
  totales: Totales;
  servicesMes: number;
}) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Total
        valor={String(totales.activos)}
        etiqueta="Activos"
        pie="con suscripción vigente"
      />

      <Total
        valor={pesos(totales.mrr)}
        etiqueta="MRR"
        pie={
          <>
            normalizado · sin trials
            {totales.pipelineTrials > 0 && (
              // El pipeline va como subtexto y no como número propio: no es
              // plata que entró, es plata que entraría. Mezclarlo con el MRR
              // sería contar dos veces la misma esperanza.
              <span className="mt-0.5 block text-ink-60">
                + {pesos(totales.pipelineTrials)} en trials
              </span>
            )}
          </>
        }
      />

      <Total
        valor={String(servicesMes)}
        etiqueta="Services del mes"
        pie="toda la plataforma"
      />

      <Total
        valor={String(totales.trials)}
        etiqueta="Trials en curso"
        pie={
          totales.proximosTrials.length > 0
            ? `vence${totales.proximosTrials.length > 1 ? "n" : ""} ${totales.proximosTrials
                .map((v) => formatearFecha(v).slice(0, 5))
                .join(" y ")}`
            : "ninguno en curso"
        }
      />
    </div>
  );
}
