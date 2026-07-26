import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ficha del lubricentro — Fidelli Motors" };

// La ficha completa —resumen, suscripción, datos y configuración— es su
// propia tarea. Esto existe para que la fila del listado no enlace a la nada:
// confirma que el tenant existe y dice qué va a haber acá.
export default async function PaginaFicha({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: lubricentro } = await supabase
    .from("lubricentros")
    .select("nombre, slug")
    .eq("id", id)
    .maybeSingle();

  if (!lubricentro) notFound();

  return (
    <div>
      <Link
        href="/fidelli"
        className="mb-4 inline-flex min-h-8 items-center text-label font-semibold text-ink-60 hover:text-ink"
      >
        ← Lubricentros
      </Link>

      <h1 className="font-brand text-h2 font-bold text-ink">
        {lubricentro.nombre}
      </h1>
      <p className="text-ui text-ink-40">/{lubricentro.slug}</p>

      <p className="mt-4 max-w-lg text-ui text-ink-60">
        Acá va a aparecer la ficha del tenant: el resumen con sus métricas, el
        historial de pagos de la suscripción, sus datos y su configuración.
        Mientras tanto, todo lo que se puede editar está en el botón{" "}
        <span className="font-semibold text-ink">Editar</span> del listado.
      </p>
    </div>
  );
}
