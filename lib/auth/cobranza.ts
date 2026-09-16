import type { Periodo } from "@/lib/fidelli/plan";

// ============================================================
// EL RELOJ DE COBRANZA, DEL LADO DE TypeScript
//
// La regla vive en la base (`estado_cobranza`, migración 20260916140000).
// Acá no se re-decide nada: se LEE lo que la base ya resolvió y se le da
// forma para la pantalla.
//
// Los cuatro estados, con sus bordes exactos:
//
//   al_dia      vencimiento >= hoy + dias_de_aviso()
//   por_vencer  hoy <= vencimiento < hoy + dias_de_aviso()
//   gracia      vencimiento < hoy <= vencimiento + dias_de_gracia()
//   suspendido  hoy > vencimiento + dias_de_gracia()  ·  o  activo = false
// ============================================================

export const ESTADOS_COBRANZA = ["al_dia", "por_vencer", "gracia", "suspendido"] as const;

export type EstadoCobranza = (typeof ESTADOS_COBRANZA)[number];

export type Cobranza = {
  estado: EstadoCobranza;
  vencimiento: string | null;
  /** Días de trabajo que quedan CONTANDO HOY. Vale 1 el último día útil.
   *  Puede ser 0 o negativo: con `suspension_automatica` apagada el estado
   *  se queda en `gracia` pasada la ventana, y ahí el copy cambia de
   *  "te quedan N días" a "venció hace N días". */
  diasRestantes: number | null;
  /** Días hasta el vencimiento. Negativo si ya venció. */
  diasParaVencer: number | null;
  periodo: Periodo | null;
  esTrial: boolean;
  /** `descuento_pct = 100`: no paga nada, así que no se le reclama nada. */
  exento: boolean;
  /** El primer interruptor: si es false, este tenant está afuera del reloj. */
  enElReloj: boolean;
  /** El segundo: si es false, el reloj avisa pero nunca cierra el panel. */
  corta: boolean;
};

// El jsonb de `reloj_cobranza()` viaja en snake_case y este tipo es
// camelCase. Es UN espejo literal del `jsonb_build_object` de la
// migración, y existe para que la conversión pase por un solo lugar.
//
// ⚠ NO ALCANZA CON REGENERAR `lib/database.types.ts`: los campos
// calculados de PostgREST no aparecen en el `Row` de la tabla (verificado:
// `plan_capacidades` tampoco está), así que el payload llega como `unknown`
// detrás de un cast y TypeScript no ve la divergencia de nombres. Sin esta
// validadora, un `dias_restantes` leído como `diasRestantes` da `undefined`
// y la pantalla dice "te quedan undefined días". R21d afirma las nueve
// claves del jsonb una por una para que el contrato no se rompa de un lado
// sin romperse del otro.
type CobranzaCruda = {
  estado: unknown;
  vencimiento: unknown;
  dias_restantes: unknown;
  dias_para_vencer: unknown;
  periodo: unknown;
  es_trial: unknown;
  exento: unknown;
  en_el_reloj: unknown;
  corta: unknown;
};

function esEstado(v: unknown): v is EstadoCobranza {
  return typeof v === "string" && (ESTADOS_COBRANZA as readonly string[]).includes(v);
}

function numeroOnulo(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convierte el payload crudo de la base en un `Cobranza`, o devuelve null.
 *
 * NUNCA devuelve un objeto a medias: si el estado no es uno de los cuatro,
 * todo el payload se descarta. Media cobranza en pantalla es peor que
 * ninguna — un "$NaN" o un "undefined días" al lado de un botón de pagar
 * destruye la confianza justo donde hace falta.
 */
export function aCobranza(crudo: unknown): Cobranza | null {
  if (!crudo || typeof crudo !== "object") return null;
  const c = crudo as CobranzaCruda;
  if (!esEstado(c.estado)) return null;

  return {
    estado: c.estado,
    vencimiento: typeof c.vencimiento === "string" ? c.vencimiento : null,
    diasRestantes: numeroOnulo(c.dias_restantes),
    diasParaVencer: numeroOnulo(c.dias_para_vencer),
    periodo: typeof c.periodo === "string" ? (c.periodo as Periodo) : null,
    esTrial: c.es_trial === true,
    exento: c.exento === true,
    enElReloj: c.en_el_reloj === true,
    corta: c.corta === true,
  };
}
