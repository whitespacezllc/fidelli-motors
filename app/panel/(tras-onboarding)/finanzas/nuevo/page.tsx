import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormMovimiento } from "@/components/finanzas/form-movimiento";
import { hoyISO } from "@/lib/fechas";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";

export const metadata: Metadata = { title: "Nuevo ingreso" };

// El alta de un ingreso a mano. Orden de las puertas, regla del panel:
// suspendido → plan → normal.
export default async function PaginaNuevoIngreso() {
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés registrar ingresos mientras la cuenta está suspendida"
        descripcion="Lo que ya cargaste se sigue viendo. Para volver a registrar, escribinos y reactivamos la cuenta."
      />
    );
  }

  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Finanzas" />;
  }

  const supabase = await createClient();
  const { data: sucursalesData } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("activa", true)
    .order("nombre");

  const sucursales = sucursalesData ?? [];
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0]?.id ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Nuevo ingreso" />
      <FormMovimiento
        tipo="ingreso"
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        hoy={hoyISO()}
      />
    </div>
  );
}
