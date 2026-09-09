"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { leerEstadoOnboarding } from "@/lib/onboarding/estado";

// Las acciones del onboarding. Ninguna carga datos por su cuenta: los
// productos y los premios se guardan con las acciones de siempre
// (productos/actions, fidelizacion/actions) y la base evalúa sola al
// escribir (triggers onboarding_productos / onboarding_premios). Lo que sí
// escriben —confirmar el diseño, omitir el premio, marcar la bienvenida—
// va por funciones definer: el owner no puede tocar `lubricentros` directo
// por RLS.

export type ResultadoPaso = { completado: boolean; error?: string };

const NO_SE_PUDO = "No se pudo guardar el avance. Probá de nuevo en un momento.";

function resultado(crudo: unknown): ResultadoPaso {
  const estado = leerEstadoOnboarding(crudo);
  return { completado: estado?.completadoAt !== null && estado?.completadoAt !== undefined };
}

// Los layouts del panel leen el onboarding desde la sesión; con el paso
// hecho, el siguiente render tiene que verlo.
function revalidar() {
  revalidatePath("/panel/onboarding");
  revalidatePath("/panel", "layout");
}

/**
 * Vuelve a evaluar el onboarding. Los pasos 1 y 3 no la necesitan —los
 * triggers de productos y premios evalúan al escribir—; la usa el botón del
 * caso raro (PasoFinal): todo hecho por los datos, sin completar.
 */
export async function registrarPasoHecho(): Promise<ResultadoPaso> {
  await sesionParaEscribir();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("completar_onboarding");
  if (error) return { completado: false, error: NO_SE_PUDO };
  revalidar();
  return resultado(data);
}

/** Paso 2: guardó el diseño, o "Así está bien". */
export async function confirmarDiseno(): Promise<ResultadoPaso> {
  await sesionParaEscribir();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirmar_diseno");
  if (error) return { completado: false, error: NO_SE_PUDO };
  revalidar();
  return resultado(data);
}

/** Paso 3: "Omitir por ahora". Sin confirmación: se define después desde Fidelización. */
export async function omitirPremio(): Promise<ResultadoPaso> {
  await sesionParaEscribir("premios");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("omitir_premio");
  if (error) return { completado: false, error: NO_SE_PUDO };
  revalidar();
  return resultado(data);
}

/**
 * La bienvenida ya se mostró: no se repite, ni recargando a mitad.
 *
 * SIN revalidatePath A PROPÓSITO: una revalidación en la respuesta de la
 * acción hace que Next refresque la página en el acto, y el telón —que se
 * monta justo con esta acción— se desmontaría a los dos segundos, antes de
 * levantarse. La próxima navegación lee la marca fresca igual.
 */
export async function marcarBienvenidaVista(): Promise<void> {
  await sesionParaEscribir();
  const supabase = await createClient();
  await supabase.rpc("marcar_bienvenida_vista");
}
