import { formatearMesAnio, hoyISO } from "@/lib/fechas";
import { esMoneda, type Moneda } from "@/lib/fidelli/mrr";

// ============================================================
// Los contratos de /fidelli/crecimiento (bloque MÉTRICAS 4,
// docs/METRICAS.md § 1): el rango y la moneda que viajan en la URL, los
// tipos de lo que devuelven las seis funciones de 20260925100000 leídos
// con tolerancia, y los formatos de las cifras.
//
// MÓDULO NEUTRO A PROPÓSITO (el mismo caso que lib/series.ts y
// lib/fidelli/mrr.ts): lo importan la page (server component), el gráfico
// de altas y bajas ("use client") y el data room (lib/fidelli/exportar.ts,
// que toma de acá los mismos defaults para que el CSV y la pantalla digan
// lo mismo). Nada de "use client" ni de imports del servidor.
//
// La base devuelve `numeric` como número o como string según el camino
// (PostgREST, jsonb); acá cada campo pasa por su coerción antes de llegar
// a una tabla, como hace lib/fidelli/resumen.ts. Un monto que no está es
// null, nunca 0: en esta pantalla «no hay dato» y «cero» son dos cosas
// distintas (el primer mes sin foto anterior, un mes sin tipo de cambio).
// ============================================================

// ---------- El rango ----------

/**
 * El primer mes con fotos diarias: la reconstrucción arranca el 16/08/2026
 * (docs/METRICAS.md § 5). Antes no hay nada que mostrar, así que es el
 * `desde` por defecto y el que usa el data room.
 */
export const DESDE_DEFAULT = "2026-08";

/** Dólares por defecto, como el gráfico del Resumen: es la moneda del objetivo. */
export const MONEDA_DEFAULT: Moneda = "usd";

export type Rango = {
  /** `YYYY-MM`, inclusive. */
  desde: string;
  /** `YYYY-MM`, inclusive. */
  hasta: string;
  moneda: Moneda;
};

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Los años que cuentan como «un mes» en la URL y en los <input type="month">
 * (CampoMes usa los mismos). Fuera de esta ventana el valor tiene forma de
 * mes pero no es uno que esta base pueda tener: `0000-01` pasa la regex y
 * Postgres lo rechaza («date/time field value out of range») con siete
 * oraciones de error en pantalla, y el input de Chrome ni lo muestra.
 */
export const ANIO_MIN = 2000;
export const ANIO_MAX = 2100;

export function esMes(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = MES.exec(v);
  if (!m) return false;
  const anio = Number(m[1]);
  return anio >= ANIO_MIN && anio <= ANIO_MAX;
}

/** El mes en curso en hora argentina, «2026-09»: el `hasta` por defecto. */
export function mesEnCursoAR(): string {
  return hoyISO().slice(0, 7);
}

/**
 * Lee `?desde=&hasta=&moneda=` de la URL. Un formato inválido (o un año
 * fuera de la ventana) cae al default, no a un error: la URL la puede
 * haber armado alguien a mano. `desde > hasta` se corrige intercambiando,
 * que es lo que la persona quiso decir. Y nada pasa del mes en curso:
 * las fotos y los eventos son de días que ya pasaron, así que un `hasta`
 * futuro no puede traer un dato, pero sí le pide a la base cientos de
 * meses de ceros (con `hasta=2099-12`, 881 filas en churn y en altas, unos
 * 10 segundos); se acota al mes en curso, y `desde` con él para que el
 * rango siga ordenado.
 */
export function leerRango(sp: {
  desde?: string;
  hasta?: string;
  moneda?: string;
}): Rango {
  const actual = mesEnCursoAR();
  let desde = esMes(sp.desde) ? sp.desde : DESDE_DEFAULT;
  let hasta = esMes(sp.hasta) ? sp.hasta : actual;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (hasta > actual) hasta = actual;
  if (desde > actual) desde = actual;
  if (mesesEntre(desde, hasta) > MESES_MAX) desde = sumarMeses(hasta, -(MESES_MAX - 1));
  const moneda: Moneda = esMoneda(sp.moneda) ? sp.moneda : MONEDA_DEFAULT;
  return { desde, hasta, moneda };
}

/**
 * El rango más largo que la pantalla acepta, en meses. Cinco años: más
 * atrás no hay fotos (la historia arranca el 16/08/2026) y las seis tablas
 * de la pantalla dibujan una fila por mes; con `?desde=2000-01` eran 321
 * filas en cada una y el dev server se reiniciaba por memoria al
 * renderizarlas. Un `desde` más viejo se acota a `hasta − 59 meses`, con el
 * mismo criterio del mes futuro: se corrige, no se rechaza (la URL la puede
 * haber armado alguien a mano). La API del data room, en cambio, contesta
 * 400: un archivo con otro rango del pedido es peor que un error.
 */
export const MESES_MAX = 60;

/** Meses calendario entre dos «YYYY-MM», ambos incluidos: («2026-08», «2026-09») → 2. */
export function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1] = desde.slice(0, 7).split("-").map(Number);
  const [a2, m2] = hasta.slice(0, 7).split("-").map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1) + 1;
}

/** «2026-09» → «2026-09-01»: el `p_desde` de las funciones. */
export function primerDiaDelMes(mes: string): string {
  return `${mes}-01`;
}

// Date.UTC(a, m, 0) es el día 0 del mes siguiente, o sea el último de
// este (28, 29, 30 o 31). Aritmética pura de calendario: no depende de la
// zona del proceso.
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** «2026-09» → «2026-09-30»: el `p_hasta` de las funciones. */
export function ultimoDiaDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(diasDelMes(a, m)).padStart(2, "0")}`;
}

/** «2026-11» + 3 → «2027-02». Meses de calendario, con signo. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ---------- Las filas, como las lee la pantalla ----------

type Obj = Record<string, unknown>;

function enteroDe(v: unknown): number {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? 0 : n;
}

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Un `date` llega como «2026-09-01»; si alguna vez llegara con hora se
// recorta al día, que es lo único que un mes necesita.
function mes(v: unknown): string {
  return String(v).slice(0, 10);
}

function objeto(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Obj)
      .map(([k, n]) => [k, enteroDe(n)] as const)
      .filter(([, n]) => n > 0),
  );
}

function filas(v: unknown): Obj[] {
  return Array.isArray(v) ? (v as Obj[]) : [];
}

/**
 * `movimientos_mrr()`: un mes por fila, ascendente (la pantalla invierte).
 * Los montos van en null en dos casos que la pantalla distingue: el primer
 * mes con historia (`sin_foto_anterior`, no hay con qué comparar) y un mes
 * sin tipo de cambio en dólares (`sin_foto_anterior = false` y `mrr_fin`
 * null). `contraccion` y `churn` llegan como magnitudes positivas: el
 * signo lo pone la pantalla.
 */
export type FilaMovimientos = {
  mes: string;
  en_curso: boolean;
  sin_foto_anterior: boolean;
  mrr_inicio: number | null;
  nuevo: number | null;
  reactivacion: number | null;
  expansion: number | null;
  contraccion: number | null;
  churn: number | null;
  ajuste_precio: number | null;
  mrr_fin: number | null;
  neto: number | null;
  /** Fracción (0,12 = 12 %). */
  crecimiento_pct: number | null;
  tenants_inicio: number | null;
  tenants_fin: number;
};

export function leerMovimientos(v: unknown): FilaMovimientos[] {
  return filas(v).map((r) => ({
    mes: mes(r.mes),
    en_curso: r.en_curso === true,
    sin_foto_anterior: r.sin_foto_anterior === true,
    mrr_inicio: numeroONull(r.mrr_inicio),
    nuevo: numeroONull(r.nuevo),
    reactivacion: numeroONull(r.reactivacion),
    expansion: numeroONull(r.expansion),
    contraccion: numeroONull(r.contraccion),
    churn: numeroONull(r.churn),
    ajuste_precio: numeroONull(r.ajuste_precio),
    mrr_fin: numeroONull(r.mrr_fin),
    neto: numeroONull(r.neto),
    crecimiento_pct: numeroONull(r.crecimiento_pct),
    tenants_inicio: numeroONull(r.tenants_inicio),
    tenants_fin: enteroDe(r.tenants_fin),
  }));
}

/** Una fila con movimientos para sumar: tiene foto anterior y tiene montos. */
export function tieneMovimientos(f: FilaMovimientos): boolean {
  return !f.sin_foto_anterior && f.mrr_fin !== null;
}

// ---------- El mes que no cerró ----------

export type Cierre = "en curso" | "sin cierre";

/**
 * Qué chip lleva un mes según la bandera `en_curso` de la base
 * (docs/METRICAS.md § 1 «Mes cerrado»). La vista `snapshots_mensuales` la
 * prende cuando la foto del mes no es la del último día calendario, y eso
 * pasa en dos casos que la pantalla distingue con palabras distintas: el
 * mes en curso («en curso»: todavía no terminó) y un mes pasado al que le
 * falta la foto del último día («sin cierre»: no se inventa el cierre, el
 * dato es el del último día con foto; «en curso» sería mentir sobre el
 * calendario). El mes en curso se marca aunque la bandera venga apagada o
 * no venga (`churn_por_mes` no la devuelve). Null = mes cerrado, sin chip.
 * Es UNA función para que las tres tablas por mes usen el mismo criterio.
 */
export function cierreDelMes(
  mes: string,
  enCurso: boolean,
  mesEnCurso: string,
): Cierre | null {
  if (mes.slice(0, 7) === mesEnCurso) return "en curso";
  return enCurso ? "sin cierre" : null;
}

/** `altas_bajas_por_mes()`: todos los meses del rango, con ceros. */
export type FilaAltasBajas = {
  mes: string;
  altas: number;
  bajas: number;
  reactivaciones: number;
  neto: number;
};

export function leerAltasBajas(v: unknown): FilaAltasBajas[] {
  return filas(v).map((r) => ({
    mes: mes(r.mes),
    altas: enteroDe(r.altas),
    bajas: enteroDe(r.bajas),
    reactivaciones: enteroDe(r.reactivaciones),
    neto: enteroDe(r.neto),
  }));
}

/** `churn_por_mes()`: todos los meses del rango, con ceros y `{}`. */
export type FilaChurn = {
  mes: string;
  tenants_inicio: number | null;
  bajas: number;
  involuntarias: number;
  voluntarias: number;
  /** Solo las claves con conteo > 0. */
  por_motivo: Record<string, number>;
  /** Los valores del enum `origen_tenant` más `sin_origen`; solo las claves con conteo > 0. */
  por_origen: Record<string, number>;
  /** Fracción; null sin foto anterior. */
  churn_pct: number | null;
};

export function leerChurn(v: unknown): FilaChurn[] {
  return filas(v).map((r) => ({
    mes: mes(r.mes),
    tenants_inicio: numeroONull(r.tenants_inicio),
    bajas: enteroDe(r.bajas),
    involuntarias: enteroDe(r.involuntarias),
    voluntarias: enteroDe(r.voluntarias),
    por_motivo: objeto(r.por_motivo),
    por_origen: objeto(r.por_origen),
    churn_pct: numeroONull(r.churn_pct),
  }));
}

/** `cohortes_logos()`: una fila por mes con alguna alta; `mN` null si el mes no cerró. */
export type FilaCohorteLogos = {
  cohorte: string;
  tamano: number;
  activados: number;
  m1: number | null;
  m2: number | null;
  m3: number | null;
  m6: number | null;
  m9: number | null;
  m12: number | null;
};

export const MESES_LOGOS = [1, 2, 3, 6, 9, 12] as const;

export function leerCohortesLogos(v: unknown): FilaCohorteLogos[] {
  return filas(v).map((r) => ({
    cohorte: mes(r.cohorte),
    tamano: enteroDe(r.tamano),
    activados: enteroDe(r.activados),
    m1: numeroONull(r.m1),
    m2: numeroONull(r.m2),
    m3: numeroONull(r.m3),
    m6: numeroONull(r.m6),
    m9: numeroONull(r.m9),
    m12: numeroONull(r.m12),
  }));
}

/** `cohortes_ingresos()`: siempre en USD (la definición neutraliza los ajustes en pesos). */
export type FilaCohorteIngresos = {
  cohorte: string;
  tamano: number;
  mrr_inicial_usd: number | null;
  grr_3: number | null;
  nrr_3: number | null;
  grr_6: number | null;
  nrr_6: number | null;
  grr_12: number | null;
  nrr_12: number | null;
};

export const MESES_INGRESOS = [3, 6, 12] as const;

export function leerCohortesIngresos(v: unknown): FilaCohorteIngresos[] {
  return filas(v).map((r) => ({
    cohorte: mes(r.cohorte),
    tamano: enteroDe(r.tamano),
    mrr_inicial_usd: numeroONull(r.mrr_inicial_usd),
    grr_3: numeroONull(r.grr_3),
    nrr_3: numeroONull(r.nrr_3),
    grr_6: numeroONull(r.grr_6),
    nrr_6: numeroONull(r.nrr_6),
    grr_12: numeroONull(r.grr_12),
    nrr_12: numeroONull(r.nrr_12),
  }));
}

/** `trabajos_por_mes()`: solo los meses con alguna foto. */
export type FilaTrabajos = {
  mes: string;
  en_curso: boolean;
  total: number;
  service: number;
  mecanica: number;
  neumaticos: number;
  autos_que_volvieron: number;
  recordatorios: number;
  escaneos: number;
};

export function leerTrabajos(v: unknown): FilaTrabajos[] {
  return filas(v).map((r) => ({
    mes: mes(r.mes),
    en_curso: r.en_curso === true,
    total: enteroDe(r.total),
    service: enteroDe(r.service),
    mecanica: enteroDe(r.mecanica),
    neumaticos: enteroDe(r.neumaticos),
    autos_que_volvieron: enteroDe(r.autos_que_volvieron),
    recordatorios: enteroDe(r.recordatorios),
    escaneos: enteroDe(r.escaneos),
  }));
}

// ---------- Formatos ----------

/** La unidad que va en el encabezado de las columnas monetarias. */
export const UNIDAD: Record<Moneda, string> = { usd: "US$", ars: "ARS" };

// Hasta dos decimales y ninguno de relleno: en pesos los abonos son enteros
// y salen «125.875»; en dólares la conversión trae centavos («82,27») y se
// muestran, porque la tabla de movimientos existe para que la identidad
// cierre fila por fila y con siete términos redondeados a entero no
// cerraría. Mismo formato que `usd()` de lib/fidelli/pauta.ts.
const CIFRA = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const PCT_1 = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const PCT_0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** El menos tipográfico, el mismo de la franja del Resumen. */
export const MENOS = "−";

/** «125.875», «82,27», «—» sin dato. Sin unidad: la unidad va en el encabezado. */
export function cifra(n: number | null): string {
  return n == null ? "—" : CIFRA.format(n);
}

/** «+98.000», «−120», «0»: para lo que tiene signo (ajuste de lista, neto). */
export function cifraConSigno(n: number | null): string {
  if (n == null) return "—";
  if (n > 0) return `+${CIFRA.format(n)}`;
  if (n < 0) return `${MENOS}${CIFRA.format(Math.abs(n))}`;
  return "0";
}

/** Una magnitud que resta (contracción, churn): «−120»; cero queda «0». */
export function cifraNegativa(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `${MENOS}${CIFRA.format(n)}` : "0";
}

/** «US$ 1.240», «ARS 1.240»: la unidad delante, para la prosa. */
export function monto(n: number, moneda: Moneda): string {
  return `${UNIDAD[moneda]} ${CIFRA.format(n)}`;
}

/** «+US$ 1.240», «−US$ 120», «US$ 0». */
export function montoConSigno(n: number, moneda: Moneda): string {
  if (n > 0) return `+${monto(n, moneda)}`;
  if (n < 0) return `${MENOS}${monto(Math.abs(n), moneda)}`;
  return monto(0, moneda);
}

export function entero(n: number): string {
  return ENTERO.format(n);
}

/** 0,12 → «+12,0 %»; −0,035 → «−3,5 %»; null → «—». */
export function porcentajeConSigno(fraccion: number | null): string {
  if (fraccion == null) return "—";
  const pct = fraccion * 100;
  const texto = `${PCT_1.format(Math.abs(pct))} %`;
  if (pct > 0) return `+${texto}`;
  if (pct < 0) return `${MENOS}${texto}`;
  return texto;
}

/** 0,75 → «75 %»; null → «—». Sin decimales: es la lectura de una cohorte, no una factura. */
export function porcentajeEntero(fraccion: number | null): string {
  return fraccion == null ? "—" : `${PCT_0.format(fraccion * 100)} %`;
}

/** «ago 2026», «sept 2026»: el rótulo de un mes en las tablas. */
export function mesCorto(mes: string): string {
  return formatearMesAnio(primerDiaDelMes(mes.slice(0, 7)));
}

// «diciembre de 2026»: el mes escrito entero, para la prosa. Por partes y
// sin timeZone, como toda fecha-calendario de lib/fechas.ts.
const MES_LARGO = new Intl.DateTimeFormat("es-AR", { month: "long" });

export function mesLargo(mes: string): string {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return `${MES_LARGO.format(new Date(a, m - 1, 1))} de ${a}`;
}
