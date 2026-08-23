"use client";

import { useState, useTransition } from "react";
import { Combobox } from "@/components/ui/combobox";
import { sugerirModelos } from "@/app/panel/vehiculos/actions";

const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// Marca y modelo con sugerencias, compartido por los dos formularios de
// alta (la ficha y el momento 0 del service). TEXTO LIBRE SIEMPRE: la
// lista sugiere, nunca obliga — un auto que no está en la lista y no se
// puede cargar rompe los 90 segundos justo en el momento de la verdad.
//
// Los valores viajan en inputs ocultos: los formularios que lo usan son
// de FormData y no cambian su contrato. La normalización al canónico la
// hace la base por trigger, venga de donde venga.
export function CamposMarcaModelo({
  marcas,
  marcaInicial = "",
  modeloInicial = "",
}: {
  /** El catálogo global (DNRPA, cola filtrada a mano). Solo sugiere. */
  marcas: string[];
  marcaInicial?: string;
  modeloInicial?: string;
}) {
  const [marca, setMarca] = useState(marcaInicial);
  const [modelo, setModelo] = useState(modeloInicial);
  // Los modelos se APRENDEN: primero los del propio lubricentro, después
  // los globales que pasan el piso de anonimato. Se piden por marca, una
  // vez, en el evento — nunca por tecla.
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [marcaConsultada, setMarcaConsultada] = useState<string | null>(null);
  const [, empezar] = useTransition();

  function cargarSugerencias(paraMarca: string) {
    const clave = paraMarca.trim() || null;
    if (marcaConsultada === (clave ?? "")) return;
    setMarcaConsultada(clave ?? "");
    empezar(async () => {
      const lista = await sugerirModelos(clave);
      // Propios primero — el orden ya viene así de la base.
      setSugerencias(lista.map((s) => s.modelo));
    });
  }

  return (
    <div className="flex gap-3">
      <input type="hidden" name="marca" value={marca} />
      <input type="hidden" name="modelo" value={modelo} />
      <div className="min-w-0 flex-1">
        <span className={CLASE_LABEL}>
          Marca <span className="text-ink-40 normal-case">(opcional)</span>
        </span>
        <Combobox
          value={marca}
          onChange={(v) => setMarca(v)}
          opciones={marcas}
          ariaLabel="Marca del vehículo"
        />
      </div>
      <div className="min-w-0 flex-1">
        <span className={CLASE_LABEL}>
          Modelo <span className="text-ink-40 normal-case">(opcional)</span>
        </span>
        <div onFocusCapture={() => cargarSugerencias(marca)}>
          <Combobox
            value={modelo}
            onChange={(v) => setModelo(v)}
            opciones={sugerencias}
            ariaLabel="Modelo del vehículo"
          />
        </div>
      </div>
    </div>
  );
}
