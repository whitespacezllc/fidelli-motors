// ============================================================
// Los reportes de la CSP en modo report-only (lib/cabeceras.ts). El
// navegador manda acá lo que la política BLOQUEARÍA en la landing o en la
// página del cliente, y esto lo deja en los logs de Vercel, una línea por
// violación: la página, la directiva y lo que se habría bloqueado. Sirve
// para decidir la política de bloqueo con datos, no a ciegas.
//
// Llegan en dos formatos: el viejo de `report-uri` (un objeto con
// "csp-report", application/csp-report) y el de la Reporting API
// (`report-to`: un arreglo de reportes, application/reports+json). Se
// aceptan los dos y siempre se contesta 204: el navegador no espera nada y
// un cuerpo raro no tiene por qué ser un error. No escribe en la base.
// ============================================================

const TOPE_BYTES = 64 * 1024;
const TOPE_REPORTES = 20;

type Reporte = Record<string, unknown>;

function lineaDe(r: unknown): string | null {
  if (!r || typeof r !== "object") return null;
  const envoltorio = r as Reporte;
  const b = (envoltorio["csp-report"] ?? envoltorio.body ?? null) as Reporte | null;
  if (!b || typeof b !== "object") return null;
  const dato = (...claves: string[]) => {
    for (const c of claves) if (typeof b[c] === "string" && b[c]) return String(b[c]).slice(0, 300);
    return null;
  };
  return JSON.stringify({
    pagina: dato("document-uri", "documentURL"),
    directiva: dato("effective-directive", "effectiveDirective", "violated-directive"),
    bloqueado: dato("blocked-uri", "blockedURL"),
    archivo: dato("source-file", "sourceFile"),
    linea: b["line-number"] ?? b.lineNumber ?? null,
  });
}

export async function POST(request: Request) {
  const texto = await request.text();
  if (texto.length <= TOPE_BYTES) {
    try {
      const cuerpo: unknown = JSON.parse(texto);
      const reportes = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      for (const r of reportes.slice(0, TOPE_REPORTES)) {
        const linea = lineaDe(r);
        if (linea) console.log(`[csp] ${linea}`);
      }
    } catch {
      // No es un reporte: no hay nada que anotar.
    }
  }
  return new Response(null, { status: 204 });
}
