// Número de soporte de Fidelli por WhatsApp, en formato internacional sin "+".
export const WHATSAPP_SOPORTE = "5493515324087";

export function urlWhatsappSoporte(): string {
  return `https://wa.me/${WHATSAPP_SOPORTE}`;
}

// ============================================================
// Los dos mensajes del aviso de vencimiento
//
// Viven acá y no en la base a propósito. Los templates del lubricentro sí
// están en `mensaje_templates` porque son una feature de SU producto: cada
// uno escribe los suyos. Estos son de NUESTRA operación comercial, y con
// cinco o diez clientes cambiar dos frases en el código es más rápido que
// construir y mantener un ABM para editarlas.
//
// Son dos y no uno porque son dos conversaciones distintas:
//
//   · TRIAL — una venta por cerrar. Todavía no pagó nunca, así que el
//     mensaje pregunta si sigue. Hablar de plata acá espanta.
//   · COBRANZA — ya es cliente. El mensaje da el dato concreto —cuándo
//     vence y cuánto— y ofrece los datos de la transferencia. Sin rodeos:
//     los dos saben de qué se trata.
// ============================================================

export type MotivoAviso = "trial" | "cobranza";

export function mensajeTrial(nombre: string, fecha: string): string {
  return (
    `Hola ${nombre}! Te escribo de Fidelli Motors. ` +
    `Tu prueba gratuita termina el ${fecha}. ` +
    `¿Charlamos para seguir? Cualquier duda que tengas la vemos.`
  );
}

export function mensajeCobranza(
  nombre: string,
  fecha: string,
  periodo: string,
  monto: string,
): string {
  return (
    `Hola ${nombre}! Te escribo de Fidelli Motors. ` +
    `El ${fecha} vence tu plan (${periodo}, ARS ${monto}). ` +
    `Te paso los datos para la transferencia cuando quieras.`
  );
}
