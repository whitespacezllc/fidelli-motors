"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type EstadoPlan = { error?: string; ok?: boolean };

// El motivo de un cambio de precio de lista es obligatorio EN LA BASE
// (fijar_precio_plan lo exige con un mínimo de 10 caracteres). Acá se
// repite el mínimo solo para avisar antes del viaje, igual que
// lib/texto.ts repite el formato de patente: la fuente de verdad es SQL.
const MOTIVO_MINIMO = 10;

const AYUDA_MOTIVO =
  "Contá por qué se mueve el precio: mínimo 10 caracteres. Dentro de un año, con un cliente preguntando por qué paga lo que paga, esta línea es la única respuesta.";

function validarNumeros(
  precio: number,
  descuentos: [number, string][],
): string | null {
  if (!Number.isFinite(precio) || precio < 0) {
    return "El precio mensual tiene que ser un número de 0 para arriba.";
  }
  for (const [valor, cual] of descuentos) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      return `El descuento ${cual} va de 0 a 100.`;
    }
  }
  return null;
}

// Traduce el rechazo de la base a algo que se pueda leer. Los dos errores
// con nombre los levanta fijar_precio_plan(); `precio_solo_por_funcion` lo
// levanta el candado y significa que alguien llegó por otra puerta.
function mensajeDeError(error: { message?: string } | null): string {
  const m = error?.message ?? "";
  if (m.includes("motivo_corto")) return AYUDA_MOTIVO;
  if (m.includes("precio_solo_por_funcion")) {
    return "El precio se cambió por fuera de la puerta oficial y la base lo rechazó. Avisá: es un bug, no un permiso.";
  }
  if (m.includes("42501") || m.toLowerCase().includes("solo el equipo")) {
    return "Solo el equipo Fidelli puede mover un precio de lista.";
  }
  return "No se pudo guardar el precio. Probá de nuevo en un momento.";
}

// Cambiar el precio de lista mueve la factura de TODOS los lubricentros a la
// vez: el descuento de cada uno es porcentual sobre la lista vigente, nunca
// un monto congelado. Por eso es una acción de superadmin y nada más — y por
// eso desde septiembre de 2026 deja rastro con autor, fecha y motivo en
// `cambios_precio_catalogo`. No se puede pasar por arriba: un UPDATE suelto
// sobre las columnas de plata lo rechaza el candado de la base.
export async function guardarPlan(
  _prev: EstadoPlan,
  formData: FormData,
): Promise<EstadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");

  const id = String(formData.get("id") ?? "");
  const precio = Number(formData.get("precio_mensual"));
  const semestral = Number(formData.get("descuento_semestral_pct"));
  const anual = Number(formData.get("descuento_anual_pct"));
  const motivo = String(formData.get("motivo") ?? "").trim();

  const problema = validarNumeros(precio, [
    [semestral, "semestral"],
    [anual, "anual"],
  ]);
  if (problema) return { error: problema };

  if (motivo.length < MOTIVO_MINIMO) return { error: AYUDA_MOTIVO };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fijar_precio_plan", {
    p_plan: id,
    p_precio: precio,
    p_semestral: semestral,
    p_anual: anual,
    p_motivo: motivo,
  });

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/fidelli/precios");
  revalidatePath("/fidelli");
  return { ok: true };
}

// El precio de un módulo pago. Mismo contrato que el de un plan: superadmin,
// motivo obligatorio y rastro. El DERECHO al módulo no se toca acá — eso
// sigue siendo el override de plan y su motivo, en la ficha del tenant.
export async function guardarModulo(
  _prev: EstadoPlan,
  formData: FormData,
): Promise<EstadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");

  const id = String(formData.get("id") ?? "");
  const precio = Number(formData.get("precio_mensual"));
  const motivo = String(formData.get("motivo") ?? "").trim();

  const problema = validarNumeros(precio, []);
  if (problema) return { error: problema };

  if (motivo.length < MOTIVO_MINIMO) return { error: AYUDA_MOTIVO };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fijar_precio_modulo", {
    p_modulo: id,
    p_precio: precio,
    p_motivo: motivo,
  });

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/fidelli/precios");
  revalidatePath("/fidelli");
  return { ok: true };
}
