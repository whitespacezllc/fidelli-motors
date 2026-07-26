"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type EstadoPlan = { error?: string; ok?: boolean };

// Cambiar el precio de lista mueve la factura de TODOS los lubricentros a la
// vez: el descuento de cada uno es porcentual sobre la lista vigente, nunca
// un monto congelado. Por eso es una acción de superadmin y nada más.
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

  if (!Number.isFinite(precio) || precio < 0) {
    return { error: "El precio mensual tiene que ser un número de 0 para arriba." };
  }
  for (const [valor, cual] of [
    [semestral, "semestral"],
    [anual, "anual"],
  ] as const) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      return { error: `El descuento ${cual} va de 0 a 100.` };
    }
  }

  const supabase = await createClient();
  // .select() para poder distinguir un rechazo de RLS —que devuelve cero
  // filas sin error— de un guardado real.
  const { data, error } = await supabase
    .from("planes")
    .update({
      precio_mensual: precio,
      descuento_semestral_pct: semestral,
      descuento_anual_pct: anual,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    return { error: "No se pudo guardar el plan. Probá de nuevo en un momento." };
  }
  if (!data || data.length === 0) {
    return { error: "No se pudo guardar: la base rechazó el cambio." };
  }

  revalidatePath("/fidelli/precios");
  revalidatePath("/fidelli");
  return { ok: true };
}
