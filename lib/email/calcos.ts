import { marcoHtml, marcoTexto, type ContenidoEmail } from "./marco";

// ============================================================
// LOS EMAILS DE CALCOS · la voz del panel, entregada
//
// Dos de un pedido:
//   · «Recibimos tu pago»: lo manda la ruta del webhook, DESPUÉS de
//     contestarle 200 a Cresium, cuando el depósito acredita el pedido.
//   · «Salió tu pedido» / «Tu pedido está listo»: lo manda la acción de
//     /fidelli que marca el pedido enviado o listo para retirar.
//
// Y dos del stock (PR 3), por el cron de las 9:00: «te quedan calcos para
// pocas semanas» y «te estás quedando sin calcos». Ver el final del archivo.
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

// ============================================================
// LOS DOS DEL STOCK (PR 3 de calcos)
//
// Los manda el cron de los avisos de cobranza (/api/fidelli/avisos-cobranza)
// cuando `avisos_calcos_pendientes()` dice que toca: uno al cruzar las 4
// semanas de cobertura y otro al cruzar 1 semana o las 20 calcos. Uno por
// escalón por ciclo de entrega: lo garantiza la base (emails_calcos), no
// esta plantilla.
//
// LA FRASE ENTRA POR PARÁMETRO y es la MISMA del aviso del Inicio
// (`fraseDelAviso()` en lib/stock-calcos.ts): el mail dice lo que el panel
// dice ese día. Acá no se arma ningún número.
// ============================================================

export type TipoDeMailDeStock = "calcos_4_semanas" | "calcos_1_semana";

const ASUNTO_DE_STOCK: Record<TipoDeMailDeStock, string> = {
  calcos_4_semanas: "Te quedan calcos para pocas semanas",
  calcos_1_semana: "Te estás quedando sin calcos",
};

export function emailStockDeCalcos(d: {
  /** El nombre del lubricentro. */
  nombre: string;
  tipo: TipoDeMailDeStock;
  /** «Te quedan unas 80 calcos, para unas 3 semanas…», ya armada. */
  frase: string;
  /** /panel/cuenta/calcos, absoluta. */
  enlace: string;
}): Email {
  return armar(ASUNTO_DE_STOCK[d.tipo], {
    titulo: `Hola, ${d.nombre}.`,
    parrafos: [
      d.frase,
      "La cuenta la sacamos de los autos nuevos que cargaste desde la última entrega. Si no coincide con lo que tenés en el local, contá cuántas te quedan y corregila desde la misma pantalla.",
    ],
    boton: { texto: "Pedir calcos", href: d.enlace },
  });
}
