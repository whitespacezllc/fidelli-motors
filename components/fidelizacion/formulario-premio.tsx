"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  guardarPremio,
  type EstadoPremio,
} from "@/app/panel/fidelizacion/actions";
import { META_MINIMA, META_MAXIMA } from "@/lib/fidelizacion";

const ESTADO_INICIAL: EstadoPremio = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

export type Premio = {
  metaServices: number;
  descripcion: string;
  activo: boolean;
} | null;

export function FormularioPremio({
  premio,
  /** Cuántos vehículos quedarían con premio disponible por cada meta. */
  impactoPorMeta,
  enProgreso,
}: {
  premio: Premio;
  impactoPorMeta: Record<number, number>;
  enProgreso: number;
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarPremio,
    ESTADO_INICIAL,
  );

  const metaOriginal = premio?.metaServices ?? 3;
  const [meta, setMeta] = useState(metaOriginal);

  const disponiblesHoy = impactoPorMeta[metaOriginal] ?? 0;
  const disponiblesConLaNueva = impactoPorMeta[meta] ?? 0;
  const cambiaLaMeta = meta !== metaOriginal;
  const diferencia = disponiblesConLaNueva - disponiblesHoy;

  return (
    <form action={accion} className="flex flex-col gap-5">
      {/* La advertencia va visible, no escondida: es lo que reemplaza la
          complejidad del grandfathering. El sistema calcula siempre contra
          la meta vigente, así que un cambio mueve a todos de una vez. */}
      <div className="rounded-lg border border-urgente bg-urgente-soft p-4">
        <p className="font-brand text-body font-bold text-ink">
          Antes de cambiar las reglas
        </p>
        <p className="mt-1.5 text-ui text-ink-60">
          Recomendamos definir las metas del programa una sola vez y sostenerlas
          en el tiempo. Los cambios se aplican de inmediato para todos los
          vehículos —incluidos los que están en progreso y los que ya tienen un
          premio disponible sin canjear. Cambiar las reglas seguido confunde a
          tus clientes y desgasta la confianza en el programa.
        </p>
      </div>

      {estado.error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
          Listo, el programa quedó guardado.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
        <div>
          <label htmlFor="meta" className={CLASE_LABEL}>
            Cada cuántos services
          </label>
          <input
            id="meta"
            name="meta"
            type="number"
            inputMode="numeric"
            min={META_MINIMA}
            max={META_MAXIMA}
            required
            value={meta}
            onChange={(e) => setMeta(Number(e.target.value))}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
          <p className="mt-1.5 text-label text-ink-60">
            De {META_MINIMA} a {META_MAXIMA}
          </p>
        </div>

        <div>
          <label htmlFor="descripcion" className={CLASE_LABEL}>
            Qué se lleva el cliente
          </label>
          <input
            id="descripcion"
            name="descripcion"
            required
            minLength={3}
            defaultValue={premio?.descripcion ?? ""}
            placeholder="25% de descuento en el próximo service"
            className={CLASE_CAMPO}
          />
          <p className="mt-1.5 text-label text-ink-60">
            Se lo va a ver el cliente tal cual, en su cartón digital.
          </p>
        </div>
      </div>

      {/* El impacto hace tangible la advertencia: el número que cambia se
          ve antes de guardar, no después. */}
      <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
        <p className="text-ui text-ink-60 tabular-nums">
          Hoy:{" "}
          <span className="font-semibold text-ink">{enProgreso} vehículos</span>{" "}
          en progreso ·{" "}
          <span className="font-semibold text-ink">
            {disponiblesHoy} con premio disponible
          </span>
        </p>
        {cambiaLaMeta && (
          <p className="mt-2 text-ui text-urgente tabular-nums">
            Con la meta en {meta}:{" "}
            <span className="font-semibold">
              {disponiblesConLaNueva} con premio disponible
            </span>
            {diferencia !== 0 && (
              <>
                {" "}
                — {Math.abs(diferencia)}{" "}
                {Math.abs(diferencia) === 1 ? "vehículo" : "vehículos"}{" "}
                {diferencia > 0 ? "pasarían a tenerlo" : "dejarían de tenerlo"}{" "}
                al instante.
              </>
            )}
          </p>
        )}
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={premio?.activo ?? true}
          className="size-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="text-body text-ink">Programa activo</span>
      </label>

      <Boton type="submit" tam="lg" disabled={pendiente} className="sm:self-start">
        {pendiente ? "Guardando…" : "Guardar programa"}
      </Boton>
    </form>
  );
}
