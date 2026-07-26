import Link from "next/link";
import { BadgeUrgencia } from "@/components/proximos/badge-urgencia";
import { CheckContactado } from "@/components/proximos/check-contactado";
import { BotonWhatsapp } from "@/components/proximos/boton-whatsapp";
import { formatearKm } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import type { EstadoContacto } from "@/lib/contacto";

export type ProximoServicio = {
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

export function FilaProximo({ fila }: { fila: ProximoServicio }) {
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
      </div>

      {/* 3. Último service — en mobile es dato de respaldo, no de decisión */}
      <div className="mt-2 hidden lg:mt-0 lg:block">
        <span className={`block ${CLASE_DATO}`}>
          {formatearFecha(fila.ultimoServiceFecha)} ·{" "}
          {formatearKm(fila.ultimoServiceKm)}
        </span>
        <span className="block truncate text-label text-ink-40">
          {fila.sucursal}
        </span>
      </div>

      {/* 4. Próximo service — el km declarado por el mecánico */}
      <div className="hidden lg:block">
        <span className={CLASE_DATO}>{formatearKm(fila.proxServiceKm)}</span>
      </div>

      {/* 5. Retorno estimado */}
      <div className="mt-2 lg:mt-0">
        <span className="lg:hidden">
          <span className="text-ui text-ink-60">Vuelve cerca del </span>
          <span className="text-ui font-semibold text-ink tabular-nums">
            {formatearFecha(fila.fechaEstimada)}
          </span>
        </span>
        <span className={`hidden lg:inline ${CLASE_DATO}`}>
          {formatearFecha(fila.fechaEstimada)}
        </span>
        {/* Un solo service: el ritmo todavía no se puede medir y la fecha
            sale del default de 40 km/día. Se avisa para que el lubri sepa
            cuánto pesa el dato. */}
        {fila.estimacionInicial && (
          <span className="mt-1 block text-label text-ink-40">
            estimación inicial
          </span>
        )}
      </div>

      {/* 6. Estado */}
      <div className="mt-2 lg:mt-0">
        <BadgeUrgencia estado={fila.estado} />
      </div>

      {/* 7. Contactado */}
      <div className="mt-1 lg:mt-0 lg:justify-self-center">
        <CheckContactado
          vehiculoId={fila.vehiculoId}
          estado={fila.estado}
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
            estado={fila.estado}
            link={fila.linkWhatsapp}
            contactado={fila.contactado}
            cliente={fila.clienteNombre}
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
