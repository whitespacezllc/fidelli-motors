import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import {
  CartonPapel,
  CartonPapelCaja,
  CartonPapelMecanica,
  CartonPapelNeumaticos,
} from "@/components/services/carton-papel";
import { BadgeEstado } from "@/components/services/badge-estado";
import { AnularService } from "@/components/services/anular-service";
import {
  AdjuntosTrabajo,
  type AdjuntoDelTrabajo,
} from "@/components/services/adjuntos-trabajo";
import {
  estadoService,
  plazoEdicionConArticulo,
  puedeEditarse,
  restanteEnPalabras,
} from "@/lib/servicios";
import { formatearKm } from "@/lib/renglones";
import { descripcionEnUnaLinea } from "@/lib/renglones-mecanica";
import { ETIQUETA_TIPO, type TipoTrabajo } from "@/lib/trabajos";
import {
  formatearFecha,
  formatearFechaHora,
  formatearHora,
} from "@/lib/fechas";
import { urlWhatsappSoporte } from "@/lib/config";

export const metadata: Metadata = { title: "Trabajo" };

type Props = {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ adjuntar?: string }>;
};

// Cuánto dura la URL firmada con la que el panel abre un adjunto. Una hora,
// como el diseño del calco: la arma el servidor con la sesión del owner en
// cada carga de la página, y el owner es quien puede leer su carpeta.
const UNA_HORA = 60 * 60;

// El detalle de un service: el cartón tal cual lo ve el cliente —es
// literalmente el mismo componente— más la metadata operativa que el
// cliente no ve, y el estado de la ventana de edición.
export default async function PaginaService({ params, searchParams }: Props) {
  const { serviceId } = await params;
  const { adjuntar } = await searchParams;
  const supabase = await createClient();
  // La sesión y el trabajo no dependen uno del otro: van en el mismo viaje.
  const [sesion, serviceRes, configRes, configNeumRes] = await Promise.all([
    obtenerSesion(),
    supabase
      .from("services")
      .select(
        `id, tipo, trabajo_descripcion, fecha, created_at, kilometros,
         aceite_tipo, aceite_nombre, alineacion,
         beneficio_hasta_km, beneficio_hasta_fecha,
         prox_service_km, prox_caja_km, observaciones, anulado, desbloqueado_hasta,
         cargado_con_id,
         vehiculos(patente, marca, modelo, clase, cliente_id, clientes(nombre)),
         sucursales(nombre),
         usuarios!usuario_id(nombre),
         service_items(item_tipo, detalle, cambiado, cantidad, productos(nombre, marca)),
         service_ruedas(posicion, posicion_anterior, colocada, rotada, balanceada,
                        reparada, marca, medida, indice_carga_vel, dot,
                        profundidad_mm, presion_psi, productos(nombre, marca)),
         adjuntos_trabajo(id, nombre, ruta, mime, bytes, visible_cliente, created_at)`,
      )
      .eq("id", serviceId)
      .order("created_at", { referencedTable: "adjuntos_trabajo", ascending: true })
      .maybeSingle(),
    supabase.from("config_experiencia").select("color_primario, color_carton").maybeSingle(),
    // El interruptor del beneficio: con beneficio_km = 0 la línea no se
    // dibuja, tampoco en los trabajos que ya lo tenían guardado. Mismo
    // criterio que get_carton para el cliente.
    supabase.from("config_neumaticos").select("beneficio_km").maybeSingle(),
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

  // Los adjuntos, con una URL firmada cada uno para abrirlos desde acá. El
  // bucket es privado: no hay URL pública, y firma quien puede leer (el
  // owner, su carpeta). Si Storage no contesta, el adjunto se lista igual,
  // sin enlace.
  const filasAdjuntos = service.adjuntos_trabajo ?? [];

  // La pareja y las firmas dependen del trabajo y no una de la otra: van en
  // el mismo viaje.
  const [parejaRes, firmas] = await Promise.all([
    // La otra mitad de la visita, si este trabajo nació en una carga doble:
    // el service de una mecánica adjunta, o la mecánica adjunta de un
    // service. Son dos trabajos con sus plazos (24 horas / 7 días); acá solo
    // se muestran juntos y el anular avisa del otro.
    // En las dos direcciones se ignora la mitad anulada: un service anulado
    // no es «misma visita» de nadie, y el diálogo de anular no puede mandar
    // a anular lo que ya está anulado.
    service.cargado_con_id
      ? supabase
          .from("services")
          .select("id, tipo, fecha, trabajo_descripcion")
          .eq("id", service.cargado_con_id)
          .eq("anulado", false)
          .maybeSingle()
      : service.tipo === "service"
        ? supabase
            .from("services")
            .select("id, tipo, fecha, trabajo_descripcion")
            .eq("cargado_con_id", service.id)
            .eq("anulado", false)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
        : null,
    filasAdjuntos.length > 0
      ? supabase.storage
          .from("adjuntos")
          .createSignedUrls(
            filasAdjuntos.map((a) => a.ruta),
            UNA_HORA,
          )
      : null,
  ]);
  const pareja = parejaRes?.data ?? null;
  const urlPorRuta = new Map(
    (firmas?.data ?? []).map((f) => [f.path, f.error ? null : f.signedUrl]),
  );
  const adjuntos: AdjuntoDelTrabajo[] = filasAdjuntos.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    mime: a.mime,
    bytes: a.bytes,
    creado: a.created_at,
    visibleCliente: a.visible_cliente,
    url: urlPorRuta.get(a.ruta) ?? null,
  }));

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
        // El «×2» del papel: es el mismo componente que ve el cliente, y a
        // él get_carton le manda la cantidad.
        cantidad: Number(i.cantidad),
      },
    ]),
  );

  // Las ruedas del trabajo de gomería, para el papel. Mismo criterio que
  // el resto: la marca escrita manda, y si la cubierta salió del catálogo
  // se muestra la suya.
  const ruedasPapel = (service.service_ruedas ?? []).map((r) => ({
    posicion: r.posicion,
    posicionAnterior: r.posicion_anterior,
    colocada: r.colocada,
    rotada: r.rotada,
    balanceada: r.balanceada,
    reparada: r.reparada,
    marca: r.marca ?? r.productos?.marca ?? r.productos?.nombre ?? null,
    medida: r.medida,
    indiceCargaVel: r.indice_carga_vel,
    dot: r.dot,
    profundidadMm: r.profundidad_mm,
    presionPsi: r.presion_psi,
  }));

  // EL PAPEL, POR TIPO. Un mapa y no un ternario: escrito como «si es
  // gomería… si es mecánica… si no, el cartón de aceite», el cuarto tipo
  // —el service de caja— caía en el cartón de aceite sin dar error. Con el
  // Record, un tipo nuevo no compila hasta que alguien le dé su papel.
  const marca = {
    lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
    colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
    colorPapel: configRes.data?.color_carton ?? null,
  };
  const PAPEL_POR_TIPO: Record<TipoTrabajo, () => React.ReactNode> = {
    neumaticos: () => (
      <CartonPapelNeumaticos
        datos={{
          ...marca,
          fecha: service.fecha,
          kilometros: service.kilometros,
          alineacion: service.alineacion ?? false,
          ruedas: ruedasPapel,
          beneficio:
            (configNeumRes.data?.beneficio_km ?? 0) > 0 &&
            service.beneficio_hasta_km != null &&
            service.beneficio_hasta_fecha
              ? {
                  hastaKm: service.beneficio_hasta_km,
                  hastaFecha: service.beneficio_hasta_fecha,
                }
              : null,
        }}
      />
    ),
    mecanica: () => (
      <CartonPapelMecanica
        datos={{
          ...marca,
          fecha: service.fecha,
          kilometros: service.kilometros,
          descripcion: service.trabajo_descripcion ?? "",
          renglones: renglonesLibres,
        }}
      />
    ),
    service: () => (
      <CartonPapel
        datos={{
          ...marca,
          fecha: service.fecha,
          kilometros: service.kilometros ?? 0,
          aceiteTipo: service.aceite_tipo ?? "",
          aceiteNombre: service.aceite_nombre,
          proxServiceKm: service.prox_service_km ?? 0,
          marcados,
          // El papel de referencia es el de la clase del vehículo:
          // los 20 de un camión, marcados o no.
          clase: service.vehiculos?.clase ?? null,
        }}
      />
    ),
    // El service de caja: la misma hoja, con su aceite, sus cuatro
    // renglones y su próximo.
    caja: () => (
      <CartonPapelCaja
        datos={{
          ...marca,
          fecha: service.fecha,
          kilometros: service.kilometros ?? 0,
          aceiteTipo: service.aceite_tipo ?? "",
          aceiteNombre: service.aceite_nombre,
          proxCajaKm: service.prox_caja_km ?? 0,
          marcados,
        }}
      />
    ),
  };

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
            {/* El sello del tipo. El service también lleva el suyo: con
                tres tipos, dejar uno sin etiquetar es confuso. */}
            <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-ui text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
              {ETIQUETA_TIPO[service.tipo]}
            </span>
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
                  {restanteEnPalabras(estado.horasRestantes)}
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
              pareja={
                pareja
                  ? {
                      href: `/panel/services/${pareja.id}`,
                      esService: pareja.tipo === "service",
                    }
                  : null
              }
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
          {/* El plazo es del tipo: las 24 horas de un service, los 7 días
              de una mecánica. Lo dice plazoEdicionConArticulo, el espejo
              de plazo_edicion() en la base. */}
          <p className="mt-1 text-ui text-ink-60">
            Después de {plazoEdicionConArticulo(service.tipo)} el trabajo
            queda fijado en el historial y ni el lubricentro puede
            modificarlo — es lo que hace confiable el cartón para tu
            cliente. Si hay un error grave,{" "}
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
          {PAPEL_POR_TIPO[service.tipo]()}
        </div>

        <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-4">
          {/* Lo que el cliente no ve: quién, cuándo, dónde */}
          <dl className="surface-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 p-4 text-ui sm:p-5">
            <dt className="text-ink-60">Cargado por</dt>
            <dd className="text-ink">{service.usuarios?.nombre ?? "—"}</dd>
            <dt className="text-ink-60">Cuándo</dt>
            <dd className="text-ink tabular-nums">
              {formatearFechaHora(service.created_at)}
            </dd>
            <dt className="text-ink-60">Sucursal</dt>
            <dd className="text-ink">{service.sucursales?.nombre ?? "—"}</dd>
            {pareja && (
              <>
                <dt className="text-ink-60">Misma visita</dt>
                <dd className="text-ink">
                  <Link
                    href={`/panel/services/${pareja.id}`}
                    className="underline underline-offset-4 hover:text-ink-60"
                  >
                    {pareja.tipo === "service"
                      ? `El service del ${formatearFecha(pareja.fecha)}`
                      : `Una mecánica: ${descripcionEnUnaLinea(pareja.trabajo_descripcion) ?? ""}`}
                  </Link>
                </dd>
              </>
            )}
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

          {/* Los adjuntos: el PDF o la foto del diagnóstico. Está SIEMPRE,
              sin mirar el estado de la ventana de arriba: adjuntar no edita
              el cartón, así que no se fija con él. */}
          <AdjuntosTrabajo
            serviceId={service.id}
            adjuntos={adjuntos}
            soloLectura={sesion?.suspendido === true}
            anulado={estado.tipo === "anulado"}
            resaltar={adjuntar === "1"}
          />
        </div>
      </div>
    </div>
  );
}
