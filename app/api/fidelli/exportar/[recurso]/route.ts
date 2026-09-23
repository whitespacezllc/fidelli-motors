import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/fechas";
import { CABECERA_ARCHIVO, CABECERA_FILAS } from "@/lib/exportar/cabeceras";
import { exportar, leerParametros, nombreDeArchivo, recursoDe } from "@/lib/fidelli/exportar";

// ============================================================
// EL DATA ROOM — GET /api/fidelli/exportar/[recurso]
// (docs/METRICAS.md § 1 «Data room»; el diccionario es docs/DATA-ROOM.md)
//
// Devuelve un recurso del registro (lib/fidelli/exportar.ts) como CSV para
// Excel en español: `;`, coma decimal, UTF-8 con BOM, encabezados en
// castellano, escapado RFC 4180 (lib/fidelli/csv.ts).
//
//   1 · Solo superadmin. La sesión se lee con obtenerSesion(); sin sesión o
//       con otro rol → 403 JSON SIN consultar nada más: un owner no puede
//       ni enterarse de qué recursos existen. Se decide antes de mirar el
//       recurso o los parámetros, a propósito.
//   2 · Recurso desconocido → 404 (los que hay están en docs/DATA-ROOM.md).
//   3 · Parámetros mal escritos → 400 y el motivo. Nunca un archivo entero
//       como si el filtro hubiera funcionado, ni uno vacío por un rango
//       dado vuelta (en Crecimiento, también contra el default del otro
//       extremo).
//   4 · Se exporta con la sesión del superadmin y su RLS, jamás con la
//       service_role: es la misma regla de lib/exportar/respuesta.ts.
//
// El nombre del archivo lleva la fecha ARGENTINA (hoyISO()): en Vercel el
// proceso corre en UTC y a las 22:00 de acá ya es mañana allá.
// ============================================================

export const dynamic = "force-dynamic";

function rechazar(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recurso: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "superadmin") {
    return rechazar(403, "Solo el equipo de Fidelli puede exportar el data room.");
  }

  const { recurso: clave } = await params;
  const recurso = recursoDe(clave);
  if (!recurso) {
    return rechazar(404, `No existe el recurso «${clave}». Los que hay están en docs/DATA-ROOM.md.`);
  }

  // El grupo va para que un extremo del rango se juzgue contra el default
  // del otro en Crecimiento (`?desde=2027-01` solo es 400, no un archivo
  // vacío); la plataforma no tiene defaults y ahí no cambia nada.
  const lectura = leerParametros(new URL(request.url).searchParams, recurso.grupo);
  if (!lectura.ok) return rechazar(400, lectura.error);

  const supabase = await createClient();

  try {
    const { csv, filas } = await exportar(recurso, supabase, lectura.parametros);
    const archivo = nombreDeArchivo(recurso.clave, hoyISO());
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${archivo}"`,
        // Las mismas cabeceras que las exportaciones del panel: quien
        // dispare la URL desde un script sabe qué archivo y cuántas filas.
        [CABECERA_ARCHIVO]: archivo,
        [CABECERA_FILAS]: String(filas),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // El detalle va al log del servidor, no al cuerpo: mismo criterio que
    // el cierre diario y el webhook de Cresium.
    console.error(`[fidelli/exportar] ${recurso.clave}: ${e instanceof Error ? e.message : String(e)}`);
    return rechazar(500, "No se pudo armar el archivo. Probá de nuevo; si sigue, avisá.");
  }
}
