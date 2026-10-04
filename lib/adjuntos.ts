// ============================================================
// Los adjuntos de un trabajo: el PDF o la foto del diagnóstico.
//
// Las reglas viven en la base (20261004200000_adjuntos_trabajo.sql): el
// tope de 3 por trabajo es un trigger, los 2 MB y los tres formatos son
// del bucket y de la tabla, y «Mostrar al cliente» nace apagado porque la
// columna no se puede mandar en el alta. Acá se repiten para avisar ANTES
// de subir —un PDF de 9 MB no tiene por qué viajar para ser rechazado— y
// para leer los bytes de lo que llegó.
//
// Este módulo no importa nada del servidor ni del navegador: lo usan la
// pantalla (para achicar y avisar), las acciones (para validar) y la
// regresión (que lo compila suelto).
// ============================================================

/** Hasta cuántos adjuntos lleva un trabajo. El trigger de la base es el
 *  que lo hace cumplir (`tope_adjuntos`). */
export const ADJUNTOS_MAXIMO = 3;

/** 2 MB por archivo: el tope del bucket y el CHECK de la tabla. */
export const ADJUNTO_MAX_BYTES = 2 * 1024 * 1024;

export const MIMES_ADJUNTO = ["application/pdf", "image/jpeg", "image/png"] as const;
export type MimeAdjunto = (typeof MIMES_ADJUNTO)[number];

export function esMimeAdjunto(v: string): v is MimeAdjunto {
  return (MIMES_ADJUNTO as readonly string[]).includes(v);
}

/** La extensión del objeto en el bucket. La base exige que coincida con el
 *  formato (CHECK adjunto_ruta_valida). */
export const EXTENSION_DE_MIME: Record<MimeAdjunto, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Cómo se nombra el formato en pantalla. Una foto es una foto: al dueño
 *  del auto no le dice nada si es JPEG o PNG. */
export const ETIQUETA_MIME: Record<MimeAdjunto, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Foto",
  "image/png": "Foto",
};

export function esImagen(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png";
}

// ---------- Las fotos se achican en el navegador ----------
// Una foto de celular pesa de 3 a 8 MB. Antes de pedir la URL de subida se
// la lleva a 1.600 px de lado mayor y se exporta como JPEG al 80 %: queda
// en unos cientos de KB y se lee igual en la pantalla del cliente.
export const FOTO_LADO_MAXIMO = 1600;
export const FOTO_CALIDAD = 0.8;

/** Las medidas de la foto ya achicada: el lado mayor a 1.600 px como
 *  mucho, la proporción intacta, y NUNCA más grande que la original. */
export function medidasAchicadas(
  ancho: number,
  alto: number,
  ladoMaximo: number = FOTO_LADO_MAXIMO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (!(mayor > 0)) return { ancho: 0, alto: 0 };
  const escala = Math.min(1, ladoMaximo / mayor);
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

// ---------- El peso, como se lee ----------
// "412 KB", "1,2 MB". KB sin decimales, MB con uno: es lo que alcanza para
// decidir si un archivo es grande.
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** El rechazo de un archivo que pasa los 2 MB, antes de subirlo. */
export function mensajePesoExcedido(bytes: number): string {
  const mb = (bytes / 1024 / 1024).toFixed(1).replace(".", ",");
  return `Pesa ${mb} MB. El máximo es 2 MB.`;
}

// ---------- El nombre del archivo, limpio ----------
// Es lo que se lee en el panel y lo que ve el cliente. Sale del nombre que
// trae el archivo: sin la carpeta (algunos navegadores mandan la ruta),
// sin caracteres de control, con los espacios en uno, y con tope —el CHECK
// de la tabla admite hasta 120—. Si no queda nada, «Adjunto».
export const NOMBRE_MAXIMO = 120;

export function limpiarNombre(nombre: string): string {
  const sinCarpeta = nombre.split(/[\\/]/).pop() ?? "";
  const limpio = sinCarpeta
    // Primero los espacios (un tabulador o un salto de línea son un
    // espacio), después lo que quede de control, que no es nada visible.
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (limpio.length === 0) return "Adjunto";
  if (limpio.length <= NOMBRE_MAXIMO) return limpio;
  // Se recorta el nombre, no la extensión: «…informe.pdf» sigue diciendo
  // qué es.
  const punto = limpio.lastIndexOf(".");
  const extension = punto > 0 && limpio.length - punto <= 6 ? limpio.slice(punto) : "";
  return limpio.slice(0, NOMBRE_MAXIMO - extension.length).trimEnd() + extension;
}

/** «Escaneo de caja.pdf» → «Escaneo de caja». Para la línea del cliente,
 *  que ya dice el formato aparte. */
export function nombreSinExtension(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  if (punto <= 0 || nombre.length - punto > 6) return nombre;
  return nombre.slice(0, punto);
}

/** Una foto achicada sale siempre en JPEG: su nombre cambia de extensión
 *  para decir lo que es. «IMG_2041.HEIC» → «IMG_2041.jpg». */
export function nombreDeFoto(nombre: string): string {
  const base = nombreSinExtension(limpiarNombre(nombre));
  return `${base || "Foto"}.jpg`;
}

// ---------- El formato real, por los bytes ----------
// Ni la extensión ni el content-type que declaró el navegador: los
// primeros bytes del archivo que llegó al bucket. Mismo criterio que el
// logo y que el diseño del calco.
export function mimePorCabecera(bytes: Uint8Array): MimeAdjunto | null {
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  // FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // 89 P N G \r \n 1A \n
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

// ---------- La ruta del objeto ----------
// <lubricentro_id>/<service_id>/<uuid>.<ext>. La arma el servidor; acá se
// la valida cuando vuelve del navegador, antes de leer nada del bucket.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FORMATO_RUTA = new RegExp(`^(${UUID})/(${UUID})/${UUID}\\.(pdf|jpg|png)$`);

export function rutaDeAdjunto(
  lubricentroId: string,
  serviceId: string,
  id: string,
  mime: MimeAdjunto,
): string {
  return `${lubricentroId}/${serviceId}/${id}.${EXTENSION_DE_MIME[mime]}`;
}

/** ¿Esta ruta es de ESTE trabajo de ESTE tenant? Devuelve la extensión, o
 *  null si la ruta no tiene la forma o apunta a otra carpeta. */
export function extensionDeRutaPropia(
  ruta: string,
  lubricentroId: string,
  serviceId: string,
): string | null {
  const m = FORMATO_RUTA.exec(ruta);
  if (!m || m[1] !== lubricentroId || m[2] !== serviceId) return null;
  return m[3];
}

// ---------- Los mensajes ----------
export const MENSAJE_TOPE =
  "Este trabajo ya tiene 3 adjuntos. Quitá uno para sumar otro.";
export const MENSAJE_FORMATO =
  "Ese archivo no es un PDF ni una foto. Adjuntá el PDF del diagnóstico o una foto en JPG o PNG.";
