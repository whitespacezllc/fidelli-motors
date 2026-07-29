import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido } from "@/lib/auth/session";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { Carton } from "@/components/services/carton";
import { estadoService, puedeEditarse } from "@/lib/servicios";

export const metadata: Metadata = { title: "Editar service — Fidelli Motors" };

type Props = { params: Promise<{ serviceId: string }> };

// La edición reusa el MISMO formulario de la carga, precargado. El estado
// se chequea acá para no ofrecer una pantalla que va a fallar — pero la
// regla la impone la base: si las 24 hs vencen con la pantalla abierta,
// el guardado falla limpio con su mensaje.
export default async function PaginaEditarService({ params }: Props) {
  const { serviceId } = await params;

  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés editar services mientras la cuenta está suspendida"
        descripcion="El service quedó guardado tal cual está y se sigue viendo. Para poder corregirlo, escribinos y reactivamos la cuenta."
      />
    );
  }

  const supabase = await createClient();
  const sesion = await obtenerSesion();

  const [serviceRes, sucursalesRes, productosRes, configRes] =
    await Promise.all([
      supabase
        .from("services")
        .select(
          `id, fecha, created_at, kilometros, aceite_tipo, aceite_producto_id,
           prox_service_km, observaciones, anulado, desbloqueado_hasta,
           sucursal_id, vehiculo_id,
           vehiculos(patente, marca, modelo, clientes(nombre)),
           service_items(item_tipo, detalle, cambiado, productos(nombre, marca))`,
        )
        .eq("id", serviceId)
        .maybeSingle(),
      supabase
        .from("sucursales")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre"),
      supabase
        .from("productos")
        .select("id, nombre, marca, categoria")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("config_experiencia").select("color_primario").maybeSingle(),
    ]);

  const service = serviceRes.data;
  if (!service) {
    return (
      <EstadoVacio
        titulo="No encontramos ese service"
        descripcion="Puede que el enlace esté mal. Desde el listado podés buscarlo por patente o por fecha."
      >
        <Link href="/panel/services" className={clasesBoton("secundario", "md")}>
          Ir al listado
        </Link>
      </EstadoVacio>
    );
  }

  // Fijado o anulado: no se ofrece un formulario que va a fallar. El
  // detalle explica el estado y da la salida.
  if (!puedeEditarse(estadoService(service))) {
    redirect(`/panel/services/${serviceId}`);
  }

  // El service anterior a ESTE, para la advertencia de kilómetros: al
  // editar no tiene sentido comparar el service contra sí mismo.
  const { data: anterior } = await supabase
    .from("services")
    .select("fecha, kilometros")
    .eq("vehiculo_id", service.vehiculo_id)
    .eq("anulado", false)
    .neq("id", serviceId)
    .lte("fecha", service.fecha)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // El detalle del renglón como lo edita el mecánico: texto. Si el renglón
  // vino con producto del catálogo, el texto es su nombre — al guardar, el
  // match por nombre lo vuelve a vincular como producto.
  const marcados = Object.fromEntries(
    service.service_items.map((i) => [
      i.item_tipo as string,
      i.detalle ??
        (i.productos
          ? [i.productos.nombre, i.productos.marca].filter(Boolean).join(" · ")
          : ""),
    ]),
  );

  const cambiados = Object.fromEntries(
    service.service_items.map((i) => [i.item_tipo as string, i.cambiado]),
  );

  return (
    <div className="mx-auto max-w-md sm:max-w-2xl lg:max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <nav aria-label="Estás en" className="text-ui text-ink-40">
          <Link href={`/panel/services/${serviceId}`} className="hover:text-ink-60">
            Service
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-semibold text-ink">Editar</span>
        </nav>
        <Link
          href={`/panel/services/${serviceId}`}
          className="text-ui font-semibold text-ink-60 hover:text-ink"
        >
          Volver sin guardar
        </Link>
      </div>

      <Carton
        datos={{
          vehiculoId: service.vehiculo_id,
          patente: service.vehiculos?.patente.toUpperCase() ?? "",
          vehiculoNombre:
            [service.vehiculos?.marca, service.vehiculos?.modelo]
              .filter(Boolean)
              .join(" ") || "Vehículo",
          clienteNombre: service.vehiculos?.clientes?.nombre ?? "",
          lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
          colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
          sucursales: sucursalesRes.data ?? [],
          sucursalInicial: service.sucursal_id,
          productos: (productosRes.data ?? []).map((p) => ({
            id: p.id,
            nombre: [p.nombre, p.marca].filter(Boolean).join(" · "),
            categoria: p.categoria,
          })),
          ultimoService: anterior
            ? { fecha: anterior.fecha, kilometros: anterior.kilometros }
            : null,
          // El aviso de "ya hay un service hoy" es de la carga: acá se
          // está editando justamente ese service.
          serviceDeHoy: null,
          hoy: service.fecha,
          // Editar no toca el canje: si el service se guardó con premio,
          // el canje ya está registrado y atado a él.
          premioDisponible: null,
        }}
        edicion={{
          serviceId: service.id,
          fecha: service.fecha,
          kilometros: service.kilometros,
          aceiteTipo: service.aceite_tipo,
          aceiteProductoId: service.aceite_producto_id,
          proxServiceKm: service.prox_service_km,
          observaciones: service.observaciones,
          marcados,
          cambiados,
        }}
      />
    </div>
  );
}
