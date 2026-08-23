import Link from "next/link";
import { BadgeUrgencia } from "@/components/proximos/badge-urgencia";
import { CheckContactado } from "@/components/proximos/check-contactado";
import { BotonWhatsapp } from "@/components/proximos/boton-whatsapp";
import { formatearKm } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import type { EstadoContacto } from "@/lib/contacto";

export type ProximoServicio = {
  /** De dónde viene la fila: el motor de retención o un pendiente. */
  fuente?: "service" | "pendiente";
  pendienteId?: string;
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
  ultimoServiceFecha: string;
  ultimoServiceKm: number;
  sucursal: string;
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
  // El motivo que se registra al contactar: el anti-spam del pendiente es
  // por motivo 'pendiente', separado de los tres estados del service.
  const motivo = esPendiente ? ("pendiente" as const) : fila.estado;
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
          className="block truncate font-brand text-body font-bold text-ink hover:underline lg:text-ui"
        >
          {fila.clienteNombre}
        </Link>
        <span className={`block truncate ${CLASE_DATO} text-label lg:text-label`}>
          {fila.clienteTelefono}
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
      </div>

      {/* 3. Último service — en mobile es dato de respaldo, no de decisión */}
      <div className="mt-2 hidden lg:mt-0 lg:block">
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

      {/* 4. Próximo service — el km declarado por el mecánico */}
      <div className="hidden lg:block">
        <span className={CLASE_DATO}>
          {esPendiente
            ? fila.objetivoKm
              ? formatearKm(fila.objetivoKm)
              : "—"
            : formatearKm(fila.proxServiceKm)}
        </span>
      </div>

      {/* 5. Retorno estimado */}
      <div className="mt-2 lg:mt-0">
        <span className="lg:hidden">
          {esPendiente ? (
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
