// ============================================================
// EL STOCK DE CALCOS, DEL LADO DE TypeScript
//
// La cuenta vive en la base (`stock_calcos()`, migración 20261003210000) y
// los umbrales también (`aviso_calcos()`): acá no se re-decide nada. Se LEE
// lo que la base ya resolvió y se le pone palabras.
//
// Las palabras son UNA sola voz: la frase del aviso del Inicio es la misma
// que va en los dos mails del cron. El mail es lo que el panel diría ese
// día, entregado.
//
// ⚠ PURO: sin imports del app ni fechas del proceso, para que la regresión
// (scripts/regresion-calcos-stock.mjs) lo compile y lo corra en Node sin el
// bundler. Y sin costo: lo importan las pantallas del tenant.
// ============================================================

/** Los dos escalones del aviso. Los decide `aviso_calcos()`. */
export type NivelDeAviso = "calcos_4_semanas" | "calcos_1_semana";

export type StockCalcos = {
  /** Cuántas le quedan, según la cuenta. Nunca negativo. */
  stock: number;
  /** Autos nuevos por semana (últimas 8 semanas). Null con menos de 2
   *  semanas de historia. */
  ritmo: number | null;
  /** Para cuántas semanas alcanza. Null si no hay ritmo o es cero. */
  semanas: number | null;
  /** Si la cuenta parte de un recuento del dueño, cuándo fue. */
  baseRecuentoAt: string | null;
};

type Fila = Record<string, unknown>;

function numeroONull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * La fila de `stock_calcos()`. Null cuando no hay nada que estimar: sin
 * ninguna entrega en el libro, o si el lubricentro imprime por su cuenta
 * (la base devuelve null en todo). PostgREST manda los numeric como número
 * o como texto, según el camino: pasan todos por la misma coerción.
 */
export function leerStock(dato: unknown): StockCalcos | null {
  const fila = (Array.isArray(dato) ? dato[0] : dato) as Fila | null | undefined;
  const stock = numeroONull(fila?.stock_estimado);
  if (!fila || stock == null) return null;
  return {
    stock,
    ritmo: numeroONull(fila.ritmo_semanal),
    semanas: numeroONull(fila.semanas_cobertura),
    baseRecuentoAt: fila.base_recuento_at == null ? null : String(fila.base_recuento_at),
  };
}

export type AvisoCalcos = { nivel: NivelDeAviso; stock: number; semanas: number | null };

/** La fila de `aviso_calcos()`: null si hoy no hay nada que avisar. */
export function leerAviso(dato: unknown): AvisoCalcos | null {
  const fila = (Array.isArray(dato) ? dato[0] : dato) as Fila | null | undefined;
  const stock = numeroONull(fila?.stock_estimado);
  if (!fila || stock == null) return null;
  if (fila.nivel !== "calcos_4_semanas" && fila.nivel !== "calcos_1_semana") return null;
  return { nivel: fila.nivel, stock, semanas: numeroONull(fila.semanas_cobertura) };
}

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** 1150 → «1.150». */
export function cantidadDicha(n: number): string {
  return ENTERO.format(Math.max(0, Math.round(n)));
}

/**
 * Cómo se dicen las semanas. Para abajo, siempre: «3,9 semanas» son «unas 3»
 * —es una promesa de cuánto dura, y la que se queda corta no hace daño—.
 */
export function semanasDichas(semanas: number): string {
  if (semanas < 1) return "menos de una semana";
  if (semanas > 52) return "más de un año";
  const enteras = Math.floor(semanas);
  return enteras === 1 ? "una semana" : `unas ${enteras} semanas`;
}

/** «22 autos nuevos por semana» · «1 auto nuevo por semana». */
export function ritmoDicho(ritmo: number): string {
  if (ritmo < 1) return "menos de 1 auto nuevo por semana";
  const n = Math.round(ritmo);
  return n === 1 ? "1 auto nuevo por semana" : `${cantidadDicha(n)} autos nuevos por semana`;
}

// El aviso habla de semanas solo cuando son pocas: por debajo de este número
// es el motivo del aviso. Cuando el aviso llegó por las 20 calcos, con un
// ritmo lento, decir «para unas 7 semanas. Pedí ahora» se contradice solo.
// (El umbral de verdad —cuándo se avisa— está en la base; esto es solo cómo
// se dice.)
const SEMANAS_QUE_SE_DICEN = 4;

/**
 * La frase del aviso: la del Inicio del panel y la de los dos mails.
 *
 *   «Te quedan unas 80 calcos, para unas 3 semanas. Producir y enviar tarda
 *    hasta 2. Pedí ahora.»
 */
export function fraseDelAviso({ stock, semanas }: { stock: number; semanas: number | null }): string {
  if (stock <= 0) {
    return "Según nuestra cuenta ya no te quedan calcos. Producir y enviar tarda hasta 2 semanas. Pedí ahora.";
  }
  const quedan = `Te quedan unas ${cantidadDicha(stock)} calcos`;
  if (semanas != null && semanas < SEMANAS_QUE_SE_DICEN) {
    return `${quedan}, para ${semanasDichas(semanas)}. Producir y enviar tarda hasta 2. Pedí ahora.`;
  }
  return `${quedan}. Producir y enviar tarda hasta 2 semanas. Pedí ahora.`;
}

// ============================================================
// EL AVISO DE CALCOS NUNCA SE APILA CON LOS DE COBRANZA
//
// Si en el Inicio ya hay un aviso de cobranza —la barra de «por vencer»
// (AvisoCobranzaInicio) o la de gracia (BarraCobranza, en todo el panel)—,
// el de calcos no se dibuja ese día. Primero se le habla de la cuenta;
// venderle calcos al mismo tiempo es ruido, y a un suspendido —que además
// no puede pedir— le diría «pedí ahora» en una pantalla que no lo deja.
//
// Es una función y no un `if` en la página para que la regla tenga UN lugar
// y su prueba: el día que la escalera de cobranza gane un estado, se cambia
// acá.
// ============================================================
export function puedeAvisarDeCalcos({
  estadoCobranza,
  suspendido,
}: {
  /** `sesion.cobranza?.estado`. Null = afuera del reloj. */
  estadoCobranza: string | null | undefined;
  suspendido: boolean;
}): boolean {
  if (suspendido) return false;
  return estadoCobranza == null || estadoCobranza === "al_dia";
}
