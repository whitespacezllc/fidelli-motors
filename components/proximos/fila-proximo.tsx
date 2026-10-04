import Link from "next/link";
import { BadgeUrgencia } from "@/components/proximos/badge-urgencia";
import { CheckContactado } from "@/components/proximos/check-contactado";
import { BotonWhatsapp } from "@/components/proximos/boton-whatsapp";
import { formatearKm } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import { clienteSuprimido, sinNombre, sinTelefono } from "@/lib/clientes";
import {
  etiquetaMotivo,
  type EstadoContacto,
  type MotivoContacto,
  type MotivoNeumaticos,
} from "@/lib/contacto";

export type ProximoServicio = {
  /** De dónde viene la fila: el motor de retención, un pendiente, el
   *  retorno de gomería o el próximo service de caja. */
  fuente?: "service" | "pendiente" | "neumaticos" | "caja";
  pendienteId?: string;
  /** Los motivos dados del retorno de gomería (solo neumáticos). */
  motivos?: MotivoNeumaticos[];
  /** El año del DOT más viejo, para "Cubiertas de 2019". */
  anioDot?: number | null;
  /** La profundidad más baja, para "Dibujo al límite: 2,5 mm". */
  mmMinimo?: number | null;
  /** A qué km toca la rotación, si es uno de los motivos. */
  kmObjetivo?: number | null;
  /** Qué quedó por hacer (solo pendientes). */
  descripcion?: string;
  /** Cuándo se anotó (solo pendientes). */
  creado?: string;
  objetivoKm?: number | null;
  kmFaltantes?: number | null;
  vehiculoId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  patente: string;
  vehiculo: string;
  /** En una caja, la fecha y los km de la ÚLTIMA CAJA. */
  ultimoServiceFecha: string;
  ultimoServiceKm: number;
  sucursal: string;
  /** En una caja, el próximo DE CAJA (prox_caja_km). */
  proxServiceKm: number;
  fechaEstimada: string;
  estimacionInicial: boolean;
  estado: EstadoContacto;
  contactado: boolean;
  /** null si no hay template activo o si el teléfono no sirve. */
  linkWhatsapp: string | null;
  /** Se distingue del anterior: sin template la culpa no es del teléfono. */
  telefonoValido: boolean;
};

const CLASE_DATO = "text-ui text-ink-60 tabular-nums";

export function FilaProximo({
  fila,
  suspendido = false,
}: {
  fila: ProximoServicio;
  suspendido?: boolean;
}) {
  const esPendiente = fila.fuente === "pendiente";
  const esNeumaticos = fila.fuente === "neumaticos";
  const esCaja = fila.fuente === "caja";
  // El motivo que se registra al contactar: el anti-spam del pendiente es
  // por motivo 'pendiente' y el de gomería por 'neumaticos', separados de
  // los tres estados del service. Un mapa por fuente, no un ternario.
  // La caja también va con SU motivo y no con el estado, aunque su fila
  // esté vencida, urgente o próxima: los tres estados son del cambio de
  // aceite, y usarlos tildaría la fila del service del mismo auto.
  const MOTIVO_POR_FUENTE: Record<
    "service" | "pendiente" | "neumaticos" | "caja",
    MotivoContacto
  > = {
    service: fila.estado,
    pendiente: "pendiente",
    neumaticos: "neumaticos",
    caja: "caja",
  };
  const motivo = MOTIVO_POR_FUENTE[fila.fuente ?? "service"];
  // El cliente de una planilla importada: «Sin nombre» y teléfono «-». El
  // nombre se muestra tal cual pero apagado (es un hueco, no un nombre), y
  // donde iba el WhatsApp va la única acción que destraba la fila.
  const nombreVacio = sinNombre(fila.clienteNombre);
  const faltaTelefono =
    sinTelefono(fila.clienteTelefono) &&
    !clienteSuprimido({ nombre: fila.clienteNombre, telefono: fila.clienteTelefono });
  // "Rotación y balanceo · Cubiertas de 2019": la línea secundaria de la
  // fila de gomería, con todos los motivos dados.
  const motivosTexto = esNeumaticos
    ? (fila.motivos ?? [])
        .map((m) =>
          etiquetaMotivo(m, {
            anioDot: fila.anioDot ?? null,
            mmMinimo: fila.mmMinimo ?? null,
          }),
        )
        .join(" · ")
    : "";
  return (
    <li
      className={`border-b border-line px-4 py-4 last:border-b-0 sm:px-5 lg:grid lg:grid-cols-[minmax(9rem,1fr)_7.5rem_11rem_6rem_9.5rem_6.5rem_5rem_auto] lg:items-center lg:gap-x-4 lg:py-3 ${
        fila.contactado ? "bg-surface/40" : ""
      }`}
    >
      {/* 1. Cliente */}
      <div className="min-w-0">
        <Link
          href={`/panel/clientes/${fila.clienteId}`}
          className={`block truncate font-brand text-body hover:underline lg:text-ui ${
            nombreVacio ? "text-ink-60" : "font-bold text-ink"
          }`}
        >
          {fila.clienteNombre}
        </Link>
        <span className={`block truncate ${CLASE_DATO} text-label lg:text-label`}>
          {sinTelefono(fila.clienteTelefono) ? "Sin teléfono" : fila.clienteTelefono}
        </span>
      </div>

      {/* 2. Vehículo. En mobile la patente sube al lado del cliente. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 lg:mt-0 lg:block">
        <span className="plate text-ui text-ink">
          {fila.patente.toUpperCase()}
        </span>
        <span className="truncate text-ui text-ink-60 lg:block lg:text-label">
          {fila.vehiculo}
        </span>
        {esPendiente && (
          <span className="mt-0.5 block w-full truncate text-ui text-ink lg:text-label">
            {fila.descripcion}
          </span>
        )}
        {esNeumaticos && (
          <span className="mt-0.5 block w-full truncate text-ui text-ink lg:text-label">
            {motivosTexto}
          </span>
        )}
      </div>

      {/* 3. Último service — en mobile es dato de respaldo, no de decisión.
          En una caja la fecha y los km son los de la última CAJA, no los
          del último cambio de aceite, y la celda lo dice: la cabecera de
          la columna es una sola para las cuatro fuentes. */}
      <div className="mt-2 hidden lg:mt-0 lg:block">
        {esCaja && (
          <span className="block text-label text-ink-60">
            Último service de caja
          </span>
        )}
        {esPendiente ? (
          <span className={`block ${CLASE_DATO}`}>
            anotado {fila.creado ? formatearFecha(fila.creado) : "—"}
          </span>
        ) : (
          <span className={`block ${CLASE_DATO}`}>
            {formatearFecha(fila.ultimoServiceFecha)} ·{" "}
            {formatearKm(fila.ultimoServiceKm)}
          </span>
        )}
        <span className="block truncate text-label text-ink-40">
          {fila.sucursal}
        </span>
      </div>

      {/* 4. Próximo service — el km declarado por el mecánico; en gomería,
          el km al que toca la rotación (si es uno de los motivos); en una
          caja, el próximo de caja, que ya viene en proxServiceKm. */}
      <div className="hidden lg:block">
        <span className={CLASE_DATO}>
          {esPendiente
            ? fila.objetivoKm
              ? formatearKm(fila.objetivoKm)
              : "—"
            : esNeumaticos
              ? fila.kmObjetivo
                ? formatearKm(fila.kmObjetivo)
                : "—"
              : formatearKm(fila.proxServiceKm)}
        </span>
      </div>

      {/* 5. Retorno estimado */}
      <div className="mt-2 lg:mt-0">
        <span className="lg:hidden">
          {esNeumaticos ? (
            <>
              <span className="text-ui text-ink-60">
                {motivosTexto} — vuelve cerca del{" "}
              </span>
              <span className="text-ui font-semibold text-ink tabular-nums">
                {fila.estimacionInicial ? "~" : ""}
                {formatearFecha(fila.fechaEstimada)}
              </span>
            </>
          ) : esPendiente ? (
            <>
              <span className="text-ui text-ink-60">
                {fila.descripcion} —{" "}
              </span>
              <span className="text-ui font-semibold text-ink tabular-nums">
                {fila.fechaEstimada
                  ? `para el ${formatearFecha(fila.fechaEstimada)}`
                  : fila.objetivoKm
                    ? `a los ${formatearKm(fila.objetivoKm)} km`
                    : ""}
              </span>
            </>
          ) : (
            <>
              <span className="text-ui text-ink-60">Vuelve cerca del </span>
              <span className="text-ui font-semibold text-ink tabular-nums">
                {fila.estimacionInicial ? "~" : ""}
                {formatearFecha(fila.fechaEstimada)}
              </span>
            </>
          )}
        </span>
        <span className={`hidden lg:inline ${CLASE_DATO}`}>
          {esPendiente
            ? fila.fechaEstimada
              ? formatearFecha(fila.fechaEstimada)
              : fila.kmFaltantes != null
                ? `faltan ${formatearKm(Math.max(fila.kmFaltantes, 0))} km`
                : "—"
            : `${fila.estimacionInicial ? "~" : ""}${formatearFecha(fila.fechaEstimada)}`}
        </span>
        {/* CON UN SOLO SERVICE LA FECHA NO ESTÁ CALCULADA, ESTÁ SUPUESTA:
            el ritmo del auto todavía no se puede medir y la vista asume 40
            km/día. Antes eso se decía "estimación inicial" en ink-40 —12px
            a 3.45:1, que no llega al AA de cuerpo— y quedaba igual de
            discreto que cualquier metadato. El punto es exactamente el
            contrario: que se note cuál fecha es medida y cuál no. Ahora lo
            dice en tinta legible y NOMBRA el supuesto, que es el dato que
            le permite al lubri decidir cuánto le cree. */}
        {fila.estimacionInicial && (
          <span
            title="Este auto tiene un solo service cargado, así que todavía no se puede medir cuánto usa el dueño. La fecha sale de suponer 40 km por día y se va a ajustar sola con el próximo service."
            className="mt-1 block text-label text-ink-60"
          >
            estimada: 40 km/día supuestos
          </span>
        )}
      </div>

      {/* 6. Estado */}
      <div className="mt-2 lg:mt-0">
        <BadgeUrgencia estado={fila.estado} />
        {esPendiente && (
          <span className="mt-1 block w-fit rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Pendiente
          </span>
        )}
        {esNeumaticos && (
          <span className="mt-1 block w-fit rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Neumáticos
          </span>
        )}
        {esCaja && (
          <span className="mt-1 block w-fit rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Caja
          </span>
        )}
      </div>

      {/* 7. Contactado */}
      <div className="mt-1 lg:mt-0 lg:justify-self-center">
        <CheckContactado
          vehiculoId={fila.vehiculoId}
          estado={motivo}
          contactado={fila.contactado}
          etiqueta={`Contactado — ${fila.clienteNombre}, ${fila.patente.toUpperCase()}`}
        />
      </div>

      {/* 8. La acción de la fila: compacta, del ancho de su contenido.
          El conjunto manda — diez botones estirados eran una columna de
          bloques; ahora la tabla respira y el deshabilitado marca solo
          lo que ya está hecho. */}
      <div className="mt-2.5 lg:mt-0 lg:justify-self-end">
        {fila.linkWhatsapp ? (
          <BotonWhatsapp
            vehiculoId={fila.vehiculoId}
            estado={motivo}
            link={fila.linkWhatsapp}
            contactado={fila.contactado}
            cliente={fila.clienteNombre}
            suspendido={suspendido}
          />
        ) : faltaTelefono && !suspendido ? (
          // Sin teléfono no hay a quién escribirle: la acción de la fila
          // pasa a ser cargarlo. Lleva a la ficha con «Editar datos» ya
          // abierto. Va antes que el template: con o sin plantilla, lo
          // primero que le falta a esta fila es el número.
          <Link
            href={`/panel/clientes/${fila.clienteId}?editar=telefono`}
            className="inline-flex min-h-11 items-center rounded-md border border-line bg-base px-3.5 text-ui font-semibold text-ink transition-colors hover:bg-surface"
          >
            Cargar teléfono
          </Link>
        ) : !fila.telefonoValido ? (
          // El único caso que es culpa del dato de esta fila. Cuando falta
          // el template activo, el aviso de arriba ya lo explica y acá no
          // se dice nada: echarle la culpa al teléfono sería mentir.
          <span className="text-label text-ink-40">Sin teléfono válido</span>
        ) : null}
      </div>
    </li>
  );
}
