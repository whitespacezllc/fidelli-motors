import { NextRequest, NextResponse } from "next/server";
import { featureHabilitada } from "@/lib/auth/session";
import {
  contextoExportacion,
  respuestaError,
  respuestaSinFilas,
  respuestaXlsx,
} from "@/lib/exportar/respuesta";
import { paginar } from "@/lib/exportar/paginar";
import { fecha, generarXlsx, nombreArchivo, numero, texto, type Celda } from "@/lib/exportar/xlsx";
import { ETIQUETA_MEDIO, esMedioPago, etiquetaCategoria } from "@/lib/finanzas";

// ============================================================
// La exportación de la caja — GET /panel/finanzas/exportar
//
// Una hoja "Movimientos": una fila por ingreso o egreso, con su medio de
// pago y su monto. Es el módulo donde los importes SÍ viven, así que acá
// la columna Monto es parte del producto (a diferencia del export de
// trabajos, que no los lleva).
//
// El egreso va con el monto en positivo y el tipo en su columna: así se
// filtra y se arma una tabla dinámica sin pelear con el signo. Mismos
// helpers y misma forma de respuesta que el resto de los export del panel.
// ============================================================
export async function GET(request: NextRequest) {
  const contexto = await contextoExportacion();
  if (!contexto) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { supabase, sesion, slug } = contexto;

  // Sin el módulo, no hay nada que exportar (ni que mirar).
  if (!featureHabilitada(sesion, "finanzas")) {
    return respuestaError();
  }

  try {
    const movimientos = await paginar((desde, hasta) =>
      supabase
        .from("vista_movimientos_caja")
        .select("tipo, fecha, concepto, monto, medio, categoria, fondos, sucursal_nombre")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .range(desde, hasta),
    );

    if (movimientos.length === 0) {
      return respuestaSinFilas(
        "Todavía no registraste movimientos. Cargá un ingreso o un egreso y después exportás.",
      );
    }

    const filas: Celda[][] = movimientos.map((m) => [
      fecha(m.fecha),
      texto(m.tipo === "egreso" ? "Egreso" : "Ingreso"),
      texto(m.concepto),
      texto(etiquetaCategoria(m.categoria) ?? ""),
      texto(m.medio && esMedioPago(m.medio) ? ETIQUETA_MEDIO[m.medio] : (m.medio ?? "")),
      // Fondos: solo tiene sentido en egresos; "Personal" es lo pagado por el
      // dueño. En ingresos va vacío.
      texto(m.fondos === "personal" ? "Personal" : m.fondos === "taller" ? "Taller" : ""),
      texto(m.sucursal_nombre ?? ""),
      numero(Number(m.monto)),
    ]);

    const archivo = await generarXlsx([
      {
        nombre: "Movimientos",
        cabecera: ["Fecha", "Tipo", "Concepto", "Categoría", "Medio", "Fondos", "Sucursal", "Monto"],
        filas,
      },
    ]);

    return respuestaXlsx(archivo, nombreArchivo(slug, "caja"), movimientos.length);
  } catch {
    return respuestaError();
  }
}
