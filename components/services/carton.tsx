"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { CartonPapel } from "@/components/services/carton-papel";
import {
  RENGLONES,
  GRUPOS,
  esViscosidadValida,
  normalizarViscosidad,
  formatearKm,
  VISCOSIDAD_FORMATO,
  type ItemTipo,
} from "@/lib/renglones";
import { recordarSucursal } from "@/lib/preferencias";
import {
  guardarService,
  crearProductoRapido,
  type ItemCargado,
} from "@/app/panel/services/nuevo/[vehiculoId]/actions";
import { actualizarService } from "@/app/panel/services/[serviceId]/editar/actions";

type Producto = { id: string; nombre: string; categoria: string };
type Sucursal = { id: string; nombre: string };

export type DatosCarton = {
  vehiculoId: string;
  patente: string;
  vehiculoNombre: string;
  clienteNombre: string;
  lubricentroNombre: string;
  colorTenant: string;
  sucursales: Sucursal[];
  sucursalInicial: string;
  productos: Producto[];
  ultimoService: { fecha: string; kilometros: number } | null;
  serviceDeHoy: { hora: string; sucursal: string; kilometros: number } | null;
  hoy: string;
};

// El mismo cartón sirve para cargar y para editar: si fueran dos
// formularios se desincronizan, y el mecánico ya conoce esta pantalla.
// En edición llega el service precargado; el vehículo no se puede cambiar
// (nunca fue un campo del formulario, y así debe seguir: un service
// cargado en el auto equivocado se anula y se recarga).
export type ServiceEnEdicion = {
  serviceId: string;
  fecha: string;
  kilometros: number;
  aceiteTipo: string;
  aceiteProductoId: string | null;
  proxServiceKm: number;
  observaciones: string | null;
  // tipo → detalle escrito ("" = marcado sin detalle)
  marcados: Record<string, string>;
};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// El próximo service guardado pudo salir de los atajos o de un número a
// mano: al reabrir, se vuelve al atajo si la cuenta coincide.
function proxInicial(edicion: ServiceEnEdicion | undefined) {
  if (!edicion) return { modo: "10" as const, manual: "" };
  if (edicion.proxServiceKm === edicion.kilometros + 10000)
    return { modo: "10" as const, manual: "" };
  if (edicion.proxServiceKm === edicion.kilometros + 15000)
    return { modo: "15" as const, manual: "" };
  return { modo: "otro" as const, manual: String(edicion.proxServiceKm) };
}

export function Carton({
  datos,
  edicion,
}: {
  datos: DatosCarton;
  edicion?: ServiceEnEdicion;
}) {
  const router = useRouter();

  const [sucursalId, setSucursalId] = useState(datos.sucursalInicial);
  const [fecha, setFecha] = useState(edicion?.fecha ?? datos.hoy);
  const [km, setKm] = useState(edicion ? String(edicion.kilometros) : "");
  const [aceiteTipo, setAceiteTipo] = useState(edicion?.aceiteTipo ?? "");
  const [aceiteProductoId, setAceiteProductoId] = useState(
    edicion?.aceiteProductoId ?? "",
  );
  // tipo → detalle escrito (string vacío = marcado sin detalle)
  const [marcados, setMarcados] = useState<Record<string, string>>(
    edicion?.marcados ?? {},
  );
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [proxModo, setProxModo] = useState<"10" | "15" | "otro">(
    proxInicial(edicion).modo,
  );
  const [proxManual, setProxManual] = useState(proxInicial(edicion).manual);
  const [observaciones, setObservaciones] = useState(
    edicion?.observaciones ?? "",
  );
  const [mostrarObs, setMostrarObs] = useState(
    Boolean(edicion?.observaciones),
  );

  const [paso, setPaso] = useState<"carton" | "preview">("carton");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alta rápida de producto, sin salir del cartón
  const [productos, setProductos] = useState(datos.productos);
  const [altaProducto, setAltaProducto] = useState(false);
  const [nombreProducto, setNombreProducto] = useState("");
  const [marcaProducto, setMarcaProducto] = useState("");
  const [errorProducto, setErrorProducto] = useState<string | null>(null);

  const kmNum = Number(km.replace(/\D/g, ""));
  const kmCargado = km.trim() !== "" && Number.isFinite(kmNum);
  // El typo más probable y el que más ensucia la predicción de retorno.
  // Advierte, nunca bloquea: un odómetro cambiado es real.
  const kmMenor =
    kmCargado && datos.ultimoService !== null && kmNum < datos.ultimoService.kilometros;

  const viscosidadRara =
    aceiteTipo.trim().length > 0 && !esViscosidadValida(aceiteTipo);

  const proxKm = useMemo(() => {
    if (proxModo === "otro") return Number(proxManual.replace(/\D/g, "")) || 0;
    return kmCargado ? kmNum + (proxModo === "10" ? 10000 : 15000) : 0;
  }, [proxModo, proxManual, kmCargado, kmNum]);

  const aceitesDelCatalogo = productos.filter((p) => p.categoria === "aceite");
  const nombreAceite =
    productos.find((p) => p.id === aceiteProductoId)?.nombre ?? null;

  function alternarRenglon(tipo: ItemTipo) {
    setMarcados((previo) => {
      const copia = { ...previo };
      if (tipo in copia) delete copia[tipo];
      else copia[tipo] = "";
      return copia;
    });
  }

  async function agregarProducto() {
    setErrorProducto(null);
    const resultado = await crearProductoRapido("aceite", nombreProducto, marcaProducto);
    if (resultado.error) return setErrorProducto(resultado.error);
    if (resultado.id && resultado.nombre) {
      setProductos((p) => [
        ...p,
        { id: resultado.id!, nombre: resultado.nombre!, categoria: "aceite" },
      ]);
      setAceiteProductoId(resultado.id);
      setAltaProducto(false);
      setNombreProducto("");
      setMarcaProducto("");
    }
  }

  async function confirmar() {
    setGuardando(true);
    setError(null);

    // El detalle escrito que coincide con un producto del catálogo se guarda
    // como producto; el resto queda como texto libre del renglón.
    const items: ItemCargado[] = Object.entries(marcados).map(([tipo, detalle]) => {
      const limpio = detalle.trim();
      const producto = productos.find((p) => p.nombre === limpio);
      return {
        tipo,
        producto_id: producto?.id ?? null,
        detalle: producto ? null : limpio || null,
      };
    });

    const payload = {
      vehiculoId: datos.vehiculoId,
      sucursalId,
      fecha,
      kilometros: kmNum,
      aceiteTipo: normalizarViscosidad(aceiteTipo),
      aceiteProductoId: aceiteProductoId || null,
      aceiteNombre: nombreAceite,
      proxServiceKm: proxKm,
      observaciones: observaciones.trim() || null,
      items,
    };

    if (edicion) {
      const resultado = await actualizarService(edicion.serviceId, payload);
      if (resultado.error) {
        setError(resultado.error);
        setGuardando(false);
        return;
      }
      router.push(`/panel/services/${edicion.serviceId}`);
      router.refresh();
      return;
    }

    const resultado = await guardarService(payload);
    if (resultado.error) {
      setError(resultado.error);
      setGuardando(false);
      return;
    }
    router.push(`/panel/services/${resultado.serviceId}/guardado`);
  }

  const datosPreview = {
    lubricentroNombre: datos.lubricentroNombre,
    colorTenant: datos.colorTenant,
    fecha,
    kilometros: kmNum || 0,
    aceiteTipo: normalizarViscosidad(aceiteTipo),
    proxServiceKm: proxKm,
    marcados: Object.fromEntries(
      Object.entries(marcados).map(([tipo, detalle]) => [
        tipo,
        detalle.trim() || null,
      ]),
    ),
  };

  const listoParaRevisar = kmCargado && aceiteTipo.trim().length >= 2 && proxKm > kmNum;

  // ---------- Momento 2 ----------
  if (paso === "preview") {
    return (
      <div className="pb-4">
        <h1 className="font-brand text-h3 font-bold text-ink">Revisá el service</h1>
        <p className="mt-0.5 mb-4 text-ui text-ink-60">
          Así lo va a ver {datos.clienteNombre.split(" ")[0]} en su celular
        </p>

        {/* El cartón es la vista de un celular: se mantiene angosto siempre,
            porque estirarlo sería mentir sobre lo que ve el cliente. Apenas
            hay ancho, en vez de crecer se le pone al lado el aviso y las
            acciones — así el mecánico ve el cartón entero y Confirmar queda
            arriba del fold, sin scrollear. Recién desde 768px: más abajo la
            columna de acciones no da para los dos botones en una fila. */}
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr] md:items-start lg:grid-cols-[minmax(0,23rem)_1fr] lg:gap-5">
          {/* Ancho de celular siempre: estirarlo sería mentir sobre lo que
              el cliente va a ver. */}
          <div className="w-full sm:mx-auto sm:max-w-sm md:mx-0 md:max-w-none">
            <CartonPapel datos={datosPreview} />
          </div>

          <div className="flex w-full flex-col sm:mx-auto sm:max-w-sm md:mx-0 md:sticky md:top-4 md:max-w-none">
        <div className="rounded-md border border-line bg-surface px-4 py-3.5">
          <p className="font-brand text-ui font-bold text-ink">
            Editable por 24 horas
          </p>
          <p className="mt-0.5 text-ui text-ink-60">
            Este service podrá editarse solo durante las 24 horas posteriores.
            Después queda fijado en el historial y no se puede modificar.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
          >
            {error}
          </p>
        )}

        {/* En la franja de tablet la columna de acciones es angosta y los dos
            botones en fila parten "Confirmar service" en dos renglones. Ahí se
            apilan —con el primario arriba, como en el resto del panel— y en
            desktop, con ancho de sobra, vuelven a la fila. */}
        <div className="mt-4 flex gap-2.5 md:flex-col-reverse lg:flex-row">
          <Boton
            variante="secundario"
            tam="lg"
            className="flex-1 md:flex-none lg:flex-1"
            onClick={() => setPaso("carton")}
            disabled={guardando}
          >
            Volver a editar
          </Boton>
          {/* Se deshabilita apenas se toca: es lo que evita el service
              duplicado por doble tap. Ancho fijo para que no salte. */}
          <Boton
            tam="lg"
            className="flex-1 md:flex-none lg:flex-1"
            onClick={confirmar}
            disabled={guardando}
          >
            {guardando
              ? "Guardando…"
              : edicion
                ? "Guardar cambios"
                : "Confirmar service"}
          </Boton>
        </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Momento 1 ----------
  return (
    <div>
      {/* 1. Cabecera sticky: acompaña todo el scroll.
          En mobile va a sangre, como una barra del sistema. En desktop se
          contiene al ancho del cartón y flota como tarjeta: una banda que
          sobresale del formulario se lee como un error de maquetado. */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-base px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5 sm:shadow-md">
        <div className="min-w-0 flex-1">
          <p className="plate truncate text-body text-ink">{datos.patente}</p>
          <p className="truncate text-label text-ink-60">
            {datos.vehiculoNombre} · {datos.clienteNombre}
          </p>
        </div>
        <select
          value={sucursalId}
          onChange={(e) => {
            setSucursalId(e.target.value);
            // Queda recordada en este dispositivo para el próximo service.
            recordarSucursal(e.target.value);
          }}
          aria-label="Sucursal"
          className="h-11 max-w-[45%] rounded-md border border-line bg-base px-2 text-ui text-ink"
        >
          {datos.sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Caso borde: ya se cargó un service hoy para esta patente */}
      {datos.serviceDeHoy && (
        <p className="mb-4 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Ya hay un service de hoy para esta patente: {datos.serviceDeHoy.hora} en{" "}
          {datos.serviceDeHoy.sucursal}, a los{" "}
          {formatearKm(datos.serviceDeHoy.kilometros)} km. Si igual corresponde
          cargar otro, seguí.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {/* 2 y 3. Fecha y kilómetros. Desde tablet van en pares: son dos
            campos cortos y uno debajo del otro desperdicia el ancho. El de
            kilómetros conserva su altura grande, que es lo que importa. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <div>
            <label htmlFor="fecha" className={CLASE_LABEL}>
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              // Iguala la altura del campo de kilómetros solo cuando van en
              // pares; en mobile conserva su alto de siempre.
              className={`${CLASE_CAMPO} tabular-nums sm:h-14`}
            />
          </div>

          <div>
          <label htmlFor="km" className={CLASE_LABEL}>
            Kilómetros
          </label>
          <input
            id="km"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="98450"
            className={`${CLASE_CAMPO} h-14 text-h3 tabular-nums`}
          />
          {datos.ultimoService && (
            <p className="mt-1.5 text-label text-ink-60 tabular-nums">
              Último service: {formatearKm(datos.ultimoService.kilometros)} km
            </p>
          )}
          {kmMenor && datos.ultimoService && (
            <p className="mt-2 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
              Son menos que el último service (
              {formatearKm(datos.ultimoService.kilometros)} km). Verificá el
              odómetro — si está bien, seguí igual.
            </p>
          )}
          </div>
        </div>

        {/* 4. Aceite de motor — bloque destacado, siempre en blanco */}
        <div className="rounded-lg border border-line bg-surface/60 p-4">
          <p className="mb-3 font-brand text-body font-bold text-ink">
            Aceite de motor
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:flex-1">
              <label htmlFor="viscosidad" className={CLASE_LABEL}>
                Viscosidad
              </label>
              <input
                id="viscosidad"
                value={aceiteTipo}
                onChange={(e) => setAceiteTipo(e.target.value.toUpperCase())}
                placeholder="15W40"
                autoCapitalize="characters"
                autoComplete="off"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
            <div className="sm:flex-[1.4]">
              <label htmlFor="aceite-producto" className={CLASE_LABEL}>
                Producto <span className="text-ink-40 normal-case">(opcional)</span>
              </label>
              <select
                id="aceite-producto"
                value={aceiteProductoId}
                onChange={(e) => {
                  if (e.target.value === "__nuevo") {
                    setAltaProducto(true);
                    return;
                  }
                  setAceiteProductoId(e.target.value);
                }}
                className={CLASE_CAMPO}
              >
                <option value="">Sin producto</option>
                {aceitesDelCatalogo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                <option value="__nuevo">+ Agregar producto…</option>
              </select>
            </div>
          </div>

          {viscosidadRara && (
            <p className="mt-2 text-ui text-urgente">{VISCOSIDAD_FORMATO}</p>
          )}

          {altaProducto && (
            <div className="mt-3 rounded-md border border-line bg-base p-3">
              <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                Producto nuevo
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={nombreProducto}
                  onChange={(e) => setNombreProducto(e.target.value)}
                  placeholder="Helix HX7 10W40"
                  className={`${CLASE_CAMPO} sm:flex-1`}
                />
                <input
                  value={marcaProducto}
                  onChange={(e) => setMarcaProducto(e.target.value)}
                  placeholder="Shell"
                  className={`${CLASE_CAMPO} sm:w-32`}
                />
              </div>
              {errorProducto && (
                <p className="mt-2 text-ui text-overdue">{errorProducto}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Boton onClick={agregarProducto} className="flex-1">
                  Agregar al catálogo
                </Boton>
                <Boton
                  variante="secundario"
                  onClick={() => setAltaProducto(false)}
                >
                  Cancelar
                </Boton>
              </div>
            </div>
          )}
        </div>

        {/* 5. Los 11 renglones, agrupados como el papel */}
        <datalist id="catalogo-productos">
          {productos.map((p) => (
            <option key={p.id} value={p.nombre} />
          ))}
        </datalist>

        {/* Los cuatro grupos son listas independientes: en desktop van en dos
            columnas y el cartón entra casi entero en una pantalla. El orden
            de lectura no se rompe — se leen igual de arriba a abajo y de
            izquierda a derecha, en el orden del papel.
            items-start evita que un grupo con un detalle abierto estire al
            de al lado. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {GRUPOS.map((grupo) => (
          <div key={grupo} className="overflow-hidden rounded-lg border border-line">
            <p className="border-b border-line bg-surface px-3.5 py-2 text-label font-semibold tracking-[0.12em] text-ink-60 uppercase">
              {grupo}
            </p>
            {RENGLONES.filter((r) => r.grupo === grupo).map((r) => {
              const encendido = r.tipo in marcados;
              return (
                <div key={r.tipo} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={encendido}
                    onClick={() => alternarRenglon(r.tipo)}
                    className="flex min-h-13 w-full items-center justify-between gap-3 px-3.5 py-2 text-left"
                  >
                    <span
                      className={`text-body ${
                        encendido ? "font-semibold text-ink" : "text-ink-60"
                      }`}
                    >
                      {r.corto}
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

                  {encendido && (
                    <div className="px-3.5 pb-3">
                      {abiertos[r.tipo] || marcados[r.tipo] ? (
                        <input
                          list="catalogo-productos"
                          value={marcados[r.tipo]}
                          onChange={(e) =>
                            setMarcados((p) => ({ ...p, [r.tipo]: e.target.value }))
                          }
                          placeholder="Producto o detalle"
                          className={`${CLASE_CAMPO} h-11`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setAbiertos((p) => ({ ...p, [r.tipo]: true }))
                          }
                          className="min-h-11 text-ui font-semibold text-brand"
                        >
                          + detalle
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </div>

        {/* 6 y 7. Próximo service y observaciones, también en pares desde
            desktop: son el cierre del cartón y ninguno necesita todo el ancho. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <div>
          <span className={CLASE_LABEL}>Próximo service</span>
          <div className="flex flex-wrap gap-2">
            {(["10", "15", "otro"] as const).map((modo) => (
              <button
                key={modo}
                type="button"
                onClick={() => setProxModo(modo)}
                aria-pressed={proxModo === modo}
                className={`flex h-11 items-center rounded-md border px-3.5 text-ui tabular-nums transition-colors ${
                  proxModo === modo
                    ? "border-ink bg-ink font-semibold text-white"
                    : "border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                {modo === "otro" ? "Otro" : `+${formatearKm(Number(modo) * 1000)} km`}
              </button>
            ))}
          </div>
          {proxModo === "otro" && (
            <input
              inputMode="numeric"
              value={proxManual}
              onChange={(e) => setProxManual(e.target.value)}
              placeholder="108450"
              className={`${CLASE_CAMPO} mt-2 tabular-nums`}
            />
          )}
          {proxKm > 0 && (
            <p className="mt-1.5 text-label text-ink-60 tabular-nums">
              Próximo service: {formatearKm(proxKm)} km
            </p>
          )}
        </div>

        {/* 7. Observaciones — colapsado, el margen del cartón */}
        {mostrarObs ? (
          <div>
            <label htmlFor="obs" className={CLASE_LABEL}>
              Observaciones
            </label>
            <textarea
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMostrarObs(true)}
            className="min-h-11 self-start justify-self-start text-ui font-semibold text-ink-60"
          >
            + Agregar observaciones
          </button>
        )}
        </div>
      </div>

      {/* 8. Botón fijo inferior — nunca guardado directo.
          Va en una banda opaca: el cartón scrollea por detrás, no por
          encima. El offset lo deja despejado de la barra de navegación
          de mobile. */}
      <div className="sticky bottom-[calc(45px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-line bg-base px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5 sm:shadow-lg lg:bottom-6">
        <Boton
          tam="lg"
          className="w-full"
          disabled={!listoParaRevisar}
          onClick={() => setPaso("preview")}
        >
          Revisar y confirmar
        </Boton>
        {!listoParaRevisar && (
          <p className="mt-1.5 text-center text-label text-ink-60">
            Faltan los kilómetros y la viscosidad del aceite.
          </p>
        )}
      </div>
      {/* Aire para que el último renglón pueda subir por encima de la banda */}
      <div className="h-4" />
    </div>
  );
}
