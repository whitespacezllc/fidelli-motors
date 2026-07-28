import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/marca/logo";
import { FormularioClave } from "@/components/auth/formulario-clave";

export const metadata: Metadata = { title: "Creá tu contraseña — Fidelli Motors" };

// Sirve para los dos enlaces de email: invitación y recuperación.
// El título es neutro a propósito — el flujo es el mismo en ambos casos.
export default async function PaginaClave() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // Sin la sesión del enlace no hay contraseña que definir.
  if (!data?.claims?.sub) redirect("/login?aviso=enlace");
  const email = data.claims.email;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px]">
        <Logo className="mb-8 h-6 w-auto" priority />
        <h1 className="mb-2 font-brand text-h3 font-bold text-ink">
          Creá tu contraseña
        </h1>
        <p className="mb-6 text-ui text-ink-60">
          La vas a usar para entrar al panel
          {email ? (
            <>
              {" "}
              con <span className="font-semibold text-ink">{email}</span>
            </>
          ) : null}
          .
        </p>
        <FormularioClave />
      </div>
    </main>
  );
}
