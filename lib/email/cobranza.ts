import { marcoHtml, marcoTexto, type ContenidoEmail } from "./marco";

// ============================================================
// LOS TRES EMAILS DE COBRANZA · la voz del panel, entregada
//
// El panel tiene tres momentos y tres voces (lib/cobranza/copy.ts). El
// email de cada momento dice lo que el panel diría ese día, en forma de
// email. Los textos son los del anexo de docs/PROMPT-cobranza-hoy.md y se
// publican tal cual, firmados por Santiago.
//
// ⚠ LA CLAVE ES LA MISMA QUE LA DEL PANEL: `momento:voz`, exhaustiva. Una
// entrada que falte NO COMPILA, y una clave que no existe en el panel
// tampoco: `vencido:alta` está excluida a propósito —el alta no tiene
// email intermedio, su escalera es de dos escalones—, igual que
// `gracia:alta` en copy.ts. Ninguna plantilla inventa un estado ni una voz.
//
// ⚠ Y NO PROMETE LO QUE EL INTERRUPTOR NO HACE. «El {fecha8} el panel pasa
// a solo lectura» va SOLO con `corta` (suspension_automatica), igual que
// la barra de gracia desde el bloque 1 (1.2). Con el interruptor apagado
// la frase no existe.
//
// Los umbrales son de la base (`avisos_pendientes()`), no de igualdad, así
// que el email 2 puede salir después del día 0 (un día en que el cron no
// corrió, o el primer día en producción con tenants ya vencidos). Ahí la
// primera frase cambia de tiempo verbal —«el DD/MM venció tu plan»—, que
// es lo que el panel dice ese día; el resto es el texto del anexo.
//
// Puro: sin imports del app, sin fechas del proceso. Los enlaces entran
// por parámetro para que la regresión lo compile y lo corra en Node.
// ============================================================

export type MomentoEmail = "por_vencer" | "vencido" | "suspendido";
export type VozEmail = "cobranza" | "trial" | "alta";
export type ClaveEmail = Exclude<`${MomentoEmail}:${VozEmail}`, "vencido:alta">;

export type DatosEmail = {
  /** El nombre del lubricentro. */
  nombre: string;
  plan: string;
  /** El total a transferir, ya calculado por la base. Null para el trial. */
  monto: number | null;
  periodo: "mensual" | "semestral" | "anual";
  /** YYYY-MM-DD. */
  vencimiento: string;
  /** Días hasta el vencimiento; negativo si ya pasó. */
  dias: number;
  /** El segundo interruptor: si es false, no se promete el solo lectura. */
  corta: boolean;
  /** El alias fijo del tenant, si lo tiene. Hoy null para todos. */
  alias: string | null;
  enlaces: {
    /** /panel/suscripcion, absoluta. */
    pagar: string;
    /** El WhatsApp de Fidelli. */
    whatsapp: string;
  };
};

export type Email = { asunto: string; html: string; text: string; contenido: ContenidoEmail };

const FIRMA = ["Santiago", "Fidelli Motors"];

// ---------- Los formatos del anexo ----------

/** DD/MM. */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** YYYY-MM-DD + n días, en calendario puro (sin zona). */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** $49.000 — el formato del anexo, con punto de miles y sin decimales. */
export function montoCorto(n: number): string {
  const entero = Math.round(n);
  return "$" + String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const PERIODO: Record<DatosEmail["periodo"], string> = {
  mensual: "por mes",
  semestral: "por semestre",
  anual: "por año",
};

// El alias, cuando exista (bloque B del sprint del 17/09). Hoy el pago es
// por orden —el CVU se crea cuando el tenant abre la pantalla de pago—,
// así que la frase dice eso. El día que haya alias fijo, el email lo trae
// y el tenant puede transferir sin loguearse.
function comoSePaga(d: DatosEmail): string {
  return d.alias
    ? `Transferís al alias ${d.alias} y se acredita solo. No hace falta que nos avises ni que mandes el comprobante.`
    : "Transferís al alias de tu cuenta y se acredita solo. No hace falta que nos avises ni que mandes el comprobante.";
}

const PAGAR = (d: DatosEmail) => ({ texto: "Pagar ahora", href: d.enlaces.pagar });
const CHARLAR = (d: DatosEmail) => ({ texto: "Hablemos por WhatsApp", href: d.enlaces.whatsapp });

type Plantilla = (d: DatosEmail) => { asunto: string } & ContenidoEmail;

const PLANTILLAS: Record<ClaveEmail, Plantilla> = {
  // ---------- COBRANZA ----------
  "por_vencer:cobranza": (d) => ({
    asunto: `Tu plan de Fidelli vence el ${fechaCorta(d.vencimiento)}`,
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      `El ${fechaCorta(d.vencimiento)} vence tu plan ${d.plan} de Fidelli Motors. Son ${montoCorto(d.monto ?? 0)} ${PERIODO[d.periodo]}.`,
      "Podés pagarlo desde ahora y no se corta nada:",
    ],
    boton: PAGAR(d),
    despues: [comoSePaga(d), "Cualquier duda, respondé este mail o escribinos por WhatsApp."],
    firma: FIRMA,
  }),
  "vencido:cobranza": (d) => {
    const hoy = d.dias === 0;
    const fecha7 = fechaCorta(sumarDias(d.vencimiento, 7));
    const fecha8 = fechaCorta(sumarDias(d.vencimiento, 8));
    // Con la ventana ya pasada (solo posible con el interruptor apagado:
    // prendido, el estado sería suspendido) no se promete un plazo que
    // ya pasó.
    const enVentana = d.dias >= -7;
    return {
      asunto: hoy ? "Hoy vence tu plan — tenés 7 días" : `Tu plan venció el ${fechaCorta(d.vencimiento)}`,
      titulo: `Hola, ${d.nombre}.`,
      parrafos: [
        (hoy
          ? `Hoy vence tu plan ${d.plan}. Todo sigue funcionando normal durante 7 días, hasta el ${fecha7}.`
          : `El ${fechaCorta(d.vencimiento)} venció tu plan ${d.plan}. ` +
            (enVentana ? `Todo sigue funcionando normal hasta el ${fecha7}.` : "Todo sigue funcionando normal.")),
        d.corta
          ? `Si para entonces no se renovó, el ${fecha8} el panel pasa a solo lectura: no vas a poder cargar trabajos ni dar de alta clientes, el historial de tus clientes queda congelado, y el programa de fidelización desaparece de tu página. No se borra nada, y en cuanto pagás vuelve todo.`
          : "No se borra nada, y en cuanto pagás queda todo al día.",
        `Son ${montoCorto(d.monto ?? 0)}.`,
      ],
      boton: PAGAR(d),
      firma: FIRMA,
    };
  },
  "suspendido:cobranza": (d) => ({
    asunto: "Tu panel pasó a solo lectura",
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      `Pasaron los 7 días y el pago no llegó, así que tu panel de Fidelli quedó en solo lectura. Podés ver todo, pero no cargar trabajos ni clientes nuevos. Tu página pública sigue respondiendo, sin el programa de fidelización, y el historial de tus clientes quedó como estaba el ${fechaCorta(d.vencimiento)}.`,
      "No se borró nada. Pagás y en minutos vuelve todo a funcionar, sin que tengas que avisarnos.",
      `Son ${montoCorto(d.monto ?? 0)}.`,
    ],
    boton: PAGAR(d),
    despues: ["Si pasó algo, contanos: respondé este mail o escribinos por WhatsApp."],
    firma: FIRMA,
  }),

  // ---------- TRIAL · sin monto y sin «Pagar»: es una venta por cerrar ----------
  "por_vencer:trial": (d) => ({
    asunto: `Tu prueba de Fidelli termina el ${fechaCorta(d.vencimiento)}`,
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [`Tu prueba de Fidelli termina el ${fechaCorta(d.vencimiento)}. Si querés seguir, lo vemos por WhatsApp.`],
    boton: CHARLAR(d),
    firma: FIRMA,
  }),
  "vencido:trial": (d) => ({
    asunto: d.dias === 0 ? "Hoy termina tu prueba — tenés 7 días más" : `Tu prueba terminó el ${fechaCorta(d.vencimiento)}`,
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      d.dias === 0
        ? "Hoy termina tu prueba. Tenés 7 días más para decidir."
        : `Tu prueba terminó el ${fechaCorta(d.vencimiento)}. Tenés 7 días más para decidir.`,
    ],
    boton: CHARLAR(d),
    firma: FIRMA,
  }),
  "suspendido:trial": (d) => ({
    asunto: "Tu prueba terminó",
    titulo: `Hola, ${d.nombre}.`,
    parrafos: ["Tu prueba terminó y el panel quedó en solo lectura. Tus datos siguen ahí: si querés seguir, escribinos."],
    boton: CHARLAR(d),
    firma: FIRMA,
  }),

  // ---------- ALTA · dos escalones, sin email intermedio ----------
  "por_vencer:alta": (d) => ({
    asunto: "Bienvenido a Fidelli — el primer pago",
    titulo: `Bienvenido a Fidelli, ${d.nombre}.`,
    parrafos: [
      // «Hasta mañana» el día del alta; «hasta hoy» el día del vencimiento
      // —el mismo redondeo a favor del cliente que la barra del panel—.
      `${d.dias > 0 ? "Tenés hasta mañana" : "Tenés hasta hoy"} para hacer el primer pago y dejar tu cuenta activa. Son ${montoCorto(d.monto ?? 0)}.`,
    ],
    boton: PAGAR(d),
    despues: [comoSePaga(d)],
    firma: FIRMA,
  }),
  "suspendido:alta": (d) => ({
    asunto: "Te falta el primer pago para activar tu cuenta",
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      `Te falta el primer pago para activar tu cuenta. Todo lo que cargaste está guardado. Son ${montoCorto(d.monto ?? 0)}.`,
    ],
    boton: PAGAR(d),
    firma: FIRMA,
  }),
};

/** ¿Existe un email para este momento en esta voz? `vencido:alta` no. */
export function claveDeEmail(tipo: string, voz: string): ClaveEmail | null {
  const clave = `${tipo}:${voz}`;
  return clave in PLANTILLAS ? (clave as ClaveEmail) : null;
}

export function emailDeCobranza(clave: ClaveEmail, d: DatosEmail): Email {
  const { asunto, ...contenido } = PLANTILLAS[clave](d);
  return { asunto, html: marcoHtml(contenido), text: marcoTexto(contenido), contenido };
}
