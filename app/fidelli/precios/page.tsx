import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TarjetaPlan } from "@/components/fidelli/tarjeta-plan";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Plan y precios" };

export default async function PaginaPrecios() {
  const supabase = await createClient();

  // El precio de lista es uno y toca a todos: al lado de cada plan van los
  // lubricentros que lo tienen contratado, con el descuento que negoció cada
  // uno. Así el ajuste trimestral se hace mirando a quién le cambia.
  const [{ data: planes }, { data: filas }] = await Promise.all([
    supabase
      .from("planes")
      .select(
        "id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct, features, limites, heredado",
      )
      .eq("activo", true)
      .order("heredado")
      .order("precio_mensual"),
    supabase.rpc("listado_lubricentros"),
  ]);

  const catalogo = (planes ?? []) as unknown as PlanCompleto[];
  const lubricentros = filas ?? [];

  return (
    <div>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">
        Plan y precios
      </h1>
      <p className="mb-6 max-w-2xl text-ui text-ink-60">
        El precio de lista es el único número que se toca. Los descuentos por
        pagar semestral o anual salen de acá y valen para todos; el descuento
        propio de cada lubricentro se edita en su ficha y se aplica sobre lo
        que quede.
      </p>

      {catalogo.length === 0 ? (
        <p className="surface-card px-5 py-6 text-ui text-ink-60">
          No hay ningún plan activo en el catálogo.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {catalogo.map((plan) => (
            <TarjetaPlan
              key={plan.id}
              plan={plan}
              suscriptos={lubricentros
                .filter((l) => l.plan_id === plan.id)
                .map((l) => ({
                  id: l.id,
                  nombre: l.nombre,
                  periodo: l.sub_periodo,
                  descuento: Number(l.sub_descuento_pct ?? 0),
                  estado: l.sub_estado,
                }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
