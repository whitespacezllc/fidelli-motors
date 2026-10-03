import "server-only";
import { cantidadDeCalcos, numeroDeEncargo } from "@/lib/calcos";
import {
  aliasDe,
  aliasDeOrden,
  crearOrdenDePago,
  cvuDe,
  ErrorCresium,
} from "@/lib/cresium/cliente";
import { conIntentos, estadoEfectivo } from "@/lib/cresium/orden";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// ============================================================
// LA ORDEN DE PAGO DE UN PEDIDO DE CALCOS
//
// Igual que la de una renovación (app/panel/.../suscripcion/actions.ts): una
// orden de Cresium con alias y CVU propios, que vive siete días, guardada en
// `cresium_ordenes` para pintar la pantalla sin depender de su API. Lo que
// cambia es de qué es: lleva `encargo_calcos_id` y su referencia es
// `calcos:<uuid del encargo>`.
//
// ⚠ ESTO MUEVE PLATA DE VERDAD. Crea un CVU real en Cresium, y no hay
// entorno de pruebas (lib/cresium/cliente.ts). En local, CRESIUM_BASE_URL
// apunta al doble (scripts/doble-cresium.mjs).
//
// ⚠ EL MONTO ES EL DEL PEDIDO, congelado al crearlo: se lee de la base con
// la clave de servicio, nunca del formulario ni del catálogo de ahora.
//
// ⚠ EL ALIAS ES SIEMPRE EL DERIVADO de la referencia (`aliasDeOrden`), no el
// alias fijo del tenant si algún día lo tiene: ese alias es de la cuenta de
// su suscripción, y un alias no puede apuntar a dos CVU.
//
// ⚠ LA REFERENCIA ES ÚNICA EN CRESIUM PARA SIEMPRE (regla 20): si ya hubo
// una orden de este pedido —vencida, cerrada, o una que se creó allá y no
// llegó a guardarse acá—, la siguiente sale como `calcos:<uuid>:2`. El
// webhook lee las dos primeras partes y acredita al mismo pedido (R40m).
//
// No tira por un error de Cresium ni de red: devuelve `ok: false`, el
// pedido queda sin pagar y sin cuenta, y la pantalla ofrece Reintentar.
// ============================================================

export type OrdenDelPedido = { ok: true } | { ok: false; motivo: "pedido" | "cresium" };

export async function generarOrdenDelPedido(d: {
  encargoId: string;
  lubricentroId: string;
  lubricentroNombre: string | null;
}): Promise<OrdenDelPedido> {
  const admin = crearClienteAdmin();

  const { data: pedido } = await admin
    .from("encargos_calcos")
    .select("id, lubricentro_id, numero, cantidad, estado, monto_total")
    .eq("id", d.encargoId)
    .maybeSingle();

  const monto = Number(pedido?.monto_total);
  if (
    !pedido ||
    pedido.lubricentro_id !== d.lubricentroId ||
    pedido.estado !== "pendiente_pago" ||
    !Number.isFinite(monto) ||
    monto <= 0
  ) {
    return { ok: false, motivo: "pedido" };
  }

  const { data: previas } = await admin
    .from("cresium_ordenes")
    .select("id, external_id, estado, created_at")
    .eq("encargo_calcos_id", pedido.id)
    .order("created_at", { ascending: false });

  // Ya hay una cuenta viva para este pedido: se reusa. Emitir otra dejaría
  // al dueño con dos alias copiados y la plata en el que ya no miramos.
  const viva = (previas ?? []).find((o) => {
    const estado = estadoEfectivo(o.estado, o.created_at);
    return estado === "NOT_PAID" || estado === "PARTIAL";
  });
  if (viva) return { ok: true };

  const base = `calcos:${pedido.id}`;
  const intentoInicial = (previas?.length ?? 0) + 1;
  const nombre = d.lubricentroNombre ?? "taller";

  let resultado;
  try {
    resultado = await conIntentos(
      base,
      intentoInicial,
      async (externalId, intento) => {
        const alias = aliasDeOrden(nombre, externalId);
        const orden = await crearOrdenDePago({
          externalId,
          monto,
          alias,
          titulo: `Fidelli Motors · ${nombre}`,
          descripcion: `Pedido de calcos ${numeroDeEncargo(pedido.numero)} · ${cantidadDeCalcos(pedido.cantidad)} calcos`,
          metadata: {
            lubricentro: d.lubricentroId,
            encargo: pedido.id,
            concepto: "calcos",
            intento: String(intento),
          },
        });
        return { orden, alias };
      },
      // Solo este error justifica subir el número de intento.
      (e) => e instanceof ErrorCresium && e.cuerpo.includes("EXISTING_EXTERNAL_ID"),
    );
  } catch (e) {
    console.error(`[cresium] no se pudo crear la orden ${base}: ${e instanceof Error ? e.message : e}`);
    return { ok: false, motivo: "cresium" };
  }

  if (!resultado.ok) {
    const error = resultado.error;
    console.error(
      `[cresium] no se pudo crear la orden ${resultado.externalId}: ${error instanceof Error ? error.message : error}`,
    );
    return { ok: false, motivo: "cresium" };
  }

  if (resultado.intento > intentoInicial) {
    console.warn(`[cresium] ${base} ya existía en Cresium; la orden salió como ${resultado.externalId}`);
  }

  const { orden, alias } = resultado.valor;

  // Lo que se guarda es lo que CRESIUM confirmó, no lo que pedimos.
  const { error: errorGuardar } = await admin.from("cresium_ordenes").insert({
    lubricentro_id: d.lubricentroId,
    encargo_calcos_id: pedido.id,
    external_id: resultado.externalId,
    monto,
    alias: aliasDe(orden) ?? alias,
    cvu: cvuDe(orden),
    orden_id: orden.paymentOrder?.id ?? null,
    estado: orden.paymentOrder?.status ?? "NOT_PAID",
  });

  if (errorGuardar) {
    // La orden existe en Cresium y no acá. El próximo intento pide la misma
    // referencia, Cresium contesta que ya existe y sale como `:2`.
    console.error(`[cresium] la orden ${resultado.externalId} se creó pero no se pudo guardar: ${errorGuardar.message}`);
    return { ok: false, motivo: "cresium" };
  }

  return { ok: true };
}
