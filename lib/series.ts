// Las series temporales de los dos gráficos del producto — tipos, guards
// y etiquetas.
//
// MÓDULO NEUTRO A PROPÓSITO: lo importan las pages (server components,
// para validar el searchParam) y los gráficos ("use client"). Si esto
// viviera adentro de un componente de cliente, sus exports dejarían de
// ser invocables desde el servidor — un guard exportado desde un módulo
// "use client" es una referencia opaca, no una función.

/** Un punto de cualquier serie: el inicio del período y el conteo. */
export type PuntoSerie = { inicio: string; cantidad: number };

// ---------- El Pulso de /fidelli ----------

export type Granularidad = "dia" | "semana" | "mes";

export const GRANULARIDADES: readonly {
  clave: Granularidad;
  nombre: string;
}[] = [
  { clave: "dia", nombre: "Día" },
  { clave: "semana", nombre: "Semana" },
  { clave: "mes", nombre: "Mes" },
];

export function esGranularidad(v: string | undefined): v is Granularidad {
  return v === "dia" || v === "semana" || v === "mes";
}

// ---------- El gráfico de services del panel ----------

export type VistaPanel = "semana" | "mes" | "trimestre" | "anio";

export const VISTAS_PANEL: readonly {
  clave: VistaPanel;
  nombre: string;
  descripcion: string;
}[] = [
  { clave: "semana", nombre: "Semanal", descripcion: "Últimas 12 semanas" },
  { clave: "mes", nombre: "Mensual", descripcion: "Últimos 12 meses" },
  {
    clave: "trimestre",
    nombre: "Trimestral",
    descripcion: "Últimos 8 trimestres",
  },
  { clave: "anio", nombre: "Anual", descripcion: "Últimos 5 años" },
];

export function esVistaPanel(v: string | undefined): v is VistaPanel {
  return v === "semana" || v === "mes" || v === "trimestre" || v === "anio";
}

// ---------- Etiquetas ----------

// El `inicio` de un punto siempre es una fecha pura ("2026-08-11"): se
// parsea por partes, nunca con new Date(iso) — eso la interpreta en UTC y
// en Argentina mostraría el día anterior.
function aFecha(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

/**
 * La etiqueta más corta que se entiende sola, por unidad:
 * día/semana "11/08" · mes "ago" · trimestre "T3 26" · año "2026".
 * Trimestre y año llevan el año porque sus ventanas cruzan varios.
 */
export function etiquetaDePunto(
  iso: string,
  unidad: Granularidad | VistaPanel,
): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);

  if (unidad === "anio") return String(anio);
  if (unidad === "trimestre") {
    return `T${Math.floor((mes - 1) / 3) + 1} ${String(anio).slice(2)}`;
  }
  if (unidad === "mes") {
    return new Intl.DateTimeFormat("es-AR", { month: "short" })
      .format(aFecha(iso))
      .replace(".", "");
  }
  // día y semana: dd/MM armado a mano — es-AR ignora el 2-digit del mes.
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/**
 * Cada cuántas celdas se muestra una etiqueta del eje X. Las "dd/MM" son
 * anchas (5 caracteres): con 12 celdas ya se pisan en un celular, así que
 * saltean de a 2; con 30, de a 4. Las cortas ("ago", "2026") aguantan 12.
 */
export function pasoDeEtiquetas(
  n: number,
  unidad: Granularidad | VistaPanel,
): number {
  const ancha = unidad === "dia" || unidad === "semana";
  if (n > 14) return 4;
  if (ancha && n > 8) return 2;
  return 1;
}

/**
 * Si la etiqueta de la celda i se muestra o va vacía. ANCLADO AL FINAL:
 * la última siempre se ve, y se saltea hacia atrás desde ahí — anclar al
 * principio y forzar la última además dejaba las dos últimas pegadas
 * (i=28 por regla y i=29 por ser la última).
 */
export function mostrarEtiqueta(i: number, n: number, paso: number): boolean {
  return (n - 1 - i) % paso === 0;
}
