import { marcoHtml, marcoTexto, type ContenidoEmail } from "./marco";

// ============================================================
// LOS DOS EMAILS DE UN PEDIDO DE CALCOS · la voz del panel, entregada
//
//   · «Recibimos tu pago»: lo manda la ruta del webhook, DESPUÉS de
//     contestarle 200 a Cresium, cuando el depósito acredita el pedido.
//   · «Salió tu pedido» / «Tu pedido está listo»: lo manda la acción de
//     /fidelli que marca el pedido enviado o listo para retirar.
//
// Los textos son los del sprint (docs/PROMPT-calcos.md § 4.4) y dicen lo
// mismo que dice la pantalla ese día. Con el marco de siempre
// (lib/email/marco.ts): un cliente que recibió la invitación reconoce este
// mail sin leerlo.
//
// ⚠ NI UNA PALABRA DE COSTO. El tenant compra packs: acá no aparece la
// unidad en la que cotiza una gráfica, ni lo que nos sale imprimir. Y los
// plazos no se escriben acá: entran por parámetro desde lib/calcos.ts, que
// es donde la pantalla también los lee.
//
// Cada uno sale UNA vez por pedido: lo garantiza la base
// (reclamar_mail_encargo_calcos), no esta plantilla.
//
// Puro: sin imports del app ni fechas del proceso, como lib/email/cobranza.ts,
// para que una regresión lo compile y lo corra en Node sin el bundler.
// ============================================================

export type Email = { asunto: string; html: string; text: string; contenido: ContenidoEmail };

export type PedidoParaEmail = {
  /** El nombre del lubricentro. */
  nombre: string;
  /** El número del pedido, sin formato: 12 → «#0012». */
  numero: number;
  cantidad: number;
  /** /panel/cuenta/calcos, absoluta. */
  enlace: string;
};

function numero(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

function cantidad(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function armar(asunto: string, contenido: ContenidoEmail): Email {
  return { asunto, html: marcoHtml(contenido), text: marcoTexto(contenido), contenido };
}

/** «Recibimos tu pago del pedido #0012: 400 calcos…» */
export function emailPagoAcreditado(
  d: PedidoParaEmail & { tiempoDeProduccion: string },
): Email {
  return armar(`Recibimos tu pago del pedido ${numero(d.numero)}`, {
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      `Recibimos tu pago del pedido ${numero(d.numero)}: ${cantidad(d.cantidad)} calcos.`,
      `Arrancamos la producción, ${d.tiempoDeProduccion}. Después te avisamos cómo sigue.`,
    ],
    boton: { texto: "Ver mi pedido", href: d.enlace },
  });
}

/**
 * El pedido salió de la gráfica: despachado con su seguimiento, o listo para
 * retirar (y entonces la entrega se coordina por WhatsApp, no por mail).
 */
export function emailPedidoDespachado(
  d: PedidoParaEmail & {
    entrega: "envio" | "retiro";
    transportista: string | null;
    seguimiento: string | null;
    tiempoDeEnvio: string;
  },
): Email {
  if (d.entrega === "envio") {
    const por = d.transportista ? ` por ${d.transportista}` : "";
    const seguimiento = d.seguimiento ? `, seguimiento ${d.seguimiento}` : "";
    return armar(`Salió tu pedido ${numero(d.numero)}`, {
      titulo: `Hola, ${d.nombre}.`,
      parrafos: [`Salió tu pedido ${numero(d.numero)}${por}${seguimiento}, ${d.tiempoDeEnvio}.`],
      boton: { texto: "Ver mi pedido", href: d.enlace },
    });
  }

  return armar(`Tu pedido ${numero(d.numero)} está listo`, {
    titulo: `Hola, ${d.nombre}.`,
    parrafos: ["Tu pedido está listo. Te escribimos por WhatsApp para coordinar la entrega."],
    boton: { texto: "Ver mi pedido", href: d.enlace },
  });
}
