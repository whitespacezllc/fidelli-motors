"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import {
  MENSAJES_CONFIG_FISCAL,
  leerConfigFiscal,
  type EstadoConfigFiscal,
} from "@/lib/facturacion/config";

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: lo que escribiste sigue acá. Probá de nuevo cuando vuelva la señal.";

// Guarda la config fiscal del tenant. sesionParaEscribir comprueba sesión,
// tenant, que no esté suspendido Y que tenga el módulo (redirige si no); el
// RLS de config_facturacion es la segunda capa (regla 1). El tenant lo pone
// la base desde la sesión.
export async function guardarConfigFiscal(
  _prev: EstadoConfigFiscal,
  formData: FormData,
): Promise<EstadoConfigFiscal> {
  await sesionParaEscribir("facturacion");

  const campos = leerConfigFiscal(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_config_facturacion", { p_datos: campos });

  if (error) {
    if (/fetch|network|conexión/i.test(error.message)) return { error: SIN_CONEXION };
    return {
      error:
        MENSAJES_CONFIG_FISCAL[error.message] ??
        "No se pudo guardar la configuración. Probá de nuevo en un momento.",
    };
  }

  revalidatePath("/panel/facturacion/config");
  return { ok: "Listo, guardamos tu configuración fiscal." };
}
