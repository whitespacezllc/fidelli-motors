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
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Las palabras del slug que no identifican a nadie: «lubricentro»,
 * «mecánica», «taller»… El alias es lo que el dueño tipea en su home
 * banking y lee en el comprobante, y `fm.lubricentroelgar` no se parece a
 * nada; `fm.elgarage` sí. Se sacan solo si queda algo con qué nombrar.
 */
const GENERICAS = new Set([
  "lubricentro", "lubricentros", "lubricantes", "lubricante", "lubricacion",
  "mecanica", "mecanicas", "mecanico", "taller", "talleres", "servicio", "servicios",
  "soluciones", "integral", "system", "automotive", "automotriz", "y", "de", "del", "al", "detalle",
]);

/**
 * Un alias propuesto a partir del slug, recortado al largo válido.
 *
 * Devuelve `""` cuando no queda nada utilizable (un slug vacío, o uno que
 * después de normalizar da menos que el mínimo): una sugerencia que no
 * sirve es peor que ninguna.
 *
 * La regla (30/10/2026): se sacan las palabras genéricas del slug si queda
 * algo de 3 letras o más; después entran palabras ENTERAS mientras quepan
 * en lo que deja el prefijo (17 con `fm.` y un máximo de 20), y solo una
 * palabra que no entra sola se corta. «lubricentro-el-garage» → `fm.elgarage`;
 * «pg-taller-lubricentro» → `fm.pgtaller`; «loprestimotorsport» (una
 * palabra de 18) → `fm.loprestimotorspor`. Es una SUGERENCIA: el campo de
 * /fidelli es editable y quien emite la cuenta está eligiendo.
 *
 * `maximo` entra por parámetro para que el formulario pueda usar el número
 * REAL de la base en vez de la copia de este archivo.
 */
export function aliasSugerido(slug: string, maximo = ALIAS_LARGO_MAXIMO): string {
  const palabras = sinAcentos(slug)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (palabras.length === 0) return "";

  const propias = palabras.filter((p) => !GENERICAS.has(p));
  const elegidas = propias.join("").length >= 3 ? propias : palabras;

  const lugar = maximo - ALIAS_PREFIJO.length;
  if (lugar < 1) return elegidas.join("").slice(0, maximo);

  let nombre = "";
  for (const palabra of elegidas) {
    if (nombre.length + palabra.length <= lugar) nombre += palabra;
    else if (nombre === "") { nombre = palabra.slice(0, lugar); break; }
    else break;
  }

  const propuesto = ALIAS_PREFIJO + nombre;
  return propuesto.length >= ALIAS_LARGO_MINIMO ? propuesto : "";
}

/**
 * El mismo alias, con un número al final, para cuando el primero ya es de
 * otro: `fm.shaddai` → `fm.shaddai2`, `fm.shaddai3`… Recorta el nombre si el
 * número no entra en el máximo. Devuelve `""` si no hay base.
 */
export function aliasConNumero(base: string, n: number, maximo = ALIAS_LARGO_MAXIMO): string {
  if (!base || n < 2) return base;
  const sufijo = String(n);
  const recortado = base.slice(0, Math.max(ALIAS_PREFIJO.length + 1, maximo - sufijo.length));
  return recortado + sufijo;
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
