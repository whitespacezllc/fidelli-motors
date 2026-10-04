import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { normalizarPatente } from "@/lib/texto";

// ============================================================
// LA PUERTA DEL CLIENTE A UN ADJUNTO — GET /[slug]/[patente]/adjunto/[id]
//
// El cliente no tiene sesión y `anon` no lee nada: ni la tabla
// `adjuntos_trabajo` (sin grants) ni el bucket `adjuntos` (sin policy). La
// única forma de llegar al PDF o a la foto del diagnóstico es esta ruta:
//
//   1 · le pregunta a adjunto_publico(id, slug, patente) si ese adjunto
//       existe, está marcado «Mostrar al cliente», su trabajo no está
//       anulado y es de ESE vehículo de ESE lubricentro. Si no, 404: un
//       id adivinado, el adjunto de otro auto o uno que el taller apagó
//       contestan lo mismo que uno que no existe.
//   2 · recién entonces firma una URL de 60 SEGUNDOS y redirige.
//
// En el HTML del cliente no hay nunca una URL firmada: hay este enlace, y
// la firma nace en el clic y vence enseguida. Reenviar el enlace de un
// archivo por WhatsApp no le da a nadie más que un link que ya no sirve.
//
// Corre con la clave de servicio (crearClienteAdmin) porque no hay otra
// forma de firmar algo que `anon` no puede leer, y por eso
// adjunto_publico() es solo de service_role: la ruta del archivo en el
// bucket nunca sale del servidor. Es el único uso de esa clave en la
// superficie del cliente, y no lee ni escribe nada más.
// ============================================================

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Cuánto vive la URL firmada. Alcanza para que el navegador siga la
// redirección y empiece a bajar el archivo; no para compartirla.
const SEGUNDOS = 60;

const CABECERAS = {
  "Cache-Control": "no-store",
  // Historial de un vehículo identificable: no se indexa (CLAUDE-landing.md).
  "X-Robots-Tag": "noindex, nofollow",
};

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Un 404 que se entiende: Pedro tocó «Ver» en una página que tenía abierta
// desde ayer y el taller quitó el archivo. Sin marca nuestra ni color del
// lubricentro (acá no se consulta nada más): texto, y la vuelta al auto.
function noDisponible(slug: string, patente: string) {
  const vuelta = `/${encodeURIComponent(slug)}/${encodeURIComponent(normalizarPatente(patente))}`;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Archivo no disponible</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
         font: 18px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0A0A0A; background: #FFFFFF; }
  main { max-width: 26rem; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.2; }
  p { margin: 0; color: #4A4A4A; }
  a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; margin-top: 20px;
      padding: 0 20px; border: 1px solid #0A0A0A; border-radius: 8px; color: #0A0A0A; font-weight: 600;
      text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>Ese archivo ya no está disponible</h1>
  <p>Puede que el taller lo haya quitado. El historial del auto sigue en su lugar.</p>
  <a href="${escapar(vuelta)}">Volver al historial</a>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 404,
    headers: { ...CABECERAS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; patente: string; id: string }> },
) {
  const { slug, patente, id } = await params;

  // Un id que no es un uuid ni se consulta: el cast en la base explotaría
  // y la respuesta tiene que ser la misma que para uno que no existe.
  if (!UUID.test(id)) return noDisponible(slug, patente);

  const admin = crearClienteAdmin();

  const { data: ruta, error } = await admin.rpc("adjunto_publico", {
    p_id: id,
    p_slug: slug,
    p_patente: patente,
  });
  if (error) {
    console.error(`[cliente/adjunto] adjunto_publico falló: ${error.message}`);
    return noDisponible(slug, patente);
  }
  if (!ruta) return noDisponible(slug, patente);

  const { data: firma, error: errorFirma } = await admin.storage
    .from("adjuntos")
    .createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !firma?.signedUrl) {
    console.error(`[cliente/adjunto] no se pudo firmar: ${errorFirma?.message ?? "sin URL"}`);
    return noDisponible(slug, patente);
  }

  return NextResponse.redirect(firma.signedUrl, { status: 302, headers: CABECERAS });
}
