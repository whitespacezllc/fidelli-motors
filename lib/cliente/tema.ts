// El tema de la superficie del cliente es UNA ELECCIÓN DEL LUBRICENTRO,
// no una preferencia del sistema del celular. Brothers Oil trabaja con
// colores oscuros y quiere su página oscura PARA TODOS los que escanean:
// con prefers-color-scheme la mitad de sus clientes la vería clara y el
// pedido quedaría sin resolver. Por eso acá no hay media queries — el
// tema baja de config_experiencia con el resto de la marca y se aplica
// pisando las variables de color en el wrapper de la página.
//
// El default es CLARO y un tenant sin configurar rinde EXACTO lo de hoy.

export type TemaCliente = "claro" | "oscuro";
export type TamanoLogo = "normal" | "grande" | "xl";

export function aTema(v: string | null | undefined): TemaCliente {
  return v === "oscuro" ? "oscuro" : "claro";
}

export function aTamanoLogo(v: string | null | undefined): TamanoLogo {
  return v === "grande" || v === "xl" ? v : "normal";
}

// La escala sobre grafito la define el sistema de diseño y acá no se
// inventa nada: blanco puro el texto principal, 72% el secundario, 55%
// el terciario, 14% los bordes. Lo único que el sistema no define es la
// elevación (inputs y tarjetas necesitan despegarse del fondo): #141414
// y #1D1D1D son el mínimo paso perceptible sobre #0A0A0A.
// Exportado porque el manifest de la PWA del tenant necesita el MISMO
// fondo para su pantalla de arranque: si el splash saliera blanco en un
// tenant oscuro, la app abriría con un flash antes de pintar la página.
export const GRAFITO = "#0A0A0A";

const VARIABLES_OSCURO = {
  "--color-ink": "#FFFFFF",
  "--color-ink-60": "rgba(255,255,255,0.72)",
  "--color-ink-40": "rgba(255,255,255,0.55)",
  "--color-line": "rgba(255,255,255,0.14)",
  "--color-base": "#141414",
  "--color-surface": "#1D1D1D",
} as const;

/**
 * El estilo del wrapper de página. En claro, el fondo elegido por el
 * lubri (o el blanco de siempre). En oscuro, el grafito del sistema:
 * color_fondo NO se aplica — queda guardado para cuando vuelva a claro.
 */
export function estilosTema(
  tema: TemaCliente,
  colorFondo: string | null,
): React.CSSProperties {
  if (tema === "oscuro") {
    return {
      ...VARIABLES_OSCURO,
      backgroundColor: GRAFITO,
      // `color` se re-declara a propósito: el body lo computa UNA vez
      // (tinta oscura) y los hijos heredan ese valor ya resuelto — pisar
      // solo la variable no alcanza para el texto sin clase de color
      // (títulos, cifras). Con esto, todo lo que no declara color hereda
      // el blanco; lo que sí declara, re-evalúa su variable igual.
      color: "#FFFFFF",
    } as React.CSSProperties;
  }
  return colorFondo ? { backgroundColor: colorFondo } : {};
}

/**
 * El cartón es PAPEL y el papel no se apaga: sobre el mostrador oscuro
 * sigue siendo un recibo blanco. Este reset devuelve los tokens claros
 * dentro del subárbol del cartón para que la metáfora no se rompa. En
 * claro es inocuo: declara los mismos valores que ya se heredan.
 */
export const ESTILO_PAPEL: React.CSSProperties = {
  // El mismo motivo que en estilosTema: la tinta del papel se hereda por
  // `color`, no solo por la variable.
  color: "#0A0A0A",
  "--color-ink": "#0A0A0A",
  "--color-ink-60": "#4A4A4A",
  "--color-ink-40": "#8A8A8A",
  "--color-line": "#E4E4E4",
  "--color-base": "#FFFFFF",
  "--color-surface": "#F5F5F5",
} as React.CSSProperties;

// El tamaño del logo, en clases y no en un número libre: un logo sin
// tope empuja el buscador abajo del pliegue justo para el que más
// orgulloso está de su marca. El XL está medido para que a 375px el
// buscador de patente siga a la vista.
export const CLASE_LOGO_LANDING: Record<TamanoLogo, string> = {
  normal: "h-16 sm:h-24",
  grande: "h-24 sm:h-32",
  xl: "h-32 sm:h-40",
};

// En la pantalla del vehículo la marca es marco, no protagonista: los
// saltos son más cortos a propósito.
export const CLASE_LOGO_CABECERA: Record<TamanoLogo, string> = {
  normal: "h-11",
  grande: "h-14",
  xl: "h-16",
};
