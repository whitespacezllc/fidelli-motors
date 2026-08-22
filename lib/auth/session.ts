import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { RUTA_FEATURE, type CapacidadesPlan, type FeaturePlan } from "@/lib/planes";

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
  // Lo que el plan del tenant habilita, YA RESUELTO por la base (override →
  // plan vigente → cerrado). Viene del campo calculado plan_capacidades en
  // el mismo select de abajo: cero round trips extra. Null para superadmin.
  capacidades: CapacidadesPlan | null;
};

// El rol y el tenant salen de public.usuarios (RLS deja leer solo la fila propia).
// cache() memoiza por request: aunque lo llamen el layout y la página, es UNA consulta.
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  // `plan_capacidades` es un CAMPO CALCULADO de PostgREST (una función
  // sobre la fila de usuarios, definida en la migración de planes): las
  // features del plan viajan en esta misma consulta, resueltas por la
  // base. El parser de tipos de supabase-js no conoce los campos
  // calculados, de ahí el cast.
  const { data: fila } = await supabase
    .from("usuarios")
    .select(
      "id, rol, nombre, email, lubricentro_id, plan_capacidades, lubricentros(nombre, activo)",
    )
    .eq("id", sub)
    .single();

  const usuario = fila as unknown as {
    id: string;
    rol: Rol;
    nombre: string;
    email: string;
    lubricentro_id: string | null;
    plan_capacidades: CapacidadesPlan | null;
    lubricentros: { nombre: string; activo: boolean } | null;
  } | null;

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
    capacidades: usuario.plan_capacidades,
  };
});

// ¿El plan del tenant habilita esta feature? La resolución REAL vive en la
// base (feature_de_tenant); esto solo lee el resultado que vino con la
// sesión. Sin capacidades —no debería pasar para un owner— falla cerrado,
// igual que la base.
export function featureHabilitada(
  sesion: Sesion | null,
  feature: FeaturePlan,
): boolean {
  if (!sesion) return false;
  if (sesion.rol === "superadmin") return true;
  return sesion.capacidades?.features?.[feature] === true;
}

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
export async function sesionParaEscribir(
  featureRequerida?: FeaturePlan,
): Promise<SesionDeOwner> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol === "owner" && !sesion.lubricentroActivo) redirect("/panel");
  // El cuarto chequeo: el plan. La acción declara qué feature necesita y
  // la respuesta viene resuelta de la base vía plan_capacidades — acá no
  // se re-decide nada. Bloqueado → a la sección, donde BloqueoPlan explica
  // qué pasa y cómo se activa. Mismo criterio que la suspensión: el
  // rechazo nunca es mudo, es un lugar que lo cuenta.
  if (featureRequerida && !featureHabilitada(sesion, featureRequerida)) {
    redirect(RUTA_FEATURE[featureRequerida] ?? "/panel");
  }
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
