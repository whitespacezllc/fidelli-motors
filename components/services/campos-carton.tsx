"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { formatearFecha } from "@/lib/fechas";
import {
  ATF_COMUNES,
  VISCOSIDADES_SAE,
  atfComun,
  esViscosidadValida,
  normalizarViscosidad,
  formatearKm,
} from "@/lib/renglones";
import { normalizar } from "@/lib/texto";
import type { VehiculoIdentificado } from "@/app/panel/(tras-onboarding)/services/nuevo/actions";

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
          Cargar trabajo
        </button>
      ) : (
        <Link
          href={`/panel/services/nuevo/${vehiculo.vehiculoId}`}
          className={`${clasesBoton("primario", "lg")} mt-3.5 w-full`}
        >
          Cargar trabajo
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

// ---------- Viscosidad: las once SAE y «Otra» ----------
// Los chips son el control; el campo libre aparece SOLO al tocar «Otra».
// Antes era al revés —un cuadro vacío sin placeholder arriba de los
// chips— y lo primero que veía el mecánico, obligatorio, no decía qué iba.
// Es el patrón de «Próximo service» (atajos + «Otro») copiado, no
// generalizado.
//
// El valor sigue siendo UN string. Un valor que coincide con un chip
// prende ese chip; cualquier otro prende «Otra» y muestra el campo con el
// valor (un service guardado con 0W16 abre así en la edición). El estado
// propio existe solo para el rato en que «Otra» está tocada y el campo
// todavía vacío.
export function SelectorViscosidad({
  valor,
  alCambiar,
  delProducto = null,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
  /** El aceite elegido, cuando su nombre trae viscosidad ("Magnatec 5W30"
   *  → 5W30). Con otra marcada se avisa y se ofrece la del producto.
   *  Nunca pisa sola. */
  delProducto?: { nombre: string; viscosidad: string } | null;
}) {
  const [otraElegida, setOtraElegida] = useState(false);
  // Lo último que salió del campo de «Otra»: si el valor cambia por otro
  // lado (un chip de aceite, «Usar 5W30») el campo se va solo.
  const [escrito, setEscrito] = useState<string | null>(null);
  // El campo toma el foco solo cuando se acaba de tocar «Otra», no al
  // abrir un service que ya se guardó con una viscosidad propia.
  const [recienElegida, setRecienElegida] = useState(false);

  const normal = normalizarViscosidad(valor);
  const enLista = (VISCOSIDADES_SAE as readonly string[]).includes(normal);
  const campoVisible =
    (normal !== "" && !enLista) ||
    (otraElegida && (valor === "" || valor === escrito));
  const otraPrendida = campoVisible && !enLista;

  function elegir(v: string) {
    setOtraElegida(false);
    setEscrito(null);
    alCambiar(v);
  }

  const claseChip = (activa: boolean) =>
    `flex h-11 items-center rounded-md border px-2.5 text-ui tabular-nums transition-colors ${
      activa
        ? "border-ink bg-ink font-semibold text-white"
        : "border-line bg-base text-ink-60 hover:bg-surface"
    }`;

  return (
    <div role="group" aria-labelledby="viscosidad-etiqueta">
      <span id="viscosidad-etiqueta" className={CLASE_LABEL}>
        Viscosidad
      </span>
      {/* Las once SAE de un tap, en el orden del rubro y SIEMPRE en
          el mismo lugar: la posición fija hace memoria muscular.
          Ninguna viene marcada —la viscosidad nunca se autocompleta sin
          que el mecánico elija algo— y «Otra» va al final, punteada. */}
      <div className="flex flex-wrap gap-1.5">
        {VISCOSIDADES_SAE.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => elegir(v)}
            aria-pressed={normal === v}
            className={claseChip(normal === v)}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          data-viscosidad-otra
          onClick={() => {
            if (otraPrendida) return;
            setOtraElegida(true);
            setEscrito(null);
            setRecienElegida(true);
            alCambiar("");
          }}
          aria-pressed={otraPrendida}
          className={`${claseChip(otraPrendida)} ${otraPrendida ? "" : "border-dashed"}`}
        >
          Otra
        </button>
      </div>

      {/* El texto libre, para lo que no está (un 0W16 de japoneses
          nuevos): el que tiene el envase en la mano sabe más. Angosto y
          en su propia fila, para no romper la de los chips. */}
      {campoVisible && (
        <div className="mt-2 max-w-[200px]">
          <input
            id="viscosidad"
            value={valor}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setEscrito(v);
              alCambiar(v);
            }}
            // Si lo escrito terminó siendo una de las once, el chip ya la
            // muestra: al salir, el campo se va.
            onBlur={() => {
              if (enLista) setOtraElegida(false);
            }}
            autoFocus={recienElegida}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej: 0W16"
            aria-label="Otra viscosidad"
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
      )}

      {/* El nombre del aceite ya dice su viscosidad. Si se marcó otra, se
          avisa y se ofrece; decidir, decide el mecánico. Con el campo a
          medio escribir no se avisa: recién con una viscosidad entera. */}
      {delProducto &&
        esViscosidadValida(valor) &&
        delProducto.viscosidad !== normal && (
          <p
            data-aviso-viscosidad
            className="mt-1 text-ui text-overdue tabular-nums"
          >
            {delProducto.nombre} es {delProducto.viscosidad} y marcaste{" "}
            {normal}.{" "}
            <button
              type="button"
              onClick={() => elegir(delProducto.viscosidad)}
              className="inline-flex min-h-11 items-center font-semibold text-brand"
            >
              Usar {delProducto.viscosidad}
            </button>
          </p>
        )}
    </div>
  );
}

// ---------- Aceite de caja: los ATF de uso corriente y «Otro» ----------
// El mismo patrón que la viscosidad, con otra lista: los chips son el
// control y el campo libre aparece SOLO al tocar «Otro» (o cuando el valor
// guardado no es ninguno de la lista: un «Toyota WS» abre así en la
// edición). Es otro componente y no una variante de SelectorViscosidad
// porque lo que hacía particular a aquel acá no existe: un ATF no se
// normaliza a mayúsculas ni se lee del nombre del producto.
//
// El valor sigue siendo UN string, tal cual se va a guardar.
export function SelectorAtf({
  valor,
  alCambiar,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  const [otroElegido, setOtroElegido] = useState(false);
  // Lo último que salió del campo de «Otro»: si el valor cambia por otro
  // lado (un chip), el campo se va solo.
  const [escrito, setEscrito] = useState<string | null>(null);
  // El campo toma el foco solo cuando se acaba de tocar «Otro», no al
  // abrir una caja que ya se guardó con un aceite propio.
  const [recienElegido, setRecienElegido] = useState(false);

  // El chip que corresponde a lo escrito, sin importar mayúsculas.
  const chip = atfComun(valor);
  const enLista = chip !== null;
  const campoVisible =
    (valor.trim() !== "" && !enLista) ||
    (otroElegido && (valor === "" || valor === escrito));
  const otroPrendido = campoVisible && !enLista;

  function elegir(v: string) {
    setOtroElegido(false);
    setEscrito(null);
    alCambiar(v);
  }

  const claseChip = (activa: boolean) =>
    `flex h-11 items-center rounded-md border px-2.5 text-ui transition-colors ${
      activa
        ? "border-ink bg-ink font-semibold text-white"
        : "border-line bg-base text-ink-60 hover:bg-surface"
    }`;

  return (
    <div role="group" aria-labelledby="atf-etiqueta">
      <span id="atf-etiqueta" className={CLASE_LABEL}>
        Tipo <span className="text-ink-40 normal-case">(ATF)</span>
      </span>
      {/* Siempre en el mismo lugar y ninguno marcado de entrada: el aceite
          de caja no se autocompleta sin que el mecánico elija algo.
          Envuelven: en un celular de 360 ocupan dos o tres filas. */}
      <div className="flex flex-wrap gap-1.5">
        {ATF_COMUNES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => elegir(a)}
            aria-pressed={chip === a}
            className={claseChip(chip === a)}
          >
            {a}
          </button>
        ))}
        <button
          type="button"
          data-atf-otro
          onClick={() => {
            if (otroPrendido) return;
            setOtroElegido(true);
            setEscrito(null);
            setRecienElegido(true);
            alCambiar("");
          }}
          aria-pressed={otroPrendido}
          className={`${claseChip(otroPrendido)} ${otroPrendido ? "" : "border-dashed"}`}
        >
          Otro
        </button>
      </div>

      {/* El texto libre, para lo que no está en la lista: el que tiene el
          bidón en la mano sabe más. En su propia fila y angosto. */}
      {campoVisible && (
        <div className="mt-2 max-w-[220px]">
          <input
            id="atf-otro"
            value={valor}
            onChange={(e) => {
              setEscrito(e.target.value);
              alCambiar(e.target.value);
            }}
            // Si lo escrito terminó siendo uno de la lista, el chip ya lo
            // muestra: al salir, el campo se va y queda el nombre del chip.
            onBlur={() => {
              if (chip !== null) elegir(chip);
            }}
            autoFocus={recienElegido}
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej: Toyota WS"
            aria-label="Otro aceite de caja"
            className={CLASE_CAMPO}
          />
        </div>
      )}
    </div>
  );
}

// ---------- El alta rápida de un producto, sin salir del cartón ----------
// Presentación pura, con el estado y la acción inyectados. La usa el
// bloque «Aceite de caja»; el del aceite de motor tiene la suya escrita en
// carton.tsx desde antes y no se tocó.
export function AltaProductoRapida({
  idBase,
  nombre,
  marca,
  alCambiarNombre,
  alCambiarMarca,
  focoEnMarca,
  ejemploNombre,
  ejemploMarca,
  error,
  alAgregar,
  alCancelar,
}: {
  /** Prefijo de los `id` de los dos campos: único en la pantalla. */
  idBase: string;
  nombre: string;
  marca: string;
  alCambiarNombre: (valor: string) => void;
  alCambiarMarca: (valor: string) => void;
  /** El alta abrió con el nombre ya escrito (lo tipeado en el buscador):
   *  el foco va a Marca; si no, a Nombre. */
  focoEnMarca: boolean;
  ejemploNombre: string;
  ejemploMarca: string;
  error: string | null;
  alAgregar: () => void;
  alCancelar: () => void;
}) {
  return (
    <div
      data-alta-producto={idBase}
      className="mt-3 rounded-md border border-line bg-base p-3"
    >
      <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
        Producto nuevo
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div>
          <label htmlFor={`${idBase}-nombre`} className={CLASE_LABEL}>
            Nombre
          </label>
          <input
            id={`${idBase}-nombre`}
            value={nombre}
            onChange={(e) => alCambiarNombre(e.target.value)}
            autoFocus={!focoEnMarca}
            autoComplete="off"
            placeholder={ejemploNombre}
            className={CLASE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-marca`} className={CLASE_LABEL}>
            Marca
          </label>
          <input
            id={`${idBase}-marca`}
            value={marca}
            onChange={(e) => alCambiarMarca(e.target.value)}
            autoFocus={focoEnMarca}
            autoComplete="off"
            placeholder={ejemploMarca}
            className={CLASE_CAMPO}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-ui text-overdue">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Boton onClick={alAgregar} className="flex-1">
          Agregar al catálogo
        </Boton>
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </div>
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

// ---------- Producto del catálogo, con buscador — SOLO el panel ----------
// La landing sigue usando el select de arriba: su simulación no se toca.
// Acá el catálogo real puede tener decenas de productos, y el mecánico
// escribe tres letras en vez de scrollear una lista. Elegirlo muestra el
// precio y el stock.
export type ProductoBuscable = {
  id: string;
  nombre: string;
  /** La marca cruda: se busca también por ella, y se le saca al nombre
   *  cuando hay que nombrar el producto en una oración. */
  marca?: string | null;
  precioVenta: number | null;
  stock: number | null;
  unidad: string;
  litrosSugeridos: number | null;
};

/** El nombre sin la marca. En el cartón el nombre llega armado como
 *  "Magnatec 5W30 · Castrol" (así se lee en la lista y en los chips); en
 *  una oración —«Quitar Magnatec 5W30»— va el producto a secas. */
export function nombreSinMarca(p: {
  nombre: string;
  marca?: string | null;
}): string {
  const sufijo = p.marca ? ` · ${p.marca}` : "";
  return sufijo && p.nombre.endsWith(sufijo)
    ? p.nombre.slice(0, -sufijo.length)
    : p.nombre;
}

// Nació para el aceite del cartón y lo usa también cada rueda del trabajo
// de gomería, que busca en la categoría `neumatico`. Es el MISMO
// componente y no una variante: lo que cambia entre los dos usos es el
// catálogo que recibe, el `id` del campo (único cuando hay cinco en la
// misma pantalla) y dónde se ve el elegido.
//
// LA LISTA VA EN EL FLUJO, debajo del campo, y empuja lo de abajo. Flotando
// (absolute) quedaba cortada por el teclado del celular. Por eso tampoco
// se cierra al perder el foco: cerrarla ahí corre de lugar lo de abajo en
// la mitad del toque, y el toque cae en otro lado. Se cierra al elegir, al
// tocar afuera —cuando el toque ya terminó—, con Escape, o cuando el foco
// sale del componente POR TECLADO (con Tab se recorre la lista, que son
// botones; recién al pasar el último ítem se cierra).
export function SelectorProductoBuscable({
  id = "producto-buscable",
  etiqueta = "Producto",
  ariaLabel,
  productoId,
  alElegir,
  productos,
  alPedirAlta,
  elegidoAfuera = false,
}: {
  id?: string;
  /** null = sin label propio: lo pone quien lo usa (y pasa `ariaLabel`). */
  etiqueta?: string | null;
  ariaLabel?: string;
  productoId: string;
  /** null = sin producto. */
  alElegir: (producto: ProductoBuscable | null) => void;
  productos: ProductoBuscable[];
  /** El alta rápida, con lo que se había escrito ("" si no había nada).
   *  Sin esto no se ofrece: donde no hay alta, no se inventa. */
  alPedirAlta?: (texto: string) => void;
  /** El elegido se muestra afuera (los chips del aceite): el campo queda
   *  solo para buscar y se vacía al elegir. */
  elegidoAfuera?: boolean;
}) {
  const elegido = productos.find((p) => p.id === productoId) ?? null;
  const [texto, setTexto] = useState(
    elegidoAfuera ? "" : (elegido?.nombre ?? ""),
  );
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  // ¿El foco se está moviendo con Tab? Solo ahí el blur cierra la lista.
  const conTab = useRef(false);

  useEffect(() => {
    if (!abierto) return;
    function alTocarAfuera(e: MouseEvent) {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("click", alTocarAfuera);
    return () => document.removeEventListener("click", alTocarAfuera);
  }, [abierto]);

  // Sin tildes ni mayúsculas, y también por la marca.
  const buscado = normalizar(texto);
  const filtrados = buscado
    ? productos.filter((p) =>
        normalizar(`${p.nombre} ${p.marca ?? ""}`).includes(buscado),
      )
    : productos;
  const coincideExacto = productos.some(
    (p) =>
      normalizar(p.nombre) === buscado ||
      normalizar(nombreSinMarca(p)) === buscado,
  );
  const ofreceAlta = Boolean(alPedirAlta) && !(buscado && coincideExacto);
  const sinCoincidencias =
    !alPedirAlta && buscado !== "" && filtrados.length === 0;
  const hayLista =
    elegido !== null || filtrados.length > 0 || ofreceAlta || sinCoincidencias;

  function cerrar() {
    setAbierto(false);
    // El foco se va del campo: en el celular, eso baja el teclado.
    campo.current?.blur();
  }

  const claseItem =
    "flex min-h-11 w-full items-center px-3.5 text-left text-ui hover:bg-surface";

  return (
    <div
      ref={caja}
      onKeyDown={(e) => {
        conTab.current = e.key === "Tab";
        if (e.key === "Escape") setAbierto(false);
      }}
      onBlur={(e) => {
        if (conTab.current && !e.currentTarget.contains(e.relatedTarget))
          setAbierto(false);
        conTab.current = false;
      }}
    >
      {etiqueta !== null && (
        <label htmlFor={id} className={CLASE_LABEL}>
          {etiqueta} <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
      )}
      <input
        ref={campo}
        id={id}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          // Escribir de nuevo invalida la elección anterior (cuando el
          // campo la estaba mostrando).
          if (!elegidoAfuera && elegido && e.target.value !== elegido.nombre)
            alElegir(null);
        }}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        placeholder="Nombre o marca…"
        aria-label={etiqueta === null ? ariaLabel : undefined}
        role="combobox"
        aria-expanded={abierto && hayLista}
        aria-controls={`${id}-lista`}
        autoComplete="off"
        className={CLASE_CAMPO}
      />
      {abierto && hayLista && (
        <ul
          id={`${id}-lista`}
          className="mt-1 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line bg-base"
        >
          {/* «Quitar» existe solo cuando hay algo que quitar. Con el campo
              vacío, el primer ítem es el primer producto. */}
          {elegido && (
            <li>
              <button
                type="button"
                data-quitar-producto
                onClick={() => {
                  setTexto("");
                  cerrar();
                  alElegir(null);
                }}
                className={`${claseItem} text-ink-60`}
              >
                Quitar {nombreSinMarca(elegido)}
              </button>
            </li>
          )}
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-producto={p.id}
                onClick={() => {
                  setTexto(elegidoAfuera ? "" : p.nombre);
                  cerrar();
                  alElegir(p);
                }}
                className={`${claseItem} flex-wrap gap-x-2 py-1.5 text-ink`}
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
          {sinCoincidencias && (
            <li className={`${claseItem} text-ink-40 hover:bg-transparent`}>
              Ningún producto coincide.
            </li>
          )}
          {/* El alta no tira lo que ya se escribió: lo lleva como nombre. */}
          {alPedirAlta && ofreceAlta && (
            <li>
              <button
                type="button"
                data-agregar-producto
                onClick={() => {
                  const escrito = texto.trim();
                  if (elegidoAfuera) setTexto("");
                  setAbierto(false);
                  alPedirAlta(escrito);
                }}
                className={`${claseItem} font-semibold text-brand`}
              >
                <span className="min-w-0 truncate">
                  {texto.trim()
                    ? `+ Agregar “${texto.trim()}” al catálogo`
                    : "+ Agregar producto…"}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
