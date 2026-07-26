import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Rol = Database["public"]["Enums"]["rol_usuario"];

export type Sesion = {
  usuarioId: string;
  rol: Rol;
  nombre: string;
  email: string;
  lubricentroId: string | null;
  lubricentroNombre: string | null;
  // false = suspendido por falta de pago. El owner entra igual y ve todo:
  // lo que cambia es que el panel pasa a solo lectura y la landing pública
  // deja de responder. Ver components/panel/aviso-suspension.tsx.
  lubricentroActivo: boolean;
};

// El rol y el tenant salen de public.usuarios (RLS deja leer solo la fila propia).
// cache() memoiza por request: aunque lo llamen el layout y la página, es UNA consulta.
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, rol, nombre, email, lubricentro_id, lubricentros(nombre, activo)")
    .eq("id", sub)
    .single();

  if (!usuario) return null;

  return {
    usuarioId: usuario.id,
    rol: usuario.rol,
    nombre: usuario.nombre,
    email: usuario.email,
    lubricentroId: usuario.lubricentro_id,
    lubricentroNombre: usuario.lubricentros?.nombre ?? null,
    // Un superadmin no tiene tenant: nunca está suspendido.
    lubricentroActivo: usuario.lubricentros?.activo ?? true,
  };
});

// ¿El panel está en solo lectura? Verdadero solo para un owner cuyo
// lubricentro fue suspendido por falta de pago. obtenerSesion() está
// memoizada por request, así que preguntarlo en cada pantalla no agrega
// ninguna consulta.
export async function panelSuspendido(): Promise<boolean> {
  const sesion = await obtenerSesion();
  return sesion?.rol === "owner" && !sesion.lubricentroActivo;
}

// Guardia de layout. La autorización se decide acá, en el servidor de cada
// superficie — el proxy solo refresca la sesión, no decide nada.
// Sin sesión → /login. Con el rol equivocado → a su superficie (no un 403:
// simplemente no es su lugar).
export async function exigirRol(rol: Rol): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== rol) {
    redirect(sesion.rol === "superadmin" ? "/fidelli" : "/panel");
  }
  return sesion;
}
