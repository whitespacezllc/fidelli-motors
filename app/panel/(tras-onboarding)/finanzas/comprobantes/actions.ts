"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { sesionParaEscribir } from "@/lib/auth/session";
import {
  COMPROBANTE_MAX_BYTES,
  extensionDeRutaComprobante,
  normalizarExtraido,
  rutaDeComprobante,
  type ComprobanteExtraido,
} from "@/lib/comprobantes";
import {
  EXTENSION_DE_MIME,
  MENSAJE_FORMATO,
  esMimeAdjunto,
  limpiarNombre,
  mensajePesoExcedido,
  mimePorCabecera,
} from "@/lib/adjuntos";
import { extractorComprobante } from "@/lib/comprobantes/extractor";
import type { MedioPago } from "@/lib/finanzas";

const NO_SE_PUDO = "No se pudo cargar el comprobante. Revisá la conexión y probá de nuevo.";
const MODULO_OFF = "Contable no está activo en tu cuenta. Escribinos si lo querés activar.";

export type SubidaDeComprobante = { ruta: string; token: string } | { error: string };
export type ResultadoRegistro =
  | { id: string; extraido: ComprobanteExtraido; leido: boolean }
  | { error: string };
export type ResultadoComprobante = { error?: string; id?: string };

function revalidar() {
  revalidatePath("/panel/finanzas/comprobantes");
  revalidatePath("/panel/finanzas");
}

// ---------- 1 · Preparar la subida ----------
// El servidor firma la URL de subida y arma la ruta con el tenant de la
// sesión; el navegador sube directo al bucket. Igual que un adjunto, pero
// la carpeta es solo el tenant (el comprobante no cuelga de un trabajo).
export async function prepararSubidaComprobante(datos: {
  mime: string;
  bytes: number;
}): Promise<SubidaDeComprobante> {
  const sesion = await sesionParaEscribir();

  if (!esMimeAdjunto(datos.mime)) return { error: MENSAJE_FORMATO };
  if (!Number.isFinite(datos.bytes) || datos.bytes <= 0) {
    return { error: "Ese archivo está vacío. Elegilo de nuevo." };
  }
  if (datos.bytes > COMPROBANTE_MAX_BYTES) {
    return { error: mensajePesoExcedido(datos.bytes) };
  }

  const supabase = await createClient();
  const ruta = rutaDeComprobante(sesion.lubricentroId, crypto.randomUUID(), datos.mime);
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUploadUrl(ruta);
  if (error || !data) {
    return { error: "No se pudo preparar la subida. Probá de nuevo en un momento." };
  }
  return { ruta, token: data.token };
}

// ---------- 2 · Registrar y leer con IA ----------
// Valida los BYTES de lo que llegó (no la extensión ni el content-type que
// declaró el navegador), crea el comprobante sin_revisar, y en el mismo
// viaje lo lee con el extractor y guarda la propuesta. Si la lectura falla,
// el comprobante igual queda cargado para completarlo a mano.
export async function registrarComprobante(datos: {
  ruta: string;
  nombre: string;
}): Promise<ResultadoRegistro> {
  const sesion = await sesionParaEscribir();

  const extension = extensionDeRutaComprobante(datos.ruta, sesion.lubricentroId);
  if (!extension) return { error: NO_SE_PUDO };

  const supabase = await createClient();
  const bucket = supabase.storage.from("comprobantes");

  const { data: archivo, error: errorDescarga } = await bucket.download(datos.ruta);
  if (errorDescarga || !archivo) {
    return { error: "El archivo no llegó a subirse. Revisá la conexión y probá de nuevo." };
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const mime = mimePorCabecera(bytes.slice(0, 8));
  if (!mime || EXTENSION_DE_MIME[mime] !== extension) {
    await bucket.remove([datos.ruta]);
    return { error: MENSAJE_FORMATO };
  }
  if (bytes.byteLength > COMPROBANTE_MAX_BYTES) {
    await bucket.remove([datos.ruta]);
    return { error: mensajePesoExcedido(bytes.byteLength) };
  }

  const { data: id, error } = await supabase.rpc("registrar_comprobante", {
    p_ruta: datos.ruta,
    p_nombre: limpiarNombre(datos.nombre),
    p_mime: mime,
    p_bytes: bytes.byteLength,
    p_direccion: "compra",
  });
  if (error || !id) {
    await bucket.remove([datos.ruta]);
    return { error: error?.code === "42501" ? MODULO_OFF : NO_SE_PUDO };
  }

  // La lectura por IA. Si falla, el comprobante queda cargado y se completa
  // a mano: no se pierde la subida por una lectura que no salió.
  let extraido = normalizarExtraido({});
  let leido = false;
  try {
    extraido = await extractorComprobante().extraer({ bytes, mime });
    await supabase.rpc("guardar_extraccion_comprobante", {
      p_id: id as string,
      p_extraido: extraido as unknown as Json,
    });
    leido = true;
  } catch {
    // Silencioso a propósito: la pantalla avisa "no pudimos leerlo,
    // cargalo a mano" con `leido=false`.
  }

  revalidar();
  return { id: id as string, extraido, leido };
}

// ---------- 3 · Confirmar: nace el egreso ----------
export async function confirmarComprobante(datos: {
  id: string;
  sucursalId: string;
  monto: number;
  concepto: string;
  medio: MedioPago;
  fecha: string;
}): Promise<ResultadoComprobante> {
  if (!datos.sucursalId) return { error: "Elegí la sucursal." };
  if (datos.concepto.trim().length < 2) {
    return { error: "Escribí qué salió, aunque sea en dos palabras." };
  }
  if (!Number.isFinite(datos.monto) || datos.monto < 0) {
    return { error: "Revisá el monto: tiene que ser 0 o más." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirmar_comprobante", {
    p_id: datos.id,
    p_sucursal_id: datos.sucursalId,
    p_monto: datos.monto,
    p_concepto: datos.concepto.trim(),
    p_medio: datos.medio,
    p_fecha: datos.fecha,
  });

  if (error) {
    if (error.code === "42501") return { error: MODULO_OFF };
    if (/comprobante_no_pendiente/.test(error.message)) {
      return { error: "Este comprobante ya se cargó o se descartó. Recargá la pantalla." };
    }
    if (/sin_concepto/.test(error.message)) return { error: "Escribí qué salió, aunque sea en dos palabras." };
    if (/monto_invalido/.test(error.message)) return { error: "Revisá el monto: tiene que ser 0 o más." };
    return { error: "No se pudo cargar el egreso. Probá de nuevo." };
  }

  revalidar();
  return { id: data as string };
}

// ---------- 4 · Descartar ----------
export async function descartarComprobante(
  id: string,
  motivo: string,
): Promise<ResultadoComprobante> {
  if (motivo.trim().length < 2) return { error: "Escribí por qué lo descartás." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("descartar_comprobante", {
    p_id: id,
    p_motivo: motivo.trim(),
  });

  if (error) {
    if (error.code === "42501") return { error: MODULO_OFF };
    if (/comprobante_no_pendiente/.test(error.message)) {
      return { error: "Este comprobante ya se cargó o se descartó. Recargá la pantalla." };
    }
    return { error: "No se pudo descartar. Probá de nuevo." };
  }

  revalidar();
  return { id };
}

// ---------- 5 · Ver el archivo ----------
// Una URL firmada de 60 segundos para que el dueño mire el comprobante
// mientras lo revisa. El owner lee su propia carpeta (policy del bucket).
export async function urlComprobante(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: fila } = await supabase
    .from("comprobantes_recibidos")
    .select("ruta")
    .eq("id", id)
    .maybeSingle();
  if (!fila) return { error: "No encontramos ese comprobante." };

  const { data, error } = await supabase.storage
    .from("comprobantes")
    .createSignedUrl(fila.ruta, 60);
  if (error || !data) return { error: "No se pudo abrir el archivo." };
  return { url: data.signedUrl };
}
