"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { CUIT_FORMATO, normalizarCuit } from "@/lib/cuit";

export type EstadoCliente = { error?: string; ok?: boolean };

// El error de guardado avisa que no cierre el dialog: sin borradores locales,
// el formulario abierto es lo único que conserva lo que ya se escribió.
const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

type Campos =
  | {
      ok: true;
      nombre: string;
      telefono: string;
      email: string | null;
      cuit: string | null;
    }
  | { ok: false; error: string };

function leerCampos(formData: FormData): Campos {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const cuit = normalizarCuit(String(formData.get("cuit") ?? "")) || null;

  if (nombre.length < 2) {
    return { ok: false, error: "El nombre necesita al menos 2 caracteres." };
  }
  if (!telefono) {
    return {
      ok: false,
      error: "Falta el teléfono. Es con lo que después vas a poder avisarle.",
    };
  }
  // El CUIT es opcional, pero a medias no sirve para facturar: si se
  // escribió algo, tienen que ser los 11 dígitos (el CHECK de la base
  // rechazaría igual). El verificador NO bloquea — el form ya avisó.
  if (cuit && cuit.length !== 11) {
    return { ok: false, error: CUIT_FORMATO };
  }
  // El email no se valida con formato ni bloquea la carga: es opcional a
  // propósito y un dato imperfecto es mejor que un alta trabada.
  return { ok: true, nombre, telefono, email, cuit };
}

export async function crearCliente(
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const sesion = await sesionParaEscribir();

  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  // RLS verifica el tenant en el with check; el id sale de la sesión.
  const { error } = await supabase.from("clientes").insert({
    lubricentro_id: sesion.lubricentroId,
    nombre: campos.nombre,
    telefono: campos.telefono,
    email: campos.email,
    cuit: campos.cuit,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el cliente. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/clientes");
  return { ok: true };
}

export async function editarCliente(
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre: campos.nombre,
      telefono: campos.telefono,
      email: campos.email,
      cuit: campos.cuit,
    })
    .eq("id", id);

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el cliente. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/clientes");
  revalidatePath(`/panel/clientes/${id}`);
  return { ok: true };
}
