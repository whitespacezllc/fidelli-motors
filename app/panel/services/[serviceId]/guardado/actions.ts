"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type EstadoCanje = { error?: string; ok?: boolean };

// El canje se registra en mostrador, sin códigos: la plataforma deja
// constancia, el descuento lo aplica el lubri en su caja.
export async function marcarCanje(
  _prev: EstadoCanje,
  formData: FormData,
): Promise<EstadoCanje> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const vehiculoId = String(formData.get("vehiculo_id") ?? "");
  const premioId = String(formData.get("premio_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");

  if (!vehiculoId || !premioId) {
    return { error: "Falta el premio a canjear." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("canjes").insert({
    lubricentro_id: sesion.lubricentroId,
    vehiculo_id: vehiculoId,
    premio_id: premioId,
    service_id: serviceId || null,
  });

  if (error) {
    // El índice canjes_un_service evita el doble registro por doble toque.
    if (error.code === "23505") {
      return { error: "Este premio ya quedó registrado como canjeado." };
    }
    return { error: "No se pudo registrar el canje. Probá de nuevo." };
  }

  revalidatePath(`/panel/services/${serviceId}/guardado`);
  return { ok: true };
}
