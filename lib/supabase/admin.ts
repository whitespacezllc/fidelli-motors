import "server-only";

import { createClient as crearClienteSupabase } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// ============================================================
// El cliente con la clave service_role.
//
// Bypassea RLS por completo: cualquier consulta hecha con esto ve y
// escribe los datos de TODOS los lubricentros. Existe por una sola
// razón — la API de administración de Auth (invitar un owner) no
// acepta la clave anónima.
//
// LAS REGLAS, y no son negociables:
//
//   1. `import "server-only"` arriba de todo. Si alguien importa
//      este archivo desde un componente de cliente, el build
//      FALLA — no es un comentario pidiendo cuidado, es un error
//      de compilación. La clave nunca puede terminar en un bundle
//      del browser.
//
//   2. La variable NO lleva prefijo NEXT_PUBLIC_. Ese prefijo es
//      exactamente lo que inlinea el valor en el JavaScript que se
//      manda al celular del cliente.
//
//   3. Se usa para Auth admin, no para leer datos. Todo lo demás
//      va por createClient() de lib/supabase/server.ts, con la
//      sesión del usuario y su RLS. Si una consulta "necesita"
//      service_role para funcionar, casi siempre lo que falta es
//      una policy, no la clave.
//
// Sin persistencia de sesión ni refresco de token: es una llamada
// de servidor sin usuario detrás.
// ============================================================

export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clave) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. Sin esa clave no se puede invitar al owner.",
    );
  }

  return crearClienteSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    clave,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
