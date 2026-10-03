import Link from "next/link";
import { Chip, type TonoChip } from "@/components/fidelli/chip";
import { fechaCalendarioAR, formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import { numeroDeEncargo, queLleva, type EstadoEncargo } from "@/lib/calcos";
import { ETIQUETA_ESTADO, metrosCuadrados, type EncargoAdmin } from "@/lib/fidelli/calcos";
import { AccionesEncargo } from "./acciones-encargo";

// Lo normal va callado (gris), lo que espera plata se ve (ámbar) y lo
// terminado se confirma (verde). El rojo de marca no aparece: esto es
// estado.
const TONO: Record<EstadoEncargo, TonoChip> = {
  pendiente_pago: "aviso",
  pagado: "neutro",
  en_produccion: "neutro",
  enviado: "neutro",
  listo_retiro: "neutro",
  entregado: "ok",
  vencido: "apagado",
  cancelado: "apagado",
};

function dia(instante: string | null): string | null {
  return instante ? formatearFecha(fechaCalendarioAR(new Date(instante))) : null;
}

// Desde cuándo está el pedido como está: es lo que ordena la cola.
function desde(e: EncargoAdmin): string | null {
  switch (e.estado) {
    case "pendiente_pago":
      return `pedido el ${dia(e.created_at)}`;
    case "pagado":
      return e.pagado_at ? `desde el ${dia(e.pagado_at)}` : null;
    case "en_produccion":
      if (e.dias_habiles == null) return null;
      if (e.dias_habiles === 0) return "entró hoy";
      return `hace ${e.dias_habiles} ${e.dias_habiles === 1 ? "día hábil" : "días hábiles"}`;
    case "enviado":
    case "listo_retiro":
      return e.enviado_at ? `desde el ${dia(e.enviado_at)}` : null;
    case "entregado":
      return e.entregado_at ? `el ${dia(e.entregado_at)}` : null;
    default:
      return null;
  }
}

function plata(n: number): string {
  return n < 0 ? `−${pesos(-n)}` : pesos(n);
}

// ============================================================
// La tabla de pedidos de calcos: la misma en la solapa de la ficha y en la
// cola de /fidelli/calcos (que suma la columna del lubricentro).
//
// La ganancia y el m² se ven SOLO acá: son costo, y el costo no sale de
// /fidelli.
// ============================================================
export function TablaEncargos({
  encargos,
  conTenant = false,
}: {
  encargos: EncargoAdmin[];
  conTenant?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse text-ui ${conTenant ? "min-w-[1040px]" : "min-w-[820px]"}`}
      >
        <thead>
          <tr className="border-b border-line text-left text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            <th className="px-3 py-2.5 font-semibold">#</th>
            {conTenant && <th className="px-3 py-2.5 font-semibold">Lubricentro</th>}
            <th className="px-3 py-2.5 font-semibold">Pedido</th>
            <th className="px-3 py-2.5 font-semibold">Monto</th>
            <th className="px-3 py-2.5 font-semibold">Estado</th>
            <th className="px-3 py-2.5 font-semibold">Acción</th>
          </tr>
        </thead>
        <tbody>
          {encargos.map((e) => {
            const destino = [
              e.direccion,
              e.localidad,
              e.codigo_postal ? `CP ${e.codigo_postal}` : null,
              e.telefono_contacto,
            ].filter(Boolean);
            const cuando = desde(e);

            return (
              <tr
                key={e.id}
                data-encargo={e.numero}
                className="border-b border-line align-top last:border-b-0"
              >
                <td className="px-3 py-3 font-semibold text-ink tabular-nums whitespace-nowrap">
                  {numeroDeEncargo(e.numero)}
                </td>

                {conTenant && (
                  <td className="px-3 py-3">
                    <Link
                      href={`/fidelli/${e.lubricentro_id}?tab=calcos`}
                      className="font-semibold whitespace-nowrap text-ink hover:underline"
                    >
                      {e.lubricentro_nombre}
                    </Link>
                  </td>
                )}

                <td className="px-3 py-3">
                  <span className="text-ink tabular-nums">{queLleva(e)}</span>
                  {destino.length > 0 && (
                    <span className="block text-label text-ink-60 tabular-nums">
                      {destino.join(" · ")}
                    </span>
                  )}
                  {e.seguimiento && (
                    <span className="block text-label text-ink-60 tabular-nums">
                      {e.transportista} {e.seguimiento}
                    </span>
                  )}
                  {e.rediseno && e.rediseno_pedido && (
                    <span className="block text-label text-ink-60">
                      Quiere cambiar: {e.rediseno_pedido}
                    </span>
                  )}
                  {e.nota && <span className="block text-label text-ink-40">{e.nota}</span>}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="text-ink tabular-nums">
                    {e.incluido ? "Incluido" : pesos(e.monto_total)}
                  </span>
                  <span
                    className="block text-label text-ink-60 tabular-nums"
                    title={`${pesos(e.monto_total)} − costo ${pesos(e.costo_estimado)} − Cresium ${pesos(e.comision_estimada)}`}
                  >
                    ganancia {plata(e.ganancia)} · {metrosCuadrados(e.cantidad)}
                  </span>
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  <Chip tono={TONO[e.estado]} data-estado={e.estado}>
                    {ETIQUETA_ESTADO[e.estado]}
                  </Chip>
                  {e.atrasado && (
                    <span className="ml-1.5">
                      <Chip tono="vencido">Atrasado</Chip>
                    </span>
                  )}
                  {cuando && (
                    <span className="mt-1 block text-label text-ink-60 tabular-nums">{cuando}</span>
                  )}
                </td>

                <td className="px-3 py-3">
                  <AccionesEncargo
                    encargo={{
                      id: e.id,
                      lubricentro_id: e.lubricentro_id,
                      numero: e.numero,
                      estado: e.estado,
                      entrega: e.entrega,
                      incluido: e.incluido,
                      cantidad: e.cantidad,
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
