"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { aTemaPanel, type TemaPanel } from "@/lib/tema-panel";

export type ResultadoTema = { error?: string };

// Guarda el tema del panel de QUIEN está logueado. Es la única Server
// Action que escribe con obtenerSesion() y no con sesionParaEscribir(), a
// propósito: un lubricentro suspendido conserva el panel en solo lectura
// para SUS datos, y el tema no es un dato del tenant, es la preferencia de
// la persona que lo mira (vive en su fila de `usuarios`). La función de la
// base es definer con guarda y escribe únicamente la fila de auth.uid().
export async function fijarTemaPanel(tema: TemaPanel): Promise<ResultadoTema> {
  const sesion = await obtenerSesion();
  if (!sesion) return { error: "La sesión venció. Volvé a entrar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fijar_mi_tema", { p_tema: aTemaPanel(tema) });
  if (error) {
    return { error: "No se pudo guardar el modo. Probá de nuevo." };
  }

  // El atributo del wrapper lo pinta el layout desde la sesión: con la
  // revalidación, la próxima navegación ya sale en el tema nuevo (el
  // interruptor lo cambia en el acto en el DOM mientras tanto).
  revalidatePath("/panel", "layout");
  revalidatePath("/fidelli", "layout");
  return {};
}
