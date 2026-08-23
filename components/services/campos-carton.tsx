"use client";

import { useState } from "react";
import Link from "next/link";
import { clasesBoton } from "@/components/ui/boton";
import { formatearFecha } from "@/lib/fechas";
import {
  VISCOSIDADES_SAE,
  normalizarViscosidad,
  formatearKm,
} from "@/lib/renglones";
import type { VehiculoIdentificado } from "@/app/panel/services/nuevo/actions";

// ============================================================
// Los campos del cartón, extraídos para que existan UNA sola vez
// ============================================================
//
// Estos componentes son los del flujo real de carga: los usa el panel
// (identificar-vehiculo.tsx y carton.tsx) y los usa la simulación de la
// landing comercial (components/landing/simulador-carga.tsx).
//
// LA RAZÓN DE LA EXTRACCIÓN ES LA LANDING, y conviene que quede escrita:
// la sección 03 muestra una simulación de la carga, y la regla es que se
// construya con los componentes reales del formulario — mismos inputs,
// mismo orden, mismos textos. Si mañana el formulario cambia, la landing
// cambia sola, porque es este archivo. Una maqueta paralela se desactualiza
// en silencio, que es el peor modo de falla de una página que promete
// "es el flujo real del producto".
//
// Por eso este archivo NO importa ninguna Server Action: es presentación
// pura con handlers inyectados. El markup vino textual de donde estaba;
// acá no se rediseñó nada.

export const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
export const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// ---------- El campo de patente — momento 0 ----------
export function CampoPatente({
  valor,
  alEscribir,
  autoFocus = false,
  describedBy,
}: {
  valor: string;
  alEscribir: (valor: string) => void;
  /** El panel lo enfoca solo: el mecánico llega con el auto en el pozo. */
  autoFocus?: boolean;
  describedBy?: string;
}) {
  return (
    <>
      <label htmlFor="patente" className="sr-only">
        Patente
      </label>
      <input
        id="patente"
        name="patente"
        value={valor}
        onChange={(e) => alEscribir(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABC 123"
        aria-describedby={describedBy}
        className="plate h-15 w-full rounded-md border-2 border-ink bg-base text-center text-h3 uppercase placeholder:text-ink-40 focus:outline-none"
      />
    </>
  );
}

// ---------- La mini-ficha: el auto y el cliente aparecen solos ----------
// Caso A: el vehículo ya pasó. Todo lo que el mecánico necesita saber antes
// de arrancar, incluido si le tiene que anticipar el premio al cliente.
export function MiniFicha({
  vehiculo,
  accionCargar,
}: {
  vehiculo: VehiculoIdentificado;
  /** Sin esto, el botón navega al cartón del panel (el comportamiento de
      siempre). La simulación lo intercepta para pasar de pantalla. */
  accionCargar?: () => void;
}) {
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

      {accionCargar ? (
        <button
          type="button"
          onClick={accionCargar}
          className={`${clasesBoton("primario", "lg")} mt-3.5 w-full`}
        >
          Cargar service
        </button>
      ) : (
        <Link
          href={`/panel/services/nuevo/${vehiculo.vehiculoId}`}
          className={`${clasesBoton("primario", "lg")} mt-3.5 w-full`}
        >
          Cargar service
        </Link>
      )}
    </div>
  );
}

// ---------- La cabecera del cartón ----------
// Sticky: acompaña todo el scroll. En mobile va a sangre, como una barra
// del sistema. En desktop se contiene al ancho del cartón y flota como
// tarjeta: una banda que sobresale del formulario se lee como un error de
// maquetado. `children` es lo que va a la derecha (el select de sucursal
// en el panel; nada en la simulación).
export function CabeceraCarton({
  patente,
  vehiculoNombre,
  clienteNombre,
  children,
}: {
  patente: string;
  vehiculoNombre: string;
  clienteNombre: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-base px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5 sm:shadow-md">
      <div className="min-w-0 flex-1">
        <p className="plate truncate text-body text-ink">{patente}</p>
        <p className="truncate text-label text-ink-60">
          {vehiculoNombre} · {clienteNombre}
        </p>
      </div>
      {children}
    </div>
  );
}

// ---------- Kilómetros ----------
export function CampoKilometros({
  km,
  alCambiar,
  ultimoService,
}: {
  km: string;
  alCambiar: (valor: string) => void;
  ultimoService: { fecha: string; kilometros: number } | null;
}) {
  // El typo más probable y el que más ensucia la predicción de retorno.
  // Advierte, nunca bloquea: un odómetro cambiado es real.
  const kmNum = Number(km.replace(/\D/g, ""));
  const kmCargado = km.trim() !== "" && Number.isFinite(kmNum);
  const kmMenor =
    kmCargado && ultimoService !== null && kmNum < ultimoService.kilometros;

  return (
    <div>
      <label htmlFor="km" className={CLASE_LABEL}>
        Kilómetros
      </label>
      <input
        id="km"
        inputMode="numeric"
        value={km}
        onChange={(e) => alCambiar(e.target.value)}
        className={`${CLASE_CAMPO} h-14 text-h3 tabular-nums`}
      />
      {ultimoService && (
        <p className="mt-1.5 text-label text-ink-60 tabular-nums">
          Último service: {formatearKm(ultimoService.kilometros)} km
        </p>
      )}
      {kmMenor && ultimoService && (
        <p className="mt-2 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Son menos que el último service (
          {formatearKm(ultimoService.kilometros)} km). Verificá el
          odómetro — si está bien, seguí igual.
        </p>
      )}
    </div>
  );
}

// ---------- Viscosidad: texto libre + las once SAE ----------
export function SelectorViscosidad({
  valor,
  alCambiar,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <>
      <label htmlFor="viscosidad" className={CLASE_LABEL}>
        Viscosidad
      </label>
      <input
        id="viscosidad"
        value={valor}
        onChange={(e) => alCambiar(e.target.value.toUpperCase())}
        autoCapitalize="characters"
        autoComplete="off"
        className={`${CLASE_CAMPO} tabular-nums`}
      />
      {/* Las once SAE de un tap, en el orden del rubro y SIEMPRE en
          el mismo lugar: la posición fija hace memoria muscular.
          Ninguna viene marcada — el campo arranca vacío a propósito
          (la viscosidad nunca se autocompleta) — y el texto libre
          sigue: el que tiene el envase en la mano sabe más. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {VISCOSIDADES_SAE.map((v) => {
          const activa = normalizarViscosidad(valor) === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => alCambiar(v)}
              aria-pressed={activa}
              className={`flex h-11 items-center rounded-md border px-2.5 text-ui tabular-nums transition-colors ${
                activa
                  ? "border-ink bg-ink font-semibold text-white"
                  : "border-line bg-base text-ink-60 hover:bg-surface"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------- El producto del catálogo (opcional) ----------
export function SelectorProductoAceite({
  valor,
  alCambiar,
  aceites,
  alPedirAlta,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
  aceites: { id: string; nombre: string }[];
  /** El alta rápida del panel. Sin esto, la opción no se ofrece — en la
      simulación no hay catálogo que ampliar. */
  alPedirAlta?: () => void;
}) {
  return (
    <>
      <label htmlFor="aceite-producto" className={CLASE_LABEL}>
        Producto <span className="text-ink-40 normal-case">(opcional)</span>
      </label>
      <select
        id="aceite-producto"
        value={valor}
        onChange={(e) => {
          if (e.target.value === "__nuevo") {
            alPedirAlta?.();
            return;
          }
          alCambiar(e.target.value);
        }}
        className={CLASE_CAMPO}
      >
        <option value="">Sin producto</option>
        {aceites.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
        {alPedirAlta && <option value="__nuevo">+ Agregar producto…</option>}
      </select>
    </>
  );
}

// ---------- El interruptor de un renglón del cartón ----------
export function RenglonInterruptor({
  etiqueta,
  encendido,
  alAlternar,
}: {
  etiqueta: string;
  encendido: boolean;
  alAlternar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      onClick={alAlternar}
      className="flex min-h-13 w-full items-center justify-between gap-3 px-3.5 py-2 text-left"
    >
      <span
        className={`text-body ${
          encendido ? "font-semibold text-ink" : "text-ink-60"
        }`}
      >
        {etiqueta}
      </span>
      <span
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          encendido ? "bg-ink" : "bg-line"
        }`}
      >
        <span
          className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
            encendido ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

// ---------- Producto de aceite, con buscador — SOLO el panel ----------
// La landing sigue usando el select de arriba: su simulación no se toca.
// Acá el catálogo real puede tener decenas de aceites, y el mecánico
// escribe tres letras en vez de scrollear una lista. Elegirlo muestra el
// precio y el stock, y precarga los litros del service (litros_sugeridos)
// sin pedir un toque más.
export type ProductoAceite = {
  id: string;
  nombre: string;
  precioVenta: number | null;
  stock: number | null;
  unidad: string;
  litrosSugeridos: number | null;
};

export function SelectorProductoBuscable({
  productoId,
  alElegir,
  aceites,
  alPedirAlta,
}: {
  productoId: string;
  /** null = sin producto. */
  alElegir: (producto: ProductoAceite | null) => void;
  aceites: ProductoAceite[];
  alPedirAlta?: () => void;
}) {
  const elegido = aceites.find((p) => p.id === productoId) ?? null;
  const [texto, setTexto] = useState(elegido?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);

  const filtrados = texto.trim()
    ? aceites.filter((p) =>
        p.nombre.toLowerCase().includes(texto.trim().toLowerCase()),
      )
    : aceites;

  return (
    <div className="relative">
      <label htmlFor="aceite-producto" className={CLASE_LABEL}>
        Producto <span className="text-ink-40 normal-case">(opcional)</span>
      </label>
      <input
        id="aceite-producto"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          // Escribir de nuevo invalida la elección anterior.
          if (elegido && e.target.value !== elegido.nombre) alElegir(null);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar en el catálogo…"
        autoComplete="off"
        className={CLASE_CAMPO}
      />
      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-base shadow-lg">
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTexto("");
                setAbierto(false);
                alElegir(null);
              }}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-ui text-ink-60 hover:bg-surface"
            >
              Sin producto
            </button>
          </li>
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTexto(p.nombre);
                  setAbierto(false);
                  alElegir(p);
                }}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-2 px-3.5 py-1.5 text-left text-ui text-ink hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="shrink-0 text-label text-ink-60 tabular-nums">
                  {[
                    p.precioVenta != null
                      ? `$${p.precioVenta.toLocaleString("es-AR")}`
                      : null,
                    p.stock != null
                      ? `stock ${p.stock} ${p.unidad === "litro" ? "L" : "u."}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {alPedirAlta && (
            <li className="border-t border-line">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setAbierto(false);
                  alPedirAlta();
                }}
                className="flex min-h-11 w-full items-center px-3.5 text-left text-ui font-semibold text-brand hover:bg-surface"
              >
                + Agregar producto…
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
