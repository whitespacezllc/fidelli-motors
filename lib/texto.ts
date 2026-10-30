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

// EL SLUG ENTRA EN EL QR DEL CALCO. Lo que va impreso en el QR es el
// dominio más el slug, y cada carácter de más le saca resistencia: con más
// de 18 el QR tolera menos roce y menos mugre (un parasol es justo eso), y
// con más de 32 directamente no se puede hacer —un tenant entró con 34 y
// hubo que acortarlo—. El tope lo hace cumplir la base (CHECK
// slug_largo_qr, y slug_estado() lo dice antes de escribir); acá se repite
// para avisar mientras se escribe.
export const SLUG_MAXIMO = 32;
export const SLUG_AVISO_QR = 18;

/** El slug que se propone desde el nombre, ya dentro del tope: un nombre
 *  largo no puede proponer un slug que la base va a rechazar. */
export function slugSugerido(nombre: string): string {
  return slugificar(nombre).slice(0, SLUG_MAXIMO).replace(/-+$/, "");
}

/** El aviso del QR, o null si el slug no lo necesita. Avisa, no frena:
 *  entre 19 y 32 caracteres el slug vale. */
export function avisoSlugQr(slug: string): string | null {
  if (slug.length <= SLUG_AVISO_QR) return null;
  return `Con más de ${SLUG_AVISO_QR} caracteres el QR del calco pierde resistencia. Este tiene ${slug.length}.`;
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

// ============================================================
// Los formatos de patente que acepta Fidelli. La fuente única vive en la
// base (patente_formato_valido, que usan el CHECK de vehiculos y
// corregir_patente); se repiten acá para poder avisar en el formulario: es
// mejor que comerse el rechazo del server. scripts/regresion-patentes.mjs
// compara las dos listas forma por forma, así que no se pueden desviar sin
// que la prueba lo acuse.
//
// Cada formato está escrito como se lee en la chapa: L es una letra, N un
// número y el espacio es el que lleva impreso (sirve para mostrarla). De la
// lista salen las cuatro funciones de abajo: validar, saber si es
// argentina, detectar la que está a medio tipear y mostrarla con espacios.
//
// Las argentinas (Casa Rosada / DNRPA, sistema 1995 y Mercosur). La
// disposición de letras y números distingue auto de moto sin preguntar.
const FORMATOS_ARGENTINOS = [
  "LLL NNN", // auto 1995-2016   ABC 123
  "LL NNN LL", // auto Mercosur    AB 123 CD
  "NNN LLL", // moto 1995-2016   123 ABC
  "L NNN LLL", // moto Mercosur    A 123 BCD
];

// Las de los países vecinos (26/10/2026; lo pidió Lubricheck Sassi, que
// tiene clientes con chapa de Brasil, Uruguay, Paraguay, Bolivia y Chile:
// autos de paso, y gente que vivió afuera y volvió con el auto). Las chapas
// viejas de Brasil y de Chile siguen vigentes en sus países —nunca se
// reemplazaron—, así que entran. Las viejas de Paraguay (ABC 123 y 123 ABC)
// ya entraban por los formatos argentinos.
const FORMATOS_VECINOS = [
  "LLLNLNN", // Brasil Mercosur, autos y motos (2018→)       ABC1D23, la chapa va sin espacios
  "LLL NNNN", // Brasil hasta 2018, y Uruguay (2015→)        ABC 1234
  "LLLL NNN", // Paraguay Mercosur, autos (2019→)            ABCD 123
  "NNN LLLL", // Paraguay Mercosur, motos                    123 ABCD
  "NNNN LLL", // Bolivia, autos y motos                      1234 ABC
  "LL NNNNN", // Bolivia Mercosur, transporte internacional  AB 12345
  "LLLL NN", // Chile, autos (2007→)                         ABCD 12
  "LL NNNN", // Chile, autos 1985-2007                       AB 1234
  "LLL NN", // Chile, motos (2014→)                          ABC 12
];
// Quedan afuera a propósito: las motos chilenas anteriores a 2014 (AB 123:
// son los primeros cinco caracteres de toda patente argentina Mercosur y
// romperían la búsqueda del alta), los dos formatos chilenos del decreto de
// enero de 2026 (LLLLL N y LLLL N, que no se emiten hasta 2029 y 2027: una
// línea acá y otra en la base cuando aparezcan), las chapas de una letra y
// seis dígitos (Argentina antes de 1995, Paraguay antes de 2000, el interior
// de Uruguay antes de 2015) y las series diplomáticas.

const FORMATOS = [...FORMATOS_ARGENTINOS, ...FORMATOS_VECINOS];

/** "LL NNN LL" → "LLNNNLL": la forma, sin los espacios de la chapa. */
const forma = (formato: string) => formato.replace(/ /g, "");
const FORMAS = FORMATOS.map(forma);
const FORMAS_ARGENTINAS = FORMATOS_ARGENTINOS.map(forma);

// Cada carácter de la patente es lo que la forma dice en ese lugar: letra
// donde hay L, número donde hay N. Mira solo los caracteres que la patente
// tiene: con una forma del mismo largo es «tiene esta forma», con una más
// larga es «es el principio de esta forma».
function calza(n: string, f: string): boolean {
  for (let i = 0; i < n.length; i++) {
    const c = n.charCodeAt(i);
    const letra = c >= 65 && c <= 90;
    const numero = c >= 48 && c <= 57;
    if (f.charAt(i) === "L" ? !letra : !numero) return false;
  }
  return true;
}
const tieneForma = (n: string, f: string) => n.length === f.length && calza(n, f);
const esPrincipioDe = (n: string, f: string) => n.length < f.length && calza(n, f);

export function esPatenteValida(texto: string): boolean {
  const n = normalizarPatente(texto);
  return FORMAS.some((f) => tieneForma(n, f));
}

/** ¿Es uno de los cuatro formatos argentinos? El alta la busca sin esperar:
 *  ninguna patente argentina es el principio de otra argentina. Una vecina
 *  sí puede ser el principio de una argentina (ABC 12, la moto chilena, lo
 *  es de ABC 123) o de otra vecina (ABCD 12 de ABCD 123), y por eso espera
 *  los 300 ms del debounce, como cualquier cosa que no cierra en un formato
 *  argentino: si saliera al toque, toda ABC 123 se buscaría dos veces. */
export function esPatenteArgentina(texto: string): boolean {
  const n = normalizarPatente(texto);
  return FORMAS_ARGENTINAS.some((f) => tieneForma(n, f));
}

export const PATENTE_FORMATO =
  "No parece una patente. Las argentinas son ABC 123 o AB 123 CD (123 ABC o A 123 BCD si es una moto); también entran las de Brasil, Uruguay, Paraguay, Bolivia y Chile.";

// Una patente normalizada tiene entre 5 (ABC12, la moto chilena) y 7
// caracteres. Lo que tenga letras y números y no pase de 7 se trata como
// patente en las búsquedas; más largo, no puede serlo.
export const PATENTE_LARGO_MINIMO = Math.min(...FORMAS.map((f) => f.length));
export const PATENTE_LARGO_MAXIMO = Math.max(...FORMAS.map((f) => f.length));

/** ¿Es el principio de una patente sin ser todavía ninguna? AB123C va a ser
 *  AB123CD y ABC1D2 va a ser ABC1D23: buscarlas sería buscar otra cosa (y
 *  mostrar «¿De quién es?» a mitad de tipeo). Lo que tiene menos de 5
 *  también está incompleto. Una patente válida nunca lo está, aunque sea el
 *  principio de otra: ABC 123 se busca, y si le sigue un 4 se busca de nuevo. */
export function patenteIncompleta(texto: string): boolean {
  const n = normalizarPatente(texto);
  if (n.length < PATENTE_LARGO_MINIMO) return true;
  if (FORMAS.some((f) => tieneForma(n, f))) return false;
  return FORMAS.some((f) => esPrincipioDe(n, f));
}

// Cómo se lee en la chapa: "ABC123" → "ABC 123", "AB123CD" → "AB 123 CD",
// "ABC1234" → "ABC 1234", "ABCD12" → "ABCD 12"; "ABC1D23" queda así, porque
// la chapa brasileña no lleva espacios. Lo que no entra en ningún formato
// se devuelve tal cual.
export function formatearPatente(texto: string): string {
  const n = normalizarPatente(texto);
  const formato = FORMATOS.find((f) => tieneForma(n, forma(f)));
  if (!formato) return n;
  let i = 0;
  return formato.replace(/[LN]/g, () => n.charAt(i++));
}
