import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CabeceraTenant } from "@/components/fidelli/ficha/cabecera-tenant";
import { TabResumen } from "@/components/fidelli/ficha/tab-resumen";
import { TabSuscripcion } from "@/components/fidelli/ficha/tab-suscripcion";
import { TabDatos } from "@/components/fidelli/ficha/tab-datos";
import { TabConfiguracion } from "@/components/fidelli/ficha/tab-configuracion";
import {
  esPestana,
  type SuscripcionVigente,
  type Tenant,
} from "@/components/fidelli/ficha/tipos";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Ficha del lubricentro" };

export type ParamsFicha = {
  tab?: string;
  ver?: string;
  q?: string;
  pagina?: string;
  sucursal?: string;
  desde?: string;
  hasta?: string;
};

// ============================================================
// La ficha del tenant.
//
// TODA consulta de esta pantalla y de sus pestañas filtra por el id de la
// ficha. En /panel eso sería redundante —RLS filtra por el tenant de la
// sesión— pero acá el que mira es un superadmin y sus policies no recortan
// nada: el filtro explícito es lo único que separa a un lubricentro del
// de al lado. Las vistas tampoco ayudan: tienen security_invoker, así que
// para un superadmin devuelven la plataforma entera.
// ============================================================
export default async function PaginaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsFicha>;
}) {
  const { id } = await params;
  const busqueda = await searchParams;
  const pestana = esPestana(busqueda.tab) ? busqueda.tab : "resumen";

  const supabase = await createClient();

  const [tenantRes, suscripcionRes] = await Promise.all([
    supabase
      .from("lubricentros")
      .select("id, nombre, slug, activo, calcos_entregadas, created_at")
      .eq("id", id)
      .maybeSingle(),
    // La vigente es la última que arrancó, el mismo criterio que el listado.
    supabase
      .from("suscripciones")
      .select(
        `id, estado, periodo, descuento_pct, inicio, vencimiento,
         planes(id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct, features, limites, heredado)`,
      )
      .eq("lubricentro_id", id)
      .order("inicio", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!tenantRes.data) notFound();

  const tenant = tenantRes.data as Tenant;
  const fila = suscripcionRes.data;
  const suscripcion: SuscripcionVigente | null = fila
    ? {
        id: fila.id,
        estado: fila.estado,
        periodo: fila.periodo,
        descuento_pct: Number(fila.descuento_pct),
        inicio: fila.inicio,
        vencimiento: fila.vencimiento,
        plan: (fila.planes as unknown as PlanCompleto | null) ?? null,
      }
    : null;

  return (
    <div>
      <CabeceraTenant
        tenant={tenant}
        suscripcion={suscripcion}
        pestana={pestana}
      />

      {pestana === "resumen" && (
        <TabResumen tenant={tenant} suscripcion={suscripcion} />
      )}
      {pestana === "suscripcion" && (
        <TabSuscripcion tenant={tenant} suscripcion={suscripcion} />
      )}
      {pestana === "datos" && <TabDatos tenant={tenant} params={busqueda} />}
      {pestana === "configuracion" && <TabConfiguracion tenant={tenant} />}
    </div>
  );
}
