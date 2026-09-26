// ============================================================
// EL MARCO DE LOS EMAILS DEL APP
//
// Es el mismo marco que `supabase/templates/invite.html` —la tabla de una
// columna de 520px, la línea roja arriba, «FIDELLI MOTORS» en el
// encabezado, la paleta (#0A0A0A, #4A4A4A, #8A8A8A, #E4E4E4, #F5F5F5),
// Helvetica/Arial, el rojo #E01F26 SOLO en el botón y el pie «Fidelli
// Motors · fidellimotors.app»—. Un cliente que recibió la invitación
// tiene que reconocer un email de cobranza sin leerlo.
//
// ⚠ HAY DOS RESEND, Y ESTE ES EL SEGUNDO. Las plantillas de
// supabase/templates/ (invite, confirmation, recovery, email_change) las
// manda SUPABASE por SMTP —Resend como servidor de correo de Auth— y se
// pegan a mano en el dashboard; no pasan por acá y no se tocan. Este marco
// es para los emails que manda EL APP por la API de Resend
// (RESEND_API_KEY): hoy, los de cobranza. Si el diseño de la invitación
// cambia, cambia acá también, a mano: son dos copias a propósito, porque
// Supabase no puede importar TypeScript.
//
// Sin imágenes, sin tracking de apertura, sin link de desuscripción: son
// transaccionales. Estilos inline, porque el cliente de correo no lee un
// <style>. Puro: sin imports, para que la regresión lo compile y lo corra
// en Node sin el bundler.
// ============================================================

export type Boton = { texto: string; href: string };

export type ContenidoEmail = {
  /** El h1 del email. */
  titulo: string;
  /** Los párrafos antes del botón. Texto plano: acá se escapa. */
  parrafos: string[];
  /** El botón, si hay. Es la única cosa roja del email. */
  boton?: Boton;
  /** Los párrafos después del botón, en gris. */
  despues?: string[];
  /** La firma. Los emails de cobranza los firma Santiago, no «el equipo». */
  firma?: string[];
};

const FUENTE = "font-family:Helvetica,Arial,sans-serif;";

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parrafo(texto: string, color: string, tamano = 16, margen = 16): string {
  return (
    `<p style="margin:${margen}px 0 0;${FUENTE}font-size:${tamano}px;line-height:1.6;color:${color};">` +
    `${escaparHtml(texto)}</p>`
  );
}

/** El HTML completo del email, con el marco de la invitación. */
export function marcoHtml(c: ContenidoEmail): string {
  const cuerpo = c.parrafos.map((p, i) => parrafo(p, "#4A4A4A", 16, i === 0 ? 0 : 16)).join("");
  const boton = c.boton
    ? `<tr><td style="padding:28px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#E01F26;border-radius:8px;">
          <a href="${escaparHtml(c.boton.href)}" style="display:inline-block;padding:15px 30px;${FUENTE}font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">
            ${escaparHtml(c.boton.texto)}
          </a>
        </td>
      </tr></table>
    </td></tr>`
    : "";
  const despues = c.despues?.length
    ? `<tr><td style="padding:24px 32px 0;">${c.despues.map((p, i) => parrafo(p, "#8A8A8A", 14, i === 0 ? 0 : 12)).join("")}</td></tr>`
    : "";
  const firma = c.firma?.length
    ? `<tr><td style="padding:24px 32px 32px;">${c.firma.map((p, i) => parrafo(p, "#4A4A4A", 16, i === 0 ? 24 : 0)).join("")}</td></tr>`
    : `<tr><td style="padding:0 32px 32px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:#F5F5F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E4E4E4;border-radius:12px;">
    <tr><td style="height:4px;background:#E01F26;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:32px 32px 8px;">
      <div style="${FUENTE}font-size:14px;font-weight:700;letter-spacing:.04em;color:#0A0A0A;">
        FIDELLI <span style="color:#E01F26;">MOTORS</span>
      </div>
    </td></tr>
    <tr><td style="padding:12px 32px 0;">
      <h1 style="margin:0;${FUENTE}font-size:26px;line-height:1.2;font-weight:700;color:#0A0A0A;">
        ${escaparHtml(c.titulo)}
      </h1>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      ${cuerpo}
    </td></tr>
    ${boton}
    ${despues}
    ${firma}
  </table>
  <p style="margin:20px 0 0;${FUENTE}font-size:12px;color:#8A8A8A;">
    Fidelli Motors · fidellimotors.app
  </p>
</td></tr>
</table>
</body>
</html>`;
}

/** La versión de texto plano del mismo contenido, para el `text` del envío. */
export function marcoTexto(c: ContenidoEmail): string {
  const partes: string[] = [c.titulo, "", ...c.parrafos.flatMap((p) => [p, ""])];
  if (c.boton) partes.push(`${c.boton.texto}: ${c.boton.href}`, "");
  if (c.despues?.length) partes.push(...c.despues.flatMap((p) => [p, ""]));
  if (c.firma?.length) partes.push(...c.firma, "");
  partes.push("Fidelli Motors · fidellimotors.app");
  return partes.join("\n");
}
