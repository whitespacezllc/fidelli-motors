import Link from "next/link";
import { DialogVehiculo } from "@/components/vehiculos/dialog-vehiculo";
import { InsigniaMarca } from "@/components/vehiculos/insignia-marca";
// (el link de presupuesto por vehículo vive abajo, gateado por plan)
import {
  NotasVehiculo,
  type NotaDelVehiculo,
} from "@/components/notas/notas-vehiculo";
import {
  PendientesVehiculo,
  type PendienteDelVehiculo,
} from "@/components/pendientes/pendientes-vehiculo";
import { BadgeEstado } from "@/components/services/badge-estado";
import { IconoPremio } from "@/components/iconos";
import { formatearFecha } from "@/lib/fechas";
import { formatearKm } from "@/lib/renglones";
import type { EstadoService } from "@/lib/servicios";

type ServiceDelVehiculo = {
  id: string;
  tipo: "service" | "mecanica";
  fecha: string;
  kilometros: number | null;
  /** El aceite del service, o la descripción del trabajo de mecánica. */
  aceite: string;
  sucursal: string;
  estado: EstadoService;
};

type Fidelizacion = {
  disponible: boolean;
  servicesCiclo: number;
  metaServices: number;
  /** Qué avanza el ciclo: el contador nombra lo que de verdad suma. */
  alcance?: "services" | "todos";
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
  cantidad_trabajos: number;
  ultimo_service_fecha: string | null;
  /** El último trabajo de CUALQUIER tipo. Distinto del último service
   *  cuando el auto pasó por mecánica después del cambio de aceite. */
  ultima_visita_fecha?: string | null;
  services?: ServiceDelVehiculo[];
  fidelizacion?: Fidelizacion | null;
  canjes?: Canje[];
  primerServiceEn?: string | null;
  notas?: NotaDelVehiculo[];
  /** undefined = el plan no trae pendientes: la sección no existe. */
  pendientes?: PendienteDelVehiculo[];
  /** El plan trae presupuestos: aparece el atajo con el destino cargado. */
  puedePresupuestos?: boolean;
  clienteId?: string;
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
            ? `${f.servicesCiclo} de ${f.metaServices} ${f.alcance === "todos" ? "trabajos" : "services"}`
            : `Vas ${f.servicesCiclo} de ${f.metaServices} ${f.alcance === "todos" ? "trabajos" : "services"}`}
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
  marcas,
}: {
  vehiculo: Vehiculo;
  clienteId: string;
  marcas: string[];
}) {
  // Con marca: la insignia tipográfica + el modelo. Sin marca, el nombre
  // de siempre — un auto sin marca funciona idéntico a hoy.
  const nombre = vehiculo.modelo || (vehiculo.marca ? "" : "Vehículo");

  const identificacion = [
    // La patente se guarda como la escribió el mecánico; se muestra siempre
    // en mayúscula para que el listado se lea parejo.
    vehiculo.patente.toUpperCase(),
    vehiculo.anio ? String(vehiculo.anio) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // LAS DOS PREGUNTAS, con nombres distintos y sin ambigüedad: el último
  // SERVICE gobierna el próximo cambio de aceite; la última VISITA es el
  // último trabajo de cualquier tipo. Sin la segunda, un auto atendido
  // ayer por frenos mostraría una fecha vieja y el sistema parecería roto.
  // El conteo es de TRABAJOS (los dos tipos): en un taller, "2 services"
  // con cinco visitas mentía por omisión. El "último service" se queda:
  // es el que gobierna el próximo cambio de aceite.
  const services =
    vehiculo.cantidad_trabajos === 0
      ? "Sin trabajos"
      : `${vehiculo.cantidad_trabajos} ${
          vehiculo.cantidad_trabajos === 1 ? "trabajo" : "trabajos"
        }${
          vehiculo.ultimo_service_fecha
            ? ` · último service ${formatearFecha(vehiculo.ultimo_service_fecha)}`
            : ""
        }`;
  const visita =
    vehiculo.ultima_visita_fecha &&
    vehiculo.ultima_visita_fecha !== vehiculo.ultimo_service_fecha
      ? `Última visita ${formatearFecha(vehiculo.ultima_visita_fecha)}`
      : null;

  return (
    <li className="rounded-lg border border-line bg-base px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-brand text-body font-bold text-ink">
            <InsigniaMarca marca={vehiculo.marca} />
            <span className="truncate">{nombre}</span>
          </p>
          <p className="plate mt-0.5 truncate text-ui text-ink-60">
            {identificacion}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-right text-ui text-ink-60 tabular-nums">
            {services}
            {visita && (
              <span className="block text-label text-ink-60">{visita}</span>
            )}
          </span>
          {vehiculo.puedePresupuestos && (
            <Link
              href={`/panel/presupuestos/nuevo?cliente=${clienteId}&vehiculo=${vehiculo.id}`}
              className="flex min-h-9 items-center rounded-md border border-line px-2.5 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink"
            >
              Presupuesto
            </Link>
          )}
          <DialogVehiculo
            clienteId={clienteId}
            vehiculo={vehiculo}
            marcas={marcas}
          />
        </div>
      </div>

      <Fidelizacion vehiculo={vehiculo} />

      {/* Las recomendaciones sobre EL AUTO — sobreviven al service. */}
      <NotasVehiculo vehiculoId={vehiculo.id} notas={vehiculo.notas ?? []} />

      {/* Los compromisos con vencimiento. Solo si el plan trae la feature:
          undefined = ni el título aparece. */}
      {vehiculo.pendientes !== undefined && (
        <PendientesVehiculo
          vehiculoId={vehiculo.id}
          pendientes={vehiculo.pendientes}
        />
      )}

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
                {s.tipo === "mecanica" ? (
                  <span className="text-label text-ink-60">
                    <span className="rounded-sm border border-line bg-surface px-2 py-0.5 font-semibold tracking-[0.04em] uppercase">
                      Mecánica
                    </span>
                  </span>
                ) : (
                  <span className="text-ui text-ink-60 tabular-nums">
                    {formatearKm(s.kilometros ?? 0)} km
                  </span>
                )}
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
  marcas = [],
}: {
  clienteId: string;
  vehiculos: Vehiculo[];
  marcas?: string[];
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
            <DialogVehiculo clienteId={clienteId} marcas={marcas} variante="primario" />
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {vehiculos.map((v) => (
              <TarjetaVehiculo
                key={v.id}
                vehiculo={v}
                clienteId={clienteId}
                marcas={marcas}
              />
            ))}
          </ul>
          <div className="mt-3">
            <DialogVehiculo clienteId={clienteId} marcas={marcas} />
          </div>
        </>
      )}
    </section>
  );
}
