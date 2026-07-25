import { IconoWhatsapp } from "@/components/iconos";
import { formatearPatente } from "@/lib/texto";
import type { Lubricentro } from "@/lib/cliente/landing";

// El único llamado a la acción de la pantalla, y el que cierra el círculo:
// el lubri avisa, el cliente escanea, pide turno con un tap. El mensaje va
// pre-armado porque escribirlo desde cero es la fricción que hace que no lo
// mande.
export function BotonTurno({
  lubricentro,
  patente,
}: {
  lubricentro: Lubricentro;
  patente: string;
}) {
  const whatsapp = lubricentro.contacto.whatsapp?.replace(/\D/g, "");
  if (!whatsapp) return null;

  const mensaje = encodeURIComponent(
    `Hola! Quiero coordinar el service de mi ${formatearPatente(patente)}`,
  );

  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${mensaje}`}
      target="_blank"
      rel="noopener noreferrer"
      // 18px en mobile: a 22 el texto no entra en una línea al lado del
      // ícono. Mismo criterio que el botón de WhatsApp de la landing.
      className="flex min-h-16 w-full items-center justify-center gap-2.5 rounded-md bg-tenant px-4 py-3 text-c-body font-bold text-tenant-ink transition-colors hover:bg-tenant-deep sm:min-h-18 sm:text-c-lead"
    >
      <IconoWhatsapp aria-hidden className="size-7 shrink-0" />
      Pedir turno por WhatsApp
    </a>
  );
}
