import type { Metadata } from "next";
import { Logo } from "@/components/marca/logo";
import { FormularioRecuperar } from "@/components/auth/formulario-recuperar";

export const metadata: Metadata = {
  title: "Recuperá tu contraseña — Fidelli Motors",
};

export default function PaginaRecuperar() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px]">
        <Logo className="mb-8 h-6 w-auto" priority />
        <FormularioRecuperar />
      </div>
    </main>
  );
}
