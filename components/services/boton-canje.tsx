"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui/boton";
import { marcarCanje, type EstadoCanje } from "@/app/panel/services/[serviceId]/guardado/actions";

const ESTADO_INICIAL: EstadoCanje = {};

export function BotonCanje({
  vehiculoId,
  premioId,
  serviceId,
}: {
  vehiculoId: string;
  premioId: string;
  serviceId: string;
}) {
  const [estado, accion, pendiente] = useActionState(marcarCanje, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <p className="mt-3 font-brand text-ui font-bold text-success">
        ✓ Canje registrado
      </p>
    );
  }

  return (
    <form action={accion} className="mt-3">
      <input type="hidden" name="vehiculo_id" value={vehiculoId} />
      <input type="hidden" name="premio_id" value={premioId} />
      <input type="hidden" name="service_id" value={serviceId} />
      {estado.error && (
        <p role="alert" className="mb-2 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      <Boton variante="secundario" type="submit" disabled={pendiente}>
        {pendiente ? "Registrando…" : "Marcar como canjeado"}
      </Boton>
    </form>
  );
}
