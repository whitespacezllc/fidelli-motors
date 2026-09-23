// ============================================================
// Los catálogos y contratos de la pauta (bloque MÉTRICAS 3,
// docs/METRICAS.md § 1). ESPEJOS de los enums de 20260924101000: la fuente
// de verdad es SQL.
//
// Esto NO es un CRM. Un contacto son cinco campos y tres fechas; lo que
// vive acá son las etiquetas para pintarlos y los tipos de lo que devuelve
// la base. Nada de etapas, responsables ni seguimientos.
// ============================================================

export type CanalPauta = "meta" | "google" | "otro";

export const CANALES: readonly { clave: CanalPauta; nombre: string }[] = [
  { clave: "meta", nombre: "Meta" },
  { clave: "google", nombre: "Google" },
  { clave: "otro", nombre: "Otro" },
];

export function esCanalPauta(v: unknown): v is CanalPauta {
  return v === "meta" || v === "google" || v === "otro";
}

export type OrigenMeta = "instagram" | "messenger" | "whatsapp";

export const ORIGENES_META: readonly { clave: OrigenMeta; nombre: string }[] = [
  { clave: "instagram", nombre: "Instagram" },
  { clave: "messenger", nombre: "Messenger" },
  { clave: "whatsapp", nombre: "WhatsApp" },
];

export function esOrigenMeta(v: unknown): v is OrigenMeta {
  return v === "instagram" || v === "messenger" || v === "whatsapp";
}

export type MotivoPerdida =
  | "precio"
  | "no_responde"
  | "ya_tiene_sistema"
  | "no_factura"
  | "no_es_dueno"
  | "otro";

export const MOTIVOS_PERDIDA: readonly { clave: MotivoPerdida; nombre: string }[] = [
  { clave: "precio", nombre: "Precio" },
  { clave: "no_responde", nombre: "No responde" },
  { clave: "ya_tiene_sistema", nombre: "Ya tiene sistema" },
  { clave: "no_factura", nombre: "No factura" },
  { clave: "no_es_dueno", nombre: "No es el dueño" },
  { clave: "otro", nombre: "Otro" },
];

export function esMotivoPerdida(v: unknown): v is MotivoPerdida {
  return MOTIVOS_PERDIDA.some((m) => m.clave === v);
}

export function etiquetaMotivo(m: MotivoPerdida | null): string | null {
  return MOTIVOS_PERDIDA.find((x) => x.clave === m)?.nombre ?? null;
}

// ---------- El contacto, como lo lee la pantalla ----------

export type Contacto = {
  id: string;
  fecha: string;
  canal: CanalPauta;
  origen: OrigenMeta | null;
  telefono: string | null;
  demo_at: string | null;
  cierre_at: string | null;
  lubricentro_id: string | null;
  perdida_at: string | null;
  motivo_perdida: MotivoPerdida | null;
  /** El nombre del tenant que cerró, si cerró. */
  tenant_nombre: string | null;
};

export type EstadoContacto = "abierto" | "demo" | "cerrado" | "perdido";

export function estadoDe(c: Pick<Contacto, "demo_at" | "cierre_at" | "perdida_at">): EstadoContacto {
  if (c.cierre_at) return "cerrado";
  if (c.perdida_at) return "perdido";
  if (c.demo_at) return "demo";
  return "abierto";
}

export const ETIQUETA_ESTADO_CONTACTO: Record<EstadoContacto, string> = {
  abierto: "Abierto",
  demo: "Demo enviada",
  cerrado: "Cerró",
  perdido: "Perdido",
};

/** El filtro de la lista, en la URL: ?estado=abiertos|demo|cerrados|perdidos */
export type FiltroEstado = "todos" | "abiertos" | "demo" | "cerrados" | "perdidos";

export function esFiltroEstado(v: string | undefined): v is Exclude<FiltroEstado, "todos"> {
  return v === "abiertos" || v === "demo" || v === "cerrados" || v === "perdidos";
}

const ESTADO_DEL_FILTRO: Record<Exclude<FiltroEstado, "todos">, EstadoContacto> = {
  abiertos: "abierto",
  demo: "demo",
  cerrados: "cerrado",
  perdidos: "perdido",
};

export function pasaFiltro(c: Contacto, filtro: FiltroEstado, canal: CanalFiltro): boolean {
  if (filtro !== "todos" && estadoDe(c) !== ESTADO_DEL_FILTRO[filtro]) return false;
  if (canal !== "todos" && c.canal !== canal) return false;
  return true;
}

/** ?canal=todos|meta|google (también otro). */
export type CanalFiltro = "todos" | CanalPauta;

export function esCanalFiltro(v: string | undefined): v is CanalFiltro {
  return v === "todos" || esCanalPauta(v);
}

export type Agrupar = "semana" | "mes";

export function esAgrupar(v: string | undefined): v is Agrupar {
  return v === "semana" || v === "mes";
}

// ---------- El embudo ----------

export type FilaEmbudo = {
  periodo: string;
  canal: CanalPauta | null;
  contactos: number;
  demos: number;
  cierres: number;
  perdidos: number;
  abiertos: number;
  tasa_demo: number | null;
  tasa_cierre: number | null;
  ciclo_mediana_dias: number | null;
  cierres_periodo: number;
  gasto_usd: number | null;
  cac_usd: number | null;
};

type Obj = Record<string, unknown>;

function entero(v: unknown): number {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? 0 : n;
}

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function leerEmbudo(v: unknown): FilaEmbudo[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const r = x as Obj;
    return {
      periodo: String(r.periodo),
      canal: esCanalPauta(r.canal) ? r.canal : null,
      contactos: entero(r.contactos),
      demos: entero(r.demos),
      cierres: entero(r.cierres),
      perdidos: entero(r.perdidos),
      abiertos: entero(r.abiertos),
      tasa_demo: numeroONull(r.tasa_demo),
      tasa_cierre: numeroONull(r.tasa_cierre),
      ciclo_mediana_dias: numeroONull(r.ciclo_mediana_dias),
      cierres_periodo: entero(r.cierres_periodo),
      gasto_usd: numeroONull(r.gasto_usd),
      cac_usd: numeroONull(r.cac_usd),
    };
  });
}

/** La oración del Resumen: `embudo_pauta_mes_actual()`. */
export type ResumenPauta = {
  contactos: number;
  demos: number;
  cierres: number;
  tasa_cierre: number | null;
  cierres_periodo: number;
  gasto_usd: number | null;
  cac_usd: number | null;
  mes_anterior_contactos: number;
  mes_anterior_tasa_cierre: number | null;
};

export function leerResumenPauta(v: unknown): ResumenPauta {
  const r = (v && typeof v === "object" ? v : {}) as Obj;
  return {
    contactos: entero(r.contactos),
    demos: entero(r.demos),
    cierres: entero(r.cierres),
    tasa_cierre: numeroONull(r.tasa_cierre),
    cierres_periodo: entero(r.cierres_periodo),
    gasto_usd: numeroONull(r.gasto_usd),
    cac_usd: numeroONull(r.cac_usd),
    mes_anterior_contactos: entero(r.mes_anterior_contactos),
    mes_anterior_tasa_cierre: numeroONull(r.mes_anterior_tasa_cierre),
  };
}

/** Con menos de estos cierres el CAC va en gris con «pocos casos». */
export const POCOS_CASOS = 3;

// ---------- Formatos ----------

const PORCENTAJE = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 0.065 → «6,5 %». Null → «—». */
export function porcentajeDe(fraccion: number | null): string {
  if (fraccion == null) return "—";
  return `${PORCENTAJE.format(fraccion * 100)} %`;
}

const USD = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function usd(n: number | null): string {
  if (n == null) return "—";
  return `US$ ${USD.format(n)}`;
}

// ---------- Semanas (lunes) ----------

// Aritmética pura de calendario (Date.UTC): no depende de la zona del proceso.
function aDias(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

function deDias(dias: number): string {
  return new Date(dias * 86_400_000).toISOString().slice(0, 10);
}

/** El lunes de la semana ISO a la que pertenece una fecha. */
export function lunesDe(iso: string): string {
  const dias = aDias(iso);
  // 1970-01-01 fue jueves: (dias + 3) % 7 = 0 los lunes.
  const desdeLunes = (((dias + 3) % 7) + 7) % 7;
  return deDias(dias - desdeLunes);
}

/** Los últimos `n` lunes, del más nuevo al más viejo, empezando por la semana de `hoy`. */
export function ultimosLunes(hoy: string, n: number): string[] {
  const primero = aDias(lunesDe(hoy));
  return Array.from({ length: n }, (_, i) => deDias(primero - 7 * i));
}

export function sumarDiasIso(iso: string, dias: number): string {
  return deDias(aDias(iso) + dias);
}

/** El primer día del mes que está `n` meses antes del de `hoy` (0 = este mes). */
export function primerDiaDelMesHace(hoy: string, n: number): string {
  const [a, m] = hoy.slice(0, 10).split("-").map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
