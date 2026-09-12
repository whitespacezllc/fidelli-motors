"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { origenDelSitio } from "@/lib/origen";
import { reenviarInvitacionPendiente } from "@/lib/auth/invitacion";

export type EstadoAccion = {
  error?: string;
  ok?: boolean;
  email?: string;
};

// El error de red se distingue del de credenciales: nombra la conexión,
// no un "error inesperado".
const SIN_CONEXION =
  "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.";

function esErrorDeRed(error: { name?: string; status?: number }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0;
}

export async function iniciarSesion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá el email y la contraseña para entrar." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Tu cuenta todavía no está activada. Abrí el enlace de la invitación que te llegó por correo.",
      };
    }
    return { error: "El email o la contraseña no coinciden. Probá de nuevo." };
  }

  // El rol decide la superficie. Una consulta, columnas explícitas.
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", data.user.id)
    .single();

  if (!usuario) {
    // Existe en Auth pero no tiene fila de aplicación: no puede operar.
    await supabase.auth.signOut();
    return {
      error:
        "Tu cuenta todavía no tiene un rol asignado. Escribinos y lo resolvemos.",
    };
  }

  redirect(usuario.rol === "superadmin" ? "/fidelli" : "/panel");
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function enviarRecuperacion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Escribí tu email para mandarte el enlace." };

  const supabase = await createClient();
  const origen = await origenDelSitio();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origen}/auth/callback`,
  });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    if (error.code === "over_email_send_rate_limit") {
      return {
        error:
          "Ya pedimos un enlace hace un momento. Esperá unos segundos y probá de nuevo.",
      };
    }
    // Cualquier otro caso se confirma igual: no revelamos qué emails existen.
  }

  return { ok: true, email };
}

// El owner cuya invitación venció se pide otra desde /auth/enlace. Sin
// sesión, a propósito: nunca llegó a tener contraseña, así que no hay
// forma de que la tenga. Las guardas (sólo cuentas nunca activadas, una
// por minuto) están en reenviarInvitacionPendiente.
export async function pedirInvitacionNueva(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Escribí el email al que te llegó la invitación." };
  }

  const resultado = await reenviarInvitacionPendiente(email);

  // Sólo se cuenta el fallo real del envío (sin red, el servicio de mails
  // cortó por límite). Decirle "listo" a un owner al que no le va a llegar
  // nada sería peor que admitir que ese mail tiene una invitación pendiente.
  if (typeof resultado === "object") {
    return {
      error:
        "No pudimos mandar el correo en este momento. Probá de nuevo en unos minutos o escribinos por WhatsApp.",
    };
  }

  // "enviada" y "omitida" se ven igual: no se revela qué mails tienen cuenta.
  return { ok: true, email };
}

export async function guardarClave(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return {
      error: "La contraseña necesita al menos 8 caracteres. Probá con una más larga.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    if (error.code === "same_password") {
      return {
        error: "Esa es la contraseña que ya tenías. Elegí una distinta.",
      };
    }
    return {
      error:
        "No se pudo guardar la contraseña. Volvé a abrir el enlace del correo y probá de nuevo.",
    };
  }

  // El destino se resuelve ACÁ y no en la raíz.
  //
  // Antes esto hacía redirect("/") y dejaba que la raíz enrutara según el
  // rol. Desde que "/" sirve la landing comercial, ese redirect dejaría al
  // owner recién activado —su primer minuto en el producto, viniendo del
  // enlace del correo— parado en la página de ventas en vez de su panel.
  // Mismo criterio que app/login/page.tsx: el rol decide la superficie.
  const { data: claims } = await supabase.auth.getClaims();
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", claims?.claims?.sub ?? "")
    .maybeSingle();

  redirect(usuario?.rol === "superadmin" ? "/fidelli" : "/panel");
}
