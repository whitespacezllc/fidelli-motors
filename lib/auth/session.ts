import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { RUTA_FEATURE, type CapacidadesPlan, type FeaturePlan } from "@/lib/planes";
import { aCobranza, type Cobranza } from "@/lib/auth/cobranza";

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
  // El onboarding de tres pasos (migración 20260909180000). Viaja con la
  // sesión porque el gate lo pregunta en CADA request del panel: una
  // columna más en el mismo select sale gratis, una consulta aparte no.
  // Un superadmin no tiene tenant: para él siempre está completo.
  onboardingCompleto: boolean;
  // Completó el onboarding y todavía no vio la animación de bienvenida.
  bienvenidaPendiente: boolean;
  // Paso 3 del onboarding: dejó el premio para después. Lo mira el
  // checklist de Inicio para no seguir pidiéndoselo.
  premioOmitido: boolean;
  // El reloj de cobranza, YA RESUELTO por la base (migración 20260916140000).
  // Null para un superadmin, para un tenant afuera del reloj, y ante
  // cualquier problema leyéndolo: el panel degrada a lo de siempre, nunca
  // se rompe por esto.
  cobranza: Cobranza | null;
  // ⚠ EL ÚNICO PREDICADO DE SUSPENSIÓN DEL PANEL. Se calcula UNA vez, acá,
  // y lo leen los cinco sitios que antes miraban `lubricentroActivo` a
  // mano. Con el reloj apagado —`cobranza_desde` en null, que es el default
  // y el estado de los 17 tenants el día del deploy— `cobranza` es null y
  // esto colapsa EXACTAMENTE a `rol === "owner" && !lubricentroActivo`, que
  // es el comportamiento de hoy, bit por bit.
  //
  // Que sea un campo y no cinco expresiones sueltas es lo que evita el bug
  // que este sprint casi mete dos veces: cuatro gates de acuerdo y uno en
  // desacuerdo arma un ping-pong de redirects del que el owner no sale, o
  // apaga el AvisoSuspension dejando al suspendido con un panel de
  // apariencia normal que lo rebota sin decirle por qué.
  suspendido: boolean;
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
  // El campo calculado `reloj_cobranza` viaja en este MISMO select: la
  // carga de un service no hace ni una consulta HTTP nueva.
  //
  // ⚠ Y POR ESO HAY UN PISO. Si el deploy de Vercel llega antes que el
  // `db push`, PostgREST responde 400 por una clave desconocida, `data`
  // vuelve null y TODOS los owners caen en /login sin un solo error a la
  // vista — la sesión entera se cae por una columna nueva. El segundo
  // intento, sin la clave, devuelve la sesión de siempre con `cobranza` en
  // null: el panel degrada a lo de antes en vez de desloguear a los 17.
  // Es la misma ventana que el repo ya defiende en Inicio con el `?? []`
  // de `series`, pero acá no hay valor por defecto posible: es una clave
  // del select, no del JSON.
  const CAMPOS = (conReloj: boolean) =>
    "id, rol, nombre, email, lubricentro_id, plan_capacidades, " +
    `lubricentros(nombre, activo, onboarding_completado_at, bienvenida_vista_at, premio_omitido_at${conReloj ? ", reloj_cobranza" : ""})`;

  const primero = await supabase
    .from("usuarios")
    .select(CAMPOS(true))
    .eq("id", sub)
    .single();

  let fila = primero.data;

  // PGRST116 es "no hay fila", que no se arregla reintentando. Cualquier
  // otro error —típicamente un 400 por columna desconocida— sí: significa
  // que la base todavía no tiene la migración.
  if (primero.error && primero.error.code !== "PGRST116") {
    const segundo = await supabase
      .from("usuarios")
      .select(CAMPOS(false))
      .eq("id", sub)
      .single();
    fila = segundo.data;
  }

  const usuario = fila as unknown as {
    id: string;
    rol: Rol;
    nombre: string;
    email: string;
    lubricentro_id: string | null;
    plan_capacidades: CapacidadesPlan | null;
    lubricentros: {
      nombre: string;
      activo: boolean;
      onboarding_completado_at: string | null;
      bienvenida_vista_at: string | null;
      premio_omitido_at: string | null;
      reloj_cobranza?: unknown;
    } | null;
  } | null;

  if (!usuario) return null;

  const activo = usuario.lubricentros?.activo ?? true;
  const cobranza = aCobranza(usuario.lubricentros?.reloj_cobranza);

  return {
    usuarioId: usuario.id,
    rol: usuario.rol,
    nombre: usuario.nombre,
    email: usuario.email,
    lubricentroId: usuario.lubricentro_id,
    lubricentroNombre: usuario.lubricentros?.nombre ?? null,
    // Un superadmin no tiene tenant: nunca está suspendido.
    lubricentroActivo: activo,
    cobranza,
    suspendido: usuario.rol === "owner" && (!activo || cobranza?.estado === "suspendido"),
    capacidades: usuario.plan_capacidades,
    onboardingCompleto: usuario.lubricentros
      ? usuario.lubricentros.onboarding_completado_at !== null
      : true,
    bienvenidaPendiente:
      usuario.lubricentros?.onboarding_completado_at != null &&
      usuario.lubricentros.bienvenida_vista_at === null,
    premioOmitido: usuario.lubricentros?.premio_omitido_at != null,
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
  return sesion?.suspendido === true;
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
  if (sesion.suspendido) redirect("/panel");
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
