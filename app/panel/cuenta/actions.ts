"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as crearClienteEfimero } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
// cambiarClave usa obtenerSesion A PROPÓSITO (ver su comentario): no toca
// datos del tenant y un suspendido tiene que poder cambiar su contraseña.
// eslint-disable-next-line no-restricted-imports
import { sesionParaEscribir, obtenerSesion } from "@/lib/auth/session";

export type EstadoCuenta = { error?: string; ok?: string };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: probá de nuevo cuando vuelva la señal.";

function esErrorDeRed(mensaje: string): boolean {
  return /fetch|network|conexión/i.test(mensaje);
}

// ---------- Tus datos: el nombre del usuario ----------
export async function actualizarMiNombre(
  _prev: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  await sesionParaEscribir();

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_mi_nombre", {
    p_nombre: nombre,
  });

  if (error) {
    if (esErrorDeRed(error.message)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el nombre. Probá de nuevo en un momento." };
  }

  // El nombre aparece en la firma de los pagos y en el header: layout entero.
  revalidatePath("/panel", "layout");
  return { ok: "Listo, tu nombre quedó guardado." };
}

// ---------- Tu marca: el nombre del lubricentro ----------
export async function actualizarNombreLubricentro(
  _prev: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  const sesion = await sesionParaEscribir();

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  // La función solo puede tocar el NOMBRE de SU lubricentro: el slug,
  // `activo` y las calcos quedan fuera de su alcance por construcción.
  const { error } = await supabase.rpc("actualizar_nombre_lubricentro", {
    p_nombre: nombre,
  });

  if (error) {
    if (esErrorDeRed(error.message)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el nombre. Probá de nuevo en un momento." };
  }

  // El nombre es la marca: vive en el sidebar y en la landing pública.
  revalidatePath("/panel", "layout");
  const { data: lubri } = await supabase
    .from("lubricentros")
    .select("slug")
    .eq("id", sesion.lubricentroId)
    .maybeSingle();
  if (lubri?.slug) revalidatePath(`/${lubri.slug}`);

  return { ok: "Listo, el nombre de tu lubricentro quedó guardado." };
}

// ---------- Seguridad: cambiar la contraseña ----------
//
// Va con obtenerSesion y no con sesionParaEscribir a propósito: esta acción
// no toca ningún dato del tenant —es la seguridad de la CUENTA— y un owner
// suspendido tiene que poder rotar su contraseña igual.
//
// Pide la actual, y la usa dos veces: para verificar que es él, y para
// obtener con ella una sesión FRESCA en un cliente efímero (sin cookies).
// El cambio se escribe sobre esa sesión fresca, no sobre la del navegador:
// Supabase tiene secure_password_change activado, que exige un login
// reciente — la sesión del mostrador puede tener días. La del navegador no
// se toca y sigue viva.
export async function cambiarClave(
  _prev: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");

  if (!actual) return { error: "Escribí tu contraseña actual." };
  if (nueva.length < 8) {
    return {
      error: "La contraseña nueva necesita al menos 8 caracteres. Probá con una más larga.",
    };
  }
  if (nueva === actual) {
    return { error: "Esa es la contraseña que ya tenías. Elegí una distinta." };
  }

  const efimero = crearClienteEfimero(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: errorActual } = await efimero.auth.signInWithPassword({
    email: sesion.email,
    password: actual,
  });

  if (errorActual) {
    if (errorActual.status === 0 || esErrorDeRed(errorActual.message)) {
      return { error: SIN_CONEXION };
    }
    return { error: "La contraseña actual no es esa. Fijate y probá de nuevo." };
  }

  const { error } = await efimero.auth.updateUser({ password: nueva });

  if (error) {
    if (error.code === "same_password") {
      return { error: "Esa es la contraseña que ya tenías. Elegí una distinta." };
    }
    return { error: "No se pudo guardar la contraseña. Probá de nuevo en un momento." };
  }

  return { ok: "Listo, tu contraseña quedó cambiada." };
}
