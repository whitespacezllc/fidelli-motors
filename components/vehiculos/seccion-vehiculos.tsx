import { DialogVehiculo } from "@/components/vehiculos/dialog-vehiculo";
import { formatearFecha } from "@/lib/fechas";

type Vehiculo = {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  cantidad_services: number;
  ultimo_service_fecha: string | null;
};

// Tarjeta del hi-fi (pantalla 4): marca y modelo arriba, la patente con la
// utilidad .plate y el año al lado, y a la derecha el resumen de services.
function TarjetaVehiculo({
  vehiculo,
  clienteId,
}: {
  vehiculo: Vehiculo;
  clienteId: string;
}) {
  const nombre =
    [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo";

  const identificacion = [
    // La patente se guarda como la escribió el mecánico; se muestra siempre
    // en mayúscula para que el listado se lea parejo.
    vehiculo.patente.toUpperCase(),
    vehiculo.anio ? String(vehiculo.anio) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const services =
    vehiculo.cantidad_services === 0
      ? "Sin services"
      : `${vehiculo.cantidad_services} ${
          vehiculo.cantidad_services === 1 ? "service" : "services"
        }${
          vehiculo.ultimo_service_fecha
            ? ` · último ${formatearFecha(vehiculo.ultimo_service_fecha)}`
            : ""
        }`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-line bg-base px-5 py-4">
      <div className="min-w-0">
        <p className="truncate font-brand text-body font-bold text-ink">
          {nombre}
        </p>
        <p className="plate mt-0.5 truncate text-ui text-ink-60">
          {identificacion}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span className="text-ui text-ink-60 tabular-nums">{services}</span>
        <DialogVehiculo clienteId={clienteId} vehiculo={vehiculo} />
      </div>
    </li>
  );
}

export function SeccionVehiculos({
  clienteId,
  vehiculos,
}: {
  clienteId: string;
  vehiculos: Vehiculo[];
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
        Vehículos
      </h2>

      {vehiculos.length === 0 ? (
        <div className="surface-card px-6 py-8 text-center">
          <p className="text-ui text-ink-60">
            Este cliente todavía no tiene vehículos cargados.
          </p>
          <div className="mt-4 flex justify-center">
            <DialogVehiculo clienteId={clienteId} variante="primario" />
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {vehiculos.map((v) => (
              <TarjetaVehiculo key={v.id} vehiculo={v} clienteId={clienteId} />
            ))}
          </ul>
          <div className="mt-3">
            <DialogVehiculo clienteId={clienteId} />
          </div>
        </>
      )}
    </section>
  );
}
