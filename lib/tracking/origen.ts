import { leerParametros, anclaDe } from "@/lib/tracking/parametros";
import { evaluarDebug, log } from "@/lib/tracking/debug";

// De dónde vino el visitante, para que el mensaje de WhatsApp lo diga y las
// plataformas de anuncios lo reciban.
//
// Se resuelve en cada carga de página (components/tracking/tracking.tsx) y
// se guarda en el navegador bajo `fm_origin`, así sobrevive a la navegación
// interna: el que entra por un anuncio, baja a #precio, lee un artículo y
// recién ahí escribe, sigue siendo un lead de Google.
//
// Las reglas, en orden:
//
//   · `utm_source=google` o un click id de Google (gclid, y sus variantes
//     gbraid/wbraid de iOS) → google.
//   · `utm_source` en {meta, facebook, instagram, fb, ig} o `fbclid` → meta.
//   · Sin fuente paga y leyendo un artículo del blog → blog, con el slug.
//   · Nada de lo anterior → no se toca lo guardado.
//
// Una fuente paga nueva pisa lo anterior (último toque pago). El blog solo
// entra como fuente si no hay una paga vigente, pero el artículo leído se
// anota siempre. Lo guardado vence a los 30 días.
//
// SIN DEPENDENCIAS Y SIN REACT a propósito: son funciones puras sobre
// `window.location` y `localStorage`, que se pueden probar con un script.

export type Fuente = "google" | "meta" | "blog";

export type Origen = {
  readonly source: Fuente;
  readonly campaign: string | null;
  readonly content: string | null;
  readonly term: string | null;
  /** El slug del último artículo del blog leído, con o sin fuente paga. */
  readonly article: string | null;
  /** El `whatsappTema` de ese artículo: completa "leí el artículo sobre ___". */
  readonly topic: string | null;
  /** Dónde aterrizó: ruta y ancla, sin la query (`/`, `/#precio`, `/blog/x`). */
  readonly landing: string;
  /** Cuándo se asignó la fuente, en ms. Lo guardado vence a los 30 días. */
  readonly ts: number;
};

export const CLAVE_ORIGEN = "fm_origin";

const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;

const FUENTES_META = new Set(["meta", "facebook", "instagram", "fb", "ig"]);

const FUENTES: readonly Fuente[] = ["google", "meta", "blog"];

// ------------------------------------------------------------
// Persistencia — localStorage, y si no hay, memoria
// ------------------------------------------------------------

// Si localStorage no está disponible (modo privado de algún navegador
// viejo, cuota llena, deshabilitado por política) el origen vive acá hasta
// que se recargue la página. Se sigue sin error: el tracking nunca puede
// romper el botón de WhatsApp.
let memoria: Origen | null = null;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor ? valor : null;
}

function esFuente(valor: unknown): valor is Fuente {
  return typeof valor === "string" && (FUENTES as readonly string[]).includes(valor);
}

// Lo que se lee del storage lo pudo escribir una versión anterior del
// módulo o una mano curiosa: se valida campo por campo y lo que no cierra se
// descarta, en vez de confiar en el JSON.
function validar(crudo: unknown, ahora: number): Origen | null {
  if (!crudo || typeof crudo !== "object") return null;
  const d = crudo as Record<string, unknown>;
  if (!esFuente(d.source) || typeof d.ts !== "number") return null;
  if (ahora - d.ts > VIGENCIA_MS) return null;
  return {
    source: d.source,
    campaign: texto(d.campaign),
    content: texto(d.content),
    term: texto(d.term),
    article: texto(d.article),
    topic: texto(d.topic),
    landing: texto(d.landing) ?? "/",
    ts: d.ts,
  };
}

function leer(ahora: number): Origen | null {
  let crudo: string | null = null;
  try {
    crudo = window.localStorage.getItem(CLAVE_ORIGEN);
  } catch {
    return validar(memoria, ahora);
  }
  if (crudo === null) return validar(memoria, ahora);
  try {
    const origen = validar(JSON.parse(crudo), ahora);
    if (!origen) borrar();
    return origen;
  } catch {
    borrar();
    return null;
  }
}

function guardar(origen: Origen) {
  memoria = origen;
  try {
    window.localStorage.setItem(CLAVE_ORIGEN, JSON.stringify(origen));
  } catch {
    // Queda en memoria.
  }
}

function borrar() {
  memoria = null;
  try {
    window.localStorage.removeItem(CLAVE_ORIGEN);
  } catch {
    // Nada que borrar.
  }
}

// ------------------------------------------------------------
// Resolución
// ------------------------------------------------------------

export type Ubicacion = {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
};

function fuentePagaDe(p: ReturnType<typeof leerParametros>): "google" | "meta" | null {
  const utmSource = p.get("utm_source")?.toLowerCase() ?? "";
  if (utmSource === "google") return "google";
  if (FUENTES_META.has(utmSource)) return "meta";
  if (p.get("gclid") || p.get("gbraid") || p.get("wbraid")) return "google";
  if (p.get("fbclid")) return "meta";
  return null;
}

function landingDe(ubicacion: Ubicacion): string {
  const ancla = anclaDe(ubicacion.hash);
  return ancla ? `${ubicacion.pathname}#${ancla}` : ubicacion.pathname;
}

/**
 * Corre en cada carga de página, antes de que el usuario pueda hacer clic.
 * Lee los parámetros de la URL y, si traen una fuente paga, la guarda.
 * Devuelve el origen vigente (el nuevo o el que ya estaba).
 */
export function resolverOrigen(
  ubicacion: Ubicacion,
  ahora = Date.now(),
): Origen | null {
  const parametros = leerParametros(ubicacion.search, ubicacion.hash);
  evaluarDebug(parametros);

  const actual = leer(ahora);
  const fuente = fuentePagaDe(parametros);
  if (!fuente) return actual;

  const nuevo: Origen = {
    source: fuente,
    campaign: parametros.get("utm_campaign"),
    content: parametros.get("utm_content"),
    term: parametros.get("utm_term"),
    // El artículo leído se conserva: si después vuelve al blog y escribe,
    // el canal que se anota es el pago, pero el dato no se pierde.
    article: actual?.article ?? null,
    topic: actual?.topic ?? null,
    landing: landingDe(ubicacion),
    ts: ahora,
  };
  guardar(nuevo);
  log("fuente paga nueva", nuevo);
  return nuevo;
}

/**
 * Se llama al abrir un artículo del blog (components/tracking/articulo-leido.tsx).
 * Con una fuente paga vigente solo anota el artículo; sin ella, el blog pasa
 * a ser la fuente.
 */
export function registrarArticulo(
  slug: string,
  tema: string,
  ahora = Date.now(),
): Origen {
  const actual = leer(ahora);

  const nuevo: Origen =
    actual && actual.source !== "blog"
      ? { ...actual, article: slug, topic: tema }
      : {
          source: "blog",
          campaign: null,
          content: null,
          term: null,
          article: slug,
          topic: tema,
          landing: actual?.landing ?? `/blog/${slug}`,
          ts: ahora,
        };
  guardar(nuevo);
  log("artículo leído", nuevo);
  return nuevo;
}

/** El origen vigente, ya descartado si venció. */
export function obtenerOrigen(ahora = Date.now()): Origen | null {
  return leer(ahora);
}
