import "server-only";
import { Resend } from "resend";

// ============================================================
// LA API DE RESEND — el segundo Resend
//
// ⚠ HAY DOS RESEND EN FIDELLI. El primero es el SMTP de Supabase Auth:
// invitación, confirmación, recuperación y cambio de mail salen por ahí,
// con las plantillas de supabase/templates/, y los manda SUPABASE. Eso no
// pasa por acá y no se toca. Este es el segundo: la API, con la que EL
// APP manda sus propios emails —hoy, los de cobranza—.
//
//   · RESEND_API_KEY es SERVER-SIDE, sin NEXT_PUBLIC_. Sin ella no se
//     manda nada y se dice: `enviarEmail()` devuelve el motivo y la ruta
//     responde 500. Nunca falla en silencio.
//   · El remitente es una variable (EMAIL_REMITENTE), no una constante: el
//     día que cambie la casilla no hay deploy de código. El dominio tiene
//     que estar verificado en Resend; fidellimotors.app ya lo está.
//   · RESEND_BASE_URL la lee el SDK solo: en local apunta al doble
//     (scripts/doble-resend.mjs) y ningún email de prueba sale de verdad.
//     En Vercel no se define.
//
// Sin tracking de apertura, sin imágenes, sin link de desuscripción: son
// transaccionales. `server-only` arriba: si alguien importa esto desde un
// componente de cliente, el build falla.
// ============================================================

export const REMITENTE_POR_DEFECTO = "Fidelli Motors <hola@fidellimotors.app>";
export const REPLY_TO_POR_DEFECTO = "fidelli.motors@gmail.com";

export function remitente(): string {
  return process.env.EMAIL_REMITENTE?.trim() || REMITENTE_POR_DEFECTO;
}

export function replyTo(): string {
  return process.env.EMAIL_REPLY_TO?.trim() || REPLY_TO_POR_DEFECTO;
}

/** ¿Hay con qué mandar? La ruta lo pregunta ANTES de decidir nada. */
export function motivoSinResend(): string | null {
  return process.env.RESEND_API_KEY ? null : "falta RESEND_API_KEY en el entorno";
}

export type Envio =
  | { ok: true; id: string }
  | { ok: false; motivo: string };

export async function enviarEmail(e: {
  para: string;
  asunto: string;
  html: string;
  text: string;
}): Promise<Envio> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, motivo: "falta RESEND_API_KEY en el entorno" };

  // El SDK no tira: devuelve { data, error }. Un error de red sí tira, y
  // eso lo atrapa quien llama (un tenant fallido no corta el loop).
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from: remitente(),
    to: [e.para],
    replyTo: replyTo(),
    subject: e.asunto,
    html: e.html,
    text: e.text,
  });

  if (error) return { ok: false, motivo: `${error.name}: ${error.message}` };
  // Sin id no hay confirmación: se trata como no mandado y la corrida
  // siguiente lo reintenta. Mejor un email repetido que uno perdido en
  // silencio.
  if (!data?.id) return { ok: false, motivo: "Resend respondió sin id" };
  return { ok: true, id: data.id };
}
