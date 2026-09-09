"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";

export type EstadoNota = { error?: string; ok?: boolean };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que escribiste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

// La ficha del cliente es la pantalla que administra las notas. La página
// pública no se revalida: consulta get_carton en cada visita.
function revalidar() {
  revalidatePath("/panel/clientes");
}

function leerCampos(formData: FormData) {
  return {
    contenido: String(formData.get("contenido") ?? "").trim(),
    // Radios explícitos, no checkbox: "visible" / "interna".
    visible: String(formData.get("visibilidad") ?? "visible") === "visible",
  };
}

export async function crearNota(
  _prev: EstadoNota,
  formData: FormData,
): Promise<EstadoNota> {
  const sesion = await sesionParaEscribir();

  const vehiculoId = String(formData.get("vehiculo_id") ?? "");
  const campos = leerCampos(formData);

  if (campos.contenido.length < 2) {
    return { error: "Escribí la nota antes de guardar." };
  }
  if (!vehiculoId) {
    return { error: "No sabemos de qué vehículo es esta nota. Recargá la pantalla." };
  }

  const supabase = await createClient();
  // El with check de RLS valida el tenant; usuario_id es quién firma.
  const { error } = await supabase.from("notas_vehiculo").insert({
    lubricentro_id: sesion.lubricentroId,
    vehiculo_id: vehiculoId,
    usuario_id: sesion.usuarioId,
    contenido: campos.contenido,
    visible_cliente: campos.visible,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    // FK de vehículo: el id no existe o es de otro lubricentro.
    if (error.code === "23503" || error.code === "42501") {
      return { error: "Ese vehículo no está en tu lubricentro. Recargá la pantalla." };
    }
    return { error: "No se pudo guardar la nota. Probá de nuevo en un momento." };
  }

  revalidar();
  return { ok: true };
}

export async function editarNota(
  _prev: EstadoNota,
  formData: FormData,
): Promise<EstadoNota> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const campos = leerCampos(formData);

  if (campos.contenido.length < 2) {
    return { error: "Escribí la nota antes de guardar." };
  }

  const supabase = await createClient();
  // El .select() convierte el rechazo silencioso de RLS en un error con
  // mensaje. created_at NO está en el SET: la fecha pública no se mueve.
  const { data, error } = await supabase
    .from("notas_vehiculo")
    .update({
      contenido: campos.contenido,
      visible_cliente: campos.visible,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar la nota. Probá de nuevo en un momento." };
  }
  if (!data || data.length === 0) {
    return { error: "Esa nota ya no existe. Recargá la pantalla." };
  }

  revalidar();
  return { ok: true };
}

// Las notas SÍ se eliminan — a diferencia de los services, que se anulan.
// Una nota es una recomendación, no el registro histórico de algo que pasó.
export async function eliminarNota(
  _prev: EstadoNota,
  formData: FormData,
): Promise<EstadoNota> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_vehiculo")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (esErrorDeRed(error)) {
      return { error: "Sin conexión a internet. Revisá la señal y probá de nuevo." };
    }
    return { error: "No se pudo borrar la nota. Probá de nuevo en un momento." };
  }
  if (!data || data.length === 0) {
    return { error: "Esa nota ya no existe. Recargá la pantalla." };
  }

  revalidar();
  return { ok: true };
}
