"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerSesion } from "@/lib/auth/session";
import { origenDelSitio } from "@/lib/origen";
import type { Periodo } from "@/lib/fidelli/plan";
import type { MotivoAviso } from "@/lib/config";

// Toda acción de esta superficie es de Fidelli. La base lo exige igual
// (RLS + el guard de cada función), así que esto no es la única defensa:
// es la que hace que un rol equivocado termine en su panel en vez de
// chocar contra un error de policy.
async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");
  return sesion;
}

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, probá de nuevo.";

function esErrorDeRed(mensaje: string): boolean {
  return /fetch|network|conexión|ECONNREFUSED/i.test(mensaje);
}

// Los `raise exception` de las funciones de Postgres llegan crudos. Cada
// uno tiene su frase: qué pasó y qué hacer, sin código de error.
const MENSAJES: Record<string, string> = {
  nombre_vacio: "Escribí el nombre de la marca.",
  plan_vacio: "Elegí un plan.",
  sin_sucursales: "Cargá al menos una sucursal con nombre.",
  limite_sucursales:
    "Las sucursales cargadas superan el límite del plan elegido. Sacá alguna del paso 2 o elegí un plan con más lugares.",
  descuento_invalido: "El descuento va de 0 a 100.",
  trial_invalido: "El trial va de 0 a 365 días.",
  calcos_invalidas: "Las calcos entregadas no pueden ser un número negativo.",
  no_existe: "Ese lubricentro ya no existe.",
  sin_suscripcion: "Este lubricentro no tiene ninguna suscripción para editar.",
  slug_bloqueado:
    "El slug no se puede cambiar: ya hay calcos entregadas con este QR.",
  sin_permiso_lubricentro: "No se pudo guardar: la base rechazó el cambio.",
  sin_permiso_suscripcion:
    "Se guardaron los datos de la marca pero no la suscripción. Volvé a abrir la ficha y revisá el plan.",
};

function traducir(mensaje: string): string {
  if (esErrorDeRed(mensaje)) return SIN_CONEXION;

  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }

  // Las constraints de la tabla son el backstop de las validaciones.
  if (mensaje.includes("lubricentros_slug_key")) {
    return "Ese slug ya lo tiene otro lubricentro.";
  }
  if (mensaje.includes("slug_no_reservado")) {
    return "Ese slug está reservado para una ruta del producto.";
  }
  if (mensaje.includes("slug_formato") || mensaje.includes("slug_largo")) {
    return "El slug va en minúsculas, con números y guiones, entre 3 y 60 caracteres.";
  }
  if (mensaje.includes("vencimiento_posterior")) {
    return "El vencimiento no puede ser anterior al inicio del período.";
  }

  return "No se pudo guardar. Probá de nuevo en un momento.";
}

// ============================================================
// Validación del slug — se llama mientras se escribe
// ============================================================

export type EstadoSlug = "disponible" | "ocupado" | "reservado" | "invalido";

export async function verificarSlug(slug: string): Promise<EstadoSlug> {
  await exigirSuperadmin();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("slug_estado", { p_slug: slug });

  // Sin respuesta no se afirma que esté libre: el wizard muestra el campo
  // sin veredicto y la constraint decide al guardar.
  if (error || !data) return "invalido";
  return data as EstadoSlug;
}

// ============================================================
// La invitación del owner — la fase 2, y la única que usa service_role
//
// Devuelve null si salió bien, o el motivo en castellano si falló.
// Nunca tira: el que llama necesita seguir vivo para poder contar que
// el tenant sí quedó creado.
// ============================================================

async function enviarInvitacion(
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

// ============================================================
// El alta — dos fases, y en este orden
//
// El tenant es una transacción en Postgres. La invitación es una llamada
// HTTP a la API de Auth. No hay forma de hacerlas atómicas, así que hay
// que elegir cuál va primero, y la elección no es simétrica:
//
//   · Tenant y después invitación: si falla la invitación queda un
//     lubricentro sin owner. Se ve en el listado como "Sin owner" y se
//     arregla con un botón. Recuperable.
//
//   · Invitación y después tenant: si falla el tenant queda un usuario en
//     auth.users apuntando a un lubricentro que no existe — y el trigger
//     ni siquiera lo dejaría crearse. Un huérfano que no se arregla con
//     nada de lo que hay en el panel.
//
// Por eso: primero el tenant, siempre.
// ============================================================

export type DatosAlta = {
  nombre: string;
  slug: string;
  sucursales: {
    nombre: string;
    direccion: string;
    telefono: string;
    horarios: string;
  }[];
  ownerNombre: string;
  ownerEmail: string;
  planId: string;
  periodo: Periodo;
  descuentoPct: number;
  diasTrial: number;
};

export type ResultadoAlta = {
  error?: string;
  // A qué paso del wizard volver cuando el error es de un campo.
  paso?: 1 | 2 | 3;
  creado?: {
    id: string;
    nombre: string;
    slug: string;
    ownerEmail: string;
    invitacion: "enviada" | "fallo";
    motivo?: string;
  };
};

export async function altaDeLubricentro(
  _prev: ResultadoAlta,
  datos: DatosAlta,
): Promise<ResultadoAlta> {
  await exigirSuperadmin();

  const nombre = datos.nombre.trim();
  const slug = datos.slug.trim().toLowerCase();
  const ownerNombre = datos.ownerNombre.trim();
  const ownerEmail = datos.ownerEmail.trim().toLowerCase();

  if (!nombre) return { error: "Escribí el nombre de la marca.", paso: 1 };
  if (!slug) return { error: "Escribí el slug de la landing.", paso: 1 };

  const sucursales = datos.sucursales.filter((s) => s.nombre.trim() !== "");
  if (sucursales.length === 0) {
    return { error: "Cargá al menos una sucursal con nombre.", paso: 2 };
  }
  if (!ownerNombre) return { error: "Escribí el nombre del owner.", paso: 2 };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return { error: "Revisá el email del owner: falta el @ o el dominio.", paso: 2 };
  }
  if (!datos.planId) return { error: "Elegí un plan.", paso: 3 };

  const supabase = await createClient();

  // ---------- Fase 1: el tenant, todo o nada ----------
  const { data: id, error } = await supabase.rpc("crear_lubricentro", {
    p_nombre: nombre,
    p_slug: slug,
    p_sucursales: sucursales,
    p_plan_id: datos.planId,
    p_periodo: datos.periodo,
    p_descuento_pct: datos.descuentoPct,
    p_dias_trial: datos.diasTrial,
  });

  if (error || !id) {
    const texto = traducir(error?.message ?? "");
    // El slug es del paso 1; lo demás, del 3.
    const paso = /slug/i.test(texto) ? 1 : /sucursal/i.test(texto) ? 2 : 3;
    return { error: texto, paso };
  }

  // El lubricentro ya existe. Pase lo que pase de acá en adelante, el
  // listado tiene que mostrarlo.
  revalidatePath("/fidelli");

  // ---------- Fase 2: la invitación ----------
  const motivo = await enviarInvitacion(id, ownerNombre, ownerEmail);

  return {
    creado: {
      id,
      nombre,
      slug,
      ownerEmail,
      invitacion: motivo ? "fallo" : "enviada",
      motivo: motivo ?? undefined,
    },
  };
}

// ============================================================
// Invitar y reenviar — la recuperación de la fase 2
// ============================================================

export type EstadoInvitacion = { error?: string; ok?: string };

export async function invitarOwner(
  _prev: EstadoInvitacion,
  formData: FormData,
): Promise<EstadoInvitacion> {
  await exigirSuperadmin();

  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!nombre) return { error: "Escribí el nombre del owner." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Revisá el email: falta el @ o el dominio." };
  }

  const motivo = await enviarInvitacion(lubricentroId, nombre, email);
  if (motivo) return { error: motivo };

  revalidatePath("/fidelli");
  return { ok: `Invitación enviada a ${email}.` };
}

export async function reenviarInvitacion(
  _prev: EstadoInvitacion,
  formData: FormData,
): Promise<EstadoInvitacion> {
  await exigirSuperadmin();

  const lubricentroId = String(formData.get("lubricentro_id") ?? "");

  // El owner ya existe: sus datos salen de la fila de aplicación, no del
  // formulario. Reenviar no es una oportunidad para cambiarle el mail.
  const supabase = await createClient();
  const { data: owner } = await supabase
    .from("usuarios")
    .select("nombre, email")
    .eq("lubricentro_id", lubricentroId)
    .eq("rol", "owner")
    .maybeSingle();

  if (!owner) {
    return {
      error: "Este lubricentro todavía no tiene owner. Usá Invitar owner.",
    };
  }

  const motivo = await enviarInvitacion(lubricentroId, owner.nombre, owner.email);
  if (motivo) return { error: motivo };

  revalidatePath("/fidelli");
  return { ok: `Invitación reenviada a ${owner.email}.` };
}

// ============================================================
// Edición
// ============================================================

export type EstadoEdicion = { error?: string; ok?: boolean };

export async function editarLubricentro(
  _prev: EstadoEdicion,
  formData: FormData,
): Promise<EstadoEdicion> {
  await exigirSuperadmin();

  const planId = String(formData.get("plan_id") ?? "");
  const periodo = String(formData.get("periodo") ?? "") as Periodo;
  const vencimiento = String(formData.get("vencimiento") ?? "");

  if (!planId || !periodo || !vencimiento) {
    return { error: "Faltan datos del plan. Volvé a abrir el formulario." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_lubricentro", {
    p_id: String(formData.get("id") ?? ""),
    p_nombre: String(formData.get("nombre") ?? ""),
    // Cuando hay calcos entregadas el campo viene en solo lectura, así que
    // llega el slug actual: la función lo compara con el guardado, ve que no
    // cambió y no lo toca. Si alguien fuerza otro valor, lo rechaza.
    p_slug: String(formData.get("slug") ?? "").trim(),
    p_calcos: Number(formData.get("calcos_entregadas") ?? 0),
    p_plan_id: planId,
    p_periodo: periodo,
    p_descuento_pct: Number(formData.get("descuento_pct") ?? 0),
    p_vencimiento: vencimiento,
  });

  if (error) return { error: traducir(error.message) };

  revalidatePath("/fidelli");
  return { ok: true };
}

// ============================================================
// Baja y reactivación
//
// Nunca DELETE. Un lubricentro suspendido conserva todo: sus clientes,
// sus services, su historial. Lo único que cambia es que la landing deja
// de responder y el panel del owner queda en modo lectura.
// ============================================================

export async function cambiarEstadoLubricentro(
  _prev: EstadoEdicion,
  formData: FormData,
): Promise<EstadoEdicion> {
  await exigirSuperadmin();

  const id = String(formData.get("id") ?? "");
  const activar = formData.get("activar") === "true";

  const supabase = await createClient();
  // El .select() no es decorativo: RLS rechaza los UPDATE en silencio
  // —cero filas, sin error— y sin mirar lo devuelto un rechazo se vería
  // en pantalla como un guardado exitoso.
  const { data, error } = await supabase
    .from("lubricentros")
    .update({ activo: activar })
    .eq("id", id)
    .select("id");

  if (error) return { error: traducir(error.message) };
  if (!data || data.length === 0) {
    return { error: "No se pudo cambiar el estado: la base rechazó el cambio." };
  }

  revalidatePath("/fidelli");
  revalidatePath("/panel", "layout");
  return { ok: true };
}

// ============================================================
// El aviso de vencimiento
//
// Se registra al ABRIR WhatsApp, no al enviar: es la única parte
// verificable del flujo — si el mensaje llegó o no pasa en una app que no
// controlamos. Mismo criterio que el contacto del panel del lubri.
//
// No hace falta borrar nada al cerrarse el ciclo: contactado_fidelli()
// compara contra el último pago, así que registrar un pago apaga el check
// solo y los avisos viejos quedan como historial.
// ============================================================

export type ResultadoAviso = { error?: string };

export async function registrarAviso(
  lubricentroId: string,
  motivo: MotivoAviso,
  canal: "whatsapp" | "manual" = "whatsapp",
): Promise<ResultadoAviso> {
  const sesion = await exigirSuperadmin();

  const supabase = await createClient();
  const { error } = await supabase.from("contactos_fidelli").insert({
    lubricentro_id: lubricentroId,
    usuario_id: sesion.usuarioId,
    motivo,
    canal,
  });

  if (error) {
    return {
      error: "No se pudo registrar el aviso. El mensaje se abrió igual.",
    };
  }

  revalidatePath("/fidelli");
  revalidatePath(`/fidelli/${lubricentroId}`);
  return {};
}

// Destildar borra los avisos del ciclo actual, que son exactamente los que
// mira contactado_fidelli(). Los de ciclos anteriores son historial y no se
// tocan. Marcar a mano registra canal 'manual': el llamado telefónico hecho
// por afuera del sistema.
export async function alternarAviso(
  lubricentroId: string,
  motivo: MotivoAviso,
  contactado: boolean,
): Promise<ResultadoAviso> {
  await exigirSuperadmin();

  if (!contactado) return registrarAviso(lubricentroId, motivo, "manual");

  const supabase = await createClient();

  // El ancla del ciclo, con el mismo criterio que la función de la base:
  // el último pago registrado, o el alta si nunca pagó.
  const [{ data: pago }, { data: lubricentro }] = await Promise.all([
    supabase
      .from("pagos")
      .select("created_at")
      .eq("lubricentro_id", lubricentroId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lubricentros")
      .select("created_at")
      .eq("id", lubricentroId)
      .maybeSingle(),
  ]);

  const ancla = pago?.created_at ?? lubricentro?.created_at;
  if (!ancla) return { error: "No se pudo destildar el aviso. Probá de nuevo." };

  const { error } = await supabase
    .from("contactos_fidelli")
    .delete()
    .eq("lubricentro_id", lubricentroId)
    .gt("created_at", ancla);

  if (error) {
    return { error: "No se pudo destildar el aviso. Probá de nuevo." };
  }

  revalidatePath("/fidelli");
  revalidatePath(`/fidelli/${lubricentroId}`);
  return {};
}
