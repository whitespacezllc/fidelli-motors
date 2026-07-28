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
