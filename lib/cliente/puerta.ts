import { createClient } from "@/lib/supabase/server";
import { normalizarPatente } from "@/lib/texto";

// LAS DOS PUERTAS PÚBLICAS PUEDEN NO CONTESTAR, Y ESO NO ES «NO EXISTE».
//
// supabase-js no tira una excepción cuando una llamada falla: devuelve
// `{ data: null, error }`. Hasta el 04/10/2026 acá se miraba solo `data`, y
// `data: null` se leía como «el lubricentro no existe»: con un corte entre
// Vercel y Supabase, con el statement_timeout de `anon` (3 segundos) o con
// PostgREST sin su schema cache, el dueño del auto que escaneaba el QR veía
// un 404 —«No encontramos ese taller»—, o «No encontramos esa patente» si
// venía del buscador. Las dos cosas eran mentira: el taller existe y el
// historial también.
//
// Todo lo que le pregunta algo a get_landing o a get_carton pasa por este
// archivo, que contesta una de dos cosas: lo que la función devolvió, o que
// no contestó. Qué significa lo que devolvió lo decide cada lector
// (lib/cliente/landing.ts y lib/cliente/carton.ts).

export type Contestacion =
  | { contesto: true; json: unknown }
  | { contesto: false };

/** Lo que se mira de la respuesta de supabase-js. */
type Respuesta = { data: unknown; error: unknown; status: number };

type Puerta = {
  nombre: "get_landing" | "get_carton";
  /** get_landing contesta `null` cuando el slug no existe; get_carton
   *  contesta siempre un objeto, y un `null` suyo no es una respuesta. */
  nuloVale: boolean;
  /** Si la llamada que falló se puede repetir. */
  seRepite: (respuesta: Respuesta) => boolean;
};

// Lo que se espera antes de repetir una llamada. Es corto a propósito: la
// página se está armando en el servidor y Pedro mira una pantalla en blanco.
const ESPERA_MS = 400;

// Lo que se espera a get_landing cuando se la consulta de cortesía (ver
// preguntarLanding). Esa pantalla ya esperó a get_carton, y por la marca
// —que es un detalle— no se deja a nadie mirando una pantalla en blanco.
const PLAZO_CORTESIA_MS = 2000;

// Un código de PostgREST (PGRST002) o de Postgres (un SQLSTATE: 57014).
const CODIGO = /^(PGRST\d+|[0-9A-Z]{5})$/;

function codigoDe(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === "string" && CODIGO.test(codigo) ? codigo : null;
}

// «Contestó» es exactamente esto: sin error, con un 200 y —en get_carton—
// con algo adentro. El status se mira porque hay respuestas sin `error` que
// no son una respuesta de la función: postgrest-js convierte un 404 de
// cuerpo vacío en `data: null` SIN error (y le pone status 204).
function contesto(respuesta: Respuesta, puerta: Puerta): boolean {
  return (
    respuesta.error == null &&
    respuesta.status === 200 &&
    (puerta.nuloVale || respuesta.data != null)
  );
}

// Para el log, en una línea. En una falla de red el motivo de verdad
// (ECONNREFUSED, UND_ERR_SOCKET…) viene en `details`, después de «Caused by:».
function motivo(respuesta: Respuesta): string {
  const error = (
    typeof respuesta.error === "object" && respuesta.error !== null
      ? respuesta.error
      : {}
  ) as { message?: unknown; details?: unknown };
  const causa =
    typeof error.details === "string"
      ? /Caused by: (.+)/.exec(error.details)?.[1]
      : null;

  return [
    `status ${respuesta.status}`,
    codigoDe(respuesta.error),
    typeof error.message === "string" ? error.message : "sin mensaje",
    causa,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

async function preguntar(
  puerta: Puerta,
  slug: string,
  llamar: () => PromiseLike<Respuesta>,
): Promise<Contestacion> {
  let respuesta = await llamar();
  let primera: Respuesta | null = null;

  if (!contesto(respuesta, puerta) && puerta.seRepite(respuesta)) {
    primera = respuesta;
    await new Promise((seguir) => setTimeout(seguir, ESPERA_MS));
    respuesta = await llamar();
  }

  // Las dos salidas quedan en los logs del servidor: hasta acá estas fallas
  // no dejaban rastro en ningún lado. Sin la patente —el slug alcanza para
  // saber a quién le pasó.
  if (contesto(respuesta, puerta)) {
    // El reintento la salvó y el visitante no vio nada. Se avisa igual: es
    // la única forma de saber cada cuánto pasa.
    if (primera) {
      console.warn(
        `[cliente] ${puerta.nombre} contestó al segundo intento para «${slug}»; el primero: ${motivo(primera)}`,
      );
    }
    return { contesto: true, json: respuesta.data };
  }

  console.error(
    `[cliente] ${puerta.nombre} no contestó para «${slug}» (${primera ? "dos intentos" : "un intento"}): ${motivo(respuesta)}`,
  );
  return { contesto: false };
}

/**
 * La vidriera. get_landing no escribe nada, así que repetirla no cuesta:
 * ante cualquier falla se vuelve a preguntar una vez.
 *
 * `deCortesia` es para quien la usa de adorno —la marca del estado «sin
 * respuesta» del cartón—: ahí get_carton ya falló y la pantalla ya tardó,
 * así que va un solo intento y con plazo. Si la base está colgada (ni
 * contesta ni corta), esa pantalla sale igual, neutra.
 */
export async function preguntarLanding(
  slug: string,
  { deCortesia = false }: { deCortesia?: boolean } = {},
): Promise<Contestacion> {
  const supabase = await createClient();
  return preguntar(
    { nombre: "get_landing", nuloVale: true, seRepite: () => !deCortesia },
    slug,
    () => {
      const llamada = supabase.rpc("get_landing", { p_slug: slug });
      return deCortesia
        ? llamada.abortSignal(AbortSignal.timeout(PLAZO_CORTESIA_MS))
        : llamada;
    },
  );
}

/**
 * La búsqueda. OJO CON REPETIRLA: get_carton REGISTRA cada consulta en
 * landing_busquedas —es la métrica de escaneo del lubricentro, y cada
 * consulta sin resultado es un lead del Inicio—. Si la primera llamada
 * llegó a ejecutarse y lo que se perdió fue la respuesta, repetirla a
 * ciegas deja dos filas por una sola visita.
 *
 * Por eso se repite SOLO cuando el error trae un código de PostgREST o de
 * Postgres: ahí quien contestó es PostgREST, y un error suyo quiere decir
 * que la transacción no se confirmó (o que ni empezó) —no hay fila que
 * duplicar—. Es el caso del schema cache recargándose (PGRST002), de la
 * base sin conexiones (PGRST000 a 003) y del statement_timeout (57014).
 *
 * Un corte de red, un timeout del lado de acá o un 502 del gateway NO se
 * repiten: no se sabe si la función corrió. Ahí se muestra el estado «sin
 * respuesta» y el que decide reintentar es el visitante.
 */
export async function preguntarCarton(
  slug: string,
  patente: string,
): Promise<Contestacion> {
  const supabase = await createClient();
  return preguntar(
    {
      nombre: "get_carton",
      nuloVale: false,
      seRepite: (respuesta) => codigoDe(respuesta.error) !== null,
    },
    slug,
    () =>
      supabase.rpc("get_carton", {
        p_slug: slug,
        p_patente: normalizarPatente(patente),
      }),
  );
}
