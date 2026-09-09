"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";

export type EstadoSucursal = { error?: string; ok?: boolean };

// El error de guardado avisa que no cierre el dialog: sin borradores locales,
// el formulario abierto es lo único que salva lo que ya se escribió.
const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

// PostgREST no expone name/status en errores de red: se detecta por el mensaje.
function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

function leerCampos(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim() || null,
    telefono: String(formData.get("telefono") ?? "").trim() || null,
    horarios: String(formData.get("horarios") ?? "").trim() || null,
  };
}

export async function crearSucursal(
  _prev: EstadoSucursal,
  formData: FormData,
): Promise<EstadoSucursal> {
  const sesion = await sesionParaEscribir();
  // El tope por plan lo hace cumplir la BASE (policy de INSERT + trigger de
  // reactivación). Acá solo se prepara el mensaje: el límite ya vino
  // resuelto con la sesión, sin ninguna consulta extra.
  const limiteSucursales = sesion.capacidades?.limites.sucursales ?? null;

  const campos = leerCampos(formData);
  if (campos.nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  // RLS verifica el tenant en el with check; el id sale de la sesión.
  const { error } = await supabase.from("sucursales").insert({
    lubricentro_id: sesion.lubricentroId,
    ...campos,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    // La policy de INSERT rechaza la sucursal que pasa el tope del plan.
    if (error.code === "42501") {
      return {
        error: `Tu plan permite ${limiteSucursales ?? "?"} sucursal(es) activa(s) y ya las tenés. Desactivá una o escribinos para ampliar el plan.`,
      };
    }
    return { error: "No se pudo guardar la sucursal. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/sucursales");
  return { ok: true };
}

export async function editarSucursal(
  _prev: EstadoSucursal,
  formData: FormData,
): Promise<EstadoSucursal> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const campos = leerCampos(formData);
  if (campos.nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sucursales")
    .update(campos)
    .eq("id", id);

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar la sucursal. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/sucursales");
  return { ok: true };
}

export async function toggleSucursal(
  _prev: EstadoSucursal,
  formData: FormData,
): Promise<EstadoSucursal> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const activar = formData.get("activar") === "true";

  const supabase = await createClient();

  // Sin ninguna sucursal activa no se pueden cargar services: la última no se apaga.
  if (!activar) {
    const { count } = await supabase
      .from("sucursales")
      .select("id", { count: "exact", head: true })
      .eq("activa", true);

    if ((count ?? 0) <= 1) {
      return {
        error: "Necesitás al menos una sucursal activa para poder cargar services.",
      };
    }
  }

  const { error } = await supabase
    .from("sucursales")
    .update({ activa: activar })
    .eq("id", id);

  if (error) {
    if (esErrorDeRed(error)) {
      return { error: "Sin conexión a internet. Revisá la señal y probá de nuevo." };
    }
    // El trigger de la base rechaza reactivar por encima del tope del plan.
    if (/limite_sucursales/.test(error.message ?? "")) {
      return {
        error: "Reactivarla te pasaría del límite de sucursales de tu plan. Desactivá otra primero o escribinos para ampliarlo.",
      };
    }
    return { error: "No se pudo cambiar el estado. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/sucursales");
  return { ok: true };
}
