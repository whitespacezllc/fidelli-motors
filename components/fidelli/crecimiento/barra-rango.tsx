import Link from "next/link";
import { CampoMes } from "@/components/fidelli/crecimiento/campo-mes";
import {
  ANIO_MIN,
  MONEDA_DEFAULT,
  type Rango,
} from "@/lib/fidelli/crecimiento";
import { MONEDAS, type Moneda } from "@/lib/fidelli/mrr";

// ============================================================
// La barra de rango y moneda de /fidelli/crecimiento. Todo vive en la
// URL (`?desde=YYYY-MM&hasta=YYYY-MM&moneda=ars|usd`): el rango es un
// <form method="get"> con dos <input type="month">, y la moneda un
// segmentado de links con la misma estética que los de la pauta. Cambiar
// cualquiera de los tres navega; no hay estado de cliente ni fetch.
//
// La moneda vale SOLO para las secciones monetarias (a y d; d además es
// siempre en dólares por definición). Las demás no cambian, y la barra lo
// dice al lado del segmentado para que nadie busque la diferencia.
// ============================================================

const CAMPO =
  "h-10 rounded-md border border-line bg-base px-3 text-ui text-ink tabular-nums";
const ETIQUETA =
  "text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function hrefConMoneda(rango: Rango, moneda: Moneda): string {
  const p = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
  // El default no se escribe: la URL limpia sigue siendo la de siempre.
  if (moneda !== MONEDA_DEFAULT) p.set("moneda", moneda);
  return `/fidelli/crecimiento?${p.toString()}`;
}

export function BarraRango({
  rango,
  mesEnCurso,
}: {
  rango: Rango;
  /** «2026-09»: el tope de los dos campos (leerRango acota igual del lado del servidor). */
  mesEnCurso: string;
}) {
  const min = `${ANIO_MIN}-01`;
  return (
    <form
      method="get"
      action="/fidelli/crecimiento"
      className="surface-card flex flex-wrap items-end gap-x-4 gap-y-3 px-4.5 py-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="rango-desde" className={ETIQUETA}>
          Desde
        </label>
        <CampoMes
          id="rango-desde"
          name="desde"
          defaultValue={rango.desde}
          min={min}
          max={mesEnCurso}
          className={CAMPO}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rango-hasta" className={ETIQUETA}>
          Hasta
        </label>
        <CampoMes
          id="rango-hasta"
          name="hasta"
          defaultValue={rango.hasta}
          min={min}
          max={mesEnCurso}
          className={CAMPO}
        />
      </div>
      {/* La moneda vigente viaja con el rango nuevo; el default no se escribe. */}
      {rango.moneda !== MONEDA_DEFAULT && (
        <input type="hidden" name="moneda" value={rango.moneda} />
      )}
      {/* Enter y el botón también envían: sin JavaScript, y para quien tipea el mes a mano. */}
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink transition-colors hover:bg-surface"
      >
        Ver
      </button>

      <div className="flex flex-col gap-1 sm:ml-auto">
        <span className={ETIQUETA}>Moneda</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <nav
            aria-label="Moneda de las secciones monetarias"
            className="flex gap-1"
          >
            {MONEDAS.map((m) => {
              const activa = m.clave === rango.moneda;
              return (
                <Link
                  key={m.clave}
                  href={hrefConMoneda(rango, m.clave)}
                  aria-current={activa ? "page" : undefined}
                  className={`flex h-10 items-center rounded-md px-3 text-ui transition-colors ${
                    activa
                      ? "bg-ink font-semibold text-base"
                      : "border border-line bg-base text-ink-60 hover:bg-surface"
                  }`}
                >
                  {m.nombre}
                </Link>
              );
            })}
          </nav>
          <span className="text-label text-ink-40">
            solo el MRR; las cohortes de ingresos van siempre en US$
          </span>
        </div>
      </div>
    </form>
  );
}
