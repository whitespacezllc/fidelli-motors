"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { esEstadoEncargo } from "@/lib/calcos";
import { DISENO_MAX_BYTES, DISENO_TIPOS } from "@/lib/fidelli/calcos";

// ============================================================
// Las acciones de los pedidos de calcos, compartidas por la solapa Calcos
// de la ficha y por la cola de /fidelli/calcos.
//
// Las reglas viven en la base: la tabla de transiciones, la nota del pago
// a mano, el seguimiento del envío, la versión del diseño. Acá se leen los
// campos, se llama a la puerta y se traduce lo que contesta.
// ============================================================

async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");
  return sesion;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAJES: Record<string, string> = {
  transicion_invalida:
    "Ese pedido ya cambió de estado. Recargá la pantalla y miralo de nuevo.",
  nota_obligatoria:
    "Escribí la nota con un poco más de detalle: 10 caracteres o más. Es lo que queda registrado.",
  seguimiento_obligatorio: "Poné el transportista y el número de seguimiento.",
  entrega_no_es_envio:
    "Este pedido es con retiro: cuando esté, va a «Listo para retirar».",
  entrega_no_es_retiro:
    "Este pedido es con envío a domicilio: va a «Enviado», con su seguimiento.",
  encargo_no_existe: "Ese pedido ya no existe. Recargá la pantalla.",
  cantidad_invalida: "La cantidad de calcos tiene que ser mayor que cero.",
  envio_sin_direccion:
    "Para el envío a domicilio poné la dirección y un teléfono de contacto.",
  entrega_invalida: "Elegí cómo se entrega: retiro o envío a domicilio.",
  ruta_invalida:
    "El archivo no quedó en la carpeta del lubricentro. Subilo de nuevo.",
  no_existe: "Ese lubricentro ya no existe.",
  // La puerta del libro, que llama «Entregado».
  fecha_futura: "La fecha de la entrega no puede ser posterior a hoy.",
};

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, probá de nuevo.";

function traducir(mensaje: string): string {
  if (/fetch|network|conexión|ECONNREFUSED/i.test(mensaje)) return SIN_CONEXION;
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

// El pedido se ve en tres lados: la ficha del tenant, la cola y la alerta
// del hub. Y «Entregado» mueve el contador, que está en el listado.
function revalidar(lubricentroId: string) {
  revalidatePath(`/fidelli/${lubricentroId}`);
  revalidatePath("/fidelli/calcos");
  revalidatePath("/fidelli/lubricentros");
  revalidatePath("/fidelli");
}

export type EstadoAccionCalcos = { ok?: boolean; error?: string };

// ============================================================
// Mover un pedido de estado
// ============================================================
export async function avanzarEncargo(
  _prev: EstadoAccionCalcos,
  formData: FormData,
): Promise<EstadoAccionCalcos> {
  await exigirSuperadmin();

  const encargoId = String(formData.get("encargo_id") ?? "");
  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  if (!UUID.test(encargoId) || !esEstadoEncargo(estado)) {
    return { error: MENSAJES.transicion_invalida };
  }

  // Solo viaja lo que se escribió: la base decide qué es obligatorio.
  const datos: Record<string, string> = {};
  for (const clave of ["nota", "transportista", "seguimiento"]) {
    const valor = String(formData.get(clave) ?? "").trim();
    if (valor) datos[clave] = valor;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("avanzar_encargo_calcos", {
    p_id: encargoId,
    p_estado: estado,
    p_datos: datos,
  });
  if (error) return { error: traducir(error.message) };

  revalidar(lubricentroId);
  return { ok: true };
}

// ============================================================
// «+ Pedido incluido en el plan»
//
// Los calcos del alta: sin pago, nacen pagados y siguen el mismo camino
// que un pedido comprado.
// ============================================================
export async function crearEncargoIncluido(
  _prev: EstadoAccionCalcos,
  formData: FormData,
): Promise<EstadoAccionCalcos> {
  await exigirSuperadmin();

  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const entrega = String(formData.get("entrega") ?? "retiro");
  const campo = (nombre: string) => String(formData.get(nombre) ?? "").trim() || undefined;

  if (!Number.isInteger(cantidad) || cantidad <= 0) return { error: MENSAJES.cantidad_invalida };
  if (entrega !== "retiro" && entrega !== "envio") return { error: MENSAJES.entrega_invalida };
  if (entrega === "envio" && (!campo("direccion") || !campo("telefono"))) {
    return { error: MENSAJES.envio_sin_direccion };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_encargo_calcos_incluido", {
    p_lubricentro_id: lubricentroId,
    p_cantidad: cantidad,
    p_entrega: entrega,
    p_direccion: campo("direccion"),
    p_localidad: campo("localidad"),
    p_codigo_postal: campo("codigo_postal"),
    p_telefono: campo("telefono"),
    p_nota: campo("nota"),
  });
  if (error) return { error: traducir(error.message) };

  revalidar(lubricentroId);
  return { ok: true };
}

// ============================================================
// Subir el diseño del calco — en tres pasos
//
// El logo sube entero por una Server Action. El diseño no puede: admite
// hasta 10 MB y el cuerpo de un request a una función de Vercel se corta
// en 4,5 MB (en local pasaría y en producción no). Así que el archivo va
// DIRECTO del navegador al bucket, con una URL firmada de subida que se
// pide acá, y el servidor valida después lo que llegó:
//
//   1. prepararSubidaDiseno()  → la ruta (la elige el servidor) y el token.
//   2. el navegador sube el archivo con ese token.
//   3. registrarDiseno()       → lee los bytes reales del archivo ya
//      subido; si no es un PNG ni un PDF de verdad lo borra, y si lo es,
//      registra la versión nueva y la marca actual.
//
// Un archivo que se sube y nunca se registra queda huérfano en el bucket,
// sin versión: no lo ve nadie y la policy lo deja borrar.
// ============================================================

type TipoDiseno = (typeof DISENO_TIPOS)[number];

function esTipoDiseno(v: string): v is TipoDiseno {
  return (DISENO_TIPOS as readonly string[]).includes(v);
}

export type SubidaPreparada = { ruta: string; token: string } | { error: string };

export async function prepararSubidaDiseno(datos: {
  lubricentroId: string;
  tipo: string;
  tamano: number;
}): Promise<SubidaPreparada> {
  await exigirSuperadmin();

  if (!UUID.test(datos.lubricentroId)) return { error: MENSAJES.no_existe };
  if (!esTipoDiseno(datos.tipo)) {
    return { error: "Ese formato no está soportado. Subí el diseño en PNG o PDF." };
  }
  if (!Number.isFinite(datos.tamano) || datos.tamano <= 0) {
    return { error: "Ese archivo está vacío. Elegí el diseño de nuevo." };
  }
  if (datos.tamano > DISENO_MAX_BYTES) {
    const mb = (datos.tamano / 1024 / 1024).toFixed(1);
    return { error: `Ese archivo pesa ${mb} MB y el máximo es 10 MB. Exportalo más liviano y volvé a subirlo.` };
  }

  // La carpeta es el tenant (es lo que la policy del bucket le deja leer a
  // su owner) y el nombre no lo elige el navegador.
  const extension = datos.tipo === "application/pdf" ? "pdf" : "png";
  const ruta = `${datos.lubricentroId}/${crypto.randomUUID()}.${extension}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("calcos").createSignedUploadUrl(ruta);
  if (error || !data) {
    return { error: "No se pudo preparar la subida. Probá de nuevo en un momento." };
  }
  return { ruta, token: data.token };
}

const NO_ES_UN_DISENO =
  "Ese archivo no es un PNG o PDF de verdad. Exportalo de nuevo desde el programa de diseño y volvé a subirlo.";

export async function registrarDiseno(datos: {
  lubricentroId: string;
  ruta: string;
  nota: string;
}): Promise<EstadoAccionCalcos> {
  await exigirSuperadmin();

  if (!UUID.test(datos.lubricentroId) || !datos.ruta.startsWith(`${datos.lubricentroId}/`)) {
    return { error: MENSAJES.ruta_invalida };
  }

  const supabase = await createClient();
  const bucket = supabase.storage.from("calcos");

  const { data: archivo, error: errorDescarga } = await bucket.download(datos.ruta);
  if (errorDescarga || !archivo) {
    return { error: "El archivo no llegó a subirse. Revisá la conexión y probá de nuevo." };
  }

  // El tipo real sale de los bytes, no de la extensión ni del content-type
  // que declaró el navegador (mismo criterio que el logo).
  const cabecera = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
  const esPng =
    cabecera[0] === 0x89 && cabecera[1] === 0x50 && cabecera[2] === 0x4e && cabecera[3] === 0x47;
  const esPdf =
    cabecera[0] === 0x25 && cabecera[1] === 0x50 && cabecera[2] === 0x44 && cabecera[3] === 0x46;
  const coincide = datos.ruta.endsWith(".pdf") ? esPdf : esPng;

  if (!coincide || archivo.size > DISENO_MAX_BYTES) {
    await bucket.remove([datos.ruta]);
    return { error: NO_ES_UN_DISENO };
  }

  const { error } = await supabase.rpc("registrar_diseno_calco", {
    p_lubricentro_id: datos.lubricentroId,
    p_ruta: datos.ruta,
    p_nota: datos.nota.trim() || undefined,
  });
  if (error) {
    await bucket.remove([datos.ruta]);
    return { error: traducir(error.message) };
  }

  revalidar(datos.lubricentroId);
  return { ok: true };
}
