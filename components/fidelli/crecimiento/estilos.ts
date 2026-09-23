// Las clases que comparten las tablas de /fidelli/crecimiento, en un
// lugar: encabezado en versalitas de 12px (el piso), celdas de 14px con
// cifras tabulares a la derecha y la unidad como segunda línea del
// encabezado. Son las mismas de components/fidelli/pauta/tabla-embudo.tsx;
// viven acá para que las seis tablas no las copien seis veces.

// La base no lleva alineación: `text-right` y `text-left` pisan la misma
// propiedad y gana el que la hoja de Tailwind emite después (no el último de
// la clase), así que «${TH} text-left» dejaba el encabezado a la derecha.
const TH_BASE =
  "px-3 py-2.5 align-bottom text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

/** Encabezado de una columna de cifras: a la derecha, como sus celdas. */
export const TH = `${TH_BASE} text-right`;

/** Encabezado de una columna de texto (el mes, la cohorte, los chips). */
export const TH_IZQ = `${TH_BASE} text-left`;

// `whitespace-nowrap`: una cifra no se parte («100,0 %» se veía como
// «100,0» y «%» en dos renglones a 768px y en la tabla de 720px a 390px).
// Las tablas son table-fixed, así que una celda que no entra desbordaría
// hacia su vecina en vez de ensanchar la columna: los anchos de columna
// están elegidos para que la cifra más ancha entre, y la suite mide que
// ningún texto de celda ocupe más de un renglón ni desborde su celda. Lo
// que sí puede partirse (un sublabel largo, los chips del mes) lo dice
// cada celda con `whitespace-normal` o con `flex-wrap`.
export const TD =
  "px-3 py-2.5 text-right align-middle tabular-nums whitespace-nowrap";

export const TD_IZQ = "px-3 py-2.5 text-left align-middle";

/**
 * Las celdas de cifras de la tabla de DOCE columnas (movimientos): 10px de
 * padding lateral en vez de 12. En doce columnas cada píxel de padding se
 * paga doce veces, y los 44px que se ahorran son los que la columna del
 * mes necesita para que «sept 2026» y el chip «en curso» vayan en el mismo
 * renglón (139px medidos) sin sacarle margen a ninguna cifra. La columna
 * del mes conserva los 12px (TH_IZQ/TD_IZQ) para que su texto quede en la
 * misma vertical que el de las otras tablas de la pantalla.
 */
export const TH_ANCHA = `${TH_BASE.replace("px-3", "px-2.5")} text-right`;
export const TD_ANCHA = TD.replace("px-3", "px-2.5");

/** La unidad debajo del nombre de la columna («US$», «días»). */
export const SUB = "block font-normal normal-case tracking-normal text-ink-40";

/**
 * El contenedor que scrollea DENTRO de la tarjeta. `relative` no es
 * decorativo: con una columna sticky, Chrome extiende el ancho scrolleable
 * del DOCUMENTO hasta el borde de la tabla aunque la tarjeta la recorte
 * (medido en el listado a 390px); con el contenedor como bloque contenedor
 * de las celdas sticky, el scroll queda adentro.
 */
export const SCROLL = "relative overflow-x-auto";

/**
 * Una tabla de hasta ocho columnas con encabezados cortos: 720px de mínimo
 * debajo de 768px, y el ancho de la tarjeta desde ahí (churn, cohortes).
 */
export const TABLA =
  "w-full min-w-[720px] table-fixed border-collapse text-ui md:min-w-0";

/**
 * Una tabla cuyos encabezados no entran en 720px sin partirse
 * («RECORDATORIOS» mide 112px, «CONTACTOS» 80px a 12px en versalitas con
 * tracking; cada celda suma 24px de padding): 820px de mínimo hasta `lg`,
 * y el ancho de la tarjeta desde ahí (982px a 1024). Entre 768 y ~860px
 * scrollea unos pocos píxeles dentro de su tarjeta; es preferible a un
 * encabezado pisando al vecino (trabajos, embudo).
 *
 * Por qué 820 y no 800: con 800 las dos tablas cerraban justo —«% CIERRE»
 * (63,3px) no entraba en su celda de 60 y se partía en «%» / «CIERRE», y en
 * trabajos «RECORDATORIOS» (111,7 de 112) y «trabajos» (45,5 de 46) estaban
 * a menos de medio píxel del borde—; los 20px de más dan al menos 1px de
 * margen a cada encabezado y a la cifra más ancha de cada columna, medidos.
 *
 * LOS ENCABEZADOS LARGOS DE UNA PALABRA LLEVAN GUIÓN BLANDO (`&shy;`,
 * U+00AD) en sus tablas: invisible cuando la columna tiene lugar, parte la
 * palabra con guion («REACTIVA-» / «CIÓN») cuando no. Es la red de
 * seguridad para el ancho que las medidas no previeron; los anchos de
 * columna están elegidos para que a los anchos de la suite no haga falta.
 * Ojo al leer `innerText`: el U+00AD viaja en el texto.
 */
export const TABLA_MEDIA =
  "w-full min-w-[820px] table-fixed border-collapse text-ui lg:min-w-0";

/** Un cero es silencio: se ve, pero en gris. */
export function claseDeCifra(n: number | null): string {
  return n === null || n === 0 ? "text-ink-40" : "text-ink";
}
