import Link from "next/link";
import { DialogVehiculo } from "@/components/vehiculos/dialog-vehiculo";
import {
  NotasVehiculo,
  type NotaDelVehiculo,
} from "@/components/notas/notas-vehiculo";
import { BadgeEstado } from "@/components/services/badge-estado";
import { IconoPremio } from "@/components/iconos";
import { formatearFecha } from "@/lib/fechas";
import { formatearKm } from "@/lib/renglones";
import type { EstadoService } from "@/lib/servicios";

type ServiceDelVehiculo = {
  id: string;
  fecha: string;
  kilometros: number;
  aceite: string;
  sucursal: string;
  estado: EstadoService;
};

type Fidelizacion = {
  disponible: boolean;
  servicesCiclo: number;
  metaServices: number;
  descripcion: string;
};

type Canje = {
  id: string;
  fecha: string;
  serviceId: string | null;
  descripcion: string;
};

type Vehiculo = {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  cantidad_services: number;
  ultimo_service_fecha: string | null;
  services?: ServiceDelVehiculo[];
  fidelizacion?: Fidelizacion | null;
  canjes?: Canje[];
  patenteBloqueada?: boolean;
  notas?: NotaDelVehiculo[];
};

// El progreso del ciclo y los canjes ya hechos. El dorado es el único
// amarillo del sistema y significa premio en todo el producto.
function Fidelizacion({ vehiculo }: { vehiculo: Vehiculo }) {
  const f = vehiculo.fidelizacion;
  if (!f) return null;

  const porcentaje = Math.min(
    100,
    Math.round((f.servicesCiclo / Math.max(1, f.metaServices)) * 100),
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-ui font-semibold text-ink tabular-nums">
          {f.disponible
            ? `${f.servicesCiclo} de ${f.metaServices} services`
            : `Vas ${f.servicesCiclo} de ${f.metaServices} services`}
        </span>
        <span className="h-2 min-w-24 flex-1 overflow-hidden rounded-sm border border-line bg-surface">
          <span
            className={`block h-full rounded-sm ${f.disponible ? "bg-reward" : "bg-ink"}`}
            style={{ width: `${porcentaje}%` }}
          />
        </span>
        {f.disponible ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-reward bg-reward-soft px-2.5 py-1 text-label font-semibold text-reward">
            <IconoPremio aria-hidden className="size-4 shrink-0" />
            PREMIO DISPONIBLE
          </span>
        ) : (
          <span className="text-ui text-ink-60">{f.descripcion}</span>
        )}
      </div>

      {(vehiculo.canjes?.length ?? 0) > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1">
          {vehiculo.canjes!.map((c) => (
            <li key={c.id} className="text-ui text-ink-60 tabular-nums">
              Canjeado {formatearFecha(c.fecha)} — {c.descripcion}
              {c.serviceId && (
                <>
                  {" · "}
                  <Link
                    href={`/panel/services/${c.serviceId}`}
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    ver el service
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
    <li className="rounded-lg border border-line bg-base px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
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
      </div>

      <Fidelizacion vehiculo={vehiculo} />

      {/* Las recomendaciones sobre EL AUTO — sobreviven al service. */}
      <NotasVehiculo vehiculoId={vehiculo.id} notas={vehiculo.notas ?? []} />

      {/* El historial del hi-fi (pantalla 4): cada service con su estado,
          y la fila entera lleva al cartón. */}
      {(vehiculo.services?.length ?? 0) > 0 && (
        <ul className="mt-3 border-t border-line">
          {vehiculo.services!.map((s) => (
            <li key={s.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/panel/services/${s.id}`}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-surface/60 lg:grid lg:grid-cols-[6.5rem_6rem_1fr_9rem_auto] ${
                  s.estado.tipo === "anulado" ? "opacity-55" : ""
                }`}
              >
                <span className="text-ui font-semibold text-ink tabular-nums">
                  {formatearFecha(s.fecha)}
                </span>
                <span className="text-ui text-ink-60 tabular-nums">
                  {formatearKm(s.kilometros)} km
                </span>
                <span className="hidden truncate text-ui text-ink-60 sm:inline">
                  {s.aceite}
                </span>
                <span className="text-label text-ink-60 lg:text-ui">
                  {s.sucursal}
                </span>
                <span className="ml-auto lg:ml-0 lg:justify-self-end">
                  <BadgeEstado estado={s.estado} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
