"use server";

import { createClient } from "@/lib/supabase/server";

// SOLO LEE: el autocompletado de modelos. La resolución —incluido el piso
// de anonimato del nivel global (>=3 vehículos en >=2 lubricentros)— vive
// en modelos_sugeridos(), security definer en la base. Acá no llega ni un
// conteo: strings y un booleano de "es tuyo".
export async function sugerirModelos(
  marca: string | null,
): Promise<{ modelo: string; propio: boolean }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("modelos_sugeridos", {
    p_marca: marca?.trim() || undefined,
  });
  return (data ?? []).map((s) => ({
    modelo: s.modelo ?? "",
    propio: Boolean(s.propio),
  }));
}
