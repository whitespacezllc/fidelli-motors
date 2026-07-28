"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";

export type EstadoMensaje = { error?: string; ok?: boolean };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que escribiste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

// Las pantallas que dependen del template activo: la propia, y el panel de
// próximos que arma los WhatsApp con él.
function revalidar() {
  revalidatePath("/panel/mensajes");
  revalidatePath("/panel/proximos");
}

function leerCampos(formData: FormData) {
  return {
    tono: String(formData.get("tono") ?? "").trim(),
    contenido: String(formData.get("contenido") ?? "").trim(),
  };
}

function validar(campos: { tono: string; contenido: string }): string | null {
  if (campos.tono.length < 2) {
    return "Poné un nombre al tono (por ejemplo: Cercano, Formal).";
  }
  if (campos.contenido.length < 10) {
    return "El mensaje quedó muy corto. Escribí el texto que le va a llegar a tu cliente.";
  }
  return null;
}

export async function crearMensaje(
  _prev: EstadoMensaje,
  formData: FormData,
): Promise<EstadoMensaje> {
  const sesion = await sesionParaEscribir();

  const campos = leerCampos(formData);
  const invalido = validar(campos);
  if (invalido) return { error: invalido };

  const supabase = await createClient();
  // Nace inactivo: activarlo es una decisión aparte, con su propio tap.
  const { error } = await supabase.from("mensaje_templates").insert({
    lubricentro_id: sesion.lubricentroId,
    tono: campos.tono,
    contenido: campos.contenido,
    activo: false,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el mensaje. Probá de nuevo en un momento." };
  }

  revalidar();
  return { ok: true };
}

export async function editarMensaje(
  _prev: EstadoMensaje,
  formData: FormData,
): Promise<EstadoMensaje> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const campos = leerCampos(formData);
  const invalido = validar(campos);
  if (invalido) return { error: invalido };

  const supabase = await createClient();
  // El .select() distingue el rechazo silencioso de RLS de un guardado real.
  const { data, error } = await supabase
    .from("mensaje_templates")
    .update({ tono: campos.tono, contenido: campos.contenido })
    .eq("id", id)
    .select("id");

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el mensaje. Probá de nuevo en un momento." };
  }
  if (!data || data.length === 0) {
    return { error: "Ese mensaje ya no existe. Recargá la pantalla." };
  }

  revalidar();
  return { ok: true };
}

// Activar uno desactiva el vigente: las dos escrituras van juntas en
// activar_template(), que es una transacción — si fueran dos updates desde
// acá y el segundo fallara, el tenant quedaría sin ningún mensaje activo y
// el botón de WhatsApp de próximos moriría.
export async function activarMensaje(id: string): Promise<EstadoMensaje> {
  await sesionParaEscribir();

  const supabase = await createClient();
  const { error } = await supabase.rpc("activar_template", {
    p_template_id: id,
  });

  if (error) {
    if (esErrorDeRed(error)) {
      return { error: "Sin conexión a internet. Revisá la señal y probá de nuevo." };
    }
    if (error.message.includes("template_no_existe")) {
      return { error: "Ese mensaje ya no existe. Recargá la pantalla." };
    }
    return { error: "No se pudo activar el mensaje. Probá de nuevo en un momento." };
  }

  revalidar();
  return { ok: true };
}

export async function eliminarMensaje(
  _prev: EstadoMensaje,
  formData: FormData,
): Promise<EstadoMensaje> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  // El activo no se borra: sin él, el botón de WhatsApp de próximos muere.
  // Mismo criterio que la última sucursal activa. La comprobación va sobre
  // la fila real, no sobre lo que dice la pantalla.
  const { data: actual } = await supabase
    .from("mensaje_templates")
    .select("activo")
    .eq("id", id)
    .maybeSingle();

  if (!actual) return { error: "Ese mensaje ya no existe. Recargá la pantalla." };
  if (actual.activo) {
    return {
      error:
        "Este es el mensaje que está en uso. Activá otro primero y después borralo.",
    };
  }

  const { error } = await supabase
    .from("mensaje_templates")
    .delete()
    .eq("id", id);

  if (error) {
    if (esErrorDeRed(error)) {
      return { error: "Sin conexión a internet. Revisá la señal y probá de nuevo." };
    }
    return { error: "No se pudo borrar el mensaje. Probá de nuevo en un momento." };
  }

  revalidar();
  return { ok: true };
}
