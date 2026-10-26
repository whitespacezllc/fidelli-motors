"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  ALICUOTAS_OPCIONES,
  MODOS_PRECIO,
  type ConfigFiscal,
  type EstadoConfigFiscal,
} from "@/lib/facturacion/config";

const INICIAL: EstadoConfigFiscal = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink disabled:bg-surface disabled:text-ink-40";
const CLASE_LABEL = "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// La config fiscal del tenant para facturar: punto de venta, cómo cargó los
// precios (finales o netos) y la alícuota default. El MODELO DE CREDENCIALES
// (cómo autoriza el taller a facturar con su CUIT) se define en la rebanada 2
// y no aparece acá todavía.
export function FormConfigFiscal({
  accion,
  inicial,
  condicionEmisor,
}: {
  accion: (prev: EstadoConfigFiscal, formData: FormData) => Promise<EstadoConfigFiscal>;
  inicial: ConfigFiscal;
  condicionEmisor: string | null;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, INICIAL);
  const [puntoVenta, setPuntoVenta] = useState(inicial.puntoVenta?.toString() ?? "");
  const [precios, setPrecios] = useState<"finales" | "netos">(
    inicial.preciosIncluyenIva ? "finales" : "netos",
  );
  const [alicuota, setAlicuota] = useState(inicial.alicuotaDefault.toString());

  return (
    <form action={enviar} className="flex flex-col gap-6">
      {estado.error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">{estado.ok}</p>
      )}

      {!condicionEmisor && (
        <p className="rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Todavía no cargaste tu condición frente al IVA. Completala en{" "}
          <strong>Mi cuenta → Datos de la empresa</strong>: es lo que define qué factura emitís.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="punto-venta" className={CLASE_LABEL}>
            Punto de venta
          </label>
          <input
            id="punto-venta"
            name="punto_venta"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej. 3"
            className={`${CLASE_CAMPO} tabular-nums`}
          />
          <p className="mt-1.5 text-label text-ink-40">
            El que habilitaste en ARCA para facturación electrónica por web service.
          </p>
        </div>
        <div>
          <label htmlFor="alicuota" className={CLASE_LABEL}>
            IVA por defecto
          </label>
          <select
            id="alicuota"
            name="iva_alicuota_default"
            value={alicuota}
            onChange={(e) => setAlicuota(e.target.value)}
            className={CLASE_CAMPO}
          >
            {ALICUOTAS_OPCIONES.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-label text-ink-40">
            La que se aplica a los productos sin IVA propio.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className={CLASE_LABEL}>Cómo cargás tus precios</legend>
        <div className="mt-1 flex flex-col gap-2">
          {MODOS_PRECIO.map((m) => (
            <label
              key={m.valor}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3.5 py-3"
            >
              <input
                type="radio"
                name="precios"
                value={m.valor}
                checked={precios === m.valor}
                onChange={() => setPrecios(m.valor)}
                className="mt-0.5 h-5 w-5"
              />
              <span>
                <span className="block text-ui font-semibold text-ink">{m.nombre}</span>
                <span className="block text-label text-ink-60">{m.ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Boton
        type="submit"
        variante="secundario"
        tam="lg"
        disabled={pendiente}
        className="w-full sm:w-[160px]"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}
