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

// Un owner siempre tiene tenant: lo exige el trigger que crea la fila de
// aplicación. Tenerlo en el tipo evita el `!` en las diecinueve acciones.
export type SesionDeOwner = Sesion & { lubricentroId: string };

// ============================================================
// La sesión con la que se ESCRIBE. Toda Server Action que modifique algo
// del panel empieza por acá, y no por obtenerSesion().
//
// Hace las tres comprobaciones juntas: que haya sesión, que tenga tenant y
// que el tenant no esté suspendido. Antes las dos primeras estaban copiadas
// en cada acción; la tercera es nueva.
//
// POR QUÉ NO VA DENTRO DE obtenerSesion(): esa función la llaman también
// las pantallas, y un lubricentro suspendido TIENE que poder ver sus datos
// —esa es la definición de la suspensión, no cortarle el acceso—. Para
// meter la guarda ahí habría que distinguir en tiempo de ejecución si se
// está renderizando o ejecutando una acción, y Next no expone eso de forma
// estable: lo único que hay es la cabecera interna `next-action`. Una
// guarda apoyada en un detalle interno deja de funcionar EN SILENCIO el día
// que ese detalle cambie, que es exactamente la clase de bug que no
// queremos. Por eso la separación es explícita y la garantía de que nadie
// se la saltee es de lint, no de runtime: eslint.config.mjs prohíbe
// importar obtenerSesion desde app/panel/**/actions.ts. La acción número 20
// no compila hasta que use esta función o declare por escrito que solo lee.
//
// Suspendido → /panel, que es donde está el aviso con el WhatsApp de
// Fidelli. No es un error críptico: es el lugar que explica qué pasó.
// ============================================================
export async function sesionParaEscribir(): Promise<SesionDeOwner> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol === "owner" && !sesion.lubricentroActivo) redirect("/panel");
  return sesion as SesionDeOwner;
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
