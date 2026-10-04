import { FOTO_CALIDAD, medidasAchicadas } from "@/lib/adjuntos";

// ============================================================
// Achicar una foto EN EL NAVEGADOR, antes de pedir la URL de subida.
//
// Una foto de celular pesa de 3 a 8 MB y el tope de un adjunto es 2: no se
// la rechaza, se la achica. Sale a 1.600 px de lado mayor como mucho, en
// JPEG al 80 %, y queda en unos cientos de KB. Lo hace el teléfono del
// mecánico y no el servidor porque así el archivo grande no viaja nunca:
// con la señal de un taller, subir 6 MB para que el servidor los tire es
// la diferencia entre adjuntar y no adjuntar.
//
// Solo corre en el navegador (usa canvas): lo importa el componente de
// cliente y nadie más.
// ============================================================

type Dibujable = { fuente: CanvasImageSource; ancho: number; alto: number; soltar: () => void };

// createImageBitmap respeta la orientación EXIF de la cámara (una foto
// sacada con el teléfono de costado no sale acostada). Si el navegador no
// lo tiene, o no puede con el archivo, queda el <img> de toda la vida.
async function decodificar(archivo: Blob): Promise<Dibujable | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const mapa = await createImageBitmap(archivo, { imageOrientation: "from-image" });
      return { fuente: mapa, ancho: mapa.width, alto: mapa.height, soltar: () => mapa.close() };
    } catch {
      // Sigue por el <img>.
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      fuente: img,
      ancho: img.naturalWidth,
      alto: img.naturalHeight,
      soltar: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** La foto achicada, en JPEG. null si el navegador no pudo leer el archivo
 *  (un formato que no decodifica, un archivo roto). */
export async function achicarFoto(
  archivo: Blob,
  calidad: number = FOTO_CALIDAD,
): Promise<Blob | null> {
  const imagen = await decodificar(archivo);
  if (!imagen) return null;

  try {
    const { ancho, alto } = medidasAchicadas(imagen.ancho, imagen.alto);
    if (ancho === 0 || alto === 0) return null;

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;

    // El JPEG no tiene transparencia: un PNG con fondo transparente sale
    // sobre blanco y no sobre negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen.fuente, 0, 0, ancho, alto);

    return await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, "image/jpeg", calidad),
    );
  } finally {
    imagen.soltar();
  }
}
