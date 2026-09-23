import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { ZONA_AR, fechaCalendarioAR } from "@/lib/fechas";
import { paginar } from "@/lib/exportar/paginar";
import { sumarDias } from "@/lib/fidelli/plan";
import { armarCsv, type Celda } from "@/lib/fidelli/csv";
import type { Moneda } from "@/lib/fidelli/mrr";
import {
  DESDE_DEFAULT,
  MONEDA_DEFAULT,
  mesEnCursoAR,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from "@/lib/fidelli/crecimiento";
import {
  QUERY_FILTRO,
  aplicarFiltro,
  armarListado,
  estadoDe as estadoDelTenant,
  filtroDe,
  type FilaIndicadores,
  type FilaListado,
  type FilaSalud,
  type FiltroListado,
} from "@/lib/fidelli/listado";
import {
  esCanalFiltro,
  esFiltroEstado,
  estadoDe as estadoDelContacto,
  pasaFiltro,
  type CanalFiltro,
  type Contacto,
  type FiltroEstado,
} from "@/lib/fidelli/pauta";
import type { FilaLubricentro } from "@/components/fidelli/tipos";
import type { OrigenDeFila } from "@/components/fidelli/acciones-tenant";

// ============================================================
// EL DATA ROOM: el registro de lo que se puede exportar
// (docs/METRICAS.md § 1 «Data room»; el diccionario es docs/DATA-ROOM.md).
//
// Un recurso es un nombre, una descripción de una línea, los parámetros de
// la URL que entiende, la consulta que trae las filas y las columnas: cada
// columna es su encabezado en español y la función que saca la celda de
// la fila. La ruta (app/api/fidelli/exportar/[recurso]) no sabe nada de
// ninguna tabla: busca el recurso acá, corre `consultar`, aplica las
// columnas y le pasa el resultado a lib/fidelli/csv.ts. Agregar un recurso
// es agregar una entrada en RECURSOS y su sección en docs/DATA-ROOM.md.
//
// Reglas que valen para todos:
//   · Columnas explícitas, nunca `select *` (CLAUDE.md).
//   · En /fidelli el RLS no recorta nada: el filtro por `lubricentro_id`
//     lo pone el recurso cuando el parámetro viene. Sin parámetro, sale la
//     plataforma entera, que es lo que un data room quiere decir.
//   · Las tablas se leen paginadas (lib/exportar/paginar.ts): PostgREST
//     corta en 1000 filas y no avisa; las fotos por tenant pasan ese
//     número en meses. Las RPC de la plataforma (una fila por tenant) no
//     se paginan: mil tenants quedan muy lejos.
//   · Las fechas (`date`) salen como vienen, `YYYY-MM-DD`; los instantes
//     (`timestamptz`) salen en ISO 8601 con la hora y el desfase de
//     Argentina (`2026-09-22T22:01:07-03:00`), y donde el día importa va
//     además una columna con el día calendario argentino. Es la misma
//     regla de las dos familias de lib/fechas.ts.
//   · Los montos son números pelados: la coma decimal la pone csv.ts.
//   · Los encabezados son IDENTIFICADORES en español en snake_case
//     (`alta_at`, `trabajos_30d`, `mrr_ars`), no rótulos («Trabajos (30
//     d)»): el data room lo abren pandas, Power Query o SQL además de
//     Excel, donde `df.trabajos_30d` funciona y un rótulo con espacios y
//     paréntesis estorba; y son los mismos nombres de las columnas de
//     docs/METRICAS.md § 1 y de la base, así el diccionario es una sola
//     búsqueda. Los rótulos viven en la pantalla. Vale también para
//     Crecimiento: `churn` abre `por_motivo` en `falta_de_pago`,
//     `reloj`, `pedido_del_cliente`, `cierre_del_negocio`, `otro`, y
//     `por_origen` es texto `meta: 2; sin_origen: 1`.
//
// Dos grupos: «plataforma» (las tablas, fila por fila, leídas paginadas) y
// «crecimiento» (las funciones de 20260925100000 y embudo_pauta, un mes
// por fila, con el rango y la moneda de /fidelli/crecimiento; ver el
// bloque CRECIMIENTO más abajo).
// ============================================================

type Cliente = Awaited<ReturnType<typeof createClient>>;

export type ClaveRecurso =
  | "tenants"
  | "eventos"
  | "snapshots"
  | "snapshots-tenant"
  | "pagos"
  | "contactos-pauta"
  | "gasto-pauta"
  | "pedidos-calcos"
  | "movimientos-mrr"
  | "altas-bajas"
  | "churn"
  | "cohortes-logos"
  | "cohortes-ingresos"
  | "trabajos"
  | "embudo-pauta";

export type GrupoRecurso = "plataforma" | "crecimiento";

export type NombreParametro =
  | "lubricentro_id"
  | "desde"
  | "hasta"
  | "moneda"
  | "estado"
  | "canal"
  // Los del listado de lubricentros, con los mismos nombres que su URL.
  | "atencion"
  | "actividad"
  | "origen"
  | "q";

// La misma `Moneda` del gráfico del Resumen y de la pantalla de Crecimiento
// (lib/fidelli/mrr.ts); se re-exporta para quien la tome de acá.
export type { Moneda };

/** Lo que llega por la URL, ya validado y normalizado. */
export type ParametrosExportacion = {
  lubricentroId: string | null;
  /** `YYYY-MM-DD`; un `?desde=YYYY-MM` se vuelve el día 1 del mes. */
  desde: string | null;
  /** `YYYY-MM-DD`; un `?hasta=YYYY-MM` se vuelve el último día del mes. */
  hasta: string | null;
  /** Default `usd`, como el gráfico del Resumen y la pantalla de Crecimiento. */
  moneda: Moneda;
  estado: FiltroEstado;
  canal: CanalFiltro;
  /** El filtro del listado de lubricentros (`atencion=1`, `actividad=sin`, `origen=sin`), resuelto como lo hace la pantalla. */
  filtro: FiltroListado;
  /** El buscador del listado (nombre o slug), ya sin espacios alrededor; vacío = sin buscar. */
  q: string;
};

export type Columna<T> = {
  encabezado: string;
  celda: (fila: T) => Celda;
  /**
   * La columna la escribe ÚNICAMENTE el equipo (una puerta con guarda
   * `soy_superadmin()`), y por eso su texto no se neutraliza como fórmula
   * (lib/fidelli/csv.ts, `exentas`): quien puede cargarla ya tiene el
   * admin entero, y el apóstrofo alteraría un teléfono anotado
   * («+54 … (Juan)») para cualquier herramienta que no sea Excel. Falso
   * por defecto; NO se pone en nada que escriba un owner o venga de afuera.
   */
  delEquipo?: boolean;
};

export type Recurso<T> = {
  clave: ClaveRecurso;
  nombre: string;
  descripcion: string;
  grupo: GrupoRecurso;
  /** Los parámetros de la URL que este recurso entiende; el resto se ignora. */
  parametros: readonly NombreParametro[];
  columnas: readonly Columna<T>[];
  consultar: (supabase: Cliente, parametros: ParametrosExportacion) => Promise<T[]>;
};

// ---------- Parámetros ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^(\d{4})-(\d{2})$/;
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

// `YYYY-MM` o `YYYY-MM-DD`. Un mes se abre al día 1 (desde) o se cierra en
// su último día (hasta): así `?desde=2026-08&hasta=2026-09` toma los dos
// meses enteros, tanto para una tabla diaria como para las funciones de
// Crecimiento, que truncan a mes de todos modos. El calendario (primer y
// último día del mes) es el de lib/fidelli/crecimiento.ts, el mismo que
// usa la pantalla: una sola aritmética de meses en el admin.
//
// El año también se valida: el año 0000 no existe en el calendario de
// Postgres (`date/time field value out of range`, 22008) y la regex lo deja
// pasar; el calendario de crecimiento.ts lo construye igual («0000-01-31»)
// porque Date.UTC toma 0–99 como 1900–1999. Del 0001 al 9999 son todos
// válidos (cuatro dígitos, y Postgres llega mucho más lejos).
function leerFecha(valor: string, extremo: "desde" | "hasta"): string | null {
  const m = MES.exec(valor);
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    if (anio < 1 || mes < 1 || mes > 12) return null;
    return extremo === "desde" ? primerDiaDelMes(valor) : ultimoDiaDelMes(valor);
  }
  const d = DIA.exec(valor);
  if (!d) return null;
  const anio = Number(d[1]);
  const mes = Number(d[2]);
  const dia = Number(d[3]);
  // Un día que no existe (2026-02-30, 2026-04-31, el 29 de un febrero no
  // bisiesto, cualquier día del año 0000) se rechaza ACÁ: si pasara,
  // Postgres lo rechazaría (22008) al filtrar y la ruta contestaría un 500
  // que no dice qué estuvo mal. La comparación del día es de texto y
  // alcanza: con el mismo `YYYY-MM-` delante, «2026-02-30» > «2026-02-28»
  // es exactamente «el día se pasa del último».
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1 || valor > ultimoDiaDelMes(valor.slice(0, 7))) return null;
  return valor;
}

// El rango de Crecimiento con los defaults de la pantalla puestos donde no
// vino nada: p_desde = día 1 del primer mes (DESDE_DEFAULT), p_hasta =
// último día del mes en curso en hora argentina; lo mismo que la page le
// pasa a las funciones. Lo usan leerParametros (para rechazar un rango que
// queda dado vuelta contra un default) y rangoMensual (para llamar): un
// solo lugar decide qué significa «sin desde» y «sin hasta».
function rangoEfectivo(f: { desde: string | null; hasta: string | null }): { desde: string; hasta: string } {
  return {
    desde: f.desde ?? primerDiaDelMes(DESDE_DEFAULT),
    hasta: f.hasta ?? ultimoDiaDelMes(mesEnCursoAR()),
  };
}

export type LecturaParametros =
  | { ok: true; parametros: ParametrosExportacion }
  | { ok: false; error: string };

// Un parámetro vacío (`?desde=`, `?moneda=`) es lo mismo que no mandarlo,
// para todos por igual: los botones nunca mandan vacíos (hrefExportar) y
// quien arma la URL a mano quiere decir «sin filtro», no «filtrá por nada».
function valorDe(sp: URLSearchParams, nombre: NombreParametro): string | null {
  const v = sp.get(nombre);
  return v === null || v === "" ? null : v;
}

// Los tres filtros del listado de lubricentros, con el ÚNICO valor que la
// pantalla reconoce para cada uno (`atencion=1`, `actividad=sin`,
// `origen=sin`), sacados de QUERY_FILTRO para no repetir la regla. La
// pantalla ignora un valor desconocido; acá es 400, como todo lo demás.
const NOMBRES_FILTRO_LISTADO = ["atencion", "actividad", "origen"] as const;
const VALOR_FILTRO_LISTADO = new Map(
  Object.values(QUERY_FILTRO).flatMap((qs) => [...new URLSearchParams(qs).entries()]),
);

// Se validan TODOS los parámetros que vengan, los entienda el recurso o
// no: un `?desde=ayer` mal escrito tiene que devolver 400 y decirlo, no
// un archivo entero como si el filtro hubiera funcionado. El grupo del
// recurso solo cambia una cosa: contra qué se compara un extremo del rango
// cuando falta el otro (ver abajo).
export function leerParametros(sp: URLSearchParams, grupo: GrupoRecurso = "plataforma"): LecturaParametros {
  const lubricentroId = valorDe(sp, "lubricentro_id");
  if (lubricentroId !== null && !UUID.test(lubricentroId)) {
    return { ok: false, error: "lubricentro_id tiene que ser un UUID." };
  }

  const fechas: Record<"desde" | "hasta", string | null> = { desde: null, hasta: null };
  for (const extremo of ["desde", "hasta"] as const) {
    const crudo = valorDe(sp, extremo);
    if (crudo === null) continue;
    const leida = leerFecha(crudo, extremo);
    if (!leida) {
      return {
        ok: false,
        error: `${extremo} tiene que ser YYYY-MM o YYYY-MM-DD, y un día que exista (llegó «${crudo}»).`,
      };
    }
    fechas[extremo] = leida;
  }
  // En Crecimiento el extremo que no vino tiene un default (el rango de la
  // pantalla: DESDE_DEFAULT → el mes en curso), y lo que no puede quedar
  // dado vuelta es el rango EFECTIVO: `?desde=2027-01` solo, contra el mes
  // en curso, también es 400. Si pasara, las funciones devolverían cero
  // filas y saldría un archivo vacío que parece «sin historia», que es
  // justo lo que este data room no hace. La pantalla, con la misma URL,
  // intercambia; acá se rechaza, como todo lo demás, y el mensaje dice qué
  // default fue el que dio vuelta el rango. En la plataforma no hay
  // defaults (sin un extremo, el histórico entero por ese lado), así que
  // ahí solo se comparan los dos cuando vienen los dos.
  const rango = grupo === "crecimiento" ? rangoEfectivo(fechas) : fechas;
  if (rango.desde && rango.hasta && rango.desde > rango.hasta) {
    const porDefecto =
      grupo !== "crecimiento" || (fechas.desde && fechas.hasta)
        ? ""
        : fechas.desde
          ? `: sin hasta rige el mes en curso (${mesEnCursoAR()})`
          : `: sin desde rige ${DESDE_DEFAULT}, el primer mes con fotos`;
    return { ok: false, error: `desde no puede ser posterior a hasta${porDefecto}.` };
  }

  const moneda = valorDe(sp, "moneda") ?? MONEDA_DEFAULT;
  if (moneda !== "ars" && moneda !== "usd") {
    return { ok: false, error: "moneda tiene que ser ars o usd." };
  }

  const estadoCrudo = valorDe(sp, "estado") ?? "todos";
  if (estadoCrudo !== "todos" && !esFiltroEstado(estadoCrudo)) {
    return { ok: false, error: "estado tiene que ser abiertos, demo, cerrados o perdidos." };
  }
  const estado: FiltroEstado = esFiltroEstado(estadoCrudo) ? estadoCrudo : "todos";

  const canalCrudo = valorDe(sp, "canal") ?? "todos";
  if (!esCanalFiltro(canalCrudo)) {
    return { ok: false, error: "canal tiene que ser meta, google u otro." };
  }
  const canal: CanalFiltro = canalCrudo;

  const filtroCrudo: Partial<Record<(typeof NOMBRES_FILTRO_LISTADO)[number], string>> = {};
  for (const nombre of NOMBRES_FILTRO_LISTADO) {
    const v = valorDe(sp, nombre);
    if (v === null) continue;
    const esperado = VALOR_FILTRO_LISTADO.get(nombre);
    if (v !== esperado) {
      return { ok: false, error: `${nombre} solo puede ser «${esperado}», como en el listado (llegó «${v}»).` };
    }
    filtroCrudo[nombre] = v;
  }
  // Si vienen varios, gana el primero en el orden de la pantalla (filtroDe).
  const filtro = filtroDe(filtroCrudo);
  const q = (valorDe(sp, "q") ?? "").trim();

  return {
    ok: true,
    parametros: { lubricentroId, desde: fechas.desde, hasta: fechas.hasta, moneda, estado, canal, filtro, q },
  };
}

// Los dos parámetros cuyo «todos» es el centinela de un selector de la
// pantalla (estado y canal de la pauta) y no un valor: ese no viaja. En
// cualquier otro parámetro «todos» es un valor como cualquiera: buscar la
// palabra «todos» en el listado es `q=todos`, y el CSV del botón tiene que
// traer exactamente lo que la tabla muestra (que puede ser nada).
const CON_CENTINELA_TODOS: ReadonlySet<string> = new Set<NombreParametro>(["estado", "canal"]);

/** La URL de un recurso con sus parámetros; los vacíos, y el «todos» de estado/canal, no viajan. */
export function hrefExportar(
  clave: ClaveRecurso,
  parametros: Partial<Record<NombreParametro, string | null | undefined>> = {},
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (!v) continue;
    if (v === "todos" && CON_CENTINELA_TODOS.has(k)) continue;
    sp.set(k, v);
  }
  const q = sp.toString();
  return `/api/fidelli/exportar/${clave}${q ? `?${q}` : ""}`;
}

/**
 * Los parámetros de `tenants` para el filtro y el buscador vigentes del
 * listado: el mismo query string que la pantalla (QUERY_FILTRO), así el
 * botón baja exactamente lo que la tabla muestra. Con «todos» y sin
 * búsqueda no viaja nada.
 */
export function parametrosDelListado(filtro: FiltroListado, q: string): Partial<Record<NombreParametro, string>> {
  const params: Partial<Record<NombreParametro, string>> = {};
  for (const [k, v] of new URLSearchParams(QUERY_FILTRO[filtro]).entries()) {
    params[k as NombreParametro] = v;
  }
  params.q = q.trim();
  return params;
}

// ---------- Fechas e instantes ----------

// El desfase de Argentina como lo escribe ISO 8601 («-03:00»). Se pregunta
// por Intl y no se escribe a mano por la misma razón que lib/fechas.ts no
// asume el reloj del proceso; si algún runtime no supiera responderlo, la
// zona no tiene horario de verano y -03:00 es la verdad.
function desfaseAR(instante: Date): string {
  try {
    const parte = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_AR, timeZoneName: "longOffset" })
      .formatToParts(instante)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = parte ? /GMT([+-]\d{2}:\d{2})/.exec(parte) : null;
    return m ? m[1] : "-03:00";
  } catch {
    return "-03:00";
  }
}

const PARTES_AR = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_AR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `2026-09-22T22:01:07-03:00`: el instante en hora argentina, sin microsegundos. */
export function instanteAR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return null;
  const p = Object.fromEntries(PARTES_AR.formatToParts(f).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${desfaseAR(f)}`;
}

/** El día calendario argentino de un instante. */
function diaAR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const f = new Date(iso);
  return Number.isNaN(f.getTime()) ? null : fechaCalendarioAR(f);
}

// Un `date` comparado contra un timestamptz: el día empieza a la
// medianoche ARGENTINA, escrita con su desfase para no depender del
// TimeZone de la sesión de PostgREST.
function inicioDelDiaAR(dia: string): string {
  return `${dia}T00:00:00${desfaseAR(new Date(`${dia}T12:00:00Z`))}`;
}

// ---------- Celdas ----------

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function json(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

// ---------- Lecturas ----------

type Resultado = { data: unknown; error: { message: string } | null };

// Una tabla entera, de a páginas de 1000, con el cast en un solo lugar: el
// tipo de las filas embebidas (`lubricentros(nombre)`, `usuarios!actor`)
// lo declara cada recurso, como hacen la ficha y la pauta.
async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<Resultado>): Promise<T[]> {
  return paginar<T>(async (desde, hasta) => {
    const r = await pagina(desde, hasta);
    return { data: r.data as T[] | null, error: r.error };
  });
}

function sinError<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

type Embebido = { nombre: string; slug?: string } | null;

// ---------- Los recursos ----------

// `Recurso<T>` es contravariante en T por `celda`, así que un registro
// heterogéneo no entra en `Recurso<unknown>` sin este puente. Es seguro:
// las filas que `consultar` produce son las que `columnas` consume.
function definir<T>(r: Recurso<T>): Recurso<unknown> {
  return r as unknown as Recurso<unknown>;
}

// --- tenants ---

type FilaTenant = {
  l: {
    id: string;
    nombre: string;
    slug: string;
    activo: boolean;
    origen: string | null;
    origen_detalle: string | null;
    created_at: string;
    calcos_entregadas: number;
    cobranza_desde: string | null;
    suspension_automatica: boolean;
  };
  /** El cruce del listado (null solo si listado_lubricentros() no lo trajo). */
  r: FilaListado | null;
};

const tenants = definir<FilaTenant>({
  clave: "tenants",
  nombre: "Tenants",
  descripcion:
    "Un lubricentro por fila: origen, alta, plan, estado, MRR, activación, trabajos de 30 días y salud.",
  grupo: "plataforma",
  // El filtro y el buscador del listado, con los nombres de su URL: el
  // botón de /fidelli/lubricentros baja lo que la tabla muestra.
  parametros: ["atencion", "actividad", "origen", "q"],
  async consultar(supabase, p) {
    // Las mismas cuatro lecturas del listado, cruzadas por id con
    // armarListado(): la tabla y el CSV no pueden decir cosas distintas del
    // mismo tenant. La base de filas es `lubricentros`: una por tenant,
    // siempre, aunque alguna RPC no lo trajera.
    const [lubRes, listadoRes, indRes, saludRes] = await Promise.all([
      supabase
        .from("lubricentros")
        .select(
          "id, nombre, slug, activo, origen, origen_detalle, created_at, calcos_entregadas, cobranza_desde, suspension_automatica",
        )
        .order("nombre"),
      supabase.rpc("listado_lubricentros"),
      supabase.rpc("indicadores_tenants"),
      supabase.rpc("salud_tenants"),
    ]);
    const lubs = sinError<FilaTenant["l"][]>(lubRes, "lubricentros");
    const filas = sinError<FilaLubricentro[]>(listadoRes, "listado_lubricentros");
    const indicadores = sinError<unknown[]>(indRes, "indicadores_tenants") as FilaIndicadores[];
    const salud = sinError<unknown[]>(saludRes, "salud_tenants") as FilaSalud[];

    const origenes: Record<string, OrigenDeFila> = Object.fromEntries(
      lubs.map((l) => [l.id, { origen: l.origen as OrigenDeFila["origen"], detalle: l.origen_detalle }]),
    );
    const listado = armarListado({ filas, salud, indicadores, semanas: [], origenes });
    const porId = new Map(listado.map((f) => [f.fila.id, f]));
    // Sin filtro ni búsqueda salen TODOS los lubricentros, aunque el cruce
    // no trajera alguno. Con filtro, exactamente los que la pantalla
    // mostraría: aplicarFiltro() es la misma función del listado, así el
    // CSV y la tabla nunca discrepan sobre quién «necesita atención».
    const sinFiltro = p.filtro === "todos" && p.q === "";
    const visibles = new Set(aplicarFiltro(listado, p.filtro, p.q).map((f) => f.fila.id));
    return lubs
      .filter((l) => sinFiltro || visibles.has(l.id))
      .map((l) => ({ l, r: porId.get(l.id) ?? null }));
  },
  columnas: [
    { encabezado: "id", celda: (t) => t.l.id },
    { encabezado: "nombre", celda: (t) => t.l.nombre },
    { encabezado: "slug", celda: (t) => t.l.slug },
    { encabezado: "origen", celda: (t) => t.l.origen },
    { encabezado: "origen_detalle", celda: (t) => t.l.origen_detalle },
    { encabezado: "alta", celda: (t) => diaAR(t.l.created_at) },
    { encabezado: "alta_at", celda: (t) => instanteAR(t.l.created_at) },
    { encabezado: "estado", celda: (t) => (t.r ? estadoDelTenant(t.r) : null) },
    { encabezado: "activo", celda: (t) => t.l.activo },
    { encabezado: "es_activo", celda: (t) => t.r?.indicadores?.es_activo ?? null },
    { encabezado: "estado_reloj", celda: (t) => t.r?.indicadores?.estado_reloj ?? null },
    { encabezado: "exento", celda: (t) => t.r?.indicadores?.exento ?? null },
    { encabezado: "plan", celda: (t) => t.r?.fila.plan_nombre ?? null },
    { encabezado: "periodo", celda: (t) => t.r?.fila.sub_periodo ?? null },
    { encabezado: "descuento_pct", celda: (t) => numero(t.r?.fila.sub_descuento_pct) },
    { encabezado: "estado_suscripcion", celda: (t) => t.r?.fila.sub_estado ?? null },
    { encabezado: "vencimiento", celda: (t) => t.r?.fila.sub_vencimiento ?? null },
    { encabezado: "mrr_ars", celda: (t) => numero(t.r?.indicadores?.mrr_ars) },
    { encabezado: "modulo_pago", celda: (t) => t.r?.indicadores?.modulo_pago ?? null },
    { encabezado: "modulo_gomeria", celda: (t) => t.r?.fila.modulo_neumaticos ?? null },
    { encabezado: "activado", celda: (t) => t.r?.indicadores?.activado ?? null },
    { encabezado: "dias_alta", celda: (t) => numero(t.r?.indicadores?.dias_alta) },
    { encabezado: "trabajos_30d", celda: (t) => numero(t.r?.indicadores?.trabajos_30) },
    { encabezado: "ultimo_trabajo", celda: (t) => t.r?.indicadores?.ultimo_trabajo ?? null },
    { encabezado: "salud", celda: (t) => t.r?.salud?.salud ?? null },
    { encabezado: "salud_motivo", celda: (t) => t.r?.salud?.motivo ?? null },
    { encabezado: "atencion", celda: (t) => t.r?.fila.atencion ?? null },
    { encabezado: "owner", celda: (t) => t.r?.fila.owner_nombre ?? null },
    { encabezado: "owner_estado", celda: (t) => t.r?.fila.owner_estado ?? null },
    // Lo escribe el owner (el WhatsApp de la landing o el teléfono de una
    // sucursal): texto de afuera, se neutraliza como cualquier otro.
    { encabezado: "telefono", celda: (t) => t.r?.fila.telefono ?? null },
    { encabezado: "calcos_entregadas", celda: (t) => numero(t.l.calcos_entregadas) },
    { encabezado: "cobranza_desde", celda: (t) => t.l.cobranza_desde },
    { encabezado: "suspension_automatica", celda: (t) => t.l.suspension_automatica },
  ],
});

// --- eventos ---

type FilaEvento = {
  id: string;
  lubricentro_id: string;
  tipo: Database["public"]["Enums"]["tipo_evento_tenant"];
  ocurrido_at: string;
  created_at: string;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
  origen_evento: string;
  actor: string | null;
  lubricentros: Embebido;
  usuarios: Embebido;
};

const eventos = definir<FilaEvento>({
  clave: "eventos",
  nombre: "Eventos",
  descripcion:
    "El libro de novedades (tenant_eventos): altas, pagos, cambios de plan, suspensiones y reactivaciones, con el nombre del tenant.",
  grupo: "plataforma",
  parametros: ["lubricentro_id", "desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaEvento>((desde, hasta) => {
      let q = supabase
        .from("tenant_eventos")
        .select(
          "id, lubricentro_id, tipo, ocurrido_at, created_at, antes, despues, motivo, origen_evento, actor, lubricentros(nombre, slug), usuarios!actor(nombre)",
        );
      if (p.lubricentroId) q = q.eq("lubricentro_id", p.lubricentroId);
      if (p.desde) q = q.gte("ocurrido_at", inicioDelDiaAR(p.desde));
      if (p.hasta) q = q.lt("ocurrido_at", inicioDelDiaAR(sumarDias(p.hasta, 1)));
      // Cronológico, del más viejo al más nuevo: es un libro, no una
      // bandeja. La pantalla lo invierte.
      return q
        .order("ocurrido_at", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "id", celda: (e) => e.id },
    { encabezado: "lubricentro_id", celda: (e) => e.lubricentro_id },
    { encabezado: "tenant", celda: (e) => e.lubricentros?.nombre ?? null },
    { encabezado: "slug", celda: (e) => e.lubricentros?.slug ?? null },
    { encabezado: "tipo", celda: (e) => e.tipo },
    { encabezado: "fecha", celda: (e) => diaAR(e.ocurrido_at) },
    { encabezado: "ocurrido_at", celda: (e) => instanteAR(e.ocurrido_at) },
    { encabezado: "motivo", celda: (e) => e.motivo },
    { encabezado: "origen_evento", celda: (e) => e.origen_evento },
    { encabezado: "actor_id", celda: (e) => e.actor },
    // Un evento del webhook no tiene persona detrás: lo hizo Cresium.
    { encabezado: "actor", celda: (e) => (e.origen_evento === "webhook" ? "Cresium" : (e.usuarios?.nombre ?? null)) },
    { encabezado: "antes", celda: (e) => json(e.antes) },
    { encabezado: "despues", celda: (e) => json(e.despues) },
    { encabezado: "registrado_at", celda: (e) => instanteAR(e.created_at) },
  ],
});

// --- snapshots ---

type FilaSnapshot = Database["public"]["Tables"]["snapshots_diarios"]["Row"];

const snapshots = definir<FilaSnapshot>({
  clave: "snapshots",
  nombre: "Fotos diarias",
  descripcion:
    "snapshots_diarios: la foto de la plataforma al cierre de cada día (tenants, MRR en pesos y dólares, trabajos, recordatorios, escaneos).",
  grupo: "plataforma",
  parametros: ["desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaSnapshot>((desde, hasta) => {
      let q = supabase
        .from("snapshots_diarios")
        .select(
          "fecha, fuente, tenants_activos, tenants_exentos, tenants_suspendidos, mrr_ars, mrr_usd, tc_venta, altas_dia, bajas_dia, trabajos_dia, trabajos_service, trabajos_mecanica, trabajos_neumaticos, recordatorios_dia, escaneos_dia, created_at",
        );
      if (p.desde) q = q.gte("fecha", p.desde);
      if (p.hasta) q = q.lte("fecha", p.hasta);
      return q.order("fecha", { ascending: true }).range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "fecha", celda: (s) => s.fecha },
    { encabezado: "fuente", celda: (s) => s.fuente },
    { encabezado: "tenants_activos", celda: (s) => numero(s.tenants_activos) },
    { encabezado: "tenants_exentos", celda: (s) => numero(s.tenants_exentos) },
    { encabezado: "tenants_suspendidos", celda: (s) => numero(s.tenants_suspendidos) },
    { encabezado: "mrr_ars", celda: (s) => numero(s.mrr_ars) },
    { encabezado: "mrr_usd", celda: (s) => numero(s.mrr_usd) },
    { encabezado: "tc_venta", celda: (s) => numero(s.tc_venta) },
    { encabezado: "altas_dia", celda: (s) => numero(s.altas_dia) },
    { encabezado: "bajas_dia", celda: (s) => numero(s.bajas_dia) },
    { encabezado: "trabajos_dia", celda: (s) => numero(s.trabajos_dia) },
    { encabezado: "trabajos_service", celda: (s) => numero(s.trabajos_service) },
    { encabezado: "trabajos_mecanica", celda: (s) => numero(s.trabajos_mecanica) },
    { encabezado: "trabajos_neumaticos", celda: (s) => numero(s.trabajos_neumaticos) },
    { encabezado: "recordatorios_dia", celda: (s) => numero(s.recordatorios_dia) },
    { encabezado: "escaneos_dia", celda: (s) => numero(s.escaneos_dia) },
    { encabezado: "cerrado_at", celda: (s) => instanteAR(s.created_at) },
  ],
});

// --- snapshots-tenant ---

type FilaSnapshotTenant = Database["public"]["Tables"]["snapshots_tenant_diarios"]["Row"] & {
  lubricentros: Embebido;
  planes: Embebido;
};

const snapshotsTenant = definir<FilaSnapshotTenant>({
  clave: "snapshots-tenant",
  nombre: "Fotos diarias por tenant",
  descripcion:
    "snapshots_tenant_diarios: por día y tenant, si estaba activo, su plan, período, módulo pago, MRR y trabajos del día.",
  grupo: "plataforma",
  parametros: ["lubricentro_id", "desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaSnapshotTenant>((desde, hasta) => {
      let q = supabase
        .from("snapshots_tenant_diarios")
        .select(
          "fecha, lubricentro_id, activo, exento, mrr_ars, plan_id, periodo, modulo_pago, trabajos_dia, created_at, lubricentros(nombre, slug), planes(nombre)",
        );
      if (p.lubricentroId) q = q.eq("lubricentro_id", p.lubricentroId);
      if (p.desde) q = q.gte("fecha", p.desde);
      if (p.hasta) q = q.lte("fecha", p.hasta);
      return q
        .order("fecha", { ascending: true })
        .order("lubricentro_id", { ascending: true })
        .range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "fecha", celda: (s) => s.fecha },
    { encabezado: "lubricentro_id", celda: (s) => s.lubricentro_id },
    { encabezado: "tenant", celda: (s) => s.lubricentros?.nombre ?? null },
    { encabezado: "slug", celda: (s) => s.lubricentros?.slug ?? null },
    { encabezado: "activo", celda: (s) => s.activo },
    { encabezado: "exento", celda: (s) => s.exento },
    { encabezado: "plan_id", celda: (s) => s.plan_id },
    { encabezado: "plan", celda: (s) => s.planes?.nombre ?? null },
    { encabezado: "periodo", celda: (s) => s.periodo },
    { encabezado: "modulo_pago", celda: (s) => s.modulo_pago },
    { encabezado: "mrr_ars", celda: (s) => numero(s.mrr_ars) },
    { encabezado: "trabajos_dia", celda: (s) => numero(s.trabajos_dia) },
  ],
});

// --- pagos ---

type FilaPago = Database["public"]["Tables"]["pagos"]["Row"] & {
  lubricentros: Embebido;
  usuarios: Embebido;
};

const pagos = definir<FilaPago>({
  clave: "pagos",
  nombre: "Pagos",
  descripcion:
    "Cada pago registrado (manual o acreditado por Cresium), con el tenant, el período que cubre y quién lo registró.",
  grupo: "plataforma",
  parametros: ["lubricentro_id", "desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaPago>((desde, hasta) => {
      let q = supabase
        .from("pagos")
        .select(
          "id, lubricentro_id, suscripcion_id, fecha_pago, periodo_desde, periodo_hasta, monto, origen, cresium_transaccion_id, registrado_por, created_at, lubricentros(nombre, slug), usuarios!registrado_por(nombre)",
        );
      if (p.lubricentroId) q = q.eq("lubricentro_id", p.lubricentroId);
      if (p.desde) q = q.gte("fecha_pago", p.desde);
      if (p.hasta) q = q.lte("fecha_pago", p.hasta);
      return q
        .order("fecha_pago", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "id", celda: (x) => x.id },
    { encabezado: "lubricentro_id", celda: (x) => x.lubricentro_id },
    { encabezado: "tenant", celda: (x) => x.lubricentros?.nombre ?? null },
    { encabezado: "slug", celda: (x) => x.lubricentros?.slug ?? null },
    { encabezado: "fecha_pago", celda: (x) => x.fecha_pago },
    { encabezado: "periodo_desde", celda: (x) => x.periodo_desde },
    { encabezado: "periodo_hasta", celda: (x) => x.periodo_hasta },
    { encabezado: "monto_ars", celda: (x) => numero(x.monto) },
    { encabezado: "origen", celda: (x) => x.origen },
    // Igual que en la ficha: un pago del webhook lo registró Cresium.
    { encabezado: "registrado_por", celda: (x) => (x.origen === "cresium" ? "Cresium" : (x.usuarios?.nombre ?? null)) },
    { encabezado: "cresium_transaccion_id", celda: (x) => numero(x.cresium_transaccion_id) },
    { encabezado: "suscripcion_id", celda: (x) => x.suscripcion_id },
    { encabezado: "registrado_at", celda: (x) => instanteAR(x.created_at) },
  ],
});

// --- contactos-pauta ---

type FilaContactoPauta = Contacto & {
  registrado_por: string | null;
  created_at: string;
  updated_at: string;
  lubricentros: Embebido;
  usuarios: Embebido;
};

const contactosPauta = definir<FilaContactoPauta>({
  clave: "contactos-pauta",
  nombre: "Contactos de pauta",
  descripcion:
    "Cada persona que escribió por un canal pago: fecha del primer mensaje, canal, demo, cierre (con el tenant) o pérdida.",
  grupo: "plataforma",
  parametros: ["estado", "canal", "desde", "hasta"],
  async consultar(supabase, p) {
    const filas = await todas<FilaContactoPauta>((desde, hasta) => {
      let q = supabase
        .from("contactos_pauta")
        .select(
          "id, fecha, canal, origen, telefono, demo_at, cierre_at, lubricentro_id, perdida_at, motivo_perdida, registrado_por, created_at, updated_at, lubricentros(nombre, slug), usuarios!registrado_por(nombre)",
        );
      if (p.canal !== "todos") q = q.eq("canal", p.canal);
      if (p.desde) q = q.gte("fecha", p.desde);
      if (p.hasta) q = q.lte("fecha", p.hasta);
      return q
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta);
    });
    // El estado no es una columna: sale de las tres fechas (lib/fidelli/
    // pauta.ts, la misma regla que la lista), así que se filtra acá.
    return filas
      .map((c) => ({ ...c, tenant_nombre: c.lubricentros?.nombre ?? null }))
      .filter((c) => pasaFiltro(c, p.estado, "todos"));
  },
  columnas: [
    { encabezado: "id", celda: (c) => c.id },
    { encabezado: "fecha", celda: (c) => c.fecha },
    { encabezado: "canal", celda: (c) => c.canal },
    { encabezado: "origen", celda: (c) => c.origen },
    // Lo escribe solo el equipo (registrar_contacto_pauta, guarda
    // soy_superadmin()) y suele llevar anotaciones («… (Juan)»): sale tal
    // cual, sin la neutralización de fórmulas. Ver Columna.delEquipo.
    { encabezado: "telefono", celda: (c) => c.telefono, delEquipo: true },
    { encabezado: "estado", celda: (c) => estadoDelContacto(c) },
    { encabezado: "demo_at", celda: (c) => c.demo_at },
    { encabezado: "cierre_at", celda: (c) => c.cierre_at },
    { encabezado: "lubricentro_id", celda: (c) => c.lubricentro_id },
    { encabezado: "tenant", celda: (c) => c.lubricentros?.nombre ?? null },
    { encabezado: "perdida_at", celda: (c) => c.perdida_at },
    { encabezado: "motivo_perdida", celda: (c) => c.motivo_perdida },
    { encabezado: "registrado_por", celda: (c) => c.usuarios?.nombre ?? null },
    { encabezado: "registrado_at", celda: (c) => instanteAR(c.created_at) },
    { encabezado: "actualizado_at", celda: (c) => instanteAR(c.updated_at) },
  ],
});

// --- gasto-pauta ---

type FilaGastoPauta = Database["public"]["Tables"]["gasto_pauta"]["Row"] & { usuarios: Embebido };

const gastoPauta = definir<FilaGastoPauta>({
  clave: "gasto-pauta",
  nombre: "Gasto de pauta",
  descripcion: "Lo gastado por semana (lunes) y canal, en dólares, con su nota.",
  grupo: "plataforma",
  parametros: ["canal", "desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaGastoPauta>((desde, hasta) => {
      let q = supabase
        .from("gasto_pauta")
        .select("semana, canal, monto_usd, nota, registrado_por, created_at, updated_at, usuarios!registrado_por(nombre)");
      if (p.canal !== "todos") q = q.eq("canal", p.canal);
      if (p.desde) q = q.gte("semana", p.desde);
      if (p.hasta) q = q.lte("semana", p.hasta);
      return q.order("semana", { ascending: true }).order("canal", { ascending: true }).range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "semana", celda: (g) => g.semana },
    { encabezado: "canal", celda: (g) => g.canal },
    { encabezado: "monto_usd", celda: (g) => numero(g.monto_usd) },
    { encabezado: "nota", celda: (g) => g.nota },
    { encabezado: "registrado_por", celda: (g) => g.usuarios?.nombre ?? null },
    { encabezado: "registrado_at", celda: (g) => instanteAR(g.created_at) },
    { encabezado: "actualizado_at", celda: (g) => instanteAR(g.updated_at) },
  ],
});

// --- pedidos-calcos ---

type FilaPedidoCalcos = Database["public"]["Tables"]["pedidos_calcos"]["Row"] & {
  lubricentros: Embebido;
  usuarios: Embebido;
};

const pedidosCalcos = definir<FilaPedidoCalcos>({
  clave: "pedidos-calcos",
  nombre: "Pedidos de calcos",
  descripcion:
    "Cada entrega de calcos a un tenant: cantidad, si estaban incluidas o se cobraron, monto y fecha.",
  grupo: "plataforma",
  parametros: ["lubricentro_id", "desde", "hasta"],
  consultar(supabase, p) {
    return todas<FilaPedidoCalcos>((desde, hasta) => {
      let q = supabase
        .from("pedidos_calcos")
        .select(
          "id, lubricentro_id, fecha, cantidad, incluidas, monto_ars, nota, registrado_por, created_at, lubricentros(nombre, slug), usuarios!registrado_por(nombre)",
        );
      if (p.lubricentroId) q = q.eq("lubricentro_id", p.lubricentroId);
      if (p.desde) q = q.gte("fecha", p.desde);
      if (p.hasta) q = q.lte("fecha", p.hasta);
      return q
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta);
    });
  },
  columnas: [
    { encabezado: "id", celda: (x) => x.id },
    { encabezado: "fecha", celda: (x) => x.fecha },
    { encabezado: "lubricentro_id", celda: (x) => x.lubricentro_id },
    { encabezado: "tenant", celda: (x) => x.lubricentros?.nombre ?? null },
    { encabezado: "slug", celda: (x) => x.lubricentros?.slug ?? null },
    { encabezado: "cantidad", celda: (x) => numero(x.cantidad) },
    { encabezado: "incluidas", celda: (x) => x.incluidas },
    { encabezado: "monto_ars", celda: (x) => numero(x.monto_ars) },
    { encabezado: "nota", celda: (x) => x.nota },
    { encabezado: "registrado_por", celda: (x) => x.usuarios?.nombre ?? null },
    { encabezado: "registrado_at", celda: (x) => instanteAR(x.created_at) },
  ],
});

// ============================================================
// CRECIMIENTO: las tablas de /fidelli/crecimiento, un mes por fila
// (docs/METRICAS.md § 1 «Movimientos de MRR de un mes», «Cohorte», «GRR y
// NRR», «Churn del mes, por tipo y por origen», «Altas y bajas por mes»,
// «Trabajos por mes», y «Tasa de cierre» / «CAC del canal» para el embudo).
// Cada recurso es una llamada tipada a la función de 20260925100000 (o a
// embudo_pauta, de 20260924101000) con el mismo rango que la pantalla, y
// sus columnas son las de la función, con los mismos nombres: nada se
// recalcula acá. Las filas salen como las devuelve la base, del mes más
// viejo al más nuevo (la pantalla invierte los movimientos).
//
// El rango: `desde`/`hasta` en YYYY-MM (leerFecha abre el mes al día 1 y
// lo cierra en su último día, que es lo que la pantalla le pasa a las
// funciones; un YYYY-MM-DD también entra porque las siete truncan a mes,
// verificado con el día 15) y, sin parámetros, LOS MISMOS defaults que la
// pantalla, importados de lib/fidelli/crecimiento.ts (DESDE_DEFAULT =
// 2026-08, el primer mes con fotos; mesEnCursoAR() en hora argentina;
// MONEDA_DEFAULT = usd): una sola fuente, para que el botón, la pantalla y
// una URL a mano digan siempre lo mismo. La única diferencia con la
// pantalla es deliberada: ahí un formato inválido cae al default y un
// `desde > hasta` se intercambia; acá son 400, como en todo el data room
// (un archivo entero con otro rango del pedido es peor que un error), y
// el rango que se juzga es el efectivo, con los defaults puestos: un
// `?desde=2027-01` solo también está dado vuelta (leerParametros).
//
// Los números van como los da la función: las fracciones
// (`crecimiento_pct`, `churn_pct`, `m1`…`m12`, `grr_*`, `nrr_*`, `tasa_*`)
// son fracciones (0,12 = 12 %), no porcentajes; la pantalla multiplica.
// Dos excepciones escritas en § 1: `contraccion` y `churn` la función las
// devuelve como magnitudes positivas y ACÁ salen con signo negativo, para
// que la identidad cierre sumando la fila de izquierda a derecha en Excel.
// ============================================================

// p_desde = día 1 del primer mes, p_hasta = último día del último, como la
// pantalla: el rango efectivo (rangoEfectivo, arriba, el mismo que
// leerParametros ya validó) con los nombres de los parámetros de las
// funciones.
function rangoMensual(p: ParametrosExportacion): { p_desde: string; p_hasta: string } {
  const { desde, hasta } = rangoEfectivo(p);
  return { p_desde: desde, p_hasta: hasta };
}

// La fila que devuelve una función de la base, sacada del tipo generado.
// Con `infer` y no con `[number]`: no toda función devuelve un arreglo
// (hay escalares y jsonb) y a TS le alcanza con que ESTA lo sea.
type Devuelve<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Returns"] extends readonly (infer Fila)[] ? Fila : never;

// Una magnitud positiva de la función, con el signo que lleva en la fila
// (contracción y churn restan). El cero queda cero: un «-0» no es un dato.
function negativo(v: unknown): number | null {
  const n = numero(v);
  return n === null || n === 0 ? n : -n;
}

// Un conteo dentro de un objeto jsonb `{clave: n}` como los `por_motivo` y
// `por_origen` de churn_por_mes. La función omite las claves en cero, así
// que la ausencia es 0 y no null: no hubo bajas por ese motivo.
function conteoDe(objeto: unknown, clave: string): number {
  if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) return 0;
  return numero((objeto as Record<string, unknown>)[clave]) ?? 0;
}

// `{"organico": 1, "sin_origen": 2}` → `sin_origen: 2; organico: 1`: una
// celda de texto con el origen de más bajas primero y, a igual conteo, por
// nombre, para que dos exportaciones iguales den el mismo archivo. Sin
// bajas, vacía. Las claves son las del enum origen_tenant más `sin_origen`,
// tal cual (lib/fidelli/eventos.ts tiene las etiquetas de la pantalla).
function conteosComoTexto(objeto: unknown): string | null {
  if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) return null;
  const pares = Object.entries(objeto as Record<string, unknown>)
    .map(([clave, v]) => [clave, numero(v) ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return pares.length ? pares.map(([clave, n]) => `${clave}: ${n}`).join("; ") : null;
}

// --- movimientos-mrr ---

type FilaMovimientos = Devuelve<"movimientos_mrr"> & { moneda: Moneda };

const movimientosMrr = definir<FilaMovimientos>({
  clave: "movimientos-mrr",
  nombre: "Movimientos de MRR",
  descripcion:
    "Por mes: de dónde salió el MRR (nuevo, reactivación, expansión, contracción, churn y ajuste de lista), el neto comercial y los tenants, en la moneda elegida.",
  grupo: "crecimiento",
  parametros: ["desde", "hasta", "moneda"],
  async consultar(supabase, p) {
    const filas = sinError<Devuelve<"movimientos_mrr">[]>(
      await supabase.rpc("movimientos_mrr", { ...rangoMensual(p), p_moneda: p.moneda }),
      "movimientos_mrr",
    );
    // La moneda viaja en cada fila: el nombre del archivo no la lleva, y un
    // CSV de montos sin unidad es ambiguo apenas se cierra la pestaña.
    return filas.map((f) => ({ ...f, moneda: p.moneda }));
  },
  columnas: [
    { encabezado: "mes", celda: (m) => m.mes },
    { encabezado: "en_curso", celda: (m) => m.en_curso },
    { encabezado: "sin_foto_anterior", celda: (m) => m.sin_foto_anterior },
    { encabezado: "mrr_inicio", celda: (m) => numero(m.mrr_inicio) },
    { encabezado: "nuevo", celda: (m) => numero(m.nuevo) },
    { encabezado: "reactivacion", celda: (m) => numero(m.reactivacion) },
    { encabezado: "expansion", celda: (m) => numero(m.expansion) },
    // Con signo: la función devuelve magnitudes (§ 1) y en la fila restan.
    { encabezado: "contraccion", celda: (m) => negativo(m.contraccion) },
    { encabezado: "churn", celda: (m) => negativo(m.churn) },
    { encabezado: "ajuste_precio", celda: (m) => numero(m.ajuste_precio) },
    { encabezado: "mrr_fin", celda: (m) => numero(m.mrr_fin) },
    { encabezado: "neto", celda: (m) => numero(m.neto) },
    { encabezado: "crecimiento_pct", celda: (m) => numero(m.crecimiento_pct) },
    { encabezado: "tenants_inicio", celda: (m) => numero(m.tenants_inicio) },
    { encabezado: "tenants_fin", celda: (m) => numero(m.tenants_fin) },
    { encabezado: "moneda", celda: (m) => m.moneda },
  ],
});

// --- altas-bajas ---

type FilaAltasBajas = Devuelve<"altas_bajas_por_mes">;

const altasBajas = definir<FilaAltasBajas>({
  clave: "altas-bajas",
  nombre: "Altas y bajas por mes",
  descripcion:
    "Por mes: tenants que entraron, que se fueron (suspensión manual o reloj), que volvieron, y el neto. Todos los meses del rango, con ceros.",
  grupo: "crecimiento",
  parametros: ["desde", "hasta"],
  async consultar(supabase, p) {
    return sinError<FilaAltasBajas[]>(
      await supabase.rpc("altas_bajas_por_mes", rangoMensual(p)),
      "altas_bajas_por_mes",
    );
  },
  columnas: [
    { encabezado: "mes", celda: (a) => a.mes },
    { encabezado: "altas", celda: (a) => numero(a.altas) },
    { encabezado: "bajas", celda: (a) => numero(a.bajas) },
    { encabezado: "reactivaciones", celda: (a) => numero(a.reactivaciones) },
    { encabezado: "neto", celda: (a) => numero(a.neto) },
  ],
});

// --- churn ---

type FilaChurn = Devuelve<"churn_por_mes">;

// Las claves de `por_motivo` tal como las escribe churn_por_mes(): los
// cuatro códigos de motivo_suspension más `reloj` (la suspensión
// automática). En este orden: primero las involuntarias, después las
// voluntarias, como los lee § 1.
const MOTIVOS_CHURN = ["falta_de_pago", "reloj", "pedido_del_cliente", "cierre_del_negocio", "otro"] as const;

const churn = definir<FilaChurn>({
  clave: "churn",
  nombre: "Churn por mes",
  descripcion:
    "Por mes: bajas sobre los tenants activos al inicio, involuntarias y voluntarias, una columna por motivo y el desglose por origen del tenant.",
  grupo: "crecimiento",
  parametros: ["desde", "hasta"],
  async consultar(supabase, p) {
    return sinError<FilaChurn[]>(await supabase.rpc("churn_por_mes", rangoMensual(p)), "churn_por_mes");
  },
  columnas: [
    { encabezado: "mes", celda: (c) => c.mes },
    { encabezado: "tenants_inicio", celda: (c) => numero(c.tenants_inicio) },
    { encabezado: "bajas", celda: (c) => numero(c.bajas) },
    { encabezado: "involuntarias", celda: (c) => numero(c.involuntarias) },
    { encabezado: "voluntarias", celda: (c) => numero(c.voluntarias) },
    // `por_motivo` aplanado: una columna por código con su conteo (0 si no
    // hubo), para filtrar y sumar en Excel sin abrir un JSON.
    ...MOTIVOS_CHURN.map((clave) => ({
      encabezado: clave,
      celda: (c: FilaChurn) => conteoDe(c.por_motivo, clave),
    })),
    // `por_origen` como texto: los orígenes son ocho y casi siempre vacíos;
    // ocho columnas más dirían menos que «sin_origen: 2; meta: 1».
    { encabezado: "por_origen", celda: (c) => conteosComoTexto(c.por_origen) },
    { encabezado: "churn_pct", celda: (c) => numero(c.churn_pct) },
  ],
});

// --- cohortes-logos ---

type FilaCohorteLogos = Devuelve<"cohortes_logos">;

const cohortesLogos = definir<FilaCohorteLogos>({
  clave: "cohortes-logos",
  nombre: "Cohortes (logos)",
  descripcion:
    "Por mes de alta: cuántos tenants entraron, cuántos activaron y qué fracción seguía activa a 1, 2, 3, 6, 9 y 12 meses (vacío = ese mes no cerró).",
  grupo: "crecimiento",
  parametros: ["desde", "hasta"],
  async consultar(supabase, p) {
    return sinError<FilaCohorteLogos[]>(await supabase.rpc("cohortes_logos", rangoMensual(p)), "cohortes_logos");
  },
  columnas: [
    { encabezado: "cohorte", celda: (c) => c.cohorte },
    { encabezado: "tamano", celda: (c) => numero(c.tamano) },
    { encabezado: "activados", celda: (c) => numero(c.activados) },
    { encabezado: "m1", celda: (c) => numero(c.m1) },
    { encabezado: "m2", celda: (c) => numero(c.m2) },
    { encabezado: "m3", celda: (c) => numero(c.m3) },
    { encabezado: "m6", celda: (c) => numero(c.m6) },
    { encabezado: "m9", celda: (c) => numero(c.m9) },
    { encabezado: "m12", celda: (c) => numero(c.m12) },
  ],
});

// --- cohortes-ingresos ---

type FilaCohorteIngresos = Devuelve<"cohortes_ingresos">;

const cohortesIngresos = definir<FilaCohorteIngresos>({
  clave: "cohortes-ingresos",
  nombre: "Cohortes (ingresos)",
  descripcion:
    "Por mes de alta: el MRR inicial de la cohorte en dólares y su GRR y NRR a 3, 6 y 12 meses (siempre en USD; vacío = sin historia todavía).",
  grupo: "crecimiento",
  parametros: ["desde", "hasta"],
  async consultar(supabase, p) {
    return sinError<FilaCohorteIngresos[]>(
      await supabase.rpc("cohortes_ingresos", rangoMensual(p)),
      "cohortes_ingresos",
    );
  },
  columnas: [
    { encabezado: "cohorte", celda: (c) => c.cohorte },
    { encabezado: "tamano", celda: (c) => numero(c.tamano) },
    { encabezado: "mrr_inicial_usd", celda: (c) => numero(c.mrr_inicial_usd) },
    { encabezado: "grr_3", celda: (c) => numero(c.grr_3) },
    { encabezado: "nrr_3", celda: (c) => numero(c.nrr_3) },
    { encabezado: "grr_6", celda: (c) => numero(c.grr_6) },
    { encabezado: "nrr_6", celda: (c) => numero(c.nrr_6) },
    { encabezado: "grr_12", celda: (c) => numero(c.grr_12) },
    { encabezado: "nrr_12", celda: (c) => numero(c.nrr_12) },
  ],
});

// --- trabajos ---

type FilaTrabajos = Devuelve<"trabajos_por_mes">;

const trabajos = definir<FilaTrabajos>({
  clave: "trabajos",
  nombre: "Trabajos por mes",
  descripcion:
    "Por mes: trabajos totales y por tipo, autos que volvieron, recordatorios disparados y escaneos, sumando las fotos diarias. Solo los meses con foto.",
  grupo: "crecimiento",
  parametros: ["desde", "hasta"],
  async consultar(supabase, p) {
    return sinError<FilaTrabajos[]>(await supabase.rpc("trabajos_por_mes", rangoMensual(p)), "trabajos_por_mes");
  },
  columnas: [
    { encabezado: "mes", celda: (t) => t.mes },
    { encabezado: "en_curso", celda: (t) => t.en_curso },
    { encabezado: "total", celda: (t) => numero(t.total) },
    { encabezado: "service", celda: (t) => numero(t.service) },
    { encabezado: "mecanica", celda: (t) => numero(t.mecanica) },
    { encabezado: "neumaticos", celda: (t) => numero(t.neumaticos) },
    { encabezado: "autos_que_volvieron", celda: (t) => numero(t.autos_que_volvieron) },
    { encabezado: "recordatorios", celda: (t) => numero(t.recordatorios) },
    { encabezado: "escaneos", celda: (t) => numero(t.escaneos) },
  ],
});

// --- embudo-pauta ---

type FilaEmbudoMes = Devuelve<"embudo_pauta">;

const embudoPauta = definir<FilaEmbudoMes>({
  clave: "embudo-pauta",
  nombre: "Embudo de pauta por mes",
  descripcion:
    "Por mes de primer contacto: contactos, demos, cierres, perdidos y abiertos con sus tasas y el ciclo; y el gasto y el CAC del mes por fecha de cierre.",
  grupo: "crecimiento",
  parametros: ["desde", "hasta", "canal"],
  async consultar(supabase, p) {
    return sinError<FilaEmbudoMes[]>(
      await supabase.rpc("embudo_pauta", {
        ...rangoMensual(p),
        p_agrupar: "mes",
        // Sin canal la función suma los tres; `undefined` y no null para que
        // rija el default de SQL, igual que lo llama /fidelli/pauta.
        p_canal: p.canal === "todos" ? undefined : p.canal,
      }),
      "embudo_pauta",
    );
  },
  columnas: [
    { encabezado: "periodo", celda: (e) => e.periodo },
    // La función devuelve el canal pedido, o null cuando sumó los tres: en
    // el archivo «todos» dice más que una celda vacía.
    { encabezado: "canal", celda: (e) => (e.canal as CanalFiltro | null) ?? "todos" },
    { encabezado: "contactos", celda: (e) => numero(e.contactos) },
    { encabezado: "demos", celda: (e) => numero(e.demos) },
    { encabezado: "cierres", celda: (e) => numero(e.cierres) },
    { encabezado: "perdidos", celda: (e) => numero(e.perdidos) },
    { encabezado: "abiertos", celda: (e) => numero(e.abiertos) },
    { encabezado: "tasa_demo", celda: (e) => numero(e.tasa_demo) },
    { encabezado: "tasa_cierre", celda: (e) => numero(e.tasa_cierre) },
    { encabezado: "ciclo_mediana_dias", celda: (e) => numero(e.ciclo_mediana_dias) },
    { encabezado: "cierres_periodo", celda: (e) => numero(e.cierres_periodo) },
    { encabezado: "gasto_usd", celda: (e) => numero(e.gasto_usd) },
    { encabezado: "cac_usd", celda: (e) => numero(e.cac_usd) },
  ],
});

// ---------- El registro ----------

// En el orden en que los lista el data room: primero la plataforma,
// después Crecimiento. Record completo y no Partial: una clave nueva en
// ClaveRecurso sin su recurso no compila.
export const RECURSOS: Record<ClaveRecurso, Recurso<unknown>> = {
  tenants,
  eventos,
  snapshots,
  "snapshots-tenant": snapshotsTenant,
  pagos,
  "contactos-pauta": contactosPauta,
  "gasto-pauta": gastoPauta,
  "pedidos-calcos": pedidosCalcos,
  "movimientos-mrr": movimientosMrr,
  "altas-bajas": altasBajas,
  churn,
  "cohortes-logos": cohortesLogos,
  "cohortes-ingresos": cohortesIngresos,
  trabajos,
  "embudo-pauta": embudoPauta,
};

// hasOwnProperty y no `in`: un `constructor` o un `__proto__` en la URL
// están en el prototipo de cualquier objeto y con `in` pasarían por clave.
export function esClaveRecurso(v: string): v is ClaveRecurso {
  return Object.prototype.hasOwnProperty.call(RECURSOS, v);
}

export function recursoDe(clave: string): Recurso<unknown> | null {
  return esClaveRecurso(clave) ? RECURSOS[clave] : null;
}

export function recursosDe(grupo: GrupoRecurso): Recurso<unknown>[] {
  return Object.values(RECURSOS).filter((r) => r.grupo === grupo);
}

/** El nombre del archivo: fidelli-motors_<recurso>_<YYYY-MM-DD>.csv, con la fecha argentina. */
export function nombreDeArchivo(clave: ClaveRecurso, hoy: string): string {
  return `fidelli-motors_${clave}_${hoy}.csv`;
}

/** Corre la consulta del recurso y arma el CSV. */
export async function exportar(
  recurso: Recurso<unknown>,
  supabase: Cliente,
  parametros: ParametrosExportacion,
): Promise<{ csv: string; filas: number }> {
  const filas = await recurso.consultar(supabase, parametros);
  const encabezados = recurso.columnas.map((c) => c.encabezado);
  const celdas = filas.map((fila) => recurso.columnas.map((c) => c.celda(fila)));
  const exentas = recurso.columnas.map((c) => c.delEquipo === true);
  return { csv: armarCsv(encabezados, celdas, exentas), filas: filas.length };
}
