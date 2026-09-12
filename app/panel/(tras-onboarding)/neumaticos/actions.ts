"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import {
  CAMPOS_CONFIG_NEUMATICOS,
  type ConfigNeumaticos,
} from "@/lib/neumaticos/config";

export type EstadoConfigNeumaticos = { error?: string; ok?: string };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

// Los intervalos con los que el módulo avisa. La regla vive en la base
// —los CHECK de config_neumaticos acotan cada valor— y acá solo se le
// pone el mensaje en castellano ANTES de perder lo tipeado. El UPDATE va
// por RLS: escribir exige el propio tenant Y el módulo (WITH CHECK).
export async function guardarConfigNeumaticos(
  _prev: EstadoConfigNeumaticos,
  formData: FormData,
): Promise<EstadoConfigNeumaticos> {
  const sesion = await sesionParaEscribir("neumaticos");

  const valores = {} as ConfigNeumaticos;
  for (const campo of CAMPOS_CONFIG_NEUMATICOS) {
    const crudo = String(formData.get(campo.clave) ?? "").trim().replace(",", ".");
    const n = Number(crudo);
    if (crudo === "" || !Number.isFinite(n)) {
      return { error: `Cargá ${campo.etiqueta.toLowerCase()}.` };
    }
    // El beneficio se apaga con 0; el resto no admite ceros.
    const permitido =
      (campo.clave === "beneficio_km" && n === 0) ||
      (n >= campo.min && n <= campo.max);
    if (!permitido) return { error: campo.fueraDeRango };
    valores[campo.clave] = campo.decimal ? Math.round(n * 10) / 10 : Math.round(n);
  }

  const supabase = await createClient();
  // El .select() distingue el rechazo silencioso de RLS de un guardado real.
  const { data, error } = await supabase
    .from("config_neumaticos")
    .update({ ...valores, updated_at: new Date().toISOString() })
    .eq("lubricentro_id", sesion.lubricentroId)
    .select("lubricentro_id");

  if (error) {
    if (/fetch|network|conexión/i.test(error.message)) return { error: SIN_CONEXION };
    if (error.code === "23514") {
      return { error: "Algún valor quedó fuera de rango. Revisá los números y probá de nuevo." };
    }
    return { error: "No se pudieron guardar los intervalos. Probá de nuevo en un momento." };
  }
  if (!data || data.length === 0) {
    return { error: "No se pudieron guardar los intervalos: la base rechazó el cambio. Recargá la pantalla." };
  }

  // Los intervalos mueven "A quién llamar" y el badge del sidebar en vivo,
  // y el beneficio se ve en el papel del cliente.
  revalidatePath("/panel/neumaticos");
  revalidatePath("/panel/proximos");
  revalidatePath("/panel", "layout");
  revalidatePath("/[slug]/[patente]", "page");
  return { ok: "Listo, los intervalos quedaron guardados." };
}
