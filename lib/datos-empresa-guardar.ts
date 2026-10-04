import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  MENSAJES_EMPRESA,
  leerCamposEmpresa,
  type EstadoEmpresa,
} from "@/lib/datos-empresa";

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: los datos que escribiste siguen acá. Probá de nuevo cuando vuelva la señal.";

// El guardado de los datos de la empresa, el mismo para las dos pantallas:
// Mi cuenta (el owner, sobre SU lubricentro) y la ficha de /fidelli (el
// superadmin, sobre el que se le pasa). La sesión la exige cada acción antes
// de llamar acá; el tenant lo decide la base —guardar_datos_empresa() toma
// el de la sesión y solo a Fidelli le acepta otro—, no este archivo.
export async function guardarEmpresa(
  formData: FormData,
  { lubricentroId, mensajeOk }: { lubricentroId?: string; mensajeOk: string },
): Promise<EstadoEmpresa> {
  const leido = leerCamposEmpresa(formData);
  if (!leido.ok) return { error: leido.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_datos_empresa", {
    p_datos: leido.campos,
    ...(lubricentroId ? { p_lubricentro_id: lubricentroId } : {}),
  });

  if (error) {
    if (/fetch|network|conexión/i.test(error.message)) return { error: SIN_CONEXION };
    return {
      error:
        MENSAJES_EMPRESA[error.message] ??
        "No se pudieron guardar los datos. Probá de nuevo en un momento.",
    };
  }
  return { ok: mensajeOk };
}
