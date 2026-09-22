"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// obtenerSesion A PROPÓSITO, y no sesionParaEscribir(): aceptar los Términos
// no es escribir datos del taller, es un acto contractual que un tenant
// SUSPENDIDO también tiene que poder hacer — si no, el modal bloqueante lo
// dejaría encerrado sin salida. La base hace cumplir el resto:
// aceptar_terminos() resuelve el tenant y el usuario desde la sesión.
// eslint-disable-next-line no-restricted-imports
import { obtenerSesion } from "@/lib/auth/session";
import { VERSION_LEGAL } from "@/lib/legal";

export type EstadoAceptacion = { error?: string; ok?: boolean };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: cuando vuelva la señal, tocá Aceptar de nuevo.";

// ============================================================
// Aceptar la versión vigente de los Términos y la Política de Privacidad.
//
// La versión que se registra es VERSION_LEGAL —la que el servidor conoce—,
// nunca algo que venga del formulario. Al terminar, el layout del panel se
// revalida: la sesión vuelve a leer `aceptaciones_legales` con la versión
// adentro y el modal deja de renderizarse.
// ============================================================
export async function aceptarTerminos(
  _prev: EstadoAceptacion,
  formData: FormData,
): Promise<EstadoAceptacion> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  if (formData.get("acepto") !== "si") {
    return { error: "Marcá la casilla para confirmar que leíste los dos documentos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("aceptar_terminos", {
    p_version: VERSION_LEGAL,
  });

  if (error) {
    if (/fetch|network|conexión/i.test(error.message ?? "")) {
      return { error: SIN_CONEXION };
    }
    return { error: "No se pudo registrar la aceptación. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel", "layout");
  return { ok: true };
}
