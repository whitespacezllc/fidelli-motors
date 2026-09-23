import { ChipCierre } from "@/components/fidelli/crecimiento/chip-cierre";
import {
  SCROLL,
  SUB,
  TABLA_MEDIA,
  TD,
  TD_IZQ,
  TH,
  TH_IZQ,
  claseDeCifra,
} from "@/components/fidelli/crecimiento/estilos";
import { Oracion } from "@/components/fidelli/crecimiento/seccion";
import { entero, mesCorto, type FilaTrabajos } from "@/lib/fidelli/crecimiento";

// ============================================================
// «¿Usan el sistema?»: trabajos_por_mes(). Los trabajos de cada mes y por
// tipo (la suma de las fotos diarias), los autos que volvieron por un
// recordatorio, los recordatorios disparados y los escaneos de patente.
// Solo los meses con alguna foto; el mes que no cerró lleva su chip
// (ChipCierre, el mismo criterio que la tabla de movimientos): el en curso
// porque su número todavía crece, uno pasado sin la foto del último día
// porque la suma llega hasta la última foto que hay.
// ============================================================
export function TablaTrabajos({
  filas,
  mesEnCurso,
}: {
  /** Ascendente por mes, como las devuelve la base. */
  filas: FilaTrabajos[];
  mesEnCurso: string;
}) {
  if (filas.length === 0) {
    return (
      <Oracion>
        Cuando haya fotos diarias en el rango vas a ver acá los trabajos de cada
        mes por tipo, los autos que volvieron por un recordatorio, los
        recordatorios disparados y los escaneos de patente.
      </Oracion>
    );
  }

  const ordenadas = [...filas].reverse();

  // TABLA_MEDIA: ocho encabezados de una palabra («RECORDATORIOS» 112px,
  // «NEUMÁTICOS» 87px en versalitas más 24 de padding) suman 787px con el
  // mes y las cifras; en 720 no entran enteros, en 800 entraban justo
  // (medio píxel de margen) y en 820 con al menos 1px cada uno.
  //
  // DOS REPARTOS: hasta `lg` la tabla mide 820px y no hay lugar para que el
  // chip «en curso» vaya al lado del mes (hacen falta 139px de celda útil y
  // el mes tiene 74: el chip baja de renglón). Desde `lg` la tabla ocupa la
  // tarjeta (982px a 1024) y sobran unos 130px: la columna del mes sube a
  // 17,2 % (169px a 1024, 145 útiles) y el chip queda al lado, como en la
  // tabla de movimientos; el resto cede en proporción y sigue entrando con
  // margen («RECORDATORIOS» 111,7 en 136 útiles a 1024).
  return (
    <div className={SCROLL}>
      <table className={TABLA_MEDIA}>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={`${TH_IZQ} w-[12%] lg:w-[17.2%]`}>
              Mes
            </th>
            <th scope="col" className={`${TH} w-[8.75%] lg:w-[8%]`}>
              Total
              <span className={SUB}>trabajos</span>
            </th>
            <th scope="col" className={`${TH} w-[10.25%] lg:w-[9.5%]`}>
              Ser&shy;vice
            </th>
            <th scope="col" className={`${TH} w-[12%] lg:w-[11%]`}>
              Mecá&shy;nica
            </th>
            <th scope="col" className={`${TH} w-[14%] lg:w-[13%]`}>
              Neu&shy;máticos
            </th>
            <th scope="col" className={`${TH} w-[13%] lg:w-[12.5%]`}>
              Autos que volvieron
              <span className={SUB}>recordatorio en 60 días</span>
            </th>
            <th scope="col" className={`${TH} w-[17%] lg:w-[16.3%]`}>
              Recor&shy;da&shy;torios
              <span className={SUB}>disparados</span>
            </th>
            <th scope="col" className={`${TH} w-[13%] lg:w-[12.5%]`}>
              Esca&shy;neos
              <span className={SUB}>de patente</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => {
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
                      dato="la suma hasta el último día con foto"
                    />
                  </span>
                </td>
                <td className={`${TD} font-semibold ${claseDeCifra(f.total)}`}>
                  {entero(f.total)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.service)}`}>
                  {entero(f.service)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.mecanica)}`}>
                  {entero(f.mecanica)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.neumaticos)}`}>
                  {entero(f.neumaticos)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.autos_que_volvieron)}`}>
                  {entero(f.autos_que_volvieron)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.recordatorios)}`}>
                  {entero(f.recordatorios)}
                </td>
                <td className={`${TD} ${claseDeCifra(f.escaneos)}`}>
                  {entero(f.escaneos)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
