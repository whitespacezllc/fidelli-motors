// ============================================================
// Pedidos de calcos: lo que comparten la ficha y la cola de /fidelli.
//
// El pedido es `encargos_calcos` (20261003120000): nace pagado (los
// incluidos del alta) o sin pagar (lo que compra el tenant), y lo movemos
// nosotros hasta «entregado», que es el único estado que escribe en el
// libro de entregas (`pedidos_calcos`). Las transiciones las valida la
// base (avanzar_encargo_calcos); acá solo se decide qué botón se ofrece.
// ============================================================

/**
 * La comisión de Cresium sobre lo acreditado: 0,8 % + IVA (21 %) = 0,968 %.
 * La base repite el número en `comision_cresium()`, que es la que lo congela
 * en `comision_estimada` al crear el encargo: cambian en el mismo commit
 * (lo compara scripts/regresion-calcos.mjs).
 */
export const COMISION_CRESIUM = 0.00968;

/** 1 m² de vinilo son 200 calcos de 5 × 8 cm. El m² es costo: solo en /fidelli. */
export const CALCOS_POR_M2 = 200;

/** El diseño del calco: PNG o PDF, hasta 10 MB (lo repite el bucket `calcos`). */
export const DISENO_MAX_BYTES = 10 * 1024 * 1024;
export const DISENO_TIPOS = ["image/png", "application/pdf"] as const;

export const ESTADOS_ENCARGO = [
  "pendiente_pago",
  "pagado",
  "en_produccion",
  "enviado",
  "listo_retiro",
  "entregado",
  "vencido",
  "cancelado",
] as const;

export type EstadoEncargo = (typeof ESTADOS_ENCARGO)[number];
export type EntregaCalcos = "retiro" | "envio";

export function esEstadoEncargo(v: unknown): v is EstadoEncargo {
  return (ESTADOS_ENCARGO as readonly string[]).includes(String(v));
}

export const ETIQUETA_ESTADO: Record<EstadoEncargo, string> = {
  pendiente_pago: "Sin pagar",
  pagado: "Pagado",
  en_produccion: "En producción",
  enviado: "Enviado",
  listo_retiro: "Listo para retirar",
  entregado: "Entregado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

/** Los que todavía nos piden algo: es lo que la cola muestra al abrirla. */
export const ESTADOS_ABIERTOS: readonly EstadoEncargo[] = [
  "pagado",
  "en_produccion",
  "enviado",
  "listo_retiro",
  "pendiente_pago",
];

/** La fila de encargos_calcos_admin(): el pedido con su costo y su ganancia. */
export type EncargoAdmin = {
  orden: number;
  id: string;
  lubricentro_id: string;
  lubricentro_nombre: string;
  numero: number;
  incluido: boolean;
  pack_codigo: string | null;
  cantidad: number;
  rediseno: boolean;
  rediseno_pedido: string | null;
  diseno_version: number | null;
  entrega: EntregaCalcos;
  direccion: string | null;
  localidad: string | null;
  codigo_postal: string | null;
  telefono_contacto: string | null;
  monto_total: number;
  costo_estimado: number;
  comision_estimada: number;
  ganancia: number;
  estado: EstadoEncargo;
  created_at: string;
  pagado_at: string | null;
  produccion_at: string | null;
  enviado_at: string | null;
  entregado_at: string | null;
  transportista: string | null;
  seguimiento: string | null;
  nota: string | null;
  dias_habiles: number | null;
  atrasado: boolean;
};

type Obj = Record<string, unknown>;

function texto(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** PostgREST devuelve los numeric como le parece: cada número pasa por acá. */
export function leerEncargos(v: unknown): EncargoAdmin[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Obj)
    .filter((x) => typeof x.id === "string" && esEstadoEncargo(x.estado))
    .map((x): EncargoAdmin => ({
      orden: Number(x.orden ?? 0),
      id: x.id as string,
      lubricentro_id: String(x.lubricentro_id),
      lubricentro_nombre: String(x.lubricentro_nombre ?? ""),
      numero: Number(x.numero),
      incluido: x.incluido === true,
      pack_codigo: texto(x.pack_codigo),
      cantidad: Number(x.cantidad),
      rediseno: x.rediseno === true,
      rediseno_pedido: texto(x.rediseno_pedido),
      diseno_version: x.diseno_version == null ? null : Number(x.diseno_version),
      entrega: x.entrega === "envio" ? "envio" : "retiro",
      direccion: texto(x.direccion),
      localidad: texto(x.localidad),
      codigo_postal: texto(x.codigo_postal),
      telefono_contacto: texto(x.telefono_contacto),
      monto_total: Number(x.monto_total ?? 0),
      costo_estimado: Number(x.costo_estimado ?? 0),
      comision_estimada: Number(x.comision_estimada ?? 0),
      ganancia: Number(x.ganancia ?? 0),
      estado: x.estado as EstadoEncargo,
      created_at: String(x.created_at),
      pagado_at: texto(x.pagado_at),
      produccion_at: texto(x.produccion_at),
      enviado_at: texto(x.enviado_at),
      entregado_at: texto(x.entregado_at),
      transportista: texto(x.transportista),
      seguimiento: texto(x.seguimiento),
      nota: texto(x.nota),
      dias_habiles: x.dias_habiles == null ? null : Number(x.dias_habiles),
      atrasado: x.atrasado === true,
    }))
    .sort((a, b) => a.orden - b.orden);
}

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const M2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** «#0012»: el número del pedido, como se lo nombra por WhatsApp. */
export function numeroDeEncargo(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

/** «400 calcos · rediseño · envío a domicilio». */
export function queLleva(e: {
  cantidad: number;
  incluido: boolean;
  rediseno: boolean;
  entrega: EntregaCalcos;
}): string {
  return [
    `${ENTERO.format(e.cantidad)} calcos`,
    e.incluido ? "incluidos en el plan" : null,
    e.rediseno ? "rediseño" : null,
    e.entrega === "envio" ? "envío a domicilio" : "retiro",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** «2 m²». Solo para /fidelli: es el dato con el que se cotiza en una gráfica. */
export function metrosCuadrados(cantidad: number): string {
  return `${M2.format(cantidad / CALCOS_POR_M2)} m²`;
}

/** Cuántos calcos incluye el alta según el plan: 400 en Ultra, 200 en el resto. */
export function calcosIncluidosDelPlan(planNombre: string | null | undefined): number {
  return (planNombre ?? "").trim().toLowerCase() === "ultra" ? 400 : 200;
}
