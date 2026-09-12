"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { Combobox } from "@/components/ui/combobox";
import {
  CartonPapel,
  CartonPapelMecanica,
  CartonPapelNeumaticos,
} from "@/components/services/carton-papel";
import {
  RENGLONES,
  GRUPOS,
  esViscosidadValida,
  normalizarViscosidad,
  formatearKm,
  VISCOSIDAD_FORMATO,
  SALTOS_FIJOS,
  SALTO_POR_DEFECTO,
  SALTO_RANGO,
  esSaltoValido,
  type ItemTipo,
} from "@/lib/renglones";
import {
  CLASE_CAMPO,
  CLASE_LABEL,
  CabeceraCarton,
  CampoKilometros,
  SelectorViscosidad,
  SelectorProductoBuscable,
  RenglonInterruptor,
} from "@/components/services/campos-carton";
import {
  RuedasCarton,
  ruedasVacias,
  ruedaCuenta,
  type RuedasPorPosicion,
} from "@/components/services/ruedas-carton";
import {
  ETIQUETA_TIPO,
  NOMBRE_TRABAJO,
  TIPOS_TRABAJO,
  type TipoTrabajo,
} from "@/lib/trabajos";
import { POSICIONES, type PosicionRueda } from "@/lib/ruedas";
import { recordarSucursal, recordarTipoTrabajo } from "@/lib/preferencias";
import { formatearFecha as formatearFechaCorta } from "@/lib/fechas";
import {
  guardarService,
  crearProductoRapido,
  type ItemCargado,
} from "@/app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/actions";
import { actualizarService } from "@/app/panel/(tras-onboarding)/services/[serviceId]/editar/actions";

type Producto = {
  id: string;
  nombre: string;
  /** La marca cruda, para copiarla como snapshot en una rueda. */
  marca?: string | null;
  categoria: string;
  precioVenta?: number | null;
  stock?: number | null;
  unidad?: string;
  litrosSugeridos?: number | null;
};
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
  /** El módulo de gomería está pago y prendido para este tenant. */
  puedeNeumaticos?: boolean;
  /** El último tipo que cargó ESTE dispositivo. Lo resuelve el servidor
   *  desde la cookie para que la solapa correcta llegue ya pintada: una
   *  gomería carga cubiertas todo el día y abrir siempre en Service es un
   *  toque equivocado por cada trabajo de la jornada. */
  tipoInicial?: TipoTrabajo;
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
export type RuedaEnEdicion = {
  posicion: PosicionRueda;
  posicionAnterior: PosicionRueda | null;
  colocada: boolean;
  rotada: boolean;
  balanceada: boolean;
  reparada: boolean;
  productoId: string | null;
  marca: string | null;
  medida: string | null;
  indiceCargaVel: string | null;
  dot: string | null;
  profundidadMm: number | null;
  presionPsi: number | null;
};

export type ServiceEnEdicion = {
  serviceId: string;
  /** El tipo NO se edita: un service no se convierte en mecánica. */
  tipo: TipoTrabajo;
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
  aceiteLitros?: number | null;
  // tipo → cantidad guardada (ausente = 1)
  cantidades?: Record<string, string>;
  /** ¿Alguno de los productos de este trabajo lleva stock? Lo resuelve el
   *  servidor, que tiene los producto_id: acá el renglón es texto. */
  usaProductosConStock?: boolean;
  /** Gomería: la alineación del vehículo y las ruedas ya cargadas. */
  alineacion?: boolean;
  ruedas?: RuedaEnEdicion[];
};

// CLASE_CAMPO y CLASE_LABEL viven en campos-carton.tsx, junto con los
// campos extraídos que también usa la simulación de la landing.

// Los saltos viven en lib/renglones: tres atajos fijos y "Otro", que pide
// el salto en km (cada cuántos), nunca el kilometraje final.
type ProxModo = (typeof SALTOS_FIJOS)[number] | "otro";

// El stock del aceite baja según la UNIDAD del producto — la regla vive en
// guardar_service y acá solo se refleja. A granel (litro) descuenta los
// litros del service; envasado (unidad) descuenta un bidón por service y
// los litros no existen: un "EDGE 5W30 X4L" con 16 en el estante no puede
// perder 4 porque el mecánico anotó 4 litros.
function descuentaPorLitros(p: { stock?: number | null; unidad?: string }) {
  return p.stock != null && p.unidad === "litro";
}

// El próximo service guardado pudo salir de un atajo o de "Otro": al
// reabrir se vuelve al atajo si la cuenta coincide y, si no, "Otro" queda
// elegido con el salto guardado, para que editar otra cosa del cartón no
// lo pise. Cubre también los services viejos cargados con un número a mano.
function proxInicial(edicion: ServiceEnEdicion | undefined): {
  modo: ProxModo;
  otro: string;
} {
  if (!edicion || edicion.kilometros == null || !edicion.proxServiceKm)
    return { modo: SALTO_POR_DEFECTO, otro: "" };
  const salto = edicion.proxServiceKm - edicion.kilometros;
  const fijo = SALTOS_FIJOS.find((s) => s === salto);
  return fijo ? { modo: fijo, otro: "" } : { modo: "otro", otro: String(salto) };
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
  // En edición queda fijo. En una carga nueva arranca en el último tipo
  // que usó este dispositivo (cookie), con Service como valor inicial.
  const [tipo, setTipo] = useState<TipoTrabajo>(
    edicion?.tipo ?? datos.tipoInicial ?? "service",
  );
  const esMecanica = tipo === "mecanica";
  const esNeumaticos = tipo === "neumaticos";
  // El cartón de aceite es el de `service` y nada más. Se pregunta por el
  // tipo en positivo a propósito: "si no es mecánica, entonces es service"
  // era exactamente la rama implícita que un tercer tipo rompe.
  const esService = tipo === "service";

  function elegirTipo(nuevo: TipoTrabajo) {
    setTipo(nuevo);
    recordarTipoTrabajo(nuevo);
  }
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
  // Los litros del service: los precarga litros_sugeridos del producto al
  // elegirlo. Sin dato, el stock del aceite NO se mueve — el stock es
  // opcional; la velocidad no.
  const [litros, setLitros] = useState(
    edicion?.aceiteLitros != null ? String(edicion.aceiteLitros) : "",
  );
  // tipo de renglón → cantidad ("2 filtros"). Ausente = 1: el caso normal
  // no pide ni un toque más.
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    edicion?.cantidades ?? {},
  );
  const [cantidadesLibres, setCantidadesLibres] = useState<Record<number, string>>({});
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
  const [proxModo, setProxModo] = useState<ProxModo>(
    () => proxInicial(edicion).modo,
  );
  // El salto escrito en "Otro", como texto (igual que los kilómetros).
  const [otroSalto, setOtroSalto] = useState(() => proxInicial(edicion).otro);
  // El campo toma el foco solo cuando se acaba de tocar "Otro", no al
  // abrir un service que ya se guardó con un salto propio.
  const [otroRecienElegido, setOtroRecienElegido] = useState(false);
  // Gomería: la alineación es del vehículo entero, y las ruedas van por
  // posición. En edición llegan cargadas desde la base.
  const [alineacion, setAlineacion] = useState(
    Boolean(edicion?.alineacion),
  );
  const [ruedas, setRuedas] = useState<RuedasPorPosicion>(() => {
    const base = ruedasVacias();
    for (const r of edicion?.ruedas ?? []) {
      base[r.posicion] = {
        colocada: r.colocada,
        rotada: r.rotada,
        balanceada: r.balanceada,
        reparada: r.reparada,
        posicionAnterior: r.posicionAnterior ?? "",
        productoId: r.productoId ?? "",
        marca: r.marca ?? "",
        medida: r.medida ?? "",
        indiceCargaVel: r.indiceCargaVel ?? "",
        dot: r.dot ?? "",
        profundidad: r.profundidadMm != null ? String(r.profundidadMm) : "",
        presion: r.presionPsi != null ? String(r.presionPsi) : "",
      };
    }
    return base;
  });

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

  // "Otro" cuenta solo con un salto dentro del rango. Fuera de él el
  // próximo queda en 0: se apagan el botón de revisar y el renglón de
  // abajo, y el aviso bajo el campo dice qué corregir.
  const otroNum = Number(otroSalto.replace(/\D/g, ""));
  const otroCargado = otroSalto.trim() !== "";
  const otroFueraDeRango = otroCargado && !esSaltoValido(otroNum);
  const salto =
    proxModo === "otro"
      ? otroCargado && !otroFueraDeRango
        ? otroNum
        : 0
      : proxModo;
  const proxKm = kmCargado && salto > 0 ? kmNum + salto : 0;

  const aceitesDelCatalogo = productos.filter((p) => p.categoria === "aceite");
  // La categoría `neumatico` ya existía en el catálogo, con orden 6: lo
  // que faltaba era el trabajo que las consume.
  const cubiertasDelCatalogo = productos.filter(
    (p) => p.categoria === "neumatico",
  );
  const aceiteElegido =
    productos.find((p) => p.id === aceiteProductoId) ?? null;

  // Elegir el producto precarga los litros EN EL EVENTO (nunca en un
  // efecto): sugeridos si lleva stock en litros, vacío si no.
  function elegirAceite(
    p: { id: string; stock?: number | null; unidad?: string; litrosSugeridos?: number | null } | null,
  ) {
    setAceiteProductoId(p?.id ?? "");
    if (p && descuentaPorLitros(p)) {
      setLitros(p.litrosSugeridos != null ? String(p.litrosSugeridos) : "");
    } else {
      setLitros("");
    }
  }
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
    // Las ruedas que valen: se les hizo algo, o se las midió. Es el mismo
    // criterio que el CHECK rueda_con_sustancia — acá para no mandar
    // cinco filas vacías, y allá como garantía.
    const ruedasCargadas = POSICIONES.filter((pos) =>
      ruedaCuenta(ruedas[pos]),
    ).map((pos) => {
      const r = ruedas[pos];
      return {
        posicion: pos,
        posicion_anterior: r.rotada ? r.posicionAnterior || null : null,
        colocada: r.colocada,
        rotada: r.rotada,
        balanceada: r.balanceada,
        reparada: r.reparada,
        // El producto solo viaja si la cubierta se COLOCÓ: una rueda
        // medida que referencia un producto del catálogo no descuenta
        // stock, y mandarlo igual sería pedirle a la base que lo ignore.
        producto_id: r.colocada ? r.productoId || null : null,
        marca: r.marca.trim() || null,
        medida: r.medida.trim().toUpperCase() || null,
        indice_carga_vel: r.indiceCargaVel.trim().toUpperCase() || null,
        dot: r.dot.trim() || null,
        profundidad_mm: r.profundidad.trim()
          ? r.profundidad.trim().replace(",", ".")
          : null,
        presion_psi: r.presion.trim() ? r.presion.replace(/\D/g, "") : null,
      };
    });

    const items: ItemCargado[] = esMecanica
      ? libres
          .map((texto, i) => ({ texto: texto.trim(), i }))
          .filter(({ texto }) => Boolean(texto))
          .map(({ texto, i }) => ({
            producto_id: productos.find((p) => p.nombre === texto)?.id ?? null,
            detalle: texto,
            cambiado: true,
            cantidad: Number(cantidadesLibres[i]?.replace(",", ".")) || 1,
          }))
      : Object.entries(marcados).map(([tipo, detalle]) => {
          const limpio = detalle.trim();
          const producto = productos.find((p) => p.nombre === limpio);
          return {
            tipo,
            producto_id: producto?.id ?? null,
            detalle: producto ? null : limpio || null,
            cambiado: Boolean(cambiados[tipo]),
            cantidad: Number(cantidades[tipo]?.replace(",", ".")) || 1,
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
      aceiteTipo: esService ? normalizarViscosidad(aceiteTipo) : "",
      aceiteProductoId: esService ? aceiteProductoId || null : null,
      aceiteNombre: esService ? nombreAceite : null,
      aceiteLitros:
        esService &&
        aceiteElegido != null &&
        descuentaPorLitros(aceiteElegido) &&
        litros.trim() !== ""
          ? Number(litros.replace(",", ".")) || null
          : null,
      proxServiceKm: esService ? proxKm : 0,
      // Gomería. `alineacion` viaja en null para los otros dos tipos: la
      // columna es del trabajo de cubiertas y el CHECK espejo lo exige.
      alineacion: esNeumaticos ? alineacion : null,
      ruedas: esNeumaticos ? ruedasCargadas : [],
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
        {
          detalle: detalle.trim() || null,
          cambiado: Boolean(cambiados[tipo]),
          // La previsualización dice "así lo va a ver el cliente": si el
          // papel del cliente muestra el ×2, acá también.
          cantidad: Number(cantidades[tipo]?.replace(",", ".")) || 1,
        },
      ]),
    ),
  };

  // ¿Este trabajo toca algún producto que lleva stock? Solo con eso el
  // aviso de edición tiene sentido: `stock` en null significa "no llevo
  // stock de esto" y ahí no hay nada que se pueda desajustar.
  // Lo resuelve el servidor con los producto_id reales (ver la página de
  // edición). Acá se suma el aceite, que sí se elige por id en vivo y
  // puede cambiar sin recargar.
  const hayProductosConStock =
    Boolean(edicion?.usaProductosConStock) ||
    datos.productos.some((p) => p.id === aceiteProductoId && p.stock != null);

  // Un pendiente escrito sin objetivo no puede pasar: el compromiso ES el
  // vencimiento. (Las filas totalmente vacías se ignoran solas.)
  const pendienteIncompleto = nuevosPendientes.some(
    (np) =>
      np.descripcion.trim().length > 0 &&
      (np.descripcion.trim().length < 5 || (!np.fecha && !np.km)),
  );

  // Gomería: kilómetros cargados y al menos una rueda o la alineación.
  // Y ninguna rueda a medio cargar — una rotada sin decir de dónde venía
  // la rechaza la base, así que se atrapa acá antes de perder lo tipeado.
  const hayTrabajoDeRuedas = POSICIONES.some((pos) => ruedaCuenta(ruedas[pos]));
  const rotadaSinOrigen = POSICIONES.some(
    (pos) => ruedas[pos].rotada && !ruedas[pos].posicionAnterior,
  );
  const listoNeumaticos =
    kmCargado && (hayTrabajoDeRuedas || alineacion) && !rotadaSinOrigen;

  const listoPorTipo: Record<TipoTrabajo, boolean> = {
    service: kmCargado && aceiteTipo.trim().length >= 2 && proxKm > kmNum,
    mecanica: descripcion.trim().length >= 5,
    neumaticos: listoNeumaticos,
  };

  const listoParaRevisar = listoPorTipo[tipo] && !pendienteIncompleto;

  // El premio en una mecánica solo si el programa cuenta todos los
  // trabajos — con el alcance clásico, el contador ni se movió.
  const premioAplicable =
    esService || datos.premioDisponible?.alcance === "todos"
      ? datos.premioDisponible
      : null;

  // Qué falta para poder revisar, dicho por tipo. Un mapa y no una
  // cadena de ternarios: con tres tipos, el "si no es mecánica es
  // service" implícito le mostraba al gomero un cartel sobre el aceite.
  const faltaPorTipo: Record<TipoTrabajo, string> = {
    service:
      kmCargado && aceiteTipo.trim().length >= 2 && proxKm === 0
        ? "Falta indicar cada cuántos km es el próximo service."
        : "Faltan los kilómetros y la viscosidad del aceite.",
    mecanica: "Falta contar qué trabajo se hizo.",
    neumaticos: rotadaSinOrigen
      ? "Marcá de qué posición venía cada cubierta rotada."
      : !kmCargado
        ? "Faltan los kilómetros del odómetro."
        : "Marcá al menos una rueda o la alineación.",
  };
  const queFalta = pendienteIncompleto
    ? "A cada pendiente ponele qué es (5 letras mínimo) y una fecha o kilómetros."
    : faltaPorTipo[tipo];

  // Los segmentos del control, en el orden del catálogo. El service no
  // se gatea nunca: es el trabajo base y ningún plan lo apaga.
  const tiposDisponibles = TIPOS_TRABAJO.filter(
    (t) =>
      t === "service" ||
      (t === "mecanica" && datos.puedeMecanica) ||
      (t === "neumaticos" && datos.puedeNeumaticos),
  );

  // ---------- Momento 2 ----------
  if (paso === "preview") {
    return (
      <div className="pb-4">
        <h1 className="font-brand text-h3 font-bold text-ink">
          Revisá el {NOMBRE_TRABAJO[tipo]}
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
            ) : esNeumaticos ? (
              <CartonPapelNeumaticos
                datos={{
                  lubricentroNombre: datos.lubricentroNombre,
                  colorTenant: datos.colorTenant,
                  colorPapel: datos.colorPapel,
                  fecha,
                  kilometros: kmCargado ? kmNum : null,
                  alineacion,
                  ruedas: POSICIONES.filter((pos) =>
                    ruedaCuenta(ruedas[pos]),
                  ).map((pos) => {
                    const r = ruedas[pos];
                    return {
                      posicion: pos,
                      posicionAnterior: r.rotada
                        ? (r.posicionAnterior || null)
                        : null,
                      colocada: r.colocada,
                      rotada: r.rotada,
                      balanceada: r.balanceada,
                      reparada: r.reparada,
                      marca: r.marca.trim() || null,
                      medida: r.medida.trim().toUpperCase() || null,
                      indiceCargaVel:
                        r.indiceCargaVel.trim().toUpperCase() || null,
                      dot: r.dot.trim() || null,
                      profundidadMm: r.profundidad.trim()
                        ? Number(r.profundidad.replace(",", "."))
                        : null,
                      presionPsi: r.presion.trim()
                        ? Number(r.presion.replace(/\D/g, ""))
                        : null,
                    };
                  }),
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

        {/* LA SUCURSAL, OTRA VEZ Y ANTES DE GUARDAR. Es el último punto
            donde el error se puede atrapar gratis: después queda escrito
            en la métrica del local equivocado. Va primero en la columna,
            arriba del aviso de las 24 horas. */}
        <div className="mb-4 rounded-md border border-line bg-surface px-4 py-3.5">
          <p className="font-brand text-ui font-bold text-ink">
            Se guarda en {datos.sucursales.find((s) => s.id === sucursalId)?.nombre}
          </p>
          {datos.sucursales.length > 1 && (
            <button
              type="button"
              onClick={() => setPaso("carton")}
              className="mt-0.5 text-ui text-ink-60 underline underline-offset-4 hover:text-ink"
            >
              Cambiar de sucursal
            </button>
          )}
        </div>

        <div className="rounded-md border border-line bg-surface px-4 py-3.5">
          <p className="font-brand text-ui font-bold text-ink">
            Editable por 24 horas
          </p>
          <p className="mt-0.5 text-ui text-ink-60">
            Este trabajo podrá editarse solo durante las 24 horas posteriores.
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
                : `Confirmar ${NOMBRE_TRABAJO[tipo]}`}
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
        {/* LA SUCURSAL, CON PESO. Con una cuenta compartida entre dos
            locales, el celular de Boulevares puede estar apuntando a Casa
            Central y el trabajo queda etiquetado en el local equivocado —
            y eso ensucia la métrica por sucursal para siempre, porque
            nadie lo nota.
            
            No se resuelve moviendo la sucursal a la base: un dato en base
            con cuenta compartida sincroniza TODOS los dispositivos al
            último que la cambió, que es peor. Se resuelve haciendo que sea
            imposible equivocarse en silencio: se ve en tinta plena y en
            negrita —no como control gris de chrome—, se cambia en un
            toque, y vuelve a aparecer en la previsualización.
            
            Con una sola sucursal no hay selector: no hay nada que elegir
            ni, por lo tanto, nada que errar. */}
        {datos.sucursales.length > 1 ? (
          <select
            value={sucursalId}
            onChange={(e) => {
              setSucursalId(e.target.value);
              // Queda recordada en este dispositivo para el próximo service.
              recordarSucursal(e.target.value);
            }}
            aria-label="Sucursal donde se hace el trabajo"
            className="h-11 max-w-[48%] rounded-md border border-ink bg-base px-2 font-brand text-ui font-bold text-ink"
          >
            {datos.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="max-w-[48%] truncate text-ui font-semibold text-ink-60">
            {datos.sucursales[0]?.nombre}
          </span>
        )}
      </CabeceraCarton>

      {/* EL TIPO DE TRABAJO, lo primero: es la bifurcación del cartón
          entero. Cada segmento aparece con su feature, y nunca al editar
          (el tipo de un trabajo guardado no se reescribe).

          SIN MÓDULO NO HAY NADA QUE MOSTRAR: el que no tiene gomería ve
          el control de dos mitades de siempre, sin candado, sin cartel y
          sin upsell. El panel es la herramienta de trabajo, no la
          vidriera — la venta del módulo pasa por otro lado. */}
      {tiposDisponibles.length > 1 && !edicion && (
        <fieldset className="mb-4">
          <legend className="sr-only">Tipo de trabajo</legend>
          <div
            className={`grid gap-2 ${
              tiposDisponibles.length === 3 ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            {tiposDisponibles.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => elegirTipo(valor)}
                aria-pressed={tipo === valor}
                className={`flex h-12 items-center justify-center rounded-md border px-1 font-brand text-body font-bold transition-colors ${
                  tipo === valor
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                {ETIQUETA_TIPO[valor]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {edicion && edicion.tipo !== "service" && (
        <p className="mb-4 rounded-md border border-line bg-surface px-3.5 py-2.5 text-ui text-ink-60">
          {edicion.tipo === "mecanica"
            ? "Trabajo de mecánica"
            : "Trabajo de gomería"}{" "}
          — el tipo no se cambia al editar.
        </p>
      )}

      {/* EL STOCK NO SE AJUSTA AL EDITAR, y eso es la decisión correcta:
          el descuento pasa una sola vez, al crear, y volver a tocarlo al
          editar llevaría a descontar dos veces o a inventar
          compensaciones. Lo que estaba mal era el SILENCIO: el que corrige
          el aceite de un service deja el stock mal en dos productos —el
          que sacó y el que puso— y no se entera nunca.
          
          Solo aparece si este trabajo usa productos que de verdad llevan
          stock: con stock en null no hay nada que ajustar y el aviso
          sería ruido. */}
      {edicion && hayProductosConStock && (
        <p className="mb-4 rounded-md border border-line bg-urgente-soft px-3.5 py-2.5 text-ui text-overdue">
          El stock no se ajusta al editar. Si cambiás un producto por otro,
          corregí las dos cantidades en{" "}
          <Link
            href="/panel/productos"
            className="font-semibold underline underline-offset-4"
          >
            Productos
          </Link>
          .
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
                      <input
                        value={cantidadesLibres[i] ?? "1"}
                        onChange={(e) =>
                          setCantidadesLibres((prev) => ({
                            ...prev,
                            [i]: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                        aria-label={`Cantidad del repuesto ${i + 1}`}
                        className="h-11 w-13 shrink-0 rounded-md border border-line bg-base text-center text-ui text-ink tabular-nums"
                      />
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

        {/* 4-N. La gomería: la alineación del auto y las ruedas.
            SIN IMPORTES, como todo el modelo operativo. */}
        {esNeumaticos && (
          <>
            {/* LA ALINEACIÓN ES DEL VEHÍCULO, no de una rueda: por eso es
                un interruptor de la cabecera y no una casilla más del
                detalle de cada posición. */}
            <div className="rounded-lg border border-line bg-surface/60">
              <button
                type="button"
                role="switch"
                aria-checked={alineacion}
                onClick={() => setAlineacion((v) => !v)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-brand text-body font-bold text-ink">
                    Alineación
                  </span>
                  <span className="block text-ui text-ink-60">
                    Del auto entero, no de una rueda
                  </span>
                </span>
                <span
                  className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    alineacion ? "bg-ink" : "bg-line"
                  }`}
                >
                  <span
                    className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
                      alineacion ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            </div>

            <RuedasCarton
              ruedas={ruedas}
              alCambiar={(pos, rueda) =>
                setRuedas((prev) => ({ ...prev, [pos]: rueda }))
              }
              productos={cubiertasDelCatalogo.map((p) => ({
                id: p.id,
                nombre: p.nombre,
                marca: p.marca ?? null,
                precioVenta: p.precioVenta ?? null,
                stock: p.stock ?? null,
                unidad: p.unidad ?? "unidad",
                litrosSugeridos: null,
              }))}
            />
          </>
        )}

        {esService && (
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
              <SelectorProductoBuscable
                id="aceite-producto"
                productoId={aceiteProductoId}
                alElegir={(p) => elegirAceite(p)}
                productos={aceitesDelCatalogo.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  precioVenta: p.precioVenta ?? null,
                  stock: p.stock ?? null,
                  unidad: p.unidad ?? "unidad",
                  litrosSugeridos: p.litrosSugeridos ?? null,
                }))}
                alPedirAlta={() => setAltaProducto(true)}
              />
            </div>

            {/* Los litros SOLO existen si el producto lleva stock EN
                LITROS: el que no lo usa no ve el campo molestando, y con
                un aceite envasado no hay nada que tipear — baja un bidón
                por service y lo decide la base. Precargados: en el caso
                normal, cero toques. */}
            {aceiteElegido && descuentaPorLitros(aceiteElegido) && (
              <div className="sm:w-28">
                <label htmlFor="aceite-litros" className={CLASE_LABEL}>
                  Litros
                </label>
                <input
                  id="aceite-litros"
                  inputMode="decimal"
                  value={litros}
                  onChange={(e) => setLitros(e.target.value)}
                  className={`${CLASE_CAMPO} text-center tabular-nums`}
                />
              </div>
            )}
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
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <Combobox
                              value={marcados[r.tipo]}
                              onChange={(v) =>
                                setMarcados((p) => ({ ...p, [r.tipo]: v }))
                              }
                              opciones={nombresProductos}
                              ariaLabel={`Detalle de ${r.corto}`}
                            />
                          </div>
                          {/* "×2 filtros" sin que el caso normal pida un
                              toque: prellenado en 1. */}
                          <input
                            value={cantidades[r.tipo] ?? "1"}
                            onChange={(e) =>
                              setCantidades((prev) => ({
                                ...prev,
                                [r.tipo]: e.target.value,
                              }))
                            }
                            inputMode="decimal"
                            aria-label={`Cantidad de ${r.corto}`}
                            className="h-11 w-13 shrink-0 rounded-md border border-line bg-base text-center text-ui text-ink tabular-nums"
                          />
                        </div>
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
        {esService && (
        <div>
          <span className={CLASE_LABEL}>Próximo service</span>
          <div className="flex flex-wrap gap-2">
            {/* Tres atajos y "Otro". Los atajos son la carga de un toque;
                "Otro" abre un campo que pide el salto (cada cuántos km),
                nunca el kilometraje final: un cero de más se ve al lado. */}
            {([...SALTOS_FIJOS, "otro"] as const).map((modo) => (
              <button
                key={modo}
                type="button"
                onClick={() => {
                  setProxModo(modo);
                  setOtroRecienElegido(modo === "otro");
                }}
                aria-pressed={proxModo === modo}
                className={`flex h-11 items-center rounded-md border px-3.5 text-ui tabular-nums transition-colors ${
                  proxModo === modo
                    ? "border-ink bg-ink font-semibold text-white"
                    : "border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                {modo === "otro" ? "Otro" : `+${formatearKm(modo)} km`}
              </button>
            ))}
          </div>
          {proxModo === "otro" && (
            <div className="mt-2">
              <input
                id="otro-salto"
                inputMode="numeric"
                autoFocus={otroRecienElegido}
                value={otroSalto}
                onChange={(e) => setOtroSalto(e.target.value)}
                placeholder="Cada cuántos km"
                aria-label="Cada cuántos kilómetros hasta el próximo service"
                className={`${CLASE_CAMPO} tabular-nums`}
              />
              {otroFueraDeRango && (
                <p className="mt-2 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
                  {SALTO_RANGO}
                </p>
              )}
            </div>
          )}
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
            {queFalta}
          </p>
        )}
      </div>
      {/* Aire para que el último renglón pueda subir por encima de la banda */}
      <div className="h-4" />
    </div>
  );
}
