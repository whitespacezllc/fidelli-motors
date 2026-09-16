import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TarjetaPlan } from "@/components/fidelli/tarjeta-plan";
import {
  TarjetaModulo,
  type ModuloCatalogo,
} from "@/components/fidelli/tarjeta-modulo";
import type { PlanCompleto } from "@/components/fidelli/tipos";
import { leerMotivoModulo } from "@/lib/modulos";
import { MODULOS_PAGOS, type ModuloPago } from "@/lib/planes";

export const metadata: Metadata = { title: "Plan y precios" };

export default async function PaginaPrecios() {
  const supabase = await createClient();

  // El precio de lista es uno y toca a todos: al lado de cada plan van los
  // lubricentros que lo tienen contratado, con el descuento que negoció cada
  // uno. Así el ajuste trimestral se hace mirando a quién le cambia.
  //
  // `lubricentros` y `cambios` alimentan la tarjeta de módulos: quién TIENE
  // el módulo sale del override, y si lo PAGA o lo tiene bonificado sale del
  // motivo. Son dos cosas distintas y la diferencia es plata.
  //
  // ⚠ Un superadmin ve todos los tenants: el RLS deja de recortar, así que
  // acá no hay filtro por lubricentro a propósito — es la pantalla de la
  // plataforma entera, no la de un tenant.
  const [{ data: planes }, { data: filas }, { data: modulos }, { data: cambios }] =
    await Promise.all([
      supabase
        .from("planes")
        .select(
          "id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct, features, limites, heredado",
        )
        .eq("activo", true)
        .order("heredado")
        .order("precio_mensual"),
      supabase.rpc("listado_lubricentros"),
      supabase
        .from("modulos")
        .select("id, codigo, nombre, precio_mensual, activo")
        .eq("activo", true)
        .order("precio_mensual"),
      supabase
        .from("lubricentros")
        .select("id, nombre, plan_overrides, cambios_override_plan(motivo, created_at)")
        .neq("plan_overrides", "{}"),
    ]);

  const catalogo = (planes ?? []) as unknown as PlanCompleto[];
  const lubricentros = filas ?? [];
  const catalogoModulos = (modulos ?? []) as unknown as ModuloCatalogo[];

  // Quién tiene cada módulo, y si lo paga.
  //
  // "Bonificado" sale del MOTIVO del override, que es hoy el único registro
  // de la forma —`lib/modulos.ts` valida el formato cuando la clave cambia—.
  // Se toma el motivo MÁS RECIENTE que hable de ese módulo, no el cambio más
  // reciente a secas: un superadmin que toca el tope de sucursales de un
  // tenant que ya tiene gomería escribe el motivo de las sucursales, y ese
  // no dice nada sobre el módulo.
  //
  // Ante la duda —un motivo viejo, ilegible o de otro módulo— se asume
  // BONIFICADO, o sea que NO se cobra. Cobrarle de más a alguien es peor que
  // no cobrarle: lo segundo se arregla con una conversación, lo primero con
  // una devolución y una disculpa.
  const tenedores = (codigo: ModuloPago) =>
    (cambios ?? [])
      .filter((l) => (l.plan_overrides as Record<string, unknown>)?.[codigo] === true)
      .map((l) => {
        const motivos = [...(l.cambios_override_plan ?? [])].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        const delModulo = motivos
          .map((c) => leerMotivoModulo(codigo, c.motivo))
          .find((m) => m !== null);
        return {
          id: l.id,
          nombre: l.nombre,
          bonificado: delModulo?.forma !== "pago",
        };
      });

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

      {/* ---------- Los módulos pagos ----------
          Catálogo, igual que los planes: lo que vendemos, con un precio que
          afecta a todos los futuros. Lo que NO es catálogo —a quién se le da
          el módulo— vive en la ficha del tenant. */}
      {catalogoModulos.length > 0 && (
        <>
          <h2 className="mt-10 mb-1.5 font-brand text-h3 font-bold text-ink">
            Módulos
          </h2>
          <p className="mb-6 max-w-2xl text-ui text-ink-60">
            Se venden aparte del plan y se suman al abono. Llevan el mismo
            descuento del período que el plan, pero no el descuento propio del
            lubricentro. Quién tiene cada módulo se decide en su ficha.
          </p>

          <div className="flex flex-col gap-5">
            {catalogoModulos
              .filter((m): m is ModuloCatalogo & { codigo: ModuloPago } =>
                (MODULOS_PAGOS as readonly string[]).includes(m.codigo),
              )
              .map((m) => (
                <TarjetaModulo
                  key={m.id}
                  modulo={m}
                  conElModulo={tenedores(m.codigo)}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
