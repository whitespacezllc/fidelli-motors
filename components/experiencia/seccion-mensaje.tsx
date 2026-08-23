"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { MensajeTaller } from "@/components/cliente/mensaje-taller";
import { paletaTenant, variablesTenant, hexONull } from "@/lib/cliente/color";
import { estilosTema } from "@/lib/cliente/tema";
import type { ConfigExperiencia } from "@/components/experiencia/form-experiencia";
import type { BorradorExperiencia } from "@/components/experiencia/pantalla-experiencia";
import {
  guardarMensajeTaller,
  type EstadoMensaje,
} from "@/app/panel/experiencia/actions";

const ESTADO_INICIAL: EstadoMensaje = {};

const CLASE_CAMPO =
  "w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

const LARGO_MAXIMO = 280;

// El mensaje del taller al escanear — la pieza del plan Ultra. El
// cliente lo ve sentado en su auto, con el historial adelante: el
// momento de mayor intención del mes. La muestra de abajo es EL MISMO
// componente que renderiza la página pública, pintado con el borrador
// del formulario: lo que se ve acá es lo que va a ver él.
export function SeccionMensaje({
  config,
  borrador,
  nombre,
}: {
  config: ConfigExperiencia;
  borrador: BorradorExperiencia;
  nombre: string;
}) {
  const [estado, accion, guardando] = useActionState(
    guardarMensajeTaller,
    ESTADO_INICIAL,
  );
  const [mensaje, setMensaje] = useState(config.mensajeEscaneo);
  const paleta = paletaTenant(borrador.color, borrador.tema);

  return (
    <form action={accion}>
      <h2 className="mb-1 font-brand text-body font-bold text-ink">
        Mensaje al escanear
      </h2>
      <p className="mb-3 text-ui text-ink-60">
        Tu cliente lo ve al abrir el historial de su auto: el momento de más
        atención que te da en todo el mes. Usalo para lo que quieras que haga
        este mes — una promo, un aviso, un recordatorio.
      </p>

      {estado.error && (
        <p role="alert" className="mb-3 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="mb-3 rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
          Guardado. Ya lo ven todos los que escanean.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="mensaje" className={CLASE_LABEL}>
            El mensaje <span className="text-ink-40 normal-case">(vacío = no se muestra)</span>
          </label>
          <textarea
            id="mensaje"
            name="mensaje"
            rows={3}
            maxLength={LARGO_MAXIMO}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Ej.: En septiembre, revisión de frenos sin cargo con tu cambio de aceite."
            className={CLASE_CAMPO}
          />
          <p className="mt-1 text-label text-ink-40 tabular-nums">
            {mensaje.length}/{LARGO_MAXIMO}
          </p>
        </div>

        <div className="sm:w-1/2">
          <label htmlFor="vigencia" className={CLASE_LABEL}>
            Se muestra hasta <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <input
            id="vigencia"
            name="vigencia"
            type="date"
            defaultValue={config.mensajeVigencia}
            className="h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink tabular-nums"
          />
          <p className="mt-1.5 text-label text-ink-60">
            Pasada la fecha se apaga solo — un aviso de septiembre no puede
            seguir puesto en marzo. Sin fecha, queda hasta que lo borres.
          </p>
        </div>

        {mensaje.trim() && (
          <div
            className="rounded-lg p-4"
            style={{
              ...variablesTenant(paleta),
              ...estilosTema(borrador.tema, hexONull(borrador.colorFondo)),
              ...(borrador.tema === "claro" && !hexONull(borrador.colorFondo)
                ? { backgroundColor: "#FFFFFF" }
                : {}),
            }}
          >
            <MensajeTaller mensaje={mensaje.trim()} nombreLubricentro={nombre} />
          </div>
        )}

        <Boton type="submit" tam="lg" disabled={guardando} className="sm:self-start">
          {guardando ? "Guardando…" : "Guardar mensaje"}
        </Boton>
      </div>
    </form>
  );
}
