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
  MESES_LOGOS,
  entero,
  mesCorto,
  porcentajeEntero,
  type FilaCohorteLogos,
} from "@/lib/fidelli/crecimiento";

// ============================================================
// «¿Se quedan?»: la tabla triangular de cohortes_logos(). Una fila por
// mes de alta; las columnas M1 … M12 dicen qué parte de la camada seguía
// activa en la foto del último día de ese mes. Solo cuentan los meses
// cerrados: el que no cerró va en gris con «—» (no se inventa el cierre).
//
// UN SOLO TONO para la intensidad (gris sobre blanco, alfa de 0,04 a
// 0,34): más oscuro = más se quedaron. El número va siempre en `ink` y
// queda legible en el extremo oscuro; no depende del color solo, porque el
// porcentaje está escrito en cada celda y la leyenda de abajo lo dice.
//
// La primera columna es sticky: en un celular la tabla scrollea dentro de
// la tarjeta y la cohorte queda a la vista para leer la fila.
// ============================================================

function fondoDe(valor: number): React.CSSProperties {
  return { backgroundColor: `rgba(10, 10, 10, ${0.04 + 0.3 * valor})` };
}

export function TablaCohortesLogos({ filas }: { filas: FilaCohorteLogos[] }) {
  if (filas.length === 0) {
    return (
      <Oracion>
        Cuando haya un alta en el rango vas a ver su cohorte acá: el tamaño de
        la camada, cuántos activaron, y qué parte seguía activa al mes 1, 2, 3,
        6, 9 y 12. Cada columna aparece cuando ese mes cierra.
      </Oracion>
    );
  }

  return (
    <>
      <div className={SCROLL}>
        <table className={TABLA}>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className={`${TH_IZQ} sticky left-0 z-10 w-[14%] bg-base`}
              >
                Cohorte
                <span className={SUB}>mes de alta</span>
              </th>
              <th scope="col" className={`${TH} w-[11.5%]`}>
                Ta&shy;maño
              </th>
              <th
                scope="col"
                className={`${TH} w-[14.5%]`}
                title="20 o más trabajos en los 7 días desde el alta (docs/METRICAS.md § 1)"
              >
                Acti&shy;vados
                <span className={SUB}>en 7 días</span>
              </th>
              {MESES_LOGOS.map((n) => (
                <th key={n} scope="col" className={`${TH} w-[10%]`}>
                  M{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.cohorte}
                data-cohorte={f.cohorte.slice(0, 7)}
                className="border-b border-line last:border-b-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-base px-3 py-2.5 text-left align-middle font-normal text-ink tabular-nums"
                >
                  {mesCorto(f.cohorte)}
                </th>
                <td className={`${TD} text-ink`}>{entero(f.tamano)}</td>
                <td
                  className={`${TD} ${f.activados === 0 ? "text-ink-40" : "text-ink"}`}
                >
                  {porcentajeEntero(
                    f.tamano > 0 ? f.activados / f.tamano : null,
                  )}
                  <span className="block text-label text-ink-40">
                    {entero(f.activados)} de {entero(f.tamano)}
                  </span>
                </td>
                {MESES_LOGOS.map((n) => {
                  const valor = f[`m${n}` as const];
                  return valor == null ? (
                    <td key={n} className={`${TD} text-ink-40`}>
                      —
                    </td>
                  ) : (
                    <td
                      key={n}
                      className={`${TD} text-ink`}
                      style={fondoDe(valor)}
                    >
                      {porcentajeEntero(valor)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4.5 py-3 text-label text-ink-60">
        Más oscuro = más tenants de la cohorte siguen activos. «—»: el mes
        todavía no cerró.
      </p>
    </>
  );
}
