"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { clasesBoton } from "@/components/ui/boton";
import { PanelAlta } from "@/components/services/panel-alta";
import { esPatenteValida, normalizarPatente, PATENTE_FORMATO } from "@/lib/texto";
import { formatearFecha } from "@/lib/fechas";
import {
  buscarPorPatente,
  type VehiculoIdentificado,
} from "@/app/panel/services/nuevo/actions";

// Una patente normalizada tiene 6 (ABC123) o 7 (AB123CD) caracteres: recién
// ahí tiene sentido salir a buscar.
const LARGO_MINIMO = 6;

// Caso A: el vehículo ya pasó. Todo lo que el mecánico necesita saber antes
// de arrancar, incluido si le tiene que anticipar el premio al cliente.
function MiniFicha({ vehiculo }: { vehiculo: VehiculoIdentificado }) {
  const nombre =
    [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo";

  const ultimo = vehiculo.ultimoServiceFecha
    ? [
        `Último service: ${formatearFecha(vehiculo.ultimoServiceFecha)}`,
        vehiculo.ultimoServiceKm !== null
          ? `${vehiculo.ultimoServiceKm.toLocaleString("es-AR")} km`
          : null,
        vehiculo.ultimoServiceSucursal,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Todavía no tiene services cargados";

  return (
    <div className="mt-4 rounded-lg border border-line bg-base p-4">
      <div className="flex items-start justify-between gap-2.5">
        {/* Sin truncar: el dueño es uno de los datos que el mecánico necesita
            sí o sí, y a 375px con el badge al lado no entra en una línea.
            Preferimos que baje de renglón antes que perderlo. */}
        <div className="min-w-0">
          <p className="font-brand text-lead font-bold text-balance text-ink">
            {nombre}
          </p>
          <p className="plate mt-0.5 text-ui text-ink-60">
            {vehiculo.patente.toUpperCase()} · {vehiculo.clienteNombre}
          </p>
        </div>
        {/* El premio se anticipa acá, antes de arrancar: el cliente está
            parado enfrente. Dorado, el único amarillo del sistema. */}
        {vehiculo.premioDisponible && (
          <span className="shrink-0 rounded-sm border border-reward bg-reward-soft px-2.5 py-1 text-label font-semibold tracking-[0.04em] text-reward uppercase">
            Premio disponible
          </span>
        )}
      </div>

      <p className="mt-2 text-ui text-ink-60 tabular-nums">{ultimo}</p>

      <Link
        href={`/panel/services/nuevo/${vehiculo.vehiculoId}`}
        className={`${clasesBoton("primario", "lg")} mt-3.5 w-full`}
      >
        Cargar service
      </Link>
    </div>
  );
}

export function IdentificarVehiculo() {
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
        <label htmlFor="patente" className="sr-only">
          Patente
        </label>
        <input
          id="patente"
          name="patente"
          value={patente}
          onChange={(e) => alEscribir(e.target.value)}
          // El foco entra solo: el mecánico llega con el auto en el pozo.
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC 123"
          aria-describedby={formatoRaro ? "aviso-patente" : undefined}
          className="plate h-15 w-full rounded-md border-2 border-ink bg-base text-center text-h3 uppercase placeholder:text-ink-40 focus:outline-none"
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

      {mostrarAlta && <PanelAlta patente={patente.trim()} />}

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
