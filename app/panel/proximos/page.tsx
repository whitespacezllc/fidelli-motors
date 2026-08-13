import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { IconoReloj, IconoPremio } from "@/components/iconos";
import { ContadorEstado } from "@/components/proximos/badge-urgencia";
import { FiltrosProximosServices } from "@/components/proximos/filtros-proximos";
import { FilaProximo, type ProximoServicio } from "@/components/proximos/fila-proximo";
import {
  linkWhatsapp,
  resolverTemplate,
  telefonoWhatsapp,
  type EstadoContacto,
} from "@/lib/contacto";
import { formatearKm } from "@/lib/renglones";

export const metadata: Metadata = { title: "Próximos services" };

// El orden es la pantalla: se trabaja de arriba a abajo sin decidir nada.
const PESO: Record<EstadoContacto, number> = { vencido: 0, urgente: 1, proximo: 2 };
const ESTADOS: EstadoContacto[] = ["vencido", "urgente", "proximo"];

type Params = { sucursal?: string; estado?: string };

// La pantalla donde el dueño cobra el retorno de lo que paga. Todo el
// cálculo —el estado, el ritmo del vehículo, la fecha estimada, y el check
// de contactado con su regla anti-spam por estado— ya viene resuelto de
// vista_proximos_service. Acá solo se ordena, se filtra y se arma el link.
export default async function PaginaProximos({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const suspendido = await panelSuspendido();
  const sesion = await obtenerSesion();

  const filtros = {
    sucursal: params.sucursal || undefined,
    estado: ESTADOS.includes(params.estado as EstadoContacto)
      ? (params.estado as EstadoContacto)
      : undefined,
  };

  let consulta = supabase
    .from("vista_proximos_service")
    .select(
      `vehiculo_id, patente, marca, modelo, cliente_id, cliente_nombre,
       cliente_telefono, ultimo_service_fecha, ultimo_service_km,
       prox_service_km, sucursal_id, sucursal_nombre, estimacion_inicial,
       fecha_estimada, estado, contactado`,
    );

  if (filtros.sucursal) consulta = consulta.eq("sucursal_id", filtros.sucursal);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);

  // Cuatro conjuntos distintos, en paralelo: las filas, el template con el
  // que se arma cada mensaje, las sucursales del filtro y la métrica del mes.
  const [filasRes, templateRes, sucursalesRes, recuperadosRes] =
    await Promise.all([
      consulta,
      supabase
        .from("mensaje_templates")
        .select("contenido")
        .eq("activo", true)
        .limit(1)
        .maybeSingle(),
      supabase.from("sucursales").select("id, nombre").order("nombre"),
      sesion?.lubricentroId
        ? supabase.rpc("recuperados_del_mes", {
            p_lubricentro_id: sesion.lubricentroId,
          })
        : Promise.resolve({ data: 0 }),
    ]);

  const template = templateRes.data?.contenido ?? null;
  const recuperados = (recuperadosRes.data as number | null) ?? 0;

  // Las columnas de una vista llegan tipadas como nullable: se acotan acá,
  // en el borde, en vez de repartir "!" por los componentes.
  const filas: ProximoServicio[] = (filasRes.data ?? []).flatMap((f) => {
    if (!f.vehiculo_id || !f.estado || !f.fecha_estimada) return [];

    const vehiculo =
      [f.marca, f.modelo].filter(Boolean).join(" ") || "el vehículo";
    const patente = (f.patente ?? "").toUpperCase();
    const telefono = f.cliente_telefono ?? "";

    // El mensaje sale del template activo con sus cuatro variables. Sin
    // template no hay link: el aviso de arriba lleva a configurarlo.
    const mensaje = template
      ? resolverTemplate(template, {
          nombre: (f.cliente_nombre ?? "").split(" ")[0],
          vehiculo,
          patente,
          proximo_km: formatearKm(f.prox_service_km ?? 0),
        })
      : null;

    return [
      {
        vehiculoId: f.vehiculo_id,
        clienteId: f.cliente_id ?? "",
        clienteNombre: f.cliente_nombre ?? "",
        clienteTelefono: telefono,
        patente,
        vehiculo,
        ultimoServiceFecha: f.ultimo_service_fecha ?? "",
        ultimoServiceKm: f.ultimo_service_km ?? 0,
        sucursal: f.sucursal_nombre ?? "",
        proxServiceKm: f.prox_service_km ?? 0,
        fechaEstimada: f.fecha_estimada,
        estimacionInicial: Boolean(f.estimacion_inicial),
        estado: f.estado as EstadoContacto,
        contactado: Boolean(f.contactado),
        linkWhatsapp: mensaje ? linkWhatsapp(telefono, mensaje) : null,
        telefonoValido: telefonoWhatsapp(telefono) !== null,
      },
    ];
  });

  // Vencidos arriba, después urgentes, después próximos; dentro de cada
  // estado, por fecha estimada. La vista no puede ordenar por el peso del
  // enum, así que se hace acá — son decenas de filas, no miles.
  filas.sort(
    (a, b) =>
      PESO[a.estado] - PESO[b.estado] ||
      a.fechaEstimada.localeCompare(b.fechaEstimada),
  );

  // Los contadores son del conjunto filtrado: si el lubri filtra por
  // sucursal, la cabecera cuenta el trabajo de esa sucursal.
  const conteos = {
    vencido: filas.filter((f) => f.estado === "vencido").length,
    urgente: filas.filter((f) => f.estado === "urgente").length,
    proximo: filas.filter((f) => f.estado === "proximo").length,
  };

  return (
    <div>
      <CabeceraSeccion titulo="Próximos services">
        {/* El único dorado del sistema: es la métrica que renueva la
            suscripción sola — el ROI a la vista. */}
        <span className="inline-flex items-center gap-2 rounded-md border border-reward bg-reward-soft px-3 py-1.5 text-ui text-reward">
          <IconoPremio aria-hidden className="size-5 shrink-0" />
          Recuperados este mes:{" "}
          <span className="font-brand text-lead font-bold tabular-nums">
            {recuperados}
          </span>
        </span>
      </CabeceraSeccion>

      {!template && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-urgente bg-urgente-soft p-4">
          <p className="text-ui text-ink">
            No tenés ningún mensaje activo, así que todavía no se puede
            contactar. Elegí el tono con el que querés escribirles.
          </p>
          <Link href="/panel/mensajes" className={clasesBoton("secundario", "md")}>
            Configurar mensajes
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS.map((e) => (
            <ContadorEstado key={e} estado={e} cantidad={conteos[e]} />
          ))}
        </div>
        <FiltrosProximosServices
          sucursales={sucursalesRes.data ?? []}
          filtros={filtros}
        />
      </div>

      {filas.length > 0 ? (
        <div className="surface-card">
          {/* La cabecera de columnas solo existe en desktop: en mobile cada
              fila es una tarjeta que se lee sola. */}
          <div className="hidden border-b border-line px-5 py-2.5 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase lg:grid lg:grid-cols-[minmax(9rem,1fr)_7.5rem_11rem_6rem_9.5rem_6.5rem_5rem_auto] lg:gap-x-4">
            <span>Cliente</span>
            <span>Vehículo</span>
            <span>Último service</span>
            <span>Próximo</span>
            <span>Retorno est.</span>
            <span>Estado</span>
            <span className="justify-self-center">Contactado</span>
            <span />
          </div>
          <ul>
            {filas.map((f) => (
              <FilaProximo key={f.vehiculoId} fila={f} suspendido={suspendido} />
            ))}
          </ul>
        </div>
      ) : filtros.sucursal || filtros.estado ? (
        <EstadoVacio
          titulo="Ningún vehículo con esos filtros"
          descripcion="Probá con otra sucursal o mirá todos los estados."
        >
          <Link href="/panel/proximos" className={clasesBoton("secundario", "md")}>
            Ver todos
          </Link>
        </EstadoVacio>
      ) : (
        // Sin trabajo pendiente se celebra: es la regla de los vacíos.
        <EstadoVacio
          icono={<IconoReloj className="size-6 text-success" />}
          titulo="Estás al día"
          descripcion="Ningún vehículo está cerca de su próximo service. Cuando alguno se acerque, aparece acá para que lo contactes con un tap."
        />
      )}
    </div>
  );
}
