"use client";

import { useActionState, useState } from "react";
import { Segmentado } from "@/components/ui/segmentado";
import { Boton } from "@/components/ui/boton";
import { CLASE_LABEL } from "@/components/fidelli/estilos";
import { registrarContacto, type EstadoAccionPauta } from "@/app/fidelli/pauta/actions";
import {
  CANALES,
  ORIGENES_META,
  type CanalPauta,
  type OrigenMeta,
} from "@/lib/fidelli/pauta";

const INICIAL: EstadoAccionPauta = {};

// ============================================================
// El alta de un contacto: tres toques. La fecha ya viene con hoy, el canal
// con Meta y el origen con WhatsApp, así que entra un mensaje, se toca
// «Registrar» y listo. El teléfono es opcional y sirve para no duplicar.
// En una fila a 1280; apilado en el celular.
//
// Sin recarga: la Server Action revalida la ruta y la fila aparece arriba
// de la lista.
// ============================================================
export function FormContacto({ hoy }: { hoy: string }) {
  const [canal, setCanal] = useState<CanalPauta>("meta");
  const [origen, setOrigen] = useState<OrigenMeta>("whatsapp");
  const [telefono, setTelefono] = useState("");

  const [estado, registrar, registrando] = useActionState(
    async (previo: EstadoAccionPauta, formData: FormData) => {
      const r = await registrarContacto(previo, formData);
      if (r.ok) setTelefono("");
      return r;
    },
    INICIAL,
  );

  return (
    <form action={registrar} className="surface-card px-4 py-3.5" aria-label="Registrar contacto">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <input type="hidden" name="canal" value={canal} />
        <input type="hidden" name="origen" value={origen} />

        <div>
          <label htmlFor="contacto-fecha" className={CLASE_LABEL}>
            Primer mensaje
          </label>
          <input
            id="contacto-fecha"
            name="fecha"
            type="date"
            required
            defaultValue={hoy}
            max={hoy}
            className="h-12 rounded-md border border-line bg-base px-3.5 text-body text-ink tabular-nums"
          />
        </div>

        <div>
          <span className={CLASE_LABEL}>Canal</span>
          <div className="flex h-12 items-center">
            <Segmentado etiqueta="Canal" opciones={CANALES} valor={canal} alCambiar={setCanal} />
          </div>
        </div>

        {canal === "meta" && (
          <div>
            <span className={CLASE_LABEL}>Origen</span>
            <div className="flex h-12 items-center">
              <Segmentado
                etiqueta="Origen en Meta"
                opciones={ORIGENES_META}
                valor={origen}
                alCambiar={setOrigen}
              />
            </div>
          </div>
        )}

        <div className="min-w-[11rem] flex-1">
          <label htmlFor="contacto-telefono" className={CLASE_LABEL}>
            Teléfono <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <input
            id="contacto-telefono"
            name="telefono"
            inputMode="tel"
            autoComplete="off"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="351 555 0000"
            className="h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40 tabular-nums"
          />
        </div>

        <Boton type="submit" tam="lg" disabled={registrando} className="w-full sm:w-auto">
          {registrando ? "Registrando…" : "Registrar"}
        </Boton>
      </div>

      {estado.error && (
        <p role="alert" className="mt-3 rounded-md bg-overdue-soft px-3.5 py-2.5 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      {estado.ok && !estado.error && (
        <p role="status" className="mt-3 text-ui text-success">
          Contacto registrado. Quedó arriba de la lista.
        </p>
      )}
    </form>
  );
}
