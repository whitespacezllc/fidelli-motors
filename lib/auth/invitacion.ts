import "server-only";

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { origenDelSitio } from "@/lib/origen";

// ============================================================
// La invitación del owner — lo único de la app que usa service_role.
//
// La llaman dos puertas muy distintas:
//   · el panel de Fidelli (alta del tenant, "Invitar owner", "Reenviar
//     invitación"), siempre con sesión de superadmin;
//   · la página del enlace vencido, SIN sesión: el propio owner
//     pidiéndose otra invitación porque abrió el mail tarde.
// Por eso vive acá y no adentro de las actions de /fidelli.
//
// El enlace del mail vence a las N horas de enviado, y N no lo decide
// este código: es "Email OTP Expiration" en el dashboard de Supabase de
// cada proyecto (ver CLAUDE.md). Si ese valor queda en el default de una
// hora, todo owner que abra el mail a la tarde llega a un enlace vencido.
// ============================================================

function esErrorDeRed(mensaje: string): boolean {
  return /fetch|network|conexión|ECONNREFUSED/i.test(mensaje);
}

// Devuelve null si salió bien, o el motivo en castellano si falló.
// Nunca tira: el que llama necesita seguir vivo para poder contar que
// el tenant sí quedó creado.
//
// GoTrue acepta invitar a un usuario que ya existe mientras no haya
// activado la cuenta: genera un token nuevo, manda el mail de nuevo y el
// enlace anterior deja de valer. Eso es lo que hace "reenviar".
export async function enviarInvitacion(
  lubricentroId: string,
  nombre: string,
  email: string,
): Promise<string | null> {
  try {
    const admin = crearClienteAdmin();

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      // Esta metadata es lo que lee el trigger handle_new_user para crear
      // la fila de aplicación. Sin rol o sin lubricentro_id, el alta del
      // usuario falla a propósito en vez de dejar un usuario sin tenant.
      data: { lubricentro_id: lubricentroId, rol: "owner", nombre },
      // OBLIGATORIO. Sin redirectTo el enlace del mail cae en / con el
      // código sin canjear: la sesión nunca se crea y el owner no puede
      // activar su cuenta. Tiene que apuntar al callback, que es el que
      // intercambia el código y lo manda a definir la contraseña.
      redirectTo: `${await origenDelSitio()}/auth/callback`,
    });

    if (!error) return null;

    const texto = error.message ?? "";
    if (esErrorDeRed(texto)) {
      return "No hubo conexión con el servicio de mails.";
    }
    if (/already been registered|already exists/i.test(texto)) {
      return "Ese email ya tiene una cuenta en Fidelli Motors. Usá otro, o pedile al owner que entre con el que ya tiene.";
    }
    if (error.status === 429 || /rate limit/i.test(texto)) {
      return "El servicio de mails cortó el envío por límite. Esperá un minuto y reenviá la invitación.";
    }
    return texto || "El servicio de mails rechazó el envío.";
  } catch (e) {
    // Incluye el caso de SUPABASE_SERVICE_ROLE_KEY ausente en el entorno.
    return e instanceof Error ? e.message : "Error desconocido al invitar.";
  }
}

// Ventana mínima entre dos invitaciones al mismo mail. GoTrue no aplica
// max_frequency a los invites (sí a recovery y magic link), así que el
// freno va acá. Sesenta segundos es lo que GoTrue usa para los demás mails.
const VENTANA_REENVIO_MS = 60_000;

export type ResultadoReenvio = "enviada" | "omitida" | { error: string };

// El owner pide otra invitación desde la página del enlace vencido.
//
// No hay sesión: cualquiera puede llamar con cualquier mail. Las reglas:
//   · sólo se manda si el mail es de un usuario de un lubricentro que
//     NUNCA activó su cuenta. Uno activo que perdió la contraseña ya
//     tiene /recuperar, y un superadmin no se invita por mail;
//   · no más de una por minuto por mail;
//   · "no existe", "ya está activo" y "pedida hace un momento" devuelven
//     lo mismo, "omitida", y la pantalla dice lo mismo que cuando sí se
//     mandó: no se revela qué mails tienen cuenta.
export async function reenviarInvitacionPendiente(
  email: string,
): Promise<ResultadoReenvio> {
  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Error desconocido al invitar.",
    };
  }

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, nombre, lubricentro_id")
    .eq("email", email)
    .maybeSingle();
  if (!usuario?.lubricentro_id) return "omitida";

  const { data, error } = await admin.auth.admin.getUserById(usuario.id);
  const cuenta = data?.user;
  if (error || !cuenta || cuenta.email_confirmed_at) return "omitida";

  const enviadaHace = cuenta.confirmation_sent_at
    ? Date.now() - Date.parse(cuenta.confirmation_sent_at)
    : Infinity;
  if (enviadaHace < VENTANA_REENVIO_MS) return "omitida";

  const motivo = await enviarInvitacion(
    usuario.lubricentro_id,
    usuario.nombre,
    email,
  );
  return motivo ? { error: motivo } : "enviada";
}
