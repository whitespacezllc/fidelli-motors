"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");
  return sesion;
}

const MENSAJES: Record<string, string> = {
  periodo_incompleto: "Completá las dos fechas del período.",
  periodo_invertido: "El período termina antes de empezar. Revisá las fechas.",
  monto_invalido: "El monto tiene que ser un número de 0 para arriba.",
  fecha_pago_vacia: "Poné la fecha en que entró la transferencia.",
  sin_suscripcion:
    "Este lubricentro no tiene ninguna suscripción a la que imputar el pago.",
  sin_permiso_suscripcion:
    "El pago no se registró: la base rechazó el cambio de la suscripción.",
  service_no_desbloqueable:
    "Ese service ya no se puede desbloquear. Puede estar anulado, o alguien lo borró mientras mirabas la pantalla.",
  motivo_insuficiente:
    "Escribí el motivo con un poco más de detalle: es lo que queda registrado como justificación de la corrección.",
  patente_formato:
    "Esa patente no tiene un formato válido. Vieja (ABC 123) o Mercosur (AB 123 CD).",
  patente_sin_cambio: "La patente nueva es la misma que ya tiene el vehículo.",
  patente_ocupada:
    "Este lubricentro ya tiene otro auto con esa patente. Corregir a esa chapa uniría dos historiales — revisalo con el lubricentro antes de seguir.",
  vehiculo_no_existe:
    "Ese vehículo ya no existe. Recargá la pantalla y buscalo de nuevo.",
  periodo_valido: "El período termina antes de empezar. Revisá las fechas.",
};

function traducir(mensaje: string): string {
  if (/fetch|network|conexión|ECONNREFUSED/i.test(mensaje)) {
    return "Se cortó la conexión a internet. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, probá de nuevo.";
  }
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

// ============================================================
// Registrar un pago
//
// La transacción entera —el pago y el vencimiento nuevo— vive en
// registrar_pago(). Acá solo se leen los campos y se traduce el error: la
// firma de auditoría la pone la base con auth.uid(), no este formulario.
// ============================================================

export type EstadoPago = { error?: string; ok?: string };

export async function registrarPago(
  _prev: EstadoPago,
  formData: FormData,
): Promise<EstadoPago> {
  await exigirSuperadmin();

  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const desde = String(formData.get("periodo_desde") ?? "");
  const hasta = String(formData.get("periodo_hasta") ?? "");
  const fechaPago = String(formData.get("fecha_pago") ?? "");
  const monto = Number(formData.get("monto"));

  if (!desde || !hasta) return { error: MENSAJES.periodo_incompleto };
  if (!fechaPago) return { error: MENSAJES.fecha_pago_vacia };
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: MENSAJES.monto_invalido };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pago", {
    p_lubricentro_id: lubricentroId,
    p_periodo_desde: desde,
    p_periodo_hasta: hasta,
    p_monto: monto,
    p_fecha_pago: fechaPago,
  });

  if (error) return { error: traducir(error.message) };

  revalidatePath(`/fidelli/${lubricentroId}`);
  revalidatePath("/fidelli");
  return { ok: "Pago registrado. El vencimiento quedó actualizado." };
}

// ============================================================
// Desbloquear un service fijado
//
// Fidelli no corrige los datos del lubricentro: le devuelve la ventana
// para que los corrija él. Esa frontera es del producto, no del código
// —nosotros no tocamos la operación de nuestro cliente— y por eso esta es
// la única acción de escritura de toda la pestaña Datos.
//
// El vencimiento de la ventana lo calcula Postgres: ver el comentario de
// desbloquear_service() en la migración.
// ============================================================

export type EstadoDesbloqueo = { error?: string; ok?: boolean };

export async function desbloquearService(
  _prev: EstadoDesbloqueo,
  formData: FormData,
): Promise<EstadoDesbloqueo> {
  await exigirSuperadmin();

  const serviceId = String(formData.get("service_id") ?? "");
  const lubricentroId = String(formData.get("lubricentro_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("desbloquear_service", {
    p_service_id: serviceId,
  });

  if (error) return { error: traducir(error.message) };

  revalidatePath(`/fidelli/${lubricentroId}`);
  return { ok: true };
}


// ============================================================
// Corregir la patente de un vehículo — Nivel 2
//
// El lubricentro se autocorrige durante 72 horas desde el primer service.
// Pasado ese plazo, la patente solo la cambia esta puerta: superadmin, con
// un motivo que queda registrado en correcciones_patente ANTES de tocar el
// dato. La función de la base es la que hace cumplir las dos cosas — acá
// solo se traduce lo que responde.
// ============================================================

export type EstadoCorreccion = { error?: string; ok?: boolean };

export async function corregirPatente(
  _prev: EstadoCorreccion,
  formData: FormData,
): Promise<EstadoCorreccion> {
  await exigirSuperadmin();

  const vehiculoId = String(formData.get("vehiculo_id") ?? "");
  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const patenteNueva = String(formData.get("patente_nueva") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!patenteNueva) return { error: "Escribí la patente correcta." };
  if (motivo.length < 10) return { error: MENSAJES.motivo_insuficiente };

  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_patente", {
    p_vehiculo_id: vehiculoId,
    p_patente_nueva: patenteNueva,
    p_motivo: motivo,
  });

  if (error) return { error: traducir(error.message) };

  revalidatePath(`/fidelli/${lubricentroId}`);
  // La landing del cliente busca por patente: la vieja deja de existir.
  revalidatePath("/[slug]/[patente]", "page");
  return { ok: true };
}


// ============================================================
// El override de plan — la excepción por cuenta
//
// La UI hace read-modify-write del objeto COMPLETO: fijar_override_plan()
// REEMPLAZA el jsonb entero, así que acá llega el estado final con todas
// las claves que quedan vigentes. Mandar un parcial borraría las demás.
// La base valida forma, motivo y permisos, y deja el rastro en
// cambios_override_plan; esto solo traduce los errores nombrados.
// ============================================================

export type EstadoOverride = { error?: string; ok?: boolean };

export async function fijarOverridePlan(
  _prev: EstadoOverride,
  datos: {
    lubricentroId: string;
    overrides: Record<string, boolean | number | null>;
    motivo: string;
  },
): Promise<EstadoOverride> {
  await exigirSuperadmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("fijar_override_plan", {
    p_lubricentro: datos.lubricentroId,
    p_overrides: datos.overrides,
    p_motivo: datos.motivo,
  });

  if (error) {
    const m = error.message ?? "";
    if (m.includes("motivo_corto")) {
      return {
        error:
          "Contá por qué este tenant sale de su plan: mínimo 10 caracteres. Es lo que se lee en el historial dentro de seis meses.",
      };
    }
    if (m.includes("override_invalido")) {
      return {
        error:
          "Hay una clave o un valor que la base no reconoce. Recargá la ficha y probá de nuevo.",
      };
    }
    if (m.includes("lubricentro_no_existe")) {
      return { error: "Ese lubricentro ya no existe." };
    }
    return { error: "No se pudo guardar el override. Probá de nuevo." };
  }

  revalidatePath(`/fidelli/${datos.lubricentroId}`);
  return { ok: true };
}
