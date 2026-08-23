"use client";

import { useActionState, useState, useTransition } from "react";
import { Boton } from "@/components/ui/boton";
import {
  crearPendiente,
  cerrarPendiente,
  alternarVisiblePendiente,
  type EstadoPendienteForm,
} from "@/app/panel/pendientes/actions";
import { formatearFecha } from "@/lib/fechas";
import { formatearKm } from "@/lib/renglones";

export type PendienteDelVehiculo = {
  id: string;
  descripcion: string;
  objetivoFecha: string | null;
  objetivoKm: number | null;
  visibleCliente: boolean;
  creado: string;
};

const INICIAL: EstadoPendienteForm = {};
const CLASE_CAMPO =
  "h-11 w-full rounded-md border border-line bg-base px-3 text-ui text-ink placeholder:text-ink-40";

// Los compromisos abiertos del auto, en la ficha: el lugar donde se
// cargan sueltos ("me lo dijo por teléfono") y donde se cierran a mano.
// El cierre normal es tildarlos AL CARGAR un trabajo (viven en el cartón);
// esto es la administración, no el flujo caliente.
function FilaPendiente({ tp }: { tp: PendienteDelVehiculo }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  const cerrar = (como: "resuelto" | "descartado") =>
    empezar(async () => {
      setError(null);
      const r = await cerrarPendiente(tp.id, como);
      if (r.error) setError(r.error);
    });

  const alternarVisible = () =>
    empezar(async () => {
      setError(null);
      const r = await alternarVisiblePendiente(tp.id, !tp.visibleCliente);
      if (r.error) setError(r.error);
    });

  return (
    <li className="rounded-md border border-line bg-base px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body text-ink">{tp.descripcion}</p>
          <p className="mt-0.5 text-label text-ink-60 tabular-nums">
            anotado el {formatearFecha(tp.creado)}
            {tp.objetivoFecha ? ` · para el ${formatearFecha(tp.objetivoFecha)}` : ""}
            {tp.objetivoKm ? ` · a los ${formatearKm(tp.objetivoKm)} km` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => cerrar("resuelto")}
            disabled={ocupado}
            className="flex min-h-9 items-center rounded-md border border-line px-2.5 text-ui font-semibold text-ink hover:bg-surface"
          >
            ✓ Se hizo
          </button>
          <button
            type="button"
            onClick={() => cerrar("descartado")}
            disabled={ocupado}
            className="flex min-h-9 items-center rounded-md px-2 text-ui text-ink-60 hover:bg-surface"
          >
            Descartar
          </button>
        </div>
      </div>

      <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={tp.visibleCliente}
          onChange={alternarVisible}
          disabled={ocupado}
          className="size-4 shrink-0 cursor-pointer accent-ink"
        />
        <span className="text-ui text-ink-60">
          El cliente lo ve cuando escanea su calco
        </span>
      </label>

      {error && <p className="mt-2 text-ui text-overdue">{error}</p>}
    </li>
  );
}

export function PendientesVehiculo({
  vehiculoId,
  pendientes,
}: {
  vehiculoId: string;
  pendientes: PendienteDelVehiculo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState("");
  const [km, setKm] = useState("");
  const [visible, setVisible] = useState(false);

  const [estado, enviar, enviando] = useActionState(crearPendiente, INICIAL);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
          Trabajos pendientes
        </p>
        {!abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="min-h-9 text-ui font-semibold text-ink-60 hover:text-ink"
          >
            + Pendiente
          </button>
        )}
      </div>

      {pendientes.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {pendientes.map((tp) => (
            <FilaPendiente key={tp.id} tp={tp} />
          ))}
        </ul>
      ) : (
        !abierto && (
          <p className="mt-1.5 text-ui text-ink-60">
            Nada pendiente para este auto.
          </p>
        )
      )}

      {abierto && (
        <form
          action={() =>
            enviar({
              vehiculoId,
              descripcion,
              objetivoFecha: fecha || null,
              objetivoKm: km ? Number(km.replace(/\D/g, "")) : null,
              visibleCliente: visible,
            })
          }
          className="mt-2.5 rounded-md border border-line bg-surface/60 p-3"
        >
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué quedó por hacer — ej: pastillas de freno al 30%"
            aria-label="Qué quedó por hacer"
            className={CLASE_CAMPO}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha objetivo"
              className={`${CLASE_CAMPO} tabular-nums`}
            />
            <input
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="o a los… km"
              aria-label="Kilómetros objetivo"
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          </div>
          <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={visible}
              onChange={() => setVisible((v) => !v)}
              className="size-4 shrink-0 cursor-pointer accent-ink"
            />
            <span className="text-ui text-ink-60">
              El cliente lo ve cuando escanea su calco
            </span>
          </label>

          {estado.error && (
            <p className="mt-2 text-ui text-overdue">{estado.error}</p>
          )}

          <div className="mt-2.5 flex gap-2">
            <Boton type="submit" disabled={enviando} className="min-w-[120px]">
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
