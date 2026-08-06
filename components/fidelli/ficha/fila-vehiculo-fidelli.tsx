"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton } from "@/components/ui/boton";
import { IconoCandado } from "@/components/iconos";
import { CLASE_CAMPO, CLASE_LABEL, CLASE_ERROR } from "@/components/fidelli/estilos";
import { formatearFecha } from "@/lib/fechas";
import { estadoPatente, vencimientoLegible } from "@/lib/patente";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";
import {
  corregirPatente,
  type EstadoCorreccion,
} from "@/app/fidelli/[id]/actions";

const INICIAL: EstadoCorreccion = {};

const TD = "px-3 py-2.5 align-middle";

export type VehiculoFila = {
  id: string;
  patente: string;
  vehiculo: string | null;
  anio: number | null;
  cliente: string | null;
  cantidadServices: number;
  ultimoServiceFecha: string | null;
  /** created_at del primer service no anulado; null si no tiene ninguno. */
  primerServiceEn: string | null;
};

export function FilaVehiculoFidelli({
  lubricentroId,
  vehiculo,
}: {
  lubricentroId: string;
  vehiculo: VehiculoFila;
}) {
  const patente = estadoPatente(vehiculo.primerServiceEn);

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className={`${TD} plate whitespace-nowrap text-ink`}>
        {vehiculo.patente}
      </td>
      <td className={TD}>
        {vehiculo.vehiculo ?? (
          <span className="text-ink-40">sin marca ni modelo</span>
        )}
        {vehiculo.anio && <span className="text-ink-60"> · {vehiculo.anio}</span>}
      </td>
      <td className={`${TD} text-ink-60`}>{vehiculo.cliente ?? "—"}</td>
      <td className={`${TD} text-ink-60`}>{vehiculo.cantidadServices}</td>
      <td className={`${TD} whitespace-nowrap text-ink-60`}>
        {vehiculo.ultimoServiceFecha ? (
          formatearFecha(vehiculo.ultimoServiceFecha)
        ) : (
          <span className="text-ink-40">nunca</span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        {/* La corrección de Fidelli existe solo cuando el lubri ya no puede
            hacerlo él. Dentro de la ventana se dice hasta cuándo, para poder
            contestarlo por teléfono sin abrir nada. */}
        {patente.tipo === "fija" ? (
          <DialogCorregir lubricentroId={lubricentroId} vehiculo={vehiculo} />
        ) : patente.tipo === "ventana" ? (
          <span className="text-label whitespace-nowrap text-ink-40">
            la corrige él {vencimientoLegible(patente.vence)}
          </span>
        ) : (
          <span className="text-label text-ink-40">sin services</span>
        )}
      </td>
    </tr>
  );
}

function DialogCorregir({
  lubricentroId,
  vehiculo,
}: {
  lubricentroId: string;
  vehiculo: VehiculoFila;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // El dialog se cierra dentro de la acción: cerrarse es la consecuencia
  // de haber corregido, no un efecto suelto.
  const [estado, corregir, corrigiendo] = useActionState(
    async (previo: EstadoCorreccion, formData: FormData) => {
      const r = await corregirPatente(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  const motivoCorto = motivo.trim().length > 0 && motivo.trim().length < 10;
  const error = errorLocal ?? estado.error;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        // Al reabrir, el formulario arranca limpio: una corrección no
        // hereda lo que se tipeó para otro auto.
        if (!v) {
          setNueva("");
          setMotivo("");
          setErrorLocal(null);
        }
      }}
    >
      <DialogTrigger className="inline-flex min-h-8 items-center rounded-sm px-2 py-1 text-label font-semibold text-ink underline underline-offset-2 hover:bg-surface">
        Corregir patente
      </DialogTrigger>

      <DialogContenido titulo="Corregir la patente">
        <form
          action={corregir}
          onSubmit={(e) => {
            if (!esPatenteValida(nueva)) {
              e.preventDefault();
              setErrorLocal(PATENTE_FORMATO);
              return;
            }
            setErrorLocal(null);
          }}
          className="flex flex-col gap-4"
        >
          {error && (
            <p role="alert" className={CLASE_ERROR}>
              {error}
            </p>
          )}

          <input type="hidden" name="vehiculo_id" value={vehiculo.id} />
          <input type="hidden" name="lubricentro_id" value={lubricentroId} />

          {/* Qué auto es, antes de tocar nada: dos filas de la tabla se
              parecen demasiado como para confiar en el clic. */}
          <dl className="rounded-md border border-line bg-surface px-4 py-3 text-ui">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Patente actual</dt>
              <dd className="plate text-right text-ink">{vehiculo.patente}</dd>
            </div>
            {vehiculo.vehiculo && (
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-ink-60">Vehículo</dt>
                <dd className="text-right text-ink">{vehiculo.vehiculo}</dd>
              </div>
            )}
            {vehiculo.cliente && (
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-ink-60">Cliente</dt>
                <dd className="text-right text-ink">{vehiculo.cliente}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-ink-60">Services</dt>
              <dd className="text-right text-ink">{vehiculo.cantidadServices}</dd>
            </div>
          </dl>

          <div>
            <label htmlFor="patente_nueva" className={CLASE_LABEL}>
              Patente correcta
            </label>
            <input
              id="patente_nueva"
              name="patente_nueva"
              required
              value={nueva}
              onChange={(e) => {
                setNueva(e.target.value.toUpperCase());
                if (errorLocal) setErrorLocal(null);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              className={`${CLASE_CAMPO} plate uppercase`}
            />
            <p className="mt-1.5 text-label text-ink-40">
              Vieja (ABC 123) o Mercosur (AB 123 CD).
            </p>
          </div>

          <div>
            <label htmlFor="motivo" className={CLASE_LABEL}>
              Motivo de la corrección
            </label>
            <textarea
              id="motivo"
              name="motivo"
              required
              minLength={10}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
            />
            <p className="mt-1.5 text-label text-ink-60">
              Qué te contó el lubricentro y cómo lo verificaste. Queda
              registrado con tu nombre y no se puede editar después.
            </p>
            {motivoCorto && (
              <p className="mt-2 text-label text-urgente">
                Un poco más de detalle: esto es la justificación que queda
                asentada.
              </p>
            )}
          </div>

          <p className="flex items-start gap-1.5 rounded-md bg-surface px-3.5 py-3 text-label text-ink-60">
            <IconoCandado className="mt-px size-3.5 shrink-0" />
            <span>
              El historial del auto —services, notas y premios— queda intacto:
              se corrige la chapa, no el pasado. El cliente va a encontrar su
              cartón buscando la patente nueva.
            </span>
          </p>

          <Boton type="submit" tam="lg" disabled={corrigiendo} className="w-full">
            {corrigiendo ? "Corrigiendo…" : "Corregir y registrar"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}
