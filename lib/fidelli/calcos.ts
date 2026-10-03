// ============================================================
// Pedidos de calcos, del lado de /fidelli: el costo, la ganancia y el m².
//
// ⚠ ESTE MÓDULO NO LO IMPORTA NINGUNA PANTALLA DEL TENANT. El m² es el dato
// con el que el tenant iría a cotizar a una gráfica, y el costo es nuestro
// margen: los dos viven acá y en ningún módulo que una pantalla del panel
// pueda arrastrar a su bundle. Lo que comparten las dos superficies está en
// lib/calcos.ts. Lo vigila scripts/regresion-calcos-tenant.mjs, que recorre
// los imports de Mi cuenta → Calcos y de sus mails.
// ============================================================
import {
  esEstadoEncargo,
  type EntregaCalcos,
  type EstadoEncargo,
} from "@/lib/calcos";
import { telefonoWhatsapp } from "@/lib/contacto";
import { cantidadDicha, semanasDichas } from "@/lib/stock-calcos";

/** 1 m² de vinilo son 200 calcos de 5 × 8 cm. Es costo: solo en /fidelli. */
export const CALCOS_POR_M2 = 200;

/** El diseño del calco: PNG o PDF, hasta 10 MB (lo repite el bucket `calcos`). */
export const DISENO_MAX_BYTES = 10 * 1024 * 1024;
export const DISENO_TIPOS = ["image/png", "application/pdf"] as const;

/** Cómo nombramos NOSOTROS cada estado. El tenant tiene sus propias palabras. */
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

const M2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** «2 m²». Es el dato con el que se cotiza en una gráfica. */
export function metrosCuadrados(cantidad: number): string {
  return `${M2.format(cantidad / CALCOS_POR_M2)} m²`;
}

/** Cuántos calcos incluye el alta según el plan: 400 en Ultra, 200 en el resto. */
export function calcosIncluidosDelPlan(planNombre: string | null | undefined): number {
  return (planNombre ?? "").trim().toLowerCase() === "ultra" ? 400 : 200;
}

// ---------- El catálogo, con su costo (catalogo_calcos_admin) ----------

export type FilaCatalogoCalcos = {
  codigo: string;
  tipo: "pack" | "extra";
  cantidad: number | null;
  precio: number;
  costo: number;
  activo: boolean;
  orden: number;
};

export function leerCatalogoCalcos(v: unknown): FilaCatalogoCalcos[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Obj)
    .filter((x) => typeof x.codigo === "string")
    .map((x): FilaCatalogoCalcos => ({
      codigo: x.codigo as string,
      tipo: x.tipo === "pack" ? "pack" : "extra",
      cantidad: x.cantidad == null ? null : Number(x.cantidad),
      precio: Number(x.precio_ars ?? 0),
      costo: Number(x.costo_ars ?? 0),
      activo: x.activo === true,
      orden: Number(x.orden ?? 0),
    }))
    .sort((a, b) => a.orden - b.orden);
}

/** Cómo se llama cada fila del catálogo en la pantalla de precios. */
export function nombreDelCatalogo(f: { codigo: string; cantidad: number | null }): string {
  if (f.cantidad != null) return `Pack de ${new Intl.NumberFormat("es-AR").format(f.cantidad)}`;
  if (f.codigo === "rediseno") return "Rediseño";
  if (f.codigo === "envio") return "Envío a domicilio";
  return f.codigo;
}

// ---------- Los que se quedan sin calcos (calcos_por_agotarse) ----------
// La lista de arriba de /fidelli/calcos: menos de 3 semanas de cobertura y
// sin un pedido abierto. La regla es de la base; acá se lee y se arma el
// WhatsApp.

export type PorAgotarse = {
  lubricentro_id: string;
  nombre: string;
  slug: string;
  stock: number;
  /** Autos nuevos por semana. */
  ritmo: number | null;
  semanas: number | null;
  /** Si la cuenta parte de un recuento del dueño, cuándo fue. */
  baseRecuentoAt: string | null;
  telefono: string | null;
  ownerNombre: string | null;
};

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function leerPorAgotarse(v: unknown): PorAgotarse[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Obj)
    .filter((x) => typeof x.lubricentro_id === "string")
    .map((x): PorAgotarse => ({
      lubricentro_id: x.lubricentro_id as string,
      nombre: String(x.nombre ?? ""),
      slug: String(x.slug ?? ""),
      stock: Number(x.stock_estimado ?? 0),
      ritmo: numeroONull(x.ritmo_semanal),
      semanas: numeroONull(x.semanas_cobertura),
      baseRecuentoAt: texto(x.base_recuento_at),
      telefono: texto(x.telefono),
      ownerNombre: texto(x.owner_nombre),
    }));
}

/**
 * El WhatsApp al lubricentro, ya armado. Null cuando no hay a quién
 * escribirle: la pantalla muestra «Sin teléfono cargado» en vez de un botón
 * que abre wa.me/null.
 *
 * Se saluda al owner por su nombre; si no hay, la marca sirve igual. Y ni
 * una palabra de costo: es un mensaje para el dueño.
 */
export function whatsappPorCalcos(f: PorAgotarse): string | null {
  const numero = f.telefono ? telefonoWhatsapp(f.telefono) : null;
  if (!numero) return null;

  const nombre = f.ownerNombre?.trim() || f.nombre;
  const quedan =
    f.stock > 0
      ? `según nuestra cuenta te quedan unas ${cantidadDicha(f.stock)} calcos` +
        (f.semanas != null ? `, que alcanzan para ${semanasDichas(f.semanas)}` : "")
      : "según nuestra cuenta ya no te quedan calcos";
  const mensaje =
    `Hola ${nombre}! Te escribo de Fidelli Motors: ${quedan}. ` +
    "Producirlas y enviarlas tarda hasta 2 semanas, así que conviene pedirlas ahora. " +
    "Las pedís desde Mi cuenta → Calcos en el panel, o si preferís lo vemos por acá.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
