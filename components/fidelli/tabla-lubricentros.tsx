import Link from "next/link";
import { formatearFecha } from "@/lib/fechas";
import {
  ETIQUETA_PERIODO,
  diasHasta,
  esFounding,
  pesos,
  porcentaje,
  type Periodo,
} from "@/lib/fidelli/plan";
import {
  ESTILO_ATENCION,
  esAtencion,
  linkDeAviso,
  motivoDe,
  textoDeVencimiento,
} from "@/lib/fidelli/atencion";
import {
  ESTILO_ESTADO,
  ESTILO_SALUD,
  estadoDe,
  type FilaListado,
} from "@/lib/fidelli/listado";
import { Chip } from "@/components/fidelli/chip";
import { Sparkline } from "@/components/fidelli/sparkline";
import { BotonAviso } from "@/components/fidelli/boton-aviso";
import { AccionesTenant } from "@/components/fidelli/acciones-tenant";
import type { EstadoOwner, PlanCompleto } from "@/components/fidelli/tipos";

// ============================================================
// La tabla de /fidelli/lubricentros: siete columnas, layout fijo, sin
// ancho mínimo desde 768px. Lo que no entra se apila dentro de la celda;
// lo que importa menos se esconde por ancho (Vencimiento debajo de 1024,
// Salud debajo de 768). El body nunca scrollea en horizontal: debajo de
// 768 la tabla conserva un ancho mínimo y scrollea DENTRO de su tarjeta,
// con la columna del nombre pegada a la izquierda.
//
// Todo lo que decide qué se muestra viene de la base: el estado (la
// definición única de activo), la salud y su motivo, el MRR, el módulo
// pago o bonificado, los trabajos. Acá solo se pinta.
// ============================================================

const TH =
  "px-3 py-2.5 text-left align-bottom text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";
const TD = "px-3 py-3 align-top";
const SUB = "block font-normal normal-case tracking-normal text-ink-40";

// El vencimiento se tiñe cuando ya pasó o está por pasar. Ámbar, nunca
// rojo: el rojo de marca es acción, no estado. Un exento no debe nada, así
// que su fecha no se tiñe: sería contradecir el chip de al lado.
function colorDeVencimiento(iso: string, estado: string, exento: boolean): string {
  if (estado === "cancelada" || exento) return "text-ink-40";
  const dias = diasHasta(iso);
  if (dias < 0) return "text-overdue font-semibold";
  if (dias <= 7) return "text-urgente font-semibold";
  return "text-ink";
}

const CHIP_OWNER: Record<Exclude<EstadoOwner, "activo">, string> = {
  pendiente: "Owner pendiente",
  sin_owner: "Sin owner",
};

export function TablaLubricentros({
  filas,
  planes,
}: {
  filas: FilaListado[];
  planes: PlanCompleto[];
}) {
  return (
    // `relative` no es decorativo: con la columna del nombre en sticky,
    // Chrome extiende el ancho scrolleable del DOCUMENTO hasta el borde de
    // la tabla aunque la tarjeta la recorte (medido a 390px: 659 contra
    // 390, y el body scrolleaba). Con la tarjeta como bloque contenedor
    // de las celdas sticky, el scroll queda adentro de la tarjeta.
    <div className="surface-card relative overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-ui md:min-w-0">
        <thead>
          <tr className="border-b border-line">
            {/* sticky por si el contenedor llegara a scrollear: el nombre
                es lo que ancla la lectura de la fila. */}
            <th scope="col" className={`${TH} sticky left-0 z-[1] w-[24%] bg-base`}>
              Lubricentro
            </th>
            <th scope="col" className={`${TH} w-[16%]`}>
              Estado
            </th>
            <th scope="col" className={`${TH} w-[16%]`}>
              Plan y abono
              <span className={SUB}>ARS por mes</span>
            </th>
            <th scope="col" className={`${TH} hidden w-[10%] lg:table-cell`}>
              Vencimiento
            </th>
            <th scope="col" className={`${TH} w-[11%] text-right`}>
              Trabajos
              <span className={SUB}>últimos 30 días</span>
            </th>
            <th scope="col" className={`${TH} hidden w-[13%] md:table-cell`}>
              Salud
            </th>
            <th scope="col" className={`${TH} w-[10%]`}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {filas.map((f) => {
            const l = f.fila;
            const apagado = !l.activo;
            const estado = estadoDe(f);
            const estiloEstado = ESTILO_ESTADO[estado];
            const exento = estado === "exento";
            const salud = f.salud?.salud ? ESTILO_SALUD[f.salud.salud] : null;
            const owner = l.owner_estado as EstadoOwner;
            const descuento = Number(l.sub_descuento_pct ?? 0);
            const periodo = l.sub_periodo as Periodo | null;
            const mrr = f.indicadores ? Number(f.indicadores.mrr_ars) : null;
            const trabajos30 = f.indicadores ? Number(f.indicadores.trabajos_30) : l.services_mes;
            const atencion = l.atencion;

            return (
              <tr
                key={l.id}
                className="group border-b border-line last:border-b-0 hover:bg-surface/50"
              >
                <td className={`${TD} sticky left-0 z-[1] bg-base group-hover:bg-surface`}>
                  <Link href={`/fidelli/${l.id}`} className="block rounded-sm hover:underline">
                    <span
                      className={`block font-semibold break-words ${apagado ? "text-ink-40" : "text-ink"}`}
                    >
                      {l.nombre}
                    </span>
                    <span className="block text-label text-ink-40">/{l.slug}</span>
                  </Link>
                  {/* Los chips van solo cuando hay algo que decir. */}
                  {(owner !== "activo" || l.onboarding_paso != null || f.origen.origen === null) && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {owner !== "activo" && (
                        <Chip tono={owner === "sin_owner" ? "vencido" : "aviso"}>
                          {CHIP_OWNER[owner]}
                        </Chip>
                      )}
                      {l.onboarding_paso != null && (
                        <Chip tono="neutro">
                          Onboarding paso {l.onboarding_paso} de {l.onboarding_pasos}
                        </Chip>
                      )}
                      {f.origen.origen === null && <Chip tono="neutro">Sin origen</Chip>}
                    </span>
                  )}
                </td>

                <td className={TD}>
                  <Chip tono={estiloEstado.tono}>{estiloEstado.etiqueta}</Chip>
                  {esAtencion(atencion) && l.sub_vencimiento && periodo && (
                    <span className="mt-1.5 flex flex-col items-start gap-1.5">
                      <span className="text-label text-ink-60">
                        {ESTILO_ATENCION[atencion].etiqueta} · {textoDeVencimiento(l.sub_vencimiento)}
                      </span>
                      <BotonAviso
                        lubricentroId={l.id}
                        motivo={motivoDe(atencion)}
                        contactado={l.contactado}
                        nombre={l.nombre}
                        link={linkDeAviso({
                          atencion,
                          telefono: l.telefono,
                          ownerNombre: l.owner_nombre,
                          lubricentroNombre: l.nombre,
                          vencimiento: l.sub_vencimiento,
                          periodo,
                          descuentoPct: descuento,
                          plan: l.plan_id
                            ? {
                                id: l.plan_id,
                                nombre: l.plan_nombre ?? "",
                                precio_mensual: Number(l.plan_precio ?? 0),
                                descuento_semestral_pct: Number(l.plan_desc_sem ?? 0),
                                descuento_anual_pct: Number(l.plan_desc_anual ?? 0),
                              }
                            : null,
                        })}
                      />
                    </span>
                  )}
                </td>

                <td className={TD}>
                  {l.suscripcion_id && periodo ? (
                    <>
                      <span className={`block font-semibold ${apagado ? "text-ink-40" : "text-ink"}`}>
                        {l.plan_nombre} · {ETIQUETA_PERIODO[periodo]}
                      </span>
                      {descuento > 0 && (
                        <span className="block text-label text-ink-60">
                          −{porcentaje(descuento)}
                          {esFounding(descuento) ? " founding" : ""}
                        </span>
                      )}
                      <span className="mt-0.5 block text-ink tabular-nums">
                        {mrr !== null ? pesos(mrr) : <span className="text-ink-40">—</span>}
                      </span>
                      {l.modulo_neumaticos && (
                        <span className="mt-1.5 block">
                          <Chip tono="premio">
                            Gomería · {f.indicadores?.modulo_pago ? "pago" : "bonificado"}
                          </Chip>
                        </span>
                      )}
                    </>
                  ) : (
                    <Chip tono="apagado">Sin suscripción</Chip>
                  )}
                </td>

                <td className={`${TD} hidden lg:table-cell`}>
                  {l.sub_vencimiento ? (
                    <>
                      <span
                        className={`block tabular-nums ${colorDeVencimiento(l.sub_vencimiento, l.sub_estado ?? "", exento)}`}
                      >
                        {formatearFecha(l.sub_vencimiento)}
                      </span>
                      {l.sub_estado !== "cancelada" && !exento && (
                        <span className="block text-label text-ink-40">
                          {textoDeVencimiento(l.sub_vencimiento)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-40">—</span>
                  )}
                </td>

                <td className={`${TD} text-right`}>
                  <span className="flex items-center justify-end gap-2">
                    <span
                      className={`font-semibold tabular-nums ${trabajos30 > 0 ? "text-ink" : "font-normal text-ink-40"}`}
                    >
                      {trabajos30}
                    </span>
                    <span className={apagado ? "text-ink-40" : "text-ink-60"}>
                      <Sparkline
                        valores={f.semanas}
                        etiqueta={`Trabajos por semana de ${l.nombre}, últimas ${f.semanas.length} semanas`}
                      />
                    </span>
                  </span>
                </td>

                <td className={`${TD} hidden md:table-cell`}>
                  {salud && f.salud ? (
                    <>
                      <Chip tono={salud.tono}>{salud.etiqueta}</Chip>
                      {f.salud.motivo && (
                        <span className="mt-1 block text-label text-ink-60">{f.salud.motivo}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-40">—</span>
                  )}
                </td>

                <td className={`${TD} text-right`}>
                  <AccionesTenant fila={l} planes={planes} origen={f.origen} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
