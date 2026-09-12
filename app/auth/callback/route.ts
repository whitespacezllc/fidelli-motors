import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// La puerta de todos los enlaces de email. Canjea el token por una sesión y
// manda a donde corresponda según para qué era el enlace.
//
// El login por contraseña NO pasa por acá: esa sesión la setea la Server
// Action de /login directamente.

// A dónde va cada tipo una vez canjeado el token.
const DESTINO: Record<string, string> = {
  // Todavía no tiene contraseña, o la está reemplazando: a elegirla.
  invite: "/auth/clave",
  recovery: "/auth/clave",
  // Ya tiene contraseña y sólo estaba confirmando el mail. La raíz enruta
  // según el rol.
  signup: "/",
  email_change: "/",
};

// `next` viene de la URL, así que es entrada de afuera. Sin esta
// comprobación, un enlace con ?next=//sitio-ajeno.com se convertiría en un
// redirect abierto firmado por nuestro dominio: `${origin}//sitio-ajeno.com`
// es una URL protocol-relative y el navegador la sigue.
function destinoSeguro(next: string | null, tipo: string | null): string {
  if (next && /^\/(?!\/)/.test(next)) return next;
  return DESTINO[tipo ?? ""] ?? "/auth/clave";
}

// Cuando GoTrue rechaza un enlace, el motivo queda en los logs del servidor
// con su código (otp_expired, etc.). Es lo que permite saber POR QUÉ falló
// un enlace real en vez de adivinar. Nunca el token.
function registrarRechazo(
  paso: string,
  tipo: string | null,
  error: { code?: string; status?: number; message?: string },
) {
  console.warn(
    `[auth/callback] ${paso} rechazado · tipo=${tipo ?? "-"} · code=${error.code ?? "-"} · status=${error.status ?? "-"} · ${error.message ?? ""}`,
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const destino = destinoSeguro(searchParams.get("next"), type);

  const supabase = await createClient();

  // Formato PKCE: ?code=… — lo genera supabase-js cuando la app pide el mail.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
    registrarRechazo("exchangeCodeForSession", type, error);
  }

  // Formato de los templates: ?token_hash=…&type=…
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
    registrarRechazo("verifyOtp", type, error);
  }

  // Acá se separan dos cosas que antes contaban la misma historia:
  //   · vencido    — traía token y la base lo rechazó (usado, vencido, roto)
  //   · sin_token  — alguien llegó a esta URL sin ningún enlace
  //
  // Y el destino ya no es el login: a un owner invitado cuyo enlace venció,
  // un formulario de login que no puede usar —nunca tuvo contraseña— es un
  // callejón sin salida.
  const motivo = code || tokenHash ? "vencido" : "sin_token";
  const params = new URLSearchParams({ motivo });
  if (type) params.set("tipo", type);

  return NextResponse.redirect(`${origin}/auth/enlace?${params}`);
}
