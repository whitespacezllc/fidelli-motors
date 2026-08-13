import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WizardAlta } from "@/components/fidelli/wizard-alta";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Nuevo lubricentro" };

export default async function PaginaAlta() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("planes")
    .select("id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct")
    .eq("activo", true)
    .order("nombre");

  const planes = (data ?? []) as PlanCompleto[];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/fidelli"
        className="mb-4 inline-flex min-h-8 items-center text-label font-semibold text-ink-60 hover:text-ink"
      >
        ← Lubricentros
      </Link>

      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">
        Nuevo lubricentro
      </h1>

      {planes.length === 0 ? (
        <p className="surface-card px-5 py-6 text-ui text-ink-60">
          No hay ningún plan activo en el catálogo. Cargá uno en{" "}
          <Link href="/fidelli/precios" className="font-semibold text-ink underline">
            Plan y precios
          </Link>{" "}
          antes de dar de alta un lubricentro: la suscripción necesita un plan.
        </p>
      ) : (
        <WizardAlta planes={planes} />
      )}
    </div>
  );
}
