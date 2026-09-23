import { Chip } from "@/components/fidelli/chip";
import { ChipCierre } from "@/components/fidelli/crecimiento/chip-cierre";
import {
  SCROLL,
  SUB,
  TD_ANCHA,
  TD_IZQ,
  TH_ANCHA,
  TH_IZQ,
  claseDeCifra,
} from "@/components/fidelli/crecimiento/estilos";
import { Oracion } from "@/components/fidelli/crecimiento/seccion";
import {
  UNIDAD,
  cifra,
  cifraConSigno,
  cifraNegativa,
  mesCorto,
  montoConSigno,
  porcentajeConSigno,
  tieneMovimientos,
  type FilaMovimientos,
} from "@/lib/fidelli/crecimiento";
import type { Moneda } from "@/lib/fidelli/mrr";

// ============================================================
// «¿De dónde viene el MRR?»: la tabla de movimientos_mrr(), un mes por
// fila, el más reciente arriba. Cada fila cierra por construcción:
// inicio + nuevo + reactivación + expansión − contracción − churn + ajuste
// = fin (docs/METRICAS.md § 1), y la tabla está armada para que se vea:
// contracción y churn llevan el signo negativo, el ajuste de lista el
// suyo, y las cifras van sin unidad (la unidad está en el encabezado de
// cada columna) para que doce columnas entren.
//
// Dos «—» distintos: el primer mes con historia no tiene foto anterior
// (chip «sin foto anterior»: no hay con qué comparar), y un mes sin tipo
// de cambio no tiene dólares (chip «sin tipo de cambio»: la foto está,
// falta la cotización). Un cero es un cero y se muestra en gris. Y el
// gris dice «no hay dato» celda por celda, no fila por fila: el MRR fin
// del primer mes es el único número de esa fila y es real (docs/METRICAS.md
// § 1: «mrr_fin y tenants_fin cargados»), así que va en ink como cualquier
// otro; solo en el mes sin tipo de cambio, donde es null, sale en gris.
// ============================================================

// Doce columnas: debajo de 1280px la tabla conserva su ancho y scrollea
// dentro de la tarjeta; desde `xl` ocupa la tarjeta (1238px a 1280). Los
// anchos salen de medir en el navegador la cifra más ancha de cada columna
// a 14px tabular (un dígito mide 9,8px; las celdas de cifras suman 20px
// de padding —TH_ANCHA/TD_ANCHA, ver estilos.ts— y la del mes 24):
// «−1.258.750» 85px para los totales y el neto, «−125.875» 71px para los
// seis movimientos, «+159,0 %» 67px, «12 → 13» 61px; y en la columna del
// mes «sept 2026» + el chip «en curso» en un renglón, 139px (el contrato
// pide el chip AL LADO del mes; con 11,7 % bajaba siempre a un segundo
// renglón). A 1238px cada cifra entra con al menos 2,7px de margen y el
// mes con 12; las celdas llevan `whitespace-nowrap`, así que una cifra más
// larga que eso asoma en su propio padding, no en dos renglones. Los dos
// chips de la fila excepcional («sin foto anterior» 103px, «sin tipo de
// cambio» 116px) no entran al lado del mes ni con 14,2 % —harían falta
// 200px— y bajan debajo de él: es la fila rara y se ve rara. Los
// encabezados largos («REACTIVACIÓN» mide 97px y su celda 74) llevan guión
// blando y se parten con guion: en doce columnas no hay 1.300px para todos
// enteros ni a 1280 (ver TABLA_MEDIA en estilos.ts).
const TABLA_ANCHA =
  "w-full min-w-[1240px] table-fixed border-collapse text-ui xl:min-w-0";

export function TablaMovimientos({
  filas,
  moneda,
  mesEnCurso,
}: {
  /** Ascendente por mes, como las devuelve la base. */
  filas: FilaMovimientos[];
  moneda: Moneda;
  /** «2026-09»: el mes en curso en hora argentina. */
  mesEnCurso: string;
}) {
  if (filas.length === 0) {
    return (
      <Oracion>
        Cuando haya fotos diarias en el rango vas a ver acá, mes a mes, de dónde
        salió cada peso del MRR: cuánto entró por altas, reactivaciones y
        expansión, cuánto se fue por contracción y churn, y cuánto movió la
        lista de precios. El primer mes con foto sale sin movimientos (no tiene
        con qué compararse); desde el segundo, cada fila cierra.
      </Oracion>
    );
  }

  const unidad = UNIDAD[moneda];
  const ordenadas = [...filas].reverse();
  const conMovimientos = filas.filter(tieneMovimientos);
  const netoComercial = conMovimientos.reduce((s, f) => s + (f.neto ?? 0), 0);
  const ajusteLista = conMovimientos.reduce(
    (s, f) => s + (f.ajuste_precio ?? 0),
    0,
  );

  return (
    <>
      <div className={SCROLL}>
        <table className={TABLA_ANCHA}>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH_IZQ} w-[14.2%]`}>
                Mes
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[8.7%]`}>
                MRR inicio
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Nuevo
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Reac&shy;tiva&shy;ción
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Expan&shy;sión
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Con&shy;trac&shy;ción
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Churn
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.6%]`}>
                Ajuste de lista
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[8.7%]`}>
                MRR fin
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[8.7%]`}>
                Neto
                <span className={SUB}>{unidad}</span>
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[7.3%]`}>
                Creci&shy;miento
              </th>
              <th scope="col" className={`${TH_ANCHA} w-[6.8%]`}>
                Tenants
                <span className={SUB}>inicio → fin</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => {
              const sinDolar = !f.sin_foto_anterior && f.mrr_fin === null;
              return (
                <tr
                  key={f.mes}
                  data-mes={f.mes.slice(0, 7)}
                  className="border-b border-line last:border-b-0"
                >
                  <td className={TD_IZQ}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="tabular-nums text-ink">
                        {mesCorto(f.mes)}
                      </span>
                      <ChipCierre
                        mes={f.mes}
                        enCurso={f.en_curso}
                        mesEnCurso={mesEnCurso}
                        dato="el dato del último día con foto"
                      />
                      {f.sin_foto_anterior && (
                        <Chip title="Es el primer mes con foto: no hay con qué comparar.">
                          sin foto anterior
                        </Chip>
                      )}
                      {sinDolar && (
                        <Chip title="Falta el tipo de cambio en alguna de las dos fotos: sin él no hay dólares.">
                          sin tipo de cambio
                        </Chip>
                      )}
                    </span>
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.mrr_inicio)}`}>
                    {cifra(f.mrr_inicio)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.nuevo)}`}>
                    {cifra(f.nuevo)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.reactivacion)}`}>
                    {cifra(f.reactivacion)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.expansion)}`}>
                    {cifra(f.expansion)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.contraccion)}`}>
                    {cifraNegativa(f.contraccion)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.churn)}`}>
                    {cifraNegativa(f.churn)}
                  </td>
                  <td
                    className={`${TD_ANCHA} ${claseDeCifra(f.ajuste_precio)}`}
                  >
                    {cifraConSigno(f.ajuste_precio)}
                  </td>
                  <td
                    className={`${TD_ANCHA} font-semibold ${claseDeCifra(f.mrr_fin)}`}
                  >
                    {cifra(f.mrr_fin)}
                  </td>
                  <td className={`${TD_ANCHA} ${claseDeCifra(f.neto)}`}>
                    {cifraConSigno(f.neto)}
                  </td>
                  <td
                    className={`${TD_ANCHA} ${claseDeCifra(f.crecimiento_pct)}`}
                  >
                    {porcentajeConSigno(f.crecimiento_pct)}
                  </td>
                  <td className={`${TD_ANCHA} text-ink`}>
                    {f.tenants_inicio == null ? "—" : f.tenants_inicio} →{" "}
                    {f.tenants_fin}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* El resumen del período: la suma de las filas que tienen movimientos.
          El ajuste de lista va aparte del neto comercial porque no es
          mérito ni culpa de nadie: es la lista de precios moviéndose. */}
      <p
        data-resumen-movimientos
        className="border-t border-line px-4.5 py-3 text-ui text-ink-60 tabular-nums"
      >
        {conMovimientos.length === 0 ? (
          "Todavía no hay dos meses cerrados para comparar."
        ) : (
          <>
            Neto comercial del período:{" "}
            <span className="font-semibold text-ink">
              {montoConSigno(netoComercial, moneda)}
            </span>{" "}
            · ajuste de lista:{" "}
            <span className="font-semibold text-ink">
              {montoConSigno(ajusteLista, moneda)}
            </span>
          </>
        )}
      </p>
    </>
  );
}
