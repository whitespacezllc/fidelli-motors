"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { NOMBRE_TRABAJO } from "@/lib/trabajos";
import { plazoEdicionConArticulo } from "@/lib/servicios";
import {
  ADJUNTOS_MAXIMO,
  ADJUNTO_MAX_BYTES,
  EXTENSION_DE_MIME,
  MENSAJE_FORMATO,
  MENSAJE_TOPE,
  esMimeAdjunto,
  extensionDeRutaPropia,
  limpiarNombre,
  mensajePesoExcedido,
  mimePorCabecera,
  rutaDeAdjunto,
} from "@/lib/adjuntos";

export type ResultadoAnulado = { error?: string };

// Anular usa el campo `anulado`, nunca DELETE: los datos históricos no se
// borran. La misma policy de UPDATE que limita la edición limita esto —
// si es editable, es anulable; si está fijado, la base lo rechaza.
export async function anularService(
  serviceId: string,
): Promise<ResultadoAnulado> {
  await sesionParaEscribir();

  const supabase = await createClient();

  // RLS no lanza error cuando rechaza: filtra la fila y el UPDATE afecta
  // 0 filas. El select de vuelta es lo que distingue "anulado" de
  // "la ventana venció mientras la pantalla estaba abierta".
  const { data, error } = await supabase
    .from("services")
    .update({ anulado: true })
    .eq("id", serviceId)
    .eq("anulado", false)
    .select("id, vehiculos(patente_normalizada, cliente_id)");

  if (error) {
    return {
      error:
        "No se pudo anular el service. Revisá la conexión y probá de nuevo.",
    };
  }

  if (!data || data.length === 0) {
    // El plazo que venció es el del tipo —24 horas, o 7 días en una
    // mecánica— y la fila no volvió, así que se lee aparte: la lectura
    // no la recorta la policy de UPDATE.
    const { data: fila } = await supabase
      .from("services")
      .select("tipo")
      .eq("id", serviceId)
      .maybeSingle();
    const tipo = fila?.tipo ?? "service";
    return {
      error: `Este ${NOMBRE_TRABAJO[tipo]} se fijó: pasaron ${plazoEdicionConArticulo(tipo)} y ya no se puede anular. Si hay un error grave, escribinos.`,
    };
  }

  revalidatePath("/panel/services");
  revalidatePath(`/panel/services/${serviceId}`);
  revalidatePath("/panel");
  const clienteId = data[0].vehiculos?.cliente_id;
  if (clienteId) revalidatePath(`/panel/clientes/${clienteId}`);

  return {};
}

// ============================================================
// Los adjuntos del trabajo — el PDF o la foto del diagnóstico
//
// ADJUNTAR NO EDITA EL CARTÓN. Ninguna de estas cuatro acciones mira el
// plazo de edición: se adjunta, se prende, se apaga y se quita en
// cualquier momento, también en un trabajo fijado. Lo único que las frena
// es lo de siempre: la sesión, el tenant y la suspensión
// (sesionParaEscribir).
//
// La subida va en tres pasos, igual que el diseño del calco
// (app/fidelli/calcos/actions.ts), porque un archivo no entra por una
// Server Action sin pasar por el tope del cuerpo de un request a Vercel:
//
//   1. prepararSubidaAdjunto()  → la ruta (la elige el servidor) y el token.
//   2. el navegador sube el archivo directo al bucket con ese token.
//   3. registrarAdjunto()       → lee los bytes reales de lo que llegó; si
//      no es un PDF, un JPEG o un PNG de verdad, o pesa más de 2 MB, borra
//      el archivo y no crea la fila.
//
// Un archivo que se sube y nunca se registra queda sin fila: no lo ve
// nadie, y lo barre el cierre diario (adjuntos_huerfanos()).
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const NO_ESTA_EL_TRABAJO = "No encontramos ese trabajo. Recargá la pantalla y probá de nuevo.";
const NO_SE_PUDO = "No se pudo adjuntar el archivo. Revisá la conexión y probá de nuevo.";

export type SubidaDeAdjunto = { ruta: string; token: string } | { error: string };
export type ResultadoAdjunto = { error?: string };

function revalidarAdjuntos(serviceId: string) {
  revalidatePath(`/panel/services/${serviceId}`);
  // El clip del listado.
  revalidatePath("/panel/services");
}

export async function prepararSubidaAdjunto(datos: {
  serviceId: string;
  mime: string;
  bytes: number;
}): Promise<SubidaDeAdjunto> {
  const sesion = await sesionParaEscribir();

  if (!UUID.test(datos.serviceId)) return { error: NO_ESTA_EL_TRABAJO };
  if (!esMimeAdjunto(datos.mime)) return { error: MENSAJE_FORMATO };
  if (!Number.isFinite(datos.bytes) || datos.bytes <= 0) {
    return { error: "Ese archivo está vacío. Elegilo de nuevo." };
  }
  if (datos.bytes > ADJUNTO_MAX_BYTES) {
    return { error: mensajePesoExcedido(datos.bytes) };
  }

  const supabase = await createClient();

  // El trabajo tiene que existir y ser de este tenant (RLS), y el tope se
  // avisa antes de subir. Quien lo hace cumplir es el trigger de la base:
  // esto es para no subir un archivo que después no va a entrar.
  const { data: service } = await supabase
    .from("services")
    .select("id, adjuntos_trabajo(count)")
    .eq("id", datos.serviceId)
    .maybeSingle();
  if (!service) return { error: NO_ESTA_EL_TRABAJO };
  if ((service.adjuntos_trabajo[0]?.count ?? 0) >= ADJUNTOS_MAXIMO) {
    return { error: MENSAJE_TOPE };
  }

  // La carpeta es el tenant y adentro el trabajo (es lo que la policy del
  // bucket deja escribir y lo que el CHECK de la tabla exige), y el nombre
  // no lo elige el navegador.
  const ruta = rutaDeAdjunto(
    sesion.lubricentroId,
    datos.serviceId,
    crypto.randomUUID(),
    datos.mime,
  );
  const { data, error } = await supabase.storage.from("adjuntos").createSignedUploadUrl(ruta);
  if (error || !data) {
    return { error: "No se pudo preparar la subida. Probá de nuevo en un momento." };
  }
  return { ruta, token: data.token };
}

export async function registrarAdjunto(datos: {
  serviceId: string;
  ruta: string;
  nombre: string;
}): Promise<ResultadoAdjunto> {
  const sesion = await sesionParaEscribir();

  if (!UUID.test(datos.serviceId)) return { error: NO_ESTA_EL_TRABAJO };
  // La ruta vuelve del navegador: tiene que ser la de ESTE trabajo de ESTE
  // tenant antes de leer nada del bucket.
  const extension = extensionDeRutaPropia(datos.ruta, sesion.lubricentroId, datos.serviceId);
  if (!extension) return { error: NO_SE_PUDO };

  const supabase = await createClient();
  const bucket = supabase.storage.from("adjuntos");

  const { data: archivo, error: errorDescarga } = await bucket.download(datos.ruta);
  if (errorDescarga || !archivo) {
    return { error: "El archivo no llegó a subirse. Revisá la conexión y probá de nuevo." };
  }

  // El formato real sale de los bytes, no de la extensión ni del
  // content-type que declaró el navegador. Y el peso, de lo que llegó.
  const mime = mimePorCabecera(new Uint8Array(await archivo.slice(0, 8).arrayBuffer()));
  if (!mime || EXTENSION_DE_MIME[mime] !== extension) {
    await bucket.remove([datos.ruta]);
    return { error: MENSAJE_FORMATO };
  }
  if (archivo.size > ADJUNTO_MAX_BYTES) {
    await bucket.remove([datos.ruta]);
    return { error: mensajePesoExcedido(archivo.size) };
  }

  // Quién lo subió lo pone la base, y «Mostrar al cliente» nace apagado
  // (no se puede mandar acá). El tenant viaja por costumbre de los insert
  // del panel, pero el que queda es el del trabajo: lo pisa el trigger.
  const { error } = await supabase.from("adjuntos_trabajo").insert({
    service_id: datos.serviceId,
    lubricentro_id: sesion.lubricentroId,
    nombre: limpiarNombre(datos.nombre),
    ruta: datos.ruta,
    mime,
    bytes: archivo.size,
  });
  if (error) {
    await bucket.remove([datos.ruta]);
    return { error: error.message.includes("tope_adjuntos") ? MENSAJE_TOPE : NO_SE_PUDO };
  }

  revalidarAdjuntos(datos.serviceId);
  return {};
}

// «Mostrar al cliente»: lo único que se edita de un adjunto.
export async function mostrarAdjuntoAlCliente(
  adjuntoId: string,
  visible: boolean,
): Promise<ResultadoAdjunto> {
  await sesionParaEscribir();
  const sinCambio = { error: "No se pudo cambiar. Recargá la pantalla y probá de nuevo." };
  if (!UUID.test(adjuntoId)) return sinCambio;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("adjuntos_trabajo")
    .update({ visible_cliente: visible })
    .eq("id", adjuntoId)
    .select("service_id");
  if (error || !data || data.length === 0) return sinCambio;

  revalidarAdjuntos(data[0].service_id);
  return {};
}

// Quitar un adjunto es la excepción escrita a «acá no se borra nada»: lo
// que se va es un archivo, no el registro del trabajo. Primero la fila
// —desde ese momento el cliente ya no lo ve— y después el archivo; si el
// segundo paso falla, el archivo queda sin fila y lo barre el cierre
// diario.
export async function quitarAdjunto(adjuntoId: string): Promise<ResultadoAdjunto> {
  await sesionParaEscribir();
  const sinQuitar = { error: "No se pudo quitar el adjunto. Recargá la pantalla y probá de nuevo." };
  if (!UUID.test(adjuntoId)) return sinQuitar;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("adjuntos_trabajo")
    .delete()
    .eq("id", adjuntoId)
    .select("service_id, ruta");
  if (error || !data || data.length === 0) return sinQuitar;

  await supabase.storage.from("adjuntos").remove([data[0].ruta]);

  revalidarAdjuntos(data[0].service_id);
  return {};
}
