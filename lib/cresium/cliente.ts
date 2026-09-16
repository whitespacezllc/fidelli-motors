import "server-only";
import crypto from "node:crypto";
import { firmar, timestampAhora } from "@/lib/cresium/firma";
import { DIAS_DE_VIDA_DE_LA_ORDEN } from "@/lib/cresium/orden";

// ============================================================
// EL CLIENTE DE CRESIUM
//
// Una sola puerta de salida hacia la API. Todo lo que sale firmado sale
// de acá, para que la construcción del string viva en un lugar y no en
// cinco.
//
// ⚠ NO HAY ENTORNO DE PRUEBAS. Verificado el 16/09/2026 leyendo la spec
// entera: `develop`, `sandbox`, `staging` y `environment` aparecen CERO
// veces, el OpenAPI declara un solo server (`api.cresium.app`) y las
// credenciales se gestionan en un único lugar. `api.develop.cresium.app`
// existe y sirve la documentación, pero es otro entorno con su propio
// registro de partners y responde «Partner not found when finding by
// apiKey» a una key de la cuenta real.
//
// CONSECUENCIA PRÁCTICA: cualquier `POST` de este archivo mueve plata de
// verdad. Las pruebas van contra el doble local
// (`scripts/regresion-cresium-orden.mjs`), que levanta un servidor que
// habla como Cresium y verifica la firma igual que ella.
// ============================================================

export type Credenciales = {
  apiKey: string;
  secret: string;
  companyId: string;
  baseUrl: string;
};

/**
 * Los 8 primeros hex del sha256. Identifica una credencial SIN revelarla.
 *
 * Existe para que un 401 se pueda diagnosticar sin pedirle a nadie que
 * pegue un secret en un chat: comparando la huella que loguea producción
 * contra la de la credencial que uno cree haber cargado, se sabe en un
 * segundo si el par está desparejo.
 */
export function huella(valor: string): string {
  return crypto.createHash("sha256").update(valor).digest("hex").slice(0, 8);
}

export function credenciales(): Credenciales {
  // ⚠ `.trim()` SOBRE LAS TRES, y no es paranoia: es una diferencia real
  // entre local y Vercel. El cargador de `.env` de Next recorta espacios,
  // retornos de carro y comillas envolventes; el panel de Vercel guarda el
  // string LITERAL que se pegó.
  //
  // Y de las tres, la basura invisible solo es letal en el secret: la capa
  // de fetch recorta los valores de header antes de mandarlos, así que una
  // apiKey con un salto de línea al final viaja limpia igual — pero
  // createHmac con el secret más ese salto es OTRA CLAVE. El partner se
  // resuelve bien, el HMAC no coincide, y Cresium contesta exactamente
  // "Invalid signature when checking partner authentication", que es el
  // error que manda a revisar la construcción del string — donde no está
  // el problema.
  const apiKey = process.env.CRESIUM_API_KEY?.trim();
  const secret = process.env.CRESIUM_SECRET?.trim();
  const companyId = process.env.CRESIUM_COMPANY_ID?.trim();

  if (!apiKey || !secret || !companyId) {
    // Fallar temprano y con nombres: un 401 de Cresium por una variable
    // vacía es media hora de mirar la firma, que es donde no está el bug.
    throw new Error(
      "Faltan credenciales de Cresium. Se necesitan CRESIUM_API_KEY, " +
        "CRESIUM_SECRET y CRESIUM_COMPANY_ID, las tres server-side.",
    );
  }

  return {
    apiKey,
    secret,
    companyId,
    // `/+$` y no `/$`: dos barras al final también rompen el path firmado.
    baseUrl: (process.env.CRESIUM_BASE_URL?.trim() || "https://api.cresium.app").replace(/\/+$/, ""),
  };
}

export class ErrorCresium extends Error {
  constructor(
    readonly status: number,
    readonly cuerpo: string,
    readonly path: string,
  ) {
    super(`Cresium respondió ${status} a ${path}: ${cuerpo.slice(0, 300)}`);
    this.name = "ErrorCresium";
  }
}

/**
 * Una request firmada.
 *
 * ⚠ El `path` que se firma es el MISMO string que se concatena a la base,
 * con su query string incluido. Firmar uno y mandar otro es el 401 más
 * caro de diagnosticar, porque la respuesta no dice cuál de los dos está
 * mal — ni siquiera dice que el problema sea el path.
 */
async function llamar<T>(
  metodo: "GET" | "POST" | "DELETE",
  path: string,
  cuerpo?: unknown,
): Promise<T> {
  const { apiKey, secret, companyId, baseUrl } = credenciales();

  // El body se serializa UNA vez: el mismo string se firma y se manda.
  // Serializar dos veces puede reordenar claves y romper la firma.
  const body = cuerpo === undefined ? "" : JSON.stringify(cuerpo);
  const timestamp = timestampAhora();
  const signature = firmar({ timestamp, metodo, path, body }, secret);

  const r = await fetch(baseUrl + path, {
    method: metodo,
    // `x-company-id` va en los headers y NO en la firma. Es el único de
    // los cuatro que queda afuera del string, y meterlo rompe todo.
    headers: {
      "x-api-key": apiKey,
      "x-company-id": companyId,
      "x-timestamp": timestamp,
      "x-signature": signature,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
    // Una orden de pago no se cachea nunca.
    cache: "no-store",
  });

  const texto = await r.text();

  if (!r.ok) {
    // ⚠ UN 401 DE CRESIUM NO DICE CUÁL DE LAS DOS MITADES ESTÁ MAL.
    //
    // "Invalid signature when checking partner authentication" significa
    // que la apiKey SE RESOLVIÓ y después falló el HMAC: o el secret no es
    // el de esa key, o llegó con basura. Una cuenta puede tener hasta tres
    // keys sobre la misma empresa y el secret se muestra UNA sola vez al
    // crearla, así que cargar la key de una con el secret de otra es el
    // error más fácil de cometer y el más difícil de ver.
    //
    // Por eso el log lleva las HUELLAS: no revelan nada y contestan la
    // pregunta sin que nadie tenga que pegar un secret en ningún lado.
    // La ruta del webhook ya tenía esta defensa para los eventos que
    // ENTRAN (compara el x-api-key); del lado que SALE no había nada.
    if (r.status === 401) {
      console.error(
        `[cresium] 401 firmando ${metodo} ${path} · apiKey=${huella(apiKey)} ` +
          `secret=${huella(secret)} company=${companyId} · largos ${apiKey.length}/${secret.length} · base ${baseUrl}`,
      );
    }
    throw new ErrorCresium(r.status, texto, path);
  }
  if (!texto) return null as T;

  // ⚠ CRESIUM ENVUELVE TODO EN `data`, y no está en el OpenAPI: el schema
  // de la respuesta describe el objeto de adentro. Se descubrió haciendo
  // la primera llamada de verdad —200, orden creada— y viendo que
  // `paymentOrder` y `depositAddress` no estaban donde el tipo decía.
  //
  // Sin esto el cobro "funciona" y falla en silencio de la peor manera: la
  // orden se crea en Cresium, se guarda en `cresium_ordenes` con el CVU en
  // NULL, y el dueño ve la pantalla de pago con el alias y SIN LA CUENTA A
  // LA QUE TIENE QUE TRANSFERIR.
  //
  // Se desenvuelve acá y no en cada llamador porque es de TODAS las
  // respuestas: lo confirmamos en payment-order, transaction/search y el
  // listado de órdenes.
  const crudo = JSON.parse(texto);
  return (crudo && typeof crudo === "object" && "data" in crudo
    ? (crudo as { data: unknown }).data
    : crudo) as T;
}

// ============================================================
// EL ALIAS DEL CVU
//
// Los alias de CVU son ÚNICOS EN TODO EL PAÍS, no por cuenta. Dos órdenes
// que pidan el mismo alias no pueden convivir, y un alias reusado es la
// peor falla imaginable de este sprint: la plata de un lubricentro
// entrando al CVU de otro.
//
// Por eso el alias lleva las dos mitades:
//
//   · un prefijo LEGIBLE, porque es lo que el dueño ve en la pantalla al
//     lado del botón de copiar, y un alias que no se parece a nada da
//     desconfianza justo cuando está por transferir;
//   · un sufijo DETERMINISTA derivado del externalId, que es único por
//     suscripción y período. Sin él, `lubricentro-fassetta` y
//     `lubricentro-manuel` colisionan: los dos empiezan con las mismas
//     ocho letras.
//
// Determinista y no aleatorio para que reintentar la creación de la misma
// orden pida el MISMO alias, en vez de dejar CVUs huérfanos regados.
// ============================================================
export function aliasDeOrden(slug: string, externalId: string): string {
  const corto = slug.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "taller";
  const sufijo = crypto.createHash("sha256").update(externalId).digest("hex").slice(0, 6);
  return `fm.${corto}.${sufijo}`;
}

// ============================================================
// La orden de pago
// ============================================================

export type OrdenCreada = {
  paymentOrder: {
    id: number;
    externalId: string;
    status: "NOT_PAID" | "PARTIAL" | "PAID" | "EXPIRED";
    amount: number;
    amountPaid: number;
  };
  depositAddress: { value?: string; alias?: string } | string;
};

export type DatosOrden = {
  externalId: string;
  /** El total en pesos. Cresium exige mayor que cero. */
  monto: number;
  alias: string;
  titulo: string;
  descripcion?: string;
  /** Duración: `30m`, `24h`, `7d`. Mínimo 30 minutos, máximo 30 días. */
  expiraEn?: string;
  /** Para reconciliar de nuestro lado. Máx. 50 claves, valores string. */
  metadata?: Record<string, string>;
};

/**
 * Crea la orden de pago única y devuelve el CVU dedicado.
 *
 * ⚠ ESTO MUEVE PLATA DE VERDAD: crea un CVU real que puede recibir
 * transferencias reales. No hay entorno de pruebas donde ensayarlo.
 */
export async function crearOrdenDePago(d: DatosOrden): Promise<OrdenCreada> {
  return llamar<OrdenCreada>("POST", "/v3/payment-order/", {
    alias: d.alias,
    paymentOrder: {
      externalId: d.externalId,
      amount: d.monto,
      title: d.titulo,
      ...(d.descripcion ? { description: d.descripcion } : {}),
      // 7 días y no las 24 horas del default: el dueño de un lubricentro
      // no transfiere a las 23:40 de un martes porque le apareció una
      // barra. Una orden vencida obliga a rehacerla y a que el CVU
      // copiado deje de servir, que es exactamente el momento en que
      // alguien abandona.
      expiresIn: d.expiraEn ?? `${DIAS_DE_VIDA_DE_LA_ORDEN}d`,
      ...(d.metadata ? { metadata: d.metadata } : {}),
    },
  });
}

/** El estado de una orden, por nuestro `externalId`. Solo lectura. */
export async function consultarOrden(externalId: string) {
  return llamar<OrdenCreada["paymentOrder"] | null>(
    "GET",
    `/v3/payment-order/${encodeURIComponent(externalId)}`,
  );
}

/** El comprobante en PDF (base64). No lo armamos nosotros. */
export async function comprobante(transaccionId: number) {
  return llamar<{ file?: string; base64?: string }>(
    "GET",
    `/v3/transaction/receipt/${transaccionId}`,
  );
}

/** El CVU de una orden, venga como string o como objeto. */
export function cvuDe(orden: OrdenCreada): string | null {
  const d = orden.depositAddress;
  if (typeof d === "string") return d;
  return d?.value ?? null;
}
