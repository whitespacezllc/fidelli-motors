import { normalizar } from "@/lib/texto";

// ============================================================
// LA ORDEN DE TRABAJO — los renglones de la mecánica son un TECLADO.
//
// Pedido de un taller (01/10/2026): cargar la mecánica como un service,
// tildando en vez de escribir. La libretita de papel que reemplazamos es
// una lista de ítems con una columna por fecha.
//
// Cada renglón es un botón con una frase: tocarlo escribe esa frase como
// una línea más de `services.trabajo_descripcion`; tocarlo de nuevo la
// borra. La descripción sigue siendo un texto editable y ES LO ÚNICO QUE
// SE GUARDA: no hay filas en `service_items`, no hay valores nuevos de
// `item_tipo`, no hay estado "revisado / cambiado". Si aparece la
// tentación de guardar "qué renglón se tocó", la respuesta es no. Las
// frases son fijas y únicas: el día que haga falta contar "cuántos
// cambios de pastillas", se reconocen en el texto.
//
// LA REGLA QUE EXPLICA TODO: un renglón está prendido mientras su línea
// esté tal cual (comparación normalizada). Escribir a mano nunca mueve un
// botón; los botones solo recalculan si están prendidos. Editar la línea
// de un renglón lo apaga y el texto queda como el mecánico lo dejó.
//
// Sin React, como lib/renglones.ts: lo carga también la prueba
// (scripts/regresion-orden-de-trabajo.mjs).
// ============================================================

// Los grupos, en el orden de la pantalla.
export const GRUPOS_MECANICA = [
  "Frenos",
  "Suspensión y dirección",
  "Motor",
  "Embrague y caja",
  "Eléctrico",
  "General",
] as const;

export type GrupoMecanica = (typeof GRUPOS_MECANICA)[number];

export type RenglonMecanica = {
  /** Estable, snake_case. Es el id del botón y lo que nombra la prueba.
   *  NO es un valor de item_tipo ni lo va a ser. */
  clave: string;
  grupo: GrupoMecanica;
  /** Lo que dice el botón. */
  etiqueta: string;
  /** La línea que escribe en la descripción. */
  frase: string;
  /** Se oculta cuando el taller tiene la feature 'neumaticos': ese trabajo
   *  se carga como tipo Neumáticos y ahí alimenta sus métricas. */
  soloSinGomeria?: true;
  /** Se oculta en la mecánica ADJUNTA a un service: ya está en el cartón
   *  de arriba y no se repite. */
  companeroDeService?: true;
};

// Los 42, en el orden de la pantalla. Las frases van tal cual, con tildes,
// en el lenguaje del taller y no del manual. Ni una más ni una menos: lo
// que no está entra como siempre, escribiendo.
export const RENGLONES_MECANICA: RenglonMecanica[] = [
  { clave: "pastillas_delanteras", grupo: "Frenos", etiqueta: "Pastillas delanteras", frase: "Cambio de pastillas delanteras" },
  { clave: "pastillas_traseras", grupo: "Frenos", etiqueta: "Pastillas traseras", frase: "Cambio de pastillas traseras" },
  { clave: "cintas_traseras", grupo: "Frenos", etiqueta: "Cintas traseras", frase: "Cambio de cintas de freno traseras" },
  { clave: "discos", grupo: "Frenos", etiqueta: "Discos", frase: "Cambio de discos de freno" },
  { clave: "rectificacion_discos", grupo: "Frenos", etiqueta: "Rectificación de discos", frase: "Rectificación de discos" },
  { clave: "liquido_frenos", grupo: "Frenos", etiqueta: "Líquido de frenos", frase: "Purga y cambio de líquido de frenos", companeroDeService: true },
  { clave: "freno_mano", grupo: "Frenos", etiqueta: "Freno de mano", frase: "Regulación de freno de mano" },

  { clave: "amortiguadores_delanteros", grupo: "Suspensión y dirección", etiqueta: "Amortiguadores delanteros", frase: "Cambio de amortiguadores delanteros" },
  { clave: "amortiguadores_traseros", grupo: "Suspensión y dirección", etiqueta: "Amortiguadores traseros", frase: "Cambio de amortiguadores traseros" },
  { clave: "bieletas", grupo: "Suspensión y dirección", etiqueta: "Bieletas", frase: "Cambio de bieletas" },
  { clave: "rotulas", grupo: "Suspensión y dirección", etiqueta: "Rótulas", frase: "Cambio de rótulas" },
  { clave: "extremos", grupo: "Suspensión y dirección", etiqueta: "Extremos", frase: "Cambio de extremos de dirección" },
  { clave: "tren_delantero", grupo: "Suspensión y dirección", etiqueta: "Tren delantero", frase: "Reparación de tren delantero" },
  { clave: "direccion", grupo: "Suspensión y dirección", etiqueta: "Dirección", frase: "Reparación de dirección" },
  { clave: "alineacion_balanceo", grupo: "Suspensión y dirección", etiqueta: "Alineación y balanceo", frase: "Alineación y balanceo", soloSinGomeria: true },
  { clave: "rotacion_cubiertas", grupo: "Suspensión y dirección", etiqueta: "Rotación de cubiertas", frase: "Rotación de cubiertas", soloSinGomeria: true },

  { clave: "bujias", grupo: "Motor", etiqueta: "Bujías", frase: "Cambio de bujías" },
  { clave: "kit_distribucion", grupo: "Motor", etiqueta: "Kit de distribución", frase: "Cambio de kit de distribución" },
  { clave: "correas", grupo: "Motor", etiqueta: "Correas", frase: "Cambio de correas" },
  { clave: "bomba_agua", grupo: "Motor", etiqueta: "Bomba de agua", frase: "Cambio de bomba de agua" },
  { clave: "termostato", grupo: "Motor", etiqueta: "Termostato", frase: "Cambio de termostato" },
  { clave: "refrigerante", grupo: "Motor", etiqueta: "Refrigerante", frase: "Cambio de líquido refrigerante", companeroDeService: true },
  { clave: "junta_tapa", grupo: "Motor", etiqueta: "Junta de tapa", frase: "Cambio de junta de tapa de cilindros" },
  { clave: "puesta_a_punto", grupo: "Motor", etiqueta: "Puesta a punto", frase: "Puesta a punto" },
  { clave: "luz_valvulas", grupo: "Motor", etiqueta: "Luz de válvulas", frase: "Regulación de luz de válvulas" },
  { clave: "inyectores", grupo: "Motor", etiqueta: "Inyectores", frase: "Limpieza de inyectores" },
  { clave: "escape", grupo: "Motor", etiqueta: "Escape", frase: "Reparación de escape" },
  { clave: "motor", grupo: "Motor", etiqueta: "Motor", frase: "Reparación de motor" },

  { clave: "embrague", grupo: "Embrague y caja", etiqueta: "Embrague", frase: "Cambio de kit de embrague" },
  { clave: "caja", grupo: "Embrague y caja", etiqueta: "Caja", frase: "Reparación de caja de cambios" },
  { clave: "aceite_caja", grupo: "Embrague y caja", etiqueta: "Aceite de caja", frase: "Cambio de aceite de caja", companeroDeService: true },
  { clave: "homocinetica", grupo: "Embrague y caja", etiqueta: "Homocinética", frase: "Cambio de homocinética" },
  { clave: "fuelle_homocinetica", grupo: "Embrague y caja", etiqueta: "Fuelle", frase: "Cambio de fuelle de homocinética" },

  { clave: "bateria", grupo: "Eléctrico", etiqueta: "Batería", frase: "Cambio de batería", companeroDeService: true },
  { clave: "alternador", grupo: "Eléctrico", etiqueta: "Alternador", frase: "Cambio de alternador" },
  { clave: "burro_arranque", grupo: "Eléctrico", etiqueta: "Burro de arranque", frase: "Cambio de burro de arranque" },
  { clave: "lamparas", grupo: "Eléctrico", etiqueta: "Lámparas", frase: "Cambio de lámparas" },
  { clave: "escobillas", grupo: "Eléctrico", etiqueta: "Escobillas", frase: "Cambio de escobillas" },
  { clave: "aire_acondicionado", grupo: "Eléctrico", etiqueta: "Aire acondicionado", frase: "Carga de aire acondicionado" },
  { clave: "reparacion_electrica", grupo: "Eléctrico", etiqueta: "Reparación eléctrica", frase: "Reparación eléctrica" },

  { clave: "escaneo", grupo: "General", etiqueta: "Escaneo", frase: "Escaneo y diagnóstico" },
  { clave: "revision_general", grupo: "General", etiqueta: "Revisión general", frase: "Revisión general" },
];

/** normalizar() de lib/texto.ts + espacios internos colapsados a uno. Es
 *  el único criterio de comparación de la orden de trabajo: "cambio de
 *  bujias" y "Cambio  de  bujías" son la misma línea. */
export function normalizarLinea(linea: string): string {
  return normalizar(linea).replace(/\s+/g, " ");
}

/** Las líneas con sustancia: split por \n, trim, sin vacías. */
export function lineasDe(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** true si ALGUNA línea del texto, normalizada, es igual a la frase
 *  normalizada. */
export function tieneFrase(texto: string, frase: string): boolean {
  const buscada = normalizarLinea(frase);
  return lineasDe(texto).some((l) => normalizarLinea(l) === buscada);
}

/** Si la tiene: saca TODAS las líneas iguales a la frase, colapsa líneas en
 *  blanco consecutivas y recorta los extremos. Si no la tiene: la agrega
 *  como última línea (sola si el texto estaba vacío). No toca ninguna otra
 *  línea. */
export function alternarFrase(texto: string, frase: string): string {
  if (!tieneFrase(texto, frase)) {
    const base = texto.trimEnd();
    return base ? `${base}\n${frase}` : frase;
  }

  const buscada = normalizarLinea(frase);
  const quedan: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (normalizarLinea(linea) === buscada) continue;
    // Sacar una línea del medio puede dejar dos blancos pegados: queda uno.
    const enBlanco = linea.trim() === "";
    const anteriorEnBlanco =
      quedan.length > 0 && quedan[quedan.length - 1].trim() === "";
    if (enBlanco && anteriorEnBlanco) continue;
    quedan.push(linea);
  }
  return quedan.join("\n").trim();
}

/** Los renglones que esta pantalla muestra. */
export function renglonesVisibles(opts: {
  tieneGomeria: boolean;
  adjunta: boolean;
}): RenglonMecanica[] {
  return RENGLONES_MECANICA.filter(
    (r) =>
      !(r.soloSinGomeria && opts.tieneGomeria) &&
      !(r.companeroDeService && opts.adjunta),
  );
}

/** Para los lectores de una sola línea: las líneas unidas con " · ".
 *  null/undefined y vacío → null. */
export function descripcionEnUnaLinea(
  texto: string | null | undefined,
): string | null {
  if (!texto) return null;
  return lineasDe(texto).join(" · ") || null;
}
