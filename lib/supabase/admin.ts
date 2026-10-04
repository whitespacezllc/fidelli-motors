import "server-only";

import { createClient as crearClienteSupabase } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// ============================================================
// El cliente con la clave service_role.
//
// Bypassea RLS por completo: cualquier consulta hecha con esto ve y
// escribe los datos de TODOS los lubricentros. Nació por una sola
// razón — la API de administración de Auth (invitar un owner) no
// acepta la clave anónima — y sus usos siguen contados: esa
// invitación; los crons (el cierre diario y los avisos), que no
// tienen un usuario detrás; y la ruta pública del adjunto de un
// trabajo (app/(cliente)/[slug]/[patente]/adjunto/[id]), que firma
// por 60 segundos un archivo que `anon` no puede leer, DESPUÉS de que
// adjunto_publico() lo autoriza, y no lee ni escribe nada más.
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
//   3. No se usa para leer datos de una pantalla. Todo lo demás
//      va por createClient() de lib/supabase/server.ts, con la
//      sesión del usuario y su RLS. Si una consulta "necesita"
//      service_role para funcionar, casi siempre lo que falta es
//      una policy, no la clave. Un uso nuevo se anota arriba.
//
// Sin persistencia de sesión ni refresco de token: es una llamada
// de servidor sin usuario detrás.
// ============================================================

export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clave) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. Sin esa clave no se puede invitar al owner, ni correr los crons, ni abrirle un adjunto al cliente.",
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
