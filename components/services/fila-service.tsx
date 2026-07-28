import Link from "next/link";
import { BadgeEstado } from "@/components/services/badge-estado";
import { formatearKm } from "@/lib/renglones";
import { formatearFechaHora } from "@/lib/fechas";
import type { EstadoService } from "@/lib/servicios";

export type ServiceListado = {
  id: string;
  creado: string;
  patente: string;
  vehiculo: string | null;
  cliente: string | null;
  sucursal: string;
  kilometros: number;
  estado: EstadoService;
};

// Fila del registro operativo. La fila entera es el link — el objetivo
// táctil grande es la fila, no un "ver" chiquito al costado. Los anulados
// se quedan en el listado (el registro no borra nada) pero atenuados.
export function FilaService({ service }: { service: ServiceListado }) {
  const anulado = service.estado.tipo === "anulado";

  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/panel/services/${service.id}`}
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-surface/60 lg:grid lg:grid-cols-[7.5rem_7rem_1fr_1fr_8.5rem_6rem_auto] ${
          anulado ? "opacity-55" : ""
        }`}
      >
        <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none">
          {formatearFechaHora(service.creado)}
        </span>
        <span className="plate order-1 text-ui text-ink lg:order-none">
          {service.patente.toUpperCase()}
        </span>
        <span className="order-3 truncate text-ui text-ink-60 lg:order-none">
          {service.vehiculo ?? "Vehículo"}
        </span>
        <span className="order-4 hidden truncate text-ui text-ink-60 sm:inline lg:order-none">
          {service.cliente ?? ""}
        </span>
        <span className="order-5 text-label text-ink-60 lg:order-none lg:text-ui">
          {service.sucursal}
        </span>
        <span className="order-6 text-ui text-ink-60 tabular-nums lg:order-none lg:text-right">
          {formatearKm(service.kilometros)} km
        </span>
        <span className="order-7 ml-auto lg:order-none lg:ml-0 lg:justify-self-end">
          <BadgeEstado estado={service.estado} />
        </span>
      </Link>
    </li>
  );
}
