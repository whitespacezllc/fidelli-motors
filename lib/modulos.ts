import type { ModuloPago } from "@/lib/planes";

// ============================================================
// EL REGISTRO COMERCIAL DE LOS MÓDULOS PAGOS
//
// Hasta que haya facturación de verdad, el interruptor de un módulo es el
// override de plan y la plata vive en el monto de la transferencia. Eso
// deja UN solo lugar donde queda escrito quién paga qué: el motivo del
// override, que ya es obligatorio y ya tiene auditoría propia
// (cambios_override_plan, con autor y fecha).
//
// Por eso el motivo de ESTA clave no es texto libre. Tiene que empezar
// con "Módulo gomería · pago ·" o "Módulo gomería · bonificado ·" y
// seguir con una fecha. Si queda libre, en seis meses nadie sabe cuáles
// de los trece tenants están pagando el módulo y cuáles lo tienen
// regalado — y esa pregunta se contesta con plata.
//
// El formato se valida en el SERVIDOR y comparando contra lo que hay
// guardado: solo se exige cuando la clave del módulo CAMBIA. Un
// superadmin que toca el tope de sucursales de un tenant que ya tiene
// gomería escribe el motivo de las sucursales, no el del módulo.
// ============================================================

export const PREFIJOS_MODULO: Record<ModuloPago, string> = {
  neumaticos: "Módulo gomería",
};

/** "pago" o "bonificado": las dos únicas formas de tener un módulo. */
export const FORMAS_MODULO = ["pago", "bonificado"] as const;

export type FormaModulo = (typeof FORMAS_MODULO)[number];

// Fecha en cualquiera de las dos formas que escribe un argentino:
// 11/09/2026 o 2026-09-11.
const FECHA = String.raw`(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})`;

function patron(modulo: ModuloPago): RegExp {
  const prefijo = PREFIJOS_MODULO[modulo].replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  return new RegExp(`^${prefijo} · (pago|bonificado) · ${FECHA}(\\s|$)`);
}

export function motivoDeModuloValido(
  modulo: ModuloPago,
  motivo: string,
): boolean {
  return patron(modulo).test(motivo.trim());
}

/** Lo que se lee del motivo: si es pago o bonificado, y desde cuándo. */
export function leerMotivoModulo(
  modulo: ModuloPago,
  motivo: string,
): { forma: FormaModulo; fecha: string } | null {
  const m = patron(modulo).exec(motivo.trim());
  if (!m) return null;
  return { forma: m[1] as FormaModulo, fecha: m[2] };
}

/** El mensaje que se le muestra al superadmin cuando el formato no da. */
export function errorMotivoModulo(modulo: ModuloPago): string {
  const p = PREFIJOS_MODULO[modulo];
  return `El motivo de ${p.toLowerCase()} tiene formato fijo: "${p} · pago · 11/09/2026" o "${p} · bonificado · 11/09/2026", y después lo que quieras agregar. Es el único registro de quién paga el módulo hasta que haya facturación.`;
}

/** El arranque que ofrece el formulario, para no tipearlo de memoria. */
export function plantillaMotivoModulo(
  modulo: ModuloPago,
  forma: FormaModulo,
  hoy: string,
): string {
  return `${PREFIJOS_MODULO[modulo]} · ${forma} · ${hoy} · `;
}
