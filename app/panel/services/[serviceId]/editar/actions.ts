"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import type {
  PayloadService,
  ResultadoGuardado,
} from "@/app/panel/services/nuevo/[vehiculoId]/actions";

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: los cambios que hiciste siguen acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

// El caso borde real: el mecánico dejó la pantalla abierta y las 24 horas
// vencieron mientras editaba. La base rechaza el UPDATE (la policy filtra
// la fila), actualizar_service lo convierte en service_no_editable, y acá
// se le pone el mensaje. Nunca un error crudo.
const SE_FIJO =
  "Este service se fijó mientras lo editabas: pasaron las 24 horas y ya no se puede modificar. Si hay un error grave, escribinos y lo resolvemos.";

function traducirError(error: { code?: string; message?: string }): string {
  if (/service_no_editable/.test(error.message ?? "")) return SE_FIJO;
  if (/fetch|network|conexión/i.test(error.message ?? "")) return SIN_CONEXION;
  if (error.code === "23514") {
    return "Algún dato quedó fuera de rango. Revisá los kilómetros y el próximo service.";
  }
  return "No se pudieron guardar los cambios. No cierres esta pantalla y probá de nuevo.";
}

// La edición va por actualizar_service: cabecera y renglones se
// reconcilian en una sola transacción. El vehículo no viaja — un service
// no se reasigna a otro auto.
export async function actualizarService(
  serviceId: string,
  payload: PayloadService,
): Promise<ResultadoGuardado> {
  await sesionParaEscribir();

  if (!payload.sucursalId) return { error: "Elegí la sucursal donde se hizo." };
  if (!Number.isFinite(payload.kilometros) || payload.kilometros < 0) {
    return { error: "Cargá los kilómetros del odómetro." };
  }
  if (payload.aceiteTipo.trim().length < 2) {
    return { error: "Cargá la viscosidad del aceite de motor." };
  }
  if (payload.proxServiceKm <= payload.kilometros) {
    return {
      error: "El próximo service tiene que ser mayor a los kilómetros de hoy.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_service", {
    p_service_id: serviceId,
    p_sucursal_id: payload.sucursalId,
    p_fecha: payload.fecha,
    p_kilometros: payload.kilometros,
    p_aceite_tipo: payload.aceiteTipo,
    p_prox_service_km: payload.proxServiceKm,
    p_items: payload.items,
    p_aceite_producto_id: payload.aceiteProductoId ?? undefined,
    p_aceite_nombre: payload.aceiteNombre ?? undefined,
    p_observaciones: payload.observaciones ?? undefined,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/panel/services");
  revalidatePath(`/panel/services/${serviceId}`);
  revalidatePath("/panel/clientes");
  return { serviceId };
}
