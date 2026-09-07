import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { slugificar } from "@/lib/texto";
import { CABECERA_ARCHIVO, CABECERA_FILAS, MIME_XLSX } from "@/lib/exportar/cabeceras";

// ============================================================
// Lo que comparten las tres rutas de exportación.
//
// Se exporta con la sesión del usuario y su RLS — jamás con la
// service_role. Un lubricentro suspendido también exporta: la suspensión
// apaga la escritura, nunca la lectura, y "podés irte con tus datos
// cuando quieras" es una promesa que no se gatea por plan ni por estado
// de la cuenta. Por eso acá va obtenerSesion() y no sesionParaEscribir().
// ============================================================

export const MENSAJE_ERROR = "No se pudo exportar. Probá de nuevo.";

export async function contextoExportacion() {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) return null;

  const supabase = await createClient();

  // El slug del tenant para el nombre del archivo. Si por lo que sea no se
  // pudiera leer, se cae al nombre "slugificado": el archivo sale igual.
  const { data } = await supabase
    .from("lubricentros")
    .select("slug")
    .eq("id", sesion.lubricentroId)
    .maybeSingle();
  const slug =
    data?.slug || slugificar(sesion.lubricentroNombre ?? "") || "lubricentro";

  return { supabase, sesion, slug };
}

export function respuestaXlsx(contenido: Buffer, archivo: string, filas: number) {
  return new NextResponse(new Uint8Array(contenido), {
    headers: {
      "Content-Type": MIME_XLSX,
      "Content-Disposition": `attachment; filename="${archivo}"`,
      [CABECERA_ARCHIVO]: archivo,
      [CABECERA_FILAS]: String(filas),
      "Cache-Control": "no-store",
    },
  });
}

// El botón ya está deshabilitado sin filas; esto cubre el acceso directo a
// la URL. Nunca un archivo vacío.
export function respuestaSinFilas(mensaje: string) {
  return new NextResponse(mensaje, {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function respuestaError() {
  return new NextResponse(MENSAJE_ERROR, {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
