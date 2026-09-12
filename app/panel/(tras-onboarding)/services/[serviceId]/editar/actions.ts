"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { esSaltoValido, SALTO_RANGO_ERROR } from "@/lib/renglones";
import type {
  PayloadService,
  ResultadoGuardado,
} from "@/app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/actions";
import { DOT_FORMATO, MEDIDA_FORMATO, validarNeumaticos } from "@/lib/ruedas";

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
  if (/descripcion_requerida/.test(error.message ?? "")) {
    return "Contá qué trabajo se hizo: es lo que va a ver tu cliente en su historial.";
  }
  if (/neumaticos_sin_trabajo/.test(error.message ?? "")) {
    return "Marcá al menos una rueda o la alineación: un trabajo vacío no se guarda.";
  }
  if (/medida_invalida/.test(error.message ?? "")) return MEDIDA_FORMATO;
  if (/dot_invalido/.test(error.message ?? "")) return DOT_FORMATO;
  if (/profundidad_invalida/.test(error.message ?? "")) {
    return "La profundidad de dibujo va en milímetros, de 0 a 25.";
  }
  if (/presion_invalida/.test(error.message ?? "")) {
    return "La presión va en PSI, de 10 a 120.";
  }
  if (/rueda_sin_posicion|rotacion_con_origen/.test(error.message ?? "")) {
    return "Marcá de qué posición venía cada cubierta rotada.";
  }
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

  const esMecanica = payload.tipo === "mecanica";
  const esNeumaticos = payload.tipo === "neumaticos";

  if (!payload.sucursalId) return { error: "Elegí la sucursal donde se hizo." };
  if (esMecanica) {
    if ((payload.trabajoDescripcion ?? "").trim().length < 5) {
      return {
        error: "Contá qué trabajo se hizo: es lo que va a ver tu cliente en su historial.",
      };
    }
  } else if (esNeumaticos) {
    // La MISMA validación que el alta: las dos escriben en service_ruedas.
    const problema = validarNeumaticos(payload);
    if (problema) return { error: problema };
  } else {
    if (
      payload.kilometros == null ||
      !Number.isFinite(payload.kilometros) ||
      payload.kilometros < 0
    ) {
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
    // El salto acotado también acá: la puerta al 100.000 de más se cierra
    // para el payload que no pasó por el cartón.
    if (!esSaltoValido(payload.proxServiceKm - payload.kilometros)) {
      return { error: SALTO_RANGO_ERROR };
    }
  }

  const supabase = await createClient();
  // actualizar_service NO recibe el tipo: lee el de la fila y valida
  // según corresponda. Acá solo viajan los campos.
  const { error } = await supabase.rpc("actualizar_service", {
    p_service_id: serviceId,
    p_sucursal_id: payload.sucursalId,
    p_fecha: payload.fecha,
    p_kilometros: payload.kilometros as number,
    p_aceite_tipo: (payload.tipo === "neumaticos" || esMecanica
      ? null
      : payload.aceiteTipo) as unknown as string,
    p_prox_service_km: (payload.tipo === "neumaticos" || esMecanica
      ? null
      : payload.proxServiceKm) as unknown as number,
    p_items: payload.items,
    p_aceite_producto_id: payload.aceiteProductoId ?? undefined,
    p_aceite_nombre: payload.aceiteNombre ?? undefined,
    p_observaciones: payload.observaciones ?? undefined,
    p_trabajo_descripcion: esMecanica
      ? (payload.trabajoDescripcion ?? "").trim()
      : undefined,
    p_aceite_litros:
      esMecanica || esNeumaticos ? undefined : (payload.aceiteLitros ?? undefined),
    // Gomería: las ruedas se REEMPLAZAN enteras (borrar e insertar). Una
    // rueda no tiene identidad propia para el mecánico — lo que edita es
    // cómo quedó el auto, no la fila 3.
    p_alineacion: esNeumaticos ? Boolean(payload.alineacion) : undefined,
    p_ruedas: esNeumaticos ? (payload.ruedas ?? []) : undefined,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/panel/services");
  revalidatePath(`/panel/services/${serviceId}`);
  revalidatePath("/panel/clientes");
  return { serviceId };
}
