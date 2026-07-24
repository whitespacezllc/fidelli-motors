import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { Carton } from "@/components/services/carton";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";

export const metadata: Metadata = { title: "Cargar service — Fidelli Motors" };

// Momento 1 — el cartón. Espejo del papel, en una sola pantalla scrolleable.
export default async function PaginaCarton({
  params,
}: {
  params: Promise<{ vehiculoId: string }>;
}) {
  const { vehiculoId } = await params;
  const supabase = await createClient();
  const sesion = await obtenerSesion();

  // Cinco conjuntos distintos, en paralelo. Ninguna consulta depende de otra
  // y ninguna es N+1: el cartón necesita el vehículo, dónde se hace, con qué
  // se hace, qué pasó antes y con qué color se le muestra al cliente.
  const [vehiculoRes, sucursalesRes, productosRes, serviciosRes, configRes] =
    await Promise.all([
      supabase
        .from("vehiculos")
        .select("id, patente, marca, modelo, clientes(nombre)")
        .eq("id", vehiculoId)
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
      supabase
        .from("services")
        .select("fecha, kilometros, created_at, sucursales(nombre)")
        .eq("vehiculo_id", vehiculoId)
        .eq("anulado", false)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("config_experiencia").select("color_primario").maybeSingle(),
    ]);

  const vehiculo = vehiculoRes.data;
  if (!vehiculo) {
    return (
      <EstadoVacio
        titulo="No encontramos ese vehículo"
        descripcion="Puede que el enlace esté mal. Volvé a buscar la patente para cargar el service."
      >
        <Link href="/panel/services/nuevo" className={clasesBoton("secundario", "md")}>
          Buscar la patente
        </Link>
      </EstadoVacio>
    );
  }

  const sucursales = sucursalesRes.data ?? [];
  if (sucursales.length === 0) {
    return (
      <EstadoVacio
        titulo="Necesitás una sucursal activa"
        descripcion="Cada service se etiqueta con la sucursal donde se hizo. Activá una y volvé a cargar."
      >
        <Link href="/panel/sucursales" className={clasesBoton("secundario", "md")}>
          Ir a Sucursales
        </Link>
      </EstadoVacio>
    );
  }

  const servicios = serviciosRes.data ?? [];
  const ultimo = servicios[0] ?? null;

  // La sucursal es del dispositivo, no del usuario: en el MVP es probable que
  // el lubricentro comparta una sola cuenta entre sucursales, así que la
  // última usada se recuerda en una cookie de este celular. Si la cookie
  // trae una sucursal que ya no está activa, cae en la primera.
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0].id;

  // La fecha se arma con las partes para no correrse de día por zona horaria.
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

  // Caso borde: ya hay un service de hoy para esta patente.
  const deHoy = servicios.find((s) => s.fecha === hoy);
  const serviceDeHoy = deHoy
    ? {
        hora: new Date(deHoy.created_at).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        sucursal: deHoy.sucursales?.nombre ?? "otra sucursal",
        kilometros: deHoy.kilometros,
      }
    : null;

  return (
    <div className="mx-auto max-w-md">
      <Carton
        datos={{
          vehiculoId: vehiculo.id,
          patente: vehiculo.patente.toUpperCase(),
          vehiculoNombre:
            [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo",
          clienteNombre: vehiculo.clientes?.nombre ?? "",
          lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
          colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
          sucursales,
          sucursalInicial,
          productos: (productosRes.data ?? []).map((p) => ({
            id: p.id,
            nombre: [p.nombre, p.marca].filter(Boolean).join(" · "),
            categoria: p.categoria,
          })),
          ultimoService: ultimo
            ? { fecha: ultimo.fecha, kilometros: ultimo.kilometros }
            : null,
          serviceDeHoy,
          hoy,
        }}
      />
    </div>
  );
}
