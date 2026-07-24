// Número de soporte de Fidelli por WhatsApp, en formato internacional sin "+".
// TODO: reemplazar por el número real antes del deploy.
export const WHATSAPP_SOPORTE = "5493510000000";

export function urlWhatsappSoporte(): string {
  return `https://wa.me/${WHATSAPP_SOPORTE}`;
}
