import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import {
  FormPresupuesto,
  type PresupuestoInicial,
} from "@/components/presupuestos/form-presupuesto";
import { hoyISO } from "@/lib/fechas";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";

export const metadata: Metadata = { title: "Nuevo presupuesto" };

type Params = Promise<{ cliente?: string; vehiculo?: string; desde?: string }>;

// El alta del mostrador. Tres puertas de entrada:
//   · suelta, desde el sidebar — sin ficha de nada;
//   · desde la ficha de un cliente o un auto (?cliente= &vehiculo=),
//     con el destino ya cargado;
//   · duplicando uno existente (?desde=), porque el 80% de lo que se
//     cotiza se parece a algo que ya se cotizó.
export default async function PaginaNuevoPresupuesto({
  searchParams,
}: {
  searchParams: Params;
}) {
  // El orden es regla: suspendido → plan → normal.
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés generar presupuestos mientras la cuenta está suspendida"
        descripcion="Los que ya generaste se siguen viendo e imprimiendo. Para volver a cotizar, escribinos y reactivamos la cuenta."
      />
    );
  }

  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "presupuestos")) {
    return <BloqueoPlan funcion="Presupuestos" />;
  }

  const params = await searchParams;
  const supabase = await createClient();

  const [sucursalesRes, productosRes, clienteRes, vehiculoRes, desdeRes] = await Promise.all([
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
    params.cliente
      ? supabase
          .from("clientes")
          .select("id, nombre, telefono")
          .eq("id", params.cliente)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    params.vehiculo
      ? supabase
          .from("vehiculos")
          .select("id, patente, marca, modelo, anio")
          .eq("id", params.vehiculo)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    params.desde
      ? supabase
          .from("presupuestos")
          .select(
            `validez_dias, observaciones, destinatario_nombre,
             destinatario_telefono, destinatario_vehiculo, cliente_id,
             vehiculo_id, presupuesto_items(orden, descripcion, cantidad, precio_unitario)`,
          )
          .eq("id", params.desde)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sucursales = sucursalesRes.data ?? [];
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0]?.id ?? "";

  const cliente = clienteRes.data;
  const vehiculo = vehiculoRes.data;
  const desde = desdeRes.data;

  // Duplicar gana como punto de partida; la ficha completa el destino.
  const inicial: PresupuestoInicial | undefined = desde
    ? {
        fecha: hoyISO(),
        validezDias: desde.validez_dias,
        observaciones: desde.observaciones,
        destinatarioNombre: desde.destinatario_nombre,
        destinatarioTelefono: desde.destinatario_telefono,
        destinatarioVehiculo: desde.destinatario_vehiculo,
        clienteId: desde.cliente_id,
        vehiculoId: desde.vehiculo_id,
        items: [...(desde.presupuesto_items ?? [])]
          .sort((a, b) => a.orden - b.orden)
          .map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precioUnitario: Number(i.precio_unitario),
          })),
      }
    : cliente || vehiculo
      ? {
          fecha: hoyISO(),
          validezDias: null,
          observaciones: null,
          destinatarioNombre: cliente?.nombre ?? null,
          destinatarioTelefono: cliente?.telefono ?? null,
          destinatarioVehiculo: vehiculo
            ? [
                vehiculo.patente.toUpperCase(),
                [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" "),
                vehiculo.anio,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          clienteId: cliente?.id ?? null,
          vehiculoId: vehiculo?.id ?? null,
          items: [],
        }
      : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion
        titulo={params.desde ? "Duplicar presupuesto" : "Nuevo presupuesto"}
      />
      <FormPresupuesto
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        hoy={hoyISO()}
        inicial={inicial}
        productos={(productosRes.data ?? []).map((p) => ({
          nombre: [p.nombre, p.marca].filter(Boolean).join(" · "),
          precio: p.precio_venta,
        }))}
      />
    </div>
  );
}
