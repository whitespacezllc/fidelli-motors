"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type ResultadoAnulado = { error?: string };

// Anular usa el campo `anulado`, nunca DELETE: los datos históricos no se
// borran. La misma policy de UPDATE que limita la edición limita esto —
// si es editable, es anulable; si está fijado, la base lo rechaza.
export async function anularService(
  serviceId: string,
): Promise<ResultadoAnulado> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const supabase = await createClient();

  // RLS no lanza error cuando rechaza: filtra la fila y el UPDATE afecta
  // 0 filas. El select de vuelta es lo que distingue "anulado" de
  // "la ventana venció mientras la pantalla estaba abierta".
  const { data, error } = await supabase
    .from("services")
    .update({ anulado: true })
    .eq("id", serviceId)
    .eq("anulado", false)
    .select("id, vehiculos(patente_normalizada, cliente_id)");

  if (error) {
    return {
      error:
        "No se pudo anular el service. Revisá la conexión y probá de nuevo.",
    };
  }

  if (!data || data.length === 0) {
    return {
      error:
        "Este service se fijó: pasaron las 24 horas y ya no se puede anular. Si hay un error grave, escribinos.",
    };
  }

  revalidatePath("/panel/services");
  revalidatePath(`/panel/services/${serviceId}`);
  revalidatePath("/panel");
  const clienteId = data[0].vehiculos?.cliente_id;
  if (clienteId) revalidatePath(`/panel/clientes/${clienteId}`);

  return {};
}
