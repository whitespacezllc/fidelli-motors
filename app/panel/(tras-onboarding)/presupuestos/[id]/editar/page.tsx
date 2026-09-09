import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { FormPresupuesto } from "@/components/presupuestos/form-presupuesto";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";
import { hoyISO } from "@/lib/fechas";

export const metadata: Metadata = { title: "Editar presupuesto" };

type Props = { params: Promise<{ id: string }> };

// Editable siempre: es una herramienta de trabajo, no un documento legal.
// El número no cambia nunca — eso lo garantiza la función de la base.
export default async function PaginaEditarPresupuesto({ params }: Props) {
  const { id } = await params;

  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés editar presupuestos mientras la cuenta está suspendida"
        descripcion="El presupuesto quedó como está y se sigue viendo e imprimiendo. Para corregirlo, escribinos y reactivamos la cuenta."
      />
    );
  }

  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "presupuestos")) {
    return <BloqueoPlan funcion="Presupuestos" />;
  }

  const supabase = await createClient();
  const [presupuestoRes, sucursalesRes, productosRes] = await Promise.all([
    supabase
      .from("presupuestos")
      .select(
        `id, numero, fecha, validez_dias, observaciones, sucursal_id,
         destinatario_nombre, destinatario_telefono, destinatario_vehiculo,
         cliente_id, vehiculo_id,
         presupuesto_items(orden, descripcion, cantidad, precio_unitario)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre"),
    supabase
      .from("productos")
      .select("nombre, marca, precio_venta")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const p = presupuestoRes.data;
  if (!p) {
    return (
      <EstadoVacio
        titulo="No encontramos ese presupuesto"
        descripcion="Puede que el enlace esté mal."
      >
        <Link href="/panel/presupuestos" className={clasesBoton("secundario", "md")}>
          Ir al listado
        </Link>
      </EstadoVacio>
    );
  }

  const sucursales = sucursalesRes.data ?? [];
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === p.sucursal_id)?.id ??
    sucursales.find((s) => s.id === recordada)?.id ??
    sucursales[0]?.id ??
    "";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <nav aria-label="Estás en" className="text-ui text-ink-40">
          <Link href={`/panel/presupuestos/${p.id}`} className="hover:text-ink-60">
            Presupuesto N° {p.numero}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-semibold text-ink">Editar</span>
        </nav>
        <Link
          href={`/panel/presupuestos/${p.id}`}
          className="text-ui font-semibold text-ink-60 hover:text-ink"
        >
          Volver sin guardar
        </Link>
      </div>

      <FormPresupuesto
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        hoy={hoyISO()}
        productos={(productosRes.data ?? []).map((p) => ({
          nombre: [p.nombre, p.marca].filter(Boolean).join(" · "),
          precio: p.precio_venta,
        }))}
        inicial={{
          id: p.id,
          fecha: p.fecha,
          validezDias: p.validez_dias,
          observaciones: p.observaciones,
          destinatarioNombre: p.destinatario_nombre,
          destinatarioTelefono: p.destinatario_telefono,
          destinatarioVehiculo: p.destinatario_vehiculo,
          clienteId: p.cliente_id,
          vehiculoId: p.vehiculo_id,
          items: [...(p.presupuesto_items ?? [])]
            .sort((a, b) => a.orden - b.orden)
            .map((i) => ({
              descripcion: i.descripcion,
              cantidad: Number(i.cantidad),
              precioUnitario: Number(i.precio_unitario),
            })),
        }}
      />
    </div>
  );
}
