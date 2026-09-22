import { SITIO_URL } from "@/lib/seo";

// ============================================================
// Los documentos legales: la versión vigente, en UN solo lugar.
//
// Es la fuente única. El frontmatter de content/legal/terminos.md y
// content/legal/privacidad.md tiene que coincidir con estas dos constantes
// —lib/legal/documentos.ts lo verifica al leerlos y el build falla si no—,
// y el gate del panel compara lo que el tenant aceptó contra VERSION_LEGAL.
//
// CAMBIAR UN TEXTO DE FORMA RELEVANTE = SUBIR LA VERSIÓN. Al subirla, el
// modal del panel vuelve a pedirle la aceptación a todos los tenants
// (aceptaciones_terminos guarda una fila por versión: las anteriores
// quedan). Nunca se edita un texto in place sin subir la versión: la
// aceptación registrada sería de un texto que ya no existe.
//
// Este archivo NO lleva `server-only`: el modal del panel es un componente
// de cliente y también lee la versión.
// ============================================================

export const VERSION_LEGAL = "1.0";
export const VIGENCIA_LEGAL = "2026-09-22";

/** Los dos documentos y su ruta. El slug es el nombre del archivo en content/legal. */
export const DOCUMENTOS_LEGALES = [
  { slug: "terminos", ruta: "/terminos", nombreCorto: "Términos" },
  { slug: "privacidad", ruta: "/privacidad", nombreCorto: "Privacidad" },
] as const;

export type SlugLegal = (typeof DOCUMENTOS_LEGALES)[number]["slug"];

/**
 * La URL absoluta de la política de privacidad, para la página pública del
 * lubricentro: esa superficie es del lubricentro y el enlace apunta a
 * NUESTRO dominio de forma explícita, no a una ruta relativa que dependa
 * de dónde esté montada la vidriera.
 */
export const URL_PRIVACIDAD = `${SITIO_URL}/privacidad`;

/**
 * El tenant de demostración. Un prospecto mirando la demo no acepta ningún
 * contrato: el gate de términos lo exime POR SLUG, no por descuento ni por
 * plan. Es el mismo slug que SLUGS_SIN_INDEXAR (lib/seo.ts), pero es otra
 * decisión: aquella es de indexación, esta es de aceptación.
 */
export const SLUG_DEMO = "demo";
