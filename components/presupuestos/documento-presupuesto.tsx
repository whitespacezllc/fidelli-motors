import { paletaTenant } from "@/lib/cliente/color";
import { formatearFecha } from "@/lib/fechas";
import { sumarDias } from "@/lib/fidelli/plan";
import { formatearPesos, totalDe, type ItemPresupuesto } from "@/lib/presupuestos";

export type DatosDocumento = {
  lubricentroNombre: string;
  logoUrl: string | null;
  colorTenant: string;
  colorPapel: string | null;
  numero: number;
  fecha: string;
  validezDias: number | null;
  sucursal: string | null;
  destinatarioNombre: string | null;
  destinatarioTelefono: string | null;
  destinatarioVehiculo: string | null;
  observaciones: string | null;
  items: ItemPresupuesto[];
};

// El presupuesto como papel: el mismo idioma que el cartón y la orden de
// trabajo — grilla con bordes de tinta, la banda de cierre en el color
// del TENANT y cifras tabulares. Acá no hay un píxel de rojo Fidelli:
// este papel lleva la marca del lubricentro, es SU documento.
//
// Es un componente de servidor puro a propósito: lo mismo que se ve en
// pantalla es lo que sale impreso y lo que viaja dentro del PDF
// descargado. Un solo render, tres salidas.
export function DocumentoPresupuesto({ datos }: { datos: DatosDocumento }) {
  const paleta = paletaTenant(datos.colorTenant);
  const total = totalDe(datos.items);
  const hastaCuando =
    datos.validezDias != null
      ? formatearFecha(sumarDias(datos.fecha, datos.validezDias))
      : null;

  const destino = [
    datos.destinatarioNombre,
    datos.destinatarioTelefono,
    datos.destinatarioVehiculo,
  ].filter(Boolean);

  return (
    <div
      style={
        {
          "--tn": paleta.primary,
          "--tn-ink": paleta.ink,
          ...(datos.colorPapel ? { backgroundColor: datos.colorPapel } : {}),
        } as React.CSSProperties
      }
      // En papel el documento ES la hoja: sin sombra, sin borde gris y sin
      // esquinas de tarjeta — el marco lo ponen los márgenes de @page.
      className="rounded-lg border border-line bg-base px-5 pt-6 pb-5 shadow-md print:rounded-none print:border-0 print:shadow-none"
    >
      {/* La cabecera: la marca del lubricentro y el número, frente a frente. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {datos.logoUrl ? (
            /* El logo llega como data URL (lo inlinea la página) y este
               nodo se serializa a imagen para el PDF: next/image
               interpone un loader que rompe esa serialización. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={datos.logoUrl}
              alt={datos.lubricentroNombre}
              className="mb-1.5 h-10 w-auto object-contain"
              crossOrigin="anonymous"
            />
          ) : null}
          <p className="font-brand text-lead font-bold text-ink">
            {datos.lubricentroNombre}
          </p>
          {datos.sucursal && (
            <p className="text-label text-ink-60">{datos.sucursal}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-label font-semibold tracking-[0.14em] text-ink-60 uppercase">
            Presupuesto
          </p>
          <p className="font-brand text-h2 font-bold text-ink tabular-nums">
            N° {datos.numero}
          </p>
        </div>
      </div>

      {/* La grilla de datos, con bordes de tinta como el cartón. */}
      <div className="mt-4 border-[1.5px] border-ink tabular-nums">
        {[
          ["Fecha", formatearFecha(datos.fecha)],
          ...(hastaCuando ? [["Válido hasta", hastaCuando]] : []),
          ...(destino.length > 0 ? [["Para", destino.join(" · ")]] : []),
        ].map(([clave, valor]) => (
          <div key={clave} className="flex items-stretch border-b border-ink">
            <span className="w-32 shrink-0 px-2.5 py-2 text-label font-semibold tracking-[0.03em] uppercase">
              {clave}
            </span>
            <span className="flex-1 border-l border-ink px-2.5 py-2 text-ui font-semibold">
              {valor}
            </span>
          </div>
        ))}

        {/* Los renglones */}
        <div className="flex items-stretch border-b border-ink bg-surface/60">
          <span className="flex-1 px-2.5 py-1.5 text-label font-semibold tracking-[0.06em] uppercase">
            Detalle
          </span>
          <span className="w-14 shrink-0 border-l border-ink px-2 py-1.5 text-right text-label font-semibold tracking-[0.03em] uppercase">
            Cant.
          </span>
          <span className="w-26 shrink-0 border-l border-ink px-2 py-1.5 text-right text-label font-semibold tracking-[0.03em] uppercase">
            Importe
          </span>
        </div>
        {datos.items.map((i, idx) => (
          <div key={idx} className="flex items-stretch border-b border-ink">
            <span className="flex-1 px-2.5 py-2 text-ui text-ink">
              {i.descripcion}
              {i.cantidad !== 1 && (
                <span className="text-ink-60">
                  {" "}
                  — {formatearPesos(i.precioUnitario)} c/u
                </span>
              )}
            </span>
            <span className="flex w-14 shrink-0 items-center justify-end border-l border-ink px-2 py-2 text-ui text-ink-60">
              {i.cantidad}
            </span>
            <span className="flex w-26 shrink-0 items-center justify-end border-l border-ink px-2 py-2 text-ui font-semibold text-ink">
              {formatearPesos(i.cantidad * i.precioUnitario)}
            </span>
          </div>
        ))}

        {/* La banda del total: el peso visual del PROX. SERV. del cartón. */}
        <div className="flex items-center bg-[var(--tn)]/10">
          <span className="flex-1 px-2.5 py-2.5 text-label font-semibold tracking-[0.06em] uppercase">
            Total
          </span>
          <span className="px-2.5 py-2.5 text-right font-brand text-h3 font-bold text-ink tabular-nums">
            {formatearPesos(total)}
          </span>
        </div>
      </div>

      {datos.observaciones && (
        <p className="mt-3 text-ui leading-relaxed text-ink-60">
          {datos.observaciones}
        </p>
      )}

      {/* La letra chica que protege la frontera: esto NO es una factura. */}
      <p className="mt-3 text-label text-ink-40">
        Precios expresados en pesos argentinos. Documento no válido como
        factura.
        {datos.validezDias != null &&
          ` Presupuesto válido por ${datos.validezDias} ${datos.validezDias === 1 ? "día" : "días"}.`}
      </p>
    </div>
  );
}
