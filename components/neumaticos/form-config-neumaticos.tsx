"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  guardarConfigNeumaticos,
  type EstadoConfigNeumaticos,
} from "@/app/panel/(tras-onboarding)/neumaticos/actions";
import {
  CAMPOS_CONFIG_NEUMATICOS,
  TITULO_GRUPO,
  type CampoConfigNeumaticos,
  type ConfigNeumaticos,
} from "@/lib/neumaticos/config";

const INICIAL: EstadoConfigNeumaticos = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink tabular-nums";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

const GRUPOS = ["retornos", "recambio", "beneficio"] as const;

// Los intervalos con los que el módulo avisa, tal como los guarda la base.
// No hay valores clavados en el código: lo que se escribe acá mueve "A
// quién llamar" en el próximo refresco, sin migración ni deploy.
export function FormConfigNeumaticos({
  config,
  deshabilitado = false,
}: {
  config: ConfigNeumaticos;
  deshabilitado?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(guardarConfigNeumaticos, INICIAL);

  return (
    <form action={enviar} className="flex flex-col gap-6">
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
          {estado.ok}
        </p>
      )}

      {GRUPOS.map((grupo) => (
        <section key={grupo}>
          <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
            {TITULO_GRUPO[grupo]}
          </h2>
          <div className="surface-card grid gap-5 p-5 sm:grid-cols-2">
            {CAMPOS_CONFIG_NEUMATICOS.filter((c) => c.grupo === grupo).map((campo) => (
              <Campo
                key={campo.clave}
                campo={campo}
                valor={config[campo.clave]}
                deshabilitado={deshabilitado}
              />
            ))}
          </div>
        </section>
      ))}

      <div>
        {/* Ancho fijo: el texto cambia al enviarse y el botón no salta. */}
        <Boton
          type="submit"
          tam="lg"
          disabled={pendiente || deshabilitado}
          className="w-full sm:w-[220px]"
        >
          {pendiente ? "Guardando…" : "Guardar intervalos"}
        </Boton>
      </div>
    </form>
  );
}

function Campo({
  campo,
  valor,
  deshabilitado,
}: {
  campo: CampoConfigNeumaticos;
  valor: number;
  deshabilitado: boolean;
}) {
  const id = `cfg-${campo.clave}`;
  return (
    <div>
      <label htmlFor={id} className={CLASE_LABEL}>
        {campo.etiqueta}
      </label>
      <div className="flex items-center gap-2.5">
        <input
          id={id}
          name={campo.clave}
          type="number"
          inputMode={campo.decimal ? "decimal" : "numeric"}
          // El beneficio admite 0 (apagado) además de su rango: el min del
          // input queda en 0 y la acción valida el resto.
          min={campo.clave === "beneficio_km" ? 0 : campo.min}
          max={campo.max}
          step={campo.paso}
          defaultValue={valor}
          disabled={deshabilitado}
          className={`${CLASE_CAMPO} disabled:bg-surface disabled:text-ink-40`}
        />
        <span className="shrink-0 text-ui text-ink-60">{campo.unidad}</span>
      </div>
      <p className="mt-1.5 text-label text-ink-60">{campo.ayuda}</p>
    </div>
  );
}
