import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { hoyISO } from "@/lib/fechas";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";
import { normalizarExtraido } from "@/lib/comprobantes";
import { PanelComprobantes } from "@/components/finanzas/panel-comprobantes";

export const metadata: Metadata = { title: "Cargar desde comprobante" };

// Cargar un egreso a partir de la foto o el PDF de una factura de proveedor.
// Orden de las puertas, regla del panel: suspendido → plan → normal.
export default async function PaginaComprobantes() {
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés cargar comprobantes mientras la cuenta está suspendida"
        descripcion="Lo que ya cargaste se sigue viendo. Para volver a cargar, escribinos y reactivamos la cuenta."
      />
    );
  }

  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Contable" />;
  }

  const supabase = await createClient();
  const [{ data: sucursalesData }, { data: pendientesData }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("activa", true).order("nombre"),
    supabase
      .from("comprobantes_recibidos")
      .select("id, nombre, created_at, extraido")
      .eq("estado", "sin_revisar")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const sucursales = sucursalesData ?? [];
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0]?.id ?? "";

  const pendientes = (pendientesData ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    creado: c.created_at as string,
    extraido: normalizarExtraido(c.extraido),
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Cargar desde comprobante" />
      <p className="mb-4 text-ui text-ink-60">
        Subí la foto o el PDF de una factura de un proveedor. La leemos y te
        proponemos los datos; los revisás y confirmás, y se registra el egreso.
      </p>
      <PanelComprobantes
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        hoy={hoyISO()}
        pendientes={pendientes}
      />
    </div>
  );
}
