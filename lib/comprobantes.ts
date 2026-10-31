// ============================================================
// Comprobantes recibidos: las reglas que comparten las pantallas, las
// acciones y la regresión. La foto o el PDF de una factura que el taller
// RECIBE, para cargarla como egreso sin tipear.
//
// Reusa las reglas de archivo de los adjuntos (mismo bucket privado, mismo
// tope de 2 MB, mismos tres formatos, misma lectura de bytes por cabecera):
// lo único propio es la carpeta de DOS partes (<tenant>/<uuid>.<ext>, sin
// trabajo adentro) y la forma de lo que leyó la IA.
//
// No importa nada del servidor ni del navegador: lo usan la pantalla, las
// acciones y la regresión (que lo compila suelto).
// ============================================================

import {
  ADJUNTO_MAX_BYTES,
  EXTENSION_DE_MIME,
  MIMES_ADJUNTO,
  type MimeAdjunto,
} from "@/lib/adjuntos";

/** 2 MB, PDF / JPEG / PNG: lo mismo que un adjunto. */
export const COMPROBANTE_MAX_BYTES = ADJUNTO_MAX_BYTES;
export const MIMES_COMPROBANTE = MIMES_ADJUNTO;
export type MimeComprobante = MimeAdjunto;

/** La dirección de la factura. R1 solo hace la compra; la venta es R2. */
export const DIRECCIONES_COMPROBANTE = ["compra", "venta"] as const;
export type DireccionComprobante = (typeof DIRECCIONES_COMPROBANTE)[number];

// ---------- La ruta en el bucket ----------
// <lubricentro_id>/<uuid>.<ext>. Dos partes: el comprobante es del tenant,
// no cuelga de un trabajo. El servidor la arma; el navegador no elige ni la
// carpeta ni el nombre. Espejo del CHECK `comprobante_ruta_valida`.
export function rutaDeComprobante(
  lubricentroId: string,
  uuid: string,
  mime: MimeComprobante,
): string {
  return `${lubricentroId}/${uuid}.${EXTENSION_DE_MIME[mime]}`;
}

const RUTA_COMPROBANTE =
  /^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/;

/** La extensión de una ruta que es de ESTE tenant, o null. Lo que vuelve
 *  del navegador se valida con esto antes de leer un solo byte del bucket. */
export function extensionDeRutaComprobante(
  ruta: string,
  lubricentroId: string,
): "pdf" | "jpg" | "png" | null {
  if (!RUTA_COMPROBANTE.test(ruta)) return null;
  if (ruta.split("/")[0] !== lubricentroId) return null;
  return ruta.slice(-3) as "pdf" | "jpg" | "png";
}

// ---------- Lo que leyó la IA ----------
// Una PROPUESTA. El dueño la corrige antes de confirmar; el egreso nace con
// los valores revisados, no con estos. Espejo de lo que guarda `extraido` y
// de lo que devuelve el extractor.
export type ItemComprobante = {
  descripcion: string;
  cantidad: number | null;
  importe: number | null;
};

export type ComprobanteExtraido = {
  /** "Factura A" / "Factura B" / "Ticket" / … — texto libre, como vino. */
  tipo: string | null;
  /** La razón social del emisor (el proveedor). */
  razon_social: string | null;
  /** CUIT en once números pelados, o null. */
  cuit: string | null;
  /** El número del comprobante, como figura. */
  numero: string | null;
  /** La fecha del comprobante en ISO (yyyy-mm-dd), o null. */
  fecha: string | null;
  neto: number | null;
  iva: number | null;
  total: number | null;
  items: ItemComprobante[];
  /** Lo que la IA no pudo leer con seguridad, para que la persona lo mire. */
  advertencias: string[];
};

export const COMPROBANTE_EXTRAIDO_VACIO: ComprobanteExtraido = {
  tipo: null,
  razon_social: null,
  cuit: null,
  numero: null,
  fecha: null,
  neto: null,
  iva: null,
  total: null,
  items: [],
  advertencias: [],
};

/** Normaliza lo que vino (de la IA o de `extraido`) a la forma completa:
 *  tolera claves faltantes o tipos raros sin romper la pantalla. */
export function normalizarExtraido(valor: unknown): ComprobanteExtraido {
  const v = (valor ?? {}) as Record<string, unknown>;
  const texto = (x: unknown): string | null => {
    const s = typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
    return s === "" ? null : s;
  };
  const numero = (x: unknown): number | null => {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(/\./g, "").replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const items = Array.isArray(v.items)
    ? v.items.slice(0, 50).map((i) => {
        const it = (i ?? {}) as Record<string, unknown>;
        return {
          descripcion: texto(it.descripcion) ?? "",
          cantidad: numero(it.cantidad),
          importe: numero(it.importe),
        };
      })
    : [];
  const advertencias = Array.isArray(v.advertencias)
    ? v.advertencias.map((a) => texto(a)).filter((a): a is string => a !== null)
    : [];
  return {
    tipo: texto(v.tipo),
    razon_social: texto(v.razon_social),
    cuit: normalizarCuit(texto(v.cuit)),
    numero: texto(v.numero),
    fecha: fechaIso(texto(v.fecha)),
    neto: numero(v.neto),
    iva: numero(v.iva),
    total: numero(v.total),
    items,
    advertencias,
  };
}

/** Once números pelados, como clientes.cuit. Null si no llega a once. */
export function normalizarCuit(valor: string | null): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

/** yyyy-mm-dd o null. Acepta dd/mm/aaaa (lo más común en una factura AR). */
export function fechaIso(valor: string | null): string | null {
  if (!valor) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (iso) return valor;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(valor);
  if (dmy) {
    const [, d, m, a] = dmy;
    const anio = a.length === 2 ? `20${a}` : a;
    return `${anio}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// ---------- De lo extraído al egreso ----------
// Lo que la pantalla prellena. El dueño lo corrige: son sugerencias.

/** El concepto que se propone para el egreso: el proveedor y, si está, el
 *  número de comprobante. Nunca vacío si hay algo que decir. */
export function conceptoSugerido(e: ComprobanteExtraido): string {
  const partes: string[] = [];
  if (e.razon_social) partes.push(e.razon_social);
  if (e.numero) partes.push(`N° ${e.numero}`);
  return partes.join(" — ");
}

/** El monto que se propone: el total leído, o null (que la persona escriba). */
export function montoSugerido(e: ComprobanteExtraido): number | null {
  return e.total;
}

/** La fecha que se propone: la del comprobante, o la de hoy. */
export function fechaSugerida(e: ComprobanteExtraido, hoy: string): string {
  return e.fecha ?? hoy;
}
