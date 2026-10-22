"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { CUIT_FORMATO, normalizarCuit } from "@/lib/cuit";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";
import { hoyISO } from "@/lib/fechas";
import { esClaseVehiculo } from "@/lib/clase-vehiculo";

// Las dos búsquedas del momento 0 —la patente y el «¿De quién es?»— ya no
// son acciones: van del navegador a PostgREST (lib/busqueda-alta.ts). Acá
// quedan las dos escrituras del alta, que sí pasan por sesionParaEscribir().

export type EstadoAlta = { error?: string };

const DUPLICADO = "23505";
const CHECK_INVALIDO = "23514";
const YA_EXISTE = "Ya tenés un vehículo con esa patente.";

function traducirError(error: { code?: string; message?: string }): string {
  if (error.code === DUPLICADO) return YA_EXISTE;
  if (error.code === CHECK_INVALIDO) return PATENTE_FORMATO;
  if (/fetch|network|conexión/i.test(error.message ?? "")) {
    return "Se cortó la conexión. No cierres esta pantalla: lo que cargaste sigue acá.";
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

function leerVehiculo(formData: FormData) {
  const patente = String(formData.get("patente") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const anioTexto = String(formData.get("anio") ?? "").trim();
  // La clase, solo si es una de las dos: cualquier otra cosa (un
  // formulario viejo que no la manda, un valor inventado) queda en null,
  // que es "nunca se preguntó" — nunca se inventa un liviano.
  const claseTexto = formData.get("clase");
  const clase = esClaseVehiculo(claseTexto) ? claseTexto : null;

  // El año del calendario argentino: con el del proceso (UTC), el 31/12
  // a la noche el tope se corría un año antes de tiempo.
  const maximo = Number(hoyISO().slice(0, 4)) + 1;
  const anio = anioTexto ? Number(anioTexto) : null;
  const anioValido =
    anio === null || (Number.isInteger(anio) && anio >= 1900 && anio <= maximo);

  return { patente, marca, modelo, anio, anioValido, maximo, clase };
}

// Caso B: el cliente ya existe, se le suma el auto.
export async function crearVehiculoParaCliente(
  _prev: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  const sesion = await sesionParaEscribir();

  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!clienteId) return { error: "Elegí de quién es el auto." };

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) {
    return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehiculos")
    .insert({
      lubricentro_id: sesion.lubricentroId,
      cliente_id: clienteId,
      patente: v.patente,
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      clase: v.clase,
    })
    .select("id")
    .single();

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  redirect(`/panel/services/nuevo/${data.id}`);
}

// Caso C: cliente y vehículo nuevos. El alta va por la función de la base
// para que sea atómica: si la patente choca, el cliente tampoco se crea.
export async function crearClienteYVehiculo(
  _prev: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  await sesionParaEscribir();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const cuit = normalizarCuit(String(formData.get("cuit") ?? ""));

  if (nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }
  if (!telefono) {
    return {
      error: "Falta el teléfono. Es con lo que después vas a poder avisarle.",
    };
  }
  // Opcional, pero a medias no sirve para facturar: si escribió algo,
  // tienen que ser los 11 dígitos. El CHECK de la base rechazaría igual.
  if (cuit && cuit.length !== 11) {
    return { error: CUIT_FORMATO };
  }

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) {
    return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_cliente_con_vehiculo", {
    p_nombre: nombre,
    p_telefono: telefono,
    p_email: email,
    p_patente: v.patente,
    // Los parámetros con default en la función se tipan como opcionales:
    // omitirlos es lo que hace que tomen su default null.
    p_marca: v.marca ?? undefined,
    p_modelo: v.modelo ?? undefined,
    p_anio: v.anio ?? undefined,
    p_cuit: cuit || undefined,
    p_clase: v.clase ?? undefined,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/panel/clientes");
  redirect(`/panel/services/nuevo/${data}`);
}
