"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { NOMBRE_TRABAJO } from "@/lib/trabajos";
import { plazoEdicionConArticulo } from "@/lib/servicios";

export type ResultadoAnulado = { error?: string };

// Anular usa el campo `anulado`, nunca DELETE: los datos históricos no se
// borran. La misma policy de UPDATE que limita la edición limita esto —
// si es editable, es anulable; si está fijado, la base lo rechaza.
export async function anularService(
  serviceId: string,
): Promise<ResultadoAnulado> {
  await sesionParaEscribir();

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
    // El plazo que venció es el del tipo —24 horas, o 7 días en una
    // mecánica— y la fila no volvió, así que se lee aparte: la lectura
    // no la recorta la policy de UPDATE.
    const { data: fila } = await supabase
      .from("services")
      .select("tipo")
      .eq("id", serviceId)
      .maybeSingle();
    const tipo = fila?.tipo ?? "service";
    return {
      error: `Este ${NOMBRE_TRABAJO[tipo]} se fijó: pasaron ${plazoEdicionConArticulo(tipo)} y ya no se puede anular. Si hay un error grave, escribinos.`,
    };
  }

  revalidatePath("/panel/services");
  revalidatePath(`/panel/services/${serviceId}`);
  revalidatePath("/panel");
  const clienteId = data[0].vehiculos?.cliente_id;
  if (clienteId) revalidatePath(`/panel/clientes/${clienteId}`);

  return {};
}
