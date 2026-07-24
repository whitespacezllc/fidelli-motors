import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/session";
import { urlWhatsappSoporte } from "@/lib/config";
import { PanelVisual } from "@/components/auth/panel-visual";
import { FormularioLogin } from "@/components/auth/formulario-login";
import { Wordmark } from "@/components/marca/wordmark";

export const metadata: Metadata = { title: "Entrá a tu panel — Fidelli Motors" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;

  // Con sesión no hay nada que hacer acá.
  const sesion = await obtenerSesion();
  if (sesion) redirect(sesion.rol === "superadmin" ? "/fidelli" : "/panel");

  return (
    <div className="flex min-h-dvh">
      <PanelVisual />

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          {/* En mobile no está el panel visual: el wordmark va acá. */}
          <Wordmark className="mb-8 block text-xl text-ink lg:hidden" />

          <h1 className="mb-6 font-brand text-h3 font-bold text-ink">
            Entrá a tu panel
          </h1>

          {aviso === "enlace" && (
            <p className="mb-5 rounded-md bg-surface px-3.5 py-3 text-ui text-ink-60">
              El enlace ya se usó o venció. Pedí uno nuevo desde &ldquo;¿Olvidaste
              tu contraseña?&rdquo;.
            </p>
          )}

          <FormularioLogin />

          <p className="mt-10 text-center text-ui text-ink-60">
            ¿Problemas para entrar?{" "}
            <a
              href={urlWhatsappSoporte()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand"
            >
              Escribinos
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
