"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";

export type EstadoVehiculo = { error?: string; ok?: boolean };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

// El índice vehiculos_patente_por_tenant es el que dispara este código.
const DUPLICADO = "23505";
// El CHECK patente_formato. No debería llegar acá porque el formulario ya
// valida, pero si llega se traduce igual y no se muestra la excepción cruda.
const CHECK_INVALIDO = "23514";

const YA_EXISTE = "Ya tenés un vehículo con esa patente.";

function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

type Campos =
  | {
      ok: true;
      patente: string;
      marca: string | null;
      modelo: string | null;
      anio: number | null;
    }
  | { ok: false; error: string };

function leerCampos(formData: FormData): Campos {
  const patente = String(formData.get("patente") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const anioTexto = String(formData.get("anio") ?? "").trim();

  if (!esPatenteValida(patente)) {
    return { ok: false, error: PATENTE_FORMATO };
  }

  let anio: number | null = null;
  if (anioTexto) {
    const maximo = new Date().getFullYear() + 1;
    anio = Number(anioTexto);
    if (!Number.isInteger(anio) || anio < 1900 || anio > maximo) {
      return {
        ok: false,
        error: `El año tiene que estar entre 1900 y ${maximo}.`,
      };
    }
  }

  // La patente va tal como la escribió el mecánico: patente_normalizada la
  // calcula el trigger de la base, no el front.
  return { ok: true, patente, marca, modelo, anio };
}

function traducirError(error: { code?: string; message?: string }): string {
  if (error.code === DUPLICADO) return YA_EXISTE;
  if (error.code === CHECK_INVALIDO) return PATENTE_FORMATO;
  if (esErrorDeRed(error)) return SIN_CONEXION;
  return "No se pudo guardar el vehículo. Probá de nuevo en un momento.";
}

export async function crearVehiculo(
  _prev: EstadoVehiculo,
  formData: FormData,
): Promise<EstadoVehiculo> {
  const sesion = await sesionParaEscribir();

  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!clienteId) return { error: "Falta el cliente al que pertenece el auto." };

  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  // El tenant sale de la sesión (la policy lo verifica en el with check) y el
  // dueño, de la ficha donde se está cargando.
  const { error } = await supabase.from("vehiculos").insert({
    lubricentro_id: sesion.lubricentroId,
    cliente_id: clienteId,
    patente: campos.patente,
    marca: campos.marca,
    modelo: campos.modelo,
    anio: campos.anio,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  revalidatePath("/panel/clientes");
  return { ok: true };
}

export async function editarVehiculo(
  _prev: EstadoVehiculo,
  formData: FormData,
): Promise<EstadoVehiculo> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "");
  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  // No se cambia el dueño: reasignar un vehículo a otro cliente no es MVP.
  const { error } = await supabase
    .from("vehiculos")
    .update({
      patente: campos.patente,
      marca: campos.marca,
      modelo: campos.modelo,
      anio: campos.anio,
    })
    .eq("id", id);

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  revalidatePath("/panel/clientes");
  return { ok: true };
}
