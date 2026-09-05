// Búsqueda sin tildes ni mayúsculas: "gomez" encuentra "Gómez".
// Mismo criterio que fm_unaccent() en la base.
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// "Brothers Oil" → "brothers-oil". El mismo formato que exige el CHECK
// slug_formato de lubricentros: minúsculas, números y guiones simples.
// Es una sugerencia mientras se escribe el nombre, no una garantía: quien da
// de alta puede cambiarla, y la base valida igual.
export function slugificar(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

// Los cuatro formatos que acepta el CHECK de vehiculos. La fuente única
// vive en la base (patente_formato_valido); se repiten acá para poder
// avisar en el formulario: es mejor que comerse el rechazo del server.
//
//   Auto 1995-2016  ABC123 · Auto Mercosur  AB123CD
//   Moto 1995-2016  123ABC · Moto Mercosur  A123BCD
//
// La disposición de letras y números distingue auto de moto sin preguntar.
const PATENTE_VIEJA = /^[A-Z]{3}[0-9]{3}$/; // ABC123
const PATENTE_MERCOSUR = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/; // AB123CD
const PATENTE_MOTO_VIEJA = /^[0-9]{3}[A-Z]{3}$/; // 123ABC
const PATENTE_MOTO_MERCOSUR = /^[A-Z][0-9]{3}[A-Z]{3}$/; // A123BCD

export const PATENTE_FORMATO =
  "La patente tiene que ser ABC 123 o AB 123 CD. Si es una moto, 123 ABC o A 123 BCD.";

export function esPatenteValida(texto: string): boolean {
  const n = normalizarPatente(texto);
  return (
    PATENTE_VIEJA.test(n) ||
    PATENTE_MERCOSUR.test(n) ||
    PATENTE_MOTO_VIEJA.test(n) ||
    PATENTE_MOTO_MERCOSUR.test(n)
  );
}

// Cómo se lee en la chapa: "ABC123" → "ABC 123", "AB123CD" → "AB 123 CD",
// "123ABC" → "123 ABC", "A123BCD" → "A 123 BCD".
// Lo que no entra en ningún formato se devuelve tal cual.
export function formatearPatente(texto: string): string {
  const n = normalizarPatente(texto);
  if (PATENTE_VIEJA.test(n) || PATENTE_MOTO_VIEJA.test(n)) {
    return `${n.slice(0, 3)} ${n.slice(3)}`;
  }
  if (PATENTE_MERCOSUR.test(n)) {
    return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  if (PATENTE_MOTO_MERCOSUR.test(n)) {
    return `${n.slice(0, 1)} ${n.slice(1, 4)} ${n.slice(4)}`;
  }
  return n;
}
