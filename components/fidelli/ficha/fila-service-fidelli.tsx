"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton } from "@/components/ui/boton";
import { IconoCandado } from "@/components/iconos";
import { CLASE_ERROR } from "@/components/fidelli/estilos";
import { formatearFecha, formatearHora } from "@/lib/fechas";
import { horasParaBadge, type EstadoService } from "@/lib/servicios";
import {
  desbloquearService,
  type EstadoDesbloqueo,
} from "@/app/fidelli/[id]/actions";

const INICIAL: EstadoDesbloqueo = {};

const TD = "px-3 py-2.5 align-middle";

const BADGE =
  "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-label font-semibold tracking-[0.04em] uppercase whitespace-nowrap";

type ServiceFila = {
  id: string;
  fecha: string;
  patente: string;
  vehiculo: string | null;
  cliente: string | null;
  sucursal: string;
  kilometros: number;
  desbloqueadoPor: string | null;
};

// "hasta las 18:30" — la hora sola alcanza si es hoy, que es el caso normal
// de una ventana de 24 horas. formatearHora fija la zona argentina.
const horaCorta = formatearHora;

export function FilaServiceFidelli({
  lubricentroId,
  service,
  estado,
}: {
  lubricentroId: string;
  service: ServiceFila;
  estado: EstadoService;
}) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className={`${TD} whitespace-nowrap text-ink-60`}>
        {formatearFecha(service.fecha)}
      </td>
      <td className={`${TD} plate whitespace-nowrap text-ink`}>
        {service.patente}
      </td>
      <td className={TD}>
        {service.vehiculo ?? <span className="text-ink-40">sin marca</span>}
        {service.cliente && (
          <span className="block text-label text-ink-40">{service.cliente}</span>
        )}
      </td>
      <td className={`${TD} whitespace-nowrap text-ink-60`}>{service.sucursal}</td>
      <td className={`${TD} text-right whitespace-nowrap text-ink`}>
        {service.kilometros.toLocaleString("es-AR")}
      </td>
      <td className={TD}>
        <BadgeEdicion estado={estado} desbloqueadoPor={service.desbloqueadoPor} />
      </td>
      <td className={`${TD} text-right`}>
        {estado.tipo === "fijado" && (
          <DialogDesbloquear lubricentroId={lubricentroId} service={service} />
        )}
      </td>
    </tr>
  );
}

// El estado de edición, con la misma paleta que el panel del lubri: ámbar
// para lo que corre contra el reloj, gris para lo cerrado. Nunca rojo.
function BadgeEdicion({
  estado,
  desbloqueadoPor,
}: {
  estado: EstadoService;
  desbloqueadoPor: string | null;
}) {
  if (estado.tipo === "anulado") {
    return (
      <span className={`${BADGE} border-line bg-surface text-ink-40`}>anulado</span>
    );
  }

  if (estado.tipo === "editable") {
    return (
      <span className={`${BADGE} border-line bg-surface text-ink-60`}>
        abierto · {horasParaBadge(estado.horasRestantes)}
      </span>
    );
  }

  if (estado.tipo === "desbloqueado") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className={`${BADGE} border-urgente bg-urgente-soft text-urgente`}>
          desbloqueado · {horaCorta(estado.hasta)}
        </span>
        {desbloqueadoPor && (
          <span className="text-label text-ink-40">por {desbloqueadoPor}</span>
        )}
      </span>
    );
  }

  return (
    <span className={`${BADGE} border-line bg-surface text-ink-40`}>
      <IconoCandado className="mr-1 size-3" />
      fijado
    </span>
  );
}

function DialogDesbloquear({
  lubricentroId,
  service,
}: {
  lubricentroId: string;
  service: ServiceFila;
}) {
  const [abierto, setAbierto] = useState(false);

  // El dialog se cierra dentro de la acción, no en un efecto: cerrarse es
  // la consecuencia de haber desbloqueado.
  const [estado, desbloquear, desbloqueando] = useActionState(
    async (previo: EstadoDesbloqueo, formData: FormData) => {
      const r = await desbloquearService(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className="inline-flex min-h-8 items-center rounded-sm px-2 py-1 text-label font-semibold text-ink underline underline-offset-2 hover:bg-surface">
        Desbloquear
      </DialogTrigger>

      <DialogContenido titulo="Desbloquear este service">
        <form action={desbloquear} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="service_id" value={service.id} />
          <input type="hidden" name="lubricentro_id" value={lubricentroId} />

          {/* El contexto completo antes de confirmar: qué service, de qué
              vehículo y de qué fecha. Dos filas de la tabla se parecen
              demasiado como para confiar en el clic. */}
          <dl className="rounded-md border border-line bg-surface px-4 py-3 text-ui">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Vehículo</dt>
              <dd className="text-right">
                <span className="plate text-ink">{service.patente}</span>
                {service.vehiculo && (
                  <span className="text-ink-60"> · {service.vehiculo}</span>
                )}
              </dd>
            </div>
            {service.cliente && (
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-ink-60">Cliente</dt>
                <dd className="text-right text-ink">{service.cliente}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Fecha</dt>
              <dd className="text-right text-ink">
                {formatearFecha(service.fecha)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Kilómetros</dt>
              <dd className="text-right text-ink">
                {service.kilometros.toLocaleString("es-AR")} km
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Sucursal</dt>
              <dd className="text-right text-ink">{service.sucursal}</dd>
            </div>
          </dl>

          <p className="text-ui text-ink-60">
            Se abren{" "}
            <span className="font-semibold text-ink">24 horas</span> para que el
            lubricentro lo corrija. No lo corregimos nosotros: le devolvemos la
            posibilidad de hacerlo. Si necesita más tiempo, se vuelve a
            desbloquear.
          </p>

          <p className="text-label text-ink-60">
            Queda registrado quién lo desbloqueó y hasta cuándo.
          </p>

          <Boton
            type="submit"
            tam="lg"
            disabled={desbloqueando}
            className="w-full"
          >
            {desbloqueando ? "Desbloqueando…" : "Desbloquear 24 horas"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}
