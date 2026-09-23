import { BotonExportar } from "@/components/fidelli/boton-exportar";
import { Chip } from "@/components/fidelli/chip";
import { ChipCierre } from "@/components/fidelli/crecimiento/chip-cierre";
import {
  SCROLL,
  SUB,
  TABLA,
  TD,
  TD_IZQ,
  TH,
  TH_IZQ,
  claseDeCifra,
} from "@/components/fidelli/crecimiento/estilos";
import { Oracion } from "@/components/fidelli/crecimiento/seccion";
import { entero, mesCorto, type FilaChurn } from "@/lib/fidelli/crecimiento";
import { ETIQUETA_ORIGEN_CORTA, esOrigenTenant } from "@/lib/fidelli/eventos";
import { porcentajeDe } from "@/lib/fidelli/pauta";

// ============================================================
// La tabla de churn_por_mes(), debajo del gráfico de altas y bajas: por
// mes, cuántos se fueron, cuántos de esos fueron involuntarios (el reloj y
// la falta de pago) y cuántos voluntarios, el churn del mes contra los
// activos del inicio, y de dónde venían los que se fueron (chips con el
// origen y el conteo). Todos los meses del rango salen, con ceros: un mes
// sin bajas es un dato.
//
// El chip del mes: churn_por_mes() no devuelve `en_curso` porque no lo
// necesita —las bajas son eventos, y las de un mes pasado están completas
// haya o no foto del último día—, así que acá solo el mes en curso lleva
// chip (ChipCierre con la bandera apagada), por el conteo que todavía crece.
//
// LA TABLA TIENE SU PROPIO ENCABEZADO Y SU PROPIO «EXPORTAR CSV»: la
// sección b tiene dos datos (el gráfico de altas_bajas_por_mes y esta
// tabla de churn_por_mes) y un solo botón arriba, el del gráfico; sin este
// segundo botón, el CSV de churn solo se bajaba desde el data room. El h3
// dice qué responde la tabla (criterio del bloque 2: ninguna tabla arranca
// sin un encabezado) y el botón lleva el mismo rango que la pantalla.
// ============================================================

// «meta 2», «sin origen 1»: la etiqueta corta del origen en minúscula (es
// un chip de conteo, no un nombre propio) y el número al lado.
function etiquetaOrigen(clave: string): string {
  if (clave === "sin_origen") return "sin origen";
  return esOrigenTenant(clave)
    ? ETIQUETA_ORIGEN_CORTA[clave].toLocaleLowerCase("es-AR")
    : clave;
}

export function TablaChurn({
  filas,
  mesEnCurso,
  periodo,
}: {
  /** Ascendente por mes, como las devuelve la base. */
  filas: FilaChurn[];
  mesEnCurso: string;
  /** El rango vigente de la pantalla, para el «Exportar CSV» de churn. */
  periodo: { desde: string; hasta: string };
}) {
  const encabezado = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4.5 py-3">
      <h3 className="text-ui font-semibold text-ink">
        Bajas por mes
        <span className="font-normal text-ink-60">
          {" "}
          · por tipo y por origen
        </span>
      </h3>
      <BotonExportar recurso="churn" params={periodo} compacto />
    </div>
  );

  if (filas.length === 0) {
    return (
      <>
        {encabezado}
        <Oracion>
          Cuando el rango tenga al menos un mes vas a ver acá las bajas de cada
          mes, cuántas fueron involuntarias y de dónde venían los tenants que se
          fueron.
        </Oracion>
      </>
    );
  }

  const ordenadas = [...filas].reverse();

  // Anchos medidos para los 720px mínimos: «INVOLUNTARIAS» 107px y
  // «VOLUNTARIAS» 93px en versalitas (más 24 de padding), «100,0 %» 60px,
  // «sept 2026» 71px; los chips de origen se envuelven en su celda. Desde
  // `lg` la tarjeta da 982px o más y la columna del mes sube a 17,5 % (172px
  // a 1024, 148 útiles) para que el chip «en curso» vaya al lado del mes
  // (139px); lo ceden las cuatro columnas de conteo, que a 982px tienen
  // entre 24 y 51px de sobra cada una («INVOLUNTARIAS» 107 en 138 útiles),
  // y no «Por origen»: sus chips se envuelven, y una celda más angosta ahí
  // es una fila más alta (medido: 93px en vez de 68 a 1280). Debajo de
  // `lg` el chip baja de renglón: en 720px no hay de dónde sacar 50px.
  return (
    <>
      {encabezado}
      <div className={`${SCROLL} border-t border-line`}>
        <table className={TABLA}>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH_IZQ} w-[13.5%] lg:w-[17.5%]`}>
                Mes
              </th>
              <th scope="col" className={`${TH} w-[12%] lg:w-[11.5%]`}>
                Tenants inicio
              </th>
              <th scope="col" className={`${TH} w-[9.5%] lg:w-[9%]`}>
                Bajas
              </th>
              <th scope="col" className={`${TH} w-[18.5%] lg:w-[16.5%]`}>
                Invo&shy;lun&shy;tarias
                <span className={SUB}>reloj y falta de pago</span>
              </th>
              <th scope="col" className={`${TH} w-[16%] lg:w-[14.5%]`}>
                Volun&shy;tarias
              </th>
              <th scope="col" className={`${TH} w-[12%]`}>
                Churn
                <span className={SUB}>bajas ÷ inicio</span>
              </th>
              <th scope="col" className={`${TH_IZQ} w-[18.5%] lg:w-[19%]`}>
                Por origen
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => {
              const origenes = Object.entries(f.por_origen).sort(
                (a, b) => b[1] - a[1],
              );
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
                        enCurso={false}
                        mesEnCurso={mesEnCurso}
                        dato="el conteo de bajas hasta hoy"
                      />
                    </span>
                  </td>
                  <td className={`${TD} ${claseDeCifra(f.tenants_inicio)}`}>
                    {f.tenants_inicio == null ? "—" : entero(f.tenants_inicio)}
                  </td>
                  <td
                    className={`${TD} font-semibold ${claseDeCifra(f.bajas)}`}
                  >
                    {entero(f.bajas)}
                  </td>
                  <td className={`${TD} ${claseDeCifra(f.involuntarias)}`}>
                    {entero(f.involuntarias)}
                  </td>
                  <td className={`${TD} ${claseDeCifra(f.voluntarias)}`}>
                    {entero(f.voluntarias)}
                  </td>
                  <td className={`${TD} ${claseDeCifra(f.churn_pct)}`}>
                    {porcentajeDe(f.churn_pct)}
                  </td>
                  <td className={TD_IZQ}>
                    {origenes.length === 0 ? (
                      <span className="text-ink-40">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {origenes.map(([clave, n]) => (
                          <Chip key={clave}>
                            {etiquetaOrigen(clave)} {n}
                          </Chip>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
