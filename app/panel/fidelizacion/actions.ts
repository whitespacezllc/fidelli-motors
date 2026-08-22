"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { META_MINIMA, META_MAXIMA } from "@/lib/fidelizacion";

export type EstadoPremio = { error?: string; ok?: boolean };

// Un solo programa por lubricentro: el índice único parcial
// premios_uno_activo lo garantiza en la base. Por eso el formulario edita
// la fila que ya existe en vez de crear una nueva cada vez — así apagar y
// volver a encender el programa no choca contra el índice, y no se
// acumulan filas muertas que además romperían el FK de canjes.
export async function guardarPremio(
  _previo: EstadoPremio,
  formData: FormData,
): Promise<EstadoPremio> {
  // "premios" es el cuarto chequeo: sin la feature, la acción ni llega a
  // la base — redirige a la sección, donde BloqueoPlan explica qué pasa.
  const sesion = await sesionParaEscribir("premios");

  const meta = Number(formData.get("meta"));
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const activo = formData.get("activo") === "on";

  if (!Number.isInteger(meta) || meta < META_MINIMA || meta > META_MAXIMA) {
    return {
      error: `La meta va de ${META_MINIMA} a ${META_MAXIMA} services. Elegí cuántos tiene que hacer el cliente para ganarse el premio.`,
    };
  }
  if (descripcion.length < 3) {
    return {
      error: "Escribí qué se lleva el cliente. Por ejemplo: 25% de descuento en el próximo service.",
    };
  }

  const supabase = await createClient();

  // La fila del programa, exista activa o apagada. RLS filtra por tenant.
  const { data: existente } = await supabase
    .from("premios")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = existente
    ? await supabase
        .from("premios")
        .update({ meta_services: meta, descripcion, activo })
        .eq("id", existente.id)
    : await supabase.from("premios").insert({
        lubricentro_id: sesion.lubricentroId,
        meta_services: meta,
        descripcion,
        activo,
      });

  if (error) {
    // 23505 = el índice único de "un solo premio activo". Solo puede pasar
    // si otra pestaña creó uno en el medio: se dice el hecho, no el código.
    if (error.code === "23505") {
      return {
        error: "Ya hay otro premio activo. Recargá la pantalla para ver el que quedó vigente.",
      };
    }
    if (error.code === "23514") {
      return { error: `La meta va de ${META_MINIMA} a ${META_MAXIMA} services.` };
    }
    // 42501 = lo rechazó la policy de RLS. Es el cinturón de la base: solo
    // se ve si alguien saltea el chequeo de arriba — pero aun así el error
    // tiene que decir el hecho, no "row-level security".
    if (error.code === "42501") {
      return { error: "Fidelliza no está en tu plan. Escribinos si lo querés activar." };
    }
    return { error: "No se pudo guardar el premio. Probá de nuevo." };
  }

  // El premio cambia lo que ve el cliente y lo que calcula el panel: se
  // revalidan las dos superficies.
  revalidatePath("/panel/fidelizacion");
  revalidatePath("/panel");
  revalidatePath("/panel/clientes");
  return { ok: true };
}
