// ============================================================
// EL ALIAS DEL TENANT, DEL LADO DE TypeScript
//
// Dos cosas que NO son lo mismo y por eso viven separadas, igual que
// `clasePorMarca()` y `esClaseVehiculo()` en lib/clase-vehiculo.ts:
//
//   · `aliasSugerido()` PROPONE. Es ayuda de UI: recorta el slug para que
//     el formulario tenga algo escrito. No es una regla de negocio y por
//     eso no va a la base.
//   · `esAliasValido()` ACEPTA O RECHAZA. Es una COPIA de la regla, que
//     vive en `alias_formato_valido()` (migración 20260917120000), y está
//     acá SOLO PARA AVISAR antes del rechazo del server. Mismo patrón que
//     `patente_formato_valido()` / `lib/texto.ts`.
//
// Nunca se llaman entre sí.
//
// ⚠ LOS DOS LARGOS SON UNA COPIA, y la copia se puede desincronizar. La
// fuente son `alias_largo_minimo()` y `alias_largo_maximo()` en la base, y
// el formulario los pide por RPC para no adivinarlos. Estos dos números
// existen para el caso en que la consulta no conteste: sirven para
// recortar la sugerencia, nunca para decidir si un alias entra.
// ============================================================

/** El piso y el techo del estándar argentino de alias CBU/CVU. Espejo de
 *  `alias_largo_minimo()` / `alias_largo_maximo()`, pendientes de que
 *  Cresium los confirme. */
export const ALIAS_LARGO_MINIMO = 6;
export const ALIAS_LARGO_MAXIMO = 20;

/** El prefijo con el que ya venimos pidiendo alias en producción.
 *
 *  ⚠ ES `fm.` Y NO `fidelli.`: son tres caracteres, no ocho. La tabla del
 *  brief hace las cuentas con `fidelli.` y la conclusión no cambia (ningún
 *  slug real entra en 20 caracteres de ninguna de las dos formas), pero los
 *  números de esa tabla no son los del código. */
export const ALIAS_PREFIJO = "fm.";

/** La misma expresión que `alias_formato_valido()`. SOLO AVISA. */
const FORMATO = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/** El mensaje que ve el superadmin, exportado para que el aviso del
 *  formulario y la traducción del error del server digan lo mismo. */
export const ALIAS_FORMATO =
  `Minúsculas, números y puntos simples, entre ${ALIAS_LARGO_MINIMO} y ${ALIAS_LARGO_MAXIMO} caracteres.`;

export function esAliasValido(alias: string): boolean {
  const a = alias.trim().toLowerCase();
  return (
    a.length >= ALIAS_LARGO_MINIMO &&
    a.length <= ALIAS_LARGO_MAXIMO &&
    FORMATO.test(a)
  );
}

// ============================================================
// La sugerencia
//
// Sale del slug —que es lo que el superadmin acaba de elegir y lo que el
// dueño reconoce— recortado al largo válido. Es una SUGERENCIA: el campo
// es editable y quien manda el formulario está eligiendo, igual que con la
// clase de vehículo.
//
// ⚠ LOS ACENTOS SE TRANSLITERAN, NO SE BORRAN. `aliasDeOrden()` hace
// `.replace(/[^a-z0-9]/gi, "")` sobre el NOMBRE del lubricentro, y eso
// convierte "Gomería" en "Gomera": come la í en vez de pasarla a i. Acá se
// normaliza primero (NFD + sacar diacríticos), así que "Lubricentro y
// Gomería El Colo" da `gomeria` y no `gomera`. Se arregla a propósito y no
// se hereda: un alias es lo que alguien tipea en su home banking.
// ============================================================

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Un alias propuesto a partir del slug, recortado al largo válido.
 *
 * Devuelve `""` cuando no queda nada utilizable (un slug vacío, o uno que
 * después de normalizar da menos que el mínimo): una sugerencia que no
 * sirve es peor que ninguna, porque el campo arranca con algo que el
 * veredicto va a marcar en rojo.
 *
 * `maximo` entra por parámetro para que el formulario pueda usar el número
 * REAL de la base en vez de la copia de este archivo.
 */
export function aliasSugerido(slug: string, maximo = ALIAS_LARGO_MAXIMO): string {
  const limpio = sinAcentos(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (!limpio) return "";

  // El prefijo entra solo si después queda algo. Con `fm.` son 3
  // caracteres, así que en un máximo de 20 quedan 17 para el nombre.
  const lugar = maximo - ALIAS_PREFIJO.length;
  if (lugar < 1) return limpio.slice(0, maximo);

  const propuesto = ALIAS_PREFIJO + limpio.slice(0, lugar);
  return propuesto.length >= ALIAS_LARGO_MINIMO ? propuesto : "";
}

/** Los veredictos de `alias_estado()`. La base contesta uno de estos. */
export const ESTADOS_ALIAS = [
  "disponible",
  "ocupado",
  "invalido",
  "corto",
  "largo",
] as const;

export type EstadoAlias = (typeof ESTADOS_ALIAS)[number];

export function esEstadoAlias(v: unknown): v is EstadoAlias {
  return typeof v === "string" && (ESTADOS_ALIAS as readonly string[]).includes(v);
}
