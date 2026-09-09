import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import {
  CartonPapel,
  CartonPapelMecanica,
} from "@/components/services/carton-papel";
import { BadgeEstado } from "@/components/services/badge-estado";
import { AnularService } from "@/components/services/anular-service";
import { estadoService, puedeEditarse } from "@/lib/servicios";
import { formatearKm } from "@/lib/renglones";
import {
  formatearFecha,
  formatearFechaHora,
  formatearHora,
} from "@/lib/fechas";
import { urlWhatsappSoporte } from "@/lib/config";

export const metadata: Metadata = { title: "Trabajo" };

type Props = { params: Promise<{ serviceId: string }> };

// El detalle de un service: el cartón tal cual lo ve el cliente —es
// literalmente el mismo componente— más la metadata operativa que el
// cliente no ve, y el estado de la ventana de edición.
export default async function PaginaService({ params }: Props) {
  const { serviceId } = await params;
  const supabase = await createClient();
  const sesion = await obtenerSesion();

  const [serviceRes, configRes] = await Promise.all([
    supabase
      .from("services")
      .select(
        `id, tipo, trabajo_descripcion, fecha, created_at, kilometros,
         aceite_tipo, aceite_nombre,
         prox_service_km, observaciones, anulado, desbloqueado_hasta,
         vehiculos(patente, marca, modelo, cliente_id, clientes(nombre)),
         sucursales(nombre),
         usuarios!usuario_id(nombre),
         service_items(item_tipo, detalle, cambiado, productos(nombre, marca))`,
      )
      .eq("id", serviceId)
      .maybeSingle(),
    supabase.from("config_experiencia").select("color_primario, color_carton").maybeSingle(),
  ]);

  const service = serviceRes.data;
  if (!service) {
    return (
      <EstadoVacio
        titulo="No encontramos ese trabajo"
        descripcion="Puede que el enlace esté mal. Desde el listado podés buscarlo por patente o por fecha."
      >
        <Link href="/panel/services" className={clasesBoton("secundario", "md")}>
          Ir al listado
        </Link>
      </EstadoVacio>
    );
  }

  const estado = estadoService(service);
  const patente = service.vehiculos?.patente.toUpperCase() ?? "";
  const nombreVehiculo =
    [service.vehiculos?.marca, service.vehiculos?.modelo]
      .filter(Boolean)
      .join(" ") || "Vehículo";
  const clienteNombre = service.vehiculos?.clientes?.nombre ?? "";
  const clienteId = service.vehiculos?.cliente_id;

  // El mismo criterio de get_carton: el detalle escrito manda, y si el
  // renglón se cargó con producto del catálogo, se muestra su nombre.
  const esMecanica = service.tipo === "mecanica";
  const renglonesLibres = service.service_items
    .filter((i) => i.item_tipo === null)
    .map(
      (i) =>
        i.detalle ??
        (i.productos
          ? [i.productos.nombre, i.productos.marca].filter(Boolean).join(" ")
          : ""),
    )
    .filter(Boolean);
  const marcados = Object.fromEntries(
    service.service_items.filter((i) => i.item_tipo !== null).map((i) => [
      i.item_tipo,
      {
        detalle:
          i.detalle ??
          (i.productos
            ? [i.productos.nombre, i.productos.marca].filter(Boolean).join(" ")
            : null),
        cambiado: i.cambiado,
      },
    ]),
  );

  // formatearHora fija la zona argentina: este componente se renderiza en
  // el servidor y el Intl pelado usaba la hora del proceso (UTC en Vercel).
  const horaDesbloqueo =
    estado.tipo === "desbloqueado" ? formatearHora(estado.hasta) : null;

  return (
    <div className="mx-auto max-w-md sm:max-w-2xl lg:max-w-4xl">
      {/* Breadcrumb */}
      <nav aria-label="Estás en" className="mb-4 text-ui text-ink-40">
        <Link href="/panel/services" className="hover:text-ink-60">
          Services
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-semibold text-ink tabular-nums">
          {formatearFecha(service.fecha)} · {patente}
        </span>
      </nav>

      {/* Cabecera: el vehículo y su gente */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2.5 font-brand text-h3 font-bold text-ink">
            <span className="plate">{patente}</span> · {nombreVehiculo}
            {esMecanica && (
              <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-ui text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                Mecánica
              </span>
            )}
          </h1>
          <p className="mt-1 text-ui text-ink-60">
            {clienteId ? (
              <Link
                href={`/panel/clientes/${clienteId}`}
                className="underline underline-offset-4 hover:text-ink"
              >
                {clienteNombre}
              </Link>
            ) : (
              clienteNombre
            )}
          </p>
        </div>
        <BadgeEstado estado={estado} />
      </header>

      {/* El estado de la ventana, bien visible, con sus acciones */}
      {estado.tipo === "anulado" ? (
        <div className="mb-5 rounded-lg border border-line bg-surface p-4">
          <p className="font-brand text-body font-bold text-ink-60">
            Service anulado
          </p>
          <p className="mt-1 text-ui text-ink-60">
            No aparece en el historial del cliente ni cuenta para su premio.
            Queda acá como registro: los datos históricos no se borran.
          </p>
        </div>
      ) : puedeEditarse(estado) ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success bg-success-soft p-4">
          <p className="text-ui text-ink">
            {estado.tipo === "editable" ? (
              <>
                Editable por{" "}
                <span className="font-bold tabular-nums">
                  {Math.max(1, Math.floor(estado.horasRestantes))}{" "}
                  {Math.floor(estado.horasRestantes) === 1 ? "hora" : "horas"}
                </span>{" "}
                más. Después queda fijado en el historial.
              </>
            ) : (
              <>
                Desbloqueado hasta las{" "}
                <span className="font-bold tabular-nums">{horaDesbloqueo}</span>{" "}
                por el soporte de Fidelli.
              </>
            )}
          </p>
          <div className="flex gap-2.5">
            <AnularService
              serviceId={service.id}
              fecha={formatearFecha(service.fecha)}
              patente={patente}
            />
            <Link
              href={`/panel/services/${service.id}/editar`}
              className={clasesBoton("primario", "md")}
            >
              Editar
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-line bg-surface p-4">
          <p className="font-brand text-body font-bold text-ink">
            Registro fijado
          </p>
          <p className="mt-1 text-ui text-ink-60">
            Pasadas las 24 horas el trabajo queda fijado en el historial y ni
            el lubricentro puede modificarlo — es lo que hace confiable el
            cartón para tu cliente. Si hay un error grave,{" "}
            <a
              href={urlWhatsappSoporte()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink underline underline-offset-4"
            >
              escribinos
            </a>{" "}
            y lo resolvemos.
          </p>
        </div>
      )}

      {/* El cartón + la metadata operativa, lado a lado en desktop */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr] md:items-start">
        <div className={estado.tipo === "anulado" ? "opacity-55" : ""}>
          {esMecanica ? (
            <CartonPapelMecanica
              datos={{
                lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
                colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
                colorPapel: configRes.data?.color_carton ?? null,
                fecha: service.fecha,
                kilometros: service.kilometros,
                descripcion: service.trabajo_descripcion ?? "",
                renglones: renglonesLibres,
              }}
            />
          ) : (
            <CartonPapel
              datos={{
                lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
                colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
                colorPapel: configRes.data?.color_carton ?? null,
                fecha: service.fecha,
                kilometros: service.kilometros ?? 0,
                aceiteTipo: service.aceite_tipo ?? "",
                aceiteNombre: service.aceite_nombre,
                proxServiceKm: service.prox_service_km ?? 0,
                marcados,
              }}
            />
          )}
        </div>

        {/* Lo que el cliente no ve: quién, cuándo, dónde */}
        <dl className="surface-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 p-4 text-ui sm:p-5 md:sticky md:top-4">
          <dt className="text-ink-60">Cargado por</dt>
          <dd className="text-ink">{service.usuarios?.nombre ?? "—"}</dd>
          <dt className="text-ink-60">Cuándo</dt>
          <dd className="text-ink tabular-nums">
            {formatearFechaHora(service.created_at)}
          </dd>
          <dt className="text-ink-60">Sucursal</dt>
          <dd className="text-ink">{service.sucursales?.nombre ?? "—"}</dd>
          {service.aceite_nombre && (
            <>
              <dt className="text-ink-60">Aceite</dt>
              <dd className="text-ink">{service.aceite_nombre}</dd>
            </>
          )}
          {service.kilometros != null && (
            <>
              <dt className="text-ink-60">Kilómetros</dt>
              <dd className="text-ink tabular-nums">
                {formatearKm(service.kilometros)} km
              </dd>
            </>
          )}
          {service.observaciones && (
            <>
              <dt className="text-ink-60">Observaciones del trabajo</dt>
              <dd className="text-ink">{service.observaciones}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
