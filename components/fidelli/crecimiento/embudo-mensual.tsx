import {
  SCROLL,
  SUB,
  TABLA_MEDIA,
  TD,
  TH,
  TH_IZQ,
} from "@/components/fidelli/crecimiento/estilos";
import { Oracion } from "@/components/fidelli/crecimiento/seccion";
import { entero, mesCorto } from "@/lib/fidelli/crecimiento";
import {
  POCOS_CASOS,
  porcentajeDe,
  usd,
  type FilaEmbudo,
} from "@/lib/fidelli/pauta";

// ============================================================
// «¿Rinde la pauta?»: el embudo por mes, la misma tabla de
// components/fidelli/pauta/tabla-embudo.tsx pero sin sus selectores (acá el
// período lo pone la barra de rango y el canal es siempre «todos»). No se
// reutiliza el componente porque trae los selectores adentro y sus links
// apuntan a /fidelli/pauta; se repiten sus columnas y su regla del CAC —el
// gasto del mes dividido por los cierres del mes, siempre con la cantidad
// de cierres al lado y, con menos de 3, en gris con «pocos casos»
// (docs/METRICAS.md § 1)— con las mismas funciones de lib/fidelli/pauta.ts.
// ============================================================

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// Un mes sin contactos, sin gasto cargado y sin cierres es un mes en el que
// no pasó nada. embudo_pauta(…, 'mes') devuelve TODOS los meses del rango,
// así que un rango sin pauta no llega como lista vacía sino como filas de
// ceros: la sección lo dice con una oración, no con una tabla de ceros.
function estaVacia(f: FilaEmbudo): boolean {
  return f.contactos === 0 && f.gasto_usd === null && f.cierres_periodo === 0;
}

// Los anchos de las nueve columnas están medidos para los 820px mínimos de
// la tabla (TABLA_MEDIA; celdas de 14px tabular más 24px de padding):
// «sept 2026» 71px, «100,0 %» 60px, «US$ 1.234» 76px, «US$ 12.345» 86px,
// y en versalitas «CONTACTOS» 80px, «CIERRES» 57px, «% CIERRE» 63px y
// «CICLO» 40px (que no sobra: la columna no puede ceder); el sublabel del
// CAC se parte en sus dos mitades. Los dos encabezados con «%» llevan un
// espacio duro («%&nbsp;cierre»): son una sola palabra y no se parten en
// «%» arriba y «CIERRE» abajo. La misma tabla de la pauta reparte distinto
// en 720px y ahí «sept 2026» se parte y «CONTACTOS» pisa a «DEMOS» a 768px
// (archivo de otro bloque, anotado en las notas de D1).

export function EmbudoMensual({
  filas,
}: {
  /** Del mes más viejo al más nuevo, como los devuelve la base. */ filas: FilaEmbudo[];
}) {
  if (filas.length === 0 || filas.every(estaVacia)) {
    return (
      <Oracion>
        Todavía no hay contactos ni gasto en este rango. Cuando registres el
        primer contacto o cargues el gasto de un mes en Pauta, su embudo aparece
        acá: contactos, demos, cierres, ciclo, gasto y CAC.
      </Oracion>
    );
  }

  const ordenadas = [...filas].reverse();

  return (
    <div className={SCROLL}>
      <table className={TABLA_MEDIA}>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={`${TH_IZQ} w-[12%]`}>
              Mes
            </th>
            <th scope="col" className={`${TH} w-[13%]`}>
              Con&shy;tactos
            </th>
            <th scope="col" className={`${TH} w-[9%]`}>
              Demos
            </th>
            <th scope="col" className={`${TH} w-[10%]`}>
              Cie&shy;rres
            </th>
            <th scope="col" className={`${TH} w-[10.5%]`}>
              %&nbsp;demo
            </th>
            <th scope="col" className={`${TH} w-[11%]`}>
              %&nbsp;cierre
            </th>
            <th scope="col" className={`${TH} w-[8%]`}>
              Ciclo
              <span className={SUB}>días</span>
            </th>
            <th scope="col" className={`${TH} w-[12.5%]`}>
              Gasto
              <span className={SUB}>US$</span>
            </th>
            <th scope="col" className={`${TH} w-[14%]`}>
              CAC
              <span className={SUB}>US$ · cierres del mes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => {
            const pocos = f.cierres_periodo < POCOS_CASOS;
            const vacia = estaVacia(f);
            return (
              <tr
                key={f.periodo}
                data-mes={f.periodo.slice(0, 7)}
                className={`border-b border-line last:border-b-0 ${vacia ? "text-ink-40" : ""}`}
              >
                <td className="px-3 py-2.5 text-left align-middle whitespace-nowrap tabular-nums">
                  {mesCorto(f.periodo)}
                </td>
                <td
                  className={`${TD} font-semibold ${vacia ? "font-normal" : "text-ink"}`}
                >
                  {entero(f.contactos)}
                </td>
                <td className={TD}>{entero(f.demos)}</td>
                <td className={TD}>{entero(f.cierres)}</td>
                <td className={TD}>{porcentajeDe(f.tasa_demo)}</td>
                <td className={TD}>{porcentajeDe(f.tasa_cierre)}</td>
                <td className={TD}>
                  {f.ciclo_mediana_dias === null
                    ? "—"
                    : DECIMAL.format(f.ciclo_mediana_dias)}
                </td>
                <td className={TD}>
                  {f.gasto_usd === null ? (
                    <span className="text-ink-40">sin cargar</span>
                  ) : (
                    usd(f.gasto_usd)
                  )}
                </td>
                <td className={`${TD} ${pocos ? "text-ink-40" : "text-ink"}`}>
                  {f.cac_usd === null ? "—" : usd(f.cac_usd)}
                  {/* El sublabel sí puede partirse, pero solo entre sus dos
                      partes: «2 cierres» y «· pocos casos» van enteras (a 768px
                      la celda no las tiene juntas). El espacio suelto entre
                      los dos spans es el único punto de corte. */}
                  <span className="block text-label whitespace-normal text-ink-40">
                    <span className="whitespace-nowrap">
                      {entero(f.cierres_periodo)}{" "}
                      {f.cierres_periodo === 1 ? "cierre" : "cierres"}
                    </span>
                    {pocos && f.cac_usd !== null && (
                      <>
                        {" "}
                        <span className="whitespace-nowrap">· pocos casos</span>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
