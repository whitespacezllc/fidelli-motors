"use client";

import { useState } from "react";
import {
  CLASE_CAMPO,
  CLASE_LABEL,
  SelectorProductoBuscable,
  type ProductoBuscable,
} from "@/components/services/campos-carton";
import {
  ACCIONES,
  DOT_AYUDA,
  DOT_FORMATO,
  ETIQUETA_ACCION,
  ETIQUETA_POSICION,
  MEDIDA_FORMATO,
  POSICIONES,
  POSICIONES_AUTO,
  esDotValido,
  esMedidaValida,
  medidaDeNombre,
  type AccionRueda,
  type PosicionRueda,
} from "@/lib/ruedas";

// ============================================================
// LAS RUEDAS DEL TRABAJO DE GOMERÍA
//
// Un esquema del auto: las cuatro posiciones en 2×2 y el auxilio abajo,
// igual en escritorio y en 390px. Se toca una posición y se abre SU
// detalle, debajo del esquema y a todo el ancho — de a una por vez,
// porque así trabaja el gomero: rueda por rueda, no cinco formularios
// abiertos.
//
// Las cuatro casillas se combinan libremente y lo normal es marcar dos
// (colocada + balanceada). Los datos de la cubierta se pueden cargar SIN
// marcar ninguna: es el caso de medir sin vender, que alimenta los avisos
// de recambio por antigüedad.
// ============================================================

export type RuedaForm = {
  colocada: boolean;
  rotada: boolean;
  balanceada: boolean;
  reparada: boolean;
  posicionAnterior: PosicionRueda | "";
  productoId: string;
  marca: string;
  medida: string;
  indiceCargaVel: string;
  dot: string;
  profundidad: string;
  presion: string;
};

export function ruedaVacia(): RuedaForm {
  return {
    colocada: false,
    rotada: false,
    balanceada: false,
    reparada: false,
    posicionAnterior: "",
    productoId: "",
    marca: "",
    medida: "",
    indiceCargaVel: "",
    dot: "",
    profundidad: "",
    presion: "",
  };
}

export type RuedasPorPosicion = Record<PosicionRueda, RuedaForm>;

export function ruedasVacias(): RuedasPorPosicion {
  return Object.fromEntries(
    POSICIONES.map((p) => [p, ruedaVacia()]),
  ) as RuedasPorPosicion;
}

/** ¿Tiene alguna acción marcada? Es lo que la cuenta como trabajo hecho. */
export function tieneAccion(r: RuedaForm): boolean {
  return ACCIONES.some((a) => r[a]);
}

/** ¿Vale como fila? Se le hizo algo, o se la midió. Es el CHECK de la base. */
export function ruedaCuenta(r: RuedaForm): boolean {
  return tieneAccion(r) || r.profundidad.trim() !== "";
}

/** Los datos de cubierta cargados, con o sin acción. Prende la tarjeta. */
function tieneDatos(r: RuedaForm): boolean {
  return Boolean(
    r.marca.trim() ||
      r.medida.trim() ||
      r.indiceCargaVel.trim() ||
      r.dot.trim() ||
      r.profundidad.trim() ||
      r.presion.trim(),
  );
}

/** El renglón de la tarjeta: qué se le hizo, abreviado. */
function resumenTarjeta(r: RuedaForm): string {
  const hechas = ACCIONES.filter((a) => r[a]).map((a) =>
    ETIQUETA_ACCION[a].slice(0, 3),
  );
  if (hechas.length > 0) return hechas.join(" · ");
  if (r.profundidad.trim()) return `${r.profundidad.trim()} mm`;
  if (tieneDatos(r)) return "Datos cargados";
  return "Sin tocar";
}

export function RuedasCarton({
  ruedas,
  alCambiar,
  productos,
}: {
  ruedas: RuedasPorPosicion;
  alCambiar: (posicion: PosicionRueda, rueda: RuedaForm) => void;
  /** El catálogo filtrado por la categoría `neumatico`. */
  productos: (ProductoBuscable & { marca: string | null })[];
}) {
  // Una sola abierta por vez: el gomero carga rueda por rueda.
  const [abierta, setAbierta] = useState<PosicionRueda | null>(null);

  const detalle = abierta ? ruedas[abierta] : null;

  function editar(campo: keyof RuedaForm, valor: string | boolean) {
    if (!abierta) return;
    alCambiar(abierta, { ...ruedas[abierta], [campo]: valor });
  }

  function alternarAccion(accion: AccionRueda) {
    if (!abierta) return;
    const rueda = ruedas[abierta];
    const prendida = !rueda[accion];
    alCambiar(abierta, {
      ...rueda,
      [accion]: prendida,
      // Apagar "rotada" se lleva de dónde venía: un dato huérfano que la
      // base rechaza y que el mecánico no volvería a mirar.
      ...(accion === "rotada" && !prendida ? { posicionAnterior: "" as const } : {}),
    });
  }

  function elegirProducto(p: (ProductoBuscable & { marca: string | null }) | null) {
    if (!abierta) return;
    const rueda = ruedas[abierta];
    if (!p) {
      alCambiar(abierta, { ...rueda, productoId: "" });
      return;
    }
    // Marca y medida se copian como SNAPSHOT, igual que aceite_nombre: el
    // papel del cliente tiene que seguir diciendo qué le pusieron aunque
    // después borren el producto del catálogo. Los dos quedan editables, y
    // lo ya escrito a mano no se pisa.
    const medida = medidaDeNombre(p.nombre);
    alCambiar(abierta, {
      ...rueda,
      productoId: p.id,
      marca: rueda.marca.trim() || p.marca || "",
      medida: rueda.medida.trim() || medida || "",
    });
  }

  const medidaRara = Boolean(detalle?.medida.trim()) && !esMedidaValida(detalle!.medida);
  const dotRaro = Boolean(detalle?.dot.trim()) && !esDotValido(detalle!.dot);

  return (
    <div className="rounded-lg border border-line bg-surface/60 p-4">
      <p className="mb-1 font-brand text-body font-bold text-ink">Las ruedas</p>
      <p className="mb-3 text-label text-ink-60">
        Tocá una posición para cargar qué se le hizo. Podés anotar la medida y
        el DOT sin marcar nada: sirve para saber cuándo toca cambiarlas.
      </p>

      {/* EL ESQUEMA: el auto visto desde arriba. Dos columnas en las dos
          medidas — a 390px cada tarjeta entra cómoda y el pulgar la
          alcanza sin estirarse. */}
      <div className="grid grid-cols-2 gap-2">
        {POSICIONES_AUTO.map((posicion) => (
          <TarjetaPosicion
            key={posicion}
            posicion={posicion}
            rueda={ruedas[posicion]}
            abierta={abierta === posicion}
            alTocar={() => setAbierta(abierta === posicion ? null : posicion)}
          />
        ))}
      </div>

      {/* El auxilio, aparte y a lo ancho: no es una esquina del auto. */}
      <div className="mt-2">
        <TarjetaPosicion
          posicion="auxilio"
          rueda={ruedas.auxilio}
          abierta={abierta === "auxilio"}
          alTocar={() => setAbierta(abierta === "auxilio" ? null : "auxilio")}
        />
      </div>

      {abierta && detalle && (
        <div className="mt-3 rounded-md border border-ink bg-base p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-brand text-body font-bold text-ink">
              {ETIQUETA_POSICION[abierta]}
            </p>
            <button
              type="button"
              onClick={() => setAbierta(null)}
              className="min-h-11 shrink-0 text-ui font-semibold text-ink-60"
            >
              Listo
            </button>
          </div>

          {/* LAS CUATRO CASILLAS, combinables. Lo normal es marcar dos. */}
          <fieldset>
            <legend className={CLASE_LABEL}>Qué se le hizo</legend>
            <div className="grid grid-cols-2 gap-2">
              {ACCIONES.map((accion) => (
                <label
                  key={accion}
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 ${
                    detalle[accion]
                      ? "border-ink bg-surface font-semibold text-ink"
                      : "border-line bg-base text-ink-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={detalle[accion]}
                    onChange={() => alternarAccion(accion)}
                    className="size-5 shrink-0 cursor-pointer accent-ink"
                  />
                  <span className="text-ui">{ETIQUETA_ACCION[accion]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Rotada abre de dónde venía. La base lo exige y lo verifica. */}
          {detalle.rotada && (
            <div className="mt-3">
              <label htmlFor="rueda-anterior" className={CLASE_LABEL}>
                Venía de
              </label>
              <select
                id="rueda-anterior"
                value={detalle.posicionAnterior}
                onChange={(e) => editar("posicionAnterior", e.target.value)}
                className={CLASE_CAMPO}
              >
                <option value="">Elegí la posición</option>
                {POSICIONES.filter((p) => p !== abierta).map((p) => (
                  <option key={p} value={p}>
                    {ETIQUETA_POSICION[p]}
                  </option>
                ))}
              </select>
              {detalle.posicionAnterior === "" && (
                <p className="mt-1.5 text-ui text-urgente">
                  Marcá de qué posición venía esta cubierta.
                </p>
              )}
            </div>
          )}

          {/* Colocada abre el catálogo. Elegir la cubierta copia marca y
              medida; también se puede cargar todo a mano, sin producto. */}
          {detalle.colocada && (
            <div className="mt-3">
              <SelectorProductoBuscable
                id={`rueda-producto-${abierta}`}
                etiqueta="Cubierta del catálogo"
                productoId={detalle.productoId}
                alElegir={(p) =>
                  elegirProducto(
                    p as (ProductoBuscable & { marca: string | null }) | null,
                  )
                }
                productos={productos}
              />
              <p className="mt-1.5 text-label text-ink-60">
                Elegirla descuenta una del stock y copia marca y medida. Si no
                está en el catálogo, escribí los datos abajo.
              </p>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rueda-marca" className={CLASE_LABEL}>
                Marca
              </label>
              <input
                id="rueda-marca"
                value={detalle.marca}
                onChange={(e) => editar("marca", e.target.value)}
                placeholder="Fate"
                className={CLASE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor="rueda-medida" className={CLASE_LABEL}>
                Medida
              </label>
              <input
                id="rueda-medida"
                value={detalle.medida}
                onChange={(e) => editar("medida", e.target.value)}
                placeholder="205/55 R16"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
              {medidaRara && (
                <p className="mt-1.5 text-ui text-urgente">{MEDIDA_FORMATO}</p>
              )}
            </div>
            <div>
              <label htmlFor="rueda-indice" className={CLASE_LABEL}>
                Índice de carga y velocidad
              </label>
              <input
                id="rueda-indice"
                value={detalle.indiceCargaVel}
                onChange={(e) => editar("indiceCargaVel", e.target.value)}
                placeholder="91V"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="rueda-dot" className={CLASE_LABEL}>
                DOT
              </label>
              <input
                id="rueda-dot"
                inputMode="numeric"
                value={detalle.dot}
                onChange={(e) => editar("dot", e.target.value)}
                placeholder="2325"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
              <p className="mt-1.5 text-label text-ink-60 tabular-nums">
                {DOT_AYUDA}
              </p>
              {dotRaro && (
                <p className="mt-1.5 text-ui text-urgente">{DOT_FORMATO}</p>
              )}
            </div>
            <div>
              <label htmlFor="rueda-profundidad" className={CLASE_LABEL}>
                Profundidad (mm)
              </label>
              <input
                id="rueda-profundidad"
                inputMode="decimal"
                value={detalle.profundidad}
                onChange={(e) => editar("profundidad", e.target.value)}
                placeholder="7,5"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="rueda-presion" className={CLASE_LABEL}>
                Presión (PSI)
              </label>
              <input
                id="rueda-presion"
                inputMode="numeric"
                value={detalle.presion}
                onChange={(e) => editar("presion", e.target.value)}
                placeholder="32"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => alCambiar(abierta, ruedaVacia())}
            className="mt-3 min-h-11 text-ui font-semibold text-ink-60"
          >
            Vaciar esta rueda
          </button>
        </div>
      )}
    </div>
  );
}

function TarjetaPosicion({
  posicion,
  rueda,
  abierta,
  alTocar,
}: {
  posicion: PosicionRueda;
  rueda: RuedaForm;
  abierta: boolean;
  alTocar: () => void;
}) {
  const cargada = ruedaCuenta(rueda) || tieneDatos(rueda);

  return (
    <button
      type="button"
      onClick={alTocar}
      aria-expanded={abierta}
      className={`flex min-h-16 w-full flex-col justify-center rounded-md border px-3 py-2 text-left transition-colors ${
        abierta
          ? "border-ink bg-ink text-white"
          : cargada
            ? "border-ink bg-base text-ink"
            : "border-line bg-base text-ink-60 hover:bg-surface"
      }`}
    >
      <span
        className={`text-ui ${abierta || cargada ? "font-semibold" : ""}`}
      >
        {ETIQUETA_POSICION[posicion]}
      </span>
      <span
        className={`text-label tabular-nums ${
          abierta ? "text-white/70" : cargada ? "text-ink-60" : "text-ink-40"
        }`}
      >
        {resumenTarjeta(rueda)}
      </span>
    </button>
  );
}
