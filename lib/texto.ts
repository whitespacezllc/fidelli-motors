// Búsqueda sin tildes ni mayúsculas: "gomez" encuentra "Gómez".
// Mismo criterio que fm_unaccent() en la base.
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Deja solo letras, números y espacios. Los filtros de PostgREST se arman
// como texto ("campo.like.*algo*,otro.like.*algo*"), así que la coma, el
// punto, el paréntesis y el asterisco tienen significado: si el término del
// usuario los lleva, puede cambiar la consulta. Se sacan antes de armarla.
export function sanitizarBusqueda(texto: string): string {
  return texto
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Misma normalización que el trigger normalizar_patente() de la base:
// "ab 123 cd" · "AB-123-CD" → "AB123CD".
export function normalizarPatente(texto: string): string {
  return texto.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Los dos formatos que acepta el CHECK de vehiculos. Se repiten acá para
// poder avisar en el formulario: es mejor que comerse el rechazo del server.
const PATENTE_VIEJA = /^[A-Z]{3}[0-9]{3}$/; // ABC123
const PATENTE_MERCOSUR = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/; // AB123CD

export const PATENTE_FORMATO = "La patente tiene que ser ABC 123 o AB 123 CD.";

export function esPatenteValida(texto: string): boolean {
  const normalizada = normalizarPatente(texto);
  return PATENTE_VIEJA.test(normalizada) || PATENTE_MERCOSUR.test(normalizada);
}

// Cómo se lee en la chapa: "ABC123" → "ABC 123", "AB123CD" → "AB 123 CD".
// Lo que no entra en ninguno de los dos formatos se devuelve tal cual.
export function formatearPatente(texto: string): string {
  const n = normalizarPatente(texto);
  if (PATENTE_VIEJA.test(n)) return `${n.slice(0, 3)} ${n.slice(3)}`;
  if (PATENTE_MERCOSUR.test(n)) return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  return n;
}
