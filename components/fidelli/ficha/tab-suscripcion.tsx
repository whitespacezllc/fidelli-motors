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
import { BotonAviso } from "@/components/fidelli/boton-aviso";
import {
  ESTILO_ATENCION,
  esAtencion,
  linkDeAviso,
  motivoDe,
  textoDeVencimiento,
} from "@/lib/fidelli/atencion";
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
  const [pagosRes, atencionRes, sesion] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, periodo_desde, periodo_hasta, monto, fecha_pago, created_at, usuarios!registrado_por(nombre)",
      )
      .eq("lubricentro_id", tenant.id)
      .order("periodo_hasta", { ascending: false }),
    // Las mismas funciones que usa el listado, para una sola fila: la ficha
    // y la tabla no pueden decir cosas distintas del mismo lubricentro.
    supabase.rpc("atencion_tenant", { p_lubricentro_id: tenant.id }),
    obtenerSesion(),
  ]);

  const aviso = (atencionRes.data ?? {}) as {
    atencion?: string | null;
    contactado?: boolean;
    telefono?: string | null;
    owner_nombre?: string | null;
  };

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

        {/* El aviso de vencimiento va al pie de la tabla que le da el
            contexto: recién habiendo visto qué pagó y hasta cuándo tiene
            sentido el botón que le escribe. */}
        {suscripcion && (
          <BloqueAviso
            tenant={tenant}
            suscripcion={suscripcion}
            atencion={aviso.atencion ?? null}
            contactado={aviso.contactado ?? false}
            telefono={aviso.telefono ?? null}
            ownerNombre={aviso.owner_nombre ?? null}
          />
        )}
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

// ============================================================
// El aviso de vencimiento, en la ficha
//
// Mismo botón y misma regla anti-spam que el listado —comparten
// BotonAviso— pero acá hay lugar para decir POR QUÉ hay que escribirle.
// En la tabla eso no entra; en la ficha, que es donde se prepara la
// conversación, es lo que más ayuda.
// ============================================================
function BloqueAviso({
  tenant,
  suscripcion,
  atencion,
  contactado,
  telefono,
  ownerNombre,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente;
  atencion: string | null;
  contactado: boolean;
  telefono: string | null;
  ownerNombre: string | null;
}) {
  if (!esAtencion(atencion)) {
    return (
      <div className="border-t border-line px-4.5 py-4">
        <p className="text-ui text-success">
          Al día: no hay ningún vencimiento cerca.
        </p>
        <p className="mt-0.5 text-label text-ink-60">
          El aviso aparece acá cuando falten {""}
          menos de una semana para el vencimiento, o cuando ya haya pasado.
        </p>
      </div>
    );
  }

  const estilo = ESTILO_ATENCION[atencion];

  return (
    <div className="border-t border-line px-4.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-label font-semibold tracking-[0.04em] uppercase ${estilo.clase}`}
        >
          {estilo.etiqueta}
        </span>
        <span className="text-ui text-ink-60">
          {textoDeVencimiento(suscripcion.vencimiento)} ·{" "}
          {formatearFecha(suscripcion.vencimiento)}
        </span>
      </div>

      <p className="mt-1.5 text-ui text-ink-60">{estilo.explicacion}</p>

      <div className="mt-3">
        <BotonAviso
          lubricentroId={tenant.id}
          motivo={motivoDe(atencion)}
          contactado={contactado}
          nombre={tenant.nombre}
          link={linkDeAviso({
            atencion,
            telefono,
            ownerNombre,
            lubricentroNombre: tenant.nombre,
            vencimiento: suscripcion.vencimiento,
            periodo: suscripcion.periodo,
            descuentoPct: suscripcion.descuento_pct,
            plan: suscripcion.plan,
          })}
        />
      </div>
    </div>
  );
}
