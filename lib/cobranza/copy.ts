import { WHATSAPP_SOPORTE } from "@/lib/config";
import type { Cobranza, EstadoCobranza } from "@/lib/auth/cobranza";

// ============================================================
// EL COPY DE LA ESCALERA
//
// Dos voces y no una, porque son dos conversaciones distintas —el mismo
// criterio que ya usan `mensajeTrial` y `mensajeCobranza` en lib/config.ts:
//
//   · TRIAL — una venta por cerrar. Todavía no pagó nunca, así que el
//     mensaje no habla de plata ni muestra un monto: pregunta si sigue.
//   · COBRANZA — ya es cliente. Da el dato concreto —cuándo vence y
//     cuánto— y ofrece pagar. Sin rodeos: los dos saben de qué se trata.
//
// La clave del mapa es COMPUESTA (`gracia:trial`) y no solo el estado. Con
// `Record<EstadoCobranza, string>` el trial y la cobranza compartían texto
// y un trial en gracia nunca se enteraba de que el panel se cierra. Al ser
// compuesta y exhaustiva, una entrada faltante NO COMPILA.
// ============================================================

type Escalon = Exclude<EstadoCobranza, "al_dia">;
type Voz = "trial" | "cobranza";
type Clave = `${Escalon}:${Voz}`;

export type TextoCobranza = {
  /** Lo que dice la barra. Corto: se lee de reojo. */
  titulo: string;
  /** La línea de abajo. Puede faltar en la barra discreta. */
  detalle?: string;
  /** Qué dice el botón. */
  accion: string;
};

// Cuántos días faltan, dicho como lo diría una persona.
function enDias(n: number): string {
  if (n <= 0) return "hoy";
  if (n === 1) return "mañana";
  return `en ${n} días`;
}

function fecha(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const TEXTOS: Record<Clave, (c: Cobranza, monto: string | null) => TextoCobranza> = {
  // ---------- POR VENCER ----------
  "por_vencer:cobranza": (c, monto) => ({
    titulo: `Tu plan vence ${enDias(c.diasParaVencer ?? 0)}`,
    detalle: monto
      ? `El ${fecha(c.vencimiento)} se renueva por ${monto}.`
      : `Se renueva el ${fecha(c.vencimiento)}.`,
    accion: "Pagar",
  }),
  "por_vencer:trial": (c) => ({
    titulo: `Tu prueba gratuita termina ${enDias(c.diasParaVencer ?? 0)}`,
    detalle: `Es el ${fecha(c.vencimiento)}. Si querés seguir, lo vemos por WhatsApp.`,
    accion: "¿Charlamos?",
  }),

  // ---------- GRACIA ----------
  // El número sale de `dias_de_gracia_restantes`, que vale 1 el ÚLTIMO día
  // útil y nunca 0: "te quedan 0 días" con el panel escribiendo normal es
  // la clase de detalle que hace que el dueño deje de creerle al aviso.
  //
  // Puede venir 0 o negativo: con `suspension_automatica` apagada el estado
  // se queda en `gracia` pasada la ventana. Ahí el texto cambia de "te
  // quedan" a "venció hace", que es lo único honesto — prometer un plazo
  // que ya pasó es peor que no decir nada.
  "gracia:cobranza": (c, monto) => {
    const n = c.diasRestantes ?? 0;
    return {
      titulo:
        n > 1
          ? `Tu plan venció — te quedan ${n} días`
          : n === 1
            ? "Tu plan venció — hoy es el último día"
            : `Tu plan venció el ${fecha(c.vencimiento)}`,
      detalle: monto
        ? `Son ${monto}. Después de esto el panel pasa a solo lectura.`
        : "Después de esto el panel pasa a solo lectura.",
      accion: "Pagar",
    };
  },
  "gracia:trial": (c) => {
    const n = c.diasRestantes ?? 0;
    return {
      titulo:
        n > 1
          ? `Tu prueba terminó — te quedan ${n} días`
          : n === 1
            ? "Tu prueba terminó — hoy es el último día"
            : `Tu prueba terminó el ${fecha(c.vencimiento)}`,
      detalle: "Después de esto vas a poder consultar tus datos, pero no cargar.",
      accion: "¿Charlamos?",
    };
  },

  // ---------- SUSPENDIDO ----------
  // La barra no se usa acá: el suspendido ve `AvisoSuspension`, que ya
  // existe y tiene su copy escrito. Estas entradas existen para que el
  // mapa sea exhaustivo y para la fila de /fidelli.
  "suspendido:cobranza": () => ({
    titulo: "Tu cuenta está suspendida",
    detalle: "Podés consultar todos tus datos, pero no cargar nada nuevo.",
    accion: "Pagar",
  }),
  "suspendido:trial": () => ({
    titulo: "Tu prueba gratuita terminó",
    detalle: "Podés consultar todos tus datos, pero no cargar nada nuevo.",
    accion: "¿Charlamos?",
  }),
};

export function textoDeCobranza(
  c: Cobranza,
  monto: string | null = null,
): TextoCobranza | null {
  if (c.estado === "al_dia") return null;
  return TEXTOS[`${c.estado}:${c.esTrial ? "trial" : "cobranza"}`](c, monto);
}

// ============================================================
// A dónde va el botón
//
// Desde la Fase 2 hay pantalla de pago propia, así que el botón lleva ahí:
// el dueño elige período, ve el desglose y se lleva un CVU suyo para
// transferir desde el home banking.
//
// Cambió SOLO esta función: las tres piezas de la escalera —la barra de
// Inicio, la barra de gracia y el modal— no se enteraron. Era el punto de
// la Fase 1 y funcionó.
//
// EL TRIAL SIGUE YENDO A WHATSAPP, y no es una omisión: el que está en
// prueba todavía no decidió comprar. Mandarlo a una pantalla de pago es
// contestar una pregunta que no hizo; lo que necesita es una conversación.
// Mismo criterio que "se elige período, nunca plan".
// ============================================================
export function enlaceDePago(c: Cobranza, monto: string | null): string {
  if (!c.esTrial) return "/panel/suscripcion";

  const texto = c.esTrial
    ? `Hola! Soy de ${"{taller}"}. Mi prueba de Fidelli Motors termina el ${fecha(c.vencimiento)} y quiero seguir.`
    : `Hola! Soy de ${"{taller}"}. Quiero pagar mi plan de Fidelli Motors` +
      (monto ? ` (${monto})` : "") +
      `, que vence el ${fecha(c.vencimiento)}.`;
  return `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(texto)}`;
}

/** ¿El enlace sale del sitio? Decide si el botón abre una pestaña nueva:
 *  mandar /panel/suscripcion a `target="_blank"` deja al dueño con dos
 *  pestañas del panel y la de atrás mostrando datos viejos. */
export function esEnlaceExterno(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/** El mismo enlace, con el nombre del taller ya puesto. */
export function enlaceDePagoDe(
  c: Cobranza,
  monto: string | null,
  taller: string | null,
): string {
  return enlaceDePago(c, monto).replace(
    encodeURIComponent("{taller}"),
    encodeURIComponent(taller ?? "un lubricentro"),
  );
}
