import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión en cada request: lee las cookies de auth, renueva el token
// si está por vencer y reescribe las cookies en la respuesta. Sin esto, un token
// vencido puede desloguear al usuario en medio de una navegación con SSR.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Con Fluid compute: no guardar este cliente en una global. Uno nuevo por request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No poner código entre createServerClient y getClaims(): un error en el medio
  // es dificilísimo de debuggear (usuarios deslogueados al azar).
  // IMPORTANTE: getClaims() es lo que fuerza el refresco del token. No sacarlo.
  // La protección de rutas por rol (owner / superadmin) es trabajo del sprint,
  // no de este setup: acá solo se refresca la sesión.
  await supabase.auth.getClaims();

  // IMPORTANTE: devolver supabaseResponse tal cual. Si se arma otra respuesta,
  // hay que copiarle las cookies o el browser y el server se desincronizan y se
  // corta la sesión del usuario.
  return supabaseResponse;
}
