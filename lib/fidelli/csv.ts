// ============================================================
// CSV para Excel en español (docs/METRICAS.md § 1 «Data room»,
// docs/DATA-ROOM.md).
//
// Un CSV que Excel es-AR abra con doble clic y muestre bien tiene cuatro
// condiciones, y las cuatro se deciden acá y en ningún otro lado:
//
//   · separador `;` — el Excel en español usa la coma como decimal, así que
//     el separador de campos es el punto y coma (es lo que hace su propio
//     «Guardar como CSV»);
//   · decimales con coma — `1234,5`, sin separador de miles: un `1.234,5`
//     es ambiguo para cualquier otra herramienta y Excel lo entiende igual;
//   · UTF-8 con BOM — sin los tres bytes EF BB BF, Excel asume la página
//     de códigos de Windows y «San Martín» sale como «San MartÃ­n»;
//   · escapado RFC 4180 — un campo que trae `;`, comillas, salto de línea
//     o retorno de carro va entre comillas dobles, y las comillas de
//     adentro se duplican. Las líneas terminan en CRLF, como pide la RFC.
//
// Son funciones puras, sin librerías y sin importar nada: se prueban con
// node a secas (ver scratchpad/b4/prueba-csv.mjs). Lo que sabe de fechas,
// zonas horarias y de la base vive en lib/fidelli/exportar.ts.
// ============================================================

/** Lo que puede ir en una celda. Null y undefined salen vacíos. */
export type Celda = string | number | boolean | null | undefined;

export const SEPARADOR = ";";
// Escrito como escape y no como el carácter literal: U+FEFF es invisible en
// el editor, y un formateador o un «quitar BOM» del editor lo dejaría en ""
// sin que nadie lo note (y Excel volvería a mostrar «San MartÃ­n»).
export const BOM = "\uFEFF";
export const FIN_DE_LINEA = "\r\n";

// Un número como lo escribe una persona en Argentina: coma decimal y sin
// miles. String(n) nunca usa separador de miles y solo mete un punto (el
// decimal), así que alcanza con cambiarlo. Los no finitos (NaN, ±Infinity)
// no son datos: salen vacíos antes que como texto raro.
export function numeroConComa(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

// Cada tipo a su texto. Los booleanos salen como «sí» / «no»: es lo que
// lee una persona en Excel; quien necesite 1/0 lo resuelve con un filtro.
export function celdaATexto(v: Celda): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return numeroConComa(v);
  if (typeof v === "boolean") return v ? "sí" : "no";
  return v;
}

// Lo que arranca con `=`, `+`, `-`, `@` o una tabulación Excel lo puede
// interpretar como FÓRMULA aunque venga de un CSV (son los prefijos que
// OWASP lista para la inyección en CSV). Los nombres de los tenants, los
// de los usuarios y los motivos los escribe gente: un «=HYPERLINK(...)»
// en un nombre no puede ejecutarse en la planilla de quien exporta. Se
// antepone un apóstrofo, que es la señal universal de «esto es texto» en
// las planillas.
//
// Pero el apóstrofo ALTERA el dato (al abrir un CSV Excel lo muestra, y
// cualquier otra herramienta lo lee como parte del valor), así que se pone
// solo cuando hace falta:
//   · `=` y la tabulación, siempre: ningún dato de esta plataforma arranca
//     así, y un «= hola» o un «=1+1» Excel igual los evalúa (#NAME?, 2).
//   · `+`, `-` y `@`, solo si el resto NO es un número o un teléfono
//     (dígitos, espacios, paréntesis, puntos, comas, barras y guiones):
//     un «+54 9 351 555-0000» (así lo guarda el form de pauta y así lo
//     tipea el owner en su WhatsApp), un «-3» o un «-» solo son texto
//     normal y Excel no los evalúa; un «+cmd|…», un «- cmd|…» (el espacio
//     no lo frena: Excel lo ignora dentro de una fórmula) o un «@SUM(…)»
//     sí, y llevan el apóstrofo.
//
// Y hay un caso donde ni eso alcanza: un teléfono con una anotación
// («+54 9 351 555-0001 (Juan)», «… int 2», o una segunda línea) arranca
// con `+` y el resto ya no es solo dígitos, así que llevaría apóstrofo y
// el dato cambiaría para cualquier herramienta que no sea Excel. Por eso
// armarLinea y armarCsv aceptan `exentas`: por columna, «esta no se
// neutraliza». La condición para eximir una columna no es «parece un
// teléfono» (una regla que deje pasar texto después de un número tiene
// que razonar sobre la gramática de Excel: «+549351… -cmd|…» es una resta
// válida) sino QUIÉN LA ESCRIBE: solo el equipo, por una puerta con guarda
// soy_superadmin(). Quien puede cargar esa celda ya tiene el admin entero
// y no gana nada metiéndole una fórmula a su propia planilla. El teléfono
// de un tenant lo escribe el owner y sigue neutralizado.
const ARRANCA_SIEMPRE_COMO_FORMULA = /^[=\t]/;
const ARRANCA_SEGUN_EL_RESTO = /^[+\-@]/;
const RESTO_ES_NUMERO_O_TELEFONO = /^[\d\s().,\/-]*$/;

export function neutralizarFormula(texto: string): string {
  if (ARRANCA_SIEMPRE_COMO_FORMULA.test(texto)) return `'${texto}`;
  if (ARRANCA_SEGUN_EL_RESTO.test(texto) && !RESTO_ES_NUMERO_O_TELEFONO.test(texto.slice(1))) {
    return `'${texto}`;
  }
  return texto;
}

// RFC 4180 § 2.6 y 2.7: comillas alrededor si hay separador, comillas,
// LF o CR; las comillas internas se duplican. Un campo sin nada de eso
// va pelado, que es lo que Excel espera para los números y las fechas.
const NECESITA_COMILLAS = /[";\r\n]/;

export function escaparCampo(texto: string): string {
  if (!NECESITA_COMILLAS.test(texto)) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

// `exentas[i] = true` dice que la columna i NO se neutraliza (ver arriba:
// solo una columna que escribe únicamente el equipo). Sin el arreglo, se
// neutralizan todas.
export function armarLinea(celdas: readonly Celda[], exentas?: readonly boolean[]): string {
  return celdas
    .map((c, i) => {
      const texto = celdaATexto(c);
      // Solo el texto libre puede ser una fórmula: los números y los
      // booleanos ya salieron de acá con su forma fija.
      const neutralizar = typeof c === "string" && !exentas?.[i];
      return escaparCampo(neutralizar ? neutralizarFormula(texto) : texto);
    })
    .join(SEPARADOR);
}

// El archivo entero: BOM, encabezados, una línea por fila y CRLF al final
// de cada una (también de la última: así lo pide la RFC y así lo escribe
// Excel). Un recurso sin filas da un CSV con los encabezados solos: se
// abre y se ve que no hay datos, que es distinto de un archivo roto.
export function armarCsv(
  encabezados: readonly string[],
  filas: readonly (readonly Celda[])[],
  exentas?: readonly boolean[],
): string {
  const lineas = [armarLinea(encabezados), ...filas.map((f) => armarLinea(f, exentas))];
  return BOM + lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}
