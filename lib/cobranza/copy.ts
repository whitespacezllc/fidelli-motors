import { WHATSAPP_SOPORTE } from "@/lib/config";
import type { Cobranza, EstadoCobranza } from "@/lib/auth/cobranza";

// ============================================================
// EL COPY DE LA ESCALERA
//
// TRES voces y no una, porque son tres conversaciones distintas —el mismo
// criterio que ya usan `mensajeTrial` y `mensajeCobranza` en lib/config.ts:
//
//   · TRIAL — una venta por cerrar. Todavía no pagó nunca, así que el
//     mensaje no habla de plata ni muestra un monto: pregunta si sigue.
//   · COBRANZA — ya es cliente. Da el dato concreto —cuándo vence y
//     cuánto— y ofrece pagar. Sin rodeos: los dos saben de qué se trata.
//   · ALTA — se dio de alta y todavía no entró su primer pago. NO ES UNA
//     RENOVACIÓN: la escalera de gracia está escrita para el mes trece de
//     una relación, y le diría "Tu plan venció — te quedan 5 días" a
//     alguien que es cliente hace 48 horas. No venció nada: FALTA EL PRIMER
//     PAGO, que es otra conversación. En cuanto entra ese pago el tenant
//     pasa a la voz `cobranza` y no vuelve nunca.
//
// La clave del mapa es COMPUESTA (`gracia:trial`) y no solo el estado. Con
// `Record<EstadoCobranza, string>` el trial y la cobranza compartían texto
// y un trial en gracia nunca se enteraba de que el panel se cierra. Al ser
// compuesta y exhaustiva, una entrada faltante NO COMPILA.
//
// ⚠ `gracia:alta` NO EXISTE, Y EL TIPO LO DICE. El que nunca pagó no tiene
// días de gracia: su escalera es de dos escalones —`por_vencer` y
// bloqueado— y salta la ventana entera. La gracia de siete días es para el
// que ya es cliente y se atrasó. El `Exclude` de abajo resta esa única
// combinación imposible sin apagar la exhaustividad: un estado nuevo o una
// cuarta voz siguen obligando a escribir sus entradas. Mismo recurso que
// `Exclude<PosicionRueda, "auxilio">` en lib/ruedas.ts.
//
// Y la mitad que no se ve: quien ARMA la clave también tiene que estrechar
// el estado antes de pedir la voz `alta` — ver `claveDe()` abajo. Sin eso,
// el template literal se ensancha a la clave imposible y no compila.
// ============================================================

type Escalon = Exclude<EstadoCobranza, "al_dia">;
type Voz = "trial" | "cobranza" | "alta";
type Clave = Exclude<`${Escalon}:${Voz}`, "gracia:alta">;

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

  // ---------- LA VOZ DEL ALTA ----------
  // Dos escalones y no tres: no hay `gracia:alta`.
  //
  // El plazo se DICE "hasta mañana" y muestra la fecha de vencimiento, pero
  // el bloqueo cae al día SIGUIENTE de esa fecha — el redondeo a favor del
  // cliente vive en `estado_cobranza`. Acá el texto sigue al número: con el
  // vencimiento al día siguiente del alta, `diasParaVencer` vale 1 el día
  // del alta y 0 al otro.
  //
  // Puede venir NEGATIVO: con el tercer interruptor apagado el estado se
  // queda en `por_vencer` pasado el plazo, y ahí prometer un plazo que ya
  // pasó es peor que no decir nada. Mismo criterio que `gracia:cobranza`.
  "por_vencer:alta": (c, monto) => {
    const n = c.diasParaVencer ?? 0;
    return {
      titulo:
        n > 0
          ? "Tenés hasta mañana para hacer el primer pago"
          : n === 0
            ? "Tenés hasta hoy para hacer el primer pago"
            : "Te falta el primer pago para activar tu cuenta",
      detalle: monto
        ? n >= 0
          ? `Son ${monto}, y vence el ${fecha(c.vencimiento)}.`
          : `Son ${monto}. Cuando entre, tu cuenta queda activa.`
        : n >= 0
          ? `El plazo vence el ${fecha(c.vencimiento)}.`
          : "Cuando entre, tu cuenta queda activa.",
      accion: "Pagar",
    };
  },
  "suspendido:alta": (c, monto) => ({
    titulo: "Te falta el primer pago para activar tu cuenta",
    detalle: monto
      ? `Son ${monto}. Mientras tanto podés consultar todos tus datos, pero no cargar nada nuevo.`
      : "Mientras tanto podés consultar todos tus datos, pero no cargar nada nuevo.",
    accion: "Pagar",
  }),
};

/**
 * Qué voz le toca a este tenant.
 *
 * El orden importa y es el del negocio: el TRIAL gana —alguien en prueba
 * tampoco pagó nunca, pero su conversación es la venta, no el primer
 * pago—; después el ALTA, para el que no tiene ningún pago acreditado; y
 * si no, la cobranza de siempre.
 *
 * ⚠ EL `estado !== "gracia"` NO ES DEFENSIVO: es lo que hace que TypeScript
 * resuelva el template a las dos claves que sí existen. Sin él, el tipo se
 * ensancha a `gracia:alta` y este archivo no compila. Y en runtime tampoco
 * puede pasar: el que nunca pagó salta la ventana de gracia entera
 * (`estado_cobranza`, rama @sin_pagos). Las dos mitades dicen lo mismo.
 */
function claveDe(c: Cobranza & { estado: Escalon }): Clave {
  if (c.esTrial) return `${c.estado}:trial`;
  if (!c.tienePago && c.estado !== "gracia") return `${c.estado}:alta`;
  return `${c.estado}:cobranza`;
}

export function textoDeCobranza(
  c: Cobranza,
  monto: string | null = null,
): TextoCobranza | null {
  if (c.estado === "al_dia") return null;

  // ⚠ SE RESUELVE A UNA VARIABLE Y SE CHEQUEA, aunque el tipo diga que no
  // hace falta. `noUncheckedIndexedAccess` está apagado, así que un índice
  // que no existe se tipa como la función y se invoca en el acto: un
  // TypeError, no un cartel vacío. Y `BarraCobranza` se monta en TODAS las
  // pantallas del panel, así que ahí no se rompe un aviso — se rompe el
  // panel entero para ese cliente. El tipo describe lo que el front cree;
  // el estado lo manda la base.
  const texto = TEXTOS[claveDe(c as Cobranza & { estado: Escalon })];
  return texto ? texto(c, monto) : null;
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
