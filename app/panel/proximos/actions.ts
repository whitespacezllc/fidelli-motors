"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import type { EstadoContacto } from "@/lib/contacto";

export type ResultadoContacto = { error?: string };

// El check se marca al ABRIR WhatsApp, no al enviar: es la decisión del
// flow y es la única verificable — si el mensaje se envió o no pasa en una
// app que no controlamos.
//
// La regla de un contacto por estado la resuelve la vista, no esta acción:
// registrar dos veces el mismo estado no rompe nada (la vista usa exists),
// pero se evita igual el insert redundante.
export async function registrarContacto(
  vehiculoId: string,
  estado: EstadoContacto,
  canal: "whatsapp" | "manual" = "whatsapp",
): Promise<ResultadoContacto> {
  const sesion = await sesionParaEscribir();

  const supabase = await createClient();
  const { error } = await supabase.from("contactos").insert({
    lubricentro_id: sesion.lubricentroId,
    vehiculo_id: vehiculoId,
    usuario_id: sesion.usuarioId,
    estado,
    canal,
  });

  if (error) {
    return {
      error: "No se pudo registrar el contacto. El mensaje se abrió igual.",
    };
  }

  revalidatePath("/panel/proximos");
  revalidatePath("/panel");
  return {};
}

// Destildar: borra los contactos de ESE estado posteriores al último
// service, que son exactamente los que la vista mira para el check.
// Cubre los dos casos reales: el tap accidental y el que quiere volver a
// contactar. Marcar a mano registra canal 'manual' — el llamado telefónico
// hecho por afuera del sistema.
export async function alternarContacto(
  vehiculoId: string,
  estado: EstadoContacto,
  contactado: boolean,
): Promise<ResultadoContacto> {
  await sesionParaEscribir();

  if (!contactado) return registrarContacto(vehiculoId, estado, "manual");

  const supabase = await createClient();

  // El último service acota el borrado igual que la vista acota el exists:
  // los contactos de ciclos anteriores son historial y no se tocan.
  const { data: ultimo } = await supabase
    .from("services")
    .select("fecha")
    .eq("vehiculo_id", vehiculoId)
    .eq("anulado", false)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let consulta = supabase
    .from("contactos")
    .delete()
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", estado);

  if (ultimo?.fecha) consulta = consulta.gt("created_at", ultimo.fecha);

  const { error } = await consulta;
  if (error) {
    return { error: "No se pudo destildar el contacto. Probá de nuevo." };
  }

  revalidatePath("/panel/proximos");
  revalidatePath("/panel");
  return {};
}
