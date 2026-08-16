import { telefonoWhatsapp } from "@/lib/contacto";
import {
  ETIQUETA_PERIODO,
  MESES_DEL_PERIODO,
  pesos,
  totalDelPeriodo,
  type Periodo,
} from "@/lib/fidelli/plan";
import {
  mensajeCobranza,
  mensajeTrial,
  type MotivoAviso,
} from "@/lib/config";
import { diasEntre, formatearFecha, hoyISO } from "@/lib/fechas";
import type { PlanCompleto } from "@/components/fidelli/tipos";

// Los cuatro estados que devuelve estado_atencion() en la base. El front no
// los calcula: los recibe y los pinta.
export type Atencion =
  | "trial_vencido"
  | "cobranza_vencida"
  | "trial_por_vencer"
  | "cobranza_por_vencer";

export function esAtencion(v: string | null | undefined): v is Atencion {
  return (
    v === "trial_vencido" ||
    v === "cobranza_vencida" ||
    v === "trial_por_vencer" ||
    v === "cobranza_por_vencer"
  );
}

// El motivo es lo que decide qué conversación se abre: una venta o una
// cobranza. Los cuatro estados colapsan en dos.
export function motivoDe(atencion: Atencion): MotivoAviso {
  return atencion.startsWith("trial") ? "trial" : "cobranza";
}

// Ámbar y gris, nunca el rojo de marca: esto es estado, no acción. Lo
// vencido pesa más que lo que está por vencer, y el trial se distingue de
// la cobranza porque son dos trabajos distintos del día.
export const ESTILO_ATENCION: Record<
  Atencion,
  { etiqueta: string; clase: string; explicacion: string }
> = {
  trial_vencido: {
    etiqueta: "Trial vencido",
    clase: "border-overdue bg-overdue-soft text-overdue",
    explicacion: "Se le terminó la prueba y no pagó nunca.",
  },
  cobranza_vencida: {
    etiqueta: "Plan vencido",
    clase: "border-overdue bg-overdue-soft text-overdue",
    explicacion: "Ya es cliente y hay una transferencia pendiente.",
  },
  trial_por_vencer: {
    etiqueta: "Trial por vencer",
    clase: "border-urgente bg-urgente-soft text-urgente",
    explicacion: "Le queda poco de prueba: es una venta por cerrar.",
  },
  cobranza_por_vencer: {
    etiqueta: "Plan por vencer",
    clase: "border-urgente bg-urgente-soft text-urgente",
    explicacion: "Le toca renovar en los próximos días.",
  },
};

export const ETIQUETA_MOTIVO: Record<MotivoAviso, string> = {
  trial: "venta",
  cobranza: "cobranza",
};

// ============================================================
// El link de WhatsApp del aviso
//
// Devuelve null cuando no hay a quién escribirle: la pantalla muestra "Sin
// teléfono cargado" en vez de un botón que abre wa.me/null.
// ============================================================
export function linkDeAviso({
  atencion,
  telefono,
  ownerNombre,
  lubricentroNombre,
  vencimiento,
  periodo,
  descuentoPct,
  plan,
}: {
  atencion: Atencion;
  telefono: string | null;
  ownerNombre: string | null;
  lubricentroNombre: string;
  vencimiento: string;
  periodo: Periodo;
  descuentoPct: number;
  plan: PlanCompleto | null;
}): string | null {
  const numero = telefono ? telefonoWhatsapp(telefono) : null;
  if (!numero) return null;

  // Se saluda al owner por su nombre; si el tenant todavía no tiene uno, la
  // marca sirve igual y no queda un "Hola null!".
  const nombre = ownerNombre?.trim() || lubricentroNombre;
  const fecha = formatearFecha(vencimiento);

  const texto =
    motivoDe(atencion) === "trial"
      ? mensajeTrial(nombre, fecha)
      : mensajeCobranza(
          nombre,
          fecha,
          ETIQUETA_PERIODO[periodo].toLowerCase(),
          // Lo que tiene que transferir por el período completo, con la
          // cadena de descuentos ya aplicada: no el precio de lista.
          plan
            ? pesos(totalDelPeriodo(plan, periodo, descuentoPct)).replace(
                "ARS ",
                "",
              )
            : "—",
        );

  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// "vence en 3 días" · "venció hace 5 días" · "vence hoy". Se calcula desde
// la fecha, no desde el umbral: no hace falta repetir acá el 7 que ya vive
// en dias_de_aviso().
export function textoDeVencimiento(vencimiento: string): string {
  // Calendario argentino, no el del proceso (UTC en Vercel).
  const dias = diasEntre(hoyISO(), vencimiento);

  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  if (dias > 1) return `vence en ${dias} días`;
  if (dias === -1) return "venció ayer";
  return `venció hace ${Math.abs(dias)} días`;
}

// El período que se factura, para el resumen del aviso.
export function mesesDelPeriodo(periodo: Periodo): number {
  return MESES_DEL_PERIODO[periodo];
}
