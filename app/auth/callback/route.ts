import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// La puerta de los enlaces de email (invitación y recuperación): intercambia
// el código por una sesión y manda a definir la contraseña. El login por
// contraseña NO pasa por acá — la sesión la setea la Server Action.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/auth/clave";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && type) {
    // Formato alternativo de los templates ({{ .TokenHash }}): mismo destino.
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Enlace usado o vencido: el login muestra el aviso con la salida.
  return NextResponse.redirect(`${origin}/login?aviso=enlace`);
}
