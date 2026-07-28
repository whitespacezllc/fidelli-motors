import type { Metadata } from "next";
import { Wordmark } from "@/components/marca/wordmark";
import { FormularioRecuperar } from "@/components/auth/formulario-recuperar";

export const metadata: Metadata = {
  title: "Recuperá tu contraseña — Fidelli Motors",
};

export default function PaginaRecuperar() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px]">
        <Wordmark className="mb-8 block text-xl text-ink" />
        <FormularioRecuperar />
      </div>
    </main>
  );
}
