"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";

export type EstadoExperiencia = { error?: string; ok?: boolean };

const HEX = /^#[0-9A-Fa-f]{6}$/;

// La landing es pública y puede estar cacheada: todo cambio de acá tiene
// que verse reflejado en /[slug] y en las pantallas del vehículo.
async function revalidarSuperficiePublica(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("lubricentros").select("slug").maybeSingle();
  if (data?.slug) {
    // El modo layout revalida el path y todo lo que cuelga: la landing y
    // cada /slug/patente ya renderizada.
    revalidatePath(`/${data.slug}`, "layout");
  }
  revalidatePath("/panel/experiencia");
}

export async function guardarExperiencia(
  _previo: EstadoExperiencia,
  formData: FormData,
): Promise<EstadoExperiencia> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const color = String(formData.get("color") ?? "").trim().toUpperCase();
  if (!HEX.test(color)) {
    return { error: "El color tiene que ser un hex de 6 dígitos, como #15803D." };
  }

  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const instagram = String(formData.get("instagram") ?? "").trim();
  const facebook = String(formData.get("facebook") ?? "").trim();

  // El WhatsApp es el canal por el que el cliente pide turno: si está,
  // tiene que parecer un teléfono.
  if (whatsapp && whatsapp.replace(/\D/g, "").length < 8) {
    return { error: "Ese WhatsApp parece incompleto. Escribilo con código de área: 351 555 4120." };
  }

  const supabase = await createClient();

  const { data: actual } = await supabase
    .from("config_experiencia")
    .select("datos_contacto, campos_visibles")
    .maybeSingle();

  if (!actual) {
    return { error: "No encontramos la configuración de tu lubricentro. Recargá la pantalla." };
  }

  // Se pisa solo lo que esta pantalla edita. Las claves viejas del jsonb
  // (direccion/horarios de antes de la división de responsabilidades)
  // quedan como estaban: la landing ya no las muestra, y borrarlas acá
  // sería destruir datos sin necesidad.
  const contacto = {
    ...(actual.datos_contacto as Record<string, unknown>),
    whatsapp: whatsapp || null,
    instagram: instagram || null,
    facebook: facebook || null,
  };

  const visibles = {
    ...(actual.campos_visibles as Record<string, unknown>),
    mostrar_productos: formData.get("mostrar_productos") === "on",
    mostrar_sucursal: formData.get("mostrar_sucursal") === "on",
    mostrar_fidelizacion: formData.get("mostrar_fidelizacion") === "on",
    mostrar_observaciones: formData.get("mostrar_observaciones") === "on",
  };

  const { error } = await supabase
    .from("config_experiencia")
    .update({
      color_primario: color,
      datos_contacto: contacto,
      campos_visibles: visibles,
      updated_at: new Date().toISOString(),
    })
    .eq("lubricentro_id", sesion.lubricentroId);

  if (error) {
    if (error.code === "23514") {
      return { error: "El color tiene que ser un hex de 6 dígitos, como #15803D." };
    }
    return { error: "No se pudo guardar. Revisá la conexión y probá de nuevo." };
  }

  await revalidarSuperficiePublica(supabase);
  return { ok: true };
}

// ---------- El logo ----------

export type EstadoLogo = { error?: string; ok?: boolean };

const DOS_MB = 2 * 1024 * 1024;

// El tipo real sale de los bytes, no de la extensión ni del content-type
// que declare el navegador. Un SVG disfrazado de .png muere acá.
function tipoRealDeImagen(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

// Un solo archivo por tenant, con nombre fijo por formato: al cambiar de
// formato se borran los otros para no dejar copias viejas servibles.
const NOMBRES = ["logo.png", "logo.jpg", "logo.webp"];

export async function subirLogo(
  _previo: EstadoLogo,
  formData: FormData,
): Promise<EstadoLogo> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elegí un archivo primero." };
  }

  if (archivo.size > DOS_MB) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return {
      error: `Ese archivo pesa ${mb} MB y el máximo es 2 MB: un logo más pesado hace lenta la página de tus clientes. Achicalo y volvé a subirlo.`,
    };
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoRealDeImagen(bytes);
  if (!tipo) {
    return {
      error: "Ese formato no está soportado. Subí el logo en PNG, JPG o WEBP.",
    };
  }

  const supabase = await createClient();
  const carpeta = sesion.lubricentroId;
  const path = `${carpeta}/logo.${tipo.ext}`;

  // Primero se limpian los formatos anteriores, después se sube el nuevo.
  await supabase.storage.from("logos").remove(NOMBRES.map((n) => `${carpeta}/${n}`));

  const { error: errorSubida } = await supabase.storage
    .from("logos")
    .upload(path, bytes, { contentType: tipo.mime, upsert: true });

  if (errorSubida) {
    return { error: "No se pudo subir el logo. Revisá la conexión y probá de nuevo." };
  }

  // La URL pública lleva un sello de versión: sin él, el navegador del
  // cliente puede seguir mostrando el logo anterior cacheado.
  const { data: publica } = supabase.storage.from("logos").getPublicUrl(path);
  const url = `${publica.publicUrl}?v=${Date.now()}`;

  const { error: errorConfig } = await supabase
    .from("config_experiencia")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("lubricentro_id", sesion.lubricentroId);

  if (errorConfig) {
    return { error: "El logo subió pero no se pudo guardar. Probá de nuevo." };
  }

  await revalidarSuperficiePublica(supabase);
  return { ok: true };
}

export async function quitarLogo(): Promise<EstadoLogo> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const supabase = await createClient();
  await supabase.storage
    .from("logos")
    .remove(NOMBRES.map((n) => `${sesion.lubricentroId}/${n}`));

  const { error } = await supabase
    .from("config_experiencia")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("lubricentro_id", sesion.lubricentroId);

  if (error) return { error: "No se pudo quitar el logo. Probá de nuevo." };

  await revalidarSuperficiePublica(supabase);
  return { ok: true };
}
