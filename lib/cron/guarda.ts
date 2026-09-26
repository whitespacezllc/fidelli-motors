import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// ============================================================
// LA GUARDA DE LOS CRONS DE VERCEL — una sola, para las dos rutas
//
// Vercel manda `Authorization: Bearer $CRON_SECRET` y nada más. Sin ese
// header exacto: 401 y no se toca la base. Sin CRON_SECRET en el entorno:
// 500, para que se note en el primer intento. Vivía adentro de
// /api/fidelli/cierre-diario; al aparecer la segunda ruta
// (/api/fidelli/avisos-cobranza, bloque 2 del sprint de cobranza) la
// guarda pasa a ser una, para que «misma guarda exacta» sea literal y no
// una copia que se separa en tres semanas.
// ============================================================

// Comparación en tiempo constante, aunque los largos difieran.
function bearerCoincide(header: string | null, secret: string): boolean {
  const esperado = Buffer.from(`Bearer ${secret}`);
  const recibido = Buffer.from(header ?? "");
  if (esperado.length !== recibido.length) return false;
  return timingSafeEqual(esperado, recibido);
}

/**
 * Null si el request está autorizado; si no, la respuesta que hay que
 * devolver tal cual. `ruta` es el prefijo del log (`[fidelli/cierre-diario]`).
 */
export function rechazoDelCron(request: Request, ruta: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // El motivo va al log del servidor, no al cuerpo: mismo criterio que el
    // webhook de Cresium.
    console.error(`[${ruta}] falta CRON_SECRET en el entorno`);
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!bearerCoincide(request.headers.get("authorization"), secret)) {
    console.error(`[${ruta}] rechazado: authorization inválido`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
