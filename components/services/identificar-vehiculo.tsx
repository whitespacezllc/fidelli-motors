"use client";

import { useRef, useState } from "react";
import { PanelAlta } from "@/components/services/panel-alta";
import { CampoPatente, MiniFicha } from "@/components/services/campos-carton";
import { esPatenteValida, normalizarPatente, PATENTE_FORMATO } from "@/lib/texto";
import {
  buscarPorPatente,
  type VehiculoIdentificado,
} from "@/app/panel/services/nuevo/actions";

// Una patente normalizada tiene 6 (ABC123) o 7 (AB123CD) caracteres: recién
// ahí tiene sentido salir a buscar.
const LARGO_MINIMO = 6;

// La MiniFicha (caso A: el vehículo ya pasó) y el campo de patente viven en
// campos-carton.tsx: son los mismos que usa la simulación de la landing.

export function IdentificarVehiculo({ marcas }: { marcas: string[] }) {
  const [patente, setPatente] = useState("");
  const [vehiculo, setVehiculo] = useState<VehiculoIdentificado | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [altaManual, setAltaManual] = useState(false);
  // "Dejó de tipear": el aviso de formato espera a que pare, así no salta
  // mientras escribe (ABC1 todavía puede terminar siendo ABC123).
  const [quieto, setQuieto] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cada búsqueda lleva número: si el mecánico sigue tipeando, la respuesta
  // vieja que llegue tarde no puede pisar a la nueva.
  const busqueda = useRef(0);

  const normalizada = normalizarPatente(patente);
  const completa = normalizada.length >= LARGO_MINIMO;
  // Validación suave: avisa, pero nunca frena nada. Si la patente es corta o
  // rara igual se puede seguir escribiendo y buscando.
  const formatoRaro =
    quieto && normalizada.length > 0 && !esPatenteValida(patente);

  function alEscribir(valor: string) {
    const enMayusculas = valor.toUpperCase();
    setPatente(enMayusculas);
    setVehiculo(null);
    setBuscado(false);
    setErrorBusqueda(null);
    setAltaManual(false);
    setQuieto(false);

    if (temporizador.current) clearTimeout(temporizador.current);

    // Sin useTransition a propósito: el resultado es justamente lo que el
    // mecánico está esperando, así que la actualización va con prioridad
    // urgente y se pinta apenas llega.
    const turno = ++busqueda.current;
    temporizador.current = setTimeout(async () => {
      setQuieto(true);
      // Una patente normalizada tiene 6 o 7 caracteres: con menos no hay
      // nada que buscar, pero el aviso de arriba igual ya se mostró.
      if (normalizarPatente(enMayusculas).length < LARGO_MINIMO) return;

      const resultado = await buscarPorPatente(enMayusculas);
      if (turno !== busqueda.current) return;
      setVehiculo(resultado.vehiculo);
      setErrorBusqueda(resultado.error ?? null);
      setBuscado(true);
    }, 300);
  }

  // No apareció: se despliega el alta en la misma pantalla, sin navegar.
  const mostrarAlta = altaManual || (buscado && !vehiculo && !errorBusqueda);

  return (
    <div>
      <h1 className="font-brand text-h3 font-bold text-ink">Nuevo service</h1>
      <p className="mt-0.5 text-ui text-ink-60">Escribí la patente y listo</p>

      <div className="mt-4">
        {/* El foco entra solo: el mecánico llega con el auto en el pozo. */}
        <CampoPatente
          valor={patente}
          alEscribir={alEscribir}
          autoFocus
          describedBy={formatoRaro ? "aviso-patente" : undefined}
        />
      </div>

      {formatoRaro && (
        <p id="aviso-patente" className="mt-2 text-center text-ui text-overdue">
          {PATENTE_FORMATO} Igual podés seguir buscando.
        </p>
      )}

      {errorBusqueda && (
        <p role="alert" className="mt-3 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {errorBusqueda}
        </p>
      )}

      {vehiculo && <MiniFicha vehiculo={vehiculo} />}

      {mostrarAlta && <PanelAlta patente={patente.trim()} marcas={marcas} />}

      {/* La salida manual del hi-fi, que va también junto a la mini-ficha:
          si el auto que apareció no es el que está en el pozo (un dígito de
          más en la patente encuentra otro), desde acá se carga el correcto. */}
      {completa && !mostrarAlta && (
        <p className="mt-4 text-center text-ui text-ink-60">
          ¿La patente no aparece?{" "}
          <button
            type="button"
            onClick={() => setAltaManual(true)}
            className="font-semibold text-brand"
          >
            Cargar cliente y vehículo
          </button>
        </p>
      )}
    </div>
  );
}
