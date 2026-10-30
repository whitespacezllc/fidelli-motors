// ============================================================
// El tema del panel — una preferencia de la PERSONA, no del tenant
//
// Dos modos, claro por defecto. Vive en `usuarios.tema` (20261030100000),
// viaja con la sesión y se pinta con el atributo `data-theme` en el
// wrapper de cada superficie privada (/panel y /fidelli): globals.css
// redefine ahí los tokens de color. No hay `prefers-color-scheme` en
// ningún lado, por la misma razón que el tema de la superficie del cliente
// (regla 7): el interruptor es una decisión, la media query no.
//
// Lo que NUNCA se oscurece: los papeles. El cartón, el papel de la
// mecánica y de las ruedas, el presupuesto y la hoja de calcos son
// documentos y se dibujan siempre claros, también en pantalla: llevan
// `data-theme="claro"` en su raíz y los tokens vuelven a los de siempre.
// ============================================================

export type TemaPanel = "claro" | "oscuro";

export const TEMA_PANEL_DEFAULT: TemaPanel = "claro";

/** Lo que venga de la base o de un formulario, a uno de los dos. */
export function aTemaPanel(v: unknown): TemaPanel {
  return v === "oscuro" ? "oscuro" : "claro";
}

export function otroTema(tema: TemaPanel): TemaPanel {
  return tema === "oscuro" ? "claro" : "oscuro";
}
