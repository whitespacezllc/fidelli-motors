import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de Supabase para Server Components y Server Actions.
// Importante con Fluid compute: no guardar este cliente en una variable global.
// Siempre crear uno nuevo dentro de cada función donde se use.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll se llamó desde un Server Component, que no puede escribir
            // cookies. Se puede ignorar: el refresco de la sesión lo hace el proxy.
          }
        },
      },
    },
  );
}
