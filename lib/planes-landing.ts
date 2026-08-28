// LOS TRES PLANES — la única fuente de verdad de la landing comercial.
//
// De acá salen las tarjetas, la tabla de comparación, el JSON-LD de
// SoftwareApplication y `public/llms.txt`. El pedido del bloque es que los
// tres precios coincidan EXACTO en los tres lados: la forma de garantizarlo
// no es revisarlos, es que haya un solo lugar donde estén escritos.
//
// ⚠ CONTENIDO VALIDADO CONTRA PRODUCCIÓN, no contra el boceto. Cada fila de
// software de acá abajo se corresponde con una feature real de la tabla
// `planes` (features jsonb) o con un límite real (`limites`). Lo que en el
// boceto era una promesa sin respaldo se corrigió y está anotado en su
// lugar. Antes de agregar una fila nueva: si no existe en producción, no va.
//
// Los precios y los límites replican la fila de `planes` en la base:
//   Basic $39.000  · sucursales 1     · sin features
//   Pro   $49.000  · sucursales 3     · mecanica, pendientes, premios,
//                                       presupuestos, personalizacion_pagina
//   Ultra $99.000  · sin tope         · todo lo anterior + pagina_premium
// El descuento anual es 25% (descuento_anual_pct), o sea "pagás 9, usás 12".

export const DESCUENTO_ANUAL = 0.25;

export type ClavePlan = "basic" | "pro" | "ultra";

export type PlanLanding = {
  clave: ClavePlan;
  nombre: string;
  /** Precio de lista, por mes, sin descuento. */
  mensual: number;
  /** Total del año con el 25%: mensual × 12 × 0.75. */
  anual: number;
  /** El anual dividido en los 12 meses que se usan. */
  anualPorMes: number;
  paraQuien: string;
  /** El encabezado de la lista: "Incluye" o "Todo lo de X, más". */
  encabezadoLista: string;
  incluye: readonly string[];
  /** El texto del botón. Los tres van al mismo WhatsApp. */
  cta: string;
  destacado: boolean;
  /**
   * Lo que este plan NO trae, dicho en una línea.
   *
   * ⚠ NO ES UN DESCUIDO Y NO SE SACA. Va contra lo que hace la mayoría
   * de las SaaS, que esconden lo que falta en el plan barato para que
   * nadie lo descarte. Acá conviene exactamente lo contrario: lo que
   * falta en Basic —mecánica, presupuestos, calcos impresas— es
   * precisamente lo que más quiere el que hace mecánica, así que
   * decirlo hace que descarte Basic en dos segundos y sin que nadie
   * tenga que convencerlo. Es más honesto, que es la línea de toda esta
   * landing, y ahorra la conversación incómoda del mes que viene.
   */
  noIncluye?: string;
};

function conDescuento(mensual: number) {
  const anual = Math.round(mensual * 12 * (1 - DESCUENTO_ANUAL));
  return { anual, anualPorMes: Math.round(anual / 12) };
}

export const PLANES: readonly PlanLanding[] = [
  {
    clave: "basic",
    nombre: "Basic",
    mensual: 39000,
    ...conDescuento(39000),
    paraQuien: "Para el lubricentro de una sucursal que quiere ordenarse.",
    encabezadoLista: "Incluye",
    incluye: [
      "Trabajos, clientes y vehículos ilimitados",
      "Avisos por kilómetros y a quién llamar",
      "Página del cliente con QR",
      // Bloque 7: la hoja A4 de calcos se imprime desde el panel y está en
      // LOS TRES planes. En el boceto decía "el QR en PDF": no generamos un
      // PDF, se imprime desde la pantalla. Se dice como es.
      "Tu hoja de calcos QR, lista para imprimir",
      "1 sucursal",
      "Soporte por WhatsApp",
    ],
    cta: "Empezar con Basic",
    noIncluye: "Sin trabajos mecánicos, presupuestos ni calcos impresas.",
    destacado: false,
  },
  {
    clave: "pro",
    nombre: "Pro",
    mensual: 49000,
    ...conDescuento(49000),
    paraQuien:
      "Para el que además hace mecánica y quiere que los clientes vuelvan solos.",
    encabezadoLista: "Todo lo de Basic, más",
    incluye: [
      "Trabajos de mecánica y pendientes",
      "Premios para que tus clientes vuelvan",
      "Presupuestos con tu marca",
      "Página del cliente personalizable",
      "200 calcos QR al arrancar, con tu diseño",
      "Hasta 3 sucursales",
    ],
    cta: "Sumar mi lubricentro",
    destacado: true,
  },
  {
    clave: "ultra",
    nombre: "Ultra",
    mensual: 99000,
    ...conDescuento(99000),
    paraQuien:
      "Para el taller que quiere que todo lo que sale de su local se vea impecable.",
    encabezadoLista: "Todo lo de Pro, más",
    incluye: [
      // El boceto ponía acá "Presupuestos diseñados a medida". NO EXISTE:
      // `presupuestos` es una sola feature booleana y el documento es el
      // mismo en Pro y en Ultra. Lo que sí distingue a Ultra es la página
      // premium, que se construyó en el bloque 7.
      "Tu mensaje al cliente cuando escanea",
      "Botón de WhatsApp a tu taller en la página",
      "400 calcos QR al arrancar, con diseño a medida",
      "Sucursales ilimitadas",
      "Entrás primero en la fila de instalación",
      "Soporte prioritario",
    ],
    cta: "Empezar con Ultra",
    destacado: false,
  },
] as const;

export const PLAN_DESTACADO = PLANES.find((p) => p.destacado) as PlanLanding;

/** "$39.000" — el formato de toda la landing, sin decimales. */
export function pesos(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

// ---------- La comparación ----------
// Un valor por plan, en el orden de PLANES. `true` es un tilde, `false` un
// guion, y un string se imprime tal cual.
export type FilaComparacion = {
  concepto: string;
  valores: readonly [boolean | string, boolean | string, boolean | string];
};

export type GrupoComparacion = {
  titulo: string;
  filas: readonly FilaComparacion[];
};

export const COMPARACION: readonly GrupoComparacion[] = [
  {
    titulo: "Lo básico",
    filas: [
      {
        concepto: "Trabajos, clientes y vehículos",
        valores: ["Ilimitados", "Ilimitados", "Ilimitados"],
      },
      { concepto: "Carga en 90 segundos", valores: [true, true, true] },
      { concepto: "Avisos por kilómetros", valores: [true, true, true] },
      { concepto: "A quién llamar esta semana", valores: [true, true, true] },
      { concepto: "Mensajes ya armados", valores: [true, true, true] },
      { concepto: "Sucursales", valores: ["1", "Hasta 3", "Ilimitadas"] },
    ],
  },
  {
    titulo: "Trabajos",
    filas: [
      { concepto: "Services", valores: [true, true, true] },
      { concepto: "Catálogo de tus productos", valores: [true, true, true] },
      { concepto: "Trabajos de mecánica", valores: [false, true, true] },
      { concepto: "Trabajos pendientes", valores: [false, true, true] },
      // Una sola feature en la base: o los tenés o no. Sin niveles.
      { concepto: "Presupuestos con tu marca", valores: [false, true, true] },
    ],
  },
  {
    titulo: "Tus clientes",
    filas: [
      { concepto: "Página del cliente con QR", valores: [true, true, true] },
      { concepto: "Historial sin app ni cuenta", valores: [true, true, true] },
      { concepto: "Personalizar la página", valores: [false, true, true] },
      { concepto: "Modo oscuro y tamaño de tu logo", valores: [false, true, true] },
      { concepto: "Tu mensaje al escanear", valores: [false, false, true] },
      { concepto: "Botón de WhatsApp a tu taller", valores: [false, false, true] },
      { concepto: "Premios", valores: [false, true, true] },
    ],
  },
  {
    titulo: "Calcos QR",
    filas: [
      {
        concepto: "Al arrancar",
        valores: ["Para imprimir", "200 impresos", "400 impresos"],
      },
      { concepto: "Diseño", valores: ["Estándar", "Con tu marca", "A medida"] },
    ],
  },
  {
    titulo: "Puesta en marcha",
    filas: [
      { concepto: "Garantía de 30 días", valores: [true, true, true] },
      { concepto: "Lugar en la fila", valores: ["Normal", "Normal", "Primero"] },
      { concepto: "Soporte", valores: ["WhatsApp", "WhatsApp", "Prioritario"] },
    ],
  },
] as const;
