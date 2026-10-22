import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormFiado } from "@/components/finanzas/form-fiado";
import { hoyISO } from "@/lib/fechas";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";

export const metadata: Metadata = { title: "Registrar fiado" };

// El alta de un fiado. Orden de las puertas: suspendido → plan → normal.
export default async function PaginaNuevoFiado({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés registrar fiados mientras la cuenta está suspendida"
        descripcion="Lo que ya cargaste se sigue viendo. Para volver a registrar, escribinos y reactivamos la cuenta."
      />
    );
  }

  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Finanzas" />;
  }

  const params = await searchParams;
  const supabase = await createClient();

  const [clientesRes, sucursalesRes] = await Promise.all([
    supabase.from("clientes").select("id, nombre").order("nombre"),
    supabase.from("sucursales").select("id, nombre").eq("activa", true).order("nombre"),
  ]);

  const clientes = clientesRes.data ?? [];
  const sucursales = sucursalesRes.data ?? [];
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0]?.id ?? "";
  const clienteInicial = clientes.find((c) => c.id === params.cliente)?.id ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Registrar fiado" />
      <FormFiado
        clientes={clientes}
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        clienteInicial={clienteInicial}
        hoy={hoyISO()}
      />
    </div>
  );
}
