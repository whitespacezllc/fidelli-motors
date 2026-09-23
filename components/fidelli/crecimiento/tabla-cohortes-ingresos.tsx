import {
  SCROLL,
  SUB,
  TABLA,
  TD,
  TH,
  TH_IZQ,
} from "@/components/fidelli/crecimiento/estilos";
import { Oracion } from "@/components/fidelli/crecimiento/seccion";
import {
  MESES_INGRESOS,
  cifra,
  mesCorto,
  mesLargo,
  porcentajeEntero,
  sumarMeses,
  type FilaCohorteIngresos,
} from "@/lib/fidelli/crecimiento";

// ============================================================
// «¿Pagan más con el tiempo?»: cohortes_ingresos(). Por cohorte, el MRR
// inicial en dólares y, a 3, 6 y 12 meses, cuánto de ese MRR sigue (GRR,
// que solo puede bajar) y cuánto hay contando la expansión (NRR, que puede
// pasar el 100 %). Siempre en US$, por definición: en pesos un ajuste de
// lista inflaría el NRR de todas las cohortes a la vez.
//
// Hasta que la cohorte más vieja cumpla tres meses cerrados no hay ningún
// número, y la sección lo dice con una sola oración en vez de una tabla
// llena de «—»: «Primeros datos en <mes>».
// ============================================================

export function TablaCohortesIngresos({
  filas,
}: {
  filas: FilaCohorteIngresos[];
}) {
  if (filas.length === 0) {
    return (
      <Oracion>
        Cuando haya un alta en el rango vas a ver su cohorte acá, con su MRR
        inicial en dólares y el GRR y el NRR a 3, 6 y 12 meses. Cada columna
        aparece cuando ese mes cierra.
      </Oracion>
    );
  }

  // Ninguna cohorte llegó a los tres meses cerrados. El primer dato es el
  // de la cohorte más vieja (vienen ascendentes): su GRR a 3 meses mira la
  // foto del último día del mes cohorte + 3, y esa foto la escribe el
  // cierre diario a las 00:10 del día SIGUIENTE (vercel.json: 03:10 UTC;
  // docs/METRICAS.md § 4), o sea que el dato se VE recién en cohorte + 4.
  // La oración nombra los dos meses para que nadie lo espere un mes antes.
  // (El contrato pedía «cohorte más vieja + 3» con «diciembre de 2026» de
  // ejemplo, que es + 4: se sigue al ejemplo; el desvío está en § 6. Si se
  // quisiera el literal, es mesLargo(mesTres) a secas.)
  if (filas.every((f) => f.grr_3 == null)) {
    const masVieja = filas[0].cohorte.slice(0, 7);
    const mesTres = sumarMeses(masVieja, 3);
    return (
      <Oracion>
        Primeros datos en {mesLargo(sumarMeses(mesTres, 1))}, cuando cierre{" "}
        {mesLargo(mesTres)}: ahí la cohorte de {mesCorto(masVieja)} cumple tres
        meses.
      </Oracion>
    );
  }

  return (
    <div className={SCROLL}>
      <table className={TABLA}>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={`${TH_IZQ} w-[16%]`}>
              Cohorte
              <span className={SUB}>mes de alta</span>
            </th>
            <th scope="col" className={`${TH} w-[14%]`}>
              MRR inicial
              <span className={SUB}>US$</span>
            </th>
            {MESES_INGRESOS.flatMap((n) => [
              <th key={`grr-${n}`} scope="col" className={`${TH} w-[11.6%]`}>
                GRR {n}
              </th>,
              <th key={`nrr-${n}`} scope="col" className={`${TH} w-[11.6%]`}>
                NRR {n}
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.cohorte}
              data-cohorte={f.cohorte.slice(0, 7)}
              className="border-b border-line last:border-b-0"
            >
              <td className="px-3 py-2.5 text-left align-middle text-ink tabular-nums">
                {mesCorto(f.cohorte)}
              </td>
              <td
                className={`${TD} ${f.mrr_inicial_usd == null ? "text-ink-40" : "text-ink"}`}
              >
                {cifra(f.mrr_inicial_usd)}
              </td>
              {MESES_INGRESOS.flatMap((n) => {
                const grr = f[`grr_${n}` as const];
                const nrr = f[`nrr_${n}` as const];
                return [
                  <td
                    key={`grr-${n}`}
                    className={`${TD} ${grr == null ? "text-ink-40" : "text-ink"}`}
                  >
                    {porcentajeEntero(grr)}
                  </td>,
                  <td
                    key={`nrr-${n}`}
                    className={`${TD} ${nrr == null ? "text-ink-40" : "text-ink"}`}
                  >
                    {porcentajeEntero(nrr)}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
