import Link from "next/link";
import { formatearFecha, haceCuanto } from "@/lib/fechas";
import { diasHasta } from "@/lib/fidelli/plan";
import {
  BadgeSuscripcion,
  BadgeDescuento,
  BadgeSinSuscripcion,
} from "@/components/fidelli/badges";
import { CeldaOwner } from "@/components/fidelli/celda-owner";
import { CeldaAtencion } from "@/components/fidelli/celda-atencion";
import { AccionesTenant } from "@/components/fidelli/acciones-tenant";
import { CeldaSalud } from "@/components/fidelli/celda-salud";
import type { FilaLubricentro, PlanCompleto, EstadoOwner } from "@/components/fidelli/tipos";

const TH =
  "px-3 py-2.5 text-left text-label font-semibold tracking-[0.06em] text-ink-60 uppercase whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";

// El vencimiento se tiñe cuando ya pasó o está por pasar. Ámbar, nunca rojo:
// el rojo de marca es acción, no estado.
function colorDeVencimiento(iso: string, estado: string): string {
  if (estado === "cancelada") return "text-ink-40";
  const dias = diasHasta(iso);
  if (dias < 0) return "text-overdue font-semibold";
  if (dias <= 7) return "text-urgente font-semibold";
  return "text-ink";
}

export function TablaLubricentros({
  filas,
  planes,
}: {
  filas: FilaLubricentro[];
  planes: PlanCompleto[];
}) {
  return (
    // Densidad alta = tabla ancha. En mobile scrollea en horizontal dentro de
    // su caja en lugar de apretarse: el caso principal de esta superficie es
    // desktop, y una tabla de 7 columnas plegada a 375px no se lee mejor.
    <div className="surface-card overflow-x-auto">
      <table className="w-full min-w-[1240px] border-collapse text-ui">
        <thead>
          <tr className="border-b border-line">
            {/* w-full en la identidad: el sobrante de ancho se lo queda esta
                columna y las demás quedan pegadas a su contenido, sin huecos
                entre el dato y su acción. */}
            <th scope="col" className={`${TH} w-full`}>Lubricentro</th>
            <th scope="col" className={TH}>Suscripción</th>
            <th scope="col" className={TH}>Vencimiento</th>
            {/* La columna del ritual: qué le pasa a este lubricentro y el tap
                para resolverlo, uno al lado del otro. */}
            <th scope="col" className={TH}>Atención</th>
            <th scope="col" className={`${TH} text-right`}>Services mes</th>
            <th scope="col" className={TH}>Último service</th>
            <th scope="col" className={TH}>Owner</th>
            <th scope="col" className={TH}>Salud</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {filas.map((l) => {
            const apagado = !l.activo;

            return (
              <tr
                key={l.id}
                className="border-b border-line last:border-b-0 hover:bg-surface/50"
              >
                <td className={TD}>
                  <Link
                    href={`/fidelli/${l.id}`}
                    className="block rounded-sm hover:underline"
                  >
                    <span
                      className={`flex items-center gap-2 font-semibold ${apagado ? "text-ink-40" : "text-ink"}`}
                    >
                      {l.nombre}
                      {apagado && (
                        <span className="rounded-sm border border-line bg-surface px-1.5 py-px text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
                          suspendido
                        </span>
                      )}
                    </span>
                    <span className="block text-label text-ink-40">/{l.slug}</span>
                  </Link>
                </td>

                <td className={TD}>
                  {l.suscripcion_id && l.sub_estado && l.sub_periodo && l.sub_vencimiento ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <BadgeSuscripcion
                        estado={l.sub_estado}
                        periodo={l.sub_periodo}
                        vencimiento={l.sub_vencimiento}
                      />
                      <BadgeDescuento pct={Number(l.sub_descuento_pct ?? 0)} />
                    </span>
                  ) : (
                    <BadgeSinSuscripcion />
                  )}
                </td>

                <td className={TD}>
                  {l.sub_vencimiento ? (
                    <span className={colorDeVencimiento(l.sub_vencimiento, l.sub_estado ?? "")}>
                      {formatearFecha(l.sub_vencimiento)}
                    </span>
                  ) : (
                    <span className="text-ink-40">—</span>
                  )}
                </td>

                <td className={TD}>
                  <CeldaAtencion
                    lubricentroId={l.id}
                    nombre={l.nombre}
                    atencion={l.atencion}
                    contactado={l.contactado}
                    telefono={l.telefono}
                    ownerNombre={l.owner_nombre}
                    vencimiento={l.sub_vencimiento}
                    periodo={l.sub_periodo}
                    descuentoPct={Number(l.sub_descuento_pct ?? 0)}
                    plan={
                      l.plan_id
                        ? {
                            id: l.plan_id,
                            nombre: l.plan_nombre ?? "",
                            precio_mensual: Number(l.plan_precio ?? 0),
                            descuento_semestral_pct: Number(l.plan_desc_sem ?? 0),
                            descuento_anual_pct: Number(l.plan_desc_anual ?? 0),
                          }
                        : null
                    }
                  />
                </td>

                <td className={`${TD} text-right font-semibold`}>
                  {l.services_mes > 0 ? (
                    l.services_mes
                  ) : (
                    <span className="font-normal text-ink-40">0</span>
                  )}
                </td>

                <td className={TD}>
                  {l.ultimo_service ? (
                    <span className="text-ink-60">{haceCuanto(l.ultimo_service)}</span>
                  ) : (
                    <span className="text-ink-40">sin services</span>
                  )}
                </td>

                <td className={TD}>
                  <CeldaOwner
                    lubricentroId={l.id}
                    nombre={l.nombre}
                    estado={l.owner_estado as EstadoOwner}
                  />
                </td>

                <td className={TD}>
                  <CeldaSalud
                    estado={l.sub_estado}
                    vencimiento={l.sub_vencimiento}
                    ultimoService={l.ultimo_service}
                  />
                </td>

                <td className={`${TD} text-right`}>
                  <AccionesTenant fila={l} planes={planes} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
