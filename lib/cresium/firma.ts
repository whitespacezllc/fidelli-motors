import "server-only";
import crypto from "node:crypto";

// ============================================================
// LA FIRMA HMAC DE CRESIUM · leé esto dos veces
//
// Cresium no acepta Bearer tokens. Cada request va firmada con HMAC-SHA256
// usando el secret del Partner, y el mismo mecanismo se usa al revés para
// verificar cada webhook que Cresium nos manda.
//
//   firma = base64( HMAC-SHA256( secret, "{timestamp}|{MÉTODO}|{PATH}|{BODY}" ) )
//
// ⚠ ESTA FUNCIÓN ES LA ÚNICA QUE FIRMA, en los dos sentidos. Duplicar la
// construcción del string en el cliente y en el webhook es la forma más
// segura de que una de las dos se desincronice y falle en silencio: un
// 401 de Cresium no dice cuál de las cuatro cosas está mal.
//
// LAS CUATRO FORMAS DE ROMPERLA, todas silenciosas:
//
//   1 · `x-company-id` VA EN LOS HEADERS PERO NO EN LA FIRMA.
//       Es el único de los cuatro headers que queda afuera del string.
//       Meterlo rompe absolutamente todo, y el error es un 401 pelado.
//
//   2 · EL PATH INCLUYE EL QUERY STRING.
//       `/v3/transaction/search?fromDate=2026-01-01` completo, tal cual se
//       envía, no el path pelado. Si el orden de los parámetros cambia
//       entre lo que firmás y lo que mandás, la firma tampoco coincide.
//
//   3 · EL BODY ES STRING VACÍO `""` EN GET, no `null` ni `"{}"`.
//       Y en POST tiene que ser EXACTAMENTE el mismo string que viaja:
//       serializar dos veces puede reordenar claves. Por eso `firmar()`
//       recibe el body ya serializado y el que llama manda ESE string.
//
//   4 · EL TIMESTAMP VA EN UTC CON LA `Z` FINAL.
//       Un ISO con offset `-03:00` el servidor lo lee como UTC, queda
//       corrido tres horas y rechaza todo. La ventana es de 60 SEGUNDOS
//       contra el reloj del servidor: un reloj local desincronizado
//       rechaza el 100% de las requests, no algunas.
//
// ⚠ LOS DOS RELOJES NO SON EL MISMO, y la doc los define por separado:
//
//   · Requests de API → ventana de 60 segundos. Acepta ISO-8601 con `Z`
//     o epoch en milisegundos.
//   · Webhooks que recibimos → la doc dice epoch en MILISEGUNDOS y
//     recomienda rechazar los más viejos de 5 MINUTOS.
//
// Mezclarlos da un rechazo que parece de firma y es de reloj.
// ============================================================

/** La ventana de las requests que NOSOTROS mandamos. La fija Cresium. */
export const VENTANA_API_SEGUNDOS = 60;

/** La que aplicamos a los webhooks que RECIBIMOS. La recomienda la doc. */
export const VENTANA_WEBHOOK_SEGUNDOS = 5 * 60;

export type EntradaFirma = {
  /** El valor EXACTO que va (o vino) en `x-timestamp`. No se reformatea. */
  timestamp: string;
  /** En mayúsculas: GET, POST, PUT, DELETE. */
  metodo: string;
  /** Path con path params Y query string, tal cual viaja. */
  path: string;
  /** El body ya serializado. String vacío en GET y en requests sin body. */
  body: string;
};

/**
 * El string que se firma. Se expone aparte de `firmar()` a propósito: es
 * lo único que hay para mirar cuando Cresium devuelve un 401 sin motivo.
 */
export function stringAFirmar({ timestamp, metodo, path, body }: EntradaFirma): string {
  return `${timestamp}|${metodo}|${path}|${body}`;
}

export function firmar(entrada: EntradaFirma, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(stringAFirmar(entrada))
    .digest("base64");
}

/**
 * Compara dos firmas en tiempo constante.
 *
 * `===` sobre un string filtra, por el tiempo que tarda en cortar, cuántos
 * caracteres del principio eran correctos. Con suficientes intentos eso
 * alcanza para reconstruir una firma válida byte a byte. En la puerta del
 * webhook —que es la única puerta— no se compara con `===`.
 */
export function firmaCoincide(recibida: string, esperada: string): boolean {
  const a = Buffer.from(recibida, "utf8");
  const b = Buffer.from(esperada, "utf8");
  // timingSafeEqual exige el mismo largo; si difieren ya sabemos que no
  // coinciden, pero se compara igual contra sí misma para no filtrar el
  // largo por el tiempo de respuesta.
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** El timestamp de una request nuestra: ISO-8601 en UTC, con `Z`. */
export function timestampAhora(): string {
  return new Date().toISOString();
}

/**
 * ¿El timestamp de un webhook entra en la ventana?
 *
 * Acepta las dos formas que documenta Cresium (epoch en milisegundos, que
 * es la que dice usar para webhooks, e ISO-8601) porque el costo de
 * aceptar las dos es una línea y el de suponer mal es rechazar todos los
 * eventos de un cobro que ya entró.
 *
 * ⚠ Rechaza también los del FUTURO: un timestamp adelantado es tan
 * sospechoso como uno viejo, y sin ese límite un atacante con un
 * timestamp de 2099 tendría una firma válida para siempre.
 */
export function timestampEnVentana(
  valor: string,
  ventanaSegundos = VENTANA_WEBHOOK_SEGUNDOS,
  ahora: number = Date.now(),
): boolean {
  const ms = /^\d+$/.test(valor.trim()) ? Number(valor) : Date.parse(valor);
  if (!Number.isFinite(ms)) return false;
  return Math.abs(ahora - ms) <= ventanaSegundos * 1000;
}
