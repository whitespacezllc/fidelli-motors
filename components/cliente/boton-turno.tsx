import { IconoWhatsapp } from "@/components/iconos";
import { formatearPatente } from "@/lib/texto";
import { telefonoWhatsapp } from "@/lib/contacto";
import type { Lubricentro } from "@/lib/cliente/landing";

// El único llamado a la acción de la pantalla. "Escribinos por WhatsApp"
// y NUNCA "pedir turno": no tenemos turnos — es la segunda vez que este
// copy se corrige en esta pantalla, que no haya tercera.
//
// El teléfono: con pagina_premium llega `whatsappTaller` ya resuelto por
// get_carton (la sucursal del último trabajo del auto — el local que
// tiene su historial — con caída a la primera activa). Sin la feature no
// llega y el botón no existe: es parte de lo que diferencia a Ultra.
export function BotonTurno({
  lubricentro,
  whatsappTaller,
  patente,
}: {
  lubricentro: Lubricentro;
  whatsappTaller: string | null;
  patente: string;
}) {
  // El lubri puede cargar el número como lo dicta: "351 555 4120". El
  // normalizador le pone el 54 9 y saca el 0 y el 15 si vinieran.
  const whatsapp = whatsappTaller ? telefonoWhatsapp(whatsappTaller) : null;
  if (!whatsapp) return null;

  const mensaje = encodeURIComponent(
    `Hola ${lubricentro.nombre}! Les escribo por mi ${formatearPatente(patente)}`,
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
      Escribinos por WhatsApp
    </a>
  );
}
