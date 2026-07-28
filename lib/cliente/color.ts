// La landing es un shell neutro que se pinta con `color_primario` del
// lubricentro. De ese único hex salen cuatro variables CSS. Todo se calcula
// en el servidor: son cuatro cuentas sobre seis dígitos, no justifican
// mandarle JavaScript al celular de Pedro.

const HEX = /^#[0-9A-Fa-f]{6}$/;

// Neutro, igual que el default de la columna en la base.
const NEUTRO = "#0A0A0A";

export type PaletaTenant = {
  primary: string;
  soft: string;
  deep: string;
  /** La tinta que se lee ARRIBA de `primary`. */
  ink: string;
};

// El valor viaja adentro de un jsonb y termina en un atributo `style`.
// La base lo valida con un CHECK, pero acá se vuelve a validar igual: un
// string cualquiera metido en CSS es una inyección, y el CHECK podría no
// estar del otro lado el día que este código se llame desde otro lado.
function normalizarHex(hex: string | null | undefined): string {
  return typeof hex === "string" && HEX.test(hex) ? hex.toUpperCase() : NEUTRO;
}

function componentes(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function aHex(r: number, g: number, b: number): string {
  const parte = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${parte(r)}${parte(g)}${parte(b)}`;
}

// Luminancia relativa de WCAG 2.1. Exportada porque la pantalla de
// diseño de experiencia la usa para avisar el contraste antes de guardar.
export function luminancia(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = componentes(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function mezclar(hex: string, hacia: [number, number, number], proporcion: number) {
  const [r, g, b] = componentes(hex);
  const p = proporcion;
  return aHex(
    r + (hacia[0] - r) * p,
    g + (hacia[1] - g) * p,
    b + (hacia[2] - b) * p,
  );
}

export function paletaTenant(colorPrimario: string | null | undefined): PaletaTenant {
  const primary = normalizarHex(colorPrimario);

  return {
    primary,
    // Fondo suave para chips y avisos: el color casi disuelto en blanco.
    soft: mezclar(primary, [255, 255, 255], 0.9),
    // Un escalón más oscuro para el hover del botón.
    deep: mezclar(primary, [0, 0, 0], 0.16),
    // El lubri puede elegir un amarillo: contra un color claro, el blanco
    // no se lee. El umbral 0.45 deja el texto blanco sobre verdes y azules
    // medios —donde gana por contraste— y pasa a tinta sobre pasteles.
    ink: luminancia(primary) > 0.45 ? "#0A0A0A" : "#FFFFFF",
  };
}

// Los cuatro tokens de Tailwind, listos para un `style`. Se pisan los
// `--color-tenant*` directamente y no una variable intermedia: ver la nota
// en globals.css sobre por qué la indirección no heredaba.
export function variablesTenant(paleta: PaletaTenant): React.CSSProperties {
  return {
    "--color-tenant": paleta.primary,
    "--color-tenant-soft": paleta.soft,
    "--color-tenant-deep": paleta.deep,
    "--color-tenant-ink": paleta.ink,
  } as React.CSSProperties;
}
