import Link from "next/link";
import { FilaListado } from "@/components/ui/fila-listado";
import { formatearFecha } from "@/lib/fechas";

type ClienteListado = {
  id: string;
  nombre: string;
  telefono: string;
  cantidad_vehiculos: number;
  ultimo_service_fecha: string | null;
  ultima_visita_fecha?: string | null;
};

export function FilaCliente({ cliente }: { cliente: ClienteListado }) {
  const vehiculos =
    cliente.cantidad_vehiculos === 1
      ? "1 vehículo"
      : `${cliente.cantidad_vehiculos} vehículos`;

  return (
    <FilaListado>
      {/* La fila entera lleva a la ficha: el objetivo táctil es el renglón,
          no un link chiquito dentro. */}
      <Link
        href={`/panel/clientes/${cliente.id}`}
        className="-mx-2 flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md px-2 py-1 transition-colors hover:bg-surface"
      >
        <span className="min-w-0">
          <span className="block truncate font-brand text-body font-bold text-ink">
            {cliente.nombre}
          </span>
          <span className="block truncate text-ui text-ink-60">
            {cliente.telefono}
          </span>
        </span>

        <span className="text-ui text-ink-60 sm:text-right">
          <span className="block">{vehiculos}</span>
          <span className="block text-label">
            {cliente.ultima_visita_fecha &&
            cliente.ultima_visita_fecha !== cliente.ultimo_service_fecha
              ? `Última visita ${formatearFecha(cliente.ultima_visita_fecha)} · último service ${formatearFecha(cliente.ultimo_service_fecha ?? cliente.ultima_visita_fecha)}`
              : cliente.ultimo_service_fecha
              ? `Último service ${formatearFecha(cliente.ultimo_service_fecha)}`
              : "Sin services"}
          </span>
        </span>
      </Link>
    </FilaListado>
  );
}
