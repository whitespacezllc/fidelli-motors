"use server";

import { redirect } from "next/navigation";
import { createClient as crearClienteEfimero } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type EstadoClave = { error?: string; ok?: string };

const MINIMO = 8;

// ============================================================
// Cambiar la propia contraseña desde el panel de administración.
//
// Pide la contraseña actual, que updateUser() NO exige por su cuenta. Sin
// eso, cualquiera que se cruce con una sesión abierta —una notebook sin
// bloquear en una mesa— se queda con la cuenta de superadmin, que es la
// que ve los datos de todos los lubricentros. El costo de pedirla es un
// campo más; el de no pedirla es toda la plataforma.
//
// La verificación va con un cliente EFÍMERO, sin cookies: un
// signInWithPassword sobre el cliente de servidor reescribiría la sesión
// del navegador. Este no persiste nada, solo contesta si la contraseña
// era la correcta.
// ============================================================
export async function cambiarClave(
  _prev: EstadoClave,
  formData: FormData,
): Promise<EstadoClave> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");

  if (!actual) return { error: "Escribí tu contraseña actual." };
  if (nueva.length < MINIMO) {
    return {
      error: `La contraseña nueva necesita al menos ${MINIMO} caracteres. Probá con una más larga.`,
    };
  }
  if (nueva === actual) {
    return { error: "Esa es la contraseña que ya tenías. Elegí una distinta." };
  }

  const verificador = crearClienteEfimero(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: errorActual } = await verificador.auth.signInWithPassword({
    email: sesion.email,
    password: actual,
  });

  if (errorActual) {
    if (errorActual.status === 0 || /fetch|network/i.test(errorActual.message)) {
      return {
        error:
          "Se cortó la conexión a internet. No cierres esta pantalla: probá de nuevo cuando vuelva la señal.",
      };
    }
    return { error: "La contraseña actual no es esa. Fijate y probá de nuevo." };
  }

  // Recién acá, con la identidad confirmada, se escribe la nueva.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });

  if (error) {
    if (error.code === "same_password") {
      return { error: "Esa es la contraseña que ya tenías. Elegí una distinta." };
    }
    return { error: "No se pudo guardar la contraseña. Probá de nuevo en un momento." };
  }

  return { ok: "Listo, tu contraseña quedó cambiada." };
}
