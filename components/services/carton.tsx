"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { Combobox } from "@/components/ui/combobox";
import {
  CartonPapel,
  CartonPapelMecanica,
} from "@/components/services/carton-papel";
import {
  RENGLONES,
  GRUPOS,
  esViscosidadValida,
  normalizarViscosidad,
  formatearKm,
  VISCOSIDAD_FORMATO,
  type ItemTipo,
} from "@/lib/renglones";
import {
  CLASE_CAMPO,
  CLASE_LABEL,
  CabeceraCarton,
  CampoKilometros,
  SelectorViscosidad,
  SelectorProductoAceite,
  RenglonInterruptor,
} from "@/components/services/campos-carton";
import { recordarSucursal } from "@/lib/preferencias";
import { formatearFecha as formatearFechaCorta } from "@/lib/fechas";
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
  /** El papel del cartón del tenant (config_experiencia). */
  colorPapel: string | null;
  productos: Producto[];
  ultimoService: { fecha: string; kilometros: number } | null;
  serviceDeHoy: { hora: string; sucursal: string; kilometros: number | null } | null;
  hoy: string;
  /** Solo si el vehículo llegó a la meta y el premio está sin canjear.
   *  `alcance` decide si el canje también corresponde en una mecánica. */
  premioDisponible: { descripcion: string; alcance: "services" | "todos" } | null;
  /** El plan habilita mecánica: sin esto el selector de tipo no aparece. */
  puedeMecanica?: boolean;
  /** El plan habilita pendientes: gobierna los dos bloques de abajo. */
  puedePendientes?: boolean;
  /** Los pendientes ABIERTOS del auto, para tildar sin salir del flujo. */
  pendientesAbiertos?: {
    id: string;
    descripcion: string;
    creado: string;
    objetivoFecha: string | null;
    objetivoKm: number | null;
  }[];
};

// El mismo cartón sirve para cargar y para editar: si fueran dos
// formularios se desincronizan, y el mecánico ya conoce esta pantalla.
// En edición llega el service precargado; el vehículo no se puede cambiar
// (nunca fue un campo del formulario, y así debe seguir: un service
// cargado en el auto equivocado se anula y se recarga).
export type ServiceEnEdicion = {
  serviceId: string;
  /** El tipo NO se edita: un service no se convierte en mecánica. */
  tipo: "service" | "mecanica";
  fecha: string;
  kilometros: number | null;
  aceiteTipo: string;
  aceiteProductoId: string | null;
  proxServiceKm: number;
  trabajoDescripcion: string | null;
  /** Renglones libres de una mecánica, como texto. */
  libres: string[];
  observaciones: string | null;
  // tipo → detalle escrito ("" = marcado sin detalle)
  marcados: Record<string, string>;
  // tipo → true si fue cambio (vs. revisado OK)
  cambiados: Record<string, boolean>;
};

// CLASE_CAMPO y CLASE_LABEL viven en campos-carton.tsx, junto con los
// campos extraídos que también usa la simulación de la landing.

// Los tres saltos del cartón. Sin "Otro": la carga es a botón fijo — un
// número a mano era la puerta a un 100.000 de más que ensucia la
// predicción de retorno.
const SALTOS = ["8", "10", "15"] as const;
type Salto = (typeof SALTOS)[number];

// El próximo service guardado pudo salir de los atajos o —en services de
// antes de sacar "Otro"— de un número a mano: al reabrir, se vuelve al
// atajo si la cuenta coincide y, si no, el valor guardado se conserva
// como un botón más ("legado"), para que editar otra cosa no lo pise.
function proxInicial(edicion: ServiceEnEdicion | undefined) {
  if (!edicion || edicion.kilometros == null)
    return { modo: "10" as const, legado: edicion?.proxServiceKm ?? 0 };
  for (const salto of SALTOS) {
    if (edicion.proxServiceKm === edicion.kilometros + Number(salto) * 1000)
      return { modo: salto, legado: 0 };
  }
  return { modo: "legado" as const, legado: edicion.proxServiceKm };
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
  // El tipo de trabajo, LO PRIMERO del flujo: es la bifurcación entera.
  // En edición queda fijo — reescribir un service como mecánica sería
  // reescribir la historia del auto (la base también lo impide).
  const [tipo, setTipo] = useState<"service" | "mecanica">(
    edicion?.tipo ?? "service",
  );
  const esMecanica = tipo === "mecanica";
  const [descripcion, setDescripcion] = useState(
    edicion?.trabajoDescripcion ?? "",
  );
  const [libres, setLibres] = useState<string[]>(edicion?.libres ?? []);
  const [fecha, setFecha] = useState(edicion?.fecha ?? datos.hoy);
  const [km, setKm] = useState(
    edicion?.kilometros != null ? String(edicion.kilometros) : "",
  );
  const [aceiteTipo, setAceiteTipo] = useState(edicion?.aceiteTipo ?? "");
  const [aceiteProductoId, setAceiteProductoId] = useState(
    edicion?.aceiteProductoId ?? "",
  );
  // tipo → detalle escrito (string vacío = marcado sin detalle)
  const [marcados, setMarcados] = useState<Record<string, string>>(
    edicion?.marcados ?? {},
  );
  // tipo → fue cambio. Un renglón recién prendido arranca como "OK,
  // revisado": el cambio es la decisión extra, con su propio toggle.
  const [cambiados, setCambiados] = useState<Record<string, boolean>>(
    edicion?.cambiados ?? {},
  );
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [proxModo, setProxModo] = useState<Salto | "legado">(
    proxInicial(edicion).modo,
  );
  // Solo existe al editar un service viejo cargado con "Otro".
  const proxLegado = proxInicial(edicion).legado;
  const [observaciones, setObservaciones] = useState(
    edicion?.observaciones ?? "",
  );
  const [mostrarObs, setMostrarObs] = useState(
    Boolean(edicion?.observaciones),
  );
  // Apagado por defecto: aplicar el premio es una decisión del mostrador,
  // no algo que pase solo. Si el service no se confirma, no queda nada.
  const [canjear, setCanjear] = useState(false);

  // Los pendientes que el mecánico tilda porque los hizo EN este trabajo,
  // y los nuevos que anota al final ("¿quedó algo pendiente?").
  const [resolver, setResolver] = useState<Record<string, boolean>>({});
  const [nuevosPendientes, setNuevosPendientes] = useState<
    { descripcion: string; fecha: string; km: string; visible: boolean }[]
  >([]);
  const [mostrarPendientes, setMostrarPendientes] = useState(false);

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
  // El aviso de "menos que el último service" vive en CampoKilometros.

  const viscosidadRara =
    aceiteTipo.trim().length > 0 && !esViscosidadValida(aceiteTipo);

  const proxKm = useMemo(() => {
    if (proxModo === "legado") return proxLegado;
    return kmCargado ? kmNum + Number(proxModo) * 1000 : 0;
  }, [proxModo, proxLegado, kmCargado, kmNum]);

  const aceitesDelCatalogo = productos.filter((p) => p.categoria === "aceite");
  const nombreAceite =
    productos.find((p) => p.id === aceiteProductoId)?.nombre ?? null;
  // El detalle de cada renglón sugiere todo el catálogo; el mecánico escribe
  // libre si el producto no está cargado.
  const nombresProductos = productos.map((p) => p.nombre);

  function alternarRenglon(tipo: ItemTipo) {
    setMarcados((previo) => {
      const copia = { ...previo };
      if (tipo in copia) delete copia[tipo];
      else copia[tipo] = "";
      return copia;
    });
    // Apagar el renglón resetea también su estado de cambio: si se vuelve
    // a prender, arranca de nuevo como "OK, revisado".
    setCambiados((previo) => {
      const copia = { ...previo };
      delete copia[tipo];
      return copia;
    });
  }

  function alternarCambiado(tipo: ItemTipo) {
    setCambiados((previo) => ({ ...previo, [tipo]: !previo[tipo] }));
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

    // Service: el detalle escrito que coincide con un producto del catálogo
    // se guarda como producto; el resto queda como texto libre del renglón.
    // Mecánica: renglones libres — el texto viaja SIEMPRE en `detalle` (la
    // base lo exige para un renglón sin tipo) y el producto se vincula si
    // el nombre coincide.
    const items: ItemCargado[] = esMecanica
      ? libres
          .map((texto) => texto.trim())
          .filter(Boolean)
          .map((texto) => ({
            producto_id: productos.find((p) => p.nombre === texto)?.id ?? null,
            detalle: texto,
            cambiado: true,
          }))
      : Object.entries(marcados).map(([tipo, detalle]) => {
          const limpio = detalle.trim();
          const producto = productos.find((p) => p.nombre === limpio);
          return {
            tipo,
            producto_id: producto?.id ?? null,
            detalle: producto ? null : limpio || null,
            cambiado: Boolean(cambiados[tipo]),
          };
        });

    const payload = {
      vehiculoId: datos.vehiculoId,
      tipo,
      trabajoDescripcion: esMecanica ? descripcion.trim() : null,
      sucursalId,
      fecha,
      // En mecánica los kilómetros son opcionales: null si no se anotaron.
      kilometros: esMecanica ? (kmCargado ? kmNum : null) : kmNum,
      aceiteTipo: esMecanica ? "" : normalizarViscosidad(aceiteTipo),
      aceiteProductoId: esMecanica ? null : aceiteProductoId || null,
      aceiteNombre: esMecanica ? null : nombreAceite,
      proxServiceKm: esMecanica ? 0 : proxKm,
      observaciones: observaciones.trim() || null,
      items,
      // El canje va con el trabajo, en la misma transacción. Al editar no
      // viaja: un canje ya registrado no se toca desde acá.
      canjearPremio: Boolean(datos.premioDisponible) && canjear,
      // Pendientes: solo en la carga (al editar se manejan desde la ficha).
      pendientes: edicion
        ? []
        : nuevosPendientes
            .filter((np) => np.descripcion.trim().length >= 5)
            .map((np) => ({
              descripcion: np.descripcion.trim(),
              objetivoFecha: np.fecha || null,
              objetivoKm: np.km ? Number(np.km.replace(/\D/g, "")) : null,
              visibleCliente: np.visible,
            })),
      resolverPendientes: edicion
        ? []
        : Object.keys(resolver).filter((id) => resolver[id]),
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
    aceiteNombre: nombreAceite,
    proxServiceKm: proxKm,
    colorPapel: datos.colorPapel,
    marcados: Object.fromEntries(
      Object.entries(marcados).map(([tipo, detalle]) => [
        tipo,
        { detalle: detalle.trim() || null, cambiado: Boolean(cambiados[tipo]) },
      ]),
    ),
  };

  // Un pendiente escrito sin objetivo no puede pasar: el compromiso ES el
  // vencimiento. (Las filas totalmente vacías se ignoran solas.)
  const pendienteIncompleto = nuevosPendientes.some(
    (np) =>
      np.descripcion.trim().length > 0 &&
      (np.descripcion.trim().length < 5 || (!np.fecha && !np.km)),
  );

  const listoParaRevisar =
    (esMecanica
      ? descripcion.trim().length >= 5
      : kmCargado && aceiteTipo.trim().length >= 2 && proxKm > kmNum) &&
    !pendienteIncompleto;

  // El premio en una mecánica solo si el programa cuenta todos los
  // trabajos — con el alcance clásico, el contador ni se movió.
  const premioAplicable =
    !esMecanica || datos.premioDisponible?.alcance === "todos"
      ? datos.premioDisponible
      : null;

  // ---------- Momento 2 ----------
  if (paso === "preview") {
    return (
      <div className="pb-4">
        <h1 className="font-brand text-h3 font-bold text-ink">
          {esMecanica ? "Revisá el trabajo" : "Revisá el service"}
        </h1>
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
            {esMecanica ? (
              <CartonPapelMecanica
                datos={{
                  lubricentroNombre: datos.lubricentroNombre,
                  colorTenant: datos.colorTenant,
                  colorPapel: datos.colorPapel,
                  fecha,
                  kilometros: kmCargado ? kmNum : null,
                  descripcion: descripcion.trim(),
                  renglones: libres.map((l) => l.trim()).filter(Boolean),
                }}
              />
            ) : (
              <CartonPapel datos={datosPreview} />
            )}
          </div>

          <div className="flex w-full flex-col sm:mx-auto sm:max-w-sm md:mx-0 md:sticky md:top-4 md:max-w-none">
        {/* Lo que se está por registrar además del cartón */}
        {premioAplicable && canjear && (
          <div className="mb-4 rounded-md border border-reward bg-reward-soft px-4 py-3.5">
            <p className="font-brand text-ui font-bold text-ink">
              Se aplica el premio
            </p>
            <p className="mt-0.5 text-ui text-ink-60">
              {premioAplicable.descripcion}. Al confirmar queda
              registrado el canje y el contador del cliente vuelve a cero.
            </p>
          </div>
        )}

        {(Object.values(resolver).filter(Boolean).length > 0 ||
          nuevosPendientes.some((np) => np.descripcion.trim().length >= 5)) && (
          <div className="mb-4 rounded-md border border-line bg-surface px-4 py-3.5">
            <p className="font-brand text-ui font-bold text-ink">
              Pendientes de este auto
            </p>
            <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
              {[
                (() => {
                  const r = Object.values(resolver).filter(Boolean).length;
                  return r > 0 ? `${r} se ${r === 1 ? "marca" : "marcan"} como resuelto${r === 1 ? "" : "s"}` : null;
                })(),
                (() => {
                  const n = nuevosPendientes.filter((np) => np.descripcion.trim().length >= 5).length;
                  return n > 0 ? `${n} nuevo${n === 1 ? "" : "s"} para seguir` : null;
                })(),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}

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
                : esMecanica
                  ? "Confirmar trabajo"
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
      {/* 1. Cabecera sticky, compartida con la simulación de la landing.
          El select de sucursal es del panel y va como hijo. */}
      <CabeceraCarton
        patente={datos.patente}
        vehiculoNombre={datos.vehiculoNombre}
        clienteNombre={datos.clienteNombre}
      >
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
      </CabeceraCarton>

      {/* EL TIPO DE TRABAJO, lo primero: es la bifurcación del cartón
          entero. Solo aparece si el plan trae mecánica, y nunca al editar
          (el tipo de un trabajo guardado no se reescribe). */}
      {datos.puedeMecanica && !edicion && (
        <fieldset className="mb-4">
          <legend className="sr-only">Tipo de trabajo</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["service", "Service"],
                ["mecanica", "Mecánica"],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTipo(valor)}
                aria-pressed={tipo === valor}
                className={`flex h-12 items-center justify-center rounded-md border font-brand text-body font-bold transition-colors ${
                  tipo === valor
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {edicion?.tipo === "mecanica" && (
        <p className="mb-4 rounded-md border border-line bg-surface px-3.5 py-2.5 text-ui text-ink-60">
          Trabajo de mecánica — el tipo no se cambia al editar.
        </p>
      )}

      {/* Caso borde: ya se cargó un service hoy para esta patente */}
      {datos.serviceDeHoy && (
        <p className="mb-4 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Ya hay un service de hoy para esta patente: {datos.serviceDeHoy.hora} en{" "}
          {datos.serviceDeHoy.sucursal}
          {datos.serviceDeHoy.kilometros != null &&
            `, a los ${formatearKm(datos.serviceDeHoy.kilometros)} km`}
          . Si igual corresponde cargar otro, seguí.
        </p>
      )}

      {/* LOS PENDIENTES ABIERTOS DEL AUTO, tildables sin salir del flujo.
          Es lo que evita que la lista crezca hasta morir: el mecánico
          entra a cargar el aceite, ve "pastillas al 30% — anotado en
          junio", y lo tilda si lo hizo. Viaja en la MISMA transacción. */}
      {!edicion &&
        datos.puedePendientes &&
        (datos.pendientesAbiertos?.length ?? 0) > 0 && (
          <fieldset className="mb-4 rounded-lg border border-reward bg-reward-soft/40 p-4">
            <legend className="float-left mb-2 font-brand text-body font-bold text-ink">
              Este auto tiene {datos.pendientesAbiertos!.length === 1 ? "un trabajo pendiente" : "trabajos pendientes"}
            </legend>
            <p className="clear-left mb-2 text-ui text-ink-60">
              ¿Se hizo alguno en esta visita? Tildalo y queda resuelto al
              confirmar.
            </p>
            <div className="flex flex-col gap-1.5">
              {datos.pendientesAbiertos!.map((tp) => (
                <label
                  key={tp.id}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md bg-base px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(resolver[tp.id])}
                    onChange={() =>
                      setResolver((r) => ({ ...r, [tp.id]: !r[tp.id] }))
                    }
                    className="mt-1 size-5 shrink-0 cursor-pointer accent-ink"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-body ${resolver[tp.id] ? "text-ink-40 line-through" : "text-ink"}`}
                    >
                      {tp.descripcion}
                    </span>
                    <span className="block text-label text-ink-60 tabular-nums">
                      anotado el {formatearFechaCorta(tp.creado)}
                      {tp.objetivoFecha ? ` · para el ${formatearFechaCorta(tp.objetivoFecha)}` : ""}
                      {tp.objetivoKm ? ` · a los ${formatearKm(tp.objetivoKm)} km` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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

          <CampoKilometros
            km={km}
            alCambiar={setKm}
            ultimoService={datos.ultimoService}
          />
        </div>

        {/* 4-M. El trabajo de mecánica: descripción + renglones libres.
            La MISMA velocidad que un service: un textarea y renglones a
            botón, con el catálogo sugiriendo. SIN IMPORTES, ni acá ni en
            ningún campo: la plata vive en presupuestos (bloque 4). */}
        {esMecanica && (
          <div className="rounded-lg border border-line bg-surface/60 p-4">
            <label htmlFor="trabajo" className={CLASE_LABEL}>
              Qué trabajo se hizo
            </label>
            <textarea
              id="trabajo"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Cambio de pastillas de freno delanteras"
              className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink placeholder:text-ink-40"
            />

            <div className="mt-3">
              <span className={CLASE_LABEL}>Repuestos y tareas</span>
              {libres.length > 0 && (
                <div className="flex flex-col gap-2">
                  {libres.map((valor, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <Combobox
                          value={valor}
                          onChange={(v) =>
                            setLibres((prev) =>
                              prev.map((x, j) => (j === i ? v : x)),
                            )
                          }
                          opciones={nombresProductos}
                          ariaLabel={`Repuesto o tarea ${i + 1}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setLibres((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={`Quitar el renglón ${i + 1}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-60 hover:bg-surface"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setLibres((prev) => [...prev, ""])}
                className="mt-1.5 min-h-11 text-ui font-semibold text-brand"
              >
                + Repuesto o tarea
              </button>
            </div>
          </div>
        )}

        {!esMecanica && (
          <>
        {/* 4. Aceite de motor — bloque destacado, siempre en blanco */}
        <div className="rounded-lg border border-line bg-surface/60 p-4">
          <p className="mb-3 font-brand text-body font-bold text-ink">
            Aceite de motor
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:flex-1">
              <SelectorViscosidad valor={aceiteTipo} alCambiar={setAceiteTipo} />
            </div>
            <div className="sm:flex-[1.4]">
              <SelectorProductoAceite
                valor={aceiteProductoId}
                alCambiar={setAceiteProductoId}
                aceites={aceitesDelCatalogo}
                alPedirAlta={() => setAltaProducto(true)}
              />
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
                  className={`${CLASE_CAMPO} sm:flex-1`}
                />
                <input
                  value={marcaProducto}
                  onChange={(e) => setMarcaProducto(e.target.value)}
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

        {/* 5. Los 11 renglones, agrupados como el papel.
            Los cuatro grupos son listas independientes: en desktop van en dos
            columnas y el cartón entra casi entero en una pantalla. El orden
            de lectura no se rompe — se leen igual de arriba a abajo y de
            izquierda a derecha, en el orden del papel.
            items-start evita que un grupo con un detalle abierto estire al
            de al lado. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {GRUPOS.map((grupo) => (
          // SIN overflow-hidden: recortaba el panel del combobox de detalle,
          // que se despliega por debajo del borde de la tarjeta. El redondeo
          // del encabezado se resuelve en su propia clase.
          <div key={grupo} className="rounded-lg border border-line">
            <p className="rounded-t-[11px] border-b border-line bg-surface px-3.5 py-2 text-label font-semibold tracking-[0.12em] text-ink-60 uppercase">
              {grupo}
            </p>
            {RENGLONES.filter((r) => r.grupo === grupo).map((r) => {
              const encendido = r.tipo in marcados;
              return (
                <div key={r.tipo} className="border-b border-line last:border-b-0">
                  <RenglonInterruptor
                    etiqueta={r.corto}
                    encendido={encendido}
                    alAlternar={() => alternarRenglon(r.tipo)}
                  />

                  {encendido && (
                    <div className="flex flex-col gap-1 px-3.5 pb-3">
                      {/* Prendido = revisado y OK. El segundo toggle dice
                          que además se cambió — dos estados del papel:
                          tilde de cambio u "OK" de revisión. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(cambiados[r.tipo])}
                        onClick={() => alternarCambiado(r.tipo)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                      >
                        <span
                          className={`text-ui ${
                            cambiados[r.tipo]
                              ? "font-semibold text-ink"
                              : "text-ink-60"
                          }`}
                        >
                          {cambiados[r.tipo] ? "Se cambió" : "Revisado, OK — ¿se cambió?"}
                        </span>
                        <span
                          className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                            cambiados[r.tipo] ? "bg-ink" : "bg-line"
                          }`}
                        >
                          <span
                            className={`size-4 rounded-full bg-base shadow-sm transition-transform ${
                              cambiados[r.tipo] ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </button>

                      {abiertos[r.tipo] || marcados[r.tipo] ? (
                        <Combobox
                          value={marcados[r.tipo]}
                          onChange={(v) =>
                            setMarcados((p) => ({ ...p, [r.tipo]: v }))
                          }
                          opciones={nombresProductos}
                          ariaLabel={`Detalle de ${r.corto}`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setAbiertos((p) => ({ ...p, [r.tipo]: true }))
                          }
                          className="min-h-11 self-start text-ui font-semibold text-brand"
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

          </>
        )}

        {/* 5-bis. El premio, como un renglón más del cartón. Va acá y no
            en el post-guardado: si el canje se marcara después de
            confirmar, un mecánico distraído dejaba al cliente con el
            descuento aplicado y el canje sin registrar — el contador no se
            reseteaba y en el service siguiente le volvía a corresponder.
            Acá el canje es parte de la confirmación y no se puede perder. */}
        {premioAplicable && !edicion && (
          <div className="overflow-hidden rounded-lg border border-reward bg-reward-soft">
            <button
              type="button"
              role="switch"
              aria-checked={canjear}
              onClick={() => setCanjear((v) => !v)}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
            >
              <span className="min-w-0">
                <span className="block font-brand text-body font-bold text-ink">
                  Aplicar premio
                </span>
                <span className="block text-ui text-ink-60">
                  {premioAplicable.descripcion}
                </span>
              </span>
              <span
                className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  canjear ? "bg-reward" : "bg-line"
                }`}
              >
                <span
                  className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
                    canjear ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
            {canjear && (
              <p className="border-t border-reward/40 px-4 py-2.5 text-ui text-ink-60">
                Se registra al confirmar el service. El descuento lo aplicás
                vos en la caja.
              </p>
            )}
          </div>
        )}

        {/* 6 y 7. Próximo service y observaciones, también en pares desde
            desktop: son el cierre del cartón y ninguno necesita todo el ancho. */}
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        {!esMecanica && (
        <div>
          <span className={CLASE_LABEL}>Próximo service</span>
          <div className="flex flex-wrap gap-2">
            {/* El botón "legado" solo aparece editando un service viejo que
                se cargó con un número a mano: conserva ese valor sin
                obligar a recalcularlo con los saltos de hoy. */}
            {([...SALTOS, ...(proxLegado ? (["legado"] as const) : [])]).map(
              (modo) => (
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
                  {modo === "legado"
                    ? `${formatearKm(proxLegado)} km`
                    : `+${formatearKm(Number(modo) * 1000)} km`}
                </button>
              ),
            )}
          </div>
          {proxKm > 0 && (
            <p className="mt-1.5 text-label text-ink-60 tabular-nums">
              Próximo service: {formatearKm(proxKm)} km
            </p>
          )}
        </div>
        )}

        {/* 7. Observaciones — colapsado, el margen del cartón */}
        {mostrarObs ? (
          <div>
            <label htmlFor="obs" className={CLASE_LABEL}>
              Observaciones del service
            </label>
            <textarea
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
            />
            <p className="mt-1.5 text-label text-ink-60">
              Sobre ESTA visita. Para avisos sobre el auto (cubiertas,
              frenos…) usá las notas del vehículo, en la ficha del cliente.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMostrarObs(true)}
            className="min-h-11 self-start justify-self-start text-ui font-semibold text-ink-60"
          >
            + Observaciones del service
          </button>
        )}
        </div>
      </div>

      {/* 9. ¿QUEDÓ ALGO PENDIENTE? — opcional y colapsado: no le agrega
          NI UNA interacción obligatoria al flujo (el cronómetro manda).
          Vale para los dos tipos de trabajo. Sin importes, como todo. */}
      {!edicion && datos.puedePendientes && (
        <div className="mt-4">
          {!mostrarPendientes ? (
            <button
              type="button"
              onClick={() => {
                setMostrarPendientes(true);
                setNuevosPendientes((prev) =>
                  prev.length ? prev : [{ descripcion: "", fecha: "", km: "", visible: false }],
                );
              }}
              className="min-h-11 text-ui font-semibold text-ink-60"
            >
              + ¿Quedó algo pendiente?
            </button>
          ) : (
            <div className="rounded-lg border border-line bg-surface/60 p-4">
              <p className="mb-1 font-brand text-body font-bold text-ink">
                Quedó pendiente
              </p>
              <p className="mb-3 text-label text-ink-60">
                Lo que viste y no se hizo hoy. Con fecha o kilómetros: es lo
                que dispara el aviso para llamarlo.
              </p>
              <div className="flex flex-col gap-3">
                {nuevosPendientes.map((np, i) => (
                  <div key={i} className="rounded-md border border-line bg-base p-3">
                    <div className="flex gap-2">
                      <input
                        value={np.descripcion}
                        onChange={(e) =>
                          setNuevosPendientes((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)),
                          )
                        }
                        placeholder="Pastillas de freno al 30%"
                        aria-label={`Pendiente ${i + 1}: qué quedó por hacer`}
                        className={`${CLASE_CAMPO} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNuevosPendientes((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={`Quitar el pendiente ${i + 1}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-60 hover:bg-surface"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={np.fecha}
                        onChange={(e) =>
                          setNuevosPendientes((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)),
                          )
                        }
                        aria-label={`Pendiente ${i + 1}: fecha objetivo`}
                        className={`${CLASE_CAMPO} tabular-nums`}
                      />
                      <input
                        inputMode="numeric"
                        value={np.km}
                        onChange={(e) =>
                          setNuevosPendientes((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)),
                          )
                        }
                        placeholder="o a los… km"
                        aria-label={`Pendiente ${i + 1}: kilómetros objetivo`}
                        className={`${CLASE_CAMPO} tabular-nums`}
                      />
                    </div>
                    <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={np.visible}
                        onChange={() =>
                          setNuevosPendientes((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)),
                          )
                        }
                        className="size-4 shrink-0 cursor-pointer accent-ink"
                      />
                      <span className="text-ui text-ink-60">
                        Lo ve el cliente cuando escanea su calco
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setNuevosPendientes((prev) => [
                    ...prev,
                    { descripcion: "", fecha: "", km: "", visible: false },
                  ])
                }
                className="mt-2 min-h-11 text-ui font-semibold text-brand"
              >
                + Otro pendiente
              </button>
              {pendienteIncompleto && (
                <p className="mt-1.5 text-ui text-urgente">
                  A cada pendiente ponele qué es (5 letras mínimo) y una fecha
                  o kilómetros.
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
            {esMecanica
              ? "Falta contar qué trabajo se hizo."
              : "Faltan los kilómetros y la viscosidad del aceite."}
          </p>
        )}
      </div>
      {/* Aire para que el último renglón pueda subir por encima de la banda */}
      <div className="h-4" />
    </div>
  );
}
