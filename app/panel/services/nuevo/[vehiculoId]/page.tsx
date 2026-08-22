import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido, featureHabilitada } from "@/lib/auth/session";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { Carton } from "@/components/services/carton";
import { formatearHora, hoyISO } from "@/lib/fechas";
import { COOKIE_SUCURSAL } from "@/lib/preferencias";

export const metadata: Metadata = { title: "Cargar service" };

// Momento 1 — el cartón. Espejo del papel, en una sola pantalla scrolleable.
export default async function PaginaCarton({
  params,
}: {
  params: Promise<{ vehiculoId: string }>;
}) {
  const { vehiculoId } = await params;

  // Se chequea antes de consultar nada: si no puede cargar el service, no
  // tiene sentido armarle el cartón.
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés cargar services mientras la cuenta está suspendida"
        descripcion="Todo lo que ya cargaste sigue acá y lo podés seguir consultando. Para volver a cargar services, escribinos y reactivamos la cuenta."
      />
    );
  }

  const supabase = await createClient();
  const sesion = await obtenerSesion();

  // Cinco conjuntos distintos, en paralelo. Ninguna consulta depende de otra
  // y ninguna es N+1: el cartón necesita el vehículo, dónde se hace, con qué
  // se hace, qué pasó antes y con qué color se le muestra al cliente.
  const [
    vehiculoRes,
    sucursalesRes,
    productosRes,
    serviciosRes,
    configRes,
    premioRes,
  ] = await Promise.all([
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
      supabase.from("config_experiencia").select("color_primario, color_carton").maybeSingle(),
      // El ciclo con reset, calculado en vivo contra la meta vigente.
      // Sin la feature de premios ni se consulta: el checkbox de canje no
      // aparece y el guardado nunca choca con la policy al final — que era
      // exactamente el rechazo crudo que había que evitar.
      featureHabilitada(sesion, "premios")
        ? supabase.rpc("premio_disponible", { p_vehiculo_id: vehiculoId })
        : Promise.resolve({ data: null }),
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
  const premio = premioRes.data?.[0] ?? null;

  // La sucursal es del dispositivo, no del usuario: en el MVP es probable que
  // el lubricentro comparta una sola cuenta entre sucursales, así que la
  // última usada se recuerda en una cookie de este celular. Si la cookie
  // trae una sucursal que ya no está activa, cae en la primera.
  const recordada = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  const sucursalInicial =
    sucursales.find((s) => s.id === recordada)?.id ?? sucursales[0].id;

  // El "hoy" del NEGOCIO, no del servidor: esto corre en Vercel (UTC) y
  // armar la fecha con getFullYear/getMonth del proceso fechaba a mañana
  // todo service cargado entre las 21:00 y las 24:00 hora argentina.
  const hoy = hoyISO();

  // Caso borde: ya hay un service de hoy para esta patente.
  const deHoy = servicios.find((s) => s.fecha === hoy);
  const serviceDeHoy = deHoy
    ? {
        hora: formatearHora(deHoy.created_at),
        sucursal: deHoy.sucursales?.nombre ?? "otra sucursal",
        kilometros: deHoy.kilometros,
      }
    : null;

  return (
    // El cartón crece en dos saltos: en tablet ya entra en dos columnas de
    // renglones, y en desktop toma su ancho definitivo. El tope es 3xl —
    // más que eso estira los campos sin ganar nada y rompe la medida de
    // lectura. En mobile queda igual que siempre.
    <div className="mx-auto max-w-md sm:max-w-2xl lg:max-w-3xl">
      <Carton
        datos={{
          vehiculoId: vehiculo.id,
          patente: vehiculo.patente.toUpperCase(),
          vehiculoNombre:
            [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo",
          clienteNombre: vehiculo.clientes?.nombre ?? "",
          lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
          colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
          colorPapel: configRes.data?.color_carton ?? null,
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
          premioDisponible: premio?.disponible
            ? { descripcion: premio.descripcion ?? "Premio del programa" }
            : null,
        }}
      />
    </div>
  );
}
