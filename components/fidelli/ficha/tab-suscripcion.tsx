import { createClient } from "@/lib/supabase/server";
import { formatearFecha } from "@/lib/fechas";
import {
  MESES_DEL_PERIODO,
  pesos,
  sumarDias,
  sumarMeses,
  totalDelPeriodo,
} from "@/lib/fidelli/plan";
import { obtenerSesion } from "@/lib/auth/session";
import { FormPago } from "./form-pago";
import type { SuscripcionVigente, Tenant } from "./tipos";

const TH =
  "px-3 py-2 text-left text-label font-semibold tracking-[0.06em] text-ink-60 uppercase whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";

export async function TabSuscripcion({
  tenant,
  suscripcion,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente | null;
}) {
  const supabase = await createClient();

  // El filtro por tenant es lo único que aísla: pagos no tiene RLS que
  // recorte a un superadmin.
  const [pagosRes, sesion] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, periodo_desde, periodo_hasta, monto, fecha_pago, created_at, usuarios!registrado_por(nombre)",
      )
      .eq("lubricentro_id", tenant.id)
      .order("periodo_hasta", { ascending: false }),
    obtenerSesion(),
  ]);

  const pagos = pagosRes.data ?? [];

  // El período de trial no está en `pagos` —no se cobró— pero es parte del
  // historial: sin él, la primera fila arranca en el aire. Va desde el
  // inicio de la suscripción hasta el día antes del primer período pago.
  const primerPago = pagos.length > 0 ? pagos[pagos.length - 1] : null;
  const finDelTrial = primerPago
    ? sumarDias(primerPago.periodo_desde, -1)
    : (suscripcion?.vencimiento ?? null);

  const hayTrial =
    suscripcion !== null && finDelTrial !== null && finDelTrial >= suscripcion.inicio;

  const meses = suscripcion ? MESES_DEL_PERIODO[suscripcion.periodo] : 1;
  const desdeSugerido = suscripcion ? sumarDias(suscripcion.vencimiento, 1) : "";
  const hastaSugerido = desdeSugerido
    ? sumarDias(sumarMeses(desdeSugerido, meses), -1)
    : "";
  const montoSugerido =
    suscripcion?.plan != null
      ? totalDelPeriodo(
          suscripcion.plan,
          suscripcion.periodo,
          suscripcion.descuento_pct,
        )
      : 0;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <section className="surface-card min-w-0 flex-1 overflow-hidden">
        <div className="border-b border-line px-4.5 py-3">
          <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
            Historial de pagos
          </h2>
        </div>

        {pagos.length === 0 && !hayTrial ? (
          <p className="px-4.5 py-6 text-ui text-ink-60">
            Todavía no se registró ningún pago de este lubricentro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-ui">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={`${TH} w-full`}>Período</th>
                  <th scope="col" className={TH}>Monto</th>
                  <th scope="col" className={TH}>Pagado</th>
                  <th scope="col" className={TH}>Registró</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className={TD}>
                      {formatearFecha(p.periodo_desde)} →{" "}
                      {formatearFecha(p.periodo_hasta)}
                    </td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>
                      {pesos(Number(p.monto))}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {formatearFecha(p.fecha_pago)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-60`}>
                      {p.usuarios?.nombre ?? "—"}
                    </td>
                  </tr>
                ))}

                {hayTrial && suscripcion && (
                  <tr className="border-b border-line last:border-b-0">
                    <td className={TD}>
                      {formatearFecha(suscripcion.inicio)} →{" "}
                      {formatearFecha(finDelTrial!)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-60`}>
                      {suscripcion.descuento_pct === 50
                        ? "Trial founding"
                        : "Trial"}
                    </td>
                    <td className={`${TD} text-ink-40`}>—</td>
                    <td className={`${TD} text-ink-40`}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/*
          Debajo del historial va el aviso de vencimiento por WhatsApp, con
          el mensaje pre-armado. Es la tarea siguiente: el espacio queda
          reservado acá, al pie de la tabla que da el contexto.
        */}
      </section>

      <section className="surface-card w-full overflow-hidden lg:w-[380px] lg:shrink-0">
        <div className="border-b border-line px-4.5 py-3">
          <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
            Registrar pago
          </h2>
        </div>

        <div className="px-4.5 py-4">
          {suscripcion ? (
            <FormPago
              lubricentroId={tenant.id}
              desde={desdeSugerido}
              hasta={hastaSugerido}
              monto={montoSugerido}
              firma={sesion?.nombre ?? "vos"}
            />
          ) : (
            <p className="text-ui text-ink-60">
              Este lubricentro no tiene ninguna suscripción, así que no hay
              período que cobrar.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
